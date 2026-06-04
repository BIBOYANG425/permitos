---
title: "IGP SIC Code Coverage — Which Facilities Must Enroll"
category: sic-code-coverage
relevance: "Determines whether a facility's industrial classification triggers IGP coverage obligation under 40 CFR 122.26(b)(14)"
key_code_sections: "40 CFR 122.26(b)(14)(i)–(xi); CA IGP Section I; CA Water Code 13260"
---

> PRE-DISTILLED REFERENCE. Use this to orient the analysis and know what to look for. The agent must still fetch the primary IGP document from the State Water Board (https://www.waterboards.ca.gov/water_issues/programs/stormwater/igp.html) and quote verbatim for any finding. This file provides known thresholds and decision logic; verify specific SIC codes against the current permit enrollment list.

## Regulatory Basis

The federal NPDES stormwater program at 40 CFR 122.26(b)(14) defines "storm water discharge associated with industrial activity" across eleven categories (i through xi). California's Industrial General Permit (IGP) — currently Order 2014-0057-DWQ, amended by Order 2018-0028-DWQ — incorporates these federal categories and adds state-specific requirements under CA Water Code § 13260.

## The Eleven Activity Categories (40 CFR 122.26(b)(14))

| Category | Description | Key SIC Range / Examples |
|----------|-------------|--------------------------|
| (i) | Manufacturing (primary metals, paper, chemicals, petroleum refining, hazardous waste treatment) | SIC 2000–3999 (most manufacturing) |
| (ii) | Mining and oil/gas extraction | SIC 1000–1499; SIC 1311, 1381, 1382, 1389 |
| (iii) | Hazardous waste treatment, storage, disposal facilities with RCRA permit | Any SIC — RCRA status governs |
| (iv) | Landfills, land application sites, open dumps that receive industrial waste | SIC 4953 |
| (v) | Recycling facilities (metals, paper, glass, etc.) | SIC 5093, 5094, 5111, 5112, related |
| (vi) | Steam electric power generating facilities, including coal pile runoff | SIC 4911, 4931, 4939, 4941 |
| (vii) | Transportation (rail, trucking, air, ship) — vehicle/equipment maintenance, fueling areas | SIC 4011, 4013, 4111–4173, 4210–4231, 4412–4581 |
| (viii) | Treatment works (POTWs) — only if design flow ≥ 1 mgd or serving major industrial users | SIC 4952 |
| (ix) | Construction — only 5+ acre disturbance (now covered by CGP; most construction excluded from IGP) | SIC 1521–1542 (when IGP-covered) |
| (x) | Light industry — only if materials/waste exposed to stormwater | SIC 4221–4225, 5015, 5093 (portion) |
| (xi) | Facilities with effluent limitation guidelines, NPDES permits for industrial discharge, or significant amounts of industrial activity on industrial areas | Facility-specific; catch-all |

## Key Determination Logic

```
Step 1 — Find the facility's primary SIC code (look at NAICS crosswalk too).
Step 2 — Check if SIC falls within categories (i)–(xi) above.
Step 3 — If categories (i)–(viii) or (xi): IGP generally required unless NEC applies.
Step 4 — If category (x): IGP required ONLY IF industrial materials or activities are exposed to stormwater.
Step 5 — If construction (ix): now covered by CGP for 1+ acre; IGP covers 5+ acre legacy sites.
Step 6 — Check No Exposure Certification (NEC) eligibility (see nec-eligibility.md).
```

## Commonly Regulated Facilities by SIC

**Always regulated (categories i, ii, iii):**
- SIC 2600–2699: Paper & allied products
- SIC 2800–2899: Chemicals & allied products
- SIC 2900–2999: Petroleum refining
- SIC 3300–3399: Primary metal industries (foundries, smelters)
- SIC 3559, 3560–3599: Industrial & commercial machinery
- SIC 3670–3679: Electronic components manufacturing
- SIC 3710–3716: Motor vehicle manufacturing & assembly

**Transportation / vehicle maintenance (category vii) — common IGP triggers:**
- SIC 4210–4213: Trucking companies (if vehicle maintenance yard)
- SIC 4011: Railroads (rail yards with exposed areas)
- SIC 4412–4424: Water transportation (ship repair, terminals)

**Light industry / conditional (category x):**
- SIC 4221–4226: Public warehousing — only if materials stored outside or runoff from loading docks contacts industrial area
- SIC 5015: Used auto parts dealers (outdoor parts storage = exposure)
- SIC 5093: Scrap and waste materials dealers

## Retail / Office Exclusions

The following are NOT industrial activity under 40 CFR 122.26(b)(14):
- Retail establishments (SIC 5200–5999) — unless they have a manufacturing/processing co-located activity
- Office buildings (SIC 6000–8999) with no industrial activity
- Agricultural operations (SIC 0100–0999) — covered by separate SWRCB agricultural general permit

## NAICS Crosswalk Note

The permit uses SIC codes but many facilities have NAICS codes. The SWRCB uses the EPA SIC/NAICS crosswalk. When NAICS is provided, map to SIC before determining coverage. Example: NAICS 336111 (automobile manufacturing) → SIC 3711.

## Practical Traps

1. **Dual-use facilities**: A distribution warehouse (SIC 5140) that also repairs vehicles on-site may trigger category (vii) for the repair area even if the warehousing alone would be category (x) / conditional.
2. **Material handling area**: Even if the building is exempt, outdoor storage of raw materials, products, or waste subject to contact with stormwater can trigger IGP regardless of SIC.
3. **Tenant vs. owner**: The permittee is the facility operator with industrial activity, not necessarily the property owner. Multi-tenant industrial parks may need multiple NOIs.

## Primary Source to Fetch and Quote

- IGP Order 2014-0057-DWQ (with 2018 amendment): https://www.waterboards.ca.gov/water_issues/programs/stormwater/igp.html
- 40 CFR § 122.26(b)(14): https://www.ecfr.gov/current/title-40/chapter-I/subchapter-D/part-122/section-122.26
- EPA SIC/NAICS crosswalk: https://www.epa.gov/sites/default/files/2013-08/documents/sic_crosswalk08_04.pdf
