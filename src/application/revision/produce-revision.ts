import { RevisionUnavailableError } from '@/application/revision/revision.error';
import { runCoverage } from '@/application/steps/coverage.step';
import type { CoverageResult } from '@/application/steps/coverage.step';
import { runRevision } from '@/application/steps/revision.step';
import type { RevisionResult } from '@/application/steps/revision.step';
import { runVerifier } from '@/application/steps/verifier.step';
import type { VerifierResult } from '@/application/steps/verifier.step';
import type { RevisionCard } from '@/domain/attempt/attempt.schema';
import type { ExaminerNotes } from '@/domain/case/case.schema';
import { LINES } from '@/domain/examiner/lines';
import type { LanguageModelGateway } from '@/domain/llm/language-model.gateway';
import type { StepsConfig } from '@/domain/llm/step-settings.schema';
import type { NoteIndex } from '@/domain/note/note.schema';
import { retrieve } from '@/domain/note/retrieve';
import type { Retrieval } from '@/domain/note/retrieve';

export interface RevisionTrace {
  coverage: CoverageResult | null;
  target: { id: string; kind: string; text: string } | null;
  retrieval: Retrieval | null;
  revision: RevisionResult | null;
  verifier: VerifierResult | null;
  keyPointCheck: VerifierResult | null;
}

const CHECK_AGAINST_KEY_POINT = 'check-against-key-point';

export interface RevisionInput {
  notes: ExaminerNotes;
  // Main answer only: counting the follow-up reply would hide the gap.
  answer: string;
  followUpQuestion: string | null;
  guidance: string | null;
}

/** Answer to revision card: find the gap, search the note, quote, verify. */
export async function produceRevision(
  models: LanguageModelGateway,
  input: RevisionInput,
  config: StepsConfig,
  index: NoteIndex,
  options: {
    exclude?: Array<string>;
    pinnedTarget?: {
      id: string;
      kind: 'diagnosis' | 'key_point';
      text: string;
    };
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

  let target: {
    id: string;
    kind: 'diagnosis' | 'key_point' | 'follow_up';
    text: string;
  };
  let missed: string | null;
  let preface: string | null = null;
  if (options.pinnedTarget) {
    target = options.pinnedTarget;
    missed = target.text;
  } else {
    const coverage = await runCoverage(
      models,
      input.notes,
      input.answer,
      config.steps.coverage,
    );
    trace.coverage = coverage;
    if (coverage.call.outcome !== 'ok') {
      throw new RevisionUnavailableError(
        'coverage',
        coverage.call.outcome,
        coverage.call.error,
      );
    }
    if (coverage.target) {
      target = coverage.target;
      missed =
        coverage.target.kind === 'diagnosis'
          ? `The diagnosis: ${coverage.target.text}`
          : coverage.target.text;
    } else {
      target = {
        id: 'follow_up',
        kind: 'follow_up',
        text:
          input.followUpQuestion ??
          input.notes.key_points[0] ??
          input.notes.diagnosis,
      };
      missed = null;
      preface =
        'Your answer covered every key point. Here is a point to consolidate.';
    }
  }
  trace.target = target;

  const noteLine =
    index.disclaimer
      .split(/(?<=[.])\s+/)
      .find((s) => /not clinical guidance/i.test(s)) ?? null;
  const base: Pick<
    RevisionCard,
    'missed' | 'noteLine' | 'retrievedPages' | 'retrievalMode'
  > = {
    missed,
    noteLine,
    retrievedPages: [],
    retrievalMode: 'keyword_only',
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

  const vector = (await models.embed([target.text], 'query'))?.[0] ?? null;
  const retrieval = retrieve(
    index,
    { target: target.text, vector },
    { exclude: options.exclude },
  );
  trace.retrieval = retrieval;
  base.retrievalMode = retrieval.mode;
  base.retrievedPages = [
    ...new Set(retrieval.results.flatMap((r) => r.chunk.pages)),
  ].sort((a, b) => a - b);
  if (retrieval.noSupport) return { card: noSupport(), trace };

  const revision = await runRevision(
    models,
    target.text,
    input.guidance,
    retrieval.results.map((r) => r.chunk),
    config.steps.revision,
  );
  trace.revision = revision;
  if (revision.outcome === 'unusable') {
    throw new RevisionUnavailableError(
      'revision',
      revision.call.outcome,
      revision.call.error,
    );
  }
  if (
    revision.outcome === 'no_support' ||
    !revision.citation ||
    !revision.point
  ) {
    return { card: noSupport(), trace };
  }

  const verifier = await runVerifier(
    models,
    revision.point,
    revision.citation.chunk,
    revision.citation.sentences.map((s) => s.id),
    config.steps.verifier,
  );
  trace.verifier = verifier;
  if (verifier.call.outcome !== 'ok') {
    throw new RevisionUnavailableError(
      'verifier',
      verifier.call.outcome,
      verifier.call.error,
    );
  }
  if (!verifier.supported) return { card: noSupport(), trace };

  // Also check the quote against the key point, which the model cannot reword.
  // Skipped for the diagnosis: no single sentence backs it.
  if (
    config.steps.verifier.improvements?.includes(CHECK_AGAINST_KEY_POINT) &&
    target.kind === 'key_point' &&
    revision.point !== target.text
  ) {
    const keyPointCheck = await runVerifier(
      models,
      target.text,
      revision.citation.chunk,
      revision.citation.sentences.map((s) => s.id),
      config.steps.verifier,
    );
    trace.keyPointCheck = keyPointCheck;
    if (keyPointCheck.call.outcome !== 'ok') {
      throw new RevisionUnavailableError(
        'key point check',
        keyPointCheck.call.outcome,
        keyPointCheck.call.error,
      );
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
