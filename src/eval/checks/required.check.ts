import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { produceRevision } from '@/application/revision/produce-revision';
import type { RevisionTrace } from '@/application/revision/produce-revision';
import { runSelector } from '@/application/steps/selector.step';
import { itemAt } from '@/common/arrays';
import { describeError } from '@/common/errors/to-error';
import { LINES } from '@/domain/examiner/lines';
import { replyFor } from '@/domain/examiner/policy';
import type { StepsConfig } from '@/domain/llm/step-settings.schema';
import { pageLabel } from '@/domain/note/note-text';
import { findSentence, resolveTarget, sentenceIds } from '@/eval/eval-context';
import { InvalidEvalCaseError } from '@/eval/eval.error';
import type { EvalContext } from '@/eval/eval.types';
import { PATHS } from '@/eval/paths';
import { caseFilePath } from '@/infrastructure/files/case-file.loader';

import type { RequiredRow } from './required-row.schema';

// The brief's three checks: an available finding, an unavailable finding, and
// whether the citation supports the revision point. Each runs the app's real
// code path end to end, several times.

type NewRow = Omit<RequiredRow, 'type' | 'runId' | 'at'>;
type Record = (row: NewRow) => Promise<void>;

// A finding as the case file states it. Read here without the app's own
// loader, so that the checks do not grade the app against itself.
const RawFindingSchema = z.looseObject({
  id: z.string(),
  eye: z.string().nullable().optional(),
  label: z.string(),
  value: z.union([z.string(), z.number()]).nullable().optional(),
  unit: z.string().nullable().optional(),
  method: z.string().nullable().optional(),
  available: z.boolean(),
  unavailable_reason: z.string().nullable().optional(),
});
type RawFinding = z.infer<typeof RawFindingSchema>;

const AskSchema = z.object({
  utterance: z.string(),
  row: z.string(),
  otherEyeRow: z.string(),
  trials: z.number().int(),
});

// evals/required.json: the fixed inputs. Rows are named by id; what the app
// should say is worked out from the raw case file at run time, so the checks
// still mean something after a value is edited.
const SpecSchema = z.looseObject({
  available: AskSchema,
  unavailable: AskSchema,
  controls: z.array(
    z.object({
      name: z.string(),
      utterance: z.string(),
      row: z.string().optional(),
      notInCase: z.boolean().optional(),
      trials: z.number().int(),
    }),
  ),
  citation: z.object({
    name: z.string(),
    answer: z.string(),
    expectTarget: z.string(),
    targetId: z.string(),
    trials: z.number().int(),
  }),
  noSupport: z.array(
    z.object({
      name: z.string(),
      target: z.string(),
      targetId: z.string().optional(),
      removeSupport: z.boolean(),
      trials: z.number().int(),
    }),
  ),
});
type Spec = z.infer<typeof SpecSchema>;

interface AskCheck {
  readonly check: string;
  readonly name: string;
  readonly utterance: string;
  readonly row?: string | undefined;
  readonly otherEyeRow?: string | undefined;
  readonly notInCase?: boolean | undefined;
  readonly trials: number;
}

interface Expectation {
  readonly mustContain: Array<string>;
  readonly mustNotContain: Array<string>;
}

const BARE_NUMBER_OR_RATIO = /^\s*\d+(\.\d+)?(\/\d+(\.\d+)?)?\s*$/;

// What must and must not appear for one row, read straight from the raw JSON
// rather than from the app's own sentence builder.
function expectationFor(row: RawFinding, other?: RawFinding): Expectation {
  const mustContain: Array<string> = [];
  const mustNotContain: Array<string> = [];
  if (row.eye === 'right') mustContain.push('Right eye');
  if (row.eye === 'left') mustContain.push('Left eye');
  if (row.available) {
    const bare = typeof row.value === 'number' || BARE_NUMBER_OR_RATIO.test(String(row.value));
    mustContain.push(bare && row.unit ? `${String(row.value)} ${row.unit}` : String(row.value));
    if (row.method) mustContain.push(row.method);
  } else {
    mustContain.push('Not available');
    if (row.unavailable_reason) mustContain.push(row.unavailable_reason);
    // An unavailable row may still carry text in `value`; it must not be read.
    if (row.value !== null && row.value !== undefined) mustNotContain.push(String(row.value));
  }
  if (other) {
    if (other.eye === 'left') mustNotContain.push('Left eye');
    if (other.eye === 'right') mustNotContain.push('Right eye');
    const otherValue = other.value;
    if (
      other.available &&
      otherValue !== null &&
      otherValue !== undefined &&
      String(otherValue) !== String(row.value)
    ) {
      mustNotContain.push(
        other.unit && typeof otherValue === 'number' ? `${otherValue} ${other.unit}` : String(otherValue),
      );
    }
  }
  return { mustContain, mustNotContain };
}

async function loadSpec(): Promise<Spec> {
  const parsed = SpecSchema.safeParse(JSON.parse(await readFile(PATHS.requiredChecks, 'utf8')));
  if (!parsed.success) {
    throw new InvalidEvalCaseError(
      `${PATHS.requiredChecks} is not in the expected form:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

async function loadRawFindings(): Promise<Array<RawFinding>> {
  const raw = z
    .looseObject({ findings: z.array(RawFindingSchema) })
    .safeParse(JSON.parse(await readFile(caseFilePath(), 'utf8')));
  if (!raw.success)
    throw new InvalidEvalCaseError(`The case file's findings could not be read:\n${z.prettifyError(raw.error)}`);
  return raw.data.findings;
}

// Every step of a run on the same seed, so that a trial can be repeated.
function seeded(config: StepsConfig, trial: number): StepsConfig {
  const copy = structuredClone(config);
  for (const settings of Object.values(copy.steps)) settings.seed = trial;
  return copy;
}

const retrievedFrom = (trace: RevisionTrace): RequiredRow['retrieved'] =>
  trace.retrieval?.results.map((r) => ({
    passage: r.chunk.id,
    pages: pageLabel(r.chunk.pages),
    keywordRank: r.keywordRank,
    meaningRank: r.meaningRank,
    cosine: r.cosine,
  }));

// Checks 1 and 2, and the two controls: a typed request through the selector
// and the sentence builder, exactly as a turn in the app.
async function runAskCheck(
  ctx: EvalContext,
  config: StepsConfig,
  ask: AskCheck,
  findings: ReadonlyArray<RawFinding>,
  record: Record,
): Promise<void> {
  const rowById = (id: string): RawFinding => {
    const row = findings.find((f) => f.id === id);
    if (!row) throw new InvalidEvalCaseError(`The case file has no finding with id ${id}`);
    return row;
  };
  const expectation: Expectation = ask.row
    ? expectationFor(rowById(ask.row), ask.otherEyeRow ? rowById(ask.otherEyeRow) : undefined)
    : { mustContain: [], mustNotContain: [] };
  const quotedList = (items: ReadonlyArray<string>): string => items.map((s) => `"${s}"`).join(', ');
  const expected = ask.notInCase
    ? `Says "${LINES.notRecorded}" and reveals nothing`
    : `Shows and says: ${quotedList(expectation.mustContain)}` +
      (expectation.mustNotContain.length ? `. Never: ${quotedList(expectation.mustNotContain)}` : '') +
      `. Reveals only ${ask.row ?? ''}`;

  for (let trial = 1; trial <= ask.trials; trial++) {
    const run = await runSelector(ctx.models, ctx.publicCase, ask.utterance, [], {
      ...config.steps.selector,
      seed: trial,
    });
    const reply = run.decision ? replyFor(run.decision) : null;
    const shown = reply ? reply.lines.join(' / ') : `(${run.call.outcome})`;
    const spoken = reply?.speech ?? '';
    let pass: boolean;
    if (!reply) {
      pass = false;
    } else if (ask.notInCase) {
      pass = reply.items.length === 0 && reply.lines.length === 1 && reply.lines[0] === LINES.notRecorded;
    } else {
      // Spoken units are said in full, so the spoken check is on the eye, the
      // reason and every number.
      const speechNeeds = expectation.mustContain.filter((s) => /^\D*$/.test(s) || !/[a-zA-Z]/.test(s));
      pass =
        reply.items.length === 1 &&
        reply.items[0]?.id === ask.row &&
        expectation.mustContain.every((s) => shown.includes(s)) &&
        speechNeeds.every((s) => spoken.includes(s)) &&
        (shown.match(/\d+(\.\d+)?/g) ?? []).every((n) => spoken.includes(n)) &&
        expectation.mustNotContain.every((s) => !shown.includes(s) && !spoken.includes(s));
    }
    await record({
      check: ask.check,
      name: ask.name,
      trial,
      input: ask.utterance,
      expected,
      observed: reply ? `Shown: ${shown} | Said: ${spoken}` : shown,
      pass,
      ms: run.call.ms,
      model: run.call.model,
    });
  }
}

// Check 3a: the whole chain from an answer to a cited revision point.
async function runCitationCheck(
  ctx: EvalContext,
  config: StepsConfig,
  citation: Spec['citation'],
  record: Record,
): Promise<void> {
  const target = resolveTarget(ctx, citation.expectTarget);
  const spec = ctx.targets.find((t) => t.id === citation.targetId);
  if (!spec) throw new InvalidEvalCaseError(`No entry for ${citation.targetId} in ${PATHS.retrievalTargets}`);
  const gold = sentenceIds(ctx.index, spec.gold);
  const goldSentence = findSentence(ctx.index, itemAt(spec.gold, 0));
  const expected = `Gap chosen: "${target}". The passage on ${pageLabel(goldSentence.chunk.pages)} is retrieved. Cited sentence (${pageLabel(goldSentence.sentence.pages)}): "${goldSentence.sentence.text}". Support check: supported.`;

  for (let trial = 1; trial <= citation.trials; trial++) {
    const started = performance.now();
    let observed: string;
    let pass = false;
    let retrieved: RequiredRow['retrieved'];
    let cited: RequiredRow['cited'];
    let model = config.steps.revision.model;
    try {
      const { card, trace } = await produceRevision(
        ctx.models,
        { notes: ctx.notes, answer: citation.answer, followUpQuestion: null, guidance: ctx.guidance },
        seeded(config, trial),
        ctx.index,
      );
      model = trace.revision?.call.model ?? model;
      retrieved = retrievedFrom(trace);
      cited = { page: card.page, excerpt: card.excerpt, heading: card.heading };
      const citedIds = trace.revision?.citation?.sentences.map((s) => s.id) ?? [];
      const rightTarget = trace.target?.text === target;
      const rightCitation = citedIds.length > 0 && citedIds.every((id) => gold.has(id));
      pass = rightTarget && rightCitation && card.outcome === 'supported';
      const supportCheck = trace.verifier ? (trace.verifier.supported ? 'supported' : 'not supported') : 'not reached';
      observed =
        `Gap chosen: "${trace.target?.text ?? ''}". ` +
        (card.outcome === 'supported'
          ? `Revision point: "${card.point ?? ''}". Cited ${card.page ?? ''}: "${card.excerpt ?? ''}". Support check: supported.`
          : `No support reported (${trace.revision?.outcome ?? 'search'}; support check: ${supportCheck}).`);
    } catch (error) {
      observed = `Could not run: ${describeError(error)}`;
    }
    await record({
      check: '3',
      name: `citation: ${citation.name}`,
      trial,
      input: citation.answer,
      expected,
      observed,
      pass,
      ms: Math.round(performance.now() - started),
      model,
      retrieved,
      cited,
    });
  }
}

// Check 3b: the trainee is told when the note cannot back the point.
async function runNoSupportCheck(
  ctx: EvalContext,
  config: StepsConfig,
  check: Spec['noSupport'][number],
  record: Record,
): Promise<void> {
  const targetText = resolveTarget(ctx, check.target);
  const spec = ctx.targets.find((t) => t.id === check.targetId);
  // With removeSupport, every passage that backs the point is taken out of
  // the search first.
  const exclude =
    check.removeSupport && spec
      ? [
          ...new Set(
            [...spec.gold, ...spec.alsoSupports, ...(spec.offSection ?? [])].map(
              (phrase) => findSentence(ctx.index, phrase).chunk.id,
            ),
          ),
        ]
      : [];
  const removed = exclude.length ? ` (with ${exclude.length} supporting passages removed from the search)` : '';

  for (let trial = 1; trial <= check.trials; trial++) {
    const started = performance.now();
    let observed: string;
    let pass = false;
    let retrieved: RequiredRow['retrieved'];
    try {
      const { card, trace } = await produceRevision(
        ctx.models,
        { notes: ctx.notes, answer: '', followUpQuestion: null, guidance: ctx.guidance },
        seeded(config, trial),
        ctx.index,
        { exclude, pinnedTarget: { id: check.targetId ?? 'invented', kind: 'key_point', text: targetText } },
      );
      retrieved = retrievedFrom(trace);
      pass = card.outcome === 'no_support' && card.page === null && card.excerpt === null;
      observed =
        card.outcome === 'no_support'
          ? `"${card.message ?? ''}" No page, no quotation.`
          : `Cited ${card.page ?? ''}: "${card.excerpt ?? ''}" for "${card.point ?? ''}"`;
    } catch (error) {
      observed = `Could not run: ${describeError(error)}`;
    }
    await record({
      check: '3',
      name: `no support: ${check.name}`,
      trial,
      input: `Point to revise: "${targetText}"${removed}`,
      expected: `"${LINES.noSupport}" No page, no quotation.`,
      observed,
      pass,
      ms: Math.round(performance.now() - started),
      model: config.steps.revision.model,
      retrieved,
    });
  }
}

// `only` names the checks to run ("1", "2", "3"); all of them when null.
export async function runRequiredChecks(
  ctx: EvalContext,
  config: StepsConfig,
  runId: string,
  only: ReadonlyArray<string> | null,
  onRow: (row: RequiredRow) => Promise<void>,
): Promise<Array<RequiredRow>> {
  const spec = await loadSpec();
  const findings = await loadRawFindings();
  const rows: Array<RequiredRow> = [];
  const record: Record = async (row) => {
    const full: RequiredRow = { type: 'required', runId, at: new Date().toISOString(), ...row };
    rows.push(full);
    await onRow(full);
  };
  const wanted = (check: string): boolean => !only || only.includes(check);

  const asks: Array<AskCheck> = [
    ...(wanted('1') ? [{ check: '1', name: 'available finding', ...spec.available }] : []),
    ...(wanted('2')
      ? [
          { check: '2', name: 'unavailable finding', ...spec.unavailable },
          ...spec.controls.map((control) => ({ check: '2', ...control })),
        ]
      : []),
  ];
  for (const ask of asks) await runAskCheck(ctx, config, ask, findings, record);

  if (wanted('3')) {
    await runCitationCheck(ctx, config, spec.citation, record);
    for (const check of spec.noSupport) await runNoSupportCheck(ctx, config, check, record);
  }
  return rows;
}
