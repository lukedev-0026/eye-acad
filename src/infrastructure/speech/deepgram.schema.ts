import { z } from 'zod';

// The parts of Deepgram's speech-to-text reply this project reads. Every level
// may be absent, as the code that reads it allows.
export const DeepgramListenReplySchema = z.looseObject({
  results: z
    .looseObject({
      channels: z
        .array(
          z.looseObject({
            alternatives: z.array(z.looseObject({ transcript: z.string().nullish() })).nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
  err_msg: z.string().nullish(),
});
