import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';

import type { PublicAttempt } from '@/domain/attempt/attempt.schema';
import { AnswerComposer } from '@/features/viva/components/answer-composer';
import { RequestComposer } from '@/features/viva/components/request-composer';
import { RevealedList } from '@/features/viva/components/revealed-list';
import { RevisionCardView } from '@/features/viva/components/revision-card';
import { RevisionPending } from '@/features/viva/components/revision-pending';
import { TimingPanel } from '@/features/viva/components/timing-panel';
import { Transcript } from '@/features/viva/components/transcript';
import { TurnBanner } from '@/features/viva/components/turn-banner';
import { useVivaSession } from '@/features/viva/hooks/use-viva-session';
import { hintFor } from '@/features/viva/lib/turn-machine';

interface VivaProps {
  attemptId: string;
  // The saved attempt, live: the screen is drawn from it and nothing else.
  attempt: PublicAttempt;
}

// One attempt at the viva: the conversation, what has been revealed, the
// answer and follow-up, and the revision point at the end.
export function Viva({ attemptId, attempt }: VivaProps): JSX.Element {
  const session = useVivaSession(attemptId, attempt);
  const { mode, turn } = session;

  return (
    <main className="page viva">
      <div className="row between">
        <div>
          <h1>{attempt.caseTitle || 'Practice viva'}</h1>
          <p className="muted small">Fictional case for practice. Not a real patient.</p>
        </div>
        <Link to="/attempts" className="button quiet">
          All attempts
        </Link>
      </div>

      {mode ? <TurnBanner state={turn} hint={hintFor(mode, turn)} /> : null}

      {attempt.phase === 'complete' && attempt.revision ? <RevisionCardView card={attempt.revision} /> : null}
      {attempt.phase === 'revising' ? (
        <RevisionPending problem={session.revisionProblem} onRetry={() => void session.tryRevisionAgain()} />
      ) : null}

      <div className="viva-grid">
        <section aria-label="Conversation" className="panel">
          <h2>Conversation</h2>
          <Transcript turns={attempt.turns} followUp={attempt.followUp} />
          {session.problem ? (
            <p className="notice error" role="alert">
              {session.problem}
            </p>
          ) : null}

          {mode === 'asking' ? <RequestComposer session={session} /> : null}
          {mode === 'answering' || mode === 'follow_up' ? (
            <AnswerComposer session={session} mode={mode} followUpReady={Boolean(attempt.followUp)} />
          ) : null}
        </section>

        <section aria-label="Findings revealed so far" className="panel">
          <h2>Revealed so far</h2>
          <RevealedList items={attempt.revealed} />
        </section>
      </div>

      <TimingPanel timings={session.timings} />
    </main>
  );
}
