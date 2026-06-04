---
title: "CGP Risk Level Determination"
category: risk-levels
relevance: "The Risk Level (1, 2, or 3) determines the intensity of stormwater controls, monitoring, and reporting required under the CGP. It is calculated before NOI submission and governs the entire compliance regime."
key_code_sections: "CGP Order 2022-0057-DWQ Section VII; Attachment C (Risk Level Determination)"
---

> PRE-DISTILLED REFERENCE — read this first, then fetch the primary source and quote verbatim for the verifier. Do NOT cite this file as evidence.

## Risk Level Framework Overview

The CGP uses a **two-factor risk matrix** to assign Risk Level 1, 2, or 3:
- **Factor 1: Receiving Water Risk** — based on proximity and sensitivity of downstream receiving waters
- **Factor 2: Sediment Risk** — based on site erodibility (rainfall erosivity R-factor × soil erodibility K-factor) and slope

The combination of the two factors produces the final Risk Level.

## Factor 1: Receiving Water Risk

| Receiving Water Risk | Conditions |
|---------------------|-----------|
| **Low** | Discharge does not reach a 303(d)-listed impaired water body for sediment/turbidity AND does not discharge to a receiving water with a sediment TMDL AND no discharge to an Environmentally Sensitive Area (ESA) |
| **High** | Discharge reaches a 303(d)-listed water for sediment/turbidity OR has a sediment/siltation TMDL OR drains to an ESA (including wetlands, vernal pools, ESHA, streams with designated beneficial uses) |

**Environmentally Sensitive Areas include** (non-exhaustive):
- Wetlands (Section 404 jurisdiction)
- Vernal pools
- Waters listed as impaired under CWA Section 303(d)
- Waters subject to a TMDL for sediment or turbidity
- Streams with cold-water habitat (COLD), spawning habitat (SPAWN), or migratory habitat (MIGR) beneficial use designations
- Areas within 100 feet of a perennial stream [VERIFY IN PRIMARY SOURCE]

**Practical step**: Query the State Water Board's 303(d) list and the applicable Basin Plan for beneficial use designations of the receiving water.

## Factor 2: Sediment (Site) Risk

Sediment risk is calculated using the Revised Universal Soil Loss Equation (RUSLE) R × K product:

| Sediment Risk | Criteria |
|--------------|---------|
| **Low** | R × K × LS product (erosion index) is in the low range — typically relatively flat site with low-erodibility soils [VERIFY EXACT CUTOFF IN PRIMARY SOURCE] |
| **High** | R × K × LS product is in the high range — steep slopes, highly erodible soils (high K factor), or high rainfall erosivity region |

**R factor** = rainfall erosivity for the project location (obtain from RUSLE2 database or isoerodent map; California coastal ranges and Sierra Nevada have high R values)
**K factor** = soil erodibility (from NRCS SSURGO soil survey; fine sandy loams and silt loams have high K)
**LS factor** = slope length and steepness factor (increases sharply for slopes > 10%)

The CGP Attachment C provides a worksheet; the SMARTS system has a built-in Risk Level calculator.

## Risk Level Matrix

| | Receiving Water Risk: LOW | Receiving Water Risk: HIGH |
|---|---|---|
| **Sediment Risk: LOW** | **Risk Level 1** | **Risk Level 2** |
| **Sediment Risk: HIGH** | **Risk Level 2** | **Risk Level 3** |

## What Each Risk Level Requires

### Risk Level 1
- SWPPP required
- Implemented BMPs (erosion and sediment controls)
- Annual report via SMARTS
- No numeric effluent limitations (NELs) for turbidity
- No required rain event action plan (REAP)
- Qualified SWPPP Developer (QSD) prepares SWPPP; Qualified SWPPP Practitioner (QSP) oversees implementation

### Risk Level 2
- All RL1 requirements PLUS:
- Rain Event Action Plans (REAPs) required before qualifying rain events (see rain-event-action-plan.md)
- Numerical Effluent Limitations apply for pH (6.0–9.0 su) and turbidity [VERIFY CURRENT NEL VALUES IN PRIMARY SOURCE]
- Pre-rain and post-storm inspections with discharge sampling if runoff occurs
- QSD + QSP required

### Risk Level 3
- All RL2 requirements PLUS:
- Active Treatment System (ATS) may be required to meet turbidity NELs (see active-treatment-system.md)
- Most stringent effluent limitations: turbidity NEL of 10 NTU [VERIFY IN PRIMARY SOURCE]
- Continuous pH monitoring required during storm events
- ATS operator certification requirements
- Immediate notification to Regional Water Board of any exceedance

## Key Thresholds at a Glance

| Parameter | RL1 NEL | RL2 NEL | RL3 NEL |
|-----------|---------|---------|---------|
| pH | None | 6.0–9.0 su | 6.0–9.0 su |
| Turbidity | None | [VERIFY] NTU | 10 NTU [VERIFY] |
| Visual | Required | Required | Required |

## Re-Assessment of Risk Level

Risk level must be re-evaluated if:
- Project scope changes and new area is disturbed
- New receiving water information becomes available
- Site conditions change materially (e.g., project extended into high-rainfall season)

## Primary Source to Fetch and Quote

URL: https://www.waterboards.ca.gov/water_issues/programs/stormwater/construction.html
Specific document: CGP Order 2022-0057-DWQ, Section VII and Attachment C
Quote the Risk Level matrix and the NEL values verbatim from the permit order.
Also fetch: SMARTS Risk Level Determination tool at https://smarts.waterboards.ca.gov/
