import { execFileSync } from 'node:child_process';

import { ollamaHost } from '../server/llm/ollama.server';

// What the machine was doing when a result was recorded. Timings mean little
// without it: this Mac was found in Low Power Mode with swap in use.

function sh(command: string, args: Array<string>): string {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export type RunEnv = {
  machine: string;
  memoryGb: number | null;
  powerMode: string;
  onMains: boolean | null;
  swapUsedMb: number | null;
  ollamaVersion: string;
  node: string;
  commit: string;
  dirty: boolean;
};

export function powerMode(): string {
  const m = /powermode\s+(\d)/.exec(sh('pmset', ['-g']));
  // macOS: 0 automatic, 1 low power, 2 high power.
  return m ? ({ '0': 'automatic', '1': 'low power', '2': 'high power' }[m[1]] ?? m[1]) : 'unknown';
}

export function swapUsedMb(): number | null {
  const m = /used = ([\d.]+)M/.exec(sh('sysctl', ['-n', 'vm.swapusage']));
  return m ? Math.round(Number(m[1])) : null;
}

export async function ollamaVersion(): Promise<string> {
  try {
    const res = await fetch(`${ollamaHost()}/api/version`, { signal: AbortSignal.timeout(3000) });
    return ((await res.json()) as { version?: string }).version ?? 'unknown';
  } catch {
    return 'not running';
  }
}

export async function captureEnv(): Promise<RunEnv> {
  const memory = Number(sh('sysctl', ['-n', 'hw.memsize']));
  const battery = sh('pmset', ['-g', 'batt']);
  return {
    machine: sh('sysctl', ['-n', 'machdep.cpu.brand_string']) || process.arch,
    memoryGb: memory ? Math.round(memory / 2 ** 30) : null,
    powerMode: powerMode(),
    onMains: battery ? /AC Power/.test(battery) : null,
    swapUsedMb: swapUsedMb(),
    ollamaVersion: await ollamaVersion(),
    node: process.version,
    commit: sh('git', ['rev-parse', '--short', 'HEAD']) || 'unknown',
    dirty: sh('git', ['status', '--porcelain', '--untracked-files=no']) !== '',
  };
}

export type ModelInfo = { name: string; digest: string; engine: string; quantisation: string; sizeGb: number };

export async function modelInfo(name: string): Promise<ModelInfo | null> {
  try {
    const res = await fetch(`${ollamaHost()}/api/tags`, { signal: AbortSignal.timeout(5000) });
    const json = (await res.json()) as {
      models?: Array<{
        name: string;
        digest: string;
        size: number;
        details?: { format?: string; quantization_level?: string };
      }>;
    };
    const m = json.models?.find((x) => x.name === name || x.name === `${name}:latest`);
    if (!m) return null;
    return {
      name: m.name,
      digest: m.digest.slice(0, 12),
      engine: m.details?.format === 'safetensors' ? 'mlx' : (m.details?.format ?? 'unknown'),
      quantisation: m.details?.quantization_level ?? 'unknown',
      sizeGb: Math.round((m.size / 1e9) * 10) / 10,
    };
  } catch {
    return null;
  }
}
