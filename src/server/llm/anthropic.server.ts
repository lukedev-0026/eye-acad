import type { Prompt, RawCall, StepSettings } from './types'

// Placeholder for the Claude adapter. Not implemented yet: the build and every
// reported number use local Ollama models. A step configured with
// provider "anthropic" fails cleanly with the message below.
export async function callAnthropic(
  settings: StepSettings,
  _prompt: Prompt,
  _jsonSchema: unknown,
): Promise<RawCall> {
  return {
    outcome: 'infra_error',
    text: '',
    thinkingChars: 0,
    model: settings.model,
    server: {},
    error: 'The Claude adapter is not implemented in this build.',
  }
}
