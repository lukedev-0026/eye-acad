import { AsyncLocalStorage } from 'node:async_hooks';

// What is known about the request being served. It is opened once per request
// and read by the logger, so every line written while serving that request
// carries the same id without a logger being passed from hand to hand.
export interface RequestContext {
  readonly requestId: string;
  functionName?: string;
  uid?: string;
  attemptId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

// Adds what is learnt later in the request: who is signed in, which attempt.
// Outside a request it does nothing.
export function annotateRequestContext(fields: Partial<Omit<RequestContext, 'requestId'>>): void {
  const context = storage.getStore();
  if (context) Object.assign(context, fields);
}
