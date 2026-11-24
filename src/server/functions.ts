import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { ensureFollowUp, handleAnswer, handleFollowUpReply, prepareRevision } from './answer.server';
import { createAttempt } from './attempts.server';
import { requireUser } from './auth-middleware';
import { loadCase } from './case.server';
import { handleRequest, openingSpeech } from './turn.server';
import { speakParts, transcribe } from './voice.server';

// The browser's only way in. Every function checks the caller's token first
// and takes the uid from that check, never from the request body.
//
// The server-only modules above are imported in the ordinary way. When the
// browser bundle is built, each handler below is replaced by a call to the
// server, and the imports only a handler used are dropped with it.

export const whoAmI = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .handler(async ({ context }) => ({ uid: context.uid }));

export const startAttempt = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const attemptId = await createAttempt(context.uid, await loadCase());
    return { attemptId };
  });

const AskInput = z.object({
  attemptId: z.string().min(1).max(64),
  text: z.string().max(2000),
});

// One or more clips, played back to back by the browser.
const audioOut = (speech: { clips: Array<{ audioBase64: string; mimeType: string }> } | null) =>
  speech ? speech.clips.map((c) => ({ base64: c.audioBase64, mimeType: c.mimeType })) : null;

export const askTyped = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(AskInput)
  .handler(async ({ context, data }) => {
    const result = await handleRequest(context.uid, data.attemptId, { text: data.text });
    return {
      kind: result.reply.kind,
      heard: result.heard,
      lines: result.reply.lines,
      // Returned inside this authenticated reply. A separate audio address
      // could not carry the sign-in token, so it would have to be open.
      audio: audioOut(result.speech),
      timings: result.timings,
    };
  });

// Roughly 2.4 MB of audio once decoded: ample for a 90-second answer.
const AudioInput = z.object({
  attemptId: z.string().min(1).max(64),
  audioBase64: z.string().min(1).max(3_300_000),
  mimeType: z.string().max(100),
});

export const askSpoken = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(AudioInput)
  .handler(async ({ context, data }) => {
    const result = await handleRequest(context.uid, data.attemptId, {
      audio: Buffer.from(data.audioBase64, 'base64'),
      mimeType: data.mimeType,
    });
    return {
      kind: result.reply.kind,
      heard: result.heard,
      lines: result.reply.lines,
      audio: audioOut(result.speech),
      timings: result.timings,
    };
  });

const AttemptOnly = z.object({ attemptId: z.string().min(1).max(64) });

export const speakOpening = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(AttemptOnly)
  .handler(async ({ context, data }) => {
    return { audio: audioOut(await openingSpeech(context.uid, data.attemptId)) };
  });

// Turns a recording into text and nothing else, for the spoken answer and the
// spoken reply to the follow-up. The text comes back to be shown before it is
// submitted.
export const transcribeOnly = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(AudioInput)
  .handler(async ({ data }) => {
    const result = await transcribe(Buffer.from(data.audioBase64, 'base64'), data.mimeType, []);
    return result.ok ? { ok: true as const, text: result.text } : { ok: false as const, text: '' };
  });

const TextInput = z.object({
  attemptId: z.string().min(1).max(64),
  text: z.string().max(8000),
  via: z.enum(['typed', 'voice']).default('typed'),
});
const AttemptInput = z.object({ attemptId: z.string().min(1).max(64) });

// The only function that ends the questioning. It is called by the
// "Give my answer" button, never inferred from what the trainee says.
export const giveAnswer = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(TextInput)
  .handler(async ({ context, data }) => {
    const followUp = await handleAnswer(context.uid, data.attemptId, data.text, data.via);
    return { ...followUp, audio: audioOut(await speakParts([followUp.speech])) };
  });

export const retryFollowUp = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(AttemptInput)
  .handler(async ({ context, data }) => {
    const followUp = await ensureFollowUp(context.uid, data.attemptId);
    return { ...followUp, audio: audioOut(await speakParts([followUp.speech])) };
  });

export const replyToFollowUp = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(TextInput)
  .handler(async ({ context, data }) => {
    const card = await handleFollowUpReply(context.uid, data.attemptId, data.text, data.via);
    return { outcome: card.outcome };
  });

export const retryRevision = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(AttemptInput)
  .handler(async ({ context, data }) => {
    const card = await prepareRevision(context.uid, data.attemptId);
    return { outcome: card.outcome };
  });
