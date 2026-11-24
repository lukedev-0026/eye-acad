import type { Prompt, PromptVariant } from '../llm/types'
import { assemble } from './shared'

const TASK = `You are checking a citation. You are given a statement and one passage from a reference note, with the cited sentence marked between >>> and <<<. Decide whether the cited sentence, read in the context of its passage and heading, supports the statement.

"supported": the passage says what the statement says, about the same situation.
"not_supported": the passage is about a different condition or situation, says something different, or only shares some of the same words.

Give a reason in one short sentence, then the verdict. Judge only from the passage shown.`

const RULES = `Rules:
1. Read the heading first: it says which condition the passage is about.
2. Shared words are not support. The same drug mentioned for a different purpose is not_supported.
3. If the statement gives an instruction, the passage must give the same instruction, not the opposite and not merely a related fact.
4. Work out what "it" or "this" in the cited sentence refers to from the sentences around it.
5. If you are unsure, answer not_supported.`

const EXAMPLES = `Worked examples from a different, invented note.
- Statement: "Take a corneal scrape before starting antibiotics."
  Passage — Bacterial keratitis › Management: Stop contact lens wear. >>>Take a corneal scrape before starting antibiotics.<<<
  {"reason":"The passage gives the same instruction for the same condition.","verdict":"supported"}
- Statement: "Start topical steroids early in bacterial keratitis."
  Passage — Fungal keratitis › Management: >>>Avoid topical steroids until the infection is controlled.<<<
  {"reason":"The passage is about a different condition and says to avoid steroids.","verdict":"not_supported"}`

export function verifierPrompt(
  variant: PromptVariant,
  input: { statement: string; heading: string; leadIn: string | null; marked: string },
  jsonShape: string,
): Prompt {
  const user = [
    `Statement:\n${input.statement}`,
    `Passage — ${input.heading}${input.leadIn ? ` — ${input.leadIn}` : ''}:\n${input.marked}`,
  ].join('\n\n')
  return { system: assemble(variant, { task: TASK, rules: RULES, examples: EXAMPLES }, jsonShape), user }
}
