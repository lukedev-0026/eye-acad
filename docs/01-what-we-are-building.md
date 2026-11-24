# 1. What we are building

## The task in one paragraph

Eye Academy asked for a practice oral exam for trainee eye doctors, driven by voice. The trainee
talks to an AI examiner about one fictional patient, asks for examination results, gives a
diagnosis and treatment plan, answers one follow-up question, and afterwards receives one piece of
revision advice backed by a quote from a supplied reference document.

It must be built with three named technologies: TanStack Start (the web framework), Firebase Auth
(sign-in) and Firestore (the database).

## What a session looks like

1. **Sign in.** The trainee signs in. Nothing about the case is visible before that.
2. **The examiner sets the scene.** Spoken and shown on screen: "A 64-year-old woman attends eye
   casualty at 23:40 with a painful red right eye. Ask me for any examination findings you need,
   then tell me your diagnosis and immediate management."
3. **The trainee asks for findings, one at a time.** They hold a button and speak: "What's the
   pressure in the right eye?" The examiner answers aloud and the result appears in a list on
   screen: *Right eye, intraocular pressure: 58 mmHg.*
4. **Some things are not available.** If the trainee asks for a test that could not be done, the
   examiner says so and gives the reason, for example "Not available: No view: corneal oedema".
   It never makes up a result.
5. **The trainee gives their answer.** They press "Give my answer" and say their diagnosis and what
   they would do first.
6. **The examiner asks one follow-up question**, chosen to respond to what the trainee said.
7. **The viva ends.** No pass or fail is given.
8. **One revision point appears.** For example: the trainee gave a drug without mentioning the
   patient's allergy, so the revision point is about checking for that allergy, shown with "p. 6"
   and the exact sentence from the reference document.
9. **Everything is saved.** After a page refresh, or on another day, the trainee can reopen the
   conversation and the findings they uncovered. Nobody else can see it.

## What we were given

| Item | What it contains |
|---|---|
| The brief | One page: what to build, what to submit, and that the reviewers will change something live in the walkthrough. |
| The case | One fictional patient: history, 24 examination findings (6 of them unavailable), and hidden examiner notes with the right diagnosis, six key points and three follow-up ideas. |
| The reference note | Ten pages on glaucoma. One section covers this patient's condition; the others are there partly to see whether the app quotes the wrong section. |

## What we have to hand in

- The code, with instructions for running it.
- An explanation of which voice technology was chosen, one alternative considered, and a timed
  measurement of how long the examiner takes to respond.
- Three repeatable checks with expected and observed results: one for a finding that exists, one
  for a finding that is unavailable, and one showing the quote really supports the revision point.
- A short handover: how the reference document was prepared, how passages are chosen, and one
  example of AI-tool help with how it was verified.
- One improvement, built or sketched.

## What the reviewers are really testing

Reading the brief closely, five things matter more than features:

1. **No made-up clinical data.** The brief's words are "preserving the correct eye, value and
   units". Saying "left" for "right", or 18 for 58, is a failure.
2. **Honesty when there is nothing to say.** The same idea appears three times: say when a finding
   is unavailable, say when the reference note does not support a point, and say where you stopped.
3. **Evidence, not claims.** They ask for measurements and for expected-versus-observed results.
4. **Understanding your own code.** They will change something live and ask what happens.
5. **Restraint.** The word "one" appears repeatedly: one follow-up, one revision point, one
   alternative, one improvement.

## The idea the whole design rests on

**The AI never writes a clinical fact. It only chooses from a list, and ordinary code writes the words.**

When the trainee asks for the right eye pressure, the AI is not asked to answer. It is handed a
menu of finding names and must reply with a choice from that menu: "Intraocular pressure, right
eye". Ordinary code then looks that row up in the case file and builds the sentence. The AI never
even sees the number 58, so it cannot get it wrong.

The same approach is used for quotes from the reference document: the AI chooses sentence
numbers, and code copies out the sentence and its page number.

Only two things are actually written by the AI: the follow-up question and the one-sentence
revision point. Both are checked by code before use, with a pre-written fallback if they fail.
