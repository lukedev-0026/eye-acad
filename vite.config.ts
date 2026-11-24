import path from 'node:path'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

const root = import.meta.dirname

// The dev server will hand any project file to a browser that asks for it by
// path (try `curl localhost:3000/data/...json?raw`). These folders hold the
// hidden examiner notes, or text derived from them, so they are denied
// outright. Patterns are anchored to the project root so that a dependency
// with its own `data/` folder is unaffected.
const privateFolders = ['data', 'evals', 'docs', 'tests', 'scripts', 'config']
const deny = [
  '.env',
  '.env.*',
  '*.{crt,pem}',
  '**/.git/**',
  ...privateFolders.map((dir) => `${path.join(root, dir)}/**`),
  `${root}/*.md`,
]

export default defineConfig({
  resolve: { tsconfigPaths: true },
  server: { fs: { deny } },
  plugins: [tanstackStart(), viteReact()],
})
