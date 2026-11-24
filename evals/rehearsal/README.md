# Change rehearsal: editing the case file with no code change

Run on 24 November 2026, 13:49 UTC, on the app's own settings. This is what a reviewer might do
live: change the case and ask again.

A copy of `data/case-EA-VIVA-001.json` was made with three edits, and the app was pointed at it
with `VIVA_CASE_FILE`. Nothing else was touched.

| Edit | In the copy |
|---|---|
| A value changed | `iop_right.value`: 58 → 61 |
| A finding marked unavailable | `gonio_left.available`: false, with `unavailable_reason`: "Patient could not tolerate the lens" (its old result text left in `value`) |
| A new finding with a unit the code has never seen | `cct_right`: right eye, "Central corneal thickness", 612, unit "µm", method "Ultrasound pachymetry" |

## What `pnpm findings` printed for the three rows

```
shown : Right eye · Intraocular pressure: 61 mmHg (Goldmann applanation, 23:55)
spoken: Right eye. Intraocular pressure: 61 millimetres of mercury. Method: Goldmann applanation, 23:55.

shown : Left eye · Gonioscopy: Not available: Patient could not tolerate the lens
spoken: Left eye. Gonioscopy: Not available: Patient could not tolerate the lens.

shown : Right eye · Central corneal thickness: 612 µm (Ultrasound pachymetry)
spoken: Right eye. Central corneal thickness: 612 micrometres. Method: Ultrasound pachymetry.
```

The left-eye gonioscopy result that was left in the `value` field is not shown or said.

## What the app answered, ten typed runs each

`pnpm check --only required --required 1,2` works out what should be said from the raw case
file at run time, so it follows the edit. Rows: `check-on-changed-case.jsonl`.

| Asked | Answered | Runs |
|---|---|---|
| "What is the intraocular pressure in the right eye?" | Right eye · Intraocular pressure: **61 mmHg** (Goldmann applanation, 23:55) | 10 of 10 |
| "Can I have gonioscopy of the right eye?" | Right eye · Gonioscopy: Not available: No view: corneal oedema | 10 of 10 |
| "Is there a relative afferent pupillary defect?" | Both eyes · Relative afferent pupillary defect: Not available: Right pupil fixed, so the test cannot be interpreted | 10 of 10 |
| "What is the central corneal thickness?" | Right eye · Central corneal thickness: **612 µm** (Ultrasound pachymetry); said as "612 micrometres" | 10 of 10 |

The last row is reported by the check as 0 of 10, and that is the check being out of date for
this copy, not the app being wrong: its fixed list says central corneal thickness is "not in the
case", and in this copy it is. The app found the new finding every time.

It also shows what the known fault with that question is. On the real case file, where there is
no such finding, the menu-picker offers the nearest thing it has (the cornea). Once the finding
exists, it picks it.
