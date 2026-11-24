import type { PromptVariant } from '@/domain/llm/step-settings.schema';

// Wraps text that came from the trainee so it cannot close its own quotation.
export const quoted = (text: string): string => `"""${text.replaceAll('"""', '"').trim()}"""`;

// Each step has one task description, plus either explicit rules or worked
// examples. Keeping the three variants side by side is what lets the sweep
// compare them.
export function assemble(
  variant: PromptVariant,
  parts: { task: string; rules: string; examples: string },
  jsonShape: string,
): string {
  const extra = variant === 'rules' ? parts.rules : variant === 'examples' ? parts.examples : '';
  return [parts.task, extra, jsonShape].filter(Boolean).join('\n\n');
}
