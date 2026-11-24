import { readFile, writeFile } from 'node:fs/promises';

import { z } from 'zod';

import { sha1Hex } from '@/common/hash.server';
import type { Print } from '@/eval/cli';
import { readCases } from '@/eval/eval-context';
import type { EvalContext } from '@/eval/eval.types';
import { PATHS } from '@/eval/paths';
import { FollowUpExpectSchema, FollowUpInputSchema } from '@/eval/steps/followup.eval';
import { describe } from '@/eval/sweep/grid';
import type { SweepData } from '@/eval/sweep/sweep-data';

// The blind read of follow-up questions. Whether a question fits what the
// trainee said, and whether it gives anything away, is a person's judgement.
// So every question a trainee would actually have been asked is collected,
// identical ones are merged, the order is shuffled, and which configuration
// wrote which is kept in a separate key.

const ItemSchema = z.object({
  n: z.number().int(),
  caseId: z.string(),
  question: z.string(),
  path: z.string(),
  configs: z.array(z.string()),
});
type Item = z.infer<typeof ItemSchema>;
const KeySchema = z.object({ items: z.array(ItemSchema), configs: z.record(z.string(), z.string()) });

// What a follow-up run saved about the question it ended with.
const ObservedSchema = z.looseObject({ question: z.string().optional(), path: z.string().optional() }).nullable();

const cell = (text: string): string => text.replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();

export async function writeFollowUpSheet(ctx: EvalContext, data: SweepData, print: Print): Promise<void> {
  const answers = new Map(
    (await readCases('followup.jsonl', FollowUpInputSchema, FollowUpExpectSchema)).map((c) => [c.id, c.input.answer]),
  );
  // Only configurations that had the confirmation runs.
  const confirmed = [
    ...new Set(data.results.filter((r) => r.step === 'followup' && r.stage === 'confirm').map((r) => r.configId)),
  ];
  const rows = data.results.filter(
    (r) => r.step === 'followup' && confirmed.includes(r.configId) && r.split === 'tune',
  );

  const byText = new Map<string, Item>();
  for (const r of rows) {
    const observed = ObservedSchema.safeParse(r.observed).data;
    if (!observed?.question) continue;
    const question = observed.question.trim();
    const key = `${r.caseId}|${question}`;
    const item = byText.get(key) ?? { n: 0, caseId: r.caseId, question, path: observed.path ?? '', configs: [] };
    if (!item.configs.includes(r.configId)) item.configs.push(r.configId);
    byText.set(key, item);
  }
  // Shuffled by a hash, so the order says nothing about the source.
  const order = (item: Item): string => sha1Hex(item.caseId + item.question);
  const items = [...byText.values()].sort((a, b) => order(a).localeCompare(order(b)));
  items.forEach((item, i) => (item.n = i + 1));

  const sheet = [
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
  const key = {
    items: items.map((i) => ({ n: i.n, caseId: i.caseId, question: i.question, path: i.path, configs: i.configs })),
    configs: Object.fromEntries(
      confirmed.map((id) => {
        const config = data.configs.get(id);
        return [id, config ? describe(config.settings) : id];
      }),
    ),
  };
  await writeFile(PATHS.followUpSheet, sheet);
  await writeFile(PATHS.followUpKey, `${JSON.stringify(key, null, 2)}\n`);
  print(
    `Wrote ${PATHS.followUpSheet} (${items.length} questions from ${confirmed.length} configurations) and its key.`,
  );
}

const isMarked = (mark: string | undefined): boolean => /^[yn]/.test(mark ?? '');

// Reads the filled-in sheet back and counts, for each configuration, how many
// of its questions responded to the trainee and how many gave something away.
export async function scoreFollowUpSheet(print: Print): Promise<void> {
  const key = KeySchema.parse(JSON.parse(await readFile(PATHS.followUpKey, 'utf8')));
  const marks = new Map<number, { responds: string; givesAway: string }>();
  for (const line of (await readFile(PATHS.followUpSheet, 'utf8')).split('\n')) {
    const [, number, , , responds, givesAway] = line.split('|').map((c) => c.trim());
    if (number && /^\d+$/.test(number) && responds !== undefined && givesAway !== undefined) {
      marks.set(Number(number), { responds: responds.toLowerCase(), givesAway: givesAway.toLowerCase() });
    }
  }
  const read = key.items.filter((i) => isMarked(marks.get(i.n)?.responds) && isMarked(marks.get(i.n)?.givesAway));
  const unread = key.items.length - read.length;
  if (unread) print(`${unread} of ${key.items.length} questions have not been marked yet.`);
  for (const [id, name] of Object.entries(key.configs)) {
    const mine = read.filter((i) => i.configs.includes(id));
    const responds = mine.filter((i) => marks.get(i.n)?.responds.startsWith('y')).length;
    const gives = mine.filter((i) => marks.get(i.n)?.givesAway.startsWith('y')).length;
    print(`${name}: responds ${responds} of ${mine.length}; gives something away ${gives} of ${mine.length}`);
  }
}
