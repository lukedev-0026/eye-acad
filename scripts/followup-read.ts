// Prepares the blind read of follow-up questions. For the confirmed follow-up
// configurations it collects every question a trainee would actually have
// been asked, merges identical ones, shuffles them, and hides which
// configuration wrote which.
//   pnpm tsx scripts/followup-read.ts          write the sheet and its key
//   pnpm tsx scripts/followup-read.ts --score  read the filled-in sheet back
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { loadContext, readCases } from '../src/eval/context';
import { describe } from '../src/eval/grid';
import { loadSweep } from '../src/eval/sweep-data';

const SHEET = 'evals/sweep/followup-read.md';
const KEY = 'evals/sweep/followup-read-key.json';
const ctx = await loadContext();
const data = await loadSweep('sweep-ollama');
const answers = new Map(
  (await readCases<{ answer: string }, unknown>('followup.jsonl')).map((c) => [c.id, c.input.answer]),
);

type Item = { n: number; caseId: string; question: string; path: string; configs: Array<string> };

if (!process.argv.includes('--score')) {
  // Only configurations that had the confirmation runs.
  const confirmed = [
    ...new Set(data.results.filter((r) => r.step === 'followup' && r.stage === 'confirm').map((r) => r.configId)),
  ];
  const rows = data.results.filter(
    (r) => r.step === 'followup' && confirmed.includes(r.configId) && r.split === 'tune',
  );
  const byText = new Map<string, Item>();
  for (const r of rows) {
    const o = r.observed as { question?: string; path?: string } | null;
    if (!o?.question) continue;
    const key = `${r.caseId}|${o.question.trim()}`;
    const item = byText.get(key) ?? {
      n: 0,
      caseId: r.caseId,
      question: o.question.trim(),
      path: o.path ?? '',
      configs: [],
    };
    if (!item.configs.includes(r.configId)) item.configs.push(r.configId);
    byText.set(key, item);
  }
  // Shuffled by a hash, so the order says nothing about the source.
  const items = [...byText.values()].sort((a, b) =>
    createHash('sha1')
      .update(a.caseId + a.question)
      .digest('hex')
      .localeCompare(
        createHash('sha1')
          .update(b.caseId + b.question)
          .digest('hex'),
      ),
  );
  items.forEach((item, i) => (item.n = i + 1));
  const cell = (t: string) => t.replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
  const md = [
    '# Follow-up questions: a blind read',
    '',
    `These are the ${items.length} different follow-up questions that the confirmed settings asked across the sample answers. Which setting wrote which is hidden (it is in \`followup-read-key.json\`; please do not open it first). Some are the case file's own questions, used word for word.`,
    '',
    'For each one, put **y** or **n** in the last two columns:',
    '',
    '- **Responds?** Does the question respond to what this trainee actually said?',
    '- **Gives away?** Does it reveal the diagnosis or something a full answer should include, or tell the trainee whether they were right?',
    '',
    'The supplied follow-up questions in the case file are: ' +
      ctx.notes.follow_up_ideas.map((q) => `“${q}”`).join(', ') +
      '.',
    '',
    '| # | The trainee said | The examiner asked | Responds? | Gives away? |',
    '|---|---|---|---|---|',
    ...items.map((i) => `| ${i.n} | ${cell(answers.get(i.caseId) ?? i.caseId)} | **${cell(i.question)}** |  |  |`),
    '',
  ].join('\n');
  await writeFile(SHEET, md);
  await writeFile(
    KEY,
    `${JSON.stringify({ items: items.map((i) => ({ n: i.n, caseId: i.caseId, question: i.question, path: i.path, configs: i.configs })), configs: Object.fromEntries(confirmed.map((id) => [id, describe(data.configs.get(id)!.settings)])) }, null, 2)}\n`,
  );
  console.log(`Wrote ${SHEET} (${items.length} questions from ${confirmed.length} configurations) and its key.`);
} else {
  const key = JSON.parse(await readFile(KEY, 'utf8')) as { items: Array<Item>; configs: Record<string, string> };
  const marks = new Map<number, { responds: string; givesAway: string }>();
  for (const line of (await readFile(SHEET, 'utf8')).split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length >= 6 && /^\d+$/.test(cells[1]))
      marks.set(Number(cells[1]), { responds: cells[4].toLowerCase(), givesAway: cells[5].toLowerCase() });
  }
  const unread = key.items.filter(
    (i) => !/^[yn]/.test(marks.get(i.n)?.responds ?? '') || !/^[yn]/.test(marks.get(i.n)?.givesAway ?? ''),
  );
  if (unread.length) console.log(`${unread.length} of ${key.items.length} questions have not been marked yet.`);
  for (const [id, name] of Object.entries(key.configs)) {
    const mine = key.items.filter((i) => i.configs.includes(id) && !unread.includes(i));
    const responds = mine.filter((i) => marks.get(i.n)!.responds.startsWith('y')).length;
    const gives = mine.filter((i) => marks.get(i.n)!.givesAway.startsWith('y')).length;
    console.log(`${name}: responds ${responds} of ${mine.length}; gives something away ${gives} of ${mine.length}`);
  }
}
