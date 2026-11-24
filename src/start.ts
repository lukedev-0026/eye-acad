import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

// Requests that change anything must come from this site's own pages.
const sameSiteOnly = createCsrfMiddleware({
  filter: ({ request }) => request.method !== 'GET' && request.method !== 'HEAD',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [sameSiteOnly],
}))
