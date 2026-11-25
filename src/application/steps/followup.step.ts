import { z } from 'zod';

import { followUpPrompt } from '@/application/prompts/followup.prompt';
import { describeJsonShape } from '@/application/prompts/json-shape.prompt';
import { itemAt } from '@/common/arrays';
import { MAX_ANSWER_CHARS } from '@/domain/attempt/attempt';
import type { ExaminerNotes } from '@/domain/case/case.schema';
import { LINES } from '@/domain/examiner/lines';
import type { CallResult } from '@/domain/llm/call-result';
import type { LanguageModelGateway } from '@/domain/llm/language-model.gateway';
import type { StepSettings } from '@/domain/llm/step-settings.schema';
import {
  checkAnchor,
  checkFollowUpQuestion,
  closestIdea,
} from '@/domain/text/text-checks';
import type { CheckResult } from '@/domain/text/text-checks';

function followUpSchema(ideaCount: number) {
  const ids = Array.from({ length: ideaCount }, (_, i) => `idea_${i + 1}`);
  return z.object({
    idea: z.enum(ids as [string, ...Array<string>]),
    anchor_quote: z.string().max(400),
    question: z.string().max(600),
  });
}
export type FollowUpOutput = z.infer<ReturnType<typeof followUpSchema>>;

export interface FollowUpAttempt {
  call: CallResult<FollowUpOutput>;
  questionCheck?: CheckResult;
  anchorCheck?: CheckResult;
}

export interface FollowUpResult {
  question: string;
  respondingTo: string | null;
  path: 'written' | 'supplied' | 'fixed';
  ideaIndex: number | null;
  attempts: Array<FollowUpAttempt>;
}

/** The model's question is used only if every meaningful word is in the
 *  answer or the case file's questions; else a case-file one verbatim. */
export async function runFollowUp(
  models: LanguageModelGateway,
  notes: ExaminerNotes,
  rawAnswer: string,
  settings: StepSettings,
): Promise<FollowUpResult> {
  const answer = rawAnswer.slice(0, MAX_ANSWER_CHARS);
  const ideas = notes.follow_up_ideas;
  if (ideas.length === 0) {
    return {
      question: LINES.noFollowUpIdeas,
      respondingTo: null,
      path: 'fixed',
      ideaIndex: null,
      attempts: [],
    };
  }

  const schema = followUpSchema(ideas.length);
  const shape = describeJsonShape(schema);
  const attempts: Array<FollowUpAttempt> = [];
  let retryReason: string | undefined;
  let lastIdea: number | null = null;
  let goodAnchor: string | null = null;

  for (let i = 0; i < 2; i++) {
    const call = await models.callStep(
      settings,
      followUpPrompt(
        settings.promptVariant,
        { notes, answer, retryReason },
        shape,
      ),
      schema,
      { step: 'followup' },
    );
    const attempt: FollowUpAttempt = { call };
    attempts.push(attempt);
    if (call.outcome !== 'ok') {
      retryReason = 'the reply was not in the required format';
      continue;
    }
    lastIdea = Number(call.value.idea.slice(5)) - 1;
    attempt.anchorCheck = checkAnchor(call.value.anchor_quote, answer);
    attempt.questionCheck = checkFollowUpQuestion(
      call.value.question,
      answer,
      ideas,
    );
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

  const ideaIndex = lastIdea ?? closestIdea(answer, ideas);
  return {
    question: itemAt(ideas, ideaIndex),
    respondingTo: goodAnchor,
    path: 'supplied',
    ideaIndex,
    attempts,
  };
}

/** Prefaces a supplied question with the trainee's own words. */
export function followUpSpeech(result: FollowUpResult): string {
  return result.path === 'supplied' && result.respondingTo
    ? `You said: ${result.respondingTo}. ${result.question}`
    : result.question;
}
