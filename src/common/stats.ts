// Two ways of naming the middle of a list of numbers. They differ only when
// the list has an even count, and the difference is deliberate: results
// recorded with one must not be re-reported with the other.

// The middle value. With an even count, the mean of the two middle values,
// rounded to a whole number. Used for every reported time.
export function median(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] as number;
  return sorted.length % 2 ? upper : Math.round(((sorted[mid - 1] as number) + upper) / 2);
}

// The middle value. With an even count, the upper of the two middle values:
// always a value that was actually observed. The sweep's "far too slow" rule
// and the results table's thinking column use this one.
export function upperMedian(values: ReadonlyArray<number>): number | undefined {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}
