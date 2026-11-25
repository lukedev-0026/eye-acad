import type { PromptVariant } from '@/domain/llm/step-settings.schema';

/** Wraps trainee text so it cannot close its own quotation. */
export const quoted = (text: string): string =>
  `"""${text.replaceAll('"""', '"').trim()}"""`;

/** Task description plus rules or worked examples. */
export function assemble(
  variant: PromptVariant,
  parts: { task: string; rules: string; examples: string },
  jsonShape: string,
): string {
  const extra =
    variant === 'rules'
      ? parts.rules
      : variant === 'examples'
        ? parts.examples
        : '';
  return [parts.task, extra, jsonShape].filter(Boolean).join('\n\n');
}
