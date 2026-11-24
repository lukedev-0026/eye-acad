// Whose turn it is. One value drives the on-screen label, whether the
// microphone and text box are usable, and nothing else can change it.

export type TurnState = 'your_turn' | 'listening' | 'thinking' | 'speaking';

export type TurnEvent =
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'CANCEL_LISTENING' }
  | { type: 'SUBMIT_TEXT' }
  | { type: 'REPLY_SPEAKING' }
  | { type: 'REPLY_SILENT' }
  | { type: 'SPEECH_ENDED' }
  | { type: 'FAILED' };

export const TURN_LABEL: Record<TurnState, string> = {
  your_turn: 'Your turn',
  listening: 'Listening',
  thinking: 'Examiner is thinking',
  speaking: 'Examiner is speaking',
};

// What the trainee is doing: asking for findings, writing the answer, or
// replying to the follow-up question.
export type VivaMode = 'asking' | 'answering' | 'follow_up';

const HINT: Record<VivaMode, Record<TurnState, string>> = {
  asking: {
    your_turn: 'Hold the button and ask for a finding, or type a request.',
    listening: 'Release the button when you have finished.',
    thinking: 'Please wait.',
    speaking: 'Please wait until the examiner has finished.',
  },
  answering: {
    your_turn: 'Give your diagnosis and immediate management, then submit.',
    listening: 'Release the button when you have finished.',
    thinking: 'Please wait.',
    speaking: 'Please wait until the examiner has finished.',
  },
  follow_up: {
    your_turn: 'Reply to the follow-up question, then send.',
    listening: 'Release the button when you have finished.',
    thinking: 'Please wait.',
    speaking: 'Please wait until the examiner has finished.',
  },
};

// The one line of guidance under the turn label.
export const hintFor = (mode: VivaMode, state: TurnState): string => HINT[mode][state];

export function nextTurnState(state: TurnState, event: TurnEvent): TurnState {
  switch (event.type) {
    case 'START_LISTENING':
      return state === 'your_turn' ? 'listening' : state;
    case 'STOP_LISTENING':
      return state === 'listening' ? 'thinking' : state;
    case 'CANCEL_LISTENING':
      return state === 'listening' ? 'your_turn' : state;
    case 'SUBMIT_TEXT':
      return state === 'your_turn' ? 'thinking' : state;
    case 'REPLY_SPEAKING':
      return state === 'thinking' ? 'speaking' : state;
    case 'REPLY_SILENT':
      return state === 'thinking' ? 'your_turn' : state;
    case 'SPEECH_ENDED':
      return state === 'speaking' ? 'your_turn' : state;
    // Any failure hands the turn back, so the trainee is never left waiting.
    case 'FAILED':
      return 'your_turn';
  }
}

export const canTraineeAct = (state: TurnState): boolean => state === 'your_turn';
