import { describeJsonShape } from '@/application/prompts/json-shape.prompt';
import { selectorCheckPrompt } from '@/application/prompts/selector-check.prompt';
import { selectorPrompt } from '@/application/prompts/selector.prompt';
import type { PublicCase } from '@/domain/case/case.schema';
import { buildCatalogue } from '@/domain/examiner/catalogue';
import { decide } from '@/domain/examiner/policy';
import type { TurnDecision } from '@/domain/examiner/policy';
import {
  normaliseSelectorCheck,
  normaliseSelectorOutput,
  selectorCheckSchema,
  selectorSchema,
} from '@/domain/examiner/selector.schema';
import type { SelectorCheckOutput, SelectorOutput, SelectorRequest } from '@/domain/examiner/selector.schema';
import type { CallResult } from '@/domain/llm/call-result';
import type { LanguageModelGateway } from '@/domain/llm/language-model.gateway';
import type { StepSettings } from '@/domain/llm/step-settings.schema';

export const MAX_UTTERANCE_CHARS = 500;

// The improvement that gives each pick a second look, so a near match ("corneal
// thickness" -> Cornea) says "not recorded" instead of revealing a row that was
// not asked for. Switched on by name in the selector's settings.
export const CHECK_REQUESTED_ITEM = 'check-requested-item';

export interface SelectorRun {
  call: CallResult<SelectorOutput>;
  // The second look, when the improvement is on and something was picked.
  check?: CallResult<SelectorCheckOutput>;
  // Undefined when the call did not produce a usable choice.
  decision?: TurnDecision;
}

// One request from the trainee -> one model call -> a decision made by code.
// The model sees the menu and the words. It never sees a result.
export async function runSelector(
  models: LanguageModelGateway,
  c: PublicCase,
  utterance: string,
  previous: Array<SelectorRequest>,
  settings: StepSettings,
): Promise<SelectorRun> {
  const catalogue = buildCatalogue(c);
  const schema = selectorSchema(catalogue);
  const prompt = selectorPrompt(
    settings.promptVariant,
    {
      openingPrompt: c.openingPrompt,
      catalogue,
      previous,
      utterance: utterance.slice(0, MAX_UTTERANCE_CHARS),
    },
    describeJsonShape(schema),
  );
  const call = await models.callStep(settings, prompt, schema, {
    normalise: normaliseSelectorOutput(catalogue),
    step: 'selector',
  });
  if (call.outcome !== 'ok') return { call };
  const decision = decide(c, catalogue, call.value);
  if (!settings.improvements?.includes(CHECK_REQUESTED_ITEM) || decision.kind !== 'reveal') {
    return { call, decision };
  }

  const picked = [...new Set(call.value.requests.map((r) => r.item))];
  const checkSchema = selectorCheckSchema(picked);
  const check = await models.callStep(
    settings,
    selectorCheckPrompt(
      { utterance: utterance.slice(0, MAX_UTTERANCE_CHARS), previous, picked },
      describeJsonShape(checkSchema),
    ),
    checkSchema,
    { normalise: normaliseSelectorCheck(picked), step: 'selector-check' },
  );
  // A check that fails leaves the first choice as it was.
  if (check.outcome !== 'ok') return { call, check, decision };

  const notAskedFor = new Set(check.value.checks.filter((k) => !k.asked_for).map((k) => k.item));
  if (notAskedFor.size === 0) return { call, check, decision };
  const kept: SelectorOutput = {
    ...call.value,
    requests: call.value.requests.filter((r) => !notAskedFor.has(r.item)),
    not_in_catalogue: true,
  };
  return { call, check, decision: decide(c, catalogue, kept) };
}
