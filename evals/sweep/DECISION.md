# The settings the app runs on

Decided on 24 November 2026 at 10:36 UTC, from `evals/results/sweep-ollama.jsonl` (787 model
calls, 55 configurations). The rule in [RULE.md](RULE.md) was applied by `pnpm sweep:report`,
which wrote the result to `config/steps.json`. The full table is in [RESULTS.md](RESULTS.md) and
`results.csv`; the chart is `chart-ollama.svg`.

## The choice

"Start" is the configuration the app was built on: the medium model, thinking off, format forced,
temperature 0.7, the minimal prompt. Counts are tuning cases passed out of cases run, once each.

| Step | Chosen | Chosen: passed, costly errors, middle time | Start: passed, costly errors, middle time |
|---|---|---|---|
| Menu-picker | Medium model, thinking off, format **not** forced, temperature 0.7, minimal prompt | 54 of 56, 0 costly, 428 ms | 53 of 56, 1 costly, 449 ms |
| Follow-up writer | Medium model, thinking off, format forced, temperature 0.7, **examples** prompt | 5 of 5, 0 costly, 700 ms | 3 of 5, 0 costly (2 fallbacks), 741 ms |
| Coverage judge | Medium model, thinking off, format forced, temperature **0**, minimal prompt | 6 of 7, 0 costly, 2,522 ms | 6 of 7, 0 costly, 3,048 ms |
| Revision step | **Small** model, thinking off, format **not** forced, temperature 0.7, minimal prompt | 4 of 8, 1 costly, 3 fallbacks, 452 ms | 5 of 8, 2 costly, 1 fallback, 1,342 ms |
| Support check | **Small** model, thinking **on**, format **not** forced, temperature 1, minimal prompt | 9 of 10, 0 costly, 8,413 ms | 8 of 10, 2 costly, 617 ms |

Two models are used, the medium (`qwen3.5:9b`) and the small (`qwen3.5:4b`), which is the limit
the rule sets.

## Where this departs from the plan

**The rule was applied to one run per case, not three.** The plan was to screen every
configuration once and then run the best three per step three times. The sweep was shortened on
24 November because it was draining the battery, so the confirmation runs were never made. A gap
of a case or two between configurations is therefore within noise. This is a rough best, not a
proven one, and the write-up says so.

**No configuration of the revision step was eligible.** Every one made at least one costly error
(quoting a passage about a different condition, or quoting the note for a point it does not back).
The rule's fallback was used: the fewest costly errors, then the tie-breaks. That chose the small
model with 4 of 8, over the medium model with the examples prompt at 5 of 8, because both made one
costly error, one case apart counts as tied, and the small one is faster. The revision step is
the weakest measured area, so it is where the one improvement goes.

Nothing else was overridden. `pnpm sweep:report` prints the same five configurations that
`config/steps.json` holds.

## What was close

- **Coverage judge.** The rules prompt on the medium model, and the large model, both passed 7 of
  7. One case is inside the tie band, so the faster configuration won. The large model took
  13.6 seconds a call against 2.5.
- **Support check.** With thinking on, the small model with the format forced, and the medium
  model, both passed 10 of 10 with no costly error, at 9.6 and 9.1 seconds. They are tied with the
  chosen one. With thinking off, every configuration accepted at least one quotation it should
  have rejected.
- **Menu-picker.** Forcing the format made no difference to the count on the medium model
  (53 against 54), but the forced configurations each revealed a finding that was not asked for.

## What was not run

- 55 configurations ran, of 540 in a full grid (108 for each of five steps). This is a comparison
  of what ran, not a complete grid.
- The large model ran once per step, with thinking off, format forced and the minimal prompt.
- Thinking on was tried on the small model for every step, and on the medium model for the
  support check only. Nine configurations were stopped early as far too slow, all with thinking on.
- The two probes of the repetition penalty and the optional third block were cut.
- No Claude model was run. That route is written and has never been run.

## What happens next

The held-back cases are still closed. The improvement is chosen by the written order (most costly
errors first, which on these numbers is the revision step), built from tuning-case failures, and
frozen in the project history. Only then are the held-back cases opened, once, for three runs:
the starting settings, these settings, and these settings with the improvement. Nothing is
re-chosen afterwards, whatever they show.
