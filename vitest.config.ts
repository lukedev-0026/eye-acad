import { defineConfig } from 'vitest/config';

// Plain Node tests of the fixed-logic files. The app's own Vite config (with
// the TanStack Start plugin) is deliberately not loaded here.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
