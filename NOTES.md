# Build log

Times are UTC on 24 November 2026, from commits and run ids. Build time is wall-clock from the
first line, with the AI coding assistant working and Luke checking in. Planning happened before
this (`docs/planning/04-investigation.md`).

| When | What |
|---|---|
| 05:58 | Build starts from the planning docs alone. |
| 06:16 | Sign-in, token check, case file locked away, sentence builder. |
| 06:24 | Reference note prepared (126 passages), two-way search, comparison table. |
| 06:36 | Typed viva works end to end, with follow-up and revision card. |
| 06:42 | First run of the three required checks, starting settings (`check-2026-11-24T06-42-22`). |
| 07:00 | Check harness, case sets, `evals/sweep/RULE.md` and sweep scripts committed. Only the starting configuration had been run. |
| 07:10 | Sweep starts, small and medium models. Mac switched to High Power just before; every sweep row is High Power. |
| 07:14 | Deepgram key in place; voice works; `pnpm readback` written and run. |
| 07:25 | Rule's tie-break amended (speeds within 10% count as equal). Sweep restarted; finished work skipped. |
| 07:29 | Fix: a timed-out call had been recorded as a machine error and left out of counts; now a failed run. Two earlier rows left as recorded. |
| 07:40 | Ten spoken turns timed (5.8 s middle). Speech synthesis changed to one clip per sentence, made ahead. |
| 08:17 | Sweep paused: it drew twice the 55 W charger's supply (battery 100% → 16%). 373 calls, 28 configurations so far. |
| 08:20 | Sweep cut to a short version at Luke's request; battery guard added. Decided: local models only; Claude route written, not run. |
| 09:02 | Medium part finished. |
| 09:47 | Large part finished: 787 calls, 55 configurations. |
| 09:58 | Four-hour point. Tag `four-hour-mark` on `3b5ef30`, the last commit before it. |
| 10:36 | Raw results committed; rule applied (`pnpm sweep:report --apply`); choice in `evals/sweep/DECISION.md`. |
| 10:40 | Code-standards pass begins. `pnpm golden` written first, baseline from untouched code (tag `pre-refactor`). |
| 11:45 | Found: at temperature 0.7 the follow-up writer does not repeat with a fixed seed (2 of 20 identical). At 0, and for the menu-picker, it does. Same on the old code (`evals/repeatability/`). |
| 12:22 | Pass merged: 22 commits. `pnpm golden` identical (516 request sets, 784 replies); sweep report, chart and note index byte-identical. Tests 182 → 346, plus 11 on the emulators. Browser run passed. |
| 12:23–13:09 | Every check, three runs per case, on starting, all-small, chosen, and chosen + improvement (`12-23-42`, `12-29-37`, `12-34-37`, `12-49-46`). Wrong quotation end to end: 5 of 24 → 1 of 24. Support check wrong acceptances: 6 of 30 → 0 of 30. With the improvement, 0 of 24, but the traces show it was not the cause. |
| 13:10 | Fix before held-back: a cut-off call in the end-to-end check had been left out of counts; now a failure. `pnpm check` refuses to run under 15% battery. |
| 13:16 | Improvement switched on and frozen (tag `improvement-frozen`). `config/steps.chosen.json` keeps the rule's choice without it. |
| 13:45 | Ten spoken turns on final settings: 1.8 s middle (1.5 to 2.3), against 5.8. |
| 13:49 | Change rehearsal on a copy of the case file: new value and new unit (µm) right 10 of 10 each (`evals/rehearsal/`). |
| 15:25–15:43 | Held-back cases opened once: start, chosen, chosen + improvement (`15-25-35`, `15-27-56`, `15-37-15`; tag `held-back-opened`). Wrong quotation 2 of 18 → 0 of 18. Improvement 3 of 6 against 4 of 6. Nothing re-chosen. |
| 15:28–15:40 | No-model work alongside: `pnpm leak-scan` added; two tests added; dev server refused the case file, note, settings and key file (403). |
| 15:50 | All 24 findings match the supplied case document. Turn labels checked in greyscale. |
| 15:52 | Fresh clone, no key file: `pnpm verify` (358 tests) and the emulator tests passed; both required questions answered by typing. |
| 17:35–18:43 | Last run of every check on shipped settings (`17-35-09`), made with the laptop asleep: it slept three times, and calls ran two to three times slower. Seven timed-out calls put down to that. Not put down to it: one wrong quotation in 24 end to end (page 8, wording kept, so the improvement's check was not asked). Record for shipped settings: 1 in 48. Kept as `evals/checks/improved-asleep.md`; `CHECKS.md` stays on the 12:49 run. |
| 18:57 | Write-ups updated. |

## 25 November

| When (UTC) | What |
|---|---|
| 13:28 | Second improvement: 26 new menu-picker cases, the second look (off by default) and `evals/near-miss/RULE.md` committed before any run (tag `near-miss-rule`). |
| 13:29–13:46 | 12 configurations on the tuning cases. |
| 13:48 | Choice committed (tag `near-miss-chosen`): medium, temperature 0, second look on. |
| 13:48–13:49 | Held-back selector cases opened once: 24 → 25 of 27. |
| 13:50–13:54 | Adopted in `config/steps.json`; required checks re-run: "not in the case" 10 of 10. Swap in use was 23 GB. |
| 13:55 | Prettier config made identical to the reference service (80 columns); comments cut from 1,431 lines to 273. Syntax trees of all 228 files unchanged; `pnpm verify` passes. |

## Things seen before the sweep

The choosing rule (07:00) was written after the first required-check run on the starting
settings, so these were already known. No other configuration had been run.

1. Asked for central corneal thickness (not in the case), the cornea was revealed in 8 of 10 runs.
2. With the supporting passage removed, the revision step quoted the page 8 sentence about a
   different condition, rewrote the advice to match, and the support check accepted it (3 of 3).
3. When the gap is the diagnosis, a compound statement, no single sentence backs it, so the
   trainee is told "no support".
4. A code rule for "no support" cannot work: scores for covered points (0.62 to 0.86) overlap
   invented ones (0.60 to 0.68) (`evals/retrieval-table.md`).
