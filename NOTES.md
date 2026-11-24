# Build log

Times are UTC. "Build time" is counted from the first line below, wall-clock,
with the AI coding assistant working continuously and Luke checking in.
Planning and research happened before this and are described in
`docs/04-investigation.md`.

| When (UTC) | What |
|---|---|
| 24 Nov 05:58 | Build starts. Empty repo apart from the planning docs. |
| 24 Nov 06:16 | Steps 0 and 1 committed: sign-in, token check, case file locked away, sentence builder. |
| 24 Nov 06:24 | Step 5 committed: reference note prepared (126 passages), two-way search, comparison table. |
| 24 Nov 06:36 | Steps 3, 4 and 6 committed: typed viva works end to end in the browser, with follow-up and revision card. Voice written but not yet tried (no Deepgram key). |
| 24 Nov 06:42 | First run of the brief's three required checks, on the starting settings (`evals/results/check-2026-11-24T06-42-22.jsonl`). |
| 24 Nov 07:00 | Check harness, case sets, `evals/sweep/RULE.md` and the sweep scripts committed. No configuration other than the starting one has been run at this point. |
| 24 Nov 07:10 | Sweep started on the small and medium models (the large one was still downloading). The Mac had been switched from Low Power to High Power a few minutes earlier; every sweep row is in High Power. |
| 24 Nov 07:14 | Deepgram key in place. Voice works end to end; `pnpm readback` written and run. |
| 24 Nov 07:25 | Choosing rule's tie-break amended (speeds within 10% count as equal). See `evals/sweep/RULE.md`. Sweep restarted; finished work is skipped. |
| 24 Nov 07:29 | Fault found and fixed: a model call that ran out of time was recorded as a machine error (`infra_error`), which would have left it out of the counts. It is now recorded as a failed run (`truncated`). Two rows from one far-too-slow configuration (follow-up writer, small model, thinking on, format not forced) were recorded the old way and are left as they are. |
| 24 Nov 07:40 | Ten spoken turns timed in the browser on the starting settings (`evals/voice-timing/`). Speech synthesis changed to one clip per sentence, made in parallel and kept. |
| 24 Nov 08:17 | Sweep paused. The Mac was on a 55 W charger and the sweep drew about twice that, so the battery had fallen from 100% to 16% while plugged in. 373 calls and 28 configurations were recorded by then: the whole first block for the small model, and the menu-picker and follow-up writer for the medium one. |
| 24 Nov 08:20 | Sweep cut down at Luke's request to a short version (about 20 minutes of running): the rest of the medium model with thinking off, the other prompts and temperature 0 one change at a time from the starting settings, and the large model once per step. Dropped: thinking-on runs not yet made, the per-size second block, the repetition-penalty probes, and the separate three-run confirmation of the top three. A battery guard was added. Also decided: local models only; the Claude route stays written but not run. |
| 24 Nov 09:02 | The medium part of the short sweep finished (started 08:55 by the battery guard, once the battery had recharged to 30%). |
| 24 Nov 09:47 | The large part finished (started 09:41 at 32%). 787 calls and 55 configurations in all. |
| 24 Nov 10:36 | Raw results committed. The rule applied by `pnpm sweep:report --apply`; the choice and where it departs from the plan are in `evals/sweep/DECISION.md`. The `four-hour-mark` tag is on `3b5ef30`, the last commit before 09:58 UTC, four hours after the build began. |
| 24 Nov 10:40 | A code-standards pass begins, at Luke's request: layers, typed errors, validated config, structured logging, strict typing. `pnpm golden` is written first and its baseline recorded from the untouched code (tag `pre-refactor`), so that any change in what the app sends a model, or makes of a reply, shows up. |
| 24 Nov 11:34 | Live check of the reorganised code: the starting settings on the medium model give 53 of 56 for the menu-picker, and all 56 raw replies are identical to the ones the sweep saved. |
| 24 Nov 11:45 | Found while checking the sweep runner: at temperature 0.7 the follow-up writer does not repeat between runs, even with a fixed seed. Two back-to-back runs of the same code agreed on 2 of 20 replies, and the same setting scored 3, 4 and 5 out of 5. At temperature 0, and for the menu-picker, every run agreed exactly. The old code run again shows the same, so it is the model and not the code. Raw runs and tables: `evals/repeatability/`. |

## Things seen before the sweep

Recorded here so the order of events is honest. The rule for choosing settings
(`evals/sweep/RULE.md`) was written after the first required-check run on the
starting settings, so these three observations were already known when it was
written. No other configuration had been run.

1. Asked for central corneal thickness, which is not in the case, the starting
   settings revealed the cornea rows instead in 8 of 10 runs.
2. With the supporting passage removed, the revision step quoted the page 8
   sentence about a different condition, rewrote the advice to match it, and
   the support check accepted it (3 of 3 runs). The support check compares the
   quotation with the model's own sentence and never sees the original key
   point, so it cannot notice the advice has drifted.
3. For a vague, wrong answer the gap chosen is the diagnosis, which is a long
   compound statement. No single sentence of the note backs all of it, so the
   support check rejects it and the trainee is told "no support".
4. The planned code rule for "no support" cannot work on this note: similarity
   scores for key points the note covers (0.62 to 0.86) overlap those for
   invented ones it does not (0.60 to 0.68). See `evals/retrieval-table.md`.
