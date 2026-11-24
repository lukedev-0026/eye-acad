import { useEffect, useReducer, useRef, useState } from 'react';

import type { PublicAttempt } from '@/domain/attempt/attempt.schema';
import { messageFor } from '@/features/errors/lib/message-for';
import { recordingSupported, useRecorder } from '@/features/viva/hooks/use-recorder';
import { playReply } from '@/features/viva/lib/audio-player';
import type { ReplyAudio } from '@/features/viva/lib/audio-player';
import { blobToBase64 } from '@/features/viva/lib/blob-to-base64';
import type { TurnTiming } from '@/features/viva/lib/latency';
import { canTraineeAct, nextTurnState } from '@/features/viva/lib/turn-machine';
import type { TurnState, VivaMode } from '@/features/viva/lib/turn-machine';
import { giveAnswer, replyToFollowUp, retryFollowUp, retryRevision } from '@/server/functions/answer.functions';
import { askSpoken, askTyped, speakOpening, transcribeOnly } from '@/server/functions/turn.functions';

const REVISION_PROBLEM = 'The revision point could not be prepared just now.';

// Everything the viva screen shows and can do, for one attempt.
export interface VivaSession {
  // Whose turn it is, and what the trainee is doing. `mode` is null once the
  // conversation is over.
  readonly turn: TurnState;
  readonly mode: VivaMode | null;
  readonly canAct: boolean;
  readonly micOk: boolean;
  // Something went wrong on the last action, in words for the trainee.
  readonly problem: string | null;
  // Why the revision point could not be prepared, when it could not.
  readonly revisionProblem: string | null;
  readonly timings: Array<TurnTiming>;

  // The request being typed, and the answer or reply being written.
  readonly request: string;
  readonly setRequest: (text: string) => void;
  readonly draft: string;
  readonly setDraft: (text: string) => void;

  readonly askText: () => Promise<void>;
  readonly startListening: () => Promise<void>;
  readonly stopAndAsk: () => Promise<void>;
  readonly askWithFile: (file: File) => Promise<void>;
  readonly stopAndDictate: () => Promise<void>;
  readonly beginAnswer: () => void;
  readonly backToAsking: () => void;
  readonly submitAnswer: () => Promise<void>;
  readonly submitReply: () => Promise<void>;
  readonly tryRevisionAgain: () => Promise<void>;
  readonly tryFollowUpAgain: () => Promise<void>;
}

export function useVivaSession(attemptId: string, attempt: PublicAttempt): VivaSession {
  const [turn, send] = useReducer(nextTurnState, 'your_turn' as TurnState);
  const [request, setRequest] = useState('');
  const [answering, setAnswering] = useState(false);
  const [draft, setDraft] = useState('');
  const [dictated, setDictated] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Why the revision point could not be prepared, when it could not.
  const [revisionProblem, setRevisionProblem] = useState<string | null>(null);
  const [timings, setTimings] = useState<Array<TurnTiming>>([]);
  const recorder = useRecorder();
  const player = useRef<{ stop: () => void } | null>(null);
  const openingTried = useRef(false);

  const phase = attempt.phase;
  const mode = phase === 'asking' ? (answering ? 'answering' : 'asking') : phase === 'follow_up' ? 'follow_up' : null;
  const canAct = canTraineeAct(turn);
  const micOk = recordingSupported();

  useEffect(() => () => player.current?.stop(), []);

  // Plays a reply and holds the "Examiner is speaking" state for as long as it
  // lasts. With no audio, the turn simply passes back.
  async function speak(audio: Array<ReplyAudio> | null): Promise<number | null> {
    if (!audio || audio.length === 0) {
      send({ type: 'REPLY_SILENT' });
      return null;
    }
    send({ type: 'REPLY_SPEAKING' });
    const playback = playReply(audio);
    player.current = playback;
    const startedAt = await playback.started;
    await playback.ended;
    send({ type: 'SPEECH_ENDED' });
    return startedAt;
  }

  // The examiner reads the opening aloud once, on a brand-new attempt.
  useEffect(() => {
    if (openingTried.current || phase !== 'asking' || attempt.turns.length !== 1) return;
    openingTried.current = true;
    // The turn is the examiner's from the start, so the trainee is not
    // invited to speak and then talked over when the audio arrives.
    send({ type: 'SUBMIT_TEXT' });
    speakOpening({ data: { attemptId } })
      .then(({ audio }) => speak(audio))
      .catch(() => {
        send({ type: 'FAILED' });
      });
    // Once per attempt, with the attempt as it is when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  function fail(message: string) {
    setProblem(message);
    send({ type: 'FAILED' });
  }

  async function finishTurn(
    releasedAt: number,
    via: 'voice' | 'typed',
    reply: { audio: Array<ReplyAudio> | null; timings: TurnTiming['server'] },
  ) {
    const toResponseMs = Math.round(performance.now() - releasedAt);
    const playingAt = await speak(reply.audio);
    setTimings((list) => [
      ...list,
      {
        n: list.length + 1,
        via,
        toResponseMs,
        toPlaybackMs: playingAt === null ? null : Math.round(playingAt - releasedAt),
        server: reply.timings,
      },
    ]);
  }

  async function askText() {
    const text = request.trim();
    if (!text || !canAct) return;
    const releasedAt = performance.now();
    send({ type: 'SUBMIT_TEXT' });
    setProblem(null);
    setRequest('');
    try {
      await finishTurn(releasedAt, 'typed', await askTyped({ data: { attemptId, text } }));
    } catch (error) {
      fail(messageFor(error, 'That request did not go through. Please ask again.'));
    }
  }

  async function startListening() {
    if (!canAct) return;
    setProblem(null);
    try {
      await recorder.start();
      send({ type: 'START_LISTENING' });
    } catch {
      fail('The microphone is not available. You can type instead.');
    }
  }

  async function stopAndAsk() {
    // The voice-turn timer starts here: the trainee has finished speaking.
    const releasedAt = performance.now();
    const clip = await recorder.stop();
    if (!clip) {
      send({ type: 'CANCEL_LISTENING' });
      return;
    }
    send({ type: 'STOP_LISTENING' });
    await sendSpoken(clip, releasedAt);
  }

  async function sendSpoken(clip: { base64: string; mimeType: string }, releasedAt: number) {
    try {
      const reply = await askSpoken({ data: { attemptId, audioBase64: clip.base64, mimeType: clip.mimeType } });
      await finishTurn(releasedAt, 'voice', reply);
    } catch (error) {
      fail(messageFor(error, 'That did not go through. Please try again, or type your request.'));
    }
  }

  // A recorded question, for a machine with no microphone. It takes exactly
  // the same path as a held-button recording; the timer starts when the file
  // is handed over.
  async function askWithFile(file: File) {
    if (!canAct) return;
    const releasedAt = performance.now();
    setProblem(null);
    send({ type: 'START_LISTENING' });
    send({ type: 'STOP_LISTENING' });
    const base64 = await blobToBase64(file).catch(() => '');
    if (!base64) {
      fail('That file could not be read.');
      return;
    }
    await sendSpoken({ base64, mimeType: file.type || 'audio/mpeg' }, releasedAt);
  }

  // For the answer and the reply, speech is turned into text and shown first,
  // so the trainee can see and correct it before it is submitted.
  async function stopAndDictate() {
    const clip = await recorder.stop();
    if (!clip) {
      send({ type: 'CANCEL_LISTENING' });
      return;
    }
    send({ type: 'STOP_LISTENING' });
    try {
      const heard = await transcribeOnly({ data: { attemptId, audioBase64: clip.base64, mimeType: clip.mimeType } });
      if (heard.ok && heard.text) {
        setDraft((d) => (d ? `${d} ${heard.text}` : heard.text));
        setDictated(true);
      } else {
        setProblem("Sorry, I didn't catch that. Please try again, or type.");
      }
      send({ type: 'REPLY_SILENT' });
    } catch (error) {
      fail(messageFor(error, 'That did not go through. Please try again, or type.'));
    }
  }

  async function submitAnswer() {
    const text = draft.trim();
    if (!text || !canAct) return;
    send({ type: 'SUBMIT_TEXT' });
    setProblem(null);
    try {
      const followUp = await giveAnswer({ data: { attemptId, text, via: dictated ? 'voice' : 'typed' } });
      setDraft('');
      setDictated(false);
      setAnswering(false);
      await speak(followUp.audio);
    } catch (error) {
      fail(messageFor(error, 'Your answer was not saved. Please try again.'));
    }
  }

  async function submitReply() {
    if (!canAct) return;
    send({ type: 'SUBMIT_TEXT' });
    setProblem(null);
    setRevisionProblem(null);
    try {
      await replyToFollowUp({ data: { attemptId, text: draft.trim(), via: dictated ? 'voice' : 'typed' } });
      setDraft('');
    } catch (error) {
      // The reply itself is saved first; what can fail is preparing the card.
      setRevisionProblem(messageFor(error, REVISION_PROBLEM));
    }
    send({ type: 'REPLY_SILENT' });
  }

  async function tryRevisionAgain() {
    setRevisionProblem(null);
    try {
      await retryRevision({ data: { attemptId } });
    } catch (error) {
      setRevisionProblem(messageFor(error, REVISION_PROBLEM));
    }
  }

  async function tryFollowUpAgain() {
    send({ type: 'SUBMIT_TEXT' });
    try {
      const followUp = await retryFollowUp({ data: { attemptId } });
      await speak(followUp.audio);
    } catch (error) {
      fail(messageFor(error, 'The follow-up question could not be prepared. Please try again.'));
    }
  }

  return {
    turn,
    mode,
    canAct,
    micOk,
    problem,
    revisionProblem,
    timings,
    request,
    setRequest,
    draft,
    setDraft,
    askText,
    startListening,
    stopAndAsk,
    askWithFile,
    stopAndDictate,
    beginAnswer: () => {
      setAnswering(true);
    },
    backToAsking: () => {
      setAnswering(false);
    },
    submitAnswer,
    submitReply,
    tryRevisionAgain,
    tryFollowUpAgain,
  };
}
