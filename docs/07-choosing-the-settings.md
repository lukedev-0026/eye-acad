# 7. Choosing the settings

An AI step can be set up in many ways: a bigger or smaller model, more or less randomness, and
so on. Until now those choices were reasoned about. This file describes how they are measured
instead, and how the final settings are picked from the measurements. People call this kind of
comparison a "sweep".

**Status on 24 November 2026:** this is the method. Nothing in this file has been run yet. Where
a figure is a judgement or an assumption, it says so.

The design of the app does not change. Only the settings of its five AI steps are compared.

## The five AI steps

| Step | What it does | Name in the results files |
|---|---|---|
| Menu-picker | Reads what the trainee asked and picks findings from the fixed menu. | `selector` |
| Follow-up writer | Writes the single follow-up question after the trainee's answer. | `followup` |
| Coverage judge | Works out which key points the answer covered and which it missed. | `coverage` |
| Revision step | Picks the supporting sentence from the retrieved passages and writes one sentence of advice. | `revision` |
| Support check | Decides, yes or no, whether a quote backs up a piece of advice. | `verifier` |

Code still writes every clinical fact and every quote. None of that depends on these settings.

## What a "configuration" is

A configuration is **one AI step with one value chosen for each of five settings**. For example:
"the menu-picker, on the medium model, with temperature 0.7, thinking off, forced format on, and
the shortest prompt".

## The five settings

| Setting | In everyday words | Values compared | Why it might matter |
|---|---|---|---|
| Model size | A bigger model has more internal capacity. It is usually more capable and always slower. | Small, medium and large versions of one family (qwen3.5 "4b", "9b", "27b"). | The large one might judge a half-covered key point better, but take several times longer. |
| Temperature | How much randomness the model uses when choosing each next word. At 0 it always takes the most likely word. | 0, 0.7 and 1.0. | At 0 the menu-picker should make the same pick every time. At 1.0 a follow-up question might read more naturally but be less predictable. |
| Thinking | Whether the model works through the problem in private notes before it answers. | Off and on. | It might help the coverage judge weigh a vague answer. It also adds seconds, which matters when the trainee is waiting to hear the examiner. |
| Forced output format | Whether the model server only allows output in the exact shape we ask for, or the model is simply asked in words. | On and off. | With it off, a small model may wrap its answer in chatty text that code cannot read. |
| Prompt wording | The instructions the model is given. | Three versions: the shortest possible; one with explicit rules; one with worked examples. | Examples might teach the menu-picker that "IOP" means intraocular pressure. |

Two notes on these:

- **Forced format is not what keeps the app safe.** Whether it is on or off, code checks every
  output afterwards. An answer that is the wrong shape, or names something not on the menu, is
  rejected and a fixed safe reply is used. So this setting can change how often a step fails. It
  cannot let a wrong fact through.
- **Worked examples never come from the real case.** They use an invented patient with different
  findings. Examples copied from the real case would go out of date the moment the reviewers
  change it, and would leak the answers into the checks.

### The starting configuration

The app is built first on one set of settings: the medium model for all five steps, thinking
off, forced format on, temperature 0.7, and the shortest prompt. It is a starting point, not a
recommendation. On the chart it is one labelled dot among the rest.

## Why each AI step is measured on its own

- The five steps share no memory. Each call starts fresh.
- Each step already has its own set of test cases.
- So each step can be measured alone, with its inputs fixed. The support check always sees the
  same pairs of quote and advice. The revision step always sees the same six passages.

The alternative is to vary all five steps together. Each step has 108 possible configurations
(3 sizes × 3 temperatures × 2 × 2 × 3 prompts). Five steps varied together would be 108
multiplied by itself five times: over ten billion combinations.

There is a cost to measuring steps separately: fixed inputs hide one step's mistakes from the
next. That is dealt with further down, under "Running the whole app on the result".

## Which configurations are run

Even one step at a time, a complete comparison would be 108 configurations per step, 540 in
all. That will not fit in one night. So about 130 are run, chosen as follows. **This is a
comparison of the configurations that ran, not a complete grid**, and the write-up will say
exactly which ran.

| Round | What is run, for each step | How many |
|---|---|---|
| Block 1 | Every combination of model size, thinking and forced format, with the shortest prompt and the temperature the model's maker recommends for that thinking mode (0.7 with thinking off, 1.0 with it on). The starting configuration is one of these. | 12 |
| Block 2 | For each model size, starting from its best result in block 1: the two other temperatures, and the two other prompt wordings. | 12 |
| Two probes | A test of one built-in setting, explained below. | 2 |
| Block 3 | Only if time remains: prompt wording, forced format and thinking combined, on the two best sizes. This catches settings that only matter together. | extra |

That is 26 for each step, so about 130 across the five steps, before block 3.

**The two probes.** These models come with a built-in penalty that discourages them from
repeating themselves. (This was confirmed on a model of the same family already installed on
this computer.) That could push the menu-picker away from naming the same finding twice, once
for each eye, which is exactly what "what are the pressures?" needs. So two configurations
(the starting one, and the best one from block 1) are re-run with the penalty switched off, to
see whether it matters.

**Screen first, then confirm.** Every configuration is first run once on each tuning case. With
only tens of cases, running more different cases tells us more than repeating the same ones.
Then the best three configurations for each step, plus the starting one, are run three times on
each case. The choosing rule is applied to those confirmed results.

**Stopping early.** A configuration whose first ten calls take more than twice its time limit
is stopped, and shown on the chart as "stopped: too slow". Five technical failures in a row stop
the whole run.

**What is not swept.** Checks with no AI in them do not change with these settings, so they are
run once: reading out findings, the search comparison table, the read-back check, privacy and
refresh.

## What counts as a pass, and what the costly mistake is

Not all mistakes are equal. For each step, one kind of mistake is treated as serious and counted
separately. A configuration that makes it even once is ruled out if any alternative does not.

| Step | A test case passes when | The costly mistake | A cheap mistake |
|---|---|---|---|
| Menu-picker | The findings revealed are exactly the ones expected, and the kind of request is recognised correctly (asking for a finding, or trying to give an answer). | Revealing a finding that was not asked for, or the wrong eye. | Missing something: the trainee simply asks again. |
| Follow-up writer | A question written by the model is accepted by the allowed-words test within the app's two attempts. | A question that gives away the diagnosis or a key point, or passes judgement on the answer. | Falling back to a pre-written question. |
| Coverage judge | The gap it chooses to revise is one of the acceptable gaps for that sample answer. | Marking a missed point as covered, so the gap is never raised. | Marking a covered point as missed: the trainee is reminded of something they already said. |
| Revision step | The sentence it cites is one of the accepted ones, and its own sentence of advice passes the wording checks. When the note has no support, it says so. | Citing the wrong-section passage, or citing anything when there is no support. | Falling back to the pre-written key point. |
| Support check | Its yes or no matches the expected one. | Saying "supported" when the quote does not support the advice. | Saying "not supported" when it does. |

Two places where a person is needed:

- **Follow-up questions.** Passing the allowed-words test is necessary, but it does not make a
  question good. Luke reads the questions from the three confirmed configurations only. The read
  is blind: duplicates are merged, the order is shuffled, and which configuration wrote which
  question is hidden. Each gets two yes-or-no answers: does it respond to what the trainee said,
  and does it give anything away? No AI is used as the judge. Other dots on the chart are marked
  as machine-graded only.
- **Coverage labels.** Whether a sample answer "covered" a key point is sometimes arguable.
  Where it could go either way, the item is marked "either" and left out of the count, and the
  number left out is reported.

## How results are counted

- **n is the number of different test cases. k is how many passed on every run.**
- Twenty cases run three times each is reported as 20, never 60. Three runs of one case are not
  three independent pieces of evidence.
- The number of cases that changed result between runs is reported alongside.
- Small numbers leave real doubt. Even 20 passes out of 20 cannot rule out a true failure rate of
  about one in six. The write-up will say that once, plainly.

## How response time is measured, and what it is not

The time measured here is **model call time**: from sending the request to the model until an
accepted answer comes back, including any retry.

- Calls run one at a time, with nothing else using the model server.
- The work is grouped by model. Each model is loaded, three warm-up calls are made and not
  timed, then the measured calls run. The time taken to load a model is recorded once and left
  out.
- The order of cases is shuffled so the same prompt never runs twice in a row. The model server
  skips work on a repeated prompt, which would make a repeat look faster than it is.
- One reference configuration is re-run at the start, middle and end of the night. If its time
  drifts by more than a fifth, that night's timings are flagged.
- For each configuration the middle value (the median), the fastest and the slowest are kept.
- A call that runs past two minutes, or is cut off before finishing, counts as a failed run.
  A technical failure, such as the model server not answering, is kept out of the count and
  listed separately.
- The computer's power mode and swap use are saved with every timing. On 24 November this Mac
  reported a power setting that reads as Low Power Mode, even when plugged in, and had about
  5 GB of swap in use. Both would slow every call, so Luke is asked to switch Low Power Mode off
  and restart before the timed runs.

What it is **not**:

- It is not the time for a whole spoken turn. That also includes turning speech into text and
  text into speech, and is still measured separately in the browser, as the brief asks.
- It is not a prediction for Claude. These are timings on one computer running local models.

## The pre-check, before anything is measured

Four things are checked first. A fault here would quietly spoil every later number.

1. **The graders, with no model involved.** A grader is the piece of code that decides pass or
   fail. Every expected answer is fed through its own grader and must pass. Then lazy constant
   answers are scored: reveal nothing, always "not covered", always "not supported". Their
   scores are the floor: a configuration that does no better has learned nothing. The floor is
   drawn on the chart.
2. **The machine.** The power mode, the swap in use, and every built-in option each model comes
   with, written out so that nothing is left to a hidden default.
3. **Each setting on each model.** Does switching thinking on really produce thinking, and off
   really produce none? Does forced format really produce output of the right shape, with
   thinking on and off? Does the longest prompt fit without being cut short? At temperature 0,
   does the same question give the same answer three times running?
4. **A short timing test** per model, with and without thinking. This replaces the assumed
   speeds in the time estimate.

A setting that fails is dropped by name and reported as "not tested". It is not left in the
comparison looking as if it had been compared.

The pre-check also settles which of two engines the models run on. On a Mac, the model server
can run a model on either of two engines, and they enforce the output format in different ways.
All three sizes must use the same one, or a difference between sizes might really be a
difference between engines.

The research behind these checks is in file 04, "Round four". Those facts are sourced but not
yet tested here, which is the reason for this pre-check.

## The choosing rule

The rule is written down and saved in the project history before the run starts, so that it
cannot be bent to fit the results. For each step, using the confirmed results on the tuning
cases:

1. **Rule out the unusable.** A configuration must make no costly mistake on any run, and its
   middle response time must be under a limit: 2 seconds for the menu-picker and 5 seconds for
   the follow-up writer, because the trainee is waiting to hear the examiner; 15 seconds each
   for the coverage judge, revision step and support check. If nothing qualifies, the one with
   the fewest costly mistakes wins, and the write-up says so.
2. **Most cases passed on every run.** Configurations within one case of the best (or within 5%
   of the cases, if that is larger) count as tied. The sets are too small to separate them
   honestly.
3. **Break ties towards the simpler option,** in this order: faster, smaller model, thinking
   off, forced format on, temperature 0, the shortest prompt.
4. **No more than two different models across the five steps.** The app then fits in memory, and
   a reviewer has less to download.

The time limits are judgement calls. They are fixed before any result is seen.

One more rule, about what the write-up may claim: it says one configuration is better than
another only when at least six cases differ between them, all in the same direction. Otherwise
it says "not distinguishable on this set" and names the tie-break that decided.

## Tuning cases and held-back cases

When the best of many options is picked on a small set of cases, the winner's score is partly
luck. Report that same score and it flatters the result.

- So each step's cases are split about 60/40 when they are written. The split is fixed and
  saved before any model runs.
- **Tuning cases** (the larger part) are used to choose the settings and to build the
  improvement.
- **Held-back cases** (the smaller part) are used only to report.
- The held-back cases are **opened once**. The program refuses to run them until the choice of
  settings has been saved and the improvement is fixed.
- They are then run three ways in one sitting, three runs per case: the starting configuration,
  the chosen configuration, and the chosen configuration with the improvement.
- Those are the numbers the write-up reports. Nothing is re-chosen afterwards, whatever they
  show.

Two honest footnotes. The brief's three required checks use fixed questions, so they are
labelled "not held back". And if an expected answer has to be corrected after outputs have been
seen, the correction is logged and every configuration is re-scored from the saved outputs.

## Running the whole app on the result

Measuring each step with fixed inputs hides one step's mistakes from the next. So once the
settings are chosen, every check is run again through the real app, end to end, including the
ten spoken turns.

The typed checks are also run on two other set-ups: the starting configuration, and the small
model for every step. That gives an end-to-end "before", and a worked example of where the
weaker settings fail.

## What comes out

| Output | What it is |
|---|---|
| Raw results | One line for every single call: the full configuration, the test case, pass or fail, the timing, and the model's actual output. Never overwritten. |
| Results table (a CSV file) | One row per configuration: cases passed out of cases run, the middle, fastest and slowest time, the model and the date. Built only from the raw results. |
| Chart | Accuracy against response time, one dot per configuration. Built only from the results table. |
| Decision note | Which configuration the rule picked for each step, and what was close. |
| Write-up | The trade-offs, with real failing outputs quoted for the weaker settings, what was not run, and the limits listed at the end of this file. |

The write-up leads with the chart and the table of every configuration that ran. It also says,
plainly, that the app was built on the starting configuration first, how many configurations ran
out of the 540 possible, and which numbers came from tuning cases and which from held-back ones.

## How to read the chart

There is one panel for each of the five steps.

- **Across** is the middle response time in seconds. Further left is faster. The scale is
  stretched so that 1, 10 and 100 seconds are evenly spaced, because the times vary so widely.
  A thin line through each dot runs from its fastest call to its slowest.
- **Up** is the number of test cases passed, out of the number run. Higher is better.
- So **the best place to be is the top left**: accurate and fast.
- **Colour and shape** show the model size.
- **Filled or hollow** shows whether thinking was off or on. The chart's key says which is which.
- **A slash** through a dot means forced format was off.
- **A cross** marks a dot that made a costly mistake.
- **A ring** marks the chosen configuration, and the starting configuration is labelled.
- **Two dashed lines** show the time limit for that step and the floor set by the lazy constant
  answer.
- Temperature and prompt wording are not shown on the chart. They are in the results table.

Every dot shows the first run of that configuration on the tuning cases, so all the dots are
measured the same way.

## How the improvement is picked and measured

The brief asks for "one improvement of your choice" and why it was prioritised.

1. **Picked from the measurements.** With the chosen settings in place, the weakest area is
   found in this order: most costly mistakes, then most failed cases, then most fallbacks to
   pre-written text, then the slowest stage of a spoken turn. Checks with no AI in them, such as
   the read-back check, are candidates too.
2. **One fix, inside the existing design.** It is a change to code, a prompt or a handling rule,
   built from the failures on the tuning cases as a general rule. No example is copied from a
   test case. It is not hands-free talking or streaming audio, which are ordinary design choices
   (file 03), and it is not a change of settings, which the sweep already covers.
3. **Measured on the held-back cases.** Before and after are run on the same held-back cases in
   one sitting. The number that first exposed the weakness is shown, but not used as "before":
   the weakest of several noisy scores tends to recover on its own, which would make any fix
   look good.
4. **Reported whatever it shows.** The counts before and after, the cases fixed, the cases
   broken, and the cost in time. If the held-back cases show no gain, the write-up says so. If
   nothing is weak, it says that too, and takes the item with the narrowest margin.

## The later Claude phase

The app can switch any step to a Claude model by changing the settings file. That route is run
only if a key is supplied, and it is only described as working once it has been run.

The comparison there is different, and smaller:

- **Different settings.** Current Claude models do not accept a temperature. They have an
  "effort" setting (low, medium, high) instead. Thinking can be switched off on the two smaller
  models but not on the largest.
- **Smaller, because of cost.** Comparing as many configurations as the local phase would cost
  several times the £10 the brief reimburses. So the smallest model is compared across blocks 1
  and 2, and the two larger models on block 1 for the three judging steps only.
- **A fixed spend limit of £8.** A dry run first multiplies the expected amount of text by the
  price list and refuses to start above the limit. During the run, spend is added up from what
  each response reports, and the run stops at the same limit.
- **Its own chart.** Claude timings include the trip over the internet, so they never share a
  panel with local timings.

## Size of the job

Roughly 2,200 calls to screen, 700 to confirm and 400 on the held-back cases. If a call takes 1,
3 and 8 seconds on the three sizes without thinking, and 5, 15 and 45 seconds with it, that is
four to six hours. **Those speeds are assumptions, not measurements.** The short timing test in
the pre-check replaces them before anything runs. The run has a time limit and can be stopped
and resumed.

## What this cannot tell us

- **The sets of test cases are small.** Tens of cases per step, fewer still held back. Many
  configurations will not be distinguishable, and the write-up will say so instead of ranking
  them.
- **One computer.** Every timing is from this Mac. Another machine would give different numbers.
- **One family of models.** The results say how three sizes of qwen3.5 behave. They do not say
  how a different local model, or Claude, would behave.
- **Local timings only.** They are not a guide to a hosted model's speed.
- **Not a complete grid.** About 130 of the 540 possible configurations are run. A combination
  that was not run might have done better.
- **The expected answers are judgement calls.** They are written by the AI building this and
  read by Luke. The sweep is scored against them, so an error there carries through.
- **Steps are measured apart.** The end-to-end runs check the chosen settings as a whole, but
  only for three set-ups, not for every combination.
- **Follow-up quality is partly a human opinion,** read for three configurations only.
