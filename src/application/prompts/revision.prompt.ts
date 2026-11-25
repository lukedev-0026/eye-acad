import type { Prompt } from '@/domain/llm/call-result';
import type { PromptVariant } from '@/domain/llm/step-settings.schema';

import { assemble } from './shared.prompt';

const TASK = `You are preparing one revision point for a trainee eye doctor after a practice oral exam. You are given the point the trainee needs to revise, and numbered sentences taken from a reference note. Use only those sentences.

1. outcome: "supported" if at least one sentence directly supports the point, about the same clinical situation. Otherwise "no_support".
2. sentence_refs: the number of the one sentence that best supports the point (two at most, and only from the same passage). Empty if no_support.
3. revision_point: one sentence of advice, at most 40 words, that restates the point using only words from that passage and from the point itself. No numbers. Empty if no_support.

Never use medical knowledge that is not in the sentences shown. If the sentences do not support the point, answer no_support.`;

const RULES = `Rules:
1. Read each passage heading first. A sentence about a different condition or a different situation does not support the point, even when it mentions the same drug or word.
2. Prefer the passage about managing this situation over a general table or list.
3. A sentence that says "it" or "this" refers to something named earlier in the same passage, so read the whole passage.
4. The sentence must back the action in the point, not merely mention the same topic.
5. Do not add doses, numbers, causes or reasons that are not in the passage.`;

const EXAMPLES = `Worked examples from a different, invented note.
Passage A — Bacterial keratitis › Management
[1] Stop contact lens wear and keep the lenses and case for culture.
[2] Take a corneal scrape before starting antibiotics.
Passage B — Fungal keratitis › Management
[3] Avoid topical steroids until the infection is controlled.
- Point: "Corneal scrape before starting antibiotics"
  {"outcome":"supported","sentence_refs":["2"],"revision_point":"Take a corneal scrape before starting antibiotics."}
- Point: "Arrange a CT scan of the orbits"
  {"outcome":"no_support","sentence_refs":[],"revision_point":""}`;

export interface RevisionPassage {
  letter: string;
  heading: string;
  leadIn: string | null;
  sentences: Array<{ ref: string; text: string }>;
}

export function revisionPrompt(
  variant: PromptVariant,
  input: {
    target: string;
    guidance: string | null;
    passages: Array<RevisionPassage>;
  },
  jsonShape: string,
): Prompt {
  const passages = input.passages
    .map(
      (p) =>
        `Passage ${p.letter} — ${p.heading}${p.leadIn ? ` — ${p.leadIn}` : ''}\n` +
        p.sentences.map((s) => `[${s.ref}] ${s.text}`).join('\n'),
    )
    .join('\n\n');
  const user = [
    `The point to revise:\n${input.target}`,
    input.guidance
      ? `Guidance from the case author on citing the note:\n${input.guidance}`
      : '',
    `Sentences from the reference note:\n\n${passages}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return {
    system: assemble(
      variant,
      { task: TASK, rules: RULES, examples: EXAMPLES },
      jsonShape,
    ),
    user,
  };
}
