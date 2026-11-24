# Does the same setting give the same answer twice?

Recorded on 24 November 2026, about 11:45 UTC, on the medium model (`qwen3.5:9b`), while checking
that reorganising the code had changed nothing.

**Short answer.** At temperature 0, yes, exactly. For the menu-picker at temperature 0.7, yes,
exactly. For the follow-up writer at temperature 0.7, no: even with the same seed, most replies
differ from one run to the next.

## What was run

The same slice of the short sweep, four times: the follow-up writer's five tuning cases on five
settings, with ten menu-picker calls before and after as a timing reference.

| Run | Code | File |
|---|---|---|
| Saved | As it was when the sweep ran | `evals/results/sweep-ollama.jsonl` |
| Old code, now | The commit tagged `pre-refactor`, run again | `pre-refactor-code.jsonl` |
| New code, run 1 | After the reorganisation | `new-code-run-1.jsonl` |
| New code, run 2 | The same code, straight afterwards | `new-code-run-2.jsonl` |

Every request carried the same seed, and the requests themselves are identical between old and
new code (`pnpm golden` checks that byte for byte).

## How many raw replies were identical between two runs

| Pair | Follow-up, temperature 0.7 | Follow-up, temperature 0 | Menu-picker, temperature 0.7 |
|---|---|---|---|
| Saved and old code, now | 7 of 20 | 5 of 5 | 20 of 20 |
| Saved and new code, run 1 | 6 of 20 | 5 of 5 | 20 of 20 |
| Saved and new code, run 2 | 5 of 20 | 5 of 5 | 20 of 20 |
| Old code, now and new code, run 1 | 7 of 20 | 5 of 5 | 20 of 20 |
| Old code, now and new code, run 2 | 4 of 20 | 5 of 5 | 20 of 20 |
| **New code, run 1 and run 2** | **2 of 20** | 5 of 5 | 20 of 20 |

The last row is the telling one: the same code, run twice in a row, agrees with itself on 2 of 20
follow-up replies at temperature 0.7. So the differences from the saved sweep are the model, not
the code. Where the model has little freedom (a choice from a short menu, or temperature 0), every
run agrees with every other.

## What it does to the scores

Follow-up cases passed (a model-written question survived the word check), out of five:

| Setting | Saved | Old code, now | New code, run 1 | New code, run 2 |
|---|---|---|---|---|
| Minimal prompt, format forced, temperature 0.7 (the start) | 3 | 4 | 3 | 5 |
| Minimal prompt, format not forced, temperature 0.7 | 3 | 4 | 3 | 5 |
| Rules prompt, format forced, temperature 0.7 | 5 | 5 | 5 | 4 |
| Examples prompt, format forced, temperature 0.7 (chosen) | 5 | 5 | 4 | 4 |
| Minimal prompt, format forced, temperature 0 | 4 | 4 | 4 | 4 |

## What follows from it

- The sweep's choice for the follow-up writer rests on one run of five cases, and one run of this
  step at temperature 0.7 can score anywhere from 3 to 5. The settings in that table are not
  distinguishable from each other on this evidence.
- The earlier finding that a fixed seed gives a repeatable answer was measured at temperature 0,
  and it holds there. It does not extend to temperature 0.7 for a step that writes free text.
- For any step that writes text above temperature 0, a single run is not a measurement. It needs
  several runs per case, which is what the confirmation stage of the full sweep was for, and which
  was cut.
