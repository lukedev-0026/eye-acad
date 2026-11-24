import path from 'node:path';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

// The dev server will hand any project file to a browser that asks for it by
// path (try `curl localhost:3000/data/...json?raw`). These folders hold the
// hidden examiner notes, or text derived from them, so they are denied
// outright. Patterns are anchored to the project root so that a dependency
// with its own `data/` folder is unaffected.
const privateFolders = ['data', 'evals', 'docs', 'tests', 'scripts', 'config'];
const deny = [
  '.env',
  '.env.*',
  '*.{crt,pem}',
  '**/.git/**',
  ...privateFolders.map((dir) => `${path.join(root, dir)}/**`),
  `${root}/*.md`,
];

// Folders that only ever run on the server. A file in one of them that is
// still reachable from the browser bundle after the build has dropped the
// server-function bodies fails the build. Elsewhere the `.server.ts` suffix
// marks a single file the same way.
const serverOnly = ['**/*.server.*', 'src/application/**', 'src/infrastructure/**', 'src/eval/**'];

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: { fs: { deny } },
  plugins: [tanstackStart({ importProtection: { client: { files: serverOnly } } }), viteReact()],
});
