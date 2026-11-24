// Scratch: run the after-viva steps on one sample answer.
//   pnpm tsx scripts/try-revision.ts [model]
import { loadCitationGuidance, loadExaminerNotes } from '../src/server/case.server';
import { loadStepsConfig } from '../src/server/config.server';
import { followUpSpeech, runFollowUp } from '../src/server/followup.server';
import { loadNoteIndex } from '../src/server/note-index.server';
import { produceRevision } from '../src/server/revision-pipeline.server';

const config = await loadStepsConfig();
if (process.argv[2]) for (const s of Object.values(config.steps)) s.model = process.argv[2];
const notes = await loadExaminerNotes();
const index = await loadNoteIndex();
const answers = {
  'all but the allergy':
    'This is acute primary angle closure in the right eye, and the left eye has a narrow angle so it is at risk too. It was probably set off by the dark cinema and the chlorphenamine she has just started, so I would stop the chlorphenamine. I would lie her flat and give analgesia and an antiemetic. To lower the pressure I would give timolol and apraclonidine drops, intravenous acetazolamide, and pilocarpine once the pressure starts to fall. When the cornea has cleared she needs laser peripheral iridotomy to both eyes, including the fellow eye. After the attack settles I would repeat gonioscopy of the right eye and look at both optic discs.',
  'vague and partly wrong':
    'I think it is conjunctivitis or maybe acute glaucoma. I would give some antibiotic drops and bring the pressure down with drops and see her in clinic next week.',
};
for (const [name, answer] of Object.entries(answers)) {
  console.log(`\n=================== ${name}`);
  const t0 = Date.now();
  const fu = await runFollowUp(notes, answer, config.steps.followup);
  console.log(`FOLLOW-UP [${fu.path}] (${Date.now() - t0} ms, ${fu.attempts.length} attempt(s))`);
  console.log(`  responding to: ${fu.respondingTo}`);
  console.log(`  says: ${followUpSpeech(fu)}`);
  for (const a of fu.attempts)
    console.log(
      `   - ${a.call.outcome} ${a.call.ms}ms q=${JSON.stringify(a.call.value?.question)} qcheck=${JSON.stringify(a.questionCheck)} anchor=${JSON.stringify(a.anchorCheck)}`,
    );
  const t1 = Date.now();
  try {
    const { card, trace } = await produceRevision(
      { notes, answer, followUpQuestion: fu.question, guidance: await loadCitationGuidance() },
      config,
      index,
    );
    console.log(`REVISION (${Date.now() - t1} ms)`);
    for (const i of trace.coverage?.items ?? [])
      console.log(`   ${i.id} ${i.status.padEnd(11)} (model: ${i.modelStatus}) ${i.quote ? '"' + i.quote + '"' : ''}`);
    console.log(
      `  coverage ${trace.coverage?.call.ms} ms; target ${trace.target?.id} chosen by ${trace.coverage?.targetChosenBy}: ${trace.target?.text}`,
    );
    console.log(
      `  retrieved: ${trace.retrieval?.results.map((r) => `${r.chunk.id}(p${r.chunk.pages.join('-')})`).join(' ')} [${trace.retrieval?.mode}]`,
    );
    console.log(
      `  revision ${trace.revision?.call.ms} ms: ${JSON.stringify(trace.revision?.call.value)} wording=${JSON.stringify(trace.revision?.wordingCheck)}`,
    );
    console.log(`  verifier ${trace.verifier?.call.ms} ms: ${JSON.stringify(trace.verifier?.call.value)}`);
    console.log('  CARD:', JSON.stringify(card, null, 2).replace(/\n/g, '\n  '));
  } catch (e) {
    console.log('REVISION UNAVAILABLE:', String(e));
  }
}
