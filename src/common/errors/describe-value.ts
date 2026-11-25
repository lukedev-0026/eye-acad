// JSON.stringify can return undefined, though its type says it cannot.
const toJson = (value: unknown): string | undefined => JSON.stringify(value);

export function describeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return toJson(value) ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}
