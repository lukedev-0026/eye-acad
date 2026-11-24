import { createServerFn } from '@tanstack/react-start';

import { getContainer } from '@/application/container';
import { handleRequest, openingSpeech } from '@/application/turn/turn.use-case';
import type { TurnResult } from '@/application/turn/turn.use-case';
import { requireUser } from '@/server/middleware/auth.middleware';

import { AskInput, AttemptInput, AudioInput, validated } from './function-input.schema';
import { toReplyAudio } from './reply-audio';

// While the trainee is asking for findings: a typed request, a spoken one, and
// the examiner's opening read aloud.

function toTurnReply(result: TurnResult) {
  return {
    kind: result.reply.kind,
    heard: result.heard,
    lines: result.reply.lines,
    audio: toReplyAudio(result.speech),
    timings: result.timings,
  };
}

export const askTyped = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(validated(AskInput))
  .handler(async ({ context, data }) =>
    toTurnReply(await handleRequest(getContainer(), context.uid, data.attemptId, { text: data.text })),
  );

export const askSpoken = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(validated(AudioInput))
  .handler(async ({ context, data }) =>
    toTurnReply(
      await handleRequest(getContainer(), context.uid, data.attemptId, {
        audio: Buffer.from(data.audioBase64, 'base64'),
        mimeType: data.mimeType,
      }),
    ),
  );

export const speakOpening = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(validated(AttemptInput))
  .handler(async ({ context, data }) => ({
    audio: toReplyAudio(await openingSpeech(getContainer(), context.uid, data.attemptId)),
  }));

// Turns a recording into text and nothing else, for the spoken answer and the
// spoken reply to the follow-up. The text comes back to be shown before it is
// submitted.
export const transcribeOnly = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(validated(AudioInput))
  .handler(async ({ data }) => {
    const result = await getContainer().speech.transcribe(Buffer.from(data.audioBase64, 'base64'), data.mimeType, []);
    return result.ok ? { ok: true as const, text: result.text } : { ok: false as const, text: '' };
  });
