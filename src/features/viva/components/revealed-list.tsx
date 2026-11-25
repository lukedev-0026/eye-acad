import type { JSX } from 'react';

import type { RevealedItem } from '@/domain/attempt/attempt.schema';

export function RevealedList({
  items,
}: {
  items: Array<RevealedItem>;
}): JSX.Element {
  if (items.length === 0) {
    return (
      <p className="muted small">
        Nothing yet. Ask the examiner for a finding.
      </p>
    );
  }
  return (
    <ul className="revealed">
      {items.map((item) => (
        <li
          key={item.id}
          className={item.available ? 'finding' : 'finding unavailable'}
        >
          <span className="finding-label">
            {item.eyeLabel ? `${item.eyeLabel} · ` : ''}
            {item.label}
          </span>
          <span className="finding-value">{item.value}</span>
          {item.method ? (
            <span className="finding-method muted small">{item.method}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
