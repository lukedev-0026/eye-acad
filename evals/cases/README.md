# Test cases

These files hold the cases the checks and the settings comparison are run on. Each line of a
`.jsonl` file is one case, written as JSON.

**The expected answers here are judgement calls made by a person (with AI help), not facts.**
Where a case could reasonably be marked two ways, it says so in its `note`. Anyone relying on
the results should read the cases first, starting with the ones that carry a note.

## Fields every case has

| Field | Meaning |
|---|---|
| `id` | A unique name for the case. |
| `split` | `tune` or `holdout`. See below. |
| `type` | What kind of difficulty the case is testing. Results can be grouped by it. |
| `input` | What is given to the AI step. |
| `expect` | What a correct result looks like. |
| `note` | Optional. The reasoning behind a judgement call. |

## Tuning cases and held-back cases

- **`tune`** cases are used to choose the settings and to decide what to improve.
- **`holdout`** cases are held back. They are opened once, at the end, and used only to report
  how the chosen settings do. Nothing is chosen or changed after looking at them.

About 60% of each file is `tune` and 40% is `holdout`. Which side a case lands on was decided by
a fixed rule that cannot see what the case tests or how any model does on it: within each type,
cases are ordered by the SHA-256 hash of their `id`, and the first ones go to `tune`. One case
was placed by hand: `cov-allergy-gap` is in `tune` because it is the worked example used
elsewhere in the project. A type with only one case can only be on one side.

## The five files

### `selector.jsonl` — 40 requests for findings (24 tune, 16 held back)

Tests the step that reads what the trainee asked and picks items from the fixed menu.

- `input.utterance`: what the trainee said.
- `input.previous`: what was asked for on the turn before, as menu names and eyes. Empty unless
  the case is a follow-on such as "and the left?".
- `expect.kind`: what the examiner should do.
  - `reveal`: read out findings. `expect.ids` lists exactly which rows: finding ids from the
    case file (`iop_right`), or `history:` plus a history field (`history:allergies`). A finding
    that is unavailable is still "revealed": the examiner says it is unavailable and why.
  - `not_recorded`: say the thing asked for is not in the case.
  - `too_many`: ask the trainee to be specific.
  - `wants_to_answer`: point the trainee to the "Give my answer" button.
  - `other`: ask for a finding or part of the history.
- `expect.acceptKinds`: other outcomes that are equally acceptable. Used for attempts to trick
  the examiner, where any reply that reveals nothing is fine.
- `expect.alsoNotRecorded`: true when part of the request is in the case and part is not.

The expected rows follow the app's own rules: no eye named means both eyes; a row recorded for
both eyes, or for no eye, answers a request for either eye; more than six items at once is
"too many". Every `reveal` case was checked against those rules with a perfect picker.

Types: `paraphrase`, `shorthand` (IOP, BP, gonio, the disc), `eye_reference` (the affected eye,
the fellow eye, OD, OS), `follow_on`, `multi`, `history`, `not_in_case`, `unavailable`,
`injection`, `starts_answer`, `broad`, `noisy_transcript` (speech-to-text errors).

These are the hard cases. The plain "what is the X in the Y eye" requests for every row are
generated from the case file by the check harness and are not stored here.

### `followup.jsonl` — 8 sample answers (5 tune, 3 held back)

Tests the step that writes the single follow-up question.

- `input.answer`: a trainee's diagnosis and plan.
- `expect`: empty. Whether a question passes is decided by the app's own word check, and
  whether it fits and gives nothing away is read by a person.

Types: `complete`, `single_gap`, `wrong_diagnosis`, `vague`, `very_short`, `injection` (the
answer contains an instruction to reveal the key points), `rambling`.

### `coverage.jsonl` — 12 sample answers (7 tune, 5 held back)

Tests the step that works out what an answer missed.

- `input.answer`: a trainee's diagnosis and plan.
- `expect.statuses`: for each of seven items, whether the answer covers it.

  | Item | What it is |
  |---|---|
  | `item_0` | The diagnosis (`examiner_notes.diagnosis` in the case file). |
  | `item_1` to `item_6` | The six key points, `examiner_notes.key_points[0]` to `[5]`, in the order they appear in the case file. |

  Each is `covered`, `partial` (touched on, but something essential is missing), `not_covered`,
  or `either`. `either` means a careful marker could reasonably give two different answers;
  those are left out of the count, and how many were left out is reported.
- `expect.acceptableTargets`: every item that would be a defensible single thing to tell the
  trainee to revise. Usually the items not covered at all, plus any partly covered item where
  the missing part is the substance of the key point. `none` means everything was covered.
  This is the main thing graded: did the app pick one of these?

How the diagnosis (`item_0`) was marked: the right condition in the right eye, with the left eye
named as at risk and a trigger given, is `covered`. The right condition and eye but nothing
about the other eye is `partial`. The right condition in the wrong eye, or a vaguer name such as
"acute glaucoma", is `partial`. A different condition is `not_covered`.

Types: `single_gap` (five, each missing a different key point), `multi_gap`, `all_covered`,
`wrong_diagnosis`, `brand_names`, `wrong_eye`, `very_short`, `injection`.

### `verifier.jsonl` — 16 statement-and-quote pairs (10 tune, 6 held back)

Tests the separate check that a quote from the note backs a piece of advice. Seven pairs are
supported and nine are not.

- `input.statement`: one sentence of advice.
- `input.cite`: a phrase that occurs in exactly one sentence of the prepared note. That sentence
  is the quote; the check sees it marked inside its whole passage.
- `expect.verdict`: `supported` or `not_supported`.

Types: `gold` (the right sentence), `wrong_context` (the same drug or word, about a different
condition), `opposite` (the note says the reverse), `topic_only` (same topic, but it does not
back the action), `table_cell`. Pairs that could go either way were left out. One example: the
medicines table on page 9 lists sulfonamide allergy as a caution for acetazolamide. It does back
the allergy point, but it is not in the section the case author says to cite from, so it is not
used as a pair here.

### `revision.jsonl` — 14 points to revise (8 tune, 6 held back)

Tests the step that picks the supporting sentence and writes the advice, and whether the app
says "no support" when it should.

- `input.target`: the point to revise. Either a place in the case file
  (`examiner_notes.diagnosis`, `examiner_notes.key_points[1]`) so that the text is read fresh
  from the file, or `text:` followed by an invented point.
- `input.exclude`: `none`, or `all_support`. With `all_support`, every passage listed for that
  target in `retrieval.json` under `gold`, `alsoSupports` and `offSection` is left out of the
  search before the step runs.
- `expect.support`: whether the note supports the point once that has been done.
- `expect.targetId`: `diagnosis` or `kp0` to `kp5`, to look the target up in `retrieval.json`.

Types: `supported` (the diagnosis and the six key points), `ablated` (key points 1, 2, 3 and 5
with their support removed, so the right answer is "no support"), `invented` (three points the
note does not cover at all).

## `retrieval.json`

Not a list of cases. For the diagnosis, each key point and each follow-up topic, it records
which sentences of the note bear on it:

| List | Meaning |
|---|---|
| `gold` | The main source, in the acute primary angle closure material. |
| `alsoSupports` | Other text in that material that backs the point. |
| `offSection` | Text elsewhere in the note that backs the point: correct, but not where the case author says to cite from. |
| `distractor` | Text that shares the words but is about something else. It does not back the point. |

Every phrase in it matches exactly one sentence of the prepared note. The lists for key points
1, 2, 3 and 5 are meant to be complete, because the `ablated` cases depend on them. The other
lists give the main supporting text only.
