// Makes short recorded questions for trying the spoken path without a
// microphone, in a different voice from the examiner's.
//   pnpm tsx scripts/make-voice-clips.ts
import { getConfig } from '@/config/env.server';
import { runCli } from '@/eval/cli';
import { EvalRefusedError } from '@/eval/eval.error';
import { TRAINEE_VOICE, makeVoiceClips } from '@/eval/voice/voice-clips';
import { DeepgramSpeechService } from '@/infrastructure/speech/deepgram-speech.service';

await runCli(async () => {
  const { deepgram } = getConfig();
  if (!deepgram.apiKey) throw new EvalRefusedError('No DEEPGRAM_API_KEY in .env.local.');
  const voice = new DeepgramSpeechService({ ...deepgram, apiKey: deepgram.apiKey, ttsVoice: TRAINEE_VOICE });
  await makeVoiceClips(voice, console.log);
});
