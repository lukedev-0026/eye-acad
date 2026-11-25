import { z } from 'zod';

import type { Catalogue } from './catalogue';

const INTENTS = ['request_items', 'wants_to_answer', 'other'] as const;
export type Intent = (typeof INTENTS)[number];

export const REQUEST_EYES = ['right', 'left', 'both', 'unspecified'] as const;
export type RequestEye = (typeof REQUEST_EYES)[number];

const MAX_REQUESTS = 12;

export interface SelectorRequest {
  item: string;
  eye: RequestEye;
}

export interface SelectorOutput {
  intent: Intent;
  requests: Array<SelectorRequest>;
  not_in_catalogue: boolean;
}

export function selectorSchema(
  catalogue: Catalogue,
): z.ZodType<SelectorOutput> {
  return z.object({
    intent: z.enum(INTENTS),
    requests: z
      .array(
        z.object({ item: z.enum(catalogue.names), eye: z.enum(REQUEST_EYES) }),
      )
      .max(MAX_REQUESTS),
    not_in_catalogue: z.boolean(),
  });
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const lowerCased = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Case-insensitive; an unknown name becomes "not in the catalogue". */
export function normaliseSelectorOutput(
  catalogue: Catalogue,
): (value: unknown) => unknown {
  const byLower = new Map(catalogue.names.map((n) => [n.toLowerCase(), n]));

  return (value) => {
    if (!isObject(value)) return value;
    let notInCatalogue = value.not_in_catalogue;
    const requests: Array<unknown> = [];
    const asked: Array<unknown> = Array.isArray(value.requests)
      ? value.requests
      : [];
    for (const request of asked) {
      if (!isObject(request)) continue;
      const name =
        typeof request.item === 'string'
          ? byLower.get(request.item.trim().toLowerCase())
          : undefined;
      if (!name) {
        notInCatalogue = true;
        continue;
      }
      requests.push({
        item: name,
        eye: lowerCased(request.eye ?? 'unspecified'),
      });
    }
    return {
      intent: lowerCased(value.intent),
      requests,
      not_in_catalogue: notInCatalogue,
    };
  };
}

export interface SelectorCheckOutput {
  checks: Array<{ item: string; asked_for: boolean }>;
}

export function selectorCheckSchema(
  picked: ReadonlyArray<string>,
): z.ZodType<SelectorCheckOutput> {
  const [first, ...rest] = picked;
  const names = first === undefined ? z.string() : z.enum([first, ...rest]);
  return z.object({
    checks: z.array(z.object({ item: names, asked_for: z.boolean() })),
  });
}

export function normaliseSelectorCheck(
  picked: ReadonlyArray<string>,
): (value: unknown) => unknown {
  const byLower = new Map(picked.map((n) => [n.toLowerCase(), n]));
  return (value) => {
    if (!isObject(value) || !Array.isArray(value.checks)) return value;
    const checks: Array<unknown> = [];
    for (const entry of value.checks as Array<unknown>) {
      if (!isObject(entry) || typeof entry.item !== 'string') continue;
      const name = byLower.get(entry.item.trim().toLowerCase());
      if (name) checks.push({ item: name, asked_for: entry.asked_for });
    }
    return { checks };
  };
}
