import { z } from 'zod';
import type { Catalogue } from './catalogue';

// What the selector is allowed to say: choices from closed lists and one
// yes/no. It cannot return a value, a sentence or anything of its own.

export const INTENTS = ['request_items', 'wants_to_answer', 'other'] as const;
export const REQUEST_EYES = ['right', 'left', 'both', 'unspecified'] as const;
export type RequestEye = (typeof REQUEST_EYES)[number];

export function selectorSchema(catalogue: Catalogue) {
  return z.object({
    intent: z.enum(INTENTS),
    requests: z
      .array(
        z.object({
          item: z.enum(catalogue.names as [string, ...Array<string>]),
          eye: z.enum(REQUEST_EYES),
        }),
      )
      .max(12),
    not_in_catalogue: z.boolean(),
  });
}
export type SelectorOutput = z.infer<ReturnType<typeof selectorSchema>>;
export type SelectorRequest = SelectorOutput['requests'][number];

// Tidies a reply before it is checked: matches names and enum values without
// regard to capitals, and turns a name that is not on the list into "not in
// the catalogue". An unknown name can therefore never reveal anything.
export function normaliseSelectorOutput(catalogue: Catalogue) {
  const byLower = new Map(catalogue.names.map((n) => [n.toLowerCase(), n]));
  const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v);

  return (value: unknown): unknown => {
    if (typeof value !== 'object' || value === null) return value;
    const v = value as Record<string, unknown>;
    let notInCatalogue = v.not_in_catalogue;
    const requests: Array<unknown> = [];
    if (Array.isArray(v.requests)) {
      for (const r of v.requests as Array<unknown>) {
        if (typeof r !== 'object' || r === null) continue;
        const req = r as Record<string, unknown>;
        const name = typeof req.item === 'string' ? byLower.get(req.item.trim().toLowerCase()) : undefined;
        if (!name) {
          notInCatalogue = true;
          continue;
        }
        requests.push({ item: name, eye: lower(req.eye ?? 'unspecified') });
      }
    }
    return { intent: lower(v.intent), requests, not_in_catalogue: notInCatalogue };
  };
}
