# A second improvement: "not in the case" for the menu-picker

Written and committed on 25 November 2026 **before any model was run on it**. Nothing below is
changed after the first measured run; any departure is recorded at the end with its reason.

## Why this area

Acceptance criterion 10 is the one marked **not met**. Asked for central corneal thickness, which
is not in the case, the app answered "That isn't recorded for this case" in 3 of 10 runs; in the
others it read out the cornea instead. Asked for blood glucose, it read out urea and electrolytes
in 3 runs of 3. Nothing false is said, but something is revealed that was not asked for. The
menu-picker is also the fastest step (about half a second a call), so a grid fits in about 20
minutes.

The first improvement (a second support check, see `HANDOVER.md`) stays as reported. This is a
second, separate attempt.

## What is compared

Twelve configurations of the menu-picker, each a full settings file in `configs/`. Everything
except the three changes below is the shipped selector setting (thinking off, format not forced,
the same sampling, output cap and time limit).

| Setting | Values |
|---|---|
| Model | `qwen3.5:4b` (small), `qwen3.5:9b` (medium, shipped) |
| Temperature | 0, 0.7 (shipped) |
| Fix | `off`: the shipped minimal prompt. `rules`: the existing "explicit rules" prompt, whose rule 5 says "Do not substitute the nearest item". `check`: the minimal prompt plus a second look (`check-requested-item`): one more call, made only when something was picked, asking for each pick whether it is the thing asked for or only related to it; a related pick is dropped and the turn says "not recorded" |

Runs: three per case at 0.7, one at 0 (which repeats exactly). A case passes only if it passes
every run.

## Cases

All in `evals/cases/selector.jsonl`, graded by the existing selector grader.

- **New near misses** (`type: near_miss`, 17): things not in the case whose nearest menu item would
  reveal something not asked for (corneal thickness, HbA1c, heart rate, visual fields,
  keratometry, ...). Expected: not recorded.
- **New controls** (`type: near_control`, 9): close wording that a menu item does answer
  (cup-to-disc ratio, sodium and potassium, cataract, ...). Expected: that item. These catch a fix
  that refuses real requests.
- **Everything else** in the file and the generated one-per-row requests: the existing guard.

The new cases were split as before: within each type, ordered by the SHA-256 of the id, the first
60% to tune. Near misses 10 tune, 7 held back; controls 5 tune, 4 held back. The expected answers
were written with an AI assistant and are judgement calls.

## The rule, applied to the tuning cases

1. **Eligible** if, against `off` at the same model and temperature: it passes every tuning
   control, passes no fewer of the other tuning cases less one, and its middle time per turn is
   under the selector's 2-second limit.
2. **Among eligible**, the most near-miss tuning cases passed. Ties within one case: the fewer calls
   per turn (no second look), then the shipped model, then the faster.
3. If no fixed configuration passes more near misses than the shipped settings, the fix is not
   adopted, and that is reported.

## Then, once

The held-back cases (all selector held-back cases, the new ones included) are run once, in one
sitting: the shipped settings, then the chosen configuration, three runs per case. Both counts are
reported, with the cases fixed and the cases broken. Nothing is re-chosen afterwards. If the
chosen configuration is adopted, `config/steps.json` is changed and the brief's required checks are
run again.

## Departures

None yet.
