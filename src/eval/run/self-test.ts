import type { AnyStepEval, EvalCase, EvalContext } from '@/eval/eval.types';

export interface SelfTestResult {
  cases: number;
  // Cases whose own expected answer passes the grader. It should be all of them.
  idealPass: number;
  wrong: Array<string>;
  // The floor: what a step that ignores its input scores.
  constantName: string;
  constantPass: number;
}

// Before any model runs: do the graders agree with their own expected
// answers, and what does a step that ignores its input score?
export function selfTest(evalDef: AnyStepEval, cases: ReadonlyArray<EvalCase>, ctx: EvalContext): SelfTestResult {
  const wrong: Array<string> = [];
  let constantPass = 0;
  for (const c of cases) {
    const ideal = evalDef.grade(c, evalDef.ideal(c, ctx), ctx);
    if (!ideal.pass || ideal.costly) wrong.push(`${c.id}: ${ideal.detail}`);
    if (evalDef.grade(c, evalDef.constant.observe(c, ctx), ctx).pass) constantPass++;
  }
  return {
    cases: cases.length,
    idealPass: cases.length - wrong.length,
    wrong,
    constantName: evalDef.constant.name,
    constantPass,
  };
}
