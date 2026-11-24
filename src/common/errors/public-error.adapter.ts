import { createSerializationAdapter } from '@tanstack/react-router';

import { PublicError } from './public.error';
import type { PublicErrorFields } from './public.error';

// By default only an error's message survives the trip from a server function
// to the browser. Registered in src/start.ts, this carries a PublicError across
// whole, so the browser can test `error instanceof PublicError` and read its
// code.
export const publicErrorAdapter = createSerializationAdapter({
  key: 'PublicError',
  test: (value: unknown): value is PublicError => value instanceof PublicError,
  toSerializable: (error): PublicErrorFields => error.toFields(),
  fromSerializable: (fields) => new PublicError(fields),
});
