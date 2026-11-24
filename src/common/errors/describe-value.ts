// JSON.stringify gives nothing back for a function or `undefined`, which its
// own type does not admit.
const toJson = (value: unknown): string | undefined => JSON.stringify(value);

// Anything at all, as text, without ever throwing. For putting a value that
// was thrown or caught into a message.
export function describeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return toJson(value) ?? String(value);
  } catch {
    // A value that refers to itself, or throws while being read.
    return Object.prototype.toString.call(value);
  }
}
