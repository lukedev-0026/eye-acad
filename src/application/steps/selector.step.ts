import { selectorPrompt } from '@/application/prompts/selector.prompt';
import type { PublicCase } from '@/domain/case/case.schema';
import { buildCatalogue } from '@/domain/examiner/catalogue';
import { decide } from '@/domain/examiner/policy';
import type { TurnDecision } from '@/domain/examiner/policy';
import { normaliseSelectorOutput, selectorSchema } from '@/domain/examiner/selector.schema';
import type { SelectorOutput, SelectorRequest } from '@/domain/examiner/selector.schema';
import type { CallResult, StepSettings } from '@/domain/llm/step-settings.schema';
import { callStep, describeJsonShape } from '@/infrastructure/llm/language-model.gateway';

export const MAX_UTTERANCE_CHARS = 500;

export type SelectorRun = {
  call: CallResult<SelectorOutput>;
  // Undefined when the call did not produce a usable choice.
  decision?: TurnDecision;
};

// One request from the trainee -> one model call -> a decision made by code.
// The model sees the menu and the words. It never sees a result.
export async function runSelector(
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
  const call = await callStep(settings, prompt, schema, {
    normalise: normaliseSelectorOutput(catalogue),
  });
  if (call.outcome !== 'ok' || !call.value) return { call };
  return { call, decision: decide(c, catalogue, call.value) };
}
