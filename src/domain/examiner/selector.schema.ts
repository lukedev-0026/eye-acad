import { z } from 'zod';

import type { Catalogue } from './catalogue';

// What the selector is allowed to say: choices from closed lists and one
// yes/no. It cannot return a value, a sentence or anything of its own.

export const INTENTS = ['request_items', 'wants_to_answer', 'other'] as const;
export type Intent = (typeof INTENTS)[number];

export const REQUEST_EYES = ['right', 'left', 'both', 'unspecified'] as const;
export type RequestEye = (typeof REQUEST_EYES)[number];

const MAX_REQUESTS = 12;

export interface SelectorRequest {
  // A name from the catalogue, exactly as listed there.
  item: string;
  eye: RequestEye;
}

export interface SelectorOutput {
  intent: Intent;
  requests: Array<SelectorRequest>;
  // True when the trainee asked for something that is not on the menu.
  not_in_catalogue: boolean;
}

export function selectorSchema(catalogue: Catalogue): z.ZodType<SelectorOutput> {
  return z.object({
    intent: z.enum(INTENTS),
    requests: z.array(z.object({ item: z.enum(catalogue.names), eye: z.enum(REQUEST_EYES) })).max(MAX_REQUESTS),
    not_in_catalogue: z.boolean(),
  });
}

// Anything keyed, a list included: the reply has not been checked yet.
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const lowerCased = (value: unknown): unknown => (typeof value === 'string' ? value.trim().toLowerCase() : value);

// Tidies a reply before it is checked: matches names and enum values without
// regard to capitals, and turns a name that is not on the list into "not in
// the catalogue". An unknown name can therefore never reveal anything.
export function normaliseSelectorOutput(catalogue: Catalogue): (value: unknown) => unknown {
  const byLower = new Map(catalogue.names.map((n) => [n.toLowerCase(), n]));

  return (value) => {
    if (!isObject(value)) return value;
    let notInCatalogue = value.not_in_catalogue;
    const requests: Array<unknown> = [];
    const asked: Array<unknown> = Array.isArray(value.requests) ? value.requests : [];
    for (const request of asked) {
      if (!isObject(request)) continue;
      const name = typeof request.item === 'string' ? byLower.get(request.item.trim().toLowerCase()) : undefined;
      if (!name) {
        notInCatalogue = true;
        continue;
      }
      requests.push({ item: name, eye: lowerCased(request.eye ?? 'unspecified') });
    }
    return { intent: lowerCased(value.intent), requests, not_in_catalogue: notInCatalogue };
  };
}
