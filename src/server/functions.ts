import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireUser } from './auth-middleware'

// The browser's only way in. Every function checks the caller's token first
// and takes the uid from that check, never from the request body. Server-only
// modules are imported inside the handlers so none of their code can be pulled
// into the browser bundle.

export const whoAmI = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .handler(async ({ context }) => ({ uid: context.uid }))

export const startAttempt = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const { loadCase } = await import('./case.server')
    const { createAttempt } = await import('./attempts.server')
    const attemptId = await createAttempt(context.uid, await loadCase())
    return { attemptId }
  })

const AskInput = z.object({
  attemptId: z.string().min(1).max(64),
  text: z.string().max(2000),
})

export const askTyped = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(AskInput)
  .handler(async ({ context, data }) => {
    const { handleRequest } = await import('./turn.server')
    const result = await handleRequest(context.uid, data.attemptId, data.text, 'typed')
    return {
      kind: result.reply.kind,
      lines: result.reply.lines,
      speech: result.reply.speech,
      timings: result.timings,
    }
  })
