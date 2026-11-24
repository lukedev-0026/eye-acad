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
