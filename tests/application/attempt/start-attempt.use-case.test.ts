import { describe, expect, it } from 'vitest';

import { startAttempt } from '@/application/attempt/start-attempt.use-case';
import { MAX_ATTEMPTS_PER_USER, newAttempt } from '@/domain/attempt/attempt';
import { AttemptLimitReachedError } from '@/domain/attempt/attempt.error';
import { loadCase } from '@/infrastructure/files/case-file.loader';
import { InMemoryAttemptRepository } from '@tests/fakes/in-memory-attempt.repository';

describe('starting an attempt', () => {
  it('opens with the examiner reading the case, and nothing revealed', async () => {
    const attempts = new InMemoryAttemptRepository();
    const publicCase = await loadCase();

    const attemptId = await startAttempt({ attempts }, 'trainee-a');
    const attempt = await attempts.read('trainee-a', attemptId);

    expect(attempt.phase).toBe('asking');
    expect(attempt.caseId).toBe(publicCase.caseId);
    expect(attempt.caseFileHash).toBe(publicCase.fileHash);
    expect(attempt.turns).toHaveLength(1);
    expect(attempt.turns[0]).toMatchObject({
      n: 0,
      speaker: 'examiner',
      kind: 'opening',
      text: publicCase.openingPrompt,
    });
    expect(attempt.revealed).toEqual([]);
    expect(attempt.answer).toBeNull();
    expect(attempt.followUp).toBeNull();
    expect(attempt.revision).toBeNull();
  });

  it('belongs to the trainee who started it and to nobody else', async () => {
    const attempts = new InMemoryAttemptRepository();

    const attemptId = await startAttempt({ attempts }, 'trainee-a');

    await expect(attempts.read('trainee-b', attemptId)).rejects.toMatchObject({ code: 'ATTEMPT_NOT_FOUND' });
    expect(await attempts.count('trainee-b')).toBe(0);
  });

  it('refuses once the account has reached its limit', async () => {
    const attempts = new InMemoryAttemptRepository();
    const blank = newAttempt(await loadCase());
    for (let i = 0; i < MAX_ATTEMPTS_PER_USER; i++) await attempts.create('trainee-a', blank);

    await expect(startAttempt({ attempts }, 'trainee-a')).rejects.toBeInstanceOf(AttemptLimitReachedError);
    expect(await attempts.count('trainee-a')).toBe(MAX_ATTEMPTS_PER_USER);
  });
});
