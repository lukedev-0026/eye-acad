# 3. Decisions and the reasoning behind them

Each decision lists why it was made, what was turned down, and how sure we are:

- **Checked** means confirmed against an official source (documentation, a package registry, a paper).
- **Measured** means tested in a dry run on the real reference note.
- **Judgement** means a reasoned call that has not been tested yet.

## The overall approach

### The AI chooses from a list; code writes the words
- **Why:** the brief's hardest requirement is reading findings back with "the correct eye, value
  and units". If the AI never writes those, it cannot get them wrong and cannot be tricked into
  changing them.
- **Turned down:** giving one chatbot the whole case and letting it answer freely. It would
  usually be right, but would sometimes round a number, swap an eye, invent a result for a test
  that was not done, or let the diagnosis slip.
- **How sure:** Checked and judgement. Published security research recommends exactly this shape.

### No LangChain
LangChain is a popular toolkit for building AI apps, and was the starting assumption.
- **Why not:** the part of it we would need (its PDF reader and keyword search) was retired by its
  maintainers on 27 May 2026 with no replacement. Its keyword search also has a flaw: it cannot
  match capitalised terms, so a search for "iop" never finds "IOP". And it reads PDFs one page at
  a time, which cannot handle our key sentence running across two pages.
- **Instead:** about forty lines of our own search code, which is easier to explain when the
  reviewers ask how passages are chosen.
- **How sure:** Checked, against the package registry and the published source code.

### A local language model first, Claude later as a switch
- **Why local first:** it costs nothing to run, and no account key has to be shared with
  reviewers. A local model also lets us change every setting we want to compare (see "Settings
  are chosen by measurement" below).
- **Why Claude stays possible:** a hosted model (Claude) would probably judge "what did this
  answer miss" better. So each AI step names its model in one settings file. Moving a step to
  Claude is a change to that file, not a rewrite of the app.
- **Turned down:** building on Claude from the start. It needs paid credits, and comparing many
  settings there would cost several times the £10 the brief offers to reimburse. Also turned
  down: local only, with no way to switch.
- **Risk we accept:** a local model is likely weaker at the judging steps. Because code checks
  its output, the expected cost is more fallbacks to pre-written text, not wrong facts.
- **Honest limit:** the Claude route is only described as working once it has actually been run
  with a key. Until then the write-up says "written, not run".
- **A claim that was tested:** an earlier version of this entry said a local model "can be set
  to give the same answer every time". The pre-check tested it on 24 November: with temperature
  0 and a fixed seed, 10 of 10 requests gave the identical reply three times running, on both
  the small and the medium model. So the claim holds for those settings on this machine. It does
  not hold at any higher temperature, which is why those settings are run several times.
- **How sure:** the repeatability is Measured. The quality difference from Claude is still a
  Judgement: the Claude route has not been run.

### One model family in three sizes
- **What:** the local models are the small, medium and large versions of one family, called
  qwen3.5. They are labelled "4b", "9b" and "27b". The number is roughly how many billion
  internal values the model has: bigger usually means more capable and slower. Together they
  are about 33 GB to download.
- **Why one family:** when sizes are compared, any difference is then down to size. With three
  unrelated models, a difference could come from the size, the maker or the training.
- **Why this family:** of those looked at, it was the only one with three sizes that fit this
  computer and a real off switch for "thinking" (see the glossary).
- **Turned down:** two other families (gemma4 and the older qwen3), and one whose thinking
  cannot be switched off (gpt-oss).
- **How sure:** Checked by research with sources on 24 November 2026, not yet by running them.
  Each fact is re-tested on this machine before the sweep relies on it.

### Settings are chosen by measurement, not by argument
- **What:** the app is built first on one starting set of settings. Then every check that
  involves the AI is run again across many variations: model size, temperature, thinking on or
  off, forced output format on or off, and prompt wording. The final settings are picked from
  those results. File 07 explains this in full.
- **Why:** questions such as "is thinking worth the wait?" and "do worked examples help?" were
  judgement calls. Measuring turns them into numbers that can be shown.
- **Why each AI step is measured on its own:** the five AI steps share no memory, and each has
  its own checks. Measuring all five together would mean billions of combinations.
- **The starting settings are not special.** They appear on the chart as one labelled dot among
  the rest. They are: the medium model for every step, thinking off, forced format on,
  temperature 0.7, and the shortest prompt.
- **Turned down:** picking settings by reasoning and then defending them.
- **How sure:** Judgement for the method. No result exists yet.

### Search the reference note two ways and combine them
- **Why:** matching words is strong on exact terms such as drug names. In a dry run it ranked the
  right passage first for all six key points. But it is fragile when wording differs: the note
  says "fellow eye" and never "left eye". Matching by meaning covers that gap.
- **Turned down:** word-matching only (brittle), and meaning-matching only (loses exact terms).
- **How sure:** Measured for word-matching. Whether meaning-matching helps on this note is not
  yet known, so a comparison table of all three will be included.

### No search database
- **Why:** the whole note is about 126 short passages. They fit in one file and can be searched
  instantly in memory.
- **Turned down:** a dedicated search database, which adds setup for no benefit at this size.
- **How sure:** Checked.

## Voice

### Three separate steps: speech to text, choose, text to speech
- **Why:** what is spoken is exactly the sentence code built, so what the trainee hears matches
  what they see. Each step can also be timed separately.
- **Turned down:** a single "speech in, speech out" AI voice model. It sounds more natural and
  responds faster, but it words things itself, and any check happens after the trainee has
  already heard it.
- **How sure:** Checked. The maker of one such model notes it may paraphrase or shorten text it
  is asked to repeat exactly, in certain setups.

### Hold a button to talk
- **Why:** the brief asks that it be "clear when they can speak". A button makes that
  unmistakable, gives an exact moment to start timing from, and stops the examiner's voice being
  recorded as the trainee's. A trainee who pauses to think is not cut off.
- **Turned down:** hands-free talking, where the app detects by itself when the trainee has
  stopped speaking. More natural, but it ends turns during thinking pauses and is much harder to
  build reliably. This is an ordinary design choice, recorded here like any other. It is not
  held back as "the improvement".
- **How sure:** Judgement.

### Deepgram for speech
- **Why:** one service does both directions, has a UK-English medical model and two British
  voices, and offers $200 of free credit with no payment card.
- **Turned down:** OpenAI's speech service, because the relevant models are being switched off on
  6 January 2027. The browser's built-in speech, because we could not choose or explain the model.
- **How sure:** Checked against Deepgram's and OpenAI's own pages. The free credit has not been
  tested by signing up.

### The audio comes back together with the answer
- **Why:** a separate address for fetching audio would either be open to anyone, or could not
  prove who was asking.
- **How sure:** Judgement.

### Each reply's audio is sent whole, not streamed
- **Why:** each reply is one short sentence, so the wait saved by playing it while it is still
  being generated is small. A whole clip also cannot be cut off halfway through a number.
- **Turned down:** streaming, where the audio starts playing while the rest is still being made.
  It starts sooner, but needs a second secure channel and a player that copes with a stream
  failing mid-sentence. An ordinary design choice, not held back as "the improvement".
- **How sure:** Judgement. The size of the saving has not been measured. The timings taken at
  each stage of a spoken turn will show what the speech step costs.

### A typed box is always available
- **Why:** the checks need a way to run without a microphone, and the demo keeps working if the
  microphone or speech service fails.
- **How sure:** Judgement.

## How the examiner behaves

### Only the "Give my answer" button moves the session on
- **Why:** if the app guessed wrongly that the trainee had started answering, it would spend the
  one follow-up question and end the questioning, with no way back.
- **How sure:** Judgement, raised by the security review.

### No eye mentioned means both eyes
- **Why:** it never guesses an eye, and avoids a "which eye?" question that might look like a
  second follow-up.
- **How sure:** Judgement.

### The patient's history can be asked for
- **Why:** two of the six key points depend on the allergy and a recently started medicine, which
  appear only in the history.
- **How sure:** Judgement.

### "Unavailable" is decided by one flag only
- **Why:** one finding is marked unavailable but still has text in its result field. An app that
  checked "is there a result?" would read out the wrong thing.
- **How sure:** Checked in the case file.

### Units are added only to plain numbers
- **Why:** some results already contain their unit ("5 mm"). Adding the unit again would produce
  "5 mm mm". This rule matches the supplied case document for every row, and still works if the
  reviewers add a finding with a unit we have never seen.
- **How sure:** Measured against all 24 findings.

### The follow-up is written fresh, within strict word limits
- **Why:** the three supplied follow-up questions assume a correct answer, so they fit wrong or
  partial answers badly. A freshly written question can respond to what was actually said.
- **The safeguard:** every meaningful word in the question must come from the trainee's own
  answer, from the supplied follow-up questions, or from a short list of neutral words. If the
  question fails that test, one of the supplied questions is used as written.
- **Turned down:** a list of banned words. In testing on paper it rejected all three supplied
  questions while still allowing brand names and praise through.
- **How sure:** Measured on paper for the banned-word flaw; the new approach is judgement.

## The revision point

### The diagnosis is checked as well as the six key points
- **Why:** otherwise a wrong diagnosis is never picked up, and the advice would be about eye drops.
- **How sure:** Measured in a walk-through of five sample answers.

### Only the main answer is judged, not the reply to the follow-up
- **Why:** the follow-up can hint at what was missed. Counting the reply would hide the gap the
  trainee really had.
- **How sure:** Judgement.

### The model names the most important gap; code double-checks it
- **Why:** the case file does not say which key point matters most, so a fixed order could pick a
  trivial gap over a serious one. The model may only name a gap from the fixed list, and code
  rejects its choice if that point was in fact covered.
- **How sure:** Judgement.

### The search uses the missed key point alone
- **Why:** adding the diagnosis to the search pushed the right passage from 1st place down to 9th,
  22nd and 98th for three key points. Using the key point alone found it first every time.
- **Changed by measurement:** the plan was to add the trainee's own words to the search as well.
  The comparison table tested that on ten targets: the right passage ranked better for 1, worse
  for 1 and the same for 8. With no consistent gain, the trainee's words are left out. The
  answer still decides *which* key point is searched for.
- **Turned down:** searching with the raw transcript, which is noisy; a brand name such as
  "Diamox" matches nothing in the note.
- **How sure:** Measured (`evals/retrieval-table.md`).

### A code rule for "no support found" does not work on this note
- **What was planned:** a search always returns something, even for a topic the note never
  covers. So before any AI was involved, code would check that at least one passage genuinely
  overlapped with the key point, by words or by meaning, and tell the trainee plainly if none did.
- **What measuring showed:** it cannot be done with search scores on this note. Key points the
  note does cover score between 0.62 and 0.86 for closeness of meaning; invented key points it
  does not cover score between 0.60 and 0.68. The two ranges overlap, and word overlap does no
  better ("Stop the chlorphenamine" shares one content word with its supporting passage). No
  cut-off separates them.
- **What is done instead:** the code rule is kept only as a guard against a point that is wholly
  off-topic. The real decision is made by the step that picks the supporting sentence (it may
  answer "no support") and by the separate support check. How reliably they make it is measured
  in the checks, including with the supporting passages deliberately removed.
- **How sure:** Measured (`evals/retrieval-table.md`).

### The model picks sentence numbers; code copies the quote
- **Why:** the quote is guaranteed to be word-for-word from the note, and the page number is the
  page that sentence actually sits on.
- **Turned down:** asking the model to type the quote and then checking it. Models change dashes,
  quotation marks and British spellings, so correct quotes get rejected.
- **How sure:** Checked.

### If the wording fails, show the supplied key point instead
- **Why:** telling the trainee the note has no support, when it does, would itself be untrue.
- **How sure:** Judgement.

### A separate check that the quote supports the advice
- **Why:** a word-for-word quote proves where the text came from, not that it backs the claim.
  One 2026 study found a leading model quoting accurately for 98% of its claims while fully
  backing up only 37%.
- **No second attempt with other passages:** in the walk-through, retrying after a rejection led
  straight to the wrong-section quote.
- **How sure:** Checked for the study (summary read, not the full paper) and measured for the retry.

## Preparing the reference note

### Read the PDF with layout information
- **Why:** text size and position reveal which lines are headings, tables and page footers. One
  common way of extracting text removed every space between words in this particular PDF.
- **How sure:** Measured.

### Join text across a page break only when it is clearly one sentence
- **Why:** exactly one bullet point runs across two pages, and it is the most important one.
  Another page break looks similar but starts a new point.
- **How sure:** Measured.

### Table rows are kept as passages
- **Why:** the table comparing similar conditions is the best support for a trainee who gives
  the wrong diagnosis.
- **How sure:** Measured.

### The prepared copy is saved in the project, with a fingerprint of the PDF
- **Why:** reviewers need no extra tools, and if the PDF is changed without re-preparing it, the
  app stops and says so instead of quoting old text.
- **How sure:** Judgement.

## Saving, sign-in and privacy

### Only the server saves; the browser can only read
- **Why:** a conversation cannot be faked, and what is revealed is exactly what the server released.
- **How sure:** Judgement.

### Two records per attempt: one the trainee can see, one they cannot
- **Why:** the browser watches the attempt record live, so anything in it is visible to a curious
  user. Working notes such as "which key points were missed" contain the hidden answers, so they
  live in a second record the browser is refused.
- **How sure:** Judgement, raised by the security review.

### Each attempt is filed under its owner
- **Why:** the database can then refuse other users outright, with no reliance on the screen.
- **How sure:** Checked.

### Firebase runs on the developer's computer
- **Why:** no cloud project, account or password is needed, and the brief allows a local demo.
- **How sure:** Checked.

### Two ready-made demo accounts
- **Why:** privacy can be shown in seconds by signing in as the second user.
- **How sure:** Judgement.

### The case file is read fresh each time, and blocked from the browser
- **Why:** an edit made during the walkthrough takes effect at once. Separately, the development
  server would otherwise hand the case file, hidden answers included, to anyone who asked for it.
- **How sure:** Checked; the block will be confirmed by a direct test.

### Specific tool versions are fixed
- **Why:** the newest Firebase release and the test tool do not work with the version of Node
  installed by default on this machine. An unpinned install would pick up the incompatible ones.
- **How sure:** Checked.

## Proving it works

### Simple test scripts and a results file
- **Why:** no extra accounts or tools; reviewers can read the tests; the output is the
  expected-versus-observed table the brief asks for.
- **How sure:** Checked. Two alternatives considered have recently been retired by their makers.

### The tests use the app's real code
- **Why:** testing a copy would measure a different system.

### The citation check uses an answer with exactly one gap
- **Why:** with several gaps, which one is chosen is a judgement call, so the check would give
  different results on different runs.
- **How sure:** Measured in the walk-through.

### "No support found" is tested by removing the passage
- **Why:** the note supports all six key points, so this message never appears in normal use.
  Removing the passage is also the only proof the advice comes from the note and not from what
  the AI already knows about medicine.

### Results are reported as "k of n"
- **Why:** "9 of 10" is honest about how much was tested. A percentage hides it.
- **How repeats are counted:** n is the number of different test cases, and k is how many of
  them passed on every run. Twenty cases run three times each is reported as 20, never 60,
  alongside how many cases changed result between runs.

### Checking what is actually said aloud
- **What:** each finding is turned into speech, the audio is turned back into text, and the eye,
  number and unit are checked.
- **Why:** written tests cannot show what the voice says, and this tests the brief's headline
  requirement on the audio itself.
- **Its place:** an ordinary check. An earlier version of this plan called it "the improvement".
  Its result is now one of the measurements the improvement is chosen from.

### The graders are tested before the models
- **Why:** each check has a "grader", the piece of code that decides pass or fail. A mistake in
  a grader, or in an expected answer, could be bigger than the difference between two settings.
  So before any model runs, every expected answer is fed through its own grader and must pass.
- **Also:** a lazy constant answer is scored too, for example always saying "not supported".
  That shows where the floor is. On the planned set of 16 support-check pairs, 9 are not
  supported, so always saying "not supported" would get 9 right without reading anything.
- **How sure:** Judgement.

### Some cases choose the settings; the rest only report
- **Why:** when the best of many settings is picked on a small set of cases, the winner's score
  is flattered by luck. So each set of cases is split about 60/40 when it is written. The larger
  part, the "tuning cases", is used to choose. The smaller part, the "held-back cases", is used
  only to report.
- **Opened once:** the held-back cases are run a single time, after the settings and the
  improvement are both fixed. Nothing is re-chosen afterwards, whatever they show.
- **Turned down:** reporting the winning score itself.
- **How sure:** Judgement.

### The rule for choosing is written down before the run
- **Why:** the rule for picking the winning settings, and the split of cases, are saved in the
  project history before the first measured run. The history then shows the choice was not bent
  to fit the results.
- **Turned down:** deciding after seeing the chart.
- **How sure:** Judgement.

### Timings are recorded with the computer's power mode
- **Why:** on 24 November this computer reported a power setting that reads as Low Power Mode,
  even when plugged in. It also had about 5 GB of memory overflow ("swap") in use after 39 days
  without a restart. Either would make every timing slower. So each timing is saved with the
  power mode and swap use, and one reference setting is re-run at the start, middle and end of
  the night to show any drift.
- **Turned down:** reporting timings bare.
- **How sure:** Observed on this machine. The effect on timings has not been measured.

### The improvement is whatever measures weakest
- **What:** the brief asks for "one improvement of your choice" and why it was prioritised. Once
  the settings are chosen, the weakest measured area gets one fix. "Weakest" is ranked in this
  order: most costly mistakes, then most failed cases, then most fallbacks to pre-written text,
  then the slowest stage of a spoken turn.
- **Why:** a measured weakness, with before and after counts, answers "why this one?" better
  than a preference does.
- **How it is measured:** before and after are run on the same held-back cases in one sitting.
  The number that first exposed the weakness is shown, but is not used as "before", because the
  weakest of several noisy scores tends to recover on its own.
- **Not candidates:** hands-free talking and streaming audio. Those are ordinary design choices,
  recorded under "Voice" above. A change of settings does not count either, because the sweep
  already covers those.
- **Turned down:** choosing the improvement in advance, which is a guess about where the app is
  weak.
- **How sure:** Judgement.

### Honest reporting of time
- **Decision:** the build is not limited to four hours. The write-up states the real time spent,
  the planning done beforehand with AI help, and marks what existed at the four-hour point.
- **Why:** the brief asks candidates to stop at four hours and say where they stopped. Going
  further is a choice, and is stated openly.
- **Machine time:** the hours the computer spends running the sweep unattended are reported
  separately from hands-on time.
