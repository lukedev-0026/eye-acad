import type { StepSettings } from './step-settings.schema';

export interface Prompt {
  readonly system: string;
  readonly user: string;
}

// How a call ended. Only `ok` carries a value. Every other outcome maps to a
// fixed fallback in the app and to a failed run in the checks.
//
//   refusal         the model declined
//   truncated       the reply was cut off, by the output cap or the time limit
//   schema_invalid  a reply arrived, but not in the required shape
//   infra_error     no reply: the model could not be reached
export const CALL_OUTCOMES = ['ok', 'refusal', 'truncated', 'schema_invalid', 'infra_error'] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
export type FailedOutcome = Exclude<CallOutcome, 'ok'>;

// The provider's own figures, where it reports them.
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
  // Wall-clock around the whole call, as the app experiences it.
  readonly ms: number;
  readonly server: ProviderTimings;
}

// These are expected outcomes, not exceptions: a model call that is refused,
// cut off or malformed is part of normal running, and the caller always has a
// fixed fallback for it. Checking `outcome === 'ok'` is what gives access to
// `value`.
export type CallResult<T> =
  | (CallFacts & { readonly outcome: 'ok'; readonly value: T; readonly error?: undefined })
  | (CallFacts & { readonly outcome: FailedOutcome; readonly value?: undefined; readonly error?: string | undefined });

// What a provider returns before the reply is parsed and checked.
export interface ProviderReply {
  readonly outcome: Exclude<CallOutcome, 'schema_invalid'>;
  readonly text: string;
  readonly thinkingChars: number;
  readonly model: string;
  readonly server: ProviderTimings;
  readonly error?: string | undefined;
}
