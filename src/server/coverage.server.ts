import { z } from 'zod'
import type { ExaminerNotes } from './case-schema'
import { MAX_ANSWER_CHARS } from './followup.server'
import { callStep, describeJsonShape } from './llm/call-step.server'
import type { CallResult, StepSettings } from './llm/types'
import { coveragePrompt } from './prompts/coverage'
import { isQuoteFrom } from './text-checks'

export const STATUSES = ['covered', 'partial', 'not_covered'] as const
export type Status = (typeof STATUSES)[number]

export type CoverageItem = { id: string; kind: 'diagnosis' | 'key_point'; text: string }

// The diagnosis counts as an item alongside the key points. Otherwise a wrong
// diagnosis could never be the thing to revise.
export function coverageItems(notes: ExaminerNotes): Array<CoverageItem> {
  return [
    { id: 'item_0', kind: 'diagnosis' as const, text: notes.diagnosis },
    ...notes.key_points.map((text, i) => ({ id: `item_${i + 1}`, kind: 'key_point' as const, text })),
  ]
}

function coverageSchema(items: Array<CoverageItem>) {
  const judgement = z.object({
    // Evidence before verdict: the words first, then the decision.
    quote: z.string().max(400),
    status: z.enum(STATUSES),
  })
  return z.object({
    items: z.object(Object.fromEntries(items.map((i) => [i.id, judgement]))),
    priority: z.enum(['none', ...items.map((i) => i.id)]),
  })
}
export type CoverageOutput = z.infer<ReturnType<typeof coverageSchema>>

export type JudgedItem = CoverageItem & {
  // After the quote check below.
  status: Status
  // What the model said before it.
  modelStatus: Status
  quote: string | null
}

export type CoverageResult = {
  call: CallResult<CoverageOutput>
  items: Array<JudgedItem>
  // The one thing to revise, or null when nothing was missed.
  target: JudgedItem | null
  // model: the model named it and code agreed it was open.
  // order: code took the first open item in case-file order.
  targetChosenBy: 'model' | 'order' | null
}

// Works out what the answer missed. The model judges; code checks its
// evidence and has the final say on which gap is used.
export async function runCoverage(
  notes: ExaminerNotes,
  rawAnswer: string,
  settings: StepSettings,
): Promise<CoverageResult> {
  const answer = rawAnswer.slice(0, MAX_ANSWER_CHARS)
  const items = coverageItems(notes)
  const schema = coverageSchema(items)
  const call = await callStep(
    settings,
    coveragePrompt(settings.promptVariant, { items, answer }, describeJsonShape(schema)),
    schema,
  )
  if (call.outcome !== 'ok' || !call.value) {
    return { call, items: [], target: null, targetChosenBy: null }
  }

  const judged: Array<JudgedItem> = items.map((item) => {
    const j = call.value!.items[item.id]
    const claimed = j.status !== 'not_covered'
    // "Covered" must come with the trainee's own words. A claim without a real
    // quotation is not believed: a gap wrongly shown is cheaper than a gap
    // wrongly hidden.
    const quoteOk = claimed && isQuoteFrom(j.quote, answer)
    return {
      ...item,
      modelStatus: j.status,
      status: claimed && !quoteOk ? 'not_covered' : j.status,
      quote: quoteOk ? j.quote.trim() : null,
    }
  })

  const open = judged.filter((i) => i.status === 'not_covered')
  const named = judged.find((i) => i.id === call.value!.priority)
  let target: JudgedItem | null = null
  let targetChosenBy: CoverageResult['targetChosenBy'] = null
  if (named && named.status === 'not_covered') {
    target = named
    targetChosenBy = 'model'
  } else if (open.length) {
    target = open[0]
    targetChosenBy = 'order'
  } else {
    const partial = judged.find((i) => i.status === 'partial')
    if (partial) {
      target = partial
      targetChosenBy = 'order'
    }
  }
  return { call, items: judged, target, targetChosenBy }
}
