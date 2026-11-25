export function keysOf<T extends object>(
  value: T,
): Array<Extract<keyof T, string>> {
  return Object.keys(value) as Array<Extract<keyof T, string>>;
}

export function recordOf<K extends string, V>(
  keys: ReadonlyArray<K>,
  valueFor: (key: K) => V,
): Record<K, V> {
  return Object.fromEntries(keys.map((key) => [key, valueFor(key)])) as Record<
    K,
    V
  >;
}
