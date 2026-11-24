import { z } from 'zod';

import { describeJsonShape } from '@/application/prompts/json-shape.prompt';
import { verifierPrompt } from '@/application/prompts/verifier.prompt';
import type { CallResult } from '@/domain/llm/call-result';
import type { LanguageModelGateway } from '@/domain/llm/language-model.gateway';
import type { StepSettings } from '@/domain/llm/step-settings.schema';
import { headingPath } from '@/domain/note/note.types';
import type { NoteChunk } from '@/domain/note/note.types';

const VerifierSchema = z.object({
  reason: z.string().max(400),
  verdict: z.enum(['supported', 'not_supported']),
});
export type VerifierOutput = z.infer<typeof VerifierSchema>;

export type VerifierResult = {
  call: CallResult<VerifierOutput>;
  // Anything other than a clear "supported" counts as not supported.
  supported: boolean;
};

// The passage as the verifier sees it, with the quoted sentences marked.
export function markedPassage(chunk: NoteChunk, sentenceIds: Array<string>): string {
  return chunk.sentences
    .map((s) => {
      const text = s.column ? `${s.column}: ${s.text}` : s.text;
      return sentenceIds.includes(s.id) ? `>>>${text}<<<` : text;
    })
    .join(' ');
}

// A separate, fresh call that has seen none of the conversation. A quotation
// can be word-for-word accurate and still not back the claim attached to it.
export async function runVerifier(
  models: LanguageModelGateway,
  statement: string,
  chunk: NoteChunk,
  sentenceIds: Array<string>,
  settings: StepSettings,
): Promise<VerifierResult> {
  const call = await models.callStep(
    settings,
    verifierPrompt(
      settings.promptVariant,
      {
        statement,
        heading: headingPath(chunk) + (chunk.kind === 'table_row' ? ' (table)' : ''),
        leadIn: chunk.leadIn,
        marked: markedPassage(chunk, sentenceIds),
      },
      describeJsonShape(VerifierSchema),
    ),
    VerifierSchema,
  );
  return { call, supported: call.outcome === 'ok' && call.value?.verdict === 'supported' };
}
