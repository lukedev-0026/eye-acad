# Handover

## How the reference note was prepared

`pnpm ingest` turns `data/reference-note.pdf` into `data/note-index.json` (committed).

1. **Read the PDF with its layout.** poppler's `pdftohtml -xml` gives every line with its page,
   position and font size. Plain text extraction loses headings, table cells, headers and footers.
2. **Classify lines by size and position, never by wording.** Largest type is the title, the next
   two sizes are headings, white text is a table header, the top and bottom 5% of a page are the
   running header and footer. The "About this note" box and the sources list are left out.
3. **Split into passages**: one per paragraph, bullet or table row (each cell keeps its column
   name). A bold opening ending in a full stop ("Pilocarpine.") becomes the passage's label.
4. **Join across a page break only when it is clearly one sentence.** Exactly one passage
   qualifies, and it matters: the acetazolamide bullet starts on page 5 and its warning ("Check for
   sulfonamide allergy ... before giving it") is on page 6. Apart, that sentence never names the drug.
5. **Split into sentences, each keeping its page**, so a quotation is labelled "p. 6", or "pp. 5–6"
   if it crosses.
6. **Embed each passage** (local `nomic-embed-text`) for meaning-based search.
7. **Stamp it with a fingerprint of the PDF.** If the PDF changes without a re-run, the revision
   panel stops with a message rather than quote old text.

Result: 126 passages and 226 sentences over 10 pages, one passage crossing a page break. Running
it again gives a byte-identical file.

## How relevant passages are selected

1. **Decide what to look for.** A model marks the diagnosis and each key point covered, partly
   covered or not covered. Marking something covered needs a quotation of the trainee's own words,
   which code checks is real. Code accepts the named gap only if it really is uncovered.
2. **Search with the missed key point.** Word matching (BM25) and meaning (embeddings) over all 126
   passages, combined by reciprocal rank fusion; the top six are kept. No language model is involved.
3. **Pick the sentence.** A model sees the six passages as numbered sentences with their headings,
   and returns sentence numbers and one sentence of advice. Code turns the numbers into the
   quotation and page.
4. **Check the support.** A separate model call, which has seen none of the conversation, says
   whether the quotation backs the advice. If not, the trainee is told no support was found.

From [`evals/retrieval-table.md`](evals/retrieval-table.md): the supporting passage is in the
combined top six for 10 of 10 targets, and for 3 of them the combination beats both searches
alone. Adding the trainee's words to the search made no consistent difference, so it is left out.
A cut-off on search scores **cannot** decide "no support" on this note (covered and invented
topics score 0.62 to 0.86 and 0.60 to 0.68), so steps 3 and 4 decide it.

## AI coding tools: one example and how it was checked

The project was planned and built with Claude Code throughout.

**Example: the reference-note parser** (`src/domain/note/note-parse.ts`). The assistant wrote it,
and it was not accepted on trust:

- Every line of the PDF was printed with its page, position and font, and read, before any rule
  was written. The rules come from that printout.
- The output was checked against it: 126 passages; exactly one across a page break; no words run
  together.
- Tests pin what matters (`tests/domain/note/note-index.test.ts`): the allergy sentence is word for
  word, labelled "p. 6", and in the same passage as "Acetazolamide 500 mg" from page 5; the
  similar-looking break between pages 3 and 4 is not joined.
- One of those tests was itself wrong at first. It asserted the passages never mention "Kanski",
  to prove the sources list was dropped, but the body text mentions Kanski once. It was corrected
  to look for the citation text.

Checking also overturned the plan elsewhere: a TanStack Start method name that no longer exists
(the installed type definitions settled it); a code rule for "no support" that measuring showed
could not work; and a read-back checker that wrongly flagged "23:55" as lost.

## The improvement

**What:** when the revision step writes its own sentence of advice, the quotation is checked a
second time, against the key point the trainee missed, which the model cannot reword. One switch:
`"improvements": ["check-against-key-point"]` on the support check in `config/steps.json`.

**Why this one.** The rule written before measuring said: fix the weakest measured area, costly
errors first. Over three runs of every tuning case on the chosen settings, the revision step failed
4 of 8 cases with a costly error, so it came first ([`evals/sweep/DECISION.md`](evals/sweep/DECISION.md)).

**The fault.** With the supporting passage out of reach, the revision step quoted page 8 ("Avoid
acetazolamide, which is itself a sulfonamide.", about a different condition) and reworded the
advice to fit. The support check, asked if the quotation backs advice written to match it, agreed.
The trainee would see a confident, cited, wrong reason.

**Before and after**, end to end, three runs per case. The held-back cases were opened once, after
the change was frozen (tag `improvement-frozen`).

| | Without it | With it |
|---|---|---|
| **Tuning, 24 runs:** wrong quotation shown | 1 | 0, then 1 in a second run |
| Tuning cases passing every run | 5 of 8 | 5 of 8 |
| **Held-back, 18 runs:** wrong quotation shown | 0 | 0 |
| Held-back cases passing every run | 4 of 6 | **3 of 6** |
| Held-back runs with the right outcome | 14 of 18 | 12 of 18 |
| Held-back cases fixed, and broken | | none, and one (`rev-kp5`) |
| Held-back runs cut off | 1 | 2 |

**It did not earn its place.**
- On the tuning cases the saved traces show it was not what removed the wrong quotation: asked 4
  times, each about a correct quotation, it agreed each time.
- In the second tuning run the fault came back in a form it never sees. The revision step kept the
  key point's own wording and quoted page 8, and the first check accepted it. The new check is only
  asked when the model wrote its own sentence. So the shipped settings show a wrong quotation in
  **1 of 48** tuning runs.
- On the held-back cases the ordinary support check had already refused all four wrong
  quotations, so there was nothing to catch. Asked 5 times, always about a correct quotation, it
  agreed twice, refused twice and was cut off once. One refusal was plainly wrong (a gonioscopy
  sentence it accepted on the other two runs).

What still stands for it is narrow: a test with a stand-in model that reproduces the fault exactly
(`tests/eval/checks/chain.check.test.ts`).

**Why it is still on.** The decision was recorded before the held-back cases were opened, under the
rule that they report on a choice and do not change it. I would switch it off. That is one line;
`config/steps.chosen.json` is the settings file without it. It costs about ten seconds when used,
after the viva has ended.

**What it does not fix.** The fault when the wording is kept (above). The trainee is still usually
told "no support" for three of the seven possible points (the diagnosis, lowering the pressure,
laser to both eyes): each is a compound statement no single sentence backs.

## The second improvement

The menu-picker answered a request for something not in the case with the nearest finding (corneal
thickness gave the cornea: criterion 10, 3 of 10). The fix, `check-requested-item` on the selector,
is one more call made only when something was picked: for each pick, is it what was asked for, or
only related? A related pick is dropped and the trainee hears "That isn't recorded for this case".
If the check gives no usable reply, the first choice stands.

Measured as the first was: 26 new cases written and split by hash, the rule committed (tag
`near-miss-rule`), 12 configurations on the tuning cases, the choice committed (`near-miss-chosen`),
then the held-back cases opened once. Near misses 3 → 10 of 10 on tuning; held-back 24 → 25 of 27,
one fixed, none broken; the required check 3 → 10 of 10. Detail in
[`evals/near-miss/DECISION.md`](evals/near-miss/DECISION.md).

## What I would do next

1. Have a clinician read the expected answers (`evals/cases/REVIEW.md`). Until then every count
   measures agreement with one AI-assisted reading.
2. Re-time spoken turns with the menu-picker's second look (about 0.4 s more when something is
   picked), and force its format again for "Tell me everything".
3. Fix the revision panel: switch the second check off, split the three compound key points, show
   the support check the quotation's section heading, and try the medium model on the revision step.
4. Repeat the one-run measurements three times, with more follow-up cases.
5. Run the Claude adapter (written, not run) on the judging steps: one line in `config/steps.json`.
6. Transcribe while the trainee speaks, to cut the 1.1 s of the 1.8 s turn spent on speech to text.
7. Before real use: a Firebase project with App Check, per-trainee request limits, shipped logs,
   `transcribeOnly` checking the attempt's owner, a production server, and CI run on GitHub.
8. Test with real voices, accents and noise.
