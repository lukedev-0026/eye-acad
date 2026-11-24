import { vi } from 'vitest';

export interface SentRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly signal: AbortSignal | null;
}

type Handler = (request: SentRequest) => Response | Promise<Response>;

// Replaces `fetch` for one test. Every request is kept for inspection and
// answered by `handler`. Undo with `vi.unstubAllGlobals()`.
export function fakeFetch(handler: Handler): Array<SentRequest> {
  const sent: Array<SentRequest> = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const request: SentRequest = {
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      method: init.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
      signal: init.signal ?? null,
    };
    sent.push(request);
    return handler(request);
  });
  return sent;
}

export const json = (body: unknown, status = 200): Response => Response.json(body, { status });

// What `fetch` throws when its time limit passes.
export function timeoutError(): Error {
  return new DOMException('The operation was aborted due to timeout', 'TimeoutError');
}
