import { z } from 'zod';

import { itemAt } from '@/common/arrays';
import { keysOf } from '@/common/objects';
import type { StepId } from '@/domain/llm/step-settings.schema';
import type { EvalContext } from '@/eval/eval.types';
import { selfTest } from '@/eval/run/self-test';
import { STEP_EVALS } from '@/eval/steps/registry';
import { CEILING_MS } from '@/eval/sweep/grid';

export const ChartRowSchema = z.object({
  provider: z.string(),
  stage: z.string(),
  split: z.string(),
  step: z.string(),
  size: z.string(),
  temperature: z.string(),
  sampling: z.string(),
  thinking: z.string(),
  forced_format: z.string(),
  prompt: z.string(),
  status: z.string(),
  is_start: z.string(),
  is_chosen: z.string(),
  cases_n: z.string(),
  cases_all_pass_k: z.string(),
  costly_errors: z.string(),
  fallbacks: z.string(),
  truncated: z.string(),
  schema_invalid: z.string(),
  timed_calls: z.string(),
  median_ms: z.string(),
  min_ms: z.string(),
  max_ms: z.string(),
  date_utc: z.string(),
  ollama_version: z.string(),
  power_mode: z.string(),
});
type CsvRow = z.infer<typeof ChartRowSchema>;

export interface Floor {
  readonly k: number;
  readonly name: string;
}

interface ChartFrame {
  readonly rows: Array<CsvRow>;
  readonly floors: Record<StepId, Floor>;
  /** Seconds, shared by every panel. */
  readonly xMin: number;
  readonly xMax: number;
  readonly xTicks: Array<number>;
}

export async function chartFloors(
  ctx: EvalContext,
): Promise<Record<StepId, Floor>> {
  const floorFor = async (step: StepId): Promise<Floor> => {
    const cases = (await STEP_EVALS[step].cases(ctx)).filter(
      (c) => c.split === 'tune',
    );
    const st = selfTest(STEP_EVALS[step], cases, ctx);
    return { k: st.constantPass, name: st.constantName };
  };
  return {
    selector: await floorFor('selector'),
    followup: await floorFor('followup'),
    coverage: await floorFor('coverage'),
    revision: await floorFor('revision'),
    verifier: await floorFor('verifier'),
  };
}

// Colour-blind-checked palette slots; size is also shown by shape.

const SIZE = {
  small: {
    label: 'small (4b)',
    shape: 'circle',
    light: '#2a78d6',
    dark: '#3987e5',
  },
  medium: {
    label: 'medium (9b)',
    shape: 'square',
    light: '#eb6834',
    dark: '#d95926',
  },
  large: {
    label: 'large (27b)',
    shape: 'triangle',
    light: '#1baf7a',
    dark: '#199e70',
  },
} as const;
type SizeKey = keyof typeof SIZE;
const isSizeKey = (value: string): value is SizeKey => value in SIZE;

const STEP_TITLE: Record<StepId, string> = {
  selector: 'Menu-picker',
  followup: 'Follow-up writer',
  coverage: 'Coverage judge',
  revision: 'Revision step',
  verifier: 'Support check',
};

const W = 1200;
const PANEL_W = 372;
const PANEL_H = 286;
const GAP_X = 28;
const GAP_Y = 54;
const LEFT = 30;
const TOP = 96;
const PLOT = { left: 44, right: 14, top: 30, bottom: 62 };
const H = TOP + 2 * PANEL_H + GAP_Y + 64;

const esc = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const num = (v: string) => (v === '' ? null : Number(v));

function marker(
  shape: string,
  cx: number,
  cy: number,
  r: number,
  cls: string,
): string {
  if (shape === 'circle')
    return `<circle class="${cls}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}"/>`;
  if (shape === 'square')
    return `<rect class="${cls}" x="${(cx - r).toFixed(1)}" y="${(cy - r).toFixed(1)}" width="${2 * r}" height="${2 * r}" rx="1.5"/>`;
  const h = r * 1.25;
  return `<path class="${cls}" d="M${cx.toFixed(1)} ${(cy - h).toFixed(1)} L${(cx + h).toFixed(1)} ${(cy + h * 0.8).toFixed(1)} L${(cx - h).toFixed(1)} ${(cy + h * 0.8).toFixed(1)} Z"/>`;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Dot {
  row: CsvRow;
  px: number;
  py: number;
  stopped: boolean;
}

interface Label {
  svg: string;
  box: Box;
  leader?: string;
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

function textBox(
  xAt: number,
  baseline: number,
  text: string,
  anchor: 'start' | 'end',
  charWidth: number,
): Box {
  const width = text.length * charWidth;
  const x0 = anchor === 'start' ? xAt : xAt - width;
  return { x0, x1: x0 + width, y0: baseline - 10, y1: baseline + 3 };
}

function clearest(
  candidates: ReadonlyArray<Label>,
  taken: ReadonlyArray<Box>,
): Label {
  let best = itemAt(candidates, 0);
  let fewest = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const hits = taken.filter((box) => overlaps(candidate.box, box)).length;
    if (hits < fewest) {
      best = candidate;
      fewest = hits;
    }
    if (hits === 0) break;
  }
  return best;
}

const REF_CHAR_WIDTH = 5.4;
const DIRECT_CHAR_WIDTH = 6.2;

function refLabel(
  xAt: number,
  baseline: number,
  text: string,
  anchor: 'start' | 'end',
): Label {
  return {
    svg: `<text class="ref-label" x="${xAt.toFixed(1)}" y="${baseline.toFixed(1)}" text-anchor="${anchor}">${esc(text)}</text>`,
    box: textBox(xAt, baseline, text, anchor, REF_CHAR_WIDTH),
  };
}

const LABEL_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [18, 0],
  [-18, 0],
  [16, -16],
  [16, 18],
  [-16, -16],
  [-16, 18],
  [34, 32],
  [34, -30],
  [-34, 32],
  [-34, -30],
  [56, 48],
  [56, -46],
  [80, 30],
  [80, -28],
  [60, 66],
  [110, 46],
];

function directLabel(dot: Dot, dx: number, dy: number, text: string): Label {
  const anchor = dx >= 0 ? 'start' : 'end';
  const xAt = dot.px + dx;
  const baseline = dot.py + dy + 4;
  const beside = dy === 0;
  return {
    svg: `<text class="direct" x="${xAt.toFixed(1)}" y="${baseline.toFixed(1)}" text-anchor="${anchor}">${esc(text)}</text>`,
    box: textBox(xAt, baseline, text, anchor, DIRECT_CHAR_WIDTH),
    ...(beside
      ? {}
      : {
          leader: `<line class="leader" x1="${dot.px.toFixed(1)}" y1="${dot.py.toFixed(1)}" x2="${(xAt - Math.sign(dx) * 3).toFixed(1)}" y2="${(baseline - 4).toFixed(1)}"/>`,
        }),
  };
}

function panel(
  frame: ChartFrame,
  step: StepId,
  col: number,
  rowIndex: number,
): string {
  const { xMin, xMax, xTicks } = frame;
  const rows = frame.rows.filter((r) => r.step === step);
  const ox = LEFT + col * (PANEL_W + GAP_X);
  const oy = TOP + rowIndex * (PANEL_H + GAP_Y);
  const pw = PANEL_W - PLOT.left - PLOT.right;
  const ph = PANEL_H - PLOT.top - PLOT.bottom;
  const n = Math.max(
    1,
    ...rows.filter((r) => r.status !== 'stopped').map((r) => Number(r.cases_n)),
  );
  const x = (s: number) =>
    ox +
    PLOT.left +
    ((Math.log(s) - Math.log(xMin)) / (Math.log(xMax) - Math.log(xMin))) * pw;
  const y = (k: number) => oy + PLOT.top + ph - (k / n) * ph;
  const stoppedY = oy + PLOT.top + ph + 44;
  const out: Array<string> = [];

  out.push(
    `<text class="panel-title" x="${ox}" y="${oy + 12}">${STEP_TITLE[step]}</text>`,
  );
  out.push(
    `<text class="muted" x="${ox + PANEL_W - PLOT.right}" y="${oy + 12}" text-anchor="end">${rows.length} configurations · ${n} cases</text>`,
  );

  const step5 = n <= 8 ? 2 : n <= 16 ? 4 : n <= 30 ? 5 : 10;
  for (let k = 0; k <= n; k += step5) {
    out.push(
      `<line class="grid" x1="${ox + PLOT.left}" x2="${ox + PLOT.left + pw}" y1="${y(k).toFixed(1)}" y2="${y(k).toFixed(1)}"/>`,
    );
    out.push(
      `<text class="tick" x="${ox + PLOT.left - 6}" y="${(y(k) + 3.5).toFixed(1)}" text-anchor="end">${k}</text>`,
    );
  }
  if (n % step5 !== 0) {
    out.push(
      `<line class="grid" x1="${ox + PLOT.left}" x2="${ox + PLOT.left + pw}" y1="${y(n).toFixed(1)}" y2="${y(n).toFixed(1)}"/>`,
    );
    out.push(
      `<text class="tick" x="${ox + PLOT.left - 6}" y="${(y(n) + 3.5).toFixed(1)}" text-anchor="end">${n}</text>`,
    );
  }
  for (const t of xTicks) {
    out.push(
      `<text class="tick" x="${x(t).toFixed(1)}" y="${oy + PLOT.top + ph + 15}" text-anchor="middle">${t}</text>`,
    );
  }
  out.push(
    `<line class="axis" x1="${ox + PLOT.left}" x2="${ox + PLOT.left + pw}" y1="${y(0)}" y2="${y(0)}"/>`,
  );

  const dots: Array<Dot> = [];
  const sorted = [...rows].sort(
    (a, b) => Number(a.is_chosen === 'yes') - Number(b.is_chosen === 'yes'),
  );
  for (const row of sorted) {
    const med = num(row.median_ms);
    if (med === null || med <= 0) continue;
    const stopped = row.status === 'stopped';
    const px = x(med / 1000);
    let py = stopped ? stoppedY : y(Number(row.cases_all_pass_k));
    for (
      let tries = 0;
      tries < 8 &&
      dots.some((d) => Math.abs(d.px - px) < 9 && Math.abs(d.py - py) < 9);
      tries++
    ) {
      py += tries % 2 === 0 ? -(5 + tries * 2) : 5 + tries * 2;
    }
    dots.push({ row, px, py, stopped });
  }
  const taken: Array<Box> = dots.map((d) => ({
    x0: d.px - 9,
    x1: d.px + (Number(d.row.costly_errors) > 0 ? 13 : 9),
    y0: d.py - (Number(d.row.costly_errors) > 0 ? 14 : 9),
    y1: d.py + 9,
  }));
  const inPanel = (box: Box): boolean =>
    box.x0 >= ox + PLOT.left &&
    box.x1 <= ox + PANEL_W &&
    box.y0 >= oy + 16 &&
    box.y1 <= stoppedY + 12;

  const f = frame.floors[step];
  const floorText = `floor ${f.k}: ${f.name}`;
  const floorLabel = clearest(
    [
      refLabel(ox + PLOT.left + pw, y(f.k) - 4, floorText, 'end'),
      refLabel(ox + PLOT.left + 4, y(f.k) - 4, floorText, 'start'),
      ...(f.k > 0
        ? [refLabel(ox + PLOT.left + pw, y(f.k) + 12, floorText, 'end')]
        : []),
    ],
    taken,
  );
  out.push(
    `<line class="ref" x1="${ox + PLOT.left}" x2="${ox + PLOT.left + pw}" y1="${y(f.k).toFixed(1)}" y2="${y(f.k).toFixed(1)}"/>`,
    floorLabel.svg,
  );
  taken.push(floorLabel.box);

  const ceiling = CEILING_MS[step] / 1000;
  if (ceiling >= xMin && ceiling <= xMax) {
    const ceilingText = `ceiling ${ceiling} s`;
    const ceilingLabel = clearest(
      [
        refLabel(x(ceiling) + 4, y(0) - 6, ceilingText, 'start'),
        refLabel(x(ceiling) + 4, oy + PLOT.top + 11, ceilingText, 'start'),
        refLabel(x(ceiling) - 4, y(0) - 6, ceilingText, 'end'),
        refLabel(x(ceiling) - 4, oy + PLOT.top + 11, ceilingText, 'end'),
        refLabel(x(ceiling) + 4, oy + PLOT.top + ph / 2, ceilingText, 'start'),
      ],
      taken,
    );
    out.push(
      `<line class="ref" x1="${x(ceiling).toFixed(1)}" x2="${x(ceiling).toFixed(1)}" y1="${oy + PLOT.top}" y2="${y(0)}"/>`,
      ceilingLabel.svg,
    );
    taken.push(ceilingLabel.box);
  }

  if (rows.some((r) => r.status === 'stopped')) {
    out.push(
      `<text class="ref-label" x="${ox + PLOT.left - 6}" y="${stoppedY + 3.5}" text-anchor="end">stopped</text>`,
    );
    out.push(
      `<line class="grid" x1="${ox + PLOT.left}" x2="${ox + PLOT.left + pw}" y1="${stoppedY}" y2="${stoppedY}"/>`,
    );
  }

  const leaders: Array<string> = [];
  const labels: Array<string> = [];
  for (const d of [...dots].reverse()) {
    const tags = [
      d.row.is_start === 'yes' ? 'start' : '',
      d.row.is_chosen === 'yes' ? 'chosen' : '',
    ]
      .filter(Boolean)
      .join(' = ');
    if (!tags) continue;
    const text = `${tags}: ${d.stopped ? 'stopped' : `${d.row.cases_all_pass_k} of ${d.row.cases_n}`}`;
    const candidates = LABEL_OFFSETS.map(([dx, dy]) =>
      directLabel(d, dx, dy, text),
    ).filter((c) => inPanel(c.box));
    const label = clearest(
      candidates.length ? candidates : [directLabel(d, 18, 0, text)],
      taken,
    );
    if (label.leader) leaders.push(label.leader);
    labels.push(label.svg);
    taken.push(label.box);
  }
  out.push(...leaders);

  for (const { row: r, px, py, stopped } of dots) {
    if (!isSizeKey(r.size)) continue;
    const size = SIZE[r.size];
    const hollow = r.thinking === 'on';
    const lo = num(r.min_ms);
    const hi = num(r.max_ms);
    const parts: Array<string> = [];
    if (lo && hi && !stopped) {
      parts.push(
        `<line class="whisker" x1="${x(Math.max(lo / 1000, xMin)).toFixed(1)}" x2="${x(Math.min(hi / 1000, xMax)).toFixed(1)}" y1="${py.toFixed(1)}" y2="${py.toFixed(1)}"/>`,
      );
    }
    if (r.is_chosen === 'yes')
      parts.push(
        `<circle class="chosen-ring" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="11"/>`,
      );
    parts.push(
      marker(
        size.shape,
        px,
        py,
        5,
        `${hollow ? 'hollow' : 'solid'} s-${r.size}`,
      ),
    );
    if (r.forced_format === 'off') {
      parts.push(
        `<line class="slash" x1="${(px - 6).toFixed(1)}" y1="${(py + 6).toFixed(1)}" x2="${(px + 6).toFixed(1)}" y2="${(py - 6).toFixed(1)}"/>`,
      );
    }
    if (Number(r.costly_errors) > 0) {
      parts.push(
        `<path class="cross" d="M${(px + 5).toFixed(1)} ${(py - 12).toFixed(1)} l6 6 m0 -6 l-6 6"/>`,
      );
    }
    const tip =
      `${STEP_TITLE[step]} — ${size.label}, thinking ${r.thinking}, forced format ${r.forced_format}, temperature ${r.temperature}, ${r.prompt} prompt` +
      (/"presence_penalty":0[,}]/.test(r.sampling)
        ? ', no repetition penalty'
        : '') +
      `\n${stopped ? `stopped after ${r.timed_calls} calls: far over the speed ceiling` : `${r.cases_all_pass_k} of ${r.cases_n} cases passed`}` +
      `\ncostly errors ${r.costly_errors}, fallbacks ${r.fallbacks}, unusable replies ${Number(r.truncated) + Number(r.schema_invalid)}` +
      `\nmedian ${r.median_ms} ms (range ${r.min_ms}–${r.max_ms}), ${r.timed_calls} calls`;
    parts.push(
      `<circle class="hit" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="13"><title>${esc(tip)}</title></circle>`,
    );
    out.push(`<g>${parts.join('')}</g>`);
  }
  out.push(...labels);
  out.push(
    `<text class="muted" x="${ox + PLOT.left + pw / 2}" y="${oy + PLOT.top + ph + 31}" text-anchor="middle">median model call time, seconds (log scale)</text>`,
  );
  return out.join('\n');
}

function legend(): string {
  const ox = LEFT + 2 * (PANEL_W + GAP_X) + 12;
  const oy = TOP + PANEL_H + GAP_Y + 6;
  const out: Array<string> = [
    `<text class="panel-title" x="${ox}" y="${oy + 6}">How to read it</text>`,
  ];
  let yy = oy + 32;
  const line = (draw: string, text: string) => {
    out.push(
      draw,
      `<text class="legend" x="${ox + 30}" y="${yy + 4}">${esc(text)}</text>`,
    );
    yy += 23;
  };
  for (const key of keysOf(SIZE)) {
    line(
      marker(SIZE[key].shape, ox + 10, yy, 5, `solid s-${key}`),
      `${SIZE[key].label} model`,
    );
  }
  line(
    marker('circle', ox + 10, yy, 5, 'hollow s-small'),
    'hollow: thinking on (filled: off)',
  );
  line(
    `${marker('circle', ox + 10, yy, 5, 'solid s-small')}<line class="slash" x1="${ox + 4}" y1="${yy + 6}" x2="${ox + 16}" y2="${yy - 6}"/>`,
    'slash: output format not forced',
  );
  line(
    `<path class="cross" d="M${ox + 7} ${yy - 3} l6 6 m0 -6 l-6 6"/>`,
    'cross: made a costly error',
  );
  line(
    `<circle class="chosen-ring" cx="${ox + 10}" cy="${yy}" r="9"/>${marker('square', ox + 10, yy, 4, 'solid s-medium')}`,
    'ring: the configuration chosen',
  );
  line(
    `<line class="whisker" x1="${ox}" x2="${ox + 20}" y1="${yy}" y2="${yy}"/>`,
    'thin line: fastest to slowest call',
  );
  line(
    `<line class="ref" x1="${ox}" x2="${ox + 20}" y1="${yy}" y2="${yy}"/>`,
    'grey lines: speed ceiling, and the floor',
  );
  out.push(
    `<text class="muted" x="${ox}" y="${yy + 10}">Up is more accurate. Left is faster.</text>`,
  );
  out.push(
    `<text class="muted" x="${ox}" y="${yy + 26}">Temperature and prompt wording are in</text>`,
  );
  out.push(
    `<text class="muted" x="${ox}" y="${yy + 41}">results.csv, not on the chart.</text>`,
  );
  return out.join('\n');
}

// [step, column, row]
const PANELS: Array<[StepId, number, number]> = [
  ['selector', 0, 0],
  ['followup', 1, 0],
  ['coverage', 2, 0],
  ['revision', 0, 1],
  ['verifier', 1, 1],
];

const CSS = `
  .viz { --surface:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781; --grid:#e1e0d9; --axis:#c3c2b7;
         --small:${SIZE.small.light}; --medium:${SIZE.medium.light}; --large:${SIZE.large.light}; }
  @media (prefers-color-scheme: dark) {
    .viz { --surface:#1a1a19; --ink:#f0efec; --ink2:#c3c2b7; --muted:#898781; --grid:#2c2c2a; --axis:#383835;
           --small:${SIZE.small.dark}; --medium:${SIZE.medium.dark}; --large:${SIZE.large.dark}; }
  }
  text { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; fill: var(--ink2); font-size: 11px; }
  .title { font-size: 17px; font-weight: 700; fill: var(--ink); }
  .subtitle { font-size: 12px; }
  .panel-title { font-size: 13px; font-weight: 700; fill: var(--ink); }
  .muted, .tick, .ref-label { fill: var(--muted); font-size: 10.5px; }
  .tick { font-variant-numeric: tabular-nums; }
  .legend { fill: var(--ink2); font-size: 11.5px; }
  .direct { fill: var(--ink); font-size: 11px; font-weight: 600; paint-order: stroke; stroke: var(--surface); stroke-width: 3px; }
  .grid { stroke: var(--grid); stroke-width: 1; }
  .axis { stroke: var(--axis); stroke-width: 1; }
  .ref { stroke: var(--axis); stroke-width: 1; }
  .whisker { stroke: var(--muted); stroke-width: 1; opacity: 0.55; }
  .leader { stroke: var(--ink2); stroke-width: 0.75; }
  .solid { stroke: var(--surface); stroke-width: 2; }
  .hollow { fill: var(--surface); stroke-width: 2; }
  .solid.s-small { fill: var(--small); } .solid.s-medium { fill: var(--medium); } .solid.s-large { fill: var(--large); }
  .hollow.s-small { stroke: var(--small); } .hollow.s-medium { stroke: var(--medium); } .hollow.s-large { stroke: var(--large); }
  .slash, .cross { stroke: var(--ink); stroke-width: 1.5; fill: none; stroke-linecap: round; }
  .chosen-ring { fill: none; stroke: var(--ink); stroke-width: 1.5; }
  .hit { fill: transparent; }
`;

/** `rows` are one provider's screening rows, so every dot is comparable. */
export function sweepChartSvg(
  rows: Array<CsvRow>,
  floors: Record<StepId, Floor>,
): string {
  const seconds = rows
    .flatMap((r) => [num(r.median_ms), num(r.min_ms), num(r.max_ms)])
    .filter((v): v is number => v !== null && v > 0);
  const xMin = Math.min(0.2, Math.min(...seconds) / 1000 / 1.3);
  const xMax = Math.max(30, (Math.max(...seconds) / 1000) * 1.3);
  const xTicks = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 60, 120, 300].filter(
    (t) => t >= xMin && t <= xMax,
  );
  const frame: ChartFrame = { rows, floors, xMin, xMax, xTicks };
  const sample = rows[0];

  return `<svg xmlns="http://www.w3.org/2000/svg" class="viz" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">Accuracy against model call time for each configuration of each AI step</title>
<desc id="d">Five scatter panels, one per AI step. Each dot is one configuration. Across: median model call time in seconds on a log scale. Up: tuning cases passed. Every value is also in evals/sweep/results.csv.</desc>
<style>${CSS}</style>
<rect width="${W}" height="${H}" fill="var(--surface)"/>
<text class="title" x="${LEFT}" y="34">Accuracy against response time: one dot per configuration</text>
<text class="subtitle" x="${LEFT}" y="56">Each AI step measured on its own tuning cases, one run per case. Up: cases passed. Across: median time for one model call.</text>
<text class="muted" x="${LEFT}" y="74">Local Ollama models, ${esc(sample?.date_utc ?? '')}, Ollama ${esc(sample?.ollama_version ?? '')}, power mode: ${esc(sample?.power_mode ?? '')}. Dots that would coincide are nudged apart. Hover a dot for its settings; every value is in results.csv.</text>
${PANELS.map(([step, col, row]) => panel(frame, step, col, row)).join('\n')}
${legend()}
</svg>
`;
}
