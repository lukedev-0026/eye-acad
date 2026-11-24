# 5. Acceptance criteria

The app is done when every statement below is true. Each has a way to check it.

## Signing in and privacy

| # | Must be true | How it is checked |
|---|---|---|
| 1 | Before signing in, nothing about the case is visible. | Open an attempt's address in a private window. |
| 2 | A second trainee cannot open, list or change the first trainee's attempts. | An automated database test, and by hand with the second demo account. |
| 3 | The hidden answers never reach the browser. | Search everything the browser receives, and the built app, for a word that appears only in the hidden notes. |

## Asking for findings

| # | Must be true | How it is checked |
|---|---|---|
| 4 | "What is the intraocular pressure in the right eye?" shows and says: right eye, 58 mmHg, Goldmann applanation, 23:55. Never 18, never "left". | Typed ten times; spoken once. |
| 5 | "What are the pressures?" gives both eyes, each named. | Typed and spoken. |
| 6 | Every finding matches the supplied case document, with no doubled units and no blank or "null" text. | One command prints all of them for comparison. |
| 7 | History questions ("Any allergies?", "What medications?") return the case file's wording exactly. | Typed and spoken. |

## Things that are not available

| # | Must be true | How it is checked |
|---|---|---|
| 8 | Right-eye gonioscopy gives "Not available: No view: corneal oedema", with nothing from the left eye. | Typed ten times; spoken once. |
| 9 | The pupil-defect test gives its stated reason, and the leftover text in its result field appears nowhere. | Typed ten times. |
| 10 | Something not in the case (corneal thickness) gives "That isn't recorded for this case", and nothing is revealed. | Typed ten times. |

## The follow-up question

| # | Must be true | How it is checked |
|---|---|---|
| 11 | Exactly one follow-up is asked, aloud and on screen, alongside the trainee's words it responds to. | A full run, then a second answer to confirm no second question. |
| 12 | Every follow-up spoken passes the allowed-words test. An answer containing a planted instruction still gets a normal question. | Five sample answers, three runs each, read by a person. |

## Knowing whose turn it is

| # | Must be true | How it is checked |
|---|---|---|
| 13 | One label always says: Your turn, Listening, Examiner is thinking, or Examiner is speaking. It is readable without colour. | Viewed in greyscale. |
| 14 | The microphone cannot be used while the examiner is speaking. | By hand. |
| 15 | If audio or the speech service fails, the text still appears and the screen returns to "Your turn". | Run with the speech key removed. |

## Saving and reopening

| # | Must be true | How it is checked |
|---|---|---|
| 16 | After a page refresh, both sides of the conversation and the uncovered findings are still there. | Refresh mid-session. |
| 17 | Earlier attempts can be reopened from a list. | By hand. |
| 18 | An old attempt still shows what was said at the time, even if the case file changes later. | Change a value, reopen the old attempt. |

## The revision point

| # | Must be true | How it is checked |
|---|---|---|
| 19 | One sentence of advice is shown with a page number, a short word-for-word quote, and the list of pages that were searched. | A full run. |
| 20 | The quote appears exactly in the reference note on the stated page. | Searched for in the note's text. |
| 21 | Two answers with different gaps get different advice, each naming its gap. | Two sample answers. |
| 22 | When the note cannot support the point, the trainee is told so and no page or quote is shown. | Remove the supporting passage; add a key point the note does not cover. |
| 23 | The support check rejects the wrong-section quote from page 8 and two other known mismatches, and accepts the right one. | Four fixed pairs, three runs each. |
| 24 | The right passage is among the top six for all six key points and all three follow-up topics. | The comparison table. |
| 25 | If meaning-based search is unavailable, the revision point still works on word-matching alone. | Run with it switched off. |

## Surviving a change

| # | Must be true | How it is checked |
|---|---|---|
| 26 | Changing a value, adding a new finding with an unfamiliar unit, or marking a finding unavailable all work without touching the code. | A rehearsal on a copy of the case file. |
| 27 | Changing the reference PDF without re-preparing it stops the revision panel with a clear message. | By hand. |

## What is said aloud

| # | Must be true | How it is checked |
|---|---|---|
| 28 | For every finding, the spoken audio contains the right eye, number and unit, or each failure is listed. | The read-back check: speech is turned back into text and compared. |

## The write-up

| # | Must be true |
|---|---|
| 29 | A fresh copy of the project can be run by following the instructions alone. No passwords or keys are included. |
| 30 | It states what works, what partly works, the real time spent, and what existed at the four-hour point. |
| 31 | It names the speech technology, why it was chosen, and one alternative with the reason it lost. |
| 32 | It says exactly when the response timer starts and stops, what it leaves out, and gives the middle value, range and number of runs. |
| 33 | It shows the three required checks with input, expected result, observed result, runs passed, model and date. The citation check lists the pages searched, the passage quoted and a person's yes or no. |
| 34 | It explains how the reference note was prepared and how passages are chosen, and gives one example of AI-tool help with how it was verified. It names one improvement: the weakest area the measurements showed, why that counted as weakest, and the counts before and after the fix. |

## Choosing the settings

Added on 24 November 2026. File 07 explains the method these criteria check. "Configuration"
means one AI step with one value chosen for each setting.

| # | Must be true | How it is checked |
|---|---|---|
| 35 | Changing which model or setting an AI step uses means editing one settings file, not the code. | Change one step's model in the file, re-run the checks, and confirm the results name the new model. |
| 36 | Before any model is measured, every grader passes its own expected answers, and the score a lazy constant answer would get is known. | The pre-check command prints both. |
| 37 | Each setting is shown to do what it says on each model. Thinking on produces thinking and off produces none. Forced format produces output in the right shape. Temperature 0 gives the same answer on repeat, or the variation is reported. No prompt is cut short. A setting that fails is dropped and listed as "not tested". | The pre-check command. |
| 38 | The rule for choosing the final settings, and the split of cases into tuning and held-back, are saved in the project history before the first measured run. | The project history shows the order. |
| 39 | The overnight run can be stopped and restarted without repeating finished work, and it stops cleanly at a time limit. | Stop it part-way, restart it, and compare the count of calls made. |
| 40 | A results table has one row per configuration: the step, model, size, temperature, thinking, forced format, prompt wording, cases passed out of cases run, the middle, fastest and slowest response time, and the date. It is built only from the raw results. | Rebuild it from the raw results and compare. |
| 41 | A chart plots accuracy against response time, one dot per configuration, with the starting and the chosen settings labelled. It is built only from the results table. | Rebuild it and look. |
| 42 | The chosen settings are the ones the written rule picks on the tuning cases. The numbers reported for them come from the held-back cases, which cannot be opened until the choice is saved, and which are run once. Any departure from the rule is stated with its reason. | The report command re-applies the rule and must print the same settings the app is using. |
| 43 | The write-up gives the trade-offs, quotes at least one real failing output for each weaker setting it rules out, and lists what was not run. It says how many configurations ran out of how many were possible, and does not call the comparison complete. | Read the write-up against the results table. |
| 44 | The improvement targets the weakest measured area under the chosen settings. Before and after are run on the same held-back cases in one sitting, and the write-up gives both counts, the cases fixed and the cases broken. | The saved results for both runs. |
| 45 | Every timing is saved with the computer's power mode and swap use, and the drift of the reference setting across the run is reported. | Columns in the results table; the drift figure in the write-up. |
| 46 | No number is reported for a model service that was not run. If the Claude route was not run, the write-up says "written, not run". | Read the write-up. |
