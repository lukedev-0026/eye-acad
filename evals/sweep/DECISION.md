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

## The improvement, chosen and frozen

Added on 24 November 2026 at 13:20 UTC, **before the held-back cases were opened**. The tag
`improvement-frozen` marks the point.

**Where it goes.** The written order is: most costly errors, then most failed cases, then most
fallbacks, then the slowest stage of a spoken turn. On three runs per tuning case under the
settings above (`CHECKS.md`, run `check-2026-11-24T12-34-37`):

| Step | Runs with a costly error | Cases that did not pass every run | Fallbacks |
|---|---|---|---|
| Menu-picker | 3 of 168 | 3 of 56 | 0 |
| Follow-up writer | 0 of 15 | 1 of 5 | 2 |
| Coverage judge | 0 of 7 | 1 of 7 | 0 |
| Revision step, alone | 3 of 24 | 4 of 8 | 7 |
| Support check, alone | 0 of 30 | 0 of 10 | 0 |
| Revision step and support check together | 1 of 24 | 3 of 8 | 2 |

The menu-picker and the revision step tie on the first test: each made the same costly error on
one case in all three runs. The second test separates them: the revision step failed 4 of its 8
cases, the menu-picker 3 of 56. So the improvement goes to the revision step, which is also what
the one-run sweep pointed to. The menu-picker's fault is real and is not fixed; it is first on the
list in `HANDOVER.md`.

**What it is.** The revision step's costly error always has the same shape. With the supporting
passage out of reach, it quotes a sentence from another condition's section ("Avoid acetazolamide,
which is itself a sulfonamide.", p. 8) and rewrites the advice to fit, sometimes into the
quotation's own words. The support check is then asked whether the quotation backs advice that
was written to match it, and agrees. It never sees the key point the trainee actually missed.

The change (`check-against-key-point`, switched on for the support check in the settings file):
when the revision step has written its own sentence, the support check is asked a second
question, about the same quotation and the **original key point**. If the answer is no, the
trainee is told no support was found. No prompt and no other setting is changed.

**What it costs.** One more support-check call, about ten seconds with thinking on, whenever the
model's own sentence is used. It runs after the conversation is over. It is also one more call
that can run out of time, in which case the trainee is asked to try again.

**What the tuning cases show**, three runs per case (`check-2026-11-24T12-34-37` without it,
`check-2026-11-24T12-49-46` with it):

| | Without | With |
|---|---|---|
| End to end: runs that showed a quotation that does not back the advice | 1 of 24 | 0 of 24 |
| "No support" check with the passages removed: the same | 2 of 3 | 0 of 3 |
| End to end: cases passing every run, counting a cut-off run as a failure | 5 of 8 | 5 of 8 |
| Runs where a step was cut off and the trainee is asked to try again | 2 of 24 | 2 of 24 |
| Cases that passed without it and failed with it | | 0 |

**That table does not prove the change is the cause.** The saved traces show the new check ran
four times in the end-to-end runs, each time on a correct quotation, and agreed each time. The
runs it exists for did not come up again: in this run the first support check happened to refuse
them itself. With a model that varies from run to run, three wrong quotations in 27 runs against
none in 27 is within what chance alone could do.

What does show it works is narrower:

- With a stand-in for the model that reproduces the fault exactly, the quotation is shown without
  the change and refused with it (`tests/eval/checks/chain.check.test.ts`).
- The question it asks is close to one the support check has been measured on. Given the
  statement "Check for sulfonamide allergy before giving acetazolamide." and that page 8 sentence
  as a fixed pair, it refused in 3 runs of 3 on these settings (`ver-context-avoid-acetazolamide`).

**The decision.** The app runs with it switched on. `config/steps.json` is the rule's choice plus
this one switch; `config/steps.chosen.json` is the rule's choice alone. The reason is the kind of
error: showing a trainee a quotation that does not back the advice is the worst thing this panel
can do, and the price is a longer wait after the viva has ended. This is decided here, on the
tuning cases. The held-back cases report on it and do not change it.

## What happens next

The held-back cases are opened once, for three runs in one sitting: the starting settings
(`config/steps.start.json`), the chosen settings (`config/steps.chosen.json`), and the chosen
settings with the improvement (`config/steps.improved.json`, the same as the app's own file).
Nothing is re-chosen afterwards, whatever they show.

## What the held-back cases showed

Added on 24 November 2026 at 15:55 UTC, after they were opened (15:25 to 15:43 UTC, tag
`held-back-opened`). Nothing above this heading was changed afterwards.

One pointer above has moved: the report of run `check-2026-11-24T12-34-37`, called `CHECKS.md`
when that section was written, is now `evals/checks/chosen.md`. `CHECKS.md` is now the report
for the settings the app ships with.

Cases passing every run, three runs per case. "Costly" is a count of runs.

| | Start | Chosen | Chosen with the improvement |
|---|---|---|---|
| Menu-picker, 16 cases | 13, 4 costly | 12, 2 costly, 3 unusable replies | the same settings |
| Follow-up writer, 3 cases | 2 | 3 | the same settings |
| Coverage judge, 5 cases | 4 | 5 | the same settings |
| Revision step alone, 6 cases | 4, 2 costly | 2, 4 costly | the same settings |
| Support check alone, 6 cases | 6, 0 costly | 6, 0 costly | the same settings |
| Revision step and support check together, 6 cases | 4, 2 costly | 4, 0 costly | 3, 0 costly |

**The settings.** The gain the choice was made for held: a quotation that does not back the
advice was shown in 2 of 18 runs on the starting settings and in none of 18 on the chosen ones.
Nothing else did. The revision step alone was worse on the chosen settings, and the menu-picker
no better.

**The improvement.** It fixed no case and broke one. Its second check was asked five times, every
time about a correct quotation: it agreed twice, refused twice and was cut off once. Without it,
no wrong quotation had reached the trainee, so there was nothing for it to catch.

**What is done about that.** Nothing. The decision above stands as it was written, because it was
committed to before these cases were opened and they are not there to change it. If the decision
were being made again on this evidence, the switch would be off. `SWEEP.md` and `HANDOVER.md` say
so, and `config/steps.chosen.json` is the settings file without it.

## A later run on the tuning cases

Added on 24 November 2026 at 18:55 UTC. A second run of the shipped settings on the tuning cases
(`check-2026-11-24T17-35-09`, made with the laptop asleep for most of it) showed a quotation that
does not back the advice in 1 of 24 end-to-end runs, where the first run had shown none. The
second check was not asked in that run, because the revision step had kept the key point's own
wording. Nothing is re-chosen on this either. `SWEEP.md` has the detail.
