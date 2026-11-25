export const PATHS = {
  casesDir: 'evals/cases',
  retrievalTargets: 'evals/cases/retrieval.json',
  requiredChecks: 'evals/required.json',
  casesReview: 'evals/cases/REVIEW.md',

  resultsDir: 'evals/results',

  preflight: 'evals/sweep/preflight.json',
  decision: 'evals/sweep/DECISION.md',
  resultsCsv: 'evals/sweep/results.csv',
  resultsMarkdown: 'evals/sweep/RESULTS.md',
  followUpSheet: 'evals/sweep/followup-read.md',
  followUpKey: 'evals/sweep/followup-read-key.json',

  checksMarkdown: 'CHECKS.md',
  retrievalTable: 'evals/retrieval-table.md',
  readback: 'evals/readback.md',
  voiceClipsDir: 'evals/voice-clips',

  stepsConfig: 'config/steps.json',
  chosenConfig: 'config/steps.chosen.json',
  startConfig: 'config/steps.start.json',
  smallConfig: 'config/steps.small.json',

  builtClient: 'dist/client',

  golden: 'tests/golden/golden.json',
  queryVectors: 'tests/golden/query-vectors.json',
} as const;

export const caseFile = (name: string): string => `${PATHS.casesDir}/${name}`;
export const resultsFile = (runId: string): string =>
  `${PATHS.resultsDir}/${runId}.jsonl`;
export const chartFile = (provider: string): string =>
  `evals/sweep/chart-${provider}.svg`;
