import { execFileSync } from 'node:child_process';

import { getConfig } from '@/config/env.server';
import { OllamaClient } from '@/infrastructure/llm/ollama-http';

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

// As macOS numbers them.
const POWER_MODES: Record<string, string> = { '0': 'automatic', '1': 'low power', '2': 'high power' };

export function powerMode(): string {
  const digit = /powermode\s+(\d)/.exec(sh('pmset', ['-g']))?.[1];
  return digit === undefined ? 'unknown' : (POWER_MODES[digit] ?? digit);
}

export function swapUsedMb(): number | null {
  const m = /used = ([\d.]+)M/.exec(sh('sysctl', ['-n', 'vm.swapusage']));
  return m ? Math.round(Number(m[1])) : null;
}

export async function ollamaVersion(): Promise<string> {
  try {
    return (await new OllamaClient(getConfig().ollama.host).version()) ?? 'unknown';
  } catch {
    return 'not running';
  }
}

// The battery, as macOS reports it. A long run can draw more power than a
// small charger supplies, so the sweep watches this and stops cleanly.
export function batteryState(): { percent: number | null; onMains: boolean | null } {
  const report = sh('pmset', ['-g', 'batt']);
  if (!report) return { percent: null, onMains: null };
  const percent = /(\d+)%/.exec(report)?.[1];
  return { percent: percent === undefined ? null : Number(percent), onMains: /AC Power/.test(report) };
}

export async function captureEnv(): Promise<RunEnv> {
  const memory = Number(sh('sysctl', ['-n', 'hw.memsize']));
  return {
    machine: sh('sysctl', ['-n', 'machdep.cpu.brand_string']) || process.arch,
    memoryGb: memory ? Math.round(memory / 2 ** 30) : null,
    powerMode: powerMode(),
    onMains: batteryState().onMains,
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
    const models = await new OllamaClient(getConfig().ollama.host).installedModels();
    const m = models.find((x) => x.name === name || x.name === `${name}:latest`);
    if (!m) return null;
    return {
      name: m.name,
      digest: (m.digest ?? '').slice(0, 12),
      engine: m.details?.format === 'safetensors' ? 'mlx' : (m.details?.format ?? 'unknown'),
      quantisation: m.details?.quantization_level ?? 'unknown',
      sizeGb: Math.round(((m.size ?? 0) / 1e9) * 10) / 10,
    };
  } catch {
    return null;
  }
}
