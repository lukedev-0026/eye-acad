import { runCoverage } from '@/application/steps/coverage.step';
import type { CoverageResult } from '@/application/steps/coverage.step';
import { runRevision } from '@/application/steps/revision.step';
import type { RevisionResult } from '@/application/steps/revision.step';
import { runVerifier } from '@/application/steps/verifier.step';
import type { VerifierResult } from '@/application/steps/verifier.step';
import type { RevisionCard } from '@/domain/attempt/attempt.schema';
import type { ExaminerNotes } from '@/domain/case/case.schema';
import { LINES } from '@/domain/examiner/lines';
import type { StepsConfig } from '@/domain/llm/step-settings.schema';
import type { NoteIndex } from '@/domain/note/note.types';
import { retrieve } from '@/domain/note/retrieve';
import type { Retrieval } from '@/domain/note/retrieve';
import { embed } from '@/infrastructure/llm/ollama-embedding';

// Thrown when a step could not run at all (model unreachable, unusable reply).
// The attempt stays where it is and the trainee can try again; they are never
// told "no support" for what was really a technical failure.
export class RevisionUnavailable extends Error {}

export type RevisionTrace = {
  coverage: CoverageResult | null;
  target: { id: string; kind: string; text: string } | null;
  retrieval: Retrieval | null;
  revision: RevisionResult | null;
  verifier: VerifierResult | null;
  // The improvement, when it is switched on: see below.
  keyPointCheck: VerifierResult | null;
};

// A named change to the logic, switched on per step in config/steps.json.
export const CHECK_AGAINST_KEY_POINT = 'check-against-key-point';

export type RevisionInput = {
  notes: ExaminerNotes;
  // The main answer only. The reply to the follow-up is not judged: the
  // follow-up can hint at a gap, and counting the reply would hide it.
  answer: string;
  followUpQuestion: string | null;
  guidance: string | null;
};

// From the trainee's answer to the card they see:
//   1. what did the answer miss?            (model judges, code checks quotes)
//   2. search the note for that point       (no model)
//   3. pick the supporting sentence, word   (model picks numbers, code quotes)
//   4. does the quote support the advice?   (separate model call)
export async function produceRevision(
  input: RevisionInput,
  config: StepsConfig,
  index: NoteIndex,
  // For the "no support" checks: passages to leave out of the search.
  options: {
    exclude?: Array<string>;
    pinnedTarget?: { id: string; kind: 'diagnosis' | 'key_point'; text: string };
  } = {},
): Promise<{ card: RevisionCard; trace: RevisionTrace }> {
  const trace: RevisionTrace = {
    coverage: null,
    target: null,
    retrieval: null,
    revision: null,
    verifier: null,
    keyPointCheck: null,
  };
  const now = () => Date.now();

  let target: { id: string; kind: 'diagnosis' | 'key_point' | 'follow_up'; text: string };
  let missed: string | null;
  let preface: string | null = null;
  if (options.pinnedTarget) {
    target = options.pinnedTarget;
    missed = target.text;
  } else {
    const coverage = await runCoverage(input.notes, input.answer, config.steps.coverage);
    trace.coverage = coverage;
    if (coverage.call.outcome !== 'ok') {
      throw new RevisionUnavailable(`coverage: ${coverage.call.outcome} ${coverage.call.error ?? ''}`);
    }
    if (coverage.target) {
      target = coverage.target;
      missed = coverage.target.kind === 'diagnosis' ? `The diagnosis: ${coverage.target.text}` : coverage.target.text;
    } else {
      // Nothing missed: consolidate on what the follow-up asked about.
      target = {
        id: 'follow_up',
        kind: 'follow_up',
        text: input.followUpQuestion ?? input.notes.key_points[0] ?? input.notes.diagnosis,
      };
      missed = null;
      preface = 'Your answer covered every key point. Here is a point to consolidate.';
    }
  }
  trace.target = target;

  // The note says of itself that it is a revision summary, not guidance.
  const noteLine = index.disclaimer.split(/(?<=[.])\s+/).find((s) => /not clinical guidance/i.test(s)) ?? null;
  const base = {
    missed,
    noteLine,
    retrievedPages: [] as Array<number>,
    retrievalMode: 'keyword_only' as RevisionCard['retrievalMode'],
  };
  const noSupport = (extra: Partial<RevisionCard> = {}): RevisionCard => ({
    ...base,
    outcome: 'no_support',
    point: null,
    pointSource: null,
    page: null,
    heading: null,
    excerpt: null,
    message: LINES.noSupport,
    atMs: now(),
    ...extra,
  });

  const vector = (await embed([target.text], 'query'))?.[0] ?? null;
  const retrieval = retrieve(index, { target: target.text, vector }, { exclude: options.exclude });
  trace.retrieval = retrieval;
  base.retrievalMode = retrieval.mode;
  base.retrievedPages = [...new Set(retrieval.results.flatMap((r) => r.chunk.pages))].sort((a, b) => a - b);
  if (retrieval.noSupport) return { card: noSupport(), trace };

  const revision = await runRevision(
    target.text,
    input.guidance,
    retrieval.results.map((r) => r.chunk),
    config.steps.revision,
  );
  trace.revision = revision;
  if (revision.outcome === 'unusable') {
    throw new RevisionUnavailable(`revision: ${revision.call.outcome} ${revision.call.error ?? ''}`);
  }
  if (revision.outcome === 'no_support' || !revision.citation || !revision.point) {
    return { card: noSupport(), trace };
  }

  const verifier = await runVerifier(
    revision.point,
    revision.citation.chunk,
    revision.citation.sentences.map((s) => s.id),
    config.steps.verifier,
  );
  trace.verifier = verifier;
  if (verifier.call.outcome !== 'ok') {
    throw new RevisionUnavailable(`verifier: ${verifier.call.outcome} ${verifier.call.error ?? ''}`);
  }
  // No second attempt with other passages: in the walk-through, retrying after
  // a rejection led straight to the wrong-section quote.
  if (!verifier.supported) return { card: noSupport(), trace };

  // The improvement. The check above compares the quotation with the advice
  // the model wrote. If the model reworded the advice to suit a passage about
  // something else, the two agree and the check passes. So the quotation is
  // also checked against the key point itself, which the model cannot
  // reword. It applies to key points only: the diagnosis is a compound
  // statement that no single sentence of a note is meant to back.
  if (
    config.steps.verifier.improvements?.includes(CHECK_AGAINST_KEY_POINT) &&
    target.kind === 'key_point' &&
    revision.point !== target.text
  ) {
    const keyPointCheck = await runVerifier(
      target.text,
      revision.citation.chunk,
      revision.citation.sentences.map((s) => s.id),
      config.steps.verifier,
    );
    trace.keyPointCheck = keyPointCheck;
    if (keyPointCheck.call.outcome !== 'ok') {
      throw new RevisionUnavailable(`key point check: ${keyPointCheck.call.outcome} ${keyPointCheck.call.error ?? ''}`);
    }
    if (!keyPointCheck.supported) return { card: noSupport(), trace };
  }

  return {
    card: {
      ...base,
      outcome: 'supported',
      point: revision.point,
      pointSource: revision.pointSource,
      page: revision.citation.page,
      heading: revision.citation.heading,
      excerpt: revision.citation.excerpt,
      message: preface,
      atMs: now(),
    },
    trace,
  };
}
