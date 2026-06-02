# Eval dataset — how the gold labels were derived

`dataset.json` is the eval dataset for `nat eval` (Task 12). It has three items
`[{id, question, answer}]`:

- `question` is a **SCOPE JSON string** — exactly what the `orchestrate` workflow
  consumes as input (the workflow takes a scope string, not a natural-language
  prompt). The three scopes are realistic SoCal project changes chosen to exercise
  three different coverage families.
- `answer` is the **gold per-program disposition map**, keyed by `program id`
  (the stable id from `research_core.program_registry.PROGRAM_REGISTRY`, e.g.
  `scaqmd-permit-to-construct`). Keying by program id — not by the human
  `requirement` label — keeps the gold robust: program ids never change, whereas
  requirement strings are derived (`synthesis._requirement_for`). The evaluator maps
  each gold program id to the determination row(s) it may surface under via
  `invariants._program_present_labels(program)`.

## Reproducible derivation

For each scope, the set of programs that gold may label is **exactly**
`research_core.completeness.expected_programs_for_scope(scope)` — the same
registry×scope recall-floor derivation `finalize_run` uses. (Verified
programmatically: every gold key is an expected program for its scope; no extras,
no omissions.) So the *which-programs* axis is mechanical and auditable.

The *disposition* axis (`applies` vs `needs_review`) is curated with EHS domain
judgment, under one rule:

> Label a program **`applies`** only when the scope facts on their own clearly
> trigger the obligation (no further threshold lookup needed). Otherwise label it
> **`needs_review`** — the honest default the pipeline itself uses for anything
> that needs a quantity/threshold/category lookup, an exemption-exception check,
> or a missing decision-relevant fact.

No program is labeled `no` in gold: a clean run never *negates* an expected program
from scope facts alone; it either confirms applicability or defers to review.

### scope-scaqmd-coating-booth (air + hazmat)
Coating booth (emitting equipment) + 60 gal flammable solvent, SCAQMD.
- `scaqmd-permit-to-construct` → **applies** — installing emitting equipment
  requires a Permit to Construct (Rule 201).
- `ca-hmbp` → **applies** — 60 gal of a hazardous material exceeds the 55-gal HMBP
  reporting threshold.
- `scaqmd-rule-219-exemption`, `scaqmd-rule-222-registration` → **needs_review** —
  exemption/registration paths are conditional on equipment specifics.
- `caa-title-v` → **needs_review** — major-source status needs emissions data.
- `epcra-tier-ii` → **needs_review** — Tier II reporting turns on the 10,000 lb /
  TPQ threshold; 60 gal may be below it.
- `osha-psm` → **needs_review** — PSM applies only to a listed highly-hazardous
  chemical above its threshold quantity.

### scope-grading-stormwater (construction stormwater)
Grading 5 acres, NAICS 237310, no equipment/chemicals.
- `ca-construction-general-permit` → **applies** — land disturbance ≥ 1 acre
  triggers CGP coverage (matches `synthesis._applies_for` for `H-STORM-CGP`, which
  returns "yes" when `disturbance_acres >= 1`).
- `ca-industrial-general-permit` → **needs_review** — IGP turns on whether the
  facility's SIC/NAICS is a regulated industrial category (a lookup).

### scope-wastewater-pretreatment (wastewater + waste + air)
Metal-finishing/plating line, discharges process wastewater to sewer, generates
spent plating-bath waste; NAICS 332813.
- `epa-pretreatment` → **applies** — metal-finishing process discharge to a POTW is
  a categorical National Pretreatment industry.
- `epa-hazwaste-generator` → **applies** — generating spent plating bath establishes
  hazardous-waste generator status (the *category* still needs the monthly quantity).
- `scaqmd-permit-to-construct` → **applies** — the plating line is emitting equipment.
- `scaqmd-rule-219-exemption`, `scaqmd-rule-222-registration`,
  `ca-industrial-general-permit`, `ca-construction-general-permit`,
  `caa-title-v` → **needs_review** — each needs a threshold/category/exemption
  lookup or a fact not present in the scope (e.g. no disturbance acres given, so CGP
  is reached only via NAICS).

## What the evaluators do with this

- `determination_accuracy` compares the workflow's predicted disposition for each
  gold program against the gold label (fraction matching; a gold program absent from
  the output scores 0 for that program). The gold vocab is the program-disposition
  vocab (`applies`/`needs_review`); a determination ROW's `applies` uses
  `yes`/`no`/`needs_review`. The evaluator normalizes the row vocab into the gold
  vocab before comparing (`yes`->`applies`, `no`->`does_not_apply`,
  `needs_review`->`needs_review`), so a row that affirmatively applies matches gold
  `applies`, and a row that negates does not.
- `expected_program_recall` ignores `answer` and checks that every
  `expected_programs_for_scope(scope)` program *appears* in the determinations
  (reuses the recall-floor coverage logic from `invariants.py`).
- `grounding_faithfulness` checks that every *verified* determination's verbatim
  quote is actually present in its gathered source (reuses the grounding check from
  `invariants.py`); it does not consult `answer`.
