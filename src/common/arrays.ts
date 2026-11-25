import { InternalError } from '@/common/errors/internal.error';

/** Throws at once rather than letting `undefined` travel on. */
export function itemAt<T>(items: ReadonlyArray<T>, index: number): T {
  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    throw new InternalError(
      { details: { index, length: items.length } },
      `No item at position ${index} in a list of ${items.length}.`,
    );
  }
  return items[index] as T;
}
