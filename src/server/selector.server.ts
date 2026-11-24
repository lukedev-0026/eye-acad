import { buildCatalogue } from './catalogue'
import type { PublicCase } from './case-schema'
import { callStep, describeJsonShape } from './llm/call-step.server'
import type { CallResult, StepSettings } from './llm/types'
import { decide } from './policy'
import type { TurnDecision } from './policy'
import { selectorPrompt } from './prompts/selector'
import { normaliseSelectorOutput, selectorSchema } from './selector'
import type { SelectorOutput, SelectorRequest } from './selector'

export const MAX_UTTERANCE_CHARS = 500

export type SelectorRun = {
  call: CallResult<SelectorOutput>
  // Undefined when the call did not produce a usable choice.
  decision?: TurnDecision
}

// One request from the trainee -> one model call -> a decision made by code.
// The model sees the menu and the words. It never sees a result.
export async function runSelector(
  c: PublicCase,
  utterance: string,
  previous: Array<SelectorRequest>,
  settings: StepSettings,
): Promise<SelectorRun> {
  const catalogue = buildCatalogue(c)
  const schema = selectorSchema(catalogue)
  const prompt = selectorPrompt(
    settings.promptVariant,
    {
      openingPrompt: c.openingPrompt,
      catalogue,
      previous,
      utterance: utterance.slice(0, MAX_UTTERANCE_CHARS),
    },
    describeJsonShape(schema),
  )
  const call = await callStep(settings, prompt, schema, {
    normalise: normaliseSelectorOutput(catalogue),
  })
  if (call.outcome !== 'ok' || !call.value) return { call }
  return { call, decision: decide(c, catalogue, call.value) }
}
