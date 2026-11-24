import type { JSX } from 'react';

import { TURN_LABEL } from '@/features/viva/lib/turn-machine';
import type { TurnState } from '@/features/viva/lib/turn-machine';

const MARK: Record<TurnState, string> = { your_turn: '●', listening: '◉', thinking: '…', speaking: '♪' };

// The label is text, with a symbol and a border style to match, so it reads
// the same in greyscale and to a screen reader.
export function TurnBanner({ state, hint }: { state: TurnState; hint: string }): JSX.Element {
  return (
    <div className={`turn-banner turn-${state}`} role="status" aria-live="polite">
      <span className="turn-mark" aria-hidden="true">
        {MARK[state]}
      </span>
      <span className="turn-label">{TURN_LABEL[state]}</span>
      <span className="turn-hint">{hint}</span>
    </div>
  );
}
