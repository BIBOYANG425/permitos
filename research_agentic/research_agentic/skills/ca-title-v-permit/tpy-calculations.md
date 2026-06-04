---
title: "Potential to Emit (PTE) Calculation Methodology"
category: tpy-calculations
relevance: "How to correctly calculate tons-per-year emissions to compare against major-source thresholds. Use alongside major-source-thresholds.md whenever a facility's status is not clear-cut."
key_code_sections: "40 CFR 70.2 (definition of PTE); 40 CFR Part 51 Appendix W (dispersion); EPA Air Emissions Factors (AP-42); HSC §42300"
---

> REFERENCE ONLY. Methodology and emission factors below orient the agent. They are NOT evidence. Fetch and quote the cited primary source (AP-42, district guidance, or 40 CFR 70.2) verbatim.

## Statutory Definition of Potential to Emit

**40 CFR 70.2:** "Potential to emit means the maximum capacity of a stationary source to emit a pollutant under its physical and operational design. Any physical or operational limitation on the capacity of the source to emit a pollutant, including air pollution control equipment and restrictions on hours of operation or on the type or amount of material combusted, stored, or processed, shall be treated as part of its design if the limitation or the effect it would have on emissions is federally enforceable."

Key implication: PTE is **not** actual emissions — it is the **worst-case** maximum assuming:
- Full-rated capacity of all equipment
- 8,760 hours of operation per year (continuous, 24/7/365)
- No credit for control equipment unless that equipment is permanently installed AND federally enforceable
- No credit for operational limits unless those limits are federally enforceable

---

## PTE Calculation Framework

### Step 1 — Identify All Emission Units

List every piece of equipment (stack, vent, fugitive, storage, loading/unloading) at the source. In California, "emission unit" is defined in the district Permit to Operate rules.

### Step 2 — Determine Uncontrolled Emission Rate

For each unit, calculate the maximum hourly emission rate (lb/hr) at rated capacity:

**General formula:**
```
Uncontrolled emissions (lb/hr) = Activity rate × Emission factor (lb/unit)
```

Common emission factor sources:
- **EPA AP-42**: Compilation of Air Pollutant Emission Factors (https://www.epa.gov/air-emissions-factors-and-quantification/ap-42-compilation-air-pollutant-emission-factors)
- **Manufacturer stack test data** (preferred over AP-42 when available)
- **CARB emission factor documents** (for California-specific sources)
- **District-approved calculation methodologies** (e.g., SCAQMD CEQA Air Quality Handbook)

### Step 3 — Apply Control Efficiency (Only If Federally Enforceable)

```
Controlled emissions (lb/hr) = Uncontrolled emissions × (1 − Control efficiency)
```

Control efficiency is only credited if:
1. Control device is permanently installed
2. Efficiency is specified in a federally enforceable permit condition
3. Monitoring requirements are in place to verify continuous operation

### Step 4 — Annualize

```
PTE (tpy) = Controlled emission rate (lb/hr) × 8,760 hr/yr ÷ 2,000 lb/ton
```

If operational limits are federally enforceable (e.g., maximum annual throughput cap):
```
PTE (tpy) = Controlled emission rate (lb/unit) × Annual throughput cap (units/yr) ÷ 2,000 lb/ton
```

### Step 5 — Aggregate All Units and Pollutants

Sum PTE across all emission units for each regulated pollutant. Compare each pollutant total against its applicable threshold (see major-source-thresholds.md).

---

## Common Pitfalls in PTE Calculations

| Pitfall | Correct Approach |
|---|---|
| Using actual historical emissions instead of max-rated capacity | Always use rated capacity unless an enforceable limit exists |
| Crediting emission control equipment without a permit condition | Equipment must be in a federally enforceable condition |
| Using AP-42 factors without checking revision date | AP-42 factors are periodically revised; confirm version used |
| Forgetting fugitive emissions (valves, flanges, pumps) | Fugitives must be counted for refinery, chemical, or VOC-heavy operations |
| Using a 365-day year without accounting for startup/shutdown | Still use 8,760 hr/yr for PTE unless enforceable limit constrains hours |
| Double-counting controls for HAP vs. criteria pollutant | Run separate PTE calculations for HAPs and criteria pollutants |

---

## Combustion Sources — Quick PTE Reference

For natural gas-fired combustion equipment (boilers, heaters, turbines):

| Pollutant | Typical Emission Factor (AP-42 Table 1.4) | Notes |
|---|---|---|
| NOx | 100 lb/MMscf (uncontrolled, large boiler) | Varies by burner type; use equipment-specific data when available |
| CO | 84 lb/MMscf | |
| SO₂ | ~0.6 lb/MMscf (pipeline natural gas) | Depends on sulfur content of fuel |
| PM₁₀ / PM₂.₅ | 7.6 lb/MMscf | |
| VOC | 5.5 lb/MMscf | |

[VERIFY IN PRIMARY SOURCE — AP-42 Chapter 1.4 for natural gas combustion; factors change with revisions]

**Example calculation — 10 MMBtu/hr boiler:**
- Fuel input: 10 MMBtu/hr ÷ 1,020 Btu/scf = ~9,804 scf/hr = 0.0098 MMscf/hr
- NOx PTE: 0.0098 MMscf/hr × 100 lb/MMscf × 8,760 hr/yr ÷ 2,000 = **4.3 tpy NOx**

A single 10 MMBtu/hr boiler is well below the 100 tpy threshold, but a facility with dozens of units (boilers, emergency generators, heaters) can aggregate quickly.

---

## Emergency Generators — PTE Credit for Limited Operation

EPA guidance (and most California district rules) allows emergency generators to claim a federally enforceable operational limit for PTE purposes only if:
1. An enforceable permit condition limits operation to ≤500 hours/year (or the specific limit)
2. Monitoring (hour meter) and recordkeeping demonstrate compliance

Without an enforceable limit, an emergency diesel generator is counted at 8,760 hr/yr, which can easily push a facility over thresholds.

**Emergency generator example (300 kW diesel):**
- NOx at full load: ~22 lb/hr (EPA Tier 2, 300 kW) [VERIFY IN PRIMARY SOURCE — EPA NONROAD model or AP-42 Ch. 3.3]
- PTE without limit: 22 lb/hr × 8,760 hr/yr ÷ 2,000 = **96.4 tpy NOx** (below 100 tpy attainment threshold, but close)
- PTE with 500-hr/yr enforceable limit: 22 × 500 ÷ 2,000 = **5.5 tpy NOx**

---

## HAP PTE — Speciation Required

For HAP calculations, total organic HAP emissions must be broken down by individual compound. Speciation methods:
1. **Solvent mass balance**: For coating/printing/cleaning operations, use solvent purchase records and safety data sheet (SDS) compositions.
2. **Stack test speciation**: CEM or periodic stack testing for HAP compounds.
3. **AP-42 speciation profiles**: Available for many source categories.

A facility with 9 tpy aggregate organic HAP (just below the 10 tpy single-HAP threshold) should still check whether the mixture contains any single HAP exceeding 10 tpy individually — the aggregate 25 tpy cap is a separate (additional) threshold.

---

## Primary Sources to Fetch and Quote

- 40 CFR §70.2 definition of "potential to emit"
- EPA AP-42: https://www.epa.gov/air-emissions-factors-and-quantification/ap-42-compilation-air-pollutant-emission-factors
- EPA "PTE Guidance for Stationary Sources" (1998, OAQPS)
- District-specific PTE calculation guidance (e.g., SCAQMD's "How to Calculate Your Potential to Emit")
- ARB emission factor documentation for California-specific sources
