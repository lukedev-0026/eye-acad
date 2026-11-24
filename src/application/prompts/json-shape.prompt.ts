import { z } from 'zod';

// Appended to every prompt, forced format or not, so that switching the
// provider's enforcement on and off changes one thing only.
export function describeJsonShape(schema: z.ZodType): string {
  return (
    'Reply with one JSON object and nothing else. It must match this JSON schema:\n' +
    JSON.stringify(z.toJSONSchema(schema))
  );
}
