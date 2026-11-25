import type { StepSettings } from './step-settings.schema';

export interface Prompt {
  readonly system: string;
  readonly user: string;
}

export const CALL_OUTCOMES = [
  'ok',
  'refusal',
  'truncated',
  'schema_invalid',
  'infra_error',
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
export type FailedOutcome = Exclude<CallOutcome, 'ok'>;

export interface ProviderTimings {
  readonly loadMs?: number | undefined;
  readonly promptEvalMs?: number | undefined;
  readonly evalMs?: number | undefined;
  readonly promptTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
}

interface CallFacts {
  readonly rawText: string;
  readonly thinkingChars: number;
  readonly model: string;
  readonly provider: StepSettings['provider'];
  readonly ms: number;
  readonly server: ProviderTimings;
}

export type CallResult<T> =
  | (CallFacts & {
      readonly outcome: 'ok';
      readonly value: T;
      readonly error?: undefined;
    })
  | (CallFacts & {
      readonly outcome: FailedOutcome;
      readonly value?: undefined;
      readonly error?: string | undefined;
    });

export interface ProviderReply {
  readonly outcome: Exclude<CallOutcome, 'schema_invalid'>;
  readonly text: string;
  readonly thinkingChars: number;
  readonly model: string;
  readonly server: ProviderTimings;
  readonly error?: string | undefined;
}
