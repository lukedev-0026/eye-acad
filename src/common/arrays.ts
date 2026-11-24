// The item at a position that is known to exist: two lists built to run in
// step, or a list just checked to be long enough. If the position is not
// there, that knowledge was wrong, and this says so at once instead of letting
// `undefined` travel on.
export function itemAt<T>(items: ReadonlyArray<T>, index: number): T {
  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    throw new RangeError(`No item at position ${index} in a list of ${items.length}.`);
  }
  return items[index] as T;
}
