import type { SpokenReply } from '@/domain/speech/speech.service';

export interface ReplyAudioClip {
  readonly base64: string;
  readonly mimeType: string;
}

// The examiner's audio as the browser receives it: one or more clips, played
// back to back. It travels inside the authenticated reply; a separate audio
// address could not carry the sign-in token, so it would have to be open.
export function toReplyAudio(speech: SpokenReply | null): Array<ReplyAudioClip> | null {
  return speech ? speech.clips.map((clip) => ({ base64: clip.audioBase64, mimeType: clip.mimeType })) : null;
}
