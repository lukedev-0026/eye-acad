import { stem } from '@/domain/note/retrieve';

// Checks that code applies to the only two things a model writes for the
// trainee: the follow-up question and the one-sentence revision point. A model
// is never asked to judge its own output.

// Lower-cased words, with apostrophes folded in and plurals stemmed, so that
// "doesn't" and "pressures" compare sensibly.
function words(text: string): Array<string> {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
const stems = (text: string) => new Set(words(text).map(stem));

const squash = (text: string) => words(text).join(' ');

// Is `quote` something the trainee actually said? Compared word for word,
// ignoring capitals and punctuation.
export function isQuoteFrom(quote: string, source: string, minWords = 2): boolean {
  const q = squash(quote);
  if (q.split(' ').filter(Boolean).length < minWords) return false;
  return ` ${squash(source)} `.includes(` ${q} `);
}

// Words a question may use without their coming from the trainee or the
// supplied follow-up questions: grammar, and neutral ways of asking.
const QUESTION_FRAME = new Set(
  `a about after again all also am an and any are as at be been before but by can could did do does doing done
   else even ever first for from further had has have how i if in into is it its just me mention mentioned might
   more most much my next no not now of on once one or other our out over please said say should so some talk
   tell than that the their them then there these they this those through to too under up us very was we were
   what when where which while who why will with would yes you your yours explain describe reason reasoning think
   thinking mean means meant matter matters important happen happens case patient here plan approach choose chose
   chosen choice decide decided decision give given giving use used using consider considered considering manage
   managing management treat treated treating treatment further specifically particular exactly when whether`
    .split(/\s+/)
    .map(stem),
);

// Phrases that pass a verdict on the answer. The examiner asks; it does not mark.
const VERDICT =
  /\b(correct|incorrect|right answer|wrong|well done|good|great|excellent|exactly right|not quite|unfortunately|you (forgot|missed|failed|should have|didn'?t mention|did not mention|omitted|left out|neglected))\b/i;

export type CheckResult = { ok: true } | { ok: false; reason: string };

const MAX_QUESTION_WORDS = 25;

// The follow-up question may be spoken only if every meaningful word in it
// came from the trainee's own answer or from the supplied follow-up
// questions. A question built this way cannot introduce a drug, a finding or
// a diagnosis the trainee did not raise, so it cannot give the answer away.
export function checkFollowUpQuestion(question: string, answer: string, suppliedIdeas: Array<string>): CheckResult {
  const q = question.trim();
  if (!q) return { ok: false, reason: 'empty' };
  if ((q.match(/\?/g) ?? []).length !== 1 || !q.endsWith('?')) {
    return { ok: false, reason: 'must be one question ending in a question mark' };
  }
  if (/\d/.test(q)) return { ok: false, reason: 'contains a number' };
  if (/[<>{}[\]*_#`|\\]/.test(q) || /https?:/i.test(q)) {
    return { ok: false, reason: 'contains markup or a link' };
  }
  const all = words(q);
  if (all.length > MAX_QUESTION_WORDS) return { ok: false, reason: `more than ${MAX_QUESTION_WORDS} words` };
  if (all.length < 4) return { ok: false, reason: 'too short to be a question' };
  if (VERDICT.test(q)) return { ok: false, reason: 'passes a verdict on the answer' };

  const allowed = new Set([...stems(answer), ...suppliedIdeas.flatMap((i) => [...stems(i)])]);
  const outside = [...new Set(all.map(stem))].filter((w) => !QUESTION_FRAME.has(w) && !allowed.has(w));
  if (outside.length) {
    return {
      ok: false,
      reason: `uses words from neither the answer nor the supplied questions: ${outside.join(', ')}`,
    };
  }
  return { ok: true };
}

const MIN_ANCHOR_WORDS = 3;
const MAX_ANCHOR_WORDS = 20;

// The trainee's words the question responds to: a short, real quotation.
export function checkAnchor(anchor: string, answer: string): CheckResult {
  const n = words(anchor).length;
  if (n < MIN_ANCHOR_WORDS || n > MAX_ANCHOR_WORDS) {
    return { ok: false, reason: `anchor must be ${MIN_ANCHOR_WORDS} to ${MAX_ANCHOR_WORDS} words` };
  }
  return isQuoteFrom(anchor, answer, MIN_ANCHOR_WORDS)
    ? { ok: true }
    : { ok: false, reason: 'anchor is not a quotation from the answer' };
}

// Grammar words the revision sentence may always use. Negations are NOT here
// on purpose: "not", "avoid" and the like must appear in the passage itself.
const SENTENCE_FRAME = new Set(
  `a an and are as at be because been before being but by can do does each for from had has have if in into is it
   its may of on once or so such than that the their them then there these they this those to up was were when
   where which while who with will would you your should after also any both either how about must need needs
   remember revise review recall check consider make sure always first during until since`
    .split(/\s+/)
    .map(stem),
);

const MAX_POINT_WORDS = 40;

// The revision point is one plain sentence, with no numbers of its own, and
// every meaningful word in it must appear in the cited passage or in the key
// point it is about. This is checked against the whole passage, not just the
// quoted sentence: the key sentence on page 6 says "it", and the drug it means
// is named in the sentence before.
export function checkRevisionPoint(point: string, passage: string, target: string): CheckResult {
  const p = point.trim();
  if (!p) return { ok: false, reason: 'empty' };
  if (/\d/.test(p)) return { ok: false, reason: 'contains a number' };
  if (/[<>{}[\]*_#`|\\]/.test(p) || /https?:/i.test(p)) {
    return { ok: false, reason: 'contains markup or a link' };
  }
  if (!/[.]$/.test(p)) return { ok: false, reason: 'must end with a full stop' };
  if (/[.!?]\s+\S/.test(p.slice(0, -1))) return { ok: false, reason: 'more than one sentence' };
  const all = words(p);
  if (all.length > MAX_POINT_WORDS) return { ok: false, reason: `more than ${MAX_POINT_WORDS} words` };
  if (all.length < 5) return { ok: false, reason: 'too short' };

  const allowed = new Set([...stems(passage), ...stems(target)]);
  const outside = [...new Set(all.map(stem))].filter((w) => !SENTENCE_FRAME.has(w) && !allowed.has(w));
  if (outside.length) {
    return { ok: false, reason: `uses words found in neither the passage nor the key point: ${outside.join(', ')}` };
  }
  return { ok: true };
}

// Which supplied follow-up question shares most words with the answer. Used
// when the model's choice cannot be used at all.
export function closestIdea(answer: string, ideas: Array<string>): number {
  const said = stems(answer);
  let best = 0;
  let bestScore = -1;
  for (const [i, idea] of ideas.entries()) {
    const score = [...stems(idea)].filter((w) => !QUESTION_FRAME.has(w) && said.has(w)).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}
