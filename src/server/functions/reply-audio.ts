import type { SpokenReply } from '@/domain/speech/speech.service';

export interface ReplyAudioClip {
  readonly base64: string;
  readonly mimeType: string;
}

/** Audio travels inside the authenticated reply: a separate URL could not
 *  carry the token, so it would have to be open. */
export function toReplyAudio(
  speech: SpokenReply | null,
): Array<ReplyAudioClip> | null {
  return speech
    ? speech.clips.map((clip) => ({
        base64: clip.audioBase64,
        mimeType: clip.mimeType,
      }))
    : null;
}
