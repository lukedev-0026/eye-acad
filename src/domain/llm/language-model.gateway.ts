import type { z } from 'zod';

import type { CallResult, Prompt, ProviderReply } from './call-result';
import type { StepSettings } from './step-settings.schema';

export interface CallStepOptions {
  readonly normalise?: (value: unknown) => unknown;
  readonly step?: string;
}

export type EmbeddingKind = 'query' | 'document';

/** Never throws: an unusable reply or unreachable model is an outcome. */
export interface LanguageModelGateway {
  callStep<T>(
    settings: StepSettings,
    prompt: Prompt,
    schema: z.ZodType<T>,
    options?: CallStepOptions,
  ): Promise<CallResult<T>>;

  /** Null when the embeddings model is unreachable. */
  embed(
    texts: ReadonlyArray<string>,
    kind: EmbeddingKind,
  ): Promise<Array<Array<number>> | null>;
}

export interface ProviderRequest {
  readonly settings: StepSettings;
  readonly prompt: Prompt;
  readonly schema: z.ZodType;
  readonly jsonSchema: unknown;
}

export interface LanguageModelProvider {
  call(request: ProviderRequest): Promise<ProviderReply>;
}
