import { createServerFn } from '@tanstack/react-start';

import {
  ensureFollowUp,
  handleAnswer,
  handleFollowUpReply,
  prepareRevision,
} from '@/application/answer/answer.use-case';
import type { FollowUpReplyOut } from '@/application/answer/answer.use-case';
import { getContainer } from '@/application/container';
import { requireUser } from '@/server/middleware/auth.middleware';

import { AttemptInput, TextInput, validated } from './function-input.schema';
import { toReplyAudio } from './reply-audio';

async function withSpeech(followUp: FollowUpReplyOut) {
  return {
    ...followUp,
    audio: toReplyAudio(await getContainer().speech.speak([followUp.speech])),
  };
}

/** The only way questioning ends: never inferred from what the trainee says. */
export const giveAnswer = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(validated(TextInput))
  .handler(async ({ context, data }) =>
    withSpeech(
      await handleAnswer(
        getContainer(),
        context.uid,
        data.attemptId,
        data.text,
        data.via,
      ),
    ),
  );

export const retryFollowUp = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(validated(AttemptInput))
  .handler(async ({ context, data }) =>
    withSpeech(
      await ensureFollowUp(getContainer(), context.uid, data.attemptId),
    ),
  );

export const replyToFollowUp = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(validated(TextInput))
  .handler(async ({ context, data }) => {
    const card = await handleFollowUpReply(
      getContainer(),
      context.uid,
      data.attemptId,
      data.text,
      data.via,
    );
    return { outcome: card.outcome };
  });

export const retryRevision = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(validated(AttemptInput))
  .handler(async ({ context, data }) => {
    const card = await prepareRevision(
      getContainer(),
      context.uid,
      data.attemptId,
    );
    return { outcome: card.outcome };
  });
