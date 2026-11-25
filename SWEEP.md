# Choosing the settings by measurement

The app calls a language model in five places. This reports a comparison of their settings, how
the final ones were picked, where the weaker ones fail, and how far it can be trusted.

**The short version.**

- **55 configurations of 540 possible** were run, each on its step's tuning cases **once** (787
  model calls). This is a comparison of what ran, not a complete one.
- The rule written beforehand ([`evals/sweep/RULE.md`](evals/sweep/RULE.md)) picked a different
  configuration from the starting one for every step: the medium model where the trainee waits, and
  the small one with thinking on for the support check.
- The clearest findings are what **not** to use. Thinking makes the spoken steps 10 to 100 times
  too slow. With thinking off, every support check accepted a quotation it should have refused.
  The small model cannot judge what an answer covered.
- **On held-back cases one gain held:** no wrong quotation reached the trainee. The rest was within
  a case or two, and the one improvement prevented nothing.

| Count of runs, through the app's own code | Starting | Chosen | Chosen + improvement |
|---|---|---|---|
| Tuning: a quotation shown that does not back the advice | 5 of 24 | 1 of 24 | 0 of 24, then 1 of 24 |
| **Held-back: the same** | **2 of 18** | **0 of 18** | **0 of 18** |
| Held-back: right outcome end to end | 14 of 18 | 14 of 18 | 12 of 18 |
| Tuning: support check alone accepting what it should refuse | 6 of 30 | 0 of 30 | the same |

![Accuracy against model call time, one dot per configuration](evals/sweep/chart-ollama.svg)

One dot per configuration: up is more tuning cases passed, left is faster. Grey lines mark the
step's speed limit and the score of a step that ignores its input. Values:
[`evals/sweep/results.csv`](evals/sweep/results.csv); full tables, with a real failing output for
every configuration: [`evals/sweep/RESULTS.md`](evals/sweep/RESULTS.md).

## What was compared

A **configuration** is one step with one value for each setting:

| Setting | Values |
|---|---|
| Model size | `qwen3.5` 4b (small), 9b (medium), 27b (large): one family, so only size changes |
| Temperature | 0, 0.7, 1.0 |
| Thinking | off, on |
| Forced output format | on (Ollama enforces the JSON schema), off (asked for in words) |
| Prompt wording | minimal; explicit rules; worked examples from an invented case |

Each step was measured **separately** on fixed inputs (the support check always sees the same
pairs). The app was built first on a starting configuration (medium, thinking off, format forced,
temperature 0.7, minimal prompt).

**What ran:** the small model with thinking and format both ways; the medium model with thinking
off and format both ways, then one change at a time from the start (two other prompts,
temperature 0, thinking on for three steps); the large model once per step. The planned ~130
configurations with three-run confirmation were cut on the morning of 24 November, because the run
drew about twice what the laptop's 55 W charger supplies.

## How it was measured

- **Cases** with expected answers in `evals/cases/`, each labelled `tune` or `holdout` by a hash of
  its id when written. Tuning cases choose; held-back cases only report.
- **A case passes only if it passes every run.** 20 cases run three times is 20, never 60.
- **Costly errors are counted apart:** revealing a finding not asked for, hiding a gap, quoting a
  different condition, accepting a quotation that does not back the advice.
- **Time** is wall-clock per model call, one at a time, warm-up left out.
- **Before any model ran,** every expected answer passed its own grader, and a step that ignores
  its input was scored (the floor on the chart). Every setting was shown to take effect on each
  model (`evals/sweep/preflight.json`); temperature 0 with a fixed seed gave identical replies for
  10 of 10 requests.
- **Machine state is in every row.** All calls were in High Power mode. A reference call repeated
  through the run drifted 12%, so times within a tenth are treated as equal.
- **Re-derivable:** `evals/results/sweep-ollama.jsonl` holds every call and reply; the CSV, chart
  and choice are generated from it (`pnpm sweep:report`, `pnpm sweep:chart`).

**The rule:** drop anything over the step's speed limit or with a costly error; then most cases
passed; within a case or two, the simpler and faster; at most two models in the app. The record of
the choice and its one departure is [`evals/sweep/DECISION.md`](evals/sweep/DECISION.md).

## What was chosen

Tuning cases, one run each.

| Step | Chosen | Chosen: passed, costly, middle time | Start |
|---|---|---|---|
| Menu-picker | Medium, format **not** forced | 54 of 56, 0, 428 ms | 53 of 56, 1, 449 ms |
| Follow-up writer | Medium, **examples** prompt | 5 of 5, 0, 700 ms | 3 of 5, 0, 741 ms |
| Coverage judge | Medium, temperature **0** | 6 of 7, 0, 2,522 ms | 6 of 7, 0, 3,048 ms |
| Revision step | **Small**, format not forced | 4 of 8, 1, 452 ms | 5 of 8, 2, 1,342 ms |
| Support check | **Small**, thinking **on**, temperature 1 | 9 of 10, 0, 8,413 ms | 8 of 10, 2, 617 ms |

No revision-step configuration was free of costly errors, so the rule's fallback picked the small
model. Case by case, **no chosen configuration is statistically distinguishable from the start**
on sets this small run once: the choice is a rule followed, not a difference proven.

## What each setting did

Each quote is a real saved reply.

- **Thinking: too slow for anything the trainee waits for.** The menu-picker (2 s limit) took 6 to
  25 s; the follow-up writer hit its 60 s cut-off and returned `---`. **It earned its wait only on
  the support check.** With thinking off, every size accepted a page 8 sentence about a different
  condition as support for the allergy advice. The large model: "The passage explicitly advises
  avoiding acetazolamide because it is a sulfonamide, implying that patients with sulfonamide
  allergies should not receive it." With thinking on, small and medium refused it.
- **Model size.** Small cannot judge coverage: 3 of 7, against 6 of 7 medium and 7 of 7 large. It
  marked "This is acute angle closure in the right eye" as not covering the diagnosis
  (`cov-multi-gap`). Asked for blood glucose, the small menu-picker returned `{"item": "Blood
  pressure"}`. Large bought one case here and there at five times the wait.
- **Forced format matters for the small model.** Unforced, its support check returned 7 unusable
  replies in 10 (`{reason: The passage explicitly states…, verdict: "supported"}`, not JSON).
- **Temperature 0** changed no count by more than one case. Its value is repeatability. At 0 the
  follow-up writer passed the word check by copying the case file's questions word for word.
- **Prompt wording.** Worked examples helped the follow-up writer most (5 of 5, none copied,
  against 3 of 5, all copied). No wording fixed the revision step.
- **The revision step fails the same way on every size:** with the supporting passage removed it
  quotes page 8 ("Avoid acetazolamide, which is itself a sulfonamide.") instead of saying "no
  support", and its own sentences often use words the note does not, so a fallback is shown.

## The same settings, three runs each

`pnpm check` on the starting, all-small and chosen settings, tuning cases, three runs. Reports:
[`start.md`](evals/checks/start.md), [`small.md`](evals/checks/small.md),
[`chosen.md`](evals/checks/chosen.md). Cases passing every run; "costly" counts runs.

| | Start | All small | Chosen |
|---|---|---|---|
| Checks 1 and 2 (and leftover text) | 10, 10, 10 of 10 | 10, 10, 10 of 10 | 10, 10, 10 of 10 |
| Something not in the case | 2 of 10 | 0 of 10 | 3 of 10 |
| Check 3: citation backs the point | 4 of 5 | 5 of 5 | 5 of 5 |
| "No support", passages removed | 1 of 3 | 0 of 3 | 1 of 3 |
| "No support", point not in the note | 3 of 3 | 3 of 3 | 3 of 3 |
| Menu-picker, 56 | 53, 2 costly | 53, 5 costly | 53, 3 costly |
| Follow-up writer, 5 | 2 | 3 | 4 |
| Coverage judge, 7 | 5 | 1 | 6 |
| Revision step alone, 8 | 4, 6 costly | 4, 3 costly | 4, 3 costly |
| Support check alone, 10 | 8, 6 costly | 9, 3 costly | **10, 0 costly** |
| Revision + support check, 8 | 4, 5 costly | 5, 3 costly | 5, **1 costly** |

The support check's gain holds over three runs, and end to end a wrong quotation fell from 5 runs
in 24 to 1. The menu-picker's clean sweep run was luck: over three runs it reveals urea and
electrolytes for blood glucose every time. Cut-off runs count as failures.

**One run is not a measurement above temperature 0.** Repeating the same slice
([`evals/repeatability/`](evals/repeatability/README.md)), the menu-picker gave identical replies 20
of 20 and the follow-up writer at 0.7 only **2 of 20**; it scored 3, 4, 3 and 5 of 5 on four runs.
Its settings cannot be told apart on this evidence.

## The held-back cases, opened once

About two in five cases per step, set aside when written and run once at 15:25 GMT on 24 November,
after the settings and the improvement were frozen. Reports:
[`holdout-start.md`](evals/checks/holdout-start.md),
[`holdout-chosen.md`](evals/checks/holdout-chosen.md),
[`holdout-improved.md`](evals/checks/holdout-improved.md).

| | Start | Chosen |
|---|---|---|
| Menu-picker, 16 | 13, 4 costly | 12, 2 costly, 3 unusable |
| Follow-up writer, 3 | 2 | 3 |
| Coverage judge, 5 | 4 | 5 |
| Revision step alone, 6 | 4, 2 costly | **2, 4 costly** |
| Support check alone, 6 | 6, 0 costly | 6, 0 costly |
| Revision + support check, 6 | 4, **2 costly** | 4, **0 costly**, 1 cut off |

- **The gain the choice was made for held:** wrong quotations end to end, 2 of 18 to 0 of 18. The
  small revision step quoted something for a removed passage 4 times; the support check refused
  all four.
- **The small revision step is worse alone** (2 of 6 against 4 of 6). It was picked on a one-run
  tie for speed; the next step catches its mistakes.
- **The menu-picker is no better.** With its format unforced, "Tell me everything you've got" ran
  out of room in 3 of 3.
- The rest is within a case.

**The improvement** (a second support check against the key point) was 3 of 6 cases with it
against 4 of 6 without, none fixed and one broken. Details, and why it is still switched on:
[`HANDOVER.md`](HANDOVER.md#the-improvement).

## What was not run, and what this cannot tell us

**Not run:** 485 of the 540 configurations; thinking on for the large model, and for the medium
coverage and revision steps; other prompts and temperature 0 on the small and large models;
temperature 1.0 with thinking off and 0 or 0.7 with it on; the repetition-penalty probes; three-run
confirmation inside the sweep; any Claude model (the adapter is written, not run).

**Limits:**
- Tens of cases per step: most neighbouring differences are not distinguishable.
- The expected answers were written with an AI assistant and have not been read by a clinician
  ([`evals/cases/REVIEW.md`](evals/cases/REVIEW.md)), nor the blind follow-up read scored
  (`evals/sweep/followup-read.md`). Every count measures agreement with that one reading.
- One Mac, one model family. Not a complete grid. Steps were measured apart, so the revision step
  and support check were also run together.
- The rule was written after the first run of the three required checks on the starting
  settings, and its tie-break was amended once, early, with the reason recorded (`RULE.md`,
  `NOTES.md`).
