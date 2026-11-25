// pnpm readback                     every sentence, three times
// pnpm readback --runs 1            every sentence, once
// pnpm readback iop_right --runs 1  one sentence, printing what was heard
import { parseArgs } from 'node:util';

import { getConfig } from '@/config/env.server';
import { runCli } from '@/eval/cli';
import { EvalRefusedError } from '@/eval/eval.error';
import { runReadback } from '@/eval/voice/readback';
import {
  DeepgramSpeechService,
  createSpeechService,
} from '@/infrastructure/speech/deepgram-speech.service';

await runCli(async () => {
  const { values, positionals } = parseArgs({
    options: { runs: { type: 'string', default: '3' } },
    allowPositionals: true,
  });
  const voice = createSpeechService(getConfig().deepgram);
  if (!(voice instanceof DeepgramSpeechService)) {
    throw new EvalRefusedError(
      'No DEEPGRAM_API_KEY in .env.local, so nothing can be spoken or heard.',
    );
  }
  await runReadback(
    voice,
    { runs: Number(values.runs), only: positionals[0] },
    console.log,
  );
});
