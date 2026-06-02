"""
Faithful Python port of src/lib/research/programRegistry.ts.

Single source of truth for permit programs.  The verifier owns this list;
completeness.py re-derives the expected set from it.  Family skills are
projections of it (see test_registry_skills_parity.py).
"""

from __future__ import annotations

from typing import Optional, TypedDict
from urllib.parse import urlparse

from research_core.types import CoverageFamily, ScopePack


# ---------------------------------------------------------------------------
# TypedDicts (faithful field names)
# ---------------------------------------------------------------------------


class ExtractionHint(TypedDict):
    field: str
    ask: str


class SourcePointer(TypedDict):
    url: str
    source_name: str
    authority_rank: int


class ProgramRegistryEntry(TypedDict):
    id: str
    family: CoverageFamily
    name: str
    what_it_does: str
    jurisdiction: str
    authority_source_url: str
    authority_rank: int
    hypothesis_ids: list[str]
    research_skill_id: str
    extraction_hint: ExtractionHint
    # triggeredBy is a callable; not stored directly in the TypedDict but
    # entries in the runtime list carry a "triggered_by" key with the predicate.


# ---------------------------------------------------------------------------
# Scope predicate helpers — mirrors the TS module-level arrow functions verbatim.
# ---------------------------------------------------------------------------


def _has_equipment(s: ScopePack) -> bool:
    return len(s["project_change"]["equipment"]) > 0


def _has_chemicals(s: ScopePack) -> bool:
    return len(s["project_change"]["chemicals"]) > 0


def _has_waste(s: ScopePack) -> bool:
    return len(s["project_change"]["waste_streams"]) > 0


def _has_code_or_acres(s: ScopePack) -> bool:
    return (
        bool(s["facility"].get("sic"))
        or bool(s["facility"].get("naics"))
        or s["project_change"]["disturbance_acres"] is not None
    )


def _discharge_possible(s: ScopePack) -> bool:
    return s["project_change"]["process_discharge"] is not False


# ---------------------------------------------------------------------------
# PROGRAM_REGISTRY — verbatim translation of every entry.
# Each dict carries the TypedDict fields plus "triggered_by" for the callable.
# ---------------------------------------------------------------------------

PROGRAM_REGISTRY: list[dict] = [
    {
        "id": "scaqmd-permit-to-construct",
        "family": "air",
        "name": "SCAQMD Permit to Construct (Rule 201)",
        "what_it_does": "Authorizes installing/modifying equipment that may emit air contaminants.",
        "jurisdiction": "SCAQMD",
        "authority_source_url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf",
        "authority_rank": 1,
        "hypothesis_ids": ["H-AIR-201", "H-AIR-VOC"],
        "research_skill_id": "scaqmd-air",
        "extraction_hint": {
            "field": "permit_trigger",
            "ask": "what equipment or activity requires written authorization or a permit to construct",
        },
        "triggered_by": _has_equipment,
    },
    {
        "id": "scaqmd-rule-219-exemption",
        "family": "air",
        "name": "SCAQMD Rule 219 exemption",
        "what_it_does": "Exempts listed equipment from written permit requirements if conditions are met.",
        "jurisdiction": "SCAQMD",
        "authority_source_url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-219.pdf",
        "authority_rank": 1,
        "hypothesis_ids": ["H-AIR-219"],
        "research_skill_id": "scaqmd-air",
        "extraction_hint": {
            "field": "exemption_check_required",
            "ask": "which equipment is exempt from written permit requirements and under what conditions",
        },
        "triggered_by": _has_equipment,
    },
    {
        "id": "scaqmd-rule-222-registration",
        "family": "air",
        "name": "SCAQMD Rule 222 registration",
        "what_it_does": "Registration path for specified equipment categories instead of a full permit.",
        "jurisdiction": "SCAQMD",
        "authority_source_url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-222.pdf",
        "authority_rank": 1,
        "hypothesis_ids": ["H-AIR-222"],
        "research_skill_id": "scaqmd-air",
        "extraction_hint": {
            "field": "registration_possible",
            "ask": "which equipment may use registration instead of a full permit",
        },
        "triggered_by": _has_equipment,
    },
    {
        "id": "ca-industrial-general-permit",
        "family": "stormwater",
        "name": "California Industrial General Permit (IGP)",
        "what_it_does": "Stormwater coverage triggered by industrial activity SIC/NAICS codes.",
        "jurisdiction": "California Water Boards",
        "authority_source_url": "https://www.waterboards.ca.gov/water_issues/programs/stormwater/industrial.html",
        "authority_rank": 1,
        "hypothesis_ids": ["H-STORM-IGP"],
        "research_skill_id": "ca-stormwater",
        "extraction_hint": {
            "field": "regulated_sic",
            "ask": "which industrial activities or SIC categories must obtain Industrial General Permit coverage",
        },
        "triggered_by": _has_code_or_acres,
    },
    {
        "id": "ca-construction-general-permit",
        "family": "stormwater",
        "name": "California Construction General Permit (CGP)",
        "what_it_does": "Stormwater coverage for construction disturbing one or more acres.",
        "jurisdiction": "California Water Boards",
        "authority_source_url": "https://www.waterboards.ca.gov/water_issues/programs/stormwater/construction.html",
        "authority_rank": 1,
        "hypothesis_ids": ["H-STORM-CGP"],
        "research_skill_id": "ca-stormwater",
        "extraction_hint": {
            "field": "acreage_threshold",
            "ask": "the number of acres of soil disturbance that triggers Construction General Permit coverage",
        },
        "triggered_by": _has_code_or_acres,
    },
    {
        "id": "ca-hmbp",
        "family": "hazmat",
        "name": "California Hazardous Materials Business Plan (HMBP)",
        "what_it_does": "Reporting plan triggered by hazardous material quantities at or above thresholds.",
        "jurisdiction": "CalEPA / local CUPA",
        "authority_source_url": "https://calepa.ca.gov/cupa/hazardous-materials-business-plan/",
        "authority_rank": 1,
        "hypothesis_ids": ["H-HAZMAT-HMBP"],
        "research_skill_id": "ca-hmbp",
        "extraction_hint": {
            "field": "liquid_gallons_threshold",
            "ask": "the numeric gallon threshold at or above which a Hazardous Materials Business Plan (HMBP) is required for a hazardous liquid",
        },
        "triggered_by": _has_chemicals,
    },
    {
        "id": "epa-hazwaste-generator",
        "family": "waste",
        "name": "EPA Hazardous Waste Generator Category",
        "what_it_does": "Generator status (VSQG/SQG/LQG) based on monthly hazardous waste quantity.",
        "jurisdiction": "US EPA / CA DTSC",
        "authority_source_url": "https://www.epa.gov/hwgenerators/categories-hazardous-waste-generators",
        "authority_rank": 1,
        "hypothesis_ids": ["H-WASTE-GENERATOR"],
        "research_skill_id": "hazwaste-generator",
        "extraction_hint": {
            "field": "generator_quantity_required",
            "ask": "what monthly hazardous waste quantity determines the generator category",
        },
        "triggered_by": _has_waste,
    },
    {
        "id": "epa-pretreatment",
        "family": "wastewater",
        "name": "EPA National Pretreatment Program",
        "what_it_does": "Pretreatment requirements for industrial process wastewater discharges.",
        "jurisdiction": "US EPA",
        "authority_source_url": "https://www.epa.gov/npdes/national-pretreatment-program",
        "authority_rank": 1,
        "hypothesis_ids": ["H-WASTEWATER-PRETREATMENT"],
        "research_skill_id": "industrial-pretreatment",
        "extraction_hint": {
            "field": "process_discharge_required",
            "ask": "when industrial process wastewater discharge triggers pretreatment requirements",
        },
        "triggered_by": _discharge_possible,
    },
    {
        "id": "caa-title-v",
        "family": "air",
        "name": "Clean Air Act Title V Operating Permit",
        "what_it_does": "Federal operating permit required once a facility's potential-to-emit reaches major-source levels.",
        "jurisdiction": "US EPA / SCAQMD",
        "authority_source_url": "https://www.epa.gov/title-v-operating-permits",
        "authority_rank": 1,
        "hypothesis_ids": ["H-AIR-TITLEV"],
        "research_skill_id": "caa-title-v",
        "extraction_hint": {
            "field": "major_source_threshold",
            "ask": "the potential-to-emit thresholds (tons per year) that make a facility a major source requiring a Title V operating permit",
        },
        "triggered_by": _has_equipment,
    },
    {
        "id": "epcra-tier-ii",
        "family": "hazmat",
        "name": "EPCRA Tier II / §311-312 Reporting",
        "what_it_does": "Federal community right-to-know inventory reporting for hazardous chemicals stored above reporting thresholds.",
        "jurisdiction": "US EPA",
        "authority_source_url": "https://www.epa.gov/epcra",
        "authority_rank": 1,
        "hypothesis_ids": ["H-HAZMAT-EPCRA"],
        "research_skill_id": "epcra-community-right-to-know",
        "extraction_hint": {
            "field": "epcra_reporting_threshold",
            "ask": "the chemical quantity thresholds (e.g. 10,000 lb, or the lower TPQ for extremely hazardous substances) that trigger EPCRA Tier II reporting",
        },
        "triggered_by": _has_chemicals,
    },
    {
        "id": "osha-psm",
        "family": "osha",
        "name": "OSHA Process Safety Management (29 CFR 1910.119)",
        "what_it_does": "Worker-safety standard for processes that involve a threshold quantity of a listed highly hazardous chemical.",
        "jurisdiction": "US OSHA / Cal/OSHA",
        "authority_source_url": "https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.119",
        "authority_rank": 1,
        "hypothesis_ids": ["H-OSHA-PSM"],
        "research_skill_id": "osha-psm",
        "extraction_hint": {
            "field": "psm_threshold_quantity",
            "ask": "the threshold quantity of a listed highly hazardous chemical at or above which the OSHA PSM standard applies",
        },
        "triggered_by": _has_chemicals,
    },
]


# ---------------------------------------------------------------------------
# Resolver functions (snake_case, same logic as the TS exports)
# ---------------------------------------------------------------------------


def all_programs() -> list[dict]:
    """Return the full registry."""
    return PROGRAM_REGISTRY


def programs_for_family(family: CoverageFamily) -> list[dict]:
    """Filter registry entries by coverage family."""
    return [p for p in PROGRAM_REGISTRY if p["family"] == family]


def program_for_hypothesis(hypothesis_id: str) -> Optional[dict]:
    """Return the registry entry whose hypothesis_ids contains hypothesis_id, or None."""
    for p in PROGRAM_REGISTRY:
        if hypothesis_id in p["hypothesis_ids"]:
            return p
    return None


def source_pointer_for_hypothesis(hypothesis_id: str) -> Optional[dict]:
    """Return a SourcePointer dict for the program covering hypothesis_id, or None."""
    program = program_for_hypothesis(hypothesis_id)
    if not program:
        return None
    return {
        "url": program["authority_source_url"],
        "source_name": program["name"],
        "authority_rank": program["authority_rank"],
    }


def extraction_hint_for_hypothesis(hypothesis_id: str) -> Optional[dict]:
    """Return the extraction_hint for hypothesis_id's program, or None."""
    program = program_for_hypothesis(hypothesis_id)
    if not program:
        return None
    return program["extraction_hint"]


def skill_id_for_hypothesis(hypothesis_id: str) -> Optional[str]:
    """Return the research_skill_id for hypothesis_id's program, or None."""
    program = program_for_hypothesis(hypothesis_id)
    if not program:
        return None
    return program["research_skill_id"]


def registry_hosts() -> set[str]:
    """Return the union of authoritative source hostnames across the registry.

    Mirrors registryHosts() in TS: malformed URLs are silently skipped.
    """
    hosts: set[str] = set()
    for program in PROGRAM_REGISTRY:
        try:
            hosts.add(urlparse(program["authority_source_url"]).hostname)
        except Exception:
            pass
    return hosts
