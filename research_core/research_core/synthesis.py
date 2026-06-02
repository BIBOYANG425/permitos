"""Faithful Python port of src/lib/research/synthesis.ts.

synthesize(scope, research_graph, regulatory_angles, evidence, verdicts, sds_reviews=())
  → {"determinations": [...], "memory_updates": [...], "report_markdown": "..."}

All data is plain dicts (NOT dataclasses).
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Public entry-point
# ---------------------------------------------------------------------------


def synthesize(
    scope: dict,
    research_graph: list[dict],
    regulatory_angles: list[dict],
    evidence: list[dict],
    verdicts: list[dict],
    sds_reviews: list[dict] = (),
) -> dict:
    """Mirror synthesize() from synthesis.ts.

    Args:
        scope:             ScopePack dict
        research_graph:    list of ResearchHypothesis dicts
        regulatory_angles: list of RegulatoryAngle dicts
        evidence:          list of EvidenceBundle dicts (latest per hypothesis)
        verdicts:          list of VerificationVerdict dicts (latest per hypothesis)
        sds_reviews:       list of SdsReview dicts (default empty)

    Returns:
        {"determinations": list, "memory_updates": list, "report_markdown": str}
    """
    evidence_by_hypothesis: dict[str, dict] = {b["hypothesis_id"]: b for b in evidence}
    verdict_by_hypothesis: dict[str, dict] = {v["hypothesis_id"]: v for v in verdicts}
    angle_by_id: dict[str, dict] = {a["id"]: a for a in regulatory_angles}

    # Flatten SDS handoff facts that are flagged and have value == True.
    sds_handoff_facts: list[dict] = []
    for review in sds_reviews:
        doc = review.get("document", {})
        for fact in review.get("permit_handoff_facts", []):
            if fact.get("review_flag") and fact.get("value") is True:
                sds_handoff_facts.append(
                    {
                        **fact,
                        "document_id": doc.get("id"),
                        "document_name": doc.get("name"),
                    }
                )

    determinations: list[dict] = []
    for hypothesis in research_graph:
        ev = evidence_by_hypothesis.get(hypothesis["id"])
        verdict = verdict_by_hypothesis.get(hypothesis["id"])
        angle = angle_by_id.get(hypothesis.get("angle_id", ""))
        angle_label = angle["label"] if angle else hypothesis.get("family", hypothesis["id"])
        determination = _determination_for(scope, hypothesis, angle_label, ev, verdict)
        sds_refs = _matching_sds_handoff_facts(hypothesis, sds_handoff_facts)
        if sds_refs:
            determination = {**determination, "sds_handoff_refs": sds_refs}
        determinations.append(determination)

    # memory_updates: only for verified determinations.
    memory_updates: list[dict] = []
    for det in determinations:
        if det.get("verified"):
            memory_updates.append(
                {
                    "memory_type": "verified_source_fact",
                    "fact": f"{det['requirement']}: {det['applies']}",
                    "source_url": det.get("source_url", ""),
                    "content_hash": _evidence_by_requirement(evidence, det["requirement"]),
                    "quote": det.get("quote"),
                    "verifier_verdict": "pass",
                    "as_of_date": "2026-05-30",
                    "expires_or_recheck_after": "2026-11-30",
                }
            )

    report_markdown = _render_report(scope, determinations)

    return {
        "determinations": determinations,
        "memory_updates": memory_updates,
        "report_markdown": report_markdown,
    }


# ---------------------------------------------------------------------------
# SDS handoff helpers
# ---------------------------------------------------------------------------


def _fields_for_hypothesis(hypothesis_id: str) -> set[str]:
    """Mirror fieldsForHypothesis from synthesis.ts."""
    mapping: dict[str, list[str]] = {
        "H-AIR-VOC": ["voc_air_emissions_review"],
        "H-HAZMAT-HMBP": ["hazardous_material_inventory_review", "flammable_liquid_storage_review"],
        "H-WASTE-GENERATOR": ["hazardous_waste_review"],
    }
    return set(mapping.get(hypothesis_id, []))


def _matching_sds_handoff_facts(hypothesis: dict, facts: list[dict]) -> list[dict]:
    """Mirror matchingSdsHandoffFacts from synthesis.ts."""
    if not facts:
        return []
    field_matches = _fields_for_hypothesis(hypothesis["id"])
    return [f for f in facts if f.get("field") in field_matches]


# ---------------------------------------------------------------------------
# Determination helpers
# ---------------------------------------------------------------------------


def _determination_for(
    scope: dict,
    hypothesis: dict,
    angle_label: str,
    evidence: dict | None,
    verdict: dict | None,
) -> dict:
    """Mirror determinationFor from synthesis.ts."""
    sources = evidence.get("sources", []) if evidence else []
    source = sources[0] if sources else None
    verified = verdict["verdict"] == "pass" if verdict else False
    applies = _applies_for(scope, hypothesis, evidence) if verified else "needs_review"

    # citation: "SourceName, fetched YYYY-MM-DD" or fallback
    if source:
        fetched_at = source.get("fetched_at", "")
        citation = f"{source.get('source_name', '')}, fetched {fetched_at[:10]}"
    else:
        citation = "No supporting source verified"

    # quote: source.quote ?? verdict.checks.predicate_math.reason ?? fallback
    quote: str
    if source and source.get("quote"):
        quote = source["quote"]
    elif verdict and verdict.get("checks", {}).get("predicate_math", {}).get("reason"):
        quote = verdict["checks"]["predicate_math"]["reason"]
    else:
        quote = "No quote available"

    source_url = source.get("url", "") if source else ""
    confidence = verdict.get("confidence", 0.2) if verdict else 0.2
    permit_filing = evidence.get("permit_filing") if (verified and evidence) else None

    det: dict = {
        "requirement": _requirement_for(hypothesis["id"]),
        "applies": applies,
        "trigger": hypothesis.get("question", ""),
        "project_fact": _project_fact_for(scope, hypothesis["id"], angle_label),
        "citation": citation,
        "quote": quote,
        "source_url": source_url,
        "confidence": confidence,
        "verified": verified,
        "review_flag": not verified,
    }
    if permit_filing is not None:
        det["permit_filing"] = permit_filing
    return det


def _applies_for(
    scope: dict,
    hypothesis: dict,
    evidence: dict | None,
) -> str:
    """Mirror appliesFor from synthesis.ts."""
    if hypothesis["id"] == "H-STORM-CGP":
        acres = scope.get("project_change", {}).get("disturbance_acres") or 0
        return "yes" if acres >= 1 else "no"
    conclusion = evidence.get("researcher_conclusion") if evidence else None
    if conclusion == "applies":
        return "yes"
    if conclusion == "does_not_apply":
        return "no"
    return "needs_review"


def _requirement_for(hypothesis_id: str) -> str:
    """Mirror requirementFor from synthesis.ts."""
    mapping: dict[str, str] = {
        "H-AIR-201": "SCAQMD Permit to Construct/Operate review",
        "H-AIR-VOC": "VOC emissions review",
        "H-AIR-219": "SCAQMD Rule 219 exemption check",
        "H-AIR-222": "SCAQMD Rule 222 registration check",
        "H-STORM-IGP": "California Industrial General Permit applicability",
        "H-STORM-CGP": "Construction stormwater permit coverage",
        "H-HAZMAT-HMBP": "HMBP/CERS hazardous material reporting",
        "H-WASTE-GENERATOR": "Hazardous waste generator status",
        "H-WASTEWATER-PRETREATMENT": "Industrial wastewater pretreatment review",
    }
    return mapping.get(hypothesis_id, hypothesis_id)


def _project_fact_for(scope: dict, hypothesis_id: str, angle_label: str) -> str:
    """Mirror projectFactFor from synthesis.ts."""
    if hypothesis_id == "H-HAZMAT-HMBP":
        chemicals = scope.get("project_change", {}).get("chemicals", [])
        chemical = chemicals[0] if chemicals else None
        raw_quantity = chemical.get("quantity") if chemical else None
        raw_unit = chemical.get("unit") if chemical else None
        raw_name = chemical.get("name") if chemical else None
        quantity = "missing" if raw_quantity is None else raw_quantity
        unit = "" if raw_unit is None else raw_unit
        name = "hazardous material" if raw_name is None else raw_name
        return f"{quantity} {unit} {name}".strip()
    if hypothesis_id == "H-STORM-CGP":
        acres = scope.get("project_change", {}).get("disturbance_acres", "missing")
        if acres is None:
            acres = "missing"
        return f"{acres} acres disturbed"
    if hypothesis_id == "H-STORM-IGP":
        facility = scope.get("facility", {})
        sic = facility.get("sic", "missing")
        naics = facility.get("naics", "missing")
        if sic is None:
            sic = "missing"
        if naics is None:
            naics = "missing"
        return f"SIC {sic} / NAICS {naics}"
    return angle_label


def _evidence_by_requirement(evidence_bundles: list[dict], requirement: str) -> str | None:
    """Mirror evidenceByRequirement from synthesis.ts."""
    for bundle in evidence_bundles:
        if _requirement_for(bundle["hypothesis_id"]) == requirement:
            sources = bundle.get("sources", [])
            if sources:
                return sources[0].get("content_hash")
    return None


# ---------------------------------------------------------------------------
# Report rendering
# ---------------------------------------------------------------------------


def _render_report(scope: dict, determinations: list[dict]) -> str:
    """Mirror renderReport from synthesis.ts."""
    facility = scope.get("facility", {})
    address = facility.get("address", "")
    jurisdiction_stack = facility.get("jurisdiction_stack", [])

    rows = "\n".join(
        f"| {row['requirement']} | {row['applies']} | {'verified' if row['verified'] else 'needs review'} | {round(row['confidence'] * 100)}% |"
        for row in determinations
    )

    return (
        f"# PermitPilot Applicability Matrix\n"
        f"\n"
        f"Facility: {address}\n"
        f"\n"
        f"Jurisdiction stack: {', '.join(jurisdiction_stack)}\n"
        f"\n"
        f"| Requirement | Applies | Status | Confidence |\n"
        f"|---|---:|---|---:|\n"
        f"{rows}\n"
        f"\n"
        f"Human review remains required for unverified, missing-fact, or novel determinations.\n"
    )
