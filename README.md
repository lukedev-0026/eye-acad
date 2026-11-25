# Practice viva

A voice-driven practice oral exam ("viva") for trainee eye doctors, built for the Eye Academy
developer take-home on **TanStack Start, Firebase Auth and Firestore**.

A signed-in trainee asks an examiner, aloud or by typing, for findings about one fictional
patient. The examiner reads each finding back and shows it. When the trainee presses **Give my
answer**, the examiner asks one follow-up question about what they said. Afterwards the trainee
gets one revision point, backed by a page number and a word-for-word quotation from the reference
note. Attempts are saved and private to their owner.

**The idea that shapes everything: the language model never writes a clinical fact.** It picks
from a fixed menu of finding names, and ordinary code looks the result up in the case file and
builds the sentence that is shown and spoken. A wrong value, a swapped eye or an invented result
cannot be produced. The menu-picker never sees the diagnosis. The follow-up writer does see the
examiner's notes, but its question is used only if every meaningful word comes from the
trainee's answer or the case file's own questions, so it cannot give the answer away.

| Read next | For |
|---|---|
| [`CHECKS.md`](CHECKS.md) | Every check, with the input, the expected and observed result, and the runs passed |
| [`SWEEP.md`](SWEEP.md) | How the model settings were chosen by measurement |
| [`HANDOVER.md`](HANDOVER.md) | How the note was prepared, how passages are chosen, AI-tool use, the improvement, next steps |

## Run it

| Tool | Version | Why |
|---|---|---|
| Node | 22.12 or later (`.nvmrc` pins 22.23.3) | Vitest 5 and Firebase 12 do not support Node 23 |
| pnpm | 10 | |
| Java | 21 | The Firebase emulators |
| [Ollama](https://ollama.com) | 0.40 or later | The language models and embeddings, run locally |
| A Deepgram key | optional | Speech in and out. Without it the app works by typing |

```bash
nvm use
pnpm install                    # warns that some build scripts were ignored: expected

ollama pull nomic-embed-text    # 0.3 GB, meaning-based search of the note
ollama pull qwen3.5:9b          # 7.6 GB, the medium model
ollama pull qwen3.5:4b          # 4.0 GB, the small model

cp .env.example .env.local      # add a Deepgram key here (optional)

pnpm emulators                  # terminal 1: Firebase Auth + Firestore, local, no account needed
pnpm dev                        # terminal 2: http://localhost:3000
```

Open <http://localhost:3000> in Chrome and click **Sign in as Trainee A**. The second demo trainee
is there to show that one cannot open the other's attempts.

| Command | What it does |
|---|---|
| `pnpm findings` | Every finding exactly as it will be shown and spoken |
| `pnpm verify` | Everything with no model: format, lint, types, 358 tests, the golden check, a build, the leak scan |
| `pnpm test:integration` | The Firestore privacy rules (needs `pnpm emulators`) |
| `pnpm check` | Every AI-backed check through the app's real code; rewrites `CHECKS.md`. `--only required` for the brief's three |
| `pnpm readback` | Speaks every sentence, transcribes it back, and checks the eye, number and unit survived |
| `pnpm ingest` | Re-prepares the reference note (needs `brew install poppler`) |
| `pnpm sweep:*` | The settings comparison in `SWEEP.md` |

**Changing something.** The case file (`data/case-EA-VIVA-001.json`) and the settings file
(`config/steps.json`) are read fresh on every request, so an edit takes effect on the next
question. Check it with `pnpm findings`, then `pnpm check --only required`. An earlier attempt
still shows what was said at the time. If the reference PDF changes, the revision panel stops
with a message until `pnpm ingest` is re-run.

## How it works

| Part | What happens | Who writes the words |
|---|---|---|
| Asking for a finding | Speech to text. A model picks names from the menu. Code applies fixed rules (no eye named means both; an unavailable finding gives its stated reason) | Code, from the case file |
| The follow-up | A model drafts a question. It is used only if it passes the allowed-words test; otherwise one of the case file's questions is asked as written | Model, checked by code; or the case file |
| The revision point | A model judges what the answer missed. Code searches the note (word match and meaning, combined, top six). A model picks a sentence by number and writes one line of advice. A separate model call checks the quotation backs it | Quotation and page: code. Advice: model, checked by code |
| Saving | The server writes each attempt under its owner's id; a browser can read only its own. Hidden working notes are in a record no browser can read | |

**Code layout.** Layered folders, and ESLint fails the build if an import goes the wrong way:
`routes`/`features` → `server` → `application` → `infrastructure` → `domain` → `config`/`common`,
with the measurement harness in `src/eval`. Settings are read only in `src/config`; errors keep
their cause and map to a proper HTTP status; logging is structured, with no transcript, notes or
keys. The app was written flat first, measured, then reorganised. `pnpm golden` proved nothing
changed: the exact request sent to a model for every test case (516 sets), and every saved model
reply replayed (784), stayed identical.

## Voice

**Chosen: separate speech-to-text and text-to-speech, both on Deepgram.** Speech to text is
`nova-3-medical` in UK English, given the finding names as key terms (falling back to `nova-3`).
Text to speech is `aura-2-draco-en`, a British voice. Because the spoken sentence is the same
string code built for the screen, what the trainee hears cannot differ from what they see.
Deepgram gives one key for both directions, a medical model, plain HTTP and free credit.

**Turned down: a single speech-in, speech-out "realtime" model.** It sounds more natural and
answers sooner, but the model then words the finding itself, and the eye, value and unit can only
be checked after the trainee has heard them. For clinical values, exact beat natural.

The trainee holds a button to talk, so a pause to think does not end the turn. Each sentence of a
reply is its own whole clip, so it can never cut off halfway through a number.

## How a voice turn is timed

The timer **starts** when the trainee releases the talk button and **stops** when the browser
reports the reply audio is playing ("ready and started", not the instant sound reaches the ear).
It includes upload, speech to text, the model, building the sentence, text to speech, and
download. It leaves out the trainee's speaking time and the reply's playing time. The viva page
shows each turn's timings.

Ten spoken turns each, in Chrome, on one Mac (M4 Max, High Power), with a synthetic voice sent
down the same path as the held button:

| | Middle value | Range | n |
|---|---|---|---|
| **As shipped:** one clip per sentence, made ahead | **1.8 s** | 1.5 to 2.3 s | 10 |
| First version: one clip per reply, made when needed | 5.8 s | 4.0 to 10.8 s | 10 |

Now speech to text is 1.1 s and the model 0.5 s (before the second improvement, which adds about
0.4 s when something is picked; not re-timed); text to speech is 0 s because the clips are made
while the opening is read. The first turn after the model has been idle takes 3.6 s and is left
out. Not measured: a real voice, a slow network, another machine. Raw rows:
[`evals/voice-timing/`](evals/voice-timing/).

## Local models, on purpose

The five AI steps run on local `qwen3.5` models through Ollama. That costs nothing to run or try,
needs no one's key, and exposes every setting (temperature, thinking, a fixed seed), so the
settings were chosen by measurement. Because code writes every value, quotation and page, a
weaker model shows up as a wrong menu pick or a fallback to pre-written text, never as an
invented finding. The cost: weaker judging than a large hosted model, and several gigabytes of
download. A Claude adapter (`src/infrastructure/llm/anthropic.provider.ts`) is **written, not
run**. No result here comes from it.

## The three required checks

`pnpm check --only required`, through the app's own code, typed input, shipped settings. The run
of 12:49 on 24 November 2026, written out in full in [`CHECKS.md`](CHECKS.md).

| Check | Input | Observed | Runs passed | Model |
|---|---|---|---|---|
| **1. Available finding** | "What is the intraocular pressure in the right eye?" | Shown: "Right eye · Intraocular pressure: 58 mmHg (Goldmann applanation, 23:55)". Never "left", never 18 | **10 of 10** | `qwen3.5:9b` picks; code writes |
| **2. Unavailable finding** | "Can I have gonioscopy of the right eye?" | "Right eye · Gonioscopy: Not available: No view: corneal oedema". Nothing from the left eye | **10 of 10** | the same |
| **3. Citation supports the revision point** | An answer covering everything but the allergy (`evals/required.json`) | "Check for sulfonamide allergy before giving acetazolamide." Quoted from p. 6: "Check for sulfonamide allergy, kidney disease, low potassium and sickle cell disease before giving it." Support check: supported | **5 of 5** | `9b` judges the gap; `4b` picks and checks |

For check 3: **pages searched** 4, 5, 6, 8 and 9 (the right passage, running from p. 5 to p. 6,
came first in both searches). **Passage quoted:** p. 6, "Systemic carbonic anhydrase inhibitor",
which names acetazolamide on p. 5. **A person's yes or no:** _to be filled in by Luke, here and in
`CHECKS.md`_. Checks 1 and 2 were also asked aloud once each, and answered with the same words.

## What works, and what does not

Runs passed of runs made, shipped settings, typed unless stated. Source: `CHECKS.md` (24 November).
The required checks were run again on 25 November after the second improvement
([`evals/near-miss/DECISION.md`](evals/near-miss/DECISION.md)): the same results, except
as noted for "not in the case".

**Works**

- **Sign-in and privacy.** Nothing about the case shows before sign-in. The second trainee is
  refused by the database rules and the server (HTTP 404; 11 emulator tests). `pnpm leak-scan`
  finds no case text in anything the browser downloads.
- **Findings.** The pressure 10 of 10 and gonioscopy 10 of 10 (also aloud). The pupil-defect
  test gives its stated reason and never the leftover text in its result field, 10 of 10. All 24
  values match the supplied case document.
- **Something not in the case** ("What is the central corneal thickness?") gives "That isn't
  recorded for this case", 10 of 10, since the second improvement (it was 3 of 10).
- **One follow-up**, asked once, aloud and on screen. A second answer is refused; a refresh does
  not ask again.
- **Whose turn it is.** One label with its own symbol and words for each state, readable in
  greyscale; the talk button is disabled unless it is the trainee's turn.
- **Saving.** A refresh keeps both sides and the uncovered findings; old attempts reopen as they
  were.
- **The revision point** with page and quotation, 5 of 5; "no support" for a point the note does
  not cover, 3 of 3.
- **Changes without code.** A new value and a new finding in an unfamiliar unit (µm) were right
  10 of 10 each ([`evals/rehearsal/`](evals/rehearsal/README.md)). If speech fails, the text still
  appears and the screen returns to "Your turn".

**Partly works**

| What | Observed |
|---|---|
| "No support" with the supporting passage removed | **2 of 3** (1 cut off; 1 of 3 on 25 November). In a later run, 1 of 3 end to end showed the page 8 sentence, about a different condition, as support. This is the fault the improvement went after |
| Three of the seven possible revision points | The diagnosis and two compound key points: no single sentence backs all of one, so the trainee is usually told "no support" for something the note covers |
| The support check, which thinks first | Cut off in 2 of 24 end-to-end runs; the trainee is asked to try again |
| "Tell me everything you've got" | Should ask for specific findings; on the held-back cases it ran out of room in 3 of 3 and said "Sorry, something went wrong" |
| What is said aloud | 27 of 32 sentences heard back correctly every run. The eye was never lost; "23:55", "Snellen" and "dioptres" are the weak spots ([`evals/readback.md`](evals/readback.md)) |
| Follow-up quality, and real voices | Checked by code only. A person's read (`evals/sweep/followup-read.md`) and real voices are not done |

**Not done.** Interrupting the examiner by voice (by design). Running the Claude adapter.
Deployment (it runs on the emulators, which the brief allows). A clinician reading the expected
answers behind every count. CI on GitHub (it mirrors `pnpm verify`, which passes locally).

**A second run, with the laptop asleep** (17:35), gave the same results for checks 1 and 2.
Calls that ran out of time while the laptop slept are not counted against the app. It is kept as
[`evals/checks/improved-asleep.md`](evals/checks/improved-asleep.md).

## What measuring improved, and the two improvements

**Choosing the settings by measurement** ([`SWEEP.md`](SWEEP.md)) gave the clearest gain. The
main change was turning thinking on for the support check:

| | Starting settings | Chosen settings |
|---|---|---|
| A wrong quotation shown to the trainee, tuning cases | 5 of 24 runs | 1 of 24 |
| The same, **held-back cases** (opened once, after the choice) | **2 of 18** | **0 of 18** |
| The support check accepting what it should refuse | 6 of 30 | 0 of 30 |

**The first voice timings** led to one clip per sentence, made ahead: 5.8 s to 1.8 s.

**The first improvement (the brief's "weakest area" fix) was built and measured, and did not help.**
The weakest area was the revision step quoting a different condition's sentence and rewording the
advice to fit. The fix is a second support check against the key point itself. On the held-back
cases there was nothing left for it to catch, and it cost correct answers: 4 of 6 cases passing
every run without it, 3 of 6 with it; none fixed, one broken. It stays switched on, because the
decision was recorded before the held-back cases were opened and they report on a choice rather
than make it. On this evidence it should come off: one line in `config/steps.json`.
[`HANDOVER.md`](HANDOVER.md) has the detail.

**The second improvement worked.** It went after the one acceptance criterion that was not met: asked
for something not in the case, the menu-picker read out the nearest finding instead (corneal
thickness gave the cornea). The fix is a second look: one more quick call, made only when
something was picked, asking whether each pick is the thing asked for or only related to it. 26
new cases were written and split first, and the choosing rule committed before any run
([`evals/near-miss/`](evals/near-miss/RULE.md)). Twelve configurations (small and medium model,
temperature 0 and 0.7, no fix, a stricter prompt, or the second look) ran in 17 minutes.

| Menu-picker | Shipped | With the second look (medium, temperature 0) |
|---|---|---|
| Near misses answered "not recorded", tuning | 3 of 10 cases | **10 of 10** |
| Close-but-present requests still answered, tuning | 5 of 5 | 5 of 5 |
| Something revealed that was not asked for, tuning | 16 runs | **0** |
| **Held-back cases** passing every run (opened once) | 24 of 27 | **25 of 27**: 1 fixed, none broken |
| Required check: "central corneal thickness?" | 3 of 10 | **10 of 10** |

The stricter prompt alone helped the medium model (8 of 10) and made the small one worse (1 of
10). The cost of the second look is about 0.4 s more on a turn where something is picked; spoken
turns have not been re-timed with it. The new held-back near misses were all already right on the
shipped settings, so the held-back gain rests on one case: the corneal-thickness question itself.

## Time, and the four-hour point

The brief sets four hours. This build was not held to that, by choice. Times are GMT on
24 November 2026, from commits and the build log at the end of this file.

| | |
|---|---|
| Build started | 05:58, from the planning documents alone |
| The four-hour point | 09:58. Tag `four-hour-mark` on `3b5ef30`, the last commit before it |
| Last change | 18:57, about 13 hours by the clock |

That includes about 1¼ hours of the settings comparison running by itself, and about 4¾ hours
waiting for the laptop's battery (the model runs drew more than its 55 W charger supplies).
**Luke's own time at the keyboard:** _to be filled in by Luke_.

**At the four-hour point** (`git checkout four-hour-mark`): the whole app by typing and voice;
the first run of the three required checks; test cases for all five AI steps and the choosing
rule; the comparison 373 of 787 calls in; the read-back check; the first voice timings and the
change they led to; the design documents. No README.

**After it:** the comparison's report and the chosen settings (10:36); the code reorganised
(10:40 to 12:22); every check three times on three settings (12:23 to 13:09); the improvement
frozen (13:16); final voice timings and the change rehearsal (13:45); the held-back cases, opened
once (15:25); a run from a fresh clone; the write-up.

Planning and research were done beforehand, and the build throughout, with an AI coding assistant
(Claude Code). The planning documents are in the project history (`git show c2b0229:docs/planning/`).

## AI costs

- **Language models:** none paid for. All five steps ran locally.
- **Deepgram:** the free starting credit, a few hundred short requests each way. Credit used: _to
  be filled in by Luke from Deepgram's usage page_.
- **Claude Code:** a subscription, not billed per request. Nothing was spent on Claude's API.

## Build log

Times are UTC on 24 November 2026, from commits and run ids. Build time is wall-clock from the
first line, with the AI coding assistant working and Luke checking in. Planning happened before
this.

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

### 25 November

| When (UTC) | What |
|---|---|
| 13:28 | Second improvement: 26 new menu-picker cases, the second look (off by default) and `evals/near-miss/RULE.md` committed before any run (tag `near-miss-rule`). |
| 13:29–13:46 | 12 configurations on the tuning cases. |
| 13:48 | Choice committed (tag `near-miss-chosen`): medium, temperature 0, second look on. |
| 13:48–13:49 | Held-back selector cases opened once: 24 → 25 of 27. |
| 13:50–13:54 | Adopted in `config/steps.json`; required checks re-run: "not in the case" 10 of 10. Swap in use was 23 GB. |
| 13:55 | Prettier config made identical to the reference service (80 columns); comments cut from 1,431 lines to 273. Syntax trees of all 228 files unchanged; `pnpm verify` passes. |

### Things seen before the sweep

The choosing rule (07:00) was written after the first required-check run on the starting
settings, so these were already known. No other configuration had been run.

1. Asked for central corneal thickness (not in the case), the cornea was revealed in 8 of 10 runs.
2. With the supporting passage removed, the revision step quoted the page 8 sentence about a
   different condition, rewrote the advice to match, and the support check accepted it (3 of 3).
3. When the gap is the diagnosis, a compound statement, no single sentence backs it, so the
   trainee is told "no support".
4. A code rule for "no support" cannot work: scores for covered points (0.62 to 0.86) overlap
   invented ones (0.60 to 0.68) (`evals/retrieval-table.md`).
