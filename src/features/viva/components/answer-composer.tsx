import type { JSX } from 'react';

import { TalkButton } from '@/features/viva/components/talk-button';
import type { VivaSession } from '@/features/viva/hooks/use-viva-session';

interface AnswerComposerProps {
  session: VivaSession;
  mode: 'answering' | 'follow_up';
  // False while the follow-up question is still being prepared.
  followUpReady: boolean;
}

// Writing the answer, and then the reply to the follow-up question. Speech is
// turned into text in the box first, so it can be read and corrected.
export function AnswerComposer({ session, mode, followUpReady }: AnswerComposerProps): JSX.Element {
  const { turn, canAct, draft } = session;

  if (mode === 'follow_up' && !followUpReady) {
    return (
      <div className="composer">
        <div className="row">
          <span className="muted">The follow-up question is being prepared…</span>
          <button className="button quiet" disabled={!canAct} onClick={() => void session.tryFollowUpAgain()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="composer">
      <label htmlFor="draft" className="small muted">
        {mode === 'answering' ? 'Your diagnosis and immediate management' : 'Your reply to the follow-up question'}
      </label>
      <textarea
        id="draft"
        className="textarea"
        value={draft}
        maxLength={4000}
        disabled={!canAct}
        onChange={(e) => {
          session.setDraft(e.target.value);
        }}
      />
      <div className="row between">
        {session.micOk ? (
          <TalkButton
            label="Hold to dictate"
            disabled={!canAct && turn !== 'listening'}
            recording={turn === 'listening'}
            onStart={() => void session.startListening()}
            onStop={() => void session.stopAndDictate()}
          />
        ) : (
          <span />
        )}
        <span className="row">
          {mode === 'answering' ? (
            <>
              <button className="button quiet" disabled={!canAct} onClick={session.backToAsking}>
                Back to asking
              </button>
              <button
                className="button primary"
                disabled={!canAct || !draft.trim()}
                onClick={() => void session.submitAnswer()}
              >
                Submit my answer
              </button>
            </>
          ) : (
            <button className="button primary" disabled={!canAct} onClick={() => void session.submitReply()}>
              Send reply
            </button>
          )}
        </span>
      </div>
      {mode === 'answering' ? (
        <p className="muted small">Submitting ends the questions. The examiner then asks one follow-up.</p>
      ) : null}
    </div>
  );
}
