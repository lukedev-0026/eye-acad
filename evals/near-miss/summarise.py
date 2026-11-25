"""Builds the near-miss comparison table from raw check rows only.

    python3 evals/near-miss/summarise.py evals/results/check-<id>.jsonl ...

One line per configuration found in the files. A case passes only if it passed
on every run. Rows are grouped by case type: near_miss, near_control, and
everything else (the guard).
"""
import json
import statistics
import sys
from collections import defaultdict


def label(s):
    fix = 'check' if 'check-requested-item' in (s.get('improvements') or []) else (
        'rules' if s['promptVariant'] == 'rules' else 'off')
    return (s['model'], s.get('temperature'), fix)


groups = defaultdict(list)
for path in sys.argv[1:]:
    for line in open(path):
        row = json.loads(line)
        if row.get('type') == 'result' and row.get('step') == 'selector':
            groups[(label(row['settings']), row['split'])].append(row)

print('| Model | Temp | Fix | Split | Near misses passed | Near-miss runs right | Controls passed | Other cases passed | Costly runs | Calls per turn | Middle ms |')
print('|---|---|---|---|---|---|---|---|---|---|---|')
for (key, split), rows in sorted(groups.items(), key=lambda kv: (kv[0][1], kv[0][0])):
    by_case = defaultdict(list)
    for r in rows:
        by_case[(r['caseType'], r['caseId'])].append(r)
    def passed(kind):
        cases = [v for (t, _), v in by_case.items() if (t == kind if kind != 'other' else t not in ('near_miss', 'near_control'))]
        return sum(all(r['pass'] for r in v) for v in cases), len(cases)
    nm, cn, ot = passed('near_miss'), passed('near_control'), passed('other')
    nm_runs = [r for r in rows if r['caseType'] == 'near_miss']
    costly = sum(r['costly'] for r in rows)
    calls = sum(r['calls'] for r in rows) / len(rows)
    ms = statistics.median(r['ms'] for r in rows)
    model, temp, fix = key
    print(f"| {model} | {temp} | {fix} | {split} | {nm[0]} of {nm[1]} | {sum(r['pass'] for r in nm_runs)} of {len(nm_runs)} | {cn[0]} of {cn[1]} | {ot[0]} of {ot[1]} | {costly} | {calls:.2f} | {ms:.0f} |")
