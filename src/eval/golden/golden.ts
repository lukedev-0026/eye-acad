import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { StepSettings } from '@/domain/llm/step-settings.schema';
import { STEP_IDS } from '@/domain/llm/step-settings.schema';
import { EvalRefusedError } from '@/eval/eval.error';
import type { EvalCase, EvalContext } from '@/eval/eval.types';
import type { ResultRow } from '@/eval/run/result-row';
import { STEP_EVALS } from '@/eval/steps/registry';
import { PROMPTS, settingsFor } from '@/eval/sweep/grid';

export interface Golden {
  requests: Record<
    string,
    Record<string, Record<string, Record<string, string>>>
  >;
  embedRequests: string;
  promptFingerprints: Record<string, Record<string, string>>;
  replays: Record<string, { rows: number; digest: string }>;
  skipped: { infraErrors: number; unknownCases: number };
}

const SHAPES = {
  'forced, thinking off': { thinking: false, forceFormat: true },
  'not forced, thinking on': { thinking: true, forceFormat: false },
} as const;

const sha256 = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Validated, but kept exactly as sent: the sent form is what is hashed.
const ChatBodySchema = z.looseObject({
  model: z.string(),
  messages: z.array(z.looseObject({ role: z.string(), content: z.string() })),
  format: z.unknown().optional(),
});
export type ChatBody = z.infer<typeof ChatBodySchema>;
const isChatBody = (body: unknown): body is ChatBody =>
  ChatBodySchema.safeParse(body).success;

const EmbedBodySchema = z.looseObject({
  input: z.array(z.string()).optional(),
});

export const PinnedVectorsSchema = z.record(z.string(), z.array(z.number()));

export interface Recorder {
  chat: Array<ChatBody>;
  embeds: Map<string, unknown>;
  missingVectors: Set<string>;
  replies: Array<string>;
  responder: ((body: ChatBody) => string) | null;
  doneReason: 'stop' | 'length';
  restore: () => void;
}

/**
 * Replaces `fetch`: chat requests are recorded and answered from `replies`,
 * embeddings from the pinned vectors.
 */
export function installRecorder(
  vectors: Map<string, Array<number>>,
  capture?: (
    texts: Array<string>,
    body: Record<string, unknown>,
  ) => Promise<Array<Array<number>> | null>,
): Recorder {
  const original = globalThis.fetch;
  const recorder: Recorder = {
    chat: [],
    embeds: new Map(),
    missingVectors: new Set(),
    replies: ['{}'],
    responder: null,
    doneReason: 'stop',
    restore: () => {
      globalThis.fetch = original;
    },
  };
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const body: unknown = JSON.parse(
      typeof init?.body === 'string' ? init.body : 'null',
    );
    if (url.endsWith('/api/chat')) {
      if (!isChatBody(body))
        throw new EvalRefusedError(
          `The app sent a chat request the recorder cannot read: ${url}`,
        );
      recorder.chat.push(body);
      const content = recorder.responder
        ? recorder.responder(body)
        : recorder.replies.length > 1
          ? (recorder.replies.shift() ?? '')
          : (recorder.replies[0] ?? '');
      return Response.json({
        model: body.model,
        message: { content },
        done_reason: recorder.doneReason,
        load_duration: 0,
        prompt_eval_count: 0,
        prompt_eval_duration: 0,
        eval_count: 0,
        eval_duration: 0,
      });
    }
    if (url.endsWith('/api/embed')) {
      const embed = EmbedBodySchema.safeParse(body);
      const texts = embed.success ? (embed.data.input ?? []) : [];
      recorder.embeds.set(sha256(body), body);
      const missing = texts.filter((t) => !vectors.has(t));
      if (missing.length && capture && embed.success) {
        const fresh = await capture(missing, embed.data);
        missing.forEach((t, i) => {
          const v = fresh?.[i];
          if (v) vectors.set(t, v);
        });
      }
      const found = texts.map((t) => vectors.get(t));
      if (found.some((v) => !v)) {
        for (const t of texts)
          if (!vectors.has(t)) recorder.missingVectors.add(t);
        return new Response('no pinned vector', { status: 503 });
      }
      return Response.json({ embeddings: found });
    }
    throw new EvalRefusedError(
      `The golden run made a network call it should not have: ${url}`,
    );
  };
  return recorder;
}

function keyed<T>(entries: Array<[string, T]>): Record<string, T> {
  return Object.fromEntries(
    [...entries].sort(([a], [b]) => a.localeCompare(b)),
  );
}

async function recordRequests(
  ctx: EvalContext,
  recorder: Recorder,
): Promise<Pick<Golden, 'requests' | 'promptFingerprints'>> {
  const requests: Golden['requests'] = {};
  const promptFingerprints: Golden['promptFingerprints'] = {};
  for (const step of STEP_IDS) {
    const evalDef = STEP_EVALS[step];
    const cases = (await evalDef.cases(ctx)).filter((c) => c.split === 'tune');
    requests[step] = {};
    promptFingerprints[step] = {};
    for (const variant of PROMPTS) {
      requests[step][variant] = {};
      for (const [shape, flags] of Object.entries(SHAPES)) {
        const settings: StepSettings = {
          ...settingsFor(step, { size: 'medium', ...flags, prompt: variant }),
          seed: 1,
        };
        const perCase: Array<[string, string]> = [];
        const prompts: Array<unknown> = [];
        for (const c of cases) {
          recorder.chat = [];
          recorder.replies = ['{}'];
          recorder.doneReason = 'stop';
          await evalDef.run(c, settings, ctx);
          perCase.push([c.id, sha256(recorder.chat)]);
          prompts.push(recorder.chat.map((body) => body.messages));
        }
        requests[step][variant][shape] = keyed(perCase);
        if (flags.forceFormat)
          promptFingerprints[step][variant] = sha256(prompts).slice(0, 10);
      }
    }
  }
  return { requests, promptFingerprints };
}

export interface ReplayDetail {
  key: string;
  outcome: string;
  observed: unknown;
  calls: number;
  pass: boolean;
  costly: boolean;
  fallback: boolean;
  detail: string;
  secondary: unknown;
}

async function replay(
  ctx: EvalContext,
  recorder: Recorder,
  rows: Array<ResultRow>,
): Promise<{
  replays: Golden['replays'];
  skipped: Golden['skipped'];
  details: Array<ReplayDetail>;
}> {
  const cases = new Map<string, EvalCase>();
  for (const step of STEP_IDS) {
    for (const c of await STEP_EVALS[step].cases(ctx))
      cases.set(`${step}|${c.id}`, c);
  }
  const byConfig = new Map<string, Array<ReplayDetail>>();
  const details: Array<ReplayDetail> = [];
  const skipped = { infraErrors: 0, unknownCases: 0 };
  for (const row of rows) {
    const c = cases.get(`${row.step}|${row.caseId}`);
    if (row.outcome === 'infra_error') {
      skipped.infraErrors++;
      continue;
    }
    if (!c) {
      skipped.unknownCases++;
      continue;
    }
    const evalDef = STEP_EVALS[row.step];
    recorder.chat = [];
    // The follow-up step may call twice; its two replies were saved joined.
    recorder.replies =
      row.step === 'followup' ? row.raw.split('\n---\n') : [row.raw];
    recorder.doneReason = row.outcome === 'truncated' ? 'length' : 'stop';
    const run = await evalDef.run(c, row.settings, ctx);
    const graded = evalDef.grade(c, run.observed, ctx);
    const detail: ReplayDetail = {
      key: `${row.step}|${row.configId}|${row.stage}|${row.caseId}|${row.trial}`,
      outcome: run.outcome,
      observed: run.observed,
      calls: run.calls,
      pass: run.outcome === 'ok' && graded.pass,
      costly: graded.costly,
      fallback: graded.fallback,
      detail: graded.detail,
      secondary: graded.secondary ?? null,
    };
    details.push(detail);
    const group = `${row.step}|${row.configId}`;
    byConfig.set(group, [...(byConfig.get(group) ?? []), detail]);
  }
  const replays = keyed(
    [...byConfig].map(
      ([group, list]): [string, { rows: number; digest: string }] => [
        group,
        { rows: list.length, digest: sha256(list) },
      ],
    ),
  );
  return { replays, skipped, details };
}

export async function buildGolden(
  ctx: EvalContext,
  rows: Array<ResultRow>,
  vectors: Map<string, Array<number>>,
  capture?: Parameters<typeof installRecorder>[1],
): Promise<{
  golden: Golden;
  details: Array<ReplayDetail>;
  missingVectors: Array<string>;
}> {
  const recorder = installRecorder(vectors, capture);
  try {
    const { requests, promptFingerprints } = await recordRequests(
      ctx,
      recorder,
    );
    const { replays, skipped, details } = await replay(ctx, recorder, rows);
    const embedRequests = sha256([...recorder.embeds.keys()].sort());
    return {
      golden: { requests, embedRequests, promptFingerprints, replays, skipped },
      details,
      missingVectors: [...recorder.missingVectors],
    };
  } finally {
    recorder.restore();
  }
}

export function goldenDifferences(
  expected: unknown,
  actual: unknown,
  path = '',
): Array<string> {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return [];
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!isRecord(expected) || !isRecord(actual)) return [path || '(whole file)'];
  const keys = [
    ...new Set([...Object.keys(expected), ...Object.keys(actual)]),
  ].sort();
  return keys.flatMap((k) =>
    goldenDifferences(expected[k], actual[k], path ? `${path} > ${k}` : k),
  );
}
