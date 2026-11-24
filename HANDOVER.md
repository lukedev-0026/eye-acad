# Handover

## How the reference note was prepared

`pnpm ingest` turns `data/reference-note.pdf` into `data/note-index.json`, a searchable copy that
is committed to the repo.

1. **Read the PDF with its layout.** poppler's `pdftohtml -xml` gives every line with its page,
   position and font size. Plain text extraction was not enough: it loses which lines are
   headings, table cells, headers and footers.
2. **Classify lines by size and position, never by wording.** The largest type is the title, the
   next two sizes are section and sub-section headings, white text is a table header, and the top
   and bottom 5% of each page are the running header and footer. The "About this note" box and
   the sources list are left out; the note's own "revision summary, not clinical guidance" line is
   kept to show on the revision card.
3. **Split into passages.** One passage per paragraph, bullet point or table row. A new passage
   starts where the gap between lines is visibly larger than a wrapped line, or the indentation
   changes. A bold opening that ends in a full stop ("Pilocarpine.") is kept as the passage's
   label.
4. **Join across a page break only when it is clearly one sentence**: the text before the break
   does not end a sentence, and the text after starts with a small letter or a digit. Exactly one
   passage qualifies, and it is the important one: the acetazolamide bullet starts on page 5 and
   its allergy warning ("Check for sulfonamide allergy ... before giving it") is on page 6. Kept
   apart, that sentence never says which drug "it" is.
5. **Split passages into sentences, each remembering its page.** So a quotation's page number is
   the page that sentence is printed on ("p. 6"), or a range if it crosses ("pp. 5–6").
6. **Keep table rows.** Each row is a passage; each cell is quotable, with its column name.
7. **Add an embedding** of each passage (local `nomic-embed-text`) for meaning-based search.
8. **Stamp the result** with a fingerprint of the PDF. If the PDF changes and `pnpm ingest` has
   not been re-run, the app stops the revision panel with a message instead of quoting old text.

The result for the supplied note: 126 passages and 226 sentences over 10 pages, with one passage
crossing a page break. Running `pnpm ingest` again produces a byte-identical file.

## How relevant passages are selected

1. **Decide what to look for.** A model compares the trainee's answer with the diagnosis and the
   key points and marks each covered, partly covered or not covered. To mark anything as covered
   it must quote the trainee's own words, and code checks the quotation is real. The model names
   the most important gap; code accepts it only if that item really is uncovered.
2. **Search with the missed key point.** Two searches run side by side over all 126 passages:
   one matches words (BM25, with the same tokeniser on both sides), one matches meaning
   (embeddings). Their rankings are combined (reciprocal rank fusion) and the top six are kept.
   No language model is involved in the search.
3. **Pick the sentence.** A model is shown those six passages as numbered sentences, with their
   section headings and the case author's instruction that the acute primary angle closure
   section is the main source. It returns sentence numbers and one sentence of advice. Code turns
   the numbers into the quotation and the page.
4. **Check the support.** A separate model call, which has seen none of the conversation, is asked
   whether the quoted sentence backs the advice. If not, the trainee is told no support was found.

`evals/retrieval-table.md` compares the three ways of searching on the diagnosis, the six key
points and the three follow-up topics. What it showed:

- The supporting passage is in the combined top six for 10 of 10 targets, and no wrong-context
  passage outranks it. For 3 of 10 the combined rank beats both single searches.
- Adding the trainee's own words to the search made no consistent difference (better for 1,
  worse for 1, the same for 8), so the search uses the missed key point alone.
- A cut-off on search scores **cannot** decide "no support" on this note: the scores of key points
  the note covers overlap those of invented ones it does not. That decision is therefore made at
  steps 3 and 4, and how reliably they make it is one of the things measured in `SWEEP.md`.

## AI coding tools: one example and how it was checked

This project was planned and built with an AI coding assistant (Claude Code) throughout. Planning
and research were done with it before the build; `docs/04-investigation.md` describes that.

**Example: the reference-note parser** (`src/domain/note/note-parse.ts`). The assistant wrote the code
that turns the PDF's layout into passages. It was not accepted on trust:

- Every line of the PDF was first printed with its page, position and font, and read, before any
  parsing rule was written. The rules were derived from that printout.
- The result was checked against it: 126 passages; exactly one crossing a page break; page
  numbers printed at the foot of each page equal to the page index; no words run together.
- Tests pin the things that matter (`tests/domain/note/note-index.test.ts`): the allergy sentence is word for
  word what the note says, is labelled "p. 6", and sits in the same passage as "Acetazolamide
  500 mg" from page 5; the similar-looking break between pages 3 and 4 is not joined; table
  cells keep their column names.
- The first version of one of those tests was itself wrong: it asserted the passages never
  mention "Kanski", to prove the sources list was excluded. The test failed, because the note's
  body text does mention Kanski once. The assertion was corrected to look for the citation text.

Other places where checking overturned what the assistant, or the plan, had assumed:

- The plan called a server-function method by a name that no longer exists in this version of
  TanStack Start. The installed package's own type definitions settled it.
- The plan included a code rule for "no support found". Measuring it showed it could not work
  (see above), and the design docs were changed to say so.
- The spoken read-back check first reported the time "23:55" as lost. Reading the transcript
  showed the voice had said it correctly, as words; the checker was wrong and was fixed.

## The improvement

**What:** when the revision step writes its own sentence of advice, the quotation is checked a
second time, against the key point the trainee actually missed. If it does not back that, the
trainee is told no support was found. It is one switch in the settings file
(`"improvements": ["check-against-key-point"]` on the support check), and the app runs with it on.

**Why this one.** It was not picked in advance. The rule written before measuring was to fix the
weakest measured area, ranked by costly errors first. On three runs of every tuning case under
the chosen settings, the revision step and the menu-picker each made a costly error on one case
every time; the revision step also failed 4 of its 8 cases against 3 of 56, so it came first.
[`evals/sweep/DECISION.md`](evals/sweep/DECISION.md) has the table.

**The fault it goes after.** With the supporting passage out of reach, the revision step quotes a
sentence from a different condition's section (page 8: "Avoid acetazolamide, which is itself a
sulfonamide.") and rewrites the advice to fit it, sometimes into the quotation's own words. The
support check was then asked whether the quotation backs advice that had been written to match
it, and agreed. It never saw the original key point. The trainee would have been shown a
confident, cited, wrong reason.

**Before and after.**

End to end (the revision step and the support check together), three runs per case. The
held-back cases took no part in building the change and were opened once, after it was frozen.

| | Without it | With it |
|---|---|---|
| **Tuning cases, 24 runs:** a quotation shown that does not back the advice | 1 | 0 |
| Tuning cases passing every run | 5 of 8 | 5 of 8 |
| **Held-back cases, 18 runs:** a quotation shown that does not back the advice | 0 | 0 |
| Held-back cases passing every run | 4 of 6 | **3 of 6** |
| Held-back runs with the right outcome | 14 of 18 | 12 of 18 |
| Held-back cases fixed, and broken | | none, and one |
| Held-back runs cut off, where the trainee is asked to try again | 1 | 2 |

**It did not earn its place.** On the tuning cases the one wrong quotation went away, but the
saved traces show the new check was not the reason: it was asked four times, each time about a
correct quotation, and agreed each time. On the held-back cases there was nothing for it to
catch, because the support check had already refused all four wrong quotations the revision step
produced. What it did there was cost: asked five times, always about a correct quotation, it
agreed twice, refused twice and was cut off once. One of the refusals was plainly wrong (it
turned down the note's own sentence about repeating gonioscopy and examining the discs, which
it accepted on the other two runs).

The only evidence that it does what it was built for is narrow. In a test, a stand-in for the
model reproduces the original fault exactly: the wrong quotation is shown without the change and
refused with it (`tests/eval/checks/chain.check.test.ts`). And one fixed pair close to the
question it asks, the page 8 sentence against the allergy advice, was refused in 3 runs of 3.

**Why it is still switched on.** The decision to ship it was written down before the held-back
cases were opened, with the rule that they report on a choice and do not change it. Switching
it off because of them would be choosing on them. So the app is as it was frozen, and this is
the honest state of the evidence: I would switch it off, and it is one line to do
(`config/steps.chosen.json` is the settings file without it).

**What it costs in time.** One more support-check call whenever the model's own sentence is used:
about ten seconds with thinking on, and two or three times that on some runs. It comes after
the viva has ended, not during a spoken turn.

**What it does not fix.** The trainee is still usually told "no support" for three of the seven
things a revision point can be about, although the note covers them: the diagnosis, and the key
points on lowering the pressure and on laser treatment to both eyes. Each is a compound
statement, and no single sentence of the note backs all of one. And a support check that thinks
sometimes runs out of time, in which case the trainee is asked to try again.

## What I would do next

In the order I would do them.

1. **Have a clinician read the expected answers.** Every count in `SWEEP.md` and `CHECKS.md` is
   scored against answers written with an AI assistant from the case file and the note
   (`evals/cases/REVIEW.md` lists them all for reading). Until someone qualified has read them,
   the counts measure agreement with that reading, not correctness.
2. **Stop the menu-picker substituting the nearest thing.** Asked for central corneal thickness,
   which is not in the case, it reveals the cornea rows instead of saying "that isn't recorded".
   Asked for blood glucose it reveals urea and electrolytes, and on the held-back cases "Do you
   have pachymetry?" got the axial length once in three. Nothing false is said, but something is
   revealed that was not asked for. A cheap second look ("is what was asked for actually this
   item?") would catch it; that needs its own cases before it is switched on. The held-back cases
   also showed that with its format no longer forced, the picker runs out of room on "Tell me
   everything you've got": force the format again, or give it more room.
3. **Fix the revision panel properly.** It is still the weakest part, and the improvement did not
   help it. In this order: switch the second check off, or ask it only when the quotation comes
   from outside the section the case author names as the main source; split the three compound
   statements into parts that a sentence each can back, since they account for most of the wrong
   "no support" results; give the support check the section heading of the quotation, so "a
   different condition" is something it can see; and put the medium model back on the revision
   step, which the held-back cases favoured.
4. **Repeat the measurements that rest on one run.** Three runs per case for the best few
   configurations of each step, and more cases for the follow-up writer, whose settings cannot be
   told apart on five cases at temperature 0.7.
5. **Run the Claude adapter.** It is written from the documentation and has never been run. The
   judging steps (coverage, support check) are where a stronger model is most likely to help, and
   the checks are ready to say whether it does: one line in `config/steps.json`, then `pnpm check`.
6. **Shorten the wait in a spoken turn further.** It is 1.8 seconds in the middle case.
   Speech-to-text is now the largest part of that (1.1 seconds) and the model's pick is 0.5.
   Transcribing while the trainee is still speaking is the obvious next step. For a reply whose
   audio was not made ahead, streaming its first sentence would help; whole clips were kept
   because a clip that arrives whole cannot be cut off halfway through a number.
7. **Before real trainees use it:** a real Firebase project with App Check; a limit on requests
   per trainee as well as the existing limit on attempts; the server's logs shipped somewhere;
   the `transcribeOnly` server function checking that the attempt belongs to the caller (it checks
   who is signed in, but not that); a production build served in place of the development
   server, which hands out the app's own source files, prompts included, to anyone who asks
   (none holds anything from the case, and the case file itself is refused); a test at the HTTP
   level for the status each failure returns; and the CI workflow, which is written to mirror
   `pnpm verify` and has not yet run on GitHub.
8. **Try it with real voices.** Every spoken measurement here used a synthetic voice or a short
   check by one person. Accents, a noisy room and hesitation are untested.
