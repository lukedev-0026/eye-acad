import type { VivaDeps } from '@/application/deps';
import {
  MAX_UTTERANCE_CHARS,
  runSelector,
} from '@/application/steps/selector.step';
import { getLogger } from '@/common/logging/logger.server';
import { MAX_TURNS, pushTurn, reveal } from '@/domain/attempt/attempt';
import { AttemptPhaseError } from '@/domain/attempt/attempt.error';
import { buildCatalogue } from '@/domain/examiner/catalogue';
import { LINES } from '@/domain/examiner/lines';
import { fixedReply, replyFor } from '@/domain/examiner/policy';
import type { ExaminerReply } from '@/domain/examiner/policy';
import { renderFinding, renderHistory } from '@/domain/examiner/render';
import type { SpokenReply } from '@/domain/speech/speech.service';
import { loadCase } from '@/infrastructure/files/case-file.loader';
import { loadStepsConfig } from '@/infrastructure/files/steps-config.loader';

export interface TurnTimings {
  speechToTextMs: number | null;
  modelMs: number | null;
  textToSpeechMs: number | null;
  serverTotalMs: number;
}

export interface TurnResult {
  reply: ExaminerReply;
  heard: string;
  speech: SpokenReply | null;
  timings: TurnTimings;
}

export async function handleRequest(
  deps: VivaDeps,
  uid: string,
  attemptId: string,
  input: { text: string } | { audio: Uint8Array; mimeType: string },
): Promise<TurnResult> {
  const started = performance.now();
  const via = 'audio' in input ? 'voice' : 'typed';

  const { attempts, models, speech: voice } = deps;
  const attempt = await attempts.read(uid, attemptId);
  if (attempt.phase !== 'asking') {
    throw new AttemptPhaseError('This attempt is no longer taking questions.');
  }
  // Read fresh on every request so edits apply without a restart.
  const [c, config] = await Promise.all([loadCase(), loadStepsConfig()]);

  let heard = '';
  let speechToTextMs: number | null = null;
  let reply: ExaminerReply | null = null;
  if ('audio' in input) {
    const stt = await voice.transcribe(
      input.audio,
      input.mimeType,
      buildCatalogue(c).names,
    );
    speechToTextMs = stt.ms;
    if (stt.ok) heard = stt.text.slice(0, MAX_UTTERANCE_CHARS);
    else reply = fixedReply('error', LINES.somethingWentWrong);
    await attempts.appendWorkingNote(uid, attemptId, {
      step: 'speech_to_text',
      ok: stt.ok,
      ms: stt.ms,
      model: stt.ok ? stt.model : null,
      error: stt.ok ? null : stt.error,
    });
  } else {
    heard = input.text.trim().slice(0, MAX_UTTERANCE_CHARS);
  }

  let modelMs: number | null = null;
  if (reply) {
    // Speech to text failed: nothing more to do.
  } else if (!heard) {
    reply = fixedReply('did_not_catch', LINES.didNotCatch);
  } else if (attempt.turns.length >= MAX_TURNS) {
    reply = fixedReply('wants_to_answer', LINES.pressTheButton);
  } else {
    const run = await runSelector(
      models,
      c,
      heard,
      attempt.lastRequests,
      config.steps.selector,
    );
    modelMs = run.call.ms + (run.check?.ms ?? 0);
    reply = run.decision
      ? replyFor(run.decision)
      : fixedReply('error', LINES.somethingWentWrong);
    await attempts.appendWorkingNote(uid, attemptId, {
      step: 'selector',
      heard,
      outcome: run.call.outcome,
      model: run.call.model,
      ms: run.call.ms,
      picked: run.call.value ?? null,
      error: run.call.error ?? null,
    });
    const requests = run.call.value?.requests ?? [];
    if (requests.length) {
      await attempts.update(uid, attemptId, (a) => {
        a.lastRequests = requests;
      });
    }
  }

  const speech = await voice.speak(reply.speechParts);
  const timings: TurnTimings = {
    speechToTextMs,
    modelMs,
    textToSpeechMs: speech?.ms ?? null,
    serverTotalMs: Math.round(performance.now() - started),
  };

  const final = reply;
  await attempts.update(uid, attemptId, (a) => {
    if (a.phase !== 'asking') return;
    pushTurn(a, { speaker: 'trainee', text: heard || '(nothing heard)', via });
    const said = pushTurn(a, {
      speaker: 'examiner',
      text: final.lines.join('\n'),
      kind: final.kind,
      itemIds: final.items.map((i) => i.id),
    });
    reveal(a, final.items);
    a.timings.push({ turn: said.n, via, ...timings });
  });

  getLogger('turn').info(
    {
      actionResult: 'DONE',
      via,
      replyKind: final.kind,
      items: final.items.length,
      spoken: speech !== null,
      ...timings,
    },
    'handleRequest.completed',
  );
  return { reply: final, heard, speech, timings };
}

/** Text comes from the saved attempt, not the request, so callers cannot make
 *  it speak arbitrary text at our expense. */
export async function openingSpeech(
  deps: Pick<VivaDeps, 'attempts' | 'speech'>,
  uid: string,
  attemptId: string,
): Promise<SpokenReply | null> {
  const attempt = await deps.attempts.read(uid, attemptId);
  const opening = attempt.turns.find((t) => t.kind === 'opening');
  if (!opening) return null;
  const c = await loadCase();
  deps.speech.prepare([
    ...c.findings.map((f) => renderFinding(f).speech),
    ...Object.entries(c.patient).map(
      ([key, value]) => renderHistory(key, value).speech,
    ),
    ...Object.values(LINES),
  ]);
  return deps.speech.speak([opening.text]);
}
