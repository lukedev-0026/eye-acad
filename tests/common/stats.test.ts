import { describe, expect, it } from 'vitest';

import { median, upperMedian } from '@/common/stats';

describe('the two medians', () => {
  it('agree when the count is odd', () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(upperMedian([30, 10, 20])).toBe(20);
  });

  it('differ when the count is even: the mean of the middle pair, or the upper of the two', () => {
    expect(median([10, 20, 31, 40])).toBe(26);
    expect(upperMedian([10, 20, 31, 40])).toBe(31);
  });

  it('do not reorder what they are given', () => {
    const values = [3, 1, 2];

    median(values);
    upperMedian(values);

    expect(values).toEqual([3, 1, 2]);
  });

  it('have no value for an empty list', () => {
    expect(median([])).toBeNull();
    expect(upperMedian([])).toBeUndefined();
  });
});
