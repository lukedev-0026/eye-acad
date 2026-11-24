# 6. Build plan

## Order of work

Each step ends with something that can be shown working. Steps 8 to 11 are the comparison of
settings, which file 07 explains.

| Step | What gets built | It is done when |
|---|---|---|
| 0. Foundations | The empty project, sign-in with two demo accounts, the local database, and the lock on the case file. | A signed-in user can reach a protected page, a signed-out one cannot, and the case file cannot be fetched by the browser. |
| 1. Reading findings | The code that turns a row of the case file into a sentence to show and a sentence to say. | All 24 findings and the patient history have been read once against the supplied case document. |
| 2. Typed questions | Typing a question, the AI choosing from the menu, saving, the list of attempts, reopening, and the privacy rules. Also the one settings file that says which model and settings each AI step uses, and a checks command that accepts any settings. | Required checks 1 and 2 are recorded on the starting settings. A refresh keeps everything. The second account is refused. |
| 3. Voice | The examiner speaking, then the trainee speaking, the "whose turn" label, and the timer. | A spoken question is shown and spoken back correctly. |
| 4. Answer and follow-up | The "Give my answer" button and the single follow-up question. | Sample answers get fitting follow-ups, asked exactly once, even after a refresh. |
| Marker | A marker is placed in the project history at four hours of build time, wherever the work stands. | The marker exists. |
| 5. Searching the note | Preparing the reference note, both kinds of search, and the comparison table. | The right passage is in the top six for every key point and follow-up topic. |
| 6. Revision point | Working out what was missed, choosing the quote, the support check, the on-screen card, and "no support found". | Required check 3 and the support-check pairs are recorded. |
| 7. Wider checks | The read-back check, attempts at tricking it, and a change rehearsal. Sets of test cases for all five AI steps, each case with its expected answer and marked "tuning" or "held back". | Every check passes on the starting settings, or each failure is explained. Luke has read the expected answers. |
| 8. The sweep | The alternative prompt wordings, written and then frozen. The pre-check. The choosing rule and the split of cases saved in the project history. Then the unattended overnight run. | The pre-check passes, or drops a setting by name. The run finishes, or stops at its time limit. |
| 9. Report and choice | The results table, the chart, the rule applied, the decision saved, the settings file updated, and every check re-run through the app on the chosen settings. | The app runs on the chosen settings and the checks table is regenerated. |
| 10. The improvement | One fix for the weakest measured area, built from failures on the tuning cases, then frozen. | The fix is saved in the project history before the held-back cases are opened. |
| 11. Held-back cases | Opened once and run three ways: starting settings, chosen settings, and chosen settings with the improvement. | The three sets of counts are recorded and nothing is re-chosen. |
| 12. Finish | A run from a clean start, the write-up, a final search for leaked hidden answers, and these documents updated to match. | The write-up claims only what the last run showed. |
| Later | Running the Claude route and a smaller comparison on it. Only if a key is supplied. | Its own results rows and chart, inside a fixed spend limit. |

## Timetable

All times are GMT. The deadline is 23:59 on Wednesday 25 November 2026. On the morning of
24 November about 42 hours remained and the app was not yet built, so the timetable is tight.

| When | What |
|---|---|
| 24 Nov, daytime | Steps 0 to 7. The medium model is downloaded first; the other two download in the background. |
| 24 Nov, evening | Luke reads the expected answers, switches Low Power Mode off and restarts the Mac. |
| 24 Nov, evening to 25 Nov 06:00 | Step 8. The sweep runs unattended overnight. |
| 25 Nov 06:00 to 09:00 | Step 9. |
| 25 Nov 09:00 to 13:00 | Steps 10 and 11. |
| 25 Nov 13:00 to 19:00 | Luke's spoken runs and blind read of the follow-up questions. Step 12. |
| 25 Nov 19:00 to 23:59 | Margin. Luke publishes and submits. |

## If the build runs late

The app, and the things the brief itself asks for, are never cut to make room for the sweep. The
sweep shrinks instead, in this fixed order (file 07 explains the blocks):

1. Block 3, the optional extra round, goes first.
2. Then the two probes of the repetition penalty.
3. Then block 2 for the follow-up and revision steps.
4. Then block 2 altogether.

The smallest sweep still worth reporting is block 1 (model size, thinking and forced format) for
three steps: the menu-picker, the "what did the answer miss" judge, and the support check.
Whatever was not run is listed in the write-up.

## Fallbacks if something does not work

These are replacements for things that fail, not ways of saving time.

| If | Then |
|---|---|
| The medical speech model will not accept our list of clinical terms | Use the general model. |
| The server cannot save to the local database reliably | Let the browser save, under the same privacy rules, and say so. |
| Meaning-based search cannot be made to work locally | Ship word-matching only and report that in the comparison table. |
| The large local model is too slow to compare fully | Measure it on the judging steps only, and say so. |
| A setting turns out not to work on a model (found in the pre-check) | Drop that setting by name and list it as "not tested". |

## What is needed from Luke

| Item | Why |
|---|---|
| A Deepgram account and key, by the time voice is built on 24 November | For speech. Its pricing page says $200 free credit with no payment card. It is the only key the build needs. |
| No paid keys | Nothing is paid for. A Claude key is needed only if the Claude phase is wanted before submission, and it would run under a fixed spend limit of £8. |
| Agreement to three model downloads, about 33 GB in total | The small, medium and large local models. The machine had 99 GB free when checked. |
| Low Power Mode switched off, and a restart, before the overnight run | The Mac reports a power setting that reads as Low Power Mode even when plugged in, and about 5 GB of swap in use. Both would distort timings. System settings are Luke's to change. |
| The machine left on overnight on 24 November, plugged in, with nothing else using Ollama | So the timings are clean. |
| About 45 minutes reading the expected answers, before the sweep starts | Roughly 40 questions for the menu-picker, 12 sample answers with 7 judgements each, and 16 support-check pairs. These are judgement calls, and the sweep is scored against them. |
| A blind read of the follow-up questions from the three confirmed settings | Two yes-or-no questions each. Whether a question fits is a human judgement. |
| The spoken test runs, on the afternoon of 25 November | The AI building this cannot use a microphone: one spoken run per required check, and ten timed turns. |
| Publishing the project and sending the submission | These stay with Luke. |

## How the finished app is checked

| Command or action | What it shows |
|---|---|
| `pnpm findings` | Every finding as it will be shown and spoken, straight from the current case file. |
| `pnpm test` | The fixed-logic tests and the privacy test. |
| `pnpm check` | All AI-backed checks, run through the app's real code on whatever settings are configured, with a results table written out. |
| `pnpm ingest` | Re-prepares the reference note. Running it on the supplied PDF should change nothing. |
| `pnpm readback` | The check on what is actually said aloud. |
| `pnpm sweep:preflight` | The pre-check: the graders pass their own expected answers, and each setting is shown to take effect on each model. |
| `pnpm sweep --plan` | Prints which configurations would run, how many calls that is, and a time estimate from a short timing test. Runs nothing. |
| `pnpm sweep` | The overnight run. Stopping and restarting skips finished work. |
| `pnpm sweep:report`, then `pnpm sweep:chart` | The results table and the chart, built from the raw results only. The report re-applies the choosing rule and must print the same settings the app is using. |
| Switch test | Change one step's model in the settings file, run `pnpm check`, and confirm the results name the new model. |
| A full session by voice | Refresh, reopen from the list, sign in as the second user and confirm refusal. |
| Walkthrough rehearsal | Change one value in the case file, re-run the commands above, ask once aloud. |

## Honest notes on time and help

- The brief sets four hours. This build is not held to that. The write-up will give the real time.
- Planning and research were done beforehand with AI assistance, and that will be stated.
- The marker at four hours shows what a strict four-hour build would have contained.
- The hours the computer spends running the sweep unattended are reported separately from
  hands-on time.
- The estimate for the overnight run, four to six hours, rests on assumed speeds. It is replaced
  by a measured estimate before the run starts.
