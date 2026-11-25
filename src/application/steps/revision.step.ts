import { z } from 'zod';

import { describeJsonShape } from '@/application/prompts/json-shape.prompt';
import { revisionPrompt } from '@/application/prompts/revision.prompt';
import type { RevisionPassage } from '@/application/prompts/revision.prompt';
import type { CallResult } from '@/domain/llm/call-result';
import type { LanguageModelGateway } from '@/domain/llm/language-model.gateway';
import type { StepSettings } from '@/domain/llm/step-settings.schema';
import { headingPath, pageLabel } from '@/domain/note/note-text';
import type { NoteChunk, NoteSentence } from '@/domain/note/note.schema';
import { checkRevisionPoint } from '@/domain/text/text-checks';
import type { CheckResult } from '@/domain/text/text-checks';

function revisionSchema(refs: Array<string>) {
  return z.object({
    outcome: z.enum(['supported', 'no_support']),
    sentence_refs: z.array(z.enum(refs as [string, ...Array<string>])).max(3),
    revision_point: z.string().max(600),
  });
}
export type RevisionOutput = z.infer<ReturnType<typeof revisionSchema>>;

export interface Citation {
  chunk: NoteChunk;
  sentences: Array<NoteSentence>;
  excerpt: string;
  page: string;
  heading: string;
}

export interface RevisionResult {
  call: CallResult<RevisionOutput>;
  outcome: 'supported' | 'no_support' | 'unusable';
  citation: Citation | null;
  point: string | null;
  pointSource: 'written' | 'supplied' | null;
  wordingCheck: CheckResult | null;
}

function passageText(chunk: NoteChunk): string {
  return [chunk.headings.join('. '), chunk.leadIn ?? '', chunk.text]
    .filter(Boolean)
    .join('. ');
}

function excerptOf(sentences: Array<NoteSentence>): string {
  return sentences
    .map((s) => (s.column ? `${s.column}: ${s.text}` : s.text))
    .join(' ');
}

/** The model gives sentence numbers and advice; code turns them into quotes. */
export async function runRevision(
  models: LanguageModelGateway,
  target: string,
  guidance: string | null,
  chunks: Array<NoteChunk>,
  settings: StepSettings,
): Promise<RevisionResult> {
  const byRef = new Map<string, { chunk: NoteChunk; sentence: NoteSentence }>();
  let n = 0;
  const passages: Array<RevisionPassage> = chunks.map((chunk, i) => ({
    letter: String.fromCharCode(65 + i),
    heading:
      headingPath(chunk) + (chunk.kind === 'table_row' ? ' (table)' : ''),
    leadIn: chunk.leadIn,
    sentences: chunk.sentences.map((sentence) => {
      const ref = String(++n);
      byRef.set(ref, { chunk, sentence });
      return {
        ref,
        text: sentence.column
          ? `${sentence.column}: ${sentence.text}`
          : sentence.text,
      };
    }),
  }));

  const schema = revisionSchema([...byRef.keys()]);
  const call = await models.callStep(
    settings,
    revisionPrompt(
      settings.promptVariant,
      { target, guidance, passages },
      describeJsonShape(schema),
    ),
    schema,
    { step: 'revision' },
  );
  const none = {
    citation: null,
    point: null,
    pointSource: null,
    wordingCheck: null,
  };
  if (call.outcome !== 'ok') return { call, outcome: 'unusable', ...none };
  if (
    call.value.outcome === 'no_support' ||
    call.value.sentence_refs.length === 0
  ) {
    return { call, outcome: 'no_support', ...none };
  }

  const picked = call.value.sentence_refs.flatMap((ref) => {
    const hit = byRef.get(ref);
    return hit ? [hit] : [];
  });
  const first = picked[0];
  if (!first) return { call, outcome: 'no_support', ...none };
  const chunk = first.chunk;
  const sentences = chunk.sentences
    .filter((s) =>
      picked.some((p) => p.chunk.id === chunk.id && p.sentence.id === s.id),
    )
    .slice(0, 2);
  const citation: Citation = {
    chunk,
    sentences,
    excerpt: excerptOf(sentences),
    page: pageLabel(sentences.flatMap((s) => s.pages)),
    heading: headingPath(chunk) + (chunk.leadIn ? ` — ${chunk.leadIn}` : ''),
  };

  const wordingCheck = checkRevisionPoint(
    call.value.revision_point,
    passageText(chunk),
    target,
  );
  return {
    call,
    outcome: 'supported',
    citation,
    // A failed sentence keeps its quote, shown with the key point it backs.
    point: wordingCheck.ok ? call.value.revision_point.trim() : target,
    pointSource: wordingCheck.ok ? 'written' : 'supplied',
    wordingCheck,
  };
}
