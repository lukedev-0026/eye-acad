import { sha1Hex } from '@/common/hash.server';
import type { StepId, StepSettings } from '@/domain/llm/step-settings.schema';

export function configId(step: StepId, s: StepSettings): string {
  const key = JSON.stringify([
    step,
    s.provider,
    s.model,
    s.thinking,
    s.forceFormat,
    s.promptVariant,
    s.temperature ?? null,
    s.sampling ?? null,
    s.effort ?? null,
    s.numCtx ?? null,
    s.maxOutputTokens,
    // Left out when empty so ids recorded before this field stay valid.
    ...(s.improvements?.length ? [[...s.improvements].sort()] : []),
  ]);
  return sha1Hex(key).slice(0, 10);
}
