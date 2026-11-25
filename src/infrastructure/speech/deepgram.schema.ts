import { z } from 'zod';

export const DeepgramListenReplySchema = z.looseObject({
  results: z
    .looseObject({
      channels: z
        .array(
          z.looseObject({
            alternatives: z
              .array(z.looseObject({ transcript: z.string().nullish() }))
              .nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
  err_msg: z.string().nullish(),
});
