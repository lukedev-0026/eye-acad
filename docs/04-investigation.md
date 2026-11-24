# 4. The investigation

Before any code was written, the problem was researched and the first design was deliberately
attacked. This records what was done and what it found.

**How it was done.** AI research assistants were used throughout, which the brief allows. Nine
worked independently on separate questions. A first design was then written, and eight more were
set against it: five to find faults, three to check facts. None of them built or ran the app.
Where they tested something, it was a read-only dry run on the supplied files.

## Round one: nine questions

| Question | Main finding |
|---|---|
| How could the app be tricked? | Instructions and filter products cannot be relied on. A 2025 study defeated 12 published defences, most of them more than 90% of the time. What works is limiting what the AI can do: it sees only what it needs, and can only choose from a list. |
| How should the AI be prompted? | It matters less than who writes the words. Use one small call per spoken turn, and separate calls afterwards. Do not give the AI worked examples copied from the real case, because the reviewers will change the case. |
| Should we use LangChain? | No. The part we would need was retired in May 2026, and its keyword search cannot match capitalised terms. |
| What else is there? | For ten pages, no toolkit is needed. Several alternatives looked at have also been retired or are very new. |
| How do we know answers are good? | Make findings correct by design; check AI-written text with code; test by repeated runs; and separately check that a quote supports the claim it is attached to. |
| Which voice technology? | Separate speech-to-text and text-to-speech steps, so code controls the exact words. OpenAI's speech models are being switched off in January 2027, which ruled out the first suggestion. |
| What about the required framework and database? | Buildable, but three things changed in 2026 that older guides and AI tools get wrong, including a renamed instruction that now fails outright. |
| What does the medical content actually say? | All six key points are backed by the reference note, mostly on pages 5 and 6. Two traps were found (below). |
| What might the reviewers change live? | Most likely a value in the case file, a sentence in the note, or a setting. The design should read both files fresh and have one command that re-runs the checks. |

## Two traps hidden in the supplied material

**The split sentence.** The reference note's warning, "Check for sulfonamide allergy… before
giving it", is on page 6. The drug it refers to is named only on page 5. Pages 8 and 9 mention
the drug and the allergy together, about a different condition. A simple search quotes the wrong
page. The case file says outright that other sections "act as distractors", so this is likely
deliberate.

**The awkward data.** In the case file:
- one finding is marked unavailable but still has text in its result field;
- some results already include their unit, so adding it again would duplicate it;
- pressures are stored as numbers while everything else is text;
- two findings have no eye at all (blood pressure and a blood test).

An app that treated every row the same way would read several of them out wrongly.

## Round two: attacking the first design

Five critics each looked at the first design from one angle.

| Angle | What was wrong with the first design | What changed |
|---|---|---|
| Security | The follow-up question was checked against a list of banned words. On a normal answer that list rejected all three supplied questions, yet let brand names and praise through. The saved attempt would also have exposed hidden answers to the browser. | Switched to a list of *allowed* words. Split the saved attempt into a visible record and a hidden one. |
| Time | The first schedule held about seven hours of work in a four-hour plan. | Reordered so the essentials come first, with fallbacks. The time limit was later lifted by choice. |
| Meeting the brief | The required citation check could not pass: our own rule rejected the correct page 6 sentence because it says "it", not the drug's name. Nothing could trigger "no support found". | The wording rule now looks at the whole passage. A firm rule for "no support" was added. A full checklist was written. |
| Accuracy against the real note | Adding the diagnosis to the search pushed the right passage out of the top six for three key points. A wrong diagnosis would never be picked as the thing to revise. | The search now uses the missed key point only. The diagnosis is checked alongside the key points. |
| Testing method | The test answer had several gaps, so the result would vary between runs. Two checks compared output with expectations produced by the same code. | A single-gap test answer. Expected values are read from the raw case file. |

## Round three: checking the facts

Thirty-five specific claims were checked against official sources on 23 November 2026.

- **None was wrong outright.**
- **Twenty-five were confirmed**, including that LangChain's community package was retired on
  27 May 2026, and that OpenAI's speech models shut down on 6 January 2027.
- **Ten were partly right and corrected.** The ones that matter:
  - The "audio started" signal in a browser means *ready to play*, not *audible*. Timings will be
    labelled accordingly.
  - A widely quoted response-time target of 0.8 seconds traces back to one vendor's marketing
    line. The figure from the practitioner guide we rely on is 1.5 seconds.
  - A statement from OpenAI about its voice model rewording text applies to one specific setup,
    not in general. It will be quoted with that condition.

## Round four: checking the local-model facts

On 24 November 2026 the plan changed in two ways. The language model became a local one first,
with Claude as a later switch. And a comparison of settings, the "sweep" described in file 07,
was added. Two more AI research assistants were used. One gathered facts about Ollama, the
program that runs local models, giving a source for each. The other designed the comparison
independently, so its design could be set against ours. Neither ran a model.

**Traps the research found, and what is done about each.**

| Trap | What we do about it |
|---|---|
| A prompt that is too long is cut from the front, with no error. | The same working-memory size is set on every call, and each result checks that the whole prompt was read. |
| If "thinking" is not set either way, each model uses its own default, and the defaults differ between sizes. | It is always set, on every call. |
| A known fault, still open: with thinking on, a model that answers without thinking can ignore the forced output format. | Code re-checks every output. One of the wrong shape counts as a failure. |
| Ollama does not promise the same answer every time, even at temperature 0. | It is tested, and the result decides how many repeats are needed. |
| On a Mac, Ollama can run a model on either of two engines, which enforce the output format differently. | One engine is chosen in the pre-check and used for all three sizes. |
| The meaning-based search model needs a short label on the front of each query and each passage. | The labels are added. |

**Seen directly on this machine** (looking only, changing nothing):

- It reports a power setting that reads as Low Power Mode, even when plugged in.
- About 5 GB of memory overflow ("swap") was in use, after 39 days without a restart.
- A model of the chosen family, already installed, carries a built-in penalty against repeating
  itself.

**What the independent design changed in ours:**

- Run each case once to screen, and three times only to confirm the best.
- Keep some cases back, and open them only once.
- Test the graders before testing any model.
- Never use the number that exposed a weakness as its own "before".

**Standing of these facts.** The research facts each have a source, but they have not been
re-verified one by one. Every one the sweep relies on is tested on this machine first, in the
pre-check.

## What is still not verified

- Nothing has been built or run against a live service.
- No response time has been measured. All timings so far are estimates. The sweep measures the
  time of each AI step; the time of a whole spoken turn is measured separately in the browser.
- How well a local language model handles the judging step is unknown until tested. The sweep
  measures it for three sizes of one model family.
- Whether a local model gives the same answer every time at temperature 0 is unknown. The
  pre-check tests it.
- Whether thinking, forced output format or worked examples help any step is unknown. The sweep
  measures each.
- How long the overnight run will take. Four to six hours is an estimate built on assumed
  speeds; a short timing test replaces it before the run.
- The Claude route has not been run. Until it is, it is described as "written, not run".
- Whether meaning-based search improves on word-matching for this note is unknown until the
  comparison table is produced.
- Deepgram's free credit was read from its pricing page, not tested by signing up.
- One study quoted (98% accurate quotes, 37% fully supported) was read in summary only.

## Sources worth knowing

| Topic | Source |
|---|---|
| Why instructions and filters are not enough | "The Attacker Moves Second" (2025), arXiv 2510.09023 |
| Limiting what the AI can do | "Design Patterns for Securing LLM Agents against Prompt Injections" (2025), arXiv 2506.08837 |
| Industry guidance | OWASP Top 10 for Large Language Model Applications, entry LLM01 |
| Accurate quotes that do not support the claim | "Verifiable by Construction" (2026), arXiv 2609.15964 |
| Speech software inventing words during silence | arXiv 2501.11378 and arXiv 2402.08021 |
| LangChain retirement | npm registry entry for `@langchain/community`; its repository's issue 61 |
| How local models behave under Ollama | Ollama's own documentation, release notes and issue tracker; the model makers' published model cards |
