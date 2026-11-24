import type { JSX } from 'react';

import { TalkButton } from '@/features/viva/components/talk-button';
import type { VivaSession } from '@/features/viva/hooks/use-viva-session';

// Asking for findings: by holding the button and speaking, by typing, or by
// sending a recorded question. Also where the trainee moves on to the answer.
export function RequestComposer({ session }: { session: VivaSession }): JSX.Element {
  const { turn, canAct, request } = session;
  return (
    <div className="composer">
      {session.micOk ? (
        <TalkButton
          label="Hold to talk"
          disabled={!canAct && turn !== 'listening'}
          recording={turn === 'listening'}
          onStart={() => void session.startListening()}
          onStop={() => void session.stopAndAsk()}
        />
      ) : (
        <p className="muted small">This browser cannot record audio. Type your requests instead.</p>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void session.askText();
        }}
      >
        <label htmlFor="request" className="visually-hidden">
          Type a request
        </label>
        <input
          id="request"
          className="input"
          value={request}
          maxLength={500}
          autoComplete="off"
          placeholder="Or type: what is the pressure in the right eye?"
          disabled={!canAct}
          onChange={(e) => {
            session.setRequest(e.target.value);
          }}
        />
        <button className="button" disabled={!canAct || !request.trim()}>
          Ask
        </button>
      </form>
      <div className="row between">
        <details className="clip">
          <summary className="small muted">No microphone?</summary>
          <label className="small muted">
            Send a recorded question{' '}
            <input
              type="file"
              accept="audio/*"
              disabled={!canAct}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void session.askWithFile(file);
              }}
            />
          </label>
        </details>
        <button className="button primary" disabled={!canAct} onClick={session.beginAnswer}>
          Give my answer
        </button>
      </div>
    </div>
  );
}
