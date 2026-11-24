import type { z } from 'zod';

import type { CallResult, Prompt, ProviderReply } from './call-result';
import type { StepSettings } from './step-settings.schema';

export interface CallStepOptions {
  // Tidies a parsed reply before it is checked (for example matching a label
  // without regard to capitals). It cannot widen what the schema accepts.
  readonly normalise?: (value: unknown) => unknown;
  // Which step is calling, for the log.
  readonly step?: string;
}

export type EmbeddingKind = 'query' | 'document';

// The single door every model call goes through, in the app and in the checks
// alike.
export interface LanguageModelGateway {
  // One call to the model the settings name. The reply is checked against the
  // schema whether or not the provider was asked to enforce it. Returns a
  // typed result and never throws: the caller decides which fixed fallback an
  // unusable result maps to.
  callStep<T>(
    settings: StepSettings,
    prompt: Prompt,
    schema: z.ZodType<T>,
    options?: CallStepOptions,
  ): Promise<CallResult<T>>;

  // Vectors for meaning-based search, one per text, or null when the
  // embeddings model cannot be reached. The caller then searches by keyword
  // alone.
  embed(texts: ReadonlyArray<string>, kind: EmbeddingKind): Promise<Array<Array<number>> | null>;
}

export interface ProviderRequest {
  readonly settings: StepSettings;
  readonly prompt: Prompt;
  // The reply's shape, twice: as the schema itself and as JSON schema. Each
  // provider takes the form it can enforce.
  readonly schema: z.ZodType;
  readonly jsonSchema: unknown;
}

// One vendor's way of answering a prompt. Never throws: a failure to reach the
// model is an outcome too.
export interface LanguageModelProvider {
  call(request: ProviderRequest): Promise<ProviderReply>;
}
