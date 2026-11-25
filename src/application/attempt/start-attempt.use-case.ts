import type { VivaDeps } from '@/application/deps';
import { getLogger } from '@/common/logging/logger.server';
import { MAX_ATTEMPTS_PER_USER, newAttempt } from '@/domain/attempt/attempt';
import { AttemptLimitReachedError } from '@/domain/attempt/attempt.error';
import { loadCase } from '@/infrastructure/files/case-file.loader';

export async function startAttempt(
  deps: Pick<VivaDeps, 'attempts'>,
  uid: string,
): Promise<string> {
  const publicCase = await loadCase();
  if ((await deps.attempts.count(uid)) >= MAX_ATTEMPTS_PER_USER)
    throw new AttemptLimitReachedError();
  const attemptId = await deps.attempts.create(uid, newAttempt(publicCase));
  getLogger('attempt').info(
    { actionResult: 'DONE', attemptId, caseId: publicCase.caseId },
    'startAttempt.created',
  );
  return attemptId;
}
