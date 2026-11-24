import { defineConfig } from 'vitest/config';

// Plain Node tests. The app's own Vite config (with the TanStack Start plugin)
// is deliberately not loaded here.
//
//   unit         no network, no emulators: `pnpm test`
//   integration  needs the Firebase emulators running: `pnpm test:integration`
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/**/*.test.ts'], exclude: ['tests/integration/**'] },
      },
      {
        extends: true,
        test: { name: 'integration', include: ['tests/integration/**/*.test.ts'] },
      },
    ],
  },
});
