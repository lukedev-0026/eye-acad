import { readFile } from 'node:fs/promises';

import { produceRevision } from '@/application/revision/produce-revision';
import { runSelector } from '@/application/steps/selector.step';
import { LINES } from '@/domain/examiner/lines';
import { replyFor } from '@/domain/examiner/policy';
import type { StepsConfig } from '@/domain/llm/step-settings.schema';
import { pageLabel } from '@/domain/note/note-text';
import { findSentence, resolveTarget, sentenceIds } from '@/eval/eval-context';
import type { EvalContext } from '@/eval/eval.types';
import { caseFilePath } from '@/infrastructure/files/case-file.loader';

// The brief's three checks: an available finding, an unavailable finding, and
// whether the citation supports the revision point. Each runs the app's real
// code path end to end, several times.

export type RequiredRow = {
  type: 'required';
  runId: string;
  at: string;
  check: string;
  name: string;
  trial: number;
  input: string;
  expected: string;
  observed: string;
  pass: boolean;
  ms: number;
  model: string;
  // For the citation check: what was retrieved and what was quoted.
  retrieved?: Array<{
    passage: string;
    pages: string;
    keywordRank: number;
    meaningRank: number | null;
    cosine: number | null;
  }>;
  cited?: { page: string | null; excerpt: string | null; heading: string | null };
};

type RawFinding = {
  id: string;
  eye: string | null;
  label: string;
  value: string | number | null;
  unit: string | null;
  method: string | null;
  available: boolean;
  unavailable_reason?: string | null;
};

type Spec = {
  available: { utterance: string; row: string; otherEyeRow: string; trials: number };
  unavailable: { utterance: string; row: string; otherEyeRow: string; trials: number };
  controls: Array<{ name: string; utterance: string; row?: string; notInCase?: boolean; trials: number }>;
  citation: { name: string; answer: string; expectTarget: string; targetId: string; trials: number };
  noSupport: Array<{ name: string; target: string; targetId?: string; removeSupport: boolean; trials: number }>;
};

// What must and must not appear for one row, read straight from the raw JSON
// rather than from the app's own sentence builder.
function expectationFor(row: RawFinding, other?: RawFinding) {
  const mustContain: Array<string> = [];
  const mustNotContain: Array<string> = [];
  if (row.eye === 'right') mustContain.push('Right eye');
  if (row.eye === 'left') mustContain.push('Left eye');
  if (row.available) {
    const bare = typeof row.value === 'number' || /^\s*\d+(\.\d+)?(\/\d+(\.\d+)?)?\s*$/.test(String(row.value));
    mustContain.push(bare && row.unit ? `${row.value} ${row.unit}` : String(row.value));
    if (row.method) mustContain.push(row.method);
  } else {
    mustContain.push('Not available');
    if (row.unavailable_reason) mustContain.push(row.unavailable_reason);
    // An unavailable row may still carry text in `value`; it must not be read.
    if (row.value !== null) mustNotContain.push(String(row.value));
  }
  if (other) {
    if (other.eye === 'left') mustNotContain.push('Left eye');
    if (other.eye === 'right') mustNotContain.push('Right eye');
    if (other.available && other.value !== null && String(other.value) !== String(row.value)) {
      mustNotContain.push(
        other.unit && typeof other.value === 'number' ? `${other.value} ${other.unit}` : String(other.value),
      );
    }
  }
  return { mustContain, mustNotContain };
}

export async function runRequiredChecks(
  ctx: EvalContext,
  config: StepsConfig,
  runId: string,
  only: Array<string> | null,
  onRow: (row: RequiredRow) => Promise<void>,
): Promise<Array<RequiredRow>> {
  const spec = JSON.parse(await readFile('evals/required.json', 'utf8')) as Spec;
  const raw = JSON.parse(await readFile(caseFilePath(), 'utf8')) as { findings: Array<RawFinding> };
  const rowById = (id: string) => {
    const row = raw.findings.find((f) => f.id === id);
    if (!row) throw new Error(`The case file has no finding with id ${id}`);
    return row;
  };
  const rows: Array<RequiredRow> = [];
  const record = async (row: Omit<RequiredRow, 'type' | 'runId' | 'at'>) => {
    const full: RequiredRow = { type: 'required', runId, at: new Date().toISOString(), ...row };
    rows.push(full);
    await onRow(full);
  };
  const wanted = (check: string) => !only || only.includes(check);

  // Checks 1 and 2, and the two controls: a typed request through the selector
  // and the sentence builder, exactly as a turn in the app.
  const askChecks = [
    ...(wanted('1') ? [{ check: '1', name: 'available finding', ...spec.available }] : []),
    ...(wanted('2')
      ? [
          { check: '2', name: 'unavailable finding', ...spec.unavailable },
          ...spec.controls.map((c) => ({ check: '2', otherEyeRow: undefined, row: undefined, notInCase: false, ...c })),
        ]
      : []),
  ] as Array<{
    check: string;
    name: string;
    utterance: string;
    row?: string;
    otherEyeRow?: string;
    notInCase?: boolean;
    trials: number;
  }>;

  for (const a of askChecks) {
    const expectation = a.row
      ? expectationFor(rowById(a.row), a.otherEyeRow ? rowById(a.otherEyeRow) : undefined)
      : null;
    const expected = a.notInCase
      ? `Says "${LINES.notRecorded}" and reveals nothing`
      : `Shows and says: ${expectation!.mustContain.map((s) => `"${s}"`).join(', ')}` +
        (expectation!.mustNotContain.length
          ? `. Never: ${expectation!.mustNotContain.map((s) => `"${s}"`).join(', ')}`
          : '') +
        `. Reveals only ${a.row}`;
    for (let trial = 1; trial <= a.trials; trial++) {
      const run = await runSelector(ctx.models, ctx.publicCase, a.utterance, [], {
        ...config.steps.selector,
        seed: trial,
      });
      const reply = run.decision ? replyFor(run.decision) : null;
      const shown = reply ? reply.lines.join(' / ') : `(${run.call.outcome})`;
      const spoken = reply?.speech ?? '';
      let pass: boolean;
      if (!reply) pass = false;
      else if (a.notInCase)
        pass = reply.items.length === 0 && reply.lines.length === 1 && reply.lines[0] === LINES.notRecorded;
      else {
        const speechNeeds = expectation!.mustContain.filter((s) => /^\D*$/.test(s) || !/[a-zA-Z]/.test(s));
        pass =
          reply.items.length === 1 &&
          reply.items[0].id === a.row &&
          expectation!.mustContain.every((s) => shown.includes(s)) &&
          // Spoken units are said in full, so the spoken check is on the eye,
          // the reason and every number.
          speechNeeds.every((s) => spoken.includes(s)) &&
          (shown.match(/\d+(\.\d+)?/g) ?? []).every((n) => spoken.includes(n)) &&
          expectation!.mustNotContain.every((s) => !shown.includes(s) && !spoken.includes(s));
      }
      await record({
        check: a.check,
        name: a.name,
        trial,
        input: a.utterance,
        expected,
        observed: reply ? `Shown: ${shown} | Said: ${spoken}` : shown,
        pass,
        ms: run.call.ms,
        model: run.call.model,
      });
    }
  }

  if (wanted('3')) {
    // Check 3a: the whole chain from an answer to a cited revision point.
    const c = spec.citation;
    const target = resolveTarget(ctx, c.expectTarget);
    const t = ctx.targets.find((x) => x.id === c.targetId)!;
    const gold = sentenceIds(ctx.index, t.gold);
    for (let trial = 1; trial <= c.trials; trial++) {
      const started = performance.now();
      const seeded = structuredClone(config);
      for (const s of Object.values(seeded.steps)) s.seed = trial;
      let observed: string;
      let pass = false;
      let retrieved: RequiredRow['retrieved'];
      let cited: RequiredRow['cited'];
      let model = config.steps.revision.model;
      try {
        const { card, trace } = await produceRevision(
          ctx.models,
          { notes: ctx.notes, answer: c.answer, followUpQuestion: null, guidance: ctx.guidance },
          seeded,
          ctx.index,
        );
        model = trace.revision?.call.model ?? model;
        retrieved = trace.retrieval?.results.map((r) => ({
          passage: r.chunk.id,
          pages: pageLabel(r.chunk.pages),
          keywordRank: r.keywordRank,
          meaningRank: r.meaningRank,
          cosine: r.cosine,
        }));
        cited = { page: card.page, excerpt: card.excerpt, heading: card.heading };
        const citedIds = trace.revision?.citation?.sentences.map((s) => s.id) ?? [];
        const rightTarget = trace.target?.text === target;
        const rightCitation = citedIds.length > 0 && citedIds.every((id) => gold.has(id));
        pass = rightTarget && rightCitation && card.outcome === 'supported';
        observed =
          `Gap chosen: "${trace.target?.text}". ` +
          (card.outcome === 'supported'
            ? `Revision point: "${card.point}". Cited ${card.page}: "${card.excerpt}". Support check: supported.`
            : `No support reported (${trace.revision?.outcome ?? 'search'}; support check: ${trace.verifier ? (trace.verifier.supported ? 'supported' : 'not supported') : 'not reached'}).`);
      } catch (e) {
        observed = `Could not run: ${String(e)}`;
      }
      const g = findSentence(ctx.index, t.gold[0]);
      await record({
        check: '3',
        name: `citation: ${c.name}`,
        trial,
        input: c.answer,
        expected: `Gap chosen: "${target}". The passage on ${pageLabel(g.chunk.pages)} is retrieved. Cited sentence (${pageLabel(g.sentence.pages)}): "${g.sentence.text}". Support check: supported.`,
        observed,
        pass,
        ms: Math.round(performance.now() - started),
        model,
        retrieved,
        cited,
      });
    }

    // Check 3b: the trainee is told when the note cannot back the point.
    for (const n of spec.noSupport) {
      const targetText = resolveTarget(ctx, n.target);
      const t2 = ctx.targets.find((x) => x.id === n.targetId);
      const exclude =
        n.removeSupport && t2
          ? [
              ...new Set(
                [...t2.gold, ...t2.alsoSupports, ...(t2.offSection ?? [])].map(
                  (p) => findSentence(ctx.index, p).chunk.id,
                ),
              ),
            ]
          : [];
      for (let trial = 1; trial <= n.trials; trial++) {
        const started = performance.now();
        const seeded = structuredClone(config);
        for (const s of Object.values(seeded.steps)) s.seed = trial;
        let observed: string;
        let pass = false;
        let retrieved: RequiredRow['retrieved'];
        try {
          const { card, trace } = await produceRevision(
            ctx.models,
            { notes: ctx.notes, answer: '', followUpQuestion: null, guidance: ctx.guidance },
            seeded,
            ctx.index,
            { exclude, pinnedTarget: { id: n.targetId ?? 'invented', kind: 'key_point', text: targetText } },
          );
          retrieved = trace.retrieval?.results.map((r) => ({
            passage: r.chunk.id,
            pages: pageLabel(r.chunk.pages),
            keywordRank: r.keywordRank,
            meaningRank: r.meaningRank,
            cosine: r.cosine,
          }));
          pass = card.outcome === 'no_support' && card.page === null && card.excerpt === null;
          observed =
            card.outcome === 'no_support'
              ? `"${card.message}" No page, no quotation.`
              : `Cited ${card.page}: "${card.excerpt}" for "${card.point}"`;
        } catch (e) {
          observed = `Could not run: ${String(e)}`;
        }
        await record({
          check: '3',
          name: `no support: ${n.name}`,
          trial,
          input: `Point to revise: "${targetText}"${exclude.length ? ` (with ${exclude.length} supporting passages removed from the search)` : ''}`,
          expected: `"${LINES.noSupport}" No page, no quotation.`,
          observed,
          pass,
          ms: Math.round(performance.now() - started),
          model: config.steps.revision.model,
          retrieved,
        });
      }
    }
  }
  return rows;
}
