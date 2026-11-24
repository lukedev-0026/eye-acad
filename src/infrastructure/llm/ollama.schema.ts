import { z } from 'zod';

// The parts of Ollama's replies this project reads. Every field may be absent
// or null, as the code that reads them allows; anything else in a reply is
// left alone.

export const OllamaChatReplySchema = z.looseObject({
  model: z.string().nullish(),
  message: z.looseObject({ content: z.string().nullish(), thinking: z.string().nullish() }).nullish(),
  done_reason: z.string().nullish(),
  // Durations are in nanoseconds.
  load_duration: z.number().nullish(),
  prompt_eval_count: z.number().nullish(),
  prompt_eval_duration: z.number().nullish(),
  eval_count: z.number().nullish(),
  eval_duration: z.number().nullish(),
  error: z.string().nullish(),
});
export type OllamaChatReply = z.infer<typeof OllamaChatReplySchema>;

export const OllamaEmbedReplySchema = z.looseObject({
  embeddings: z.array(z.array(z.number())).nullish(),
});

export const OllamaVersionReplySchema = z.looseObject({ version: z.string().nullish() });

const OllamaModelSchema = z.looseObject({
  name: z.string(),
  digest: z.string().nullish(),
  size: z.number().nullish(),
  size_vram: z.number().nullish(),
  details: z.looseObject({ format: z.string().nullish(), quantization_level: z.string().nullish() }).nullish(),
});
export type OllamaModel = z.infer<typeof OllamaModelSchema>;

// Both "installed models" (/api/tags) and "models in memory" (/api/ps).
export const OllamaModelListSchema = z.looseObject({ models: z.array(OllamaModelSchema).nullish() });

export const OllamaShowReplySchema = z.looseObject({
  parameters: z.string().nullish(),
  // How the model handles thinking; its shape differs between models.
  thinking: z.unknown(),
});
export type OllamaShowReply = z.infer<typeof OllamaShowReplySchema>;
