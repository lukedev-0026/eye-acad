import { z } from 'zod';

import { runRevision } from '@/application/steps/revision.step';
import { retrieve } from '@/domain/note/retrieve';
import {
  findSentence,
  queryVector,
  readCases,
  resolveTarget,
  sentenceIds,
} from '@/eval/eval-context';
import { InvalidEvalCaseError } from '@/eval/eval.error';
import type {
  EvalContext,
  RetrievalTarget,
  StepEval,
  StepRun,
} from '@/eval/eval.types';

import { asRun } from './as-run';

export const RevisionInputSchema = z.object({
  target: z.string(),
  exclude: z.enum(['none', 'all_support']),
});
export const RevisionExpectSchema = z.object({
  support: z.boolean(),
  targetId: z.string().optional(),
});
type Input = z.infer<typeof RevisionInputSchema>;
type Expect = z.infer<typeof RevisionExpectSchema>;
interface Observed {
  outcome: 'supported' | 'no_support' | 'unusable';
  cited: Array<string>;
  citedText: string;
  page: string | null;
  pointSource: 'written' | 'supplied' | null;
  point: string | null;
  wording: string | null;
  retrievedPages: Array<number>;
  refusedByFloor: boolean;
}

function spec(
  ctx: EvalContext,
  id: string | undefined,
): RetrievalTarget | undefined {
  return ctx.targets.find((t) => t.id === id);
}

function supportChunks(ctx: EvalContext, t: RetrievalTarget): Array<string> {
  return [
    ...new Set(
      [...t.gold, ...t.alsoSupports, ...(t.offSection ?? [])].map(
        (p) => findSentence(ctx.index, p).chunk.id,
      ),
    ),
  ];
}

const NONE: Omit<Observed, 'outcome' | 'retrievedPages' | 'refusedByFloor'> = {
  cited: [],
  citedText: '',
  page: null,
  pointSource: null,
  point: null,
  wording: null,
};

export const revisionEval: StepEval<Input, Expect, Observed> = {
  step: 'revision',
  cases: () =>
    readCases('revision.jsonl', RevisionInputSchema, RevisionExpectSchema),

  async run(c, settings, ctx): Promise<StepRun<Observed>> {
    const target = resolveTarget(ctx, c.input.target);
    const t = spec(ctx, c.expect.targetId);
    const exclude =
      c.input.exclude === 'all_support' && t ? supportChunks(ctx, t) : [];
    const found = retrieve(
      ctx.index,
      { target, vector: await queryVector(ctx, target) },
      { exclude },
    );
    const retrievedPages = [
      ...new Set(found.results.flatMap((r) => r.chunk.pages)),
    ].sort((a, b) => a - b);
    if (found.noSupport) {
      return {
        outcome: 'ok',
        observed: {
          ...NONE,
          outcome: 'no_support',
          retrievedPages,
          refusedByFloor: true,
        },
        calls: 0,
        ms: 0,
        modelMs: 0,
        promptTokens: 0,
        outputTokens: 0,
        thinkingChars: 0,
        model: settings.model,
        raw: '',
      };
    }
    const result = await runRevision(
      ctx.models,
      target,
      ctx.guidance,
      found.results.map((r) => r.chunk),
      settings,
    );
    return asRun(result.call, {
      outcome: result.outcome,
      cited: result.citation?.sentences.map((s) => s.id) ?? [],
      citedText: result.citation?.excerpt ?? '',
      page: result.citation?.page ?? null,
      pointSource: result.pointSource,
      point: result.point,
      wording:
        result.wordingCheck && !result.wordingCheck.ok
          ? result.wordingCheck.reason
          : null,
      retrievedPages,
      refusedByFloor: false,
    });
  },

  grade(c, observed, ctx) {
    if (!c.expect.support) {
      const pass = observed.outcome === 'no_support';
      return {
        pass,
        costly: observed.outcome === 'supported',
        fallback: false,
        detail: pass
          ? `no support${observed.refusedByFloor ? ' (refused by code before any model call)' : ''}`
          : observed.outcome === 'supported'
            ? `cited ${observed.page}: "${observed.citedText}" for a point the note does not back`
            : 'unusable reply',
      };
    }
    const t = spec(ctx, c.expect.targetId);
    if (!t)
      throw new InvalidEvalCaseError(
        `${c.id}: no entry for target ${c.expect.targetId} in retrieval.json`,
      );
    const good = sentenceIds(ctx.index, [...t.gold, ...t.alsoSupports]);
    const off = sentenceIds(ctx.index, t.offSection ?? []);
    const wrong = sentenceIds(ctx.index, t.distractor);
    const citedGood =
      observed.cited.length > 0 && observed.cited.every((id) => good.has(id));
    const citedWrong = observed.cited.some((id) => wrong.has(id));
    const written = observed.pointSource === 'written';
    return {
      pass: observed.outcome === 'supported' && citedGood && written,
      costly: citedWrong,
      fallback: observed.outcome === 'supported' && citedGood && !written,
      detail:
        observed.outcome !== 'supported'
          ? `said ${observed.outcome} for a point the note does back`
          : `cited ${observed.page}: "${observed.citedText}"` +
            (citedWrong
              ? ' — wrong context'
              : citedGood
                ? ''
                : observed.cited.some((id) => off.has(id))
                  ? ' — backs the point, but from outside the main section'
                  : ' — not a sentence that backs this point') +
            (written ? '' : `; own sentence rejected (${observed.wording})`),
    };
  },

  ideal(c, ctx) {
    if (!c.expect.support)
      return {
        ...NONE,
        outcome: 'no_support',
        retrievedPages: [],
        refusedByFloor: false,
      };
    const gold = spec(ctx, c.expect.targetId)?.gold[0];
    if (!gold)
      throw new InvalidEvalCaseError(
        `${c.id}: no supporting sentence listed for ${c.expect.targetId}`,
      );
    const { sentence } = findSentence(ctx.index, gold);
    return {
      outcome: 'supported',
      cited: [sentence.id],
      citedText: sentence.text,
      page: null,
      pointSource: 'written',
      point: null,
      wording: null,
      retrievedPages: [],
      refusedByFloor: false,
    };
  },

  constant: {
    name: 'always "no support"',
    observe: () => ({
      ...NONE,
      outcome: 'no_support',
      retrievedPages: [],
      refusedByFloor: false,
    }),
  },
};
