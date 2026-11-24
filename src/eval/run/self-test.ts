import type { AnyStepEval, EvalCase, EvalContext } from '@/eval/eval.types';

// Before any model runs: do the graders agree with their own expected
// answers, and what does a step that ignores its input score?
export function selfTest(evalDef: AnyStepEval, cases: Array<EvalCase>, ctx: EvalContext) {
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
