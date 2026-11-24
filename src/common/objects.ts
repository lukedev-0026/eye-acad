// `Object.keys` and `Object.fromEntries` forget what an object's keys are and
// hand back plain strings. These two keep the keys' type. The casts are sound
// for objects written out in this project, whose keys are all known; they are
// the only place the cast is made.

export function keysOf<T extends object>(value: T): Array<Extract<keyof T, string>> {
  return Object.keys(value) as Array<Extract<keyof T, string>>;
}

// An object with one entry for each key, in the order given.
export function recordOf<K extends string, V>(keys: ReadonlyArray<K>, valueFor: (key: K) => V): Record<K, V> {
  return Object.fromEntries(keys.map((key) => [key, valueFor(key)])) as Record<K, V>;
}
