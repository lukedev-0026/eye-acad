import { mkdir, writeFile } from 'node:fs/promises';

import type { Print } from '@/eval/cli';
import { EvalRefusedError } from '@/eval/eval.error';
import { PATHS } from '@/eval/paths';
import type { DeepgramSpeechService } from '@/infrastructure/speech/deepgram-speech.service';

export const TRAINEE_VOICE = 'aura-2-pandora-en';

const QUESTIONS = [
  'What is the intraocular pressure in the right eye?',
  'Can I have gonioscopy of the right eye?',
  'What is the visual acuity in both eyes?',
  'What does the cornea look like in the right eye?',
  'What are the pupils doing?',
  'Is there a relative afferent pupillary defect?',
  'Does she have any allergies?',
  'What medications is she taking?',
  'What is the anterior chamber depth?',
  'What is the blood pressure?',
  'What is the central corneal thickness?',
  'What does the left optic disc look like?',
];

/** Synthesises spoken questions to test the voice path without a microphone. */
export async function makeVoiceClips(
  voice: DeepgramSpeechService,
  print: Print,
): Promise<void> {
  await mkdir(PATHS.voiceClipsDir, { recursive: true });
  const clips: Array<{ file: string; says: string }> = [];
  for (const [i, says] of QUESTIONS.entries()) {
    const speech = await voice.synthesise(says);
    if (!speech)
      throw new EvalRefusedError(
        `Could not synthesise: ${says} (${voice.lastError})`,
      );
    const file = `q${String(i + 1).padStart(2, '0')}.mp3`;
    await writeFile(
      `${PATHS.voiceClipsDir}/${file}`,
      Buffer.from(speech.audioBase64, 'base64'),
    );
    clips.push({ file, says });
    print(`${file} ${says}`);
  }
  const index = {
    voice: voice.voice,
    note: 'Synthetic speech, generated for testing the spoken path without a microphone.',
    clips,
  };
  await writeFile(
    `${PATHS.voiceClipsDir}/index.json`,
    `${JSON.stringify(index, null, 2)}\n`,
  );
}
