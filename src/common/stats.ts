/** With an even count, the rounded mean of the two middle values. */
export function median(values: ReadonlyArray<number>): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) return null;
  const lower = sorted[mid - 1];
  return sorted.length % 2 === 1 || lower === undefined
    ? upper
    : Math.round((lower + upper) / 2);
}

/** Always an observed value. Not interchangeable with `median`. */
export function upperMedian(values: ReadonlyArray<number>): number | undefined {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}
