import { useEffect, useRef } from 'react';
import type { JSX } from 'react';

import type { PublicAttempt, Turn } from '@/domain/attempt/attempt.schema';

interface TranscriptProps {
  turns: Array<Turn>;
  followUp: PublicAttempt['followUp'];
}

export function Transcript({ turns, followUp }: TranscriptProps): JSX.Element {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [turns.length]);
  return (
    <ol className="transcript">
      {turns.map((t) => (
        <li key={t.n} className={`turn turn-by-${t.speaker}`}>
          <span className="turn-who">
            {t.speaker === 'examiner' ? 'Examiner' : 'You'}
            {t.via === 'voice' ? ' (spoken)' : ''}
            {t.kind === 'follow_up' ? ' · follow-up question' : ''}
            {t.kind === 'answer' ? ' · your answer' : ''}
          </span>
          {t.kind === 'follow_up' && followUp?.respondingTo ? (
            <p className="muted small">
              Responding to: “{followUp.respondingTo}”
            </p>
          ) : null}
          {t.text.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </li>
      ))}
      <li ref={end} aria-hidden="true" />
    </ol>
  );
}
