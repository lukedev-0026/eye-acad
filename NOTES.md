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
| 24 Nov 12:22 | Code-standards pass finished and merged to `main`: 22 commits after `pre-refactor`. Folders by layer with a lint rule that enforces them; every import at the top of its file; settings read and checked in one place; named errors that keep their cause, with a proper HTTP status and a safe message for the browser; structured logging with a request reference; outside data checked where it arrives; the 551-line viva page split into a hook and components. Proof that behaviour did not change, on the final commit: `pnpm golden` identical (516 request sets, 784 replayed replies), the sweep report, CSV and chart byte-identical, the prepared note byte-identical, the retrieval table unchanged. Tests went from 182 to 346, plus 11 against the emulators. Browser run after the last change: a full attempt by typing, refresh mid-attempt, an attempt from before the pass reopened, two tabs, the second trainee refused by the page and by the server (404), no speech key, and a missing prepared note giving its own message (503). The CI file is written and has not run on GitHub. |
| 24 Nov 12:23 | Full checks started through the app's own code, three runs per case, on four settings files in turn: starting, all-small, chosen, and chosen with the improvement switched on. Tuning cases only. |
| 24 Nov 13:09 | The four check runs finished (`evals/results/check-2026-11-24T12-23-42`, `12-29-37`, `12-34-37`, `12-49-46`; reports in `evals/checks/` and `CHECKS.md`). On the tuning cases, three runs each: the support check with thinking on made no wrong acceptance in 30 runs (starting settings: 6 in 30); the revision step and support check together showed a quotation that does not back the advice in 1 run of 24 (starting: 5 of 24). Two faults survive the chosen settings: something not in the case (central corneal thickness) is answered with the nearest finding in 7 runs of 10, and with the supporting passage removed the wrong-section sentence is still quoted in 2 runs of 3. The menu-picker's "no costly errors" in the sweep was one run: over three it makes the same one every time on one case. |
| 24 Nov 13:09 | With the improvement switched on, the tuning cases gave no wrong quotation in 24 end-to-end runs and none in 3 runs of the "passage removed" check (the chosen settings without it: 1 in 24, and 2 in 3). The saved traces do not show the new check causing that: it ran four times, each time on a correct quotation, and agreed each time. The runs it exists for did not recur. So on the tuning cases the gain cannot be credited to it. |
| 24 Nov 13:10 | Fault found in the end-to-end check, and fixed before the held-back cases are opened: a run in which a model call was cut off (the support check thinking past its limit) was recorded as a machine error and left out of the counts. It is now recorded as a failed run, with the step named. In the four runs above it had happened in 0, 0, 2 and 2 of 24 runs. Counted as failures, the chosen settings stay at 5 of 8 cases passing every run, and the run with the improvement goes from the 6 of 8 its report shows to 5 of 8. |
| 24 Nov 13:10 | The four runs took the battery from 69% to 5% on the 55 W charger. All model work stopped to let it charge. `pnpm check` now refuses to start, or stops between parts, under 15%. |
| 24 Nov 13:16 | The improvement is switched on in `config/steps.json` and frozen (tag `improvement-frozen`), before the held-back cases are opened. `config/steps.chosen.json` keeps the rule's choice without it. The reasons, and what the tuning cases can and cannot say for it, are in `evals/sweep/DECISION.md`. |
| 24 Nov 13:45 | Ten spoken turns timed in Chrome on the final settings, with a synthetic voice and the same questions as at 07:40: 1.8 seconds from the end of speech to playback in the middle case (1.5 to 2.3), against 5.8 before. Every reply's audio had been made ahead. The first turn after the model had been idle took 3.6 seconds and is recorded separately (`evals/voice-timing/`). |
| 24 Nov 13:49 | Change rehearsal on a copy of the case file, with no code touched: a changed pressure (58 to 61) and a new finding in an unseen unit (612 µm) were shown and said correctly in 10 of 10 typed runs each; a finding marked unavailable printed its new reason through `pnpm findings` (`evals/rehearsal/`). |
| 24 Nov 13:49 | Waiting for the battery again: it is at 18%, and the held-back cases are not started until it reaches 48%, enough for all three runs in one sitting. |
| 24 Nov 15:25 | The held-back cases are opened, once, with the battery at 48%: the starting settings (15:25), the chosen settings (15:27) and the chosen settings with the improvement (15:37), back to back, three runs per case. The third run is the end-to-end check only, because the improvement changes nothing else and the battery would not have covered a repeat of identical settings. Finished 15:43 at 24%. Runs `check-2026-11-24T15-25-35`, `15-27-56`, `15-37-15`; reports in `evals/checks/holdout-*.md`; tag `held-back-opened`. |
| 24 Nov 15:28 to 15:40 | While those ran, with no model involved: `pnpm leak-scan` added (the built browser files searched for every piece of text in the case file: none found, and 10 found in the server's files as a control); two tests added for things the criteria ask for and no test held (the revision point when meaning-based search is down; a case-file edit reaching the next question while an old attempt keeps its words); the running development server asked directly for the case file, the prepared note, the settings and the key file, and refused each time (HTTP 403). |
| 24 Nov 15:43 | What the held-back cases showed. Start, then chosen, cases passing every run: menu-picker 13 and 12 of 16; follow-up 2 and 3 of 3; coverage 4 and 5 of 5; revision step alone 4 and 2 of 6; support check alone 6 and 6 of 6; both together 4 and 4 of 6. A quotation that does not back the advice was shown in 2 of 18 runs on the starting settings and 0 of 18 on the chosen ones. So the gain the choice was made for held, and nothing else did. |
| 24 Nov 15:43 | The improvement on the held-back cases: 3 of 6, against 4 of 6 without it. No case fixed, one broken. Its extra check was asked 5 times, each time about a correct quotation: it agreed twice, refused twice and was cut off once. Without it no wrong quotation had got through, so it had nothing to catch. Nothing is re-chosen: the app stays as it was frozen, and the write-up says the evidence is against the switch. |
| 24 Nov 15:50 | Two more checks with no cost to speak of. Every finding the app shows was compared with the text of the supplied case document: all 24 values and methods match (visual acuity also carries the case file's unit, "Snellen", which the document does not print). And a live attempt was viewed in greyscale: the three turn labels each have their own symbol and words, and the talk button is disabled while the examiner is thinking or speaking. |

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
