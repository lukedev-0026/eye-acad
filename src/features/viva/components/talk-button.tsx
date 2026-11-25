import { useRef } from 'react';
import type { JSX } from 'react';

interface TalkButtonProps {
  label: string;
  disabled: boolean;
  recording: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function TalkButton(props: TalkButtonProps): JSX.Element {
  const held = useRef(false);
  const begin = () => {
    if (props.disabled || held.current) return;
    held.current = true;
    props.onStart();
  };
  const end = () => {
    if (!held.current) return;
    held.current = false;
    props.onStop();
  };
  return (
    <button
      type="button"
      className={`button talk ${props.recording ? 'talk-on' : ''}`}
      disabled={props.disabled}
      aria-pressed={props.recording}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        begin();
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          end();
        }
      }}
      onBlur={end}
    >
      {props.recording ? 'Listening… release to send' : props.label}
    </button>
  );
}
