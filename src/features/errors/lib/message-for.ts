import { PublicError } from '@/common/errors/public.error';

export function messageFor(error: unknown, fallback: string): string {
  return error instanceof PublicError && error.specific
    ? error.message
    : fallback;
}
