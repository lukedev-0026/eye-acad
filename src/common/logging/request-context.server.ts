import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  readonly requestId: string;
  functionName?: string;
  uid?: string;
  attemptId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Adds facts learnt later (user, attempt). Does nothing outside a request. */
export function annotateRequestContext(
  fields: Partial<Omit<RequestContext, 'requestId'>>,
): void {
  const context = storage.getStore();
  if (context) Object.assign(context, fields);
}
