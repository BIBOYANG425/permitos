---
title: "SCAQMD Rule 222 — VOC Content Limits and Emission Standards"
category: voc-limits
relevance: "Sets the allowable VOC content (g/L) for solvents used in each cleaning equipment category under Rule 222; non-compliance with VOC limits invalidates the registration pathway."
key_code_sections: "Rule 222 §(d)(1)–(d)(3); Table 1 VOC Limits by Category; Rule 102 (VOC definition); Rule 101 (Definitions)"
---

> REFERENCE CONTENT. The thresholds in this file are pre-distilled orientation — verify all numbers against the fetched primary PDF before citing as evidence.

## Primary Source

https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-222.pdf

## VOC Definition (Rule 102)

Under SCAQMD rules, VOC (Volatile Organic Compound) is any compound of carbon that participates in atmospheric photochemical reactions. Key excluded compounds (not counted as VOC):

- Carbon monoxide, carbon dioxide, carbonic acid, metallic carbides/carbonates, ammonium carbonate
- Methane, ethane, methylene chloride (DCM), 1,1,1-trichloroethane (TCA — but note phase-out under EPA)
- Parachlorobenzotrifluoride (PCBTF), cyclic, branched, or linear volatile methylsiloxanes (VMS) meeting CARB criteria
- Acetone [VERIFY — acetone exempt-from-VOC status has fluctuated; confirm current SCAQMD position]
- HFCs and HCFCs as specified

VOC content is expressed in **grams of VOC per liter of material (g/L), excluding water and exempt compounds** unless otherwise stated.

## VOC Limit Table by Equipment Category

The following limits are standard SCAQMD / CARB benchmarks for non-automotive solvent cleaning. **Fetch the Rule 222 PDF to confirm exact current limits — these are training-knowledge approximations subject to amendment.**

| Equipment / Operation Type | VOC Limit (g/L) | Notes |
|---|---|---|
| Cold cleaning — manually operated | ≤ 50 g/L | Dip tanks, spray bottles, hand wipe with open containers |
| Cold cleaning — enclosed (with covers) | ≤ 50 g/L | Must be maintained closed when not in use |
| Open-top vapor degreaser | ≤ 25 g/L OR halogenated solvent with controls | Freeboard ratio ≥ 0.75 required |
| Conveyorized cold cleaner | ≤ 50 g/L | Must have exhaust controls or covers |
| Conveyorized vapor degreaser | ≤ 25 g/L | Full enclosure + carbon adsorption or equivalent |
| Aerosol solvent cleaner | ≤ 10% VOC by weight OR carbon content rule | [VERIFY — aerosol limits vary by CARB/SCAQMD rule version] |
| Wipe cleaning (industrial) | ≤ 25 g/L | Wipes must be stored in closed containers |
| Ultrasonic cleaning | [VERIFY IN PRIMARY SOURCE] | May be lower; water-based preferred path |

> All limits are as-applied (VOC content of the solvent mixture as used, not neat concentrate). Diluted aqueous solutions are measured on the working bath, not the concentrate.

## CARB Consumer Products and Aerosol Interaction

Rule 222 may incorporate by reference CARB's Consumer Products regulation limits for aerosol solvents. When aerosol products are used as cleaning agents, the applicable VOC limit may come from CARB's Aerosol Coating Products or General Consumer Products regulation rather than Rule 222 directly. [VERIFY interaction in fetched PDF]

## Halogenated Solvent Considerations

Common halogenated solvents historically used in vapor degreasers:

| Solvent | CAS | Status |
|---|---|---|
| Perchloroethylene (PCE) | 127-18-4 | Regulated; CARB phase-out for certain dry-cleaning uses; still used industrially with controls |
| Trichloroethylene (TCE) | 79-01-6 | Severe restrictions; EPA TSCA risk evaluation finalized; check current prohibitions |
| n-Propyl Bromide (nPB) | 106-94-5 | Restricted; high GWP and toxicity concerns |
| HFCs / HFEs | Various | Lower ODP but GWP concerns; may still qualify if VOC-exempt |

Halogenated solvents used in vapor degreasers require additional controls regardless of VOC classification — freeboard ratios, refrigerated freeboard chillers, lip exhaust, carbon adsorption. These control requirements are separate from the VOC content limit.

## VOC Emission Calculation Method

```
Annual VOC Emissions (lbs/year) =
  Σ [gallons_of_solvent_used/year × solvent_density_lbs/gal × VOC_weight_fraction]

To convert to tons/year: divide by 2,000

VOC weight fraction = (VOC content in g/L) / (total density in g/L)
  where density of water-borne solvent ≈ 1,000 g/L
  and density of typical solvent ≈ 700–900 g/L
```

Example: A cold cleaner uses 200 gallons/year of a solvent with 45 g/L VOC, density 7.5 lbs/gal, 6% VOC by weight.
  Emissions = 200 × 7.5 × 0.06 = 90 lbs/year = 0.045 tons/year VOC → well within registration threshold.

## Rule 222 Operating Requirements Tied to VOC Limits

In addition to solvent VOC content limits, Rule 222 operating requirements that control emissions include:

- **Covers/lids**: Keep cleaning tanks covered when not actively loading/unloading parts.
- **Freeboard ratio**: Vapor degreasers must maintain freeboard ≥ 0.75 × tank width (larger tanks may require ≥ 1.0). [VERIFY ratio in primary source]
- **Refrigerated freeboard chiller**: Required for vapor degreasers above [VERIFY: size threshold, e.g., > 1 m² vapor contact area].
- **Superheated vapor control**: Parts must be drained in the vapor zone before removal.
- **Flushing prohibition**: No flushing of solvent to atmosphere during cleaning cycle.
- **Solvent agitation**: No spraying above the vapor zone.
- **Waste solvent handling**: Waste solvent must be stored in covered containers; recycling or proper disposal required.

## Compliance Determination Workflow

1. Obtain SDS for each solvent product in use.
2. Locate VOC content on SDS (Section 9 — Physical and Chemical Properties) in g/L or weight-percent.
3. Cross-reference against Rule 222 Table 1 limits for the equipment type.
4. If VOC content exceeds the limit → solvent must be substituted before registration is valid.
5. If VOC content is within limit → document solvent name, product #, g/L value, and SDS date in the compliance record.
6. Re-verify whenever solvent product is changed (product reformulations are common — schedule an annual SDS review).

## Lower-Emitting Alternatives That Simplify Compliance

- Aqueous/detergent-based cleaners (VOC typically < 5 g/L) — easiest path; no vapor degreaser controls needed.
- Semi-aqueous emulsion cleaners (VOC 5–50 g/L) — usually within cold cleaner limit.
- High-flashpoint hydrocarbon solvents (e.g., Isopar, mineral spirits > 200°F flash) — check if Rule 222 requires vapor control for high-boiling solvents.
