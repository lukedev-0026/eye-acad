# The choice, made on the tuning cases

Recorded on 25 November 2026 at 13:48 GMT, after the 12 tuning runs (13:29 to 13:46) and **before
the held-back cases were opened**. Table: [`tuning-table.md`](tuning-table.md), rebuilt from the raw
rows by `python3 evals/near-miss/summarise.py evals/results/check-2026-11-25T13-*.jsonl`.

Applying [`RULE.md`](RULE.md):

1. **Eligible** (every control passed, other cases no worse than `off` less one, under 2 s): all
   six `check` configurations, and the medium `rules` ones. The small `rules` configurations are
   eligible on the letter of the rule but pass fewer near misses than `off`.
2. **Most near misses passed:** 10 of 10 for small t0 check, medium t0 check and medium t0.7 check.
   Calls per turn are the same for all three (about 1.85). The shipped model rules out the small
   one. Of the two medium ones, the faster is temperature 0 (853 ms against 894 ms).

**Chosen: `qwen3.5:9b`, temperature 0, minimal prompt, `check-requested-item` on**
(`configs/medium-t0-check.json`). Against the shipped selector on the tuning cases: near misses
3 of 10 → 10 of 10, controls 5 of 5 both, other cases 53 → 54 of 56, costly runs 16 → 0.

The cost: about 0.4 s more per turn when something is picked (middle 442 → 853 ms for the step).

Next, once: the held-back selector cases, shipped settings then chosen, in one sitting.

## The held-back cases, opened once (13:48 to 13:49)

| 27 held-back cases, three runs each | Shipped | Chosen |
|---|---|---|
| Cases passing every run | 24 | **25** |
| Near misses (7 new) | 7 | 7 |
| Controls (4 new) | 4 | 4 |
| Other cases (16) | 13 | 14 |
| Runs revealing something not asked for | 2 | **0** |

Fixed: `sel-absent-1`, "What is the central corneal thickness?" (1 of 3 runs right before).
Broken: none. Failing both: `sel-broad-1` ("Tell me everything", out of room) and `sel-follow-3`.
The new held-back near misses were already right on the shipped settings, so they show no gain.

Adopted in `config/steps.json`. The required checks were then re-run
([`required-after.md`](required-after.md)): "not in the case" 10 of 10, every other result as
before, except "passages removed" 1 of 3 (2 of 3 on 24 November), which is the revision step.
