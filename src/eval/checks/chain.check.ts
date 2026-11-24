import { produceRevision } from '@/application/revision/produce-revision';
import type { StepsConfig } from '@/domain/llm/step-settings.schema';
import { findSentence, readCases, resolveTarget, sentenceIds } from '@/eval/eval-context';
import type { EvalCase, EvalContext, Graded } from '@/eval/eval.types';
import type { ResultRow } from '@/eval/run/result-row';
import { appendRow } from '@/eval/run/results.store';

// The revision step and the support check, run together as the app runs them:
// search, pick a sentence, word the advice, check the support, and build the
// card the trainee would see. The per-step sets test each of those alone on
// fixed inputs; this is where one step's mistake can be caught, or missed, by
// the next. It uses the same 14 points to revise as the revision set.

type Input = { target: string; exclude: 'none' | 'all_support' };
type Expect = { support: boolean; targetId?: string };
type Observed = {
  outcome: 'supported' | 'no_support' | 'unavailable';
  cited: Array<string>;
  page: string | null;
  excerpt: string | null;
  point: string | null;
  pointSource: string | null;
  selectionOutcome: string | null;
  supportCheck: 'supported' | 'not_supported' | 'not_reached';
  keyPointCheck: 'supported' | 'not_supported' | 'not_run';
};

export const chainCases = () => readCases<Input, Expect>('revision.jsonl');

function grade(c: EvalCase<Input, Expect>, o: Observed, ctx: EvalContext): Graded {
  if (o.outcome === 'unavailable')
    return { pass: false, costly: false, fallback: false, detail: 'a step could not run' };
  if (!c.expect.support) {
    return {
      pass: o.outcome === 'no_support',
      // The trainee is shown a quotation for a point the note does not back.
      costly: o.outcome === 'supported',
      fallback: false,
      detail:
        o.outcome === 'no_support'
          ? `told no support (${o.selectionOutcome === 'no_support' ? 'by the revision step' : o.supportCheck === 'not_supported' ? 'by the support check' : o.keyPointCheck === 'not_supported' ? 'by the check against the key point' : 'before any quotation'})`
          : `shown ${o.page}: "${o.excerpt}" with the advice "${o.point}"`,
    };
  }
  const t = ctx.targets.find((x) => x.id === c.expect.targetId);
  if (!t) throw new Error(`${c.id}: no entry for ${c.expect.targetId} in retrieval.json`);
  const good = sentenceIds(ctx.index, [...t.gold, ...t.alsoSupports]);
  const wrong = sentenceIds(ctx.index, t.distractor);
  const citedGood = o.cited.length > 0 && o.cited.every((id) => good.has(id));
  const citedWrong = o.cited.some((id) => wrong.has(id));
  return {
    pass: o.outcome === 'supported' && citedGood,
    costly: o.outcome === 'supported' && citedWrong,
    fallback: o.outcome === 'supported' && citedGood && o.pointSource === 'supplied',
    detail:
      o.outcome === 'no_support'
        ? `told no support for a point the note does back (${o.selectionOutcome === 'no_support' ? 'revision step said so' : o.supportCheck === 'not_supported' ? 'support check rejected it' : o.keyPointCheck === 'not_supported' ? 'check against the key point rejected it' : 'search'})`
        : `shown ${o.page}: "${o.excerpt}"${citedWrong ? ' — wrong context' : citedGood ? '' : ' — not a sentence that backs this point'}`,
  };
}

export async function runChain(
  ctx: EvalContext,
  config: StepsConfig,
  o: {
    runId: string;
    stage: string;
    split: 'tune' | 'holdout';
    trials: number;
    label: string;
    onRow?: (row: ResultRow) => void;
  },
): Promise<Array<ResultRow>> {
  const cases = (await chainCases()).filter((c) => c.split === o.split);
  const rows: Array<ResultRow> = [];
  for (let trial = 1; trial <= o.trials; trial++) {
    for (const c of cases) {
      const target = resolveTarget(ctx, c.input.target);
      const t = ctx.targets.find((x) => x.id === c.expect.targetId);
      const exclude =
        c.input.exclude === 'all_support' && t
          ? [
              ...new Set(
                [...t.gold, ...t.alsoSupports, ...(t.offSection ?? [])].map((p) => findSentence(ctx.index, p).chunk.id),
              ),
            ]
          : [];
      const seeded = structuredClone(config);
      for (const s of Object.values(seeded.steps)) s.seed = trial;
      const started = performance.now();
      let observed: Observed;
      let model = config.steps.revision.model;
      let calls = 0;
      try {
        const { card, trace } = await produceRevision(
          ctx.models,
          { notes: ctx.notes, answer: '', followUpQuestion: null, guidance: ctx.guidance },
          seeded,
          ctx.index,
          {
            exclude,
            pinnedTarget: {
              id: c.expect.targetId ?? 'invented',
              kind: c.expect.targetId === 'diagnosis' ? 'diagnosis' : 'key_point',
              text: target,
            },
          },
        );
        model = trace.revision?.call.model ?? model;
        calls = (trace.revision ? 1 : 0) + (trace.verifier ? 1 : 0) + (trace.keyPointCheck ? 1 : 0);
        observed = {
          outcome: card.outcome,
          cited: trace.revision?.citation?.sentences.map((s) => s.id) ?? [],
          page: trace.revision?.citation?.page ?? null,
          excerpt: trace.revision?.citation?.excerpt ?? null,
          point: trace.revision?.point ?? null,
          pointSource: trace.revision?.pointSource ?? null,
          selectionOutcome: trace.revision?.outcome ?? null,
          supportCheck: trace.verifier ? (trace.verifier.supported ? 'supported' : 'not_supported') : 'not_reached',
          keyPointCheck: trace.keyPointCheck
            ? trace.keyPointCheck.supported
              ? 'supported'
              : 'not_supported'
            : 'not_run',
        };
      } catch {
        observed = {
          outcome: 'unavailable',
          cited: [],
          page: null,
          excerpt: null,
          point: null,
          pointSource: null,
          selectionOutcome: null,
          supportCheck: 'not_reached',
          keyPointCheck: 'not_run',
        };
      }
      const g = grade(c, observed, ctx);
      const row = {
        type: 'result',
        runId: o.runId,
        stage: o.stage,
        at: new Date().toISOString(),
        step: 'chain',
        configId: o.label,
        settings: config.steps.revision,
        split: c.split,
        caseId: c.id,
        caseType: c.type,
        trial,
        seed: trial,
        outcome: observed.outcome === 'unavailable' ? 'infra_error' : 'ok',
        pass: g.pass,
        costly: g.costly,
        fallback: g.fallback,
        detail: g.detail,
        ms: Math.round(performance.now() - started),
        modelMs: 0,
        calls,
        promptTokens: 0,
        outputTokens: 0,
        thinkingChars: 0,
        model,
        observed,
        raw: '',
      } as unknown as ResultRow;
      rows.push(row);
      await appendRow(o.runId, row as unknown as Record<string, unknown>);
      o.onRow?.(row);
    }
  }
  return rows;
}
