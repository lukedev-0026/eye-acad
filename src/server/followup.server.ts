import { z } from 'zod';

import type { ExaminerNotes } from './case-schema';
import { LINES } from './lines';
import { callStep, describeJsonShape } from './llm/call-step.server';
import type { CallResult, StepSettings } from './llm/types';
import { followUpPrompt } from './prompts/followup';
import { checkAnchor, checkFollowUpQuestion, closestIdea } from './text-checks';
import type { CheckResult } from './text-checks';

export const MAX_ANSWER_CHARS = 4000;

function followUpSchema(ideaCount: number) {
  const ids = Array.from({ length: ideaCount }, (_, i) => `idea_${i + 1}`);
  return z.object({
    idea: z.enum(ids as [string, ...Array<string>]),
    anchor_quote: z.string().max(400),
    question: z.string().max(600),
  });
}
export type FollowUpOutput = z.infer<ReturnType<typeof followUpSchema>>;

export type FollowUpAttempt = {
  call: CallResult<FollowUpOutput>;
  questionCheck?: CheckResult;
  anchorCheck?: CheckResult;
};

export type FollowUpResult = {
  // Exactly what is shown and spoken.
  question: string;
  // The trainee's own words it responds to, if a real quotation was found.
  respondingTo: string | null;
  // written: the model's question passed every check.
  // supplied: one of the case file's own questions, as written.
  // fixed: the case file had none.
  path: 'written' | 'supplied' | 'fixed';
  ideaIndex: number | null;
  attempts: Array<FollowUpAttempt>;
};

// One follow-up question. The model may write it, but it is only used if code
// finds every meaningful word in the trainee's answer or in the case file's
// own follow-up questions. Otherwise one of those questions is used verbatim.
export async function runFollowUp(
  notes: ExaminerNotes,
  rawAnswer: string,
  settings: StepSettings,
): Promise<FollowUpResult> {
  const answer = rawAnswer.slice(0, MAX_ANSWER_CHARS);
  const ideas = notes.follow_up_ideas;
  if (ideas.length === 0) {
    return { question: LINES.noFollowUpIdeas, respondingTo: null, path: 'fixed', ideaIndex: null, attempts: [] };
  }

  const schema = followUpSchema(ideas.length);
  const shape = describeJsonShape(schema);
  const attempts: Array<FollowUpAttempt> = [];
  let retryReason: string | undefined;
  let lastIdea: number | null = null;
  let goodAnchor: string | null = null;

  // One retry, told why the first attempt could not be used.
  for (let i = 0; i < 2; i++) {
    const call = await callStep(
      settings,
      followUpPrompt(settings.promptVariant, { notes, answer, retryReason }, shape),
      schema,
    );
    const attempt: FollowUpAttempt = { call };
    attempts.push(attempt);
    if (call.outcome !== 'ok' || !call.value) {
      retryReason = 'the reply was not in the required format';
      continue;
    }
    lastIdea = Number(call.value.idea.slice(5)) - 1;
    attempt.anchorCheck = checkAnchor(call.value.anchor_quote, answer);
    attempt.questionCheck = checkFollowUpQuestion(call.value.question, answer, ideas);
    if (attempt.anchorCheck.ok) goodAnchor = call.value.anchor_quote.trim();
    if (attempt.anchorCheck.ok && attempt.questionCheck.ok) {
      return {
        question: call.value.question.trim(),
        respondingTo: goodAnchor,
        path: 'written',
        ideaIndex: lastIdea,
        attempts,
      };
    }
    retryReason = !attempt.questionCheck.ok
      ? `the question ${attempt.questionCheck.reason}`
      : `the anchor_quote was not copied exactly from the answer`;
  }

  // Fallback: a question from the case file, word for word. If the model never
  // gave a usable choice, code picks the one closest to what was said.
  const ideaIndex = lastIdea ?? closestIdea(answer, ideas);
  return { question: ideas[ideaIndex], respondingTo: goodAnchor, path: 'supplied', ideaIndex, attempts };
}

// What the examiner says aloud. A supplied question is prefaced with the
// trainee's own words, so even the fallback responds to what was said.
export function followUpSpeech(result: FollowUpResult): string {
  return result.path === 'supplied' && result.respondingTo
    ? `You said: ${result.respondingTo}. ${result.question}`
    : result.question;
}
