import type { JSX } from 'react';

import type { RevisionCard } from '@/domain/attempt/attempt.schema';

export function RevisionCardView({
  card,
}: {
  card: RevisionCard;
}): JSX.Element {
  const searched = card.retrievedPages.length
    ? `Pages searched: ${card.retrievedPages.join(', ')}`
    : 'No pages were retrieved';
  const how =
    card.retrievalMode === 'hybrid'
      ? 'by matching words and by meaning'
      : 'by matching words only';

  return (
    <section className="panel revision" aria-label="Revision point">
      <h2>Revision point</h2>
      {card.message ? <p className="revision-message">{card.message}</p> : null}
      {card.missed ? (
        <p>
          <span className="label">What your answer left out</span>
          {card.missed}
        </p>
      ) : null}
      {card.outcome === 'supported' && card.point ? (
        <>
          <p className="revision-point">
            <span className="label">
              {card.pointSource === 'written'
                ? 'To revise'
                : 'Key point for this case'}
            </span>
            {card.point}
          </p>
          <figure className="excerpt">
            <blockquote>{card.excerpt}</blockquote>
            <figcaption>
              Reference note, <strong>{card.page}</strong>
              {card.heading ? (
                <span className="muted"> · {card.heading}</span>
              ) : null}
            </figcaption>
          </figure>
        </>
      ) : null}
      <p className="muted small">
        {searched} ({how}).
      </p>
      {card.noteLine ? (
        <p className="muted small">
          The reference note says of itself: “{card.noteLine}”
        </p>
      ) : null}
    </section>
  );
}
