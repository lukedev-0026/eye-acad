# Choosing the settings by measurement

The app calls a language model in five places. Each can be set up in many ways. This document
reports a comparison of those settings, how the final ones were picked from it, where the
weaker ones fail, and how far the comparison can be trusted.

**The short version.**

- 55 configurations were run, of 540 in a complete grid. Each ran its step's tuning cases
  **once**. This is a comparison of what ran, and a rough best, not a proven one.
- The rule written down beforehand picked a different configuration from the starting one for
  every step. Two models are used: the medium one where the trainee is waiting, and the small one
  with thinking switched on for the one judgement that needed it.
- The clearest findings are about what **not** to use. Thinking makes the spoken steps 10 to 100
  times too slow. With thinking off, every support check accepted at least one quotation it
  should have rejected. The small model cannot judge what an answer covered.
- The revision step is the weakest part of the app under every setting tried. No configuration
  was free of costly errors. That is where the one improvement went.
- **On cases held back from all the choosing, one thing held and the rest did not.** With the
  chosen settings no wrong quotation reached the trainee there. (A later run on the tuning cases
  showed one in 24.) But the improvement prevented nothing
  and cost correct answers, and the chosen revision step and menu-picker were no better than
  the starting ones.
- One comparison is weaker than it looks: at temperature 0.7 the follow-up writer does not give
  the same answer twice, so its one-run scores cannot separate its settings.

**The numbers that matter most**, each a count of runs through the app's own code:

| | Starting settings | Chosen settings | Chosen, with the improvement |
|---|---|---|---|
| Tuning cases: a quotation shown that does not back the advice | 5 of 24 | 1 of 24 | 0 of 24, then 1 of 24 in a second run |
| **Held-back cases: the same** | **2 of 18** | **0 of 18** | **0 of 18** |
| Held-back cases: runs with the right outcome, end to end | 14 of 18 | 14 of 18 | 12 of 18 |
| Tuning cases: the support check alone accepting what it should refuse | 6 of 30 | 0 of 30 | the same settings |

The held-back cases were opened once, after everything had been chosen. They bear out one thing:
on the chosen settings no wrong quotation reached the trainee in those 18 runs. That is not the
same as never: a second run of the shipped settings on the tuning cases showed one in 24 (see
"The one improvement", below). They do not bear out the rest.
The chosen revision step is worse taken alone, the chosen menu-picker is no better, and the one
improvement prevented nothing and cost correct answers. Each is set out below.

![Accuracy against model call time, one dot per configuration](evals/sweep/chart-ollama.svg)

Every dot is one configuration. Up is more tuning cases passed; left is faster. The grey lines
are the speed limit for the step and the score of a step that ignores its input. Every value is
in [`evals/sweep/results.csv`](evals/sweep/results.csv); the full tables, with a real failing
output for every configuration, are in [`evals/sweep/RESULTS.md`](evals/sweep/RESULTS.md).

## What was compared

One **configuration** is one AI step with one value for each of five settings:

| Setting | Values |
|---|---|
| Model size | `qwen3.5` at 4b (small), 9b (medium) and 27b (large): one family, so that size is the only thing changing |
| Temperature | 0, 0.7 and 1.0 |
| Thinking | off, or on |
| Forced output format | on (Ollama enforces the JSON schema), or off (the prompt asks for it in words) |
| Prompt wording | minimal; with explicit rules; with worked examples from an invented case |

The five steps were measured **separately**, each on its own cases with its inputs fixed: the
support check always sees the same pairs, the revision step the same six retrieved passages. The
steps are stateless, so this is sound, and it is the only way the job is tractable.

The app was **built first on one starting configuration** (medium model, thinking off, forced
format on, temperature 0.7, minimal prompt) and the sweep was run afterwards. On the chart the
starting configuration is one labelled dot among the rest.

**What ran, of the 108 possible per step:**

| Model | What was run, for each step |
|---|---|
| Small | Thinking on and off, format forced and not forced |
| Medium | Thinking off, format forced and not forced. Then, one change at a time from the starting configuration: the two other prompt wordings, and temperature 0. Thinking on for the menu-picker, the follow-up writer and the support check |
| Large | Thinking off, format forced, once per step |

The plan was about 130 configurations with three-run confirmation of the best. It was cut on
the morning of 24 November: the run was drawing about twice what the laptop's 55 W charger
supplies, and took the battery from 100% to 16% while plugged in. `NOTES.md` has the times.

Checks with no language model in them (the sentence builder, the search comparison, the spoken
read-back, privacy, refresh) do not change with these settings and were run once.

## How it was measured

- **Cases.** Each step has a set of cases with expected answers (`evals/cases/`). Every case was
  labelled `tune` or `holdout` by a hash of its id when it was written. Tuning cases choose;
  held-back cases only report.
- **Counting.** n is the number of cases and k the number that passed on **every** run. Twenty
  cases run three times is 20, never 60. With sets this small, 20 of 20 still allows a true
  failure rate of about 1 in 6.
- **One run per case in the sweep.** The planned second and third runs of the best
  configurations were cut. Instead, the starting, all-small and chosen settings were each run
  three times per case through the app's own code afterwards (below).
- **Costly errors** are counted separately from ordinary misses, because they are not equally
  bad: revealing a finding that was not asked for; hiding a gap; quoting a passage about a
  different condition; accepting a quotation that does not back the advice.
- **Response time** is "model call time": wall-clock for one call (retries included), one call at
  a time, one model in memory at a time, with warm-up calls and model loading left out. It is not
  the app's voice-turn time, which is reported in the README.
- **Graders were tested first.** Before any model ran, every expected answer was fed through its
  own grader and had to pass; and a step that ignores its input was scored, which gives the floor
  drawn on the chart.
- **Every setting was shown to take effect** on each model before it was compared
  (`evals/sweep/preflight.json`): thinking off returns no thinking text and on returns some;
  forced format returns valid output with thinking on and off; temperature 0 with a fixed seed
  gave identical replies three times running for 10 of 10 requests.
- **The machine's state is in every row.** All 787 calls were made in High Power mode. The same
  ten calls were repeated through the run as a timing reference and moved by 12% (436 ms to
  488 ms), so times within about a tenth of each other are treated as equal.
- **Everything is re-derivable.** `evals/results/sweep-ollama.jsonl` holds one row per model
  call, including what the model actually returned. The CSV, the chart and the choice are all
  generated from it (`pnpm sweep:report`, `pnpm sweep:chart`).

The rule for choosing is in [`evals/sweep/RULE.md`](evals/sweep/RULE.md): drop anything over the
step's speed limit or with a costly error; among the rest, most cases passed; within a case or
two, the simpler and faster one; at most two models across the app. The record of the choice,
and where it departs from the plan, is [`evals/sweep/DECISION.md`](evals/sweep/DECISION.md).

## What was chosen

Tuning cases passed, out of cases run, one run each.

| Step | Chosen | Chosen: passed, costly, middle time | Start: passed, costly, middle time |
|---|---|---|---|
| Menu-picker | Medium, thinking off, format **not** forced, temperature 0.7, minimal prompt | 54 of 56, 0 costly, 428 ms | 53 of 56, 1 costly, 449 ms |
| Follow-up writer | Medium, thinking off, format forced, temperature 0.7, **examples** prompt | 5 of 5, 0 costly, 700 ms | 3 of 5, 0 costly (2 fallbacks), 741 ms |
| Coverage judge | Medium, thinking off, format forced, temperature **0**, minimal prompt | 6 of 7, 0 costly, 2,522 ms | 6 of 7, 0 costly, 3,048 ms |
| Revision step | **Small**, thinking off, format **not** forced, temperature 0.7, minimal prompt | 4 of 8, 1 costly, 3 fallbacks, 452 ms | 5 of 8, 2 costly, 1 fallback, 1,342 ms |
| Support check | **Small**, thinking **on**, format **not** forced, temperature 1, minimal prompt | 9 of 10, 0 costly, 8,413 ms | 8 of 10, 2 costly, 617 ms |

For the revision step **no configuration was eligible**: every one made a costly error. The rule's
fallback (fewest costly errors, then the tie-breaks) picked the small model.

Compared case by case, **no chosen configuration is distinguishable from the starting one** by
the test the report applies (at least six cases differing, all the same way). On sets of 5 to 56
cases run once, the choice is a rule being followed, not a difference being proven.

## What each setting did, and where the weaker ones fail

Every quotation below is a real saved reply. The case ids are in `RESULTS.md`.

### Thinking

**Too slow for anything the trainee waits for.** The menu-picker has a 2-second limit and the
follow-up writer 5 seconds. With thinking on, the menu-picker's middle time was 6 to 25 seconds;
the follow-up writer ran to its 60-second cut-off and returned nothing usable (the raw reply
saved for `fu-injection`, medium model, is the three characters `---`). Nine thinking-on
configurations were stopped early. Thinking also did not make the small model a usable coverage
judge: 4 of its first 6 replies were cut off at 27 to 47 seconds.

**The one place it earned its wait is the support check**, which runs after the conversation and
has a 15-second limit. With thinking off, every configuration, on all three model sizes, accepted
at least one quotation it should have rejected. The case that caught them all pairs the advice
"check for sulfonamide allergy before giving acetazolamide" with a sentence from a different
condition's section, "Avoid acetazolamide, which is itself a sulfonamide." The large model,
thinking off:

> "The passage explicitly advises avoiding acetazolamide because it is a sulfonamide, implying
> that patients with sulfonamide allergies should not receive it."

With thinking on, the small and medium models rejected that pair, and made no costly error on
the ten tuning pairs, at 8 to 10 seconds a call.

### Model size

- **Small is not good enough to judge what an answer covered:** 3 of 7, against 6 of 7 for the
  medium model on the same settings and 7 of 7 for the large. For an answer that opens "This is
  acute angle closure in the right eye" it marked the diagnosis "not covered", with an empty
  quotation, and named it the main gap (`cov-multi-gap`).
- **Small is as good as medium at picking from the menu on the count (53 of 56), but twice
  revealed something that was not asked for.** Asked "What's her blood glucose?", which is not
  in the case, it answered `{"item": "Blood pressure"}` (`sel-absent-3`).
- **Large bought little.** It passed one more menu case and one more coverage case than the
  medium model, at five times the wait (2.4 s against 0.4 s for the menu-picker, over its limit;
  13.6 s against 2.5 s for the coverage judge). For the revision step it made the same costly
  error as every other size.
- **For the support check with thinking on, small and medium tied**, so the rule took the
  smaller.

### Forced output format

- **It matters for the small model.** With the format only asked for in words, the small model's
  support check returned 7 unusable replies in 10, for example
  `{reason: The passage explicitly states to repeat gonioscopy… , verdict: "supported"}`, which
  is not valid JSON. Forced, it returned none.
- **For the medium model it made no difference to the counts**, and for the menu-picker the
  forced configurations each revealed one finding that was not asked for, where the unforced one
  did not. On one run that is as likely to be chance as cause.
- Code checks every reply against the same shape either way. An unusable reply is counted as a
  failed run, never passed along.

### Temperature

- **Temperature 0 did not change a count by more than one case on any step.** It is what the rule
  chose for the coverage judge, on speed.
- **Its real value is repeatability.** At temperature 0 every reply was identical between runs,
  on every model. That makes a result checkable. See "How far one run can be trusted" below.
- For the follow-up writer at temperature 0, 4 of the 4 questions it had accepted were the case
  file's own questions, word for word. It passes the word check by not writing anything new.

### Prompt wording

- **Worked examples helped the follow-up writer most:** 5 of 5 accepted, none a copy of a supplied
  question, against 3 of 5 (all three copies) for the minimal prompt. This is the comparison the
  repeatability finding weakens.
- **Explicit rules helped the judging steps by one case each** (coverage 7 of 7, support check
  9 of 10 with one costly error instead of two). Inside the tie band.
- **No wording fixed the revision step.**

### The revision step, under every setting

Given six retrieved passages and a point to revise, the step must pick the supporting sentence
and write one sentence of advice, or say the note does not back the point. Its failures were the
same on every size:

- **With the supporting passage removed, it quotes the wrong-section sentence instead of saying
  "no support".** Small model: cited p. 8, "Avoid acetazolamide, which is itself a sulfonamide.",
  with the advice "Note that acetazolamide is a sulfonamide and check for allergy before
  giving…". The large model did the same. This is the costly error that made every
  configuration ineligible.
- **Its own sentence often uses a word the note does not** ("administer", "perform"), fails the
  word check, and the supplied key point is shown instead. Safe, but it is a fallback.
- **When the gap is the diagnosis, it cites the triggers paragraph**, which is about the cause
  and not the diagnosis.

## The same settings, three runs each, through the app's own code

After the choice, the starting, all-small and chosen settings were each put through `pnpm check`:
the brief's three checks, every step on its tuning cases three times, and the revision step and
support check run together as the app runs them. A count is cases that passed on **every** run;
"costly" is a count of runs. The reports are [`evals/checks/start.md`](evals/checks/start.md),
[`evals/checks/small.md`](evals/checks/small.md) and
[`evals/checks/chosen.md`](evals/checks/chosen.md). [`CHECKS.md`](CHECKS.md) is the same set of
checks on the settings the app ships with, which add the improvement.

| | Start | All small | Chosen |
|---|---|---|---|
| Check 1: an available finding | 10 of 10 | 10 of 10 | 10 of 10 |
| Check 2: an unavailable finding | 10 of 10 | 10 of 10 | 10 of 10 |
| Check 2: unavailable, with left-over text in its value | 10 of 10 | 10 of 10 | 10 of 10 |
| Check 2: something not in the case at all | 2 of 10 | 0 of 10 | 3 of 10 |
| Check 3: the citation backs the revision point | 4 of 5 | 5 of 5 | 5 of 5 |
| Check 3: "no support" when the passages are removed | 1 of 3 | 0 of 3 | 1 of 3 |
| Check 3: "no support" for a point the note does not cover | 3 of 3 | 3 of 3 | 3 of 3 |
| Menu-picker, 56 cases | 53, 2 costly | 53, 5 costly | 53, 3 costly |
| Follow-up writer, 5 cases | 2 (3 flipped) | 3 (2 flipped) | 4 (1 flipped) |
| Coverage judge, 7 cases | 5 (1 flipped) | 1 (4 flipped) | 6 (one run: temperature 0) |
| Revision step alone, 8 cases | 4, 6 costly | 4, 3 costly | 4, 3 costly |
| Support check alone, 10 cases | 8, 6 costly | 9, 3 costly | **10, 0 costly** |
| Revision step and support check together, 8 cases | 4, 5 costly | 5, 3 costly | 5, **1 costly** |

What three runs add to the one-run sweep:

- **The support check's gain holds.** With thinking on it made no costly error in 30 runs. The
  starting configuration made 6 in 30: the same two pairs, wrongly accepted every time.
- **End to end, the trainee is shown a quotation that does not back the advice far less often:**
  5 runs in 24 on the starting settings, 1 in 24 on the chosen ones.
- **The menu-picker's "no costly errors" in the sweep was one run's luck.** Over three runs the
  chosen configuration made the same costly error every time on one case: asked for blood
  glucose, which is not in the case, it revealed urea and electrolytes. All three settings pass
  the same 53 of 56.
- **The all-small settings fail where the sweep said they would.** The coverage judge passed 1
  of 7, with 4 cases changing result between runs.
- **Two faults survive the choice.** Asked for central corneal thickness, which is not in the
  case, the app reveals the cornea instead in 7 runs of 10. And with the supporting passage
  removed, the revision step still quotes the wrong-section sentence in 2 runs of 3. The second
  is what the improvement goes after.
- **Runs that are cut off are counted as failures.** In 2 of the 24 end-to-end runs on the chosen
  settings the support check ran past its limit while thinking. The first version of this check
  left such runs out of the count; that was found and fixed before the held-back cases were
  opened, and the numbers here count them.

The times in these reports are not comparable with the sweep's: other programs were running.


## How far one run can be trusted

While the code was being reorganised, the same slice of the sweep was run four times to check
nothing had changed (`evals/repeatability/`).

| What was repeated | Raw replies identical between two runs of the same code |
|---|---|
| Menu-picker, temperature 0.7 | 20 of 20 |
| Follow-up writer, temperature 0 | 5 of 5 |
| Follow-up writer, temperature 0.7 | **2 of 20** |

Every request carried the same seed. Where the model has little freedom (a pick from a short
menu, or temperature 0) it repeats exactly. Where it writes a sentence at temperature 0.7 it does
not. On four runs, the starting configuration of the follow-up writer scored 3, 4, 3 and 5 of 5,
and the chosen one 5, 5, 4 and 4.

So the follow-up writer's settings **cannot be told apart** on this evidence, and the pre-check's
finding that a fixed seed makes a reply repeatable holds only at temperature 0. For any step
that writes text above temperature 0, one run is not a measurement.

## The held-back cases, opened once

About two in five of each step's hand-written cases were set aside when they were written, by a
hash of the case's id, and not run until the settings and the improvement had both been chosen
and saved (the tag `improvement-frozen` and the commit times show the order). They were opened
once, at 15:25 GMT on 24 November, in one sitting: the starting settings, the chosen settings,
and the chosen settings with the improvement, three runs per case. The third was the end-to-end
check only, since the improvement changes nothing else. Nothing was changed afterwards. Reports:
[`holdout-start.md`](evals/checks/holdout-start.md),
[`holdout-chosen.md`](evals/checks/holdout-chosen.md),
[`holdout-improved.md`](evals/checks/holdout-improved.md).

A count is cases that passed on **every** run; "costly" is a count of runs.

| | Start | Chosen |
|---|---|---|
| Menu-picker, 16 cases | 13, 4 costly | 12, 2 costly, 3 unusable replies |
| Follow-up writer, 3 cases | 2 (1 flipped) | 3 |
| Coverage judge, 5 cases | 4 (1 flipped) | 5 (one run: temperature 0) |
| Revision step alone, 6 cases | 4, 2 costly | **2, 4 costly** |
| Support check alone, 6 cases | 6, 0 costly | 6, 0 costly |
| Revision step and support check together, 6 cases | 4, **2 costly** | 4, **0 costly**, 1 cut off |

What they say about the choice:

- **The one gain the choice was made for held.** End to end, the trainee was shown a quotation
  that does not back the advice in 2 runs of 18 on the starting settings and in
  0 of 18 on the chosen ones. That is the same direction as the tuning cases (5 of 24, then
  1 of 24). In 4 of the 18 chosen runs the revision step picked a quotation for a point whose
  supporting passage had been removed; the support check, thinking, refused all four.
- **The revision step, taken alone, is worse on the chosen settings: 2 of 6 with 4 costly errors,
  against 4 of 6 with 2.** The rule picked the small model for it on a one-run tie (4 of 8 against
  5 of 8, one costly error each) because it was faster. The held-back cases do not bear that
  choice out: with a supporting passage missing, the small model quotes something else more
  readily than the medium one did. Its mistakes are caught by the next step, which is why the
  end-to-end row is better and not worse, but as a choice for that step it was not an
  improvement.
- **The support check's own gain does not show on these six pairs.** Both settings pass all six
  with no wrong acceptance. On the tuning pairs the starting configuration accepted the same two
  wrong quotations every time (6 runs of 30). The held-back set has one wrong-section pair, and
  the starting configuration refused it. The difference shows end to end, not here.
- **The menu-picker is no better: 12 of 16 against 13.** It made fewer costly errors (2 runs
  against 4), but all three runs of one case came back unusable: asked "Tell me everything you've got", and
  with its format no longer forced, it tried to list every finding and ran out of room. The
  trainee gets "Sorry, something went wrong. Please ask again." Nothing is revealed, but the right
  reply is "Please ask for specific findings."
- **The follow-up writer and the coverage judge are each one case better**, on 3 and 5 cases.
  That is inside what chance does on sets this small.

Put plainly: on cases that took no part in the choosing, the chosen settings differ from the
starting ones in one respect that matters, the one they were chosen for. Everything else is
within a case or two either way.

## The one improvement, before and after

The revision step is the weakest measured area (`evals/sweep/DECISION.md` has the ranking), so
the one improvement went there. When the revision step has written its own sentence of advice,
the support check is asked a second question about the same quotation: does it back the **key
point the trainee actually missed**? If not, the trainee is told no support was found. It was
built on the tuning cases, switched on, and frozen before the held-back cases were opened.

End to end (the revision step and the support check together), three runs per case:

| | Chosen | Chosen with the improvement | The same, second run |
|---|---|---|---|
| **Tuning cases: 8 cases, 24 runs** | | | |
| Runs that showed a quotation that does not back the advice | 1 | 0 | **1** |
| Cases passing every run | 5 of 8 | 5 of 8 | 5 of 8 |
| Runs with the right outcome | 16 of 24 | 17 of 24 | 15 of 24 |
| Times the new check was asked | | 4: agreed every time | 4: agreed every time |
| Runs that did not finish, where the trainee is asked to try again | 2 | 2 | 3 |
| **Held-back cases: 6 cases, 18 runs** | | | |
| Runs that showed a quotation that does not back the advice | 0 | 0 | |
| Cases passing every run | 4 of 6 | **3 of 6** | |
| Runs with the right outcome | 14 of 18 | 12 of 18 | |
| Cases fixed, cases broken | | none fixed, one broken (`rev-kp5`) | |
| Times the new check was asked | | 5: agreed twice, said no twice, cut off once | |
| Runs cut off | 1 | 2 | |

**The held-back cases do not support the improvement.**

- **It prevented nothing.** Without it, no run showed a wrong quotation: the support check,
  thinking, had already refused every one the revision step produced. There was nothing left
  for a second check to catch.
- **It cost correct answers.** The new check was asked 5 times, every time about a correct
  quotation that the ordinary support check had just accepted. It agreed twice, said no twice
  and was cut off once.
  - One refusal was simply wrong. For the key point "Review gonioscopy of the right eye and the
    optic discs after the attack settles" it refused the sentence "Once the eye has settled,
    repeat gonioscopy (including the affected eye…), examine both optic discs and arrange visual
    field testing", which it accepted on the other two runs. That case passed every run without
    the improvement and 2 of 3 with it.
  - The other is arguable. For "Stop the chlorphenamine" the note's sentence lists
    chlorphenamine among the drugs that can set off an attack; it does not say, in that
    sentence, to stop it. The model's own narrower advice ("Chlorphenamine has anticholinergic
    effects that can trigger acute primary angle closure") was backed by it. The key point as
    the case author wrote it was not. That case went from 2 of 3 to 0 of 3: the new check said
    no once and was cut off once, and the ordinary check said no once, as it had without the
    improvement.
- **It is one more call that can be cut off.** 2 runs of 18 ended with the trainee asked to try
  again, one of them in the new check itself, against 1 without it.
- **The tuning cases had not shown this.** There the new check was asked 4 times, about two key
  points, and agreed every time, and no case that passed without it failed with it. The cost
  only appeared on key points the change had not been built on. That is what the held-back
  cases are for.

**What was done about it: nothing, on purpose.** The app still runs with the switch on, as it was
frozen. The record made before the held-back cases were opened says they report on the choice
and do not change it, and re-choosing now would be choosing on them. On this evidence the
switch should come off, or the second question should be asked only when the quotation comes
from outside the section the case author names as the main source. Either is a new decision
and needs its own cases. Turning it off is one line: delete `"improvements"` from the support
check in `config/steps.json`. `config/steps.chosen.json` is exactly that.

What still stands for it is narrow: with a stand-in for the model that reproduces the original
fault exactly, the wrong quotation is shown without the change and refused with it
(`tests/eval/checks/chain.check.test.ts`).

**The second run on the tuning cases** (`check-2026-11-24T17-35-09`, 17:35, the last column above) was meant
as the final run of every check on the shipped settings. The laptop had been put to sleep, so it
was made in the spells when the laptop woke by itself, with each call to a model taking two to
three times as long as usual (the menu-picker's middle time was 1.5 seconds against 0.5, the
support check's 19.8 against 9.9). Its timings are not used
anywhere, and seven calls in it that got no reply within their time limit are put down to the
laptop: five in the brief's citation checks and two in the support check taken alone. No such
call is among the end-to-end runs in the table, so those count as they stand.

One of them matters. With the supporting passages removed, the revision step kept the key
point's own wording ("Note the sulfonamide allergy before giving acetazolamide") and quoted the
page 8 sentence "Avoid acetazolamide, which is itself a sulfonamide.", which is about a
different condition. The support check accepted it. The new check was not asked: it puts that
same question, and is used only when the model has written a sentence of its own. As a fixed
pair, that sentence against that advice was refused in every run that finished (3 of 3, then
2 of 2). So on the shipped settings a wrong quotation reached the trainee in 1 of 48 tuning
runs, not in none, and the improvement as built could not have stopped that one.

## What was not run

- 485 of the 540 configurations in a complete grid.
- Thinking on for the large model, and for the medium model's coverage and revision steps.
- The other prompt wordings and temperature 0 on the small and large models. They were tried one
  change at a time from the starting configuration, on the medium model only.
- Temperature 1.0 with thinking off, and 0 or 0.7 with thinking on. Each thinking mode ran at the
  model card's recommended temperature.
- The two probes of the model's built-in repetition penalty.
- Three-run confirmation inside the sweep.
- Any Claude model. The adapter is written from the SDK documentation and has never been run.

## What this cannot tell us

- **Small case sets.** Tens of cases per step. Most differences between neighbouring
  configurations are not distinguishable on sets this size, and this write-up says so where that
  is the case rather than picking a winner.
- **Expected answers are judgement calls.** They were written with an AI assistant from the case
  file and the note. No clinician has read them.
  [`evals/cases/REVIEW.md`](evals/cases/REVIEW.md) lists every one for a person to read, and
  that read had not been recorded as done when this was written. Nor had the blind read of the
  follow-up questions (`evals/sweep/followup-read.md`) been scored. Until both are, every count
  here measures agreement with one AI-assisted reading of the case and the note.
- **One machine, one model family.** The times are for this Mac in the stated power mode. They
  say nothing about Claude, or about another computer.
- **Not a complete grid.** A combination of settings that only helps together could have been
  missed.
- **Steps measured apart.** A step's result on fixed inputs hides how one step's mistakes feed
  the next, which is why the revision step and the support check were also run together.
- **The order of events.** The choosing rule was written after the first run of the brief's three
  checks on the starting configuration, and amended once, early, with the reason recorded. See
  `RULE.md` and `NOTES.md`.
