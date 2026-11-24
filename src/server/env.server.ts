import { existsSync } from 'node:fs'
import path from 'node:path'

// Server-side secrets come from .env.local. Vite only exposes VITE_* variables,
// and only to browser code, so the file is loaded here for the server and for
// the command-line scripts alike. Values already in the environment win.
let loaded = false
export function loadEnv(): void {
  if (loaded) return
  loaded = true
  const file = path.resolve(process.cwd(), '.env.local')
  if (!existsSync(file)) return
  try {
    const before = { ...process.env }
    process.loadEnvFile(file)
    for (const [key, value] of Object.entries(before)) process.env[key] = value
  } catch {
    // A malformed file is treated as absent; the app degrades to typed-only.
  }
}
