# Eval dataset — how the gold labels were derived

`dataset.json` is the eval dataset for `nat eval` (Task 12). It has twelve items
`[{id, question, answer}]` (the original three coverage-family scopes plus nine
added in the eval-foundation expansion — see "Expansion scopes" below):

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

## Expansion scopes (eval-foundation: 3 → 12)

Nine scopes were added to widen coverage from three families to every registry
family plus two threshold *edge* pairs. As above, each scope's gold **KEYS are
mechanical** — exactly `expected_programs_for_scope(scope)` (the recall floor); the
`test_dataset_gold_keys_are_expected_programs` guard proves this for all twelve.
The **dispositions are curated** and feed *only* the directional `determination_accuracy`
metric, so reasonable beats perfect. Curation rule (same as the original three): label
`applies` only when scope facts on their own clearly trigger the obligation
(unconditionally) — in practice `ca-construction-general-permit` when
`disturbance_acres >= 1`, `scaqmd-permit-to-construct` when there is new emitting
equipment, plus a few quantities far above a well-known statutory threshold; otherwise
`needs_review` (the honest default for anything needing a threshold/category/exemption
lookup).

- `scope-cgp-edge-under` — grade **0.9** acres, no equipment/chemicals. Exercises the
  CGP **under-1-acre** edge: CGP does NOT unconditionally trigger (< 1 acre) →
  `needs_review`; IGP via NAICS → `needs_review`. (Pairs with the over-edge below.)
- `scope-cgp-edge-over` — grade **1.0** acre, no equipment/chemicals. The CGP
  **at/over-1-acre** edge: CGP unconditionally triggers (`>= 1`) → `applies`; IGP via
  NAICS → `needs_review`.
- `scope-titlev-large-voc` — high-throughput coating line, 4000 gal/month VOC coating
  (large-VOC / Title-V family). New emitting equipment → `scaqmd-permit-to-construct`
  `applies`; 4000 gal far exceeds the 55-gal HMBP threshold → `ca-hmbp` `applies`;
  `caa-title-v` (major-source PTE), exemptions/registration, EPCRA/PSM, IGP/CGP all
  need a lookup → `needs_review`.
- `scope-hmbp-threshold` — store **55 gal** flammable + 500 lb corrosive (HMBP
  threshold edge). All three expected programs (HMBP, EPCRA Tier II, PSM) sit at/near a
  reporting threshold → all `needs_review`.
- `scope-epcra-tier2` — store **12,000 lb** of a hazardous chemical (EPCRA Tier II
  family). 12,000 lb clearly exceeds the 10,000-lb Tier II threshold → `epcra-tier-ii`
  `applies`; `ca-hmbp` (category lookup) and `osha-psm` (needs a *listed* HHC) →
  `needs_review`.
- `scope-osha-psm` — process using **1,800 lb chlorine**, a listed highly hazardous
  chemical (OSHA PSM family). 1,800 lb exceeds chlorine's 1,500-lb PSM threshold
  quantity → `osha-psm` `applies`; process equipment → `scaqmd-permit-to-construct`
  `applies`; remaining air/hazmat programs → `needs_review`.
- `scope-hazwaste-generator` — parts-cleaning line generating 1,500 kg/month spent
  solvent hazardous waste (hazwaste-generator family). A hazardous waste stream
  establishes generator status → `epa-hazwaste-generator` `applies` (the *category*
  still needs the monthly quantity); parts-washer equipment →
  `scaqmd-permit-to-construct` `applies`; rest → `needs_review`.
- `scope-igp-industrial` — steel-manufacturing (SIC 3312 / NAICS 331110) at an
  existing building, no grading, no discharge (IGP-isolated). Both expected stormwater
  programs are reached only via the industrial SIC/NAICS code (a category lookup, and
  no disturbance acres given) → both `needs_review`.
- `scope-benign-ti` — interior office tenant improvement, nothing but partitions and
  lighting (benign baseline). NOTE: because the facility carries a NAICS code,
  `_has_code_or_acres` still surfaces the two stormwater programs, so the expected set
  is NOT empty — both are `needs_review`. This scope is the low-signal baseline rather
  than a true zero-coverage case (a zero-coverage scope would need a facility with no
  SIC/NAICS and no acres/equipment/chemicals/waste/discharge).

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
