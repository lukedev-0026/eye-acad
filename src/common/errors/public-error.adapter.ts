import { createSerializationAdapter } from '@tanstack/react-router';

import { PublicError } from './public.error';
import type { PublicErrorFields } from './public.error';

export const publicErrorAdapter = createSerializationAdapter({
  key: 'PublicError',
  test: (value: unknown): value is PublicError => value instanceof PublicError,
  toSerializable: (error): PublicErrorFields => error.toFields(),
  fromSerializable: (fields) => new PublicError(fields),
});
