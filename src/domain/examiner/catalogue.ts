import type { Eye, PublicCase } from '@/domain/case/case.schema';

import { historyLabel } from './render';

// Names only, never results or notes, so the model has nothing to leak.
export type CatalogueItem =
  | { name: string; kind: 'finding'; label: string; eyes: Array<Eye> }
  | { name: string; kind: 'history'; key: string };

export interface Catalogue {
  items: Array<CatalogueItem>;
  names: Array<string>;
}

export function buildCatalogue(c: PublicCase): Catalogue {
  const items: Array<CatalogueItem> = [];

  for (const f of c.findings) {
    const existing = items.find(
      (i) => i.kind === 'finding' && i.label === f.label,
    );
    if (existing?.kind === 'finding') {
      if (!existing.eyes.includes(f.eye)) existing.eyes.push(f.eye);
    } else {
      items.push({
        name: f.label,
        kind: 'finding',
        label: f.label,
        eyes: [f.eye],
      });
    }
  }

  const taken = new Set(items.map((i) => i.name.toLowerCase()));
  for (const key of Object.keys(c.patient)) {
    let name = historyLabel(key);
    if (taken.has(name.toLowerCase())) name = `${name} (history)`;
    taken.add(name.toLowerCase());
    items.push({ name, kind: 'history', key });
  }

  return { items, names: items.map((i) => i.name) };
}
