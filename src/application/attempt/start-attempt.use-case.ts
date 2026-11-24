import type { VivaDeps } from '@/application/deps';
import { MAX_ATTEMPTS_PER_USER, newAttempt } from '@/domain/attempt/attempt';
import { AttemptLimitReachedError } from '@/domain/attempt/attempt.error';
import { loadCase } from '@/infrastructure/files/case-file.loader';

// Starts a new attempt at the case as the file stands now. Returns its id.
export async function startAttempt(deps: Pick<VivaDeps, 'attempts'>, uid: string): Promise<string> {
  const publicCase = await loadCase();
  if ((await deps.attempts.count(uid)) >= MAX_ATTEMPTS_PER_USER) throw new AttemptLimitReachedError();
  return deps.attempts.create(uid, newAttempt(publicCase));
}
