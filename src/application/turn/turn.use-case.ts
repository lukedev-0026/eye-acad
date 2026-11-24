import { MAX_UTTERANCE_CHARS, runSelector } from '@/application/steps/selector.step';
import { buildCatalogue } from '@/domain/examiner/catalogue';
import { LINES } from '@/domain/examiner/lines';
import { fixedReply, replyFor } from '@/domain/examiner/policy';
import type { ExaminerReply } from '@/domain/examiner/policy';
import { renderFinding, renderHistory } from '@/domain/examiner/render';
import { loadCase } from '@/infrastructure/files/case-file.loader';
import { loadStepsConfig } from '@/infrastructure/files/steps-config.loader';
import {
  AttemptError,
  MAX_TURNS,
  pushTurn,
  readAttempt,
  reveal,
  trace,
  updateAttempt,
} from '@/infrastructure/firestore/firestore-attempt.repository';
import { prepareSpeech, speakParts, transcribe } from '@/infrastructure/speech/deepgram-speech.service';
import type { SpokenReply } from '@/infrastructure/speech/deepgram-speech.service';

export type TurnTimings = {
  speechToTextMs: number | null;
  modelMs: number | null;
  textToSpeechMs: number | null;
  serverTotalMs: number;
};

export type TurnResult = {
  reply: ExaminerReply;
  heard: string;
  speech: SpokenReply | null;
  timings: TurnTimings;
};

// One request for findings. A spoken request is turned into text first; from
// then on typed and spoken requests take exactly the same path.
export async function handleRequest(
  uid: string,
  attemptId: string,
  input: { text: string } | { audio: Buffer; mimeType: string },
): Promise<TurnResult> {
  const started = performance.now();
  const via = 'audio' in input ? 'voice' : 'typed';

  const attempt = await readAttempt(uid, attemptId);
  if (attempt.phase !== 'asking') {
    throw new AttemptError('This attempt is no longer taking questions.');
  }
  // The case and the settings are read fresh on every request.
  const [c, config] = await Promise.all([loadCase(), loadStepsConfig()]);

  let heard = '';
  let speechToTextMs: number | null = null;
  let reply: ExaminerReply | null = null;
  if ('audio' in input) {
    const stt = await transcribe(input.audio, input.mimeType, buildCatalogue(c).names);
    speechToTextMs = stt.ms;
    if (stt.ok) heard = stt.text.slice(0, MAX_UTTERANCE_CHARS);
    else reply = fixedReply('error', LINES.somethingWentWrong);
    await trace(uid, attemptId, {
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
    // speech-to-text failed: nothing more to do
  } else if (!heard) {
    // Silence or noise: no model call, nothing revealed.
    reply = fixedReply('did_not_catch', LINES.didNotCatch);
  } else if (attempt.turns.length >= MAX_TURNS) {
    reply = fixedReply('wants_to_answer', LINES.pressTheButton);
  } else {
    const run = await runSelector(
      c,
      heard,
      attempt.lastRequests as Parameters<typeof runSelector>[2],
      config.steps.selector,
    );
    modelMs = run.call.ms;
    // Refusal, truncation, an unusable reply or a provider error all end the
    // same way: a fixed line, nothing revealed, and the trainee's turn again.
    reply = run.decision ? replyFor(run.decision) : fixedReply('error', LINES.somethingWentWrong);
    await trace(uid, attemptId, {
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
      await updateAttempt(uid, attemptId, (a) => {
        a.lastRequests = requests;
      });
    }
  }

  // The spoken words are the same sentences code built for the screen.
  const speech = await speakParts(reply.speechParts);
  const timings: TurnTimings = {
    speechToTextMs,
    modelMs,
    textToSpeechMs: speech?.ms ?? null,
    serverTotalMs: Math.round(performance.now() - started),
  };

  const final = reply;
  await updateAttempt(uid, attemptId, (a) => {
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

  return { reply: final, heard, speech, timings };
}

// The opening words of an attempt, read aloud. The text comes from the saved
// attempt, not from the request, so this cannot be used to speak arbitrary
// text at the project's expense.
export async function openingSpeech(uid: string, attemptId: string): Promise<SpokenReply | null> {
  const attempt = await readAttempt(uid, attemptId);
  const opening = attempt.turns.find((t) => t.kind === 'opening');
  if (!opening) return null;
  // While the opening is being read, make the audio for every sentence the
  // examiner could say about this case, so later replies do not wait for it.
  const c = await loadCase();
  prepareSpeech([
    ...c.findings.map((f) => renderFinding(f).speech),
    ...Object.entries(c.patient).map(([key, value]) => renderHistory(key, value).speech),
    ...Object.values(LINES),
  ]);
  return speakParts([opening.text]);
}
