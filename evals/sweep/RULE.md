# How the settings are chosen

Written and committed before the sweep is run, so that the choice cannot be fitted to the
results afterwards. The same rule is applied by code in `src/eval/rule.ts`; `pnpm sweep:report`
re-applies it to the recorded results and must arrive at what `config/steps.json` holds.

## What is being chosen

Five AI steps each need settings: which size of model, the temperature, whether thinking is on,
whether the output format is forced, and which of three prompt wordings is used. Each step is
chosen separately, on its own set of cases.

## What is measured for each configuration

- **Cases passed.** n is the number of cases. k is the number that passed on **every** run.
  Twenty cases run three times is reported as 20, never 60.
- **Costly errors.** The kind of mistake that matters most for the step, counted separately:

  | Step | Costly error |
  |---|---|
  | Menu-picker (`selector`) | Revealing a finding that was not asked for, or the other eye |
  | Follow-up writer (`followup`) | Giving away the diagnosis or a key point, or passing a verdict (read by a person) |
  | Coverage judge (`coverage`) | Marking a point the answer missed as covered |
  | Revision step (`revision`) | Quoting a passage about a different condition, or quoting anything when the note does not back the point |
  | Support check (`verifier`) | Accepting a quotation that does not back the advice |

- **Model call time.** The median time for one call on this machine, with its range.

## The rule

Applied per step, to the confirmation runs (three runs per case) on the tuning cases.

1. **Eligible** means no costly error on any run, and a median model call time under the
   ceiling for the step:

   | Step | Ceiling | Why |
   |---|---|---|
   | Menu-picker | 2 seconds | The trainee has just spoken and is waiting to hear the examiner |
   | Follow-up writer | 5 seconds | The trainee has just answered and is waiting to hear the question |
   | Coverage judge, revision step, support check | 15 seconds each | They run after the viva; nobody is waiting on audio |

   If no configuration is eligible, the one with the fewest costly errors is used and the
   write-up says so.

2. **Most cases passing on every run.** Configurations within one case of the best, or within
   5% of the cases if that is larger, count as tied. The case sets are too small to separate
   them honestly.

3. **Ties go to the simpler configuration**, in this order: faster; smaller model; thinking
   off; forced format on; temperature 0; the minimal prompt.

4. **At most two models across the five steps**, so the app fits in memory and there is less
   to download. If the per-step winners need three, the step on the least-used model takes its
   best configuration on one of the other two.

The ceilings in rule 1 are judgement calls. They are fixed here, before any result has been seen.

## Which cases decide and which only report

Every case was labelled `tune` or `holdout` when it was written. The rule above sees only the
`tune` cases. The `holdout` cases are opened once, after `evals/sweep/DECISION.md` has been
committed and the improvement has been frozen, and are used only to report. Nothing is re-chosen
after they are opened, whatever they show.

The 32 plainly worded requests generated from the case file, and the brief's three required
checks, use fixed inputs. They are labelled "not held back".

## What counts as a real difference

The write-up says one configuration is better than another only when at least six cases differ
between them and all six differ the same way. Otherwise it says "not distinguishable on this
set" and names the tie-break that decided.

## Follow-up questions

For the follow-up writer the automatic pass (a model-written question that survives the word
check) is necessary, not sufficient. Luke reads the questions produced by the three confirmed
configurations, blind to which produced them, and answers two yes-or-no questions for each: does
it respond to what the trainee said, and does it give anything away. A configuration with any
give-away is not eligible.

## If the rule is overridden

Any departure from this rule is written in `DECISION.md` with its reason.
