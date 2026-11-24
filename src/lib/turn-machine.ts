// Whose turn it is. One value drives the on-screen label, whether the
// microphone and text box are usable, and nothing else can change it.

export type TurnState = 'your_turn' | 'listening' | 'thinking' | 'speaking'

export type TurnEvent =
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'CANCEL_LISTENING' }
  | { type: 'SUBMIT_TEXT' }
  | { type: 'REPLY_SPEAKING' }
  | { type: 'REPLY_SILENT' }
  | { type: 'SPEECH_ENDED' }
  | { type: 'FAILED' }

export const TURN_LABEL: Record<TurnState, string> = {
  your_turn: 'Your turn',
  listening: 'Listening',
  thinking: 'Examiner is thinking',
  speaking: 'Examiner is speaking',
}

export const TURN_HINT: Record<TurnState, string> = {
  your_turn: 'Hold the button and speak, or type a request.',
  listening: 'Release the button when you have finished.',
  thinking: 'Please wait.',
  speaking: 'Please wait until the examiner has finished.',
}

export function nextTurnState(state: TurnState, event: TurnEvent): TurnState {
  switch (event.type) {
    case 'START_LISTENING':
      return state === 'your_turn' ? 'listening' : state
    case 'STOP_LISTENING':
      return state === 'listening' ? 'thinking' : state
    case 'CANCEL_LISTENING':
      return state === 'listening' ? 'your_turn' : state
    case 'SUBMIT_TEXT':
      return state === 'your_turn' ? 'thinking' : state
    case 'REPLY_SPEAKING':
      return state === 'thinking' ? 'speaking' : state
    case 'REPLY_SILENT':
      return state === 'thinking' ? 'your_turn' : state
    case 'SPEECH_ENDED':
      return state === 'speaking' ? 'your_turn' : state
    // Any failure hands the turn back, so the trainee is never left waiting.
    case 'FAILED':
      return 'your_turn'
  }
}

export const canTraineeAct = (state: TurnState) => state === 'your_turn'
