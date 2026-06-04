---
title: "VCAPCD Rule 23 — ROC Calculation Method for Exemption Thresholds"
category: "calculation-methodology"
relevance: "Read when computing whether a graphic arts, coating, adhesive, or solvent operation in Ventura County falls below the Rule 23 Section F threshold of < 200 lbs/yr ROC. Covers what materials count, how to aggregate, and which compounds are ROC vs. non-ROC (exempt)."
key_code_sections: "VCAPCD Rule 23, Sections F.10–F.15; VCAPCD Rule 2 (definitions); VCAPCD Rule 74.19"
source_url: "https://www.vcapcd.org/wp-content/uploads/Rulebook/Reg2/RULE%2023.pdf"
fetched: "2026-06-03"
---

# ROC Calculation Method — VCAPCD Rule 23 Section F Exemptions

## What "ROC" Means

Rule 23 and Rule 74.19 use the term **Reactive Organic Compound (ROC)**. In VCAPCD rules, ROC is equivalent to what EPA and many other districts call VOC (Volatile Organic Compound) — it is any organic compound that participates in atmospheric photochemical reactions. Compounds designated as exempt organic compounds by ARB and EPA are **not ROC**.

**ROC = all volatile organic compounds MINUS exempt organic compounds.**

---

## Which Organic Compounds Are NOT ROC (Exempt Compounds)

The following compounds are excluded from ROC calculations under VCAPCD Rule 2 definitions (consistent with ARB and EPA):

| Compound | ROC Status | Notes |
|---|---|---|
| Acetone | **NOT ROC (exempt)** | ARB-designated exempt compound — do not count in ROC total |
| Water | Not a VOC | Always excluded |
| Parachlorobenzotrifluoride (PCBTF) | **NOT ROC (exempt)** | Exempt compound |
| Methyl acetate | **NOT ROC (exempt)** | Exempt compound |
| Dimethyl carbonate | **NOT ROC (exempt)** | Exempt compound |
| t-Butyl acetate | **NOT ROC (exempt)** | Exempt compound |
| Propylene carbonate | **NOT ROC (exempt)** | Exempt compound |
| Dimethyl sulfoxide (DMSO) | **NOT ROC (exempt)** | Exempt compound |
| Isopropyl alcohol (IPA / isopropanol) | **IS ROC** | Counted in ROC total — common ink cleaning solvent |
| Ethanol | **IS ROC** | Counted — common fountain solution component |
| Ethylene glycol | **IS ROC** | Counted |
| Propylene glycol | **IS ROC** | Counted |
| n-Propanol | **IS ROC** | Counted |
| Toluene | **IS ROC** | Counted |
| Xylene | **IS ROC** | Counted |
| Methylene chloride (dichloromethane) | Counted separately | Has its own independent 200-lb/yr threshold under F(13) |
| 1,1,1-Trichloroethane | Counted separately | Has its own independent 200-lb/yr threshold under F(13) |
| Perchloroethylene (PCE) | Counted separately | Has its own independent 200-lb/yr threshold under F(13) |

**Key IPA vs. Acetone distinction:** Isopropyl alcohol (IPA) is a very common press cleaning solvent and IS ROC — it counts toward the 200-lb threshold. Acetone is also common and is NOT ROC — it does not count. If a facility switches from IPA-based cleaners to acetone-based cleaners, that reduces the ROC total.

Always verify current exempt compound status against the California ARB Regulation for Reducing Emissions from Consumer Products and the current VCAPCD Rule 2 definitions, as the exempt list is periodically updated.

---

## Rule 23 F(13) — What Goes Into the Graphic Arts ROC Total

Per the verbatim rule text, the graphic arts ROC calculation includes emissions from:

1. **Inks** — all process inks, pantone inks, spot color inks
2. **Ink additives** — varnishes, reducers, intensifiers, wetting agents added to inks
3. **Fountain solutions** — including alcohol substitutes and isopropyl alcohol added to fountain solutions
4. **Substrate surface preparation** — primers, corona treatment fluids, cleaning solvents applied before printing
5. **Application equipment cleaning** — press wash, blanket wash, roller wash, anilox cleaning solvents
6. **Coatings** — aqueous coatings, UV coatings, varnishes applied as part of the graphic arts operation
7. **Adhesives for binding or gluing printed substrates** — binding adhesives, laminating adhesives

**Excluded from the F(13) ROC total:**
- Cold cleaners (counted separately under F.10(d) if applicable)
- Vapor degreasers (counted separately under F.10(d) if applicable)

---

## Step-by-Step Calculation

### Step 1 — List all materials by category

Create a material inventory for the facility's graphic arts operation. For each product, record:
- Product name and supplier
- Average monthly volume used (gallons or liters)
- ROC content per SDS (percent by weight or g/L)
- Whether any methylene chloride, 1,1,1-trichloroethane, or perchloroethylene is present

### Step 2 — Convert ROC content to lbs/gal

From the SDS, ROC content is often given as:
- Weight percent (wt%) of all volatile organics — must subtract exempt compound wt% and water wt%
- Grams ROC per liter (g/L) — from Rule 74.19 formulation

**Convert from g/L to lbs/gal:**
```
lbs/gal = (g/L) × 0.00834
```

**Convert from wt% to lbs/gal** (when density is known):
```
ROC lbs/gal = wt% ROC (decimal) × density (lbs/gal)
```

Where density of the product (lbs/gal) = total weight of product per gallon, typically from SDS or ASTM D1475 test.

### Step 3 — Calculate monthly ROC pounds per material

```
Monthly ROC (lbs) = Volume used (gal/month) × ROC content (lbs/gal)
```

If using liters and g/L:
```
Monthly ROC (lbs) = Volume used (L/month) × ROC content (g/L) / 453.6
```

### Step 4 — Sum across all materials for the rolling 12-month window

At the end of each calendar month, sum the ROC emissions from all graphic arts materials over the trailing 12 consecutive calendar months:

```
Rolling 12-month ROC total (lbs) = Σ [monthly ROC] for months M through M-11
```

The facility is below the exemption threshold if this total is < 200 lbs ROC.

### Step 5 — Check the three chlorinated solvent totals independently

Also sum separately for each trailing 12-month window:
- Total methylene chloride emitted (lbs) — must be < 200 lbs
- Total 1,1,1-trichloroethane emitted (lbs) — must be < 200 lbs
- Total perchloroethylene emitted (lbs) — must be < 200 lbs

These are independent of each other and independent of the ROC total. Exceeding 200 lbs of any one of the four pollutants removes the exemption.

---

## Aggregation Rules — What Gets Combined

| Rule 23 Section | What Gets Aggregated Together |
|---|---|
| F(13) — Graphic arts | All inks + ink additives + fountain solutions + surface prep + cleaning + coatings + binding adhesives at the facility, associated with the graphic arts operation |
| F(11)(b) — Coating | All coating-related emissions (coatings, thinning, surface prep, cleaning) — but NOT emissions already counted under F(13) |
| F(12) — Adhesive/sealant | All adhesive/sealant-related emissions (adhesives, sealants, primers, thinning, surface prep, cleaning) — but NOT emissions already counted under F(13) |
| F(10)(d) — Solvent cleaning | All solvent cleaning emissions (cold cleaners, vapor degreasers, wipe/dip/flush cleaning) — but NOT emissions already counted under F(13), F(11), or F(12); and NOT emissions exempted under F(10)(a), (b), or (c) |

**A graphic arts facility with a Rule 23(F)(13) exemption** aggregates all of the above operation types — inks, cleaning, coatings, adhesives — together into a single graphic arts total. This is because the F(13) definition includes "coatings, and adhesives for binding or gluing printed substrates, associated with the graphic arts operation." The coating and adhesive operations are subsumed into the graphic arts calculation at such a facility.

---

## Common Ink ROC Content Ranges (Reference Values)

These are typical values for orientation — always use the actual SDS value for each product:

| Ink/Material Type | Typical ROC Content | Notes |
|---|---|---|
| Water-based flexographic ink | 3–15 g/L as applied | Low ROC — primarily water |
| UV-curable ink | 0 g/L (no volatile ROC during use) | ROC released only if excess monomer; use ASTM D5403 |
| Solvent-based gravure ink | 400–700 g/L | High ROC — primary compliance concern |
| Solvent-based flexographic ink | 200–600 g/L | |
| Lithographic fountain solution (IPA blend) | Variable — IPA fraction is ROC | Typically 8–15% IPA by volume |
| Press wash (petroleum naphtha) | 600–900 g/L | High ROC content — cleaning often dominates total |
| Press wash (IPA-based) | 780 g/L (pure IPA) | IPA is ROC |
| Press wash (acetone-based) | ~0 g/L ROC | Acetone is exempt |

---

## Conversion Reference

| From | To | Factor |
|---|---|---|
| g/L | lbs/gal | × 0.00834 |
| lbs/gal | g/L | × 119.8 |
| lbs | kg | × 0.454 |
| kg | lbs | × 2.205 |
| liters | gallons | × 0.2642 |
| gallons | liters | × 3.785 |
| g/L × L = g | lbs | ÷ 453.6 |

---

## When to Use Rule 74.19 Methods vs. SDS Data

- **SDS data** is used for exemption screening — it tells you whether the facility is likely below the threshold.
- **Rule 74.19 test methods** (e.g., EPA Method 24, SCAQMD Method 303-91 for exempt compounds) are used if VCAPCD requires measured verification or if the facility operates under a permit that references Rule 74.19 limits.

If VCAPCD disputes an SDS-based ROC claim, they may require testing using:
- **Most inks, coatings, solvents:** EPA Reference Method 24 + SCAQMD Method 303-91
- **Publication gravure inks:** EPA Reference Method 24A + SCAQMD Method 303-91
- **UV-cured inks:** ASTM Method D5403-93(2007)
- **Fountain solutions (alcohol content):** SCAQMD Test Method 313-91

---

## Edge Cases

**Mixed acetone/IPA press wash:** Only the IPA fraction is ROC. Calculate ROC as:
```
ROC lbs = volume used (gal) × [IPA wt fraction] × [density (lbs/gal)] × [IPA is 100% ROC]
```
The acetone fraction contributes 0 to the ROC total.

**Water-based inks:** The water fraction is excluded. ROC comes from co-solvents (glycols, alcohols) in the ink. Verify each co-solvent's status — propylene glycol is ROC; some glycol ethers may or may not be exempt depending on which one.

**UV-curable inks:** These do not evaporate in use (they cure by polymerization). VCAPCD may treat them as contributing negligible ROC. Use ASTM D5403 if a measured value is needed.

**Cleaning frequency matters:** Equipment cleaning typically accounts for a large share of the ROC total at small printing operations. Reducing cleaning solvent use or switching to acetone-based press wash can substantially reduce ROC emissions toward the 200-lb threshold.
