import type { JSX } from 'react';

import { asTsv, summarise } from '@/features/viva/lib/latency';
import type { TurnTiming } from '@/features/viva/lib/latency';

export function TimingPanel({
  timings,
}: {
  timings: Array<TurnTiming>;
}): JSX.Element | null {
  if (timings.length === 0) return null;
  const summary = summarise(timings);
  return (
    <details className="timing">
      <summary>
        Response times this session
        {summary
          ? `: spoken turns, release to playback, median ${summary.medianMs} ms (range ${summary.minMs}–${summary.maxMs}, n=${summary.n})`
          : ''}
      </summary>
      <p className="muted small">
        The timer starts when the talk button is released and stops when the
        reply audio starts playing.
      </p>
      <pre className="timing-table">{asTsv(timings)}</pre>
    </details>
  );
}
