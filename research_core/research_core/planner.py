"""
Faithful Python port of src/lib/research/planner.ts.

planResearch → plan_research
Returns a plain dict with keys:
  coverage_family_statuses, regulatory_angles, research_graph, research_tasks
"""

from __future__ import annotations

from research_core._format import js_str
from research_core.tool_catalog import blocked_tool_ids_for_role, research_worker_tool_ids

COVERAGE_FAMILIES = ["air", "stormwater", "hazmat", "waste", "wastewater", "osha"]


def plan_research(scope: dict, sds_active_families=()) -> dict:
    """
    Port of planResearch(scope, sdsActiveFamilies).

    sds_active_families may be any iterable (list, tuple, set) supporting `in`.
    """
    coverage_family_statuses = [
        _coverage_status_for(family, scope, family in sds_active_families)
        for family in COVERAGE_FAMILIES
    ]
    regulatory_angles = [
        angle for status in coverage_family_statuses for angle in _angles_for(status, scope)
    ]
    research_graph = [hyp for angle in regulatory_angles for hyp in _hypotheses_for(angle, scope)]
    research_tasks = [_task_for_hypothesis(hyp) for hyp in research_graph]

    return {
        "coverage_family_statuses": coverage_family_statuses,
        "regulatory_angles": regulatory_angles,
        "research_graph": research_graph,
        "research_tasks": research_tasks,
    }


# ---------------------------------------------------------------------------
# coverageStatusFor
# ---------------------------------------------------------------------------


def _coverage_status_for(family: str, scope: dict, sds_flagged: bool) -> dict:
    equipment_kinds = [item["kind"] for item in scope["project_change"]["equipment"]]
    has_chemicals = len(scope["project_change"]["chemicals"]) > 0
    has_waste = len(scope["project_change"]["waste_streams"]) > 0
    disturbance = scope["project_change"]["disturbance_acres"]

    if family == "air":
        equipment_active = len(scope["project_change"]["equipment"]) > 0
        active = equipment_active or sds_flagged
        if equipment_active:
            reason = "Project adds equipment that may emit air contaminants."
        elif sds_flagged:
            reason = "SDS review flagged VOC or air-emissions relevance; air permit applicability requires review."
        else:
            reason = "No equipment added that could emit air contaminants."
        project_facts_considered = (
            [*equipment_kinds, "sds:voc_air_emissions_review"]
            if sds_flagged
            else list(equipment_kinds)
        )
        return {
            "id": "CF-AIR",
            "family": family,
            "status": "active" if active else "out_of_scope",
            "reason": reason,
            "project_facts_considered": project_facts_considered,
            "missing_facts": [],
        }

    if family == "stormwater":
        missing_code = (
            not scope["facility"]["sic"] and not scope["facility"]["naics"] and disturbance is None
        )
        return {
            "id": "CF-STORMWATER",
            "family": family,
            "status": "blocked_missing_fact" if missing_code else "active",
            "reason": (
                "SIC/NAICS and disturbance acreage are missing."
                if missing_code
                else "Industrial activity codes or construction acreage require stormwater review."
            ),
            "project_facts_considered": [
                f"sic={js_str(scope['facility']['sic'])}",
                f"naics={js_str(scope['facility']['naics'])}",
                f"acres={js_str(disturbance)}",
            ],
            "missing_facts": (
                ["facility.naics_or_sic", "project_change.disturbance_acres"]
                if missing_code
                else []
            ),
        }

    if family == "hazmat":
        missing_quantity = has_chemicals and any(
            c["quantity"] is None for c in scope["project_change"]["chemicals"]
        )
        if not has_chemicals:
            status = "active" if sds_flagged else "out_of_scope"
        elif missing_quantity:
            status = "blocked_missing_fact"
        else:
            status = "active"

        if has_chemicals:
            reason = "Project includes hazardous material storage."
        elif sds_flagged:
            reason = (
                "SDS review flagged hazardous material content; HMBP applicability requires review."
            )
        else:
            reason = "No hazardous materials indicated in intake."

        project_facts_considered = [
            f"{c['name']}:{c['quantity'] if c['quantity'] is not None else 'missing'} {c['unit'] or ''}"
            for c in scope["project_change"]["chemicals"]
        ]
        return {
            "id": "CF-HAZMAT",
            "family": family,
            "status": status,
            "reason": reason,
            "project_facts_considered": project_facts_considered,
            "missing_facts": (["chemicals.quantity", "chemicals.unit"] if missing_quantity else []),
        }

    if family == "waste":
        status = "active" if (has_waste or sds_flagged) else "out_of_scope"
        if has_waste:
            reason = "Project identifies waste streams that need generator-status review."
        elif sds_flagged:
            reason = (
                "SDS review flagged hazardous waste relevance; generator-status review required."
            )
        else:
            reason = "No waste stream indicated."
        project_facts_considered = [
            f"{s['description']}:{s['kg_per_month'] if s['kg_per_month'] is not None else 'missing'} kg/month"
            for s in scope["project_change"]["waste_streams"]
        ]
        missing_facts = (
            ["waste_streams.kg_per_month"]
            if any(s["kg_per_month"] is None for s in scope["project_change"]["waste_streams"])
            else []
        )
        return {
            "id": "CF-WASTE",
            "family": family,
            "status": status,
            "reason": reason,
            "project_facts_considered": project_facts_considered,
            "missing_facts": missing_facts,
        }

    if family == "osha":
        return {
            "id": "CF-OSHA",
            "family": family,
            "status": "active" if has_chemicals else "out_of_scope",
            "reason": (
                "Stored chemicals may include a highly hazardous chemical at or above an OSHA PSM threshold quantity."
                if has_chemicals
                else "No chemicals indicated; OSHA Process Safety Management is out of scope."
            ),
            "project_facts_considered": [
                f"{c['name']}:{c['quantity'] if c['quantity'] is not None else 'missing'} {c['unit'] or ''}"
                for c in scope["project_change"]["chemicals"]
            ],
            "missing_facts": [],
        }

    # wastewater (family == "wastewater")
    process_discharge = scope["project_change"]["process_discharge"]
    if process_discharge is None:
        wastewater_status = "active" if sds_flagged else "blocked_missing_fact"
    elif process_discharge:
        wastewater_status = "active"
    else:
        wastewater_status = "active" if sds_flagged else "out_of_scope"

    if process_discharge is None:
        if sds_flagged:
            reason = "SDS review flagged spill/stormwater containment relevance; pretreatment review required."
        else:
            reason = "Process discharge status is missing."
    elif process_discharge:
        reason = "Project may discharge process wastewater."
    else:
        reason = "No process wastewater discharge indicated."

    return {
        "id": "CF-WASTEWATER",
        "family": family,
        "status": wastewater_status,
        "reason": reason,
        "project_facts_considered": [f"process_discharge={js_str(process_discharge)}"],
        "missing_facts": (
            ["project_change.process_discharge"] if process_discharge is None else []
        ),
    }


# ---------------------------------------------------------------------------
# anglesFor
# ---------------------------------------------------------------------------


def _angles_for(status: dict, scope: dict) -> list[dict]:
    if status["status"] == "out_of_scope":
        return []

    family = status["family"]

    if family == "air":
        return [
            {
                "id": "A-AIR-EMITTING-EQUIPMENT",
                "family": "air",
                "label": "New or modified emitting equipment",
                "reason": "Coating or process equipment may require air district authorization.",
                "triggering_facts": list(status["project_facts_considered"]),
                "status": status["status"],
            },
            {
                "id": "A-AIR-EXEMPTION-OR-REGISTRATION",
                "family": "air",
                "label": "Air exemption or registration path",
                "reason": "SCAQMD rules may route some equipment to exemption or registration instead of a permit.",
                "triggering_facts": list(status["project_facts_considered"]),
                "status": status["status"],
            },
            {
                "id": "A-AIR-FEDERAL-OPERATING",
                "family": "air",
                "label": "Federal Clean Air Act operating permit",
                "reason": "A facility whose potential-to-emit reaches major-source levels may need a federal Title V operating permit on top of the district permit.",
                "triggering_facts": list(status["project_facts_considered"]),
                "status": status["status"],
            },
        ]

    if family == "stormwater":
        return [
            {
                "id": "A-STORMWATER-INDUSTRIAL",
                "family": "stormwater",
                "label": "Industrial stormwater coverage",
                "reason": "SIC/NAICS may trigger California Industrial General Permit coverage.",
                "triggering_facts": [
                    f"sic={js_str(scope['facility']['sic'])}",
                    f"naics={js_str(scope['facility']['naics'])}",
                ],
                "status": (
                    "active"
                    if scope["facility"]["sic"] or scope["facility"]["naics"]
                    else "blocked_missing_fact"
                ),
            },
            {
                "id": "A-STORMWATER-CONSTRUCTION",
                "family": "stormwater",
                "label": "Construction stormwater coverage",
                "reason": "Construction activity disturbing one or more acres may require permit coverage.",
                "triggering_facts": [
                    f"disturbance_acres={js_str(scope['project_change']['disturbance_acres'])}"
                ],
                "status": (
                    "blocked_missing_fact"
                    if scope["project_change"]["disturbance_acres"] is None
                    else "active"
                ),
            },
        ]

    if family == "hazmat":
        return [
            {
                "id": "A-HAZMAT-HMBP",
                "family": "hazmat",
                "label": "Hazardous material business plan threshold",
                "reason": "Hazardous material quantities must be compared to reporting thresholds.",
                "triggering_facts": list(status["project_facts_considered"]),
                "status": status["status"],
            },
            {
                "id": "A-HAZMAT-EPCRA",
                "family": "hazmat",
                "label": "EPCRA community right-to-know reporting",
                "reason": "Federal EPCRA Tier II / §311-312 reporting may apply when hazardous chemicals exceed reporting thresholds, independent of the state HMBP.",
                "triggering_facts": list(status["project_facts_considered"]),
                "status": status["status"],
            },
        ]

    if family == "osha":
        return [
            {
                "id": "A-OSHA-PSM",
                "family": "osha",
                "label": "OSHA Process Safety Management",
                "reason": "Storing a listed highly hazardous chemical at or above its threshold quantity triggers the OSHA PSM standard (29 CFR 1910.119).",
                "triggering_facts": list(status["project_facts_considered"]),
                "status": status["status"],
            }
        ]

    if family == "waste":
        return [
            {
                "id": "A-WASTE-GENERATOR-STATUS",
                "family": "waste",
                "label": "Hazardous waste generator status",
                "reason": "Spent solvent or process waste may affect generator category.",
                "triggering_facts": list(status["project_facts_considered"]),
                "status": "blocked_missing_fact" if status["missing_facts"] else "active",
            }
        ]

    # wastewater
    return [
        {
            "id": "A-WASTEWATER-PRETREATMENT",
            "family": "wastewater",
            "label": "Industrial wastewater pretreatment",
            "reason": "Industrial process wastewater discharges may trigger pretreatment review.",
            "triggering_facts": list(status["project_facts_considered"]),
            "status": status["status"],
        }
    ]


# ---------------------------------------------------------------------------
# hypothesesFor
# ---------------------------------------------------------------------------


def _hypotheses_for(angle: dict, scope: dict) -> list[dict]:
    angle_id = angle["id"]

    if angle_id == "A-AIR-EMITTING-EQUIPMENT":
        return [
            _hypothesis(
                "H-AIR-201",
                angle,
                "Does the new equipment require an SCAQMD Permit to Construct?",
                "SCAQMD Permit to Construct may apply before installing emitting equipment.",
            ),
            _hypothesis(
                "H-AIR-VOC",
                angle,
                "Do solvent VOC emissions require additional review?",
                "Solvent use may create VOC-related review needs.",
            ),
        ]

    if angle_id == "A-AIR-EXEMPTION-OR-REGISTRATION":
        return [
            _hypothesis(
                "H-AIR-219",
                angle,
                "Is Rule 219 exemption available?",
                "Rule 219 may exempt listed equipment if conditions are satisfied.",
            ),
            _hypothesis(
                "H-AIR-222",
                angle,
                "Does Rule 222 registration apply instead?",
                "Rule 222 registration may apply to specified equipment categories.",
            ),
        ]

    if angle_id == "A-AIR-FEDERAL-OPERATING":
        return [
            _hypothesis(
                "H-AIR-TITLEV",
                angle,
                "Does the facility's potential-to-emit require a federal Title V operating permit?",
                "Major-source potential-to-emit may require a Clean Air Act Title V operating permit.",
            ),
        ]

    if angle_id == "A-STORMWATER-INDUSTRIAL":
        return [
            _hypothesis(
                "H-STORM-IGP",
                angle,
                "Does SIC/NAICS trigger Industrial General Permit coverage?",
                "SIC/NAICS may trigger California Industrial General Permit coverage.",
            ),
        ]

    if angle_id == "A-STORMWATER-CONSTRUCTION":
        return [
            _hypothesis(
                "H-STORM-CGP",
                angle,
                "Does construction disturb one or more acres?",
                "Construction disturbance at or above one acre may require construction stormwater permit coverage.",
            ),
        ]

    if angle_id == "A-HAZMAT-HMBP":
        return [
            _hypothesis(
                "H-HAZMAT-HMBP",
                angle,
                "Does hazardous material quantity exceed HMBP thresholds?",
                "HMBP applies to all hazardous material storage.",
            ),
        ]

    if angle_id == "A-HAZMAT-EPCRA":
        return [
            _hypothesis(
                "H-HAZMAT-EPCRA",
                angle,
                "Do stored hazardous chemicals exceed EPCRA Tier II reporting thresholds?",
                "EPCRA §311-312 Tier II reporting may apply when a hazardous chemical exceeds its reporting threshold.",
            ),
        ]

    if angle_id == "A-OSHA-PSM":
        return [
            _hypothesis(
                "H-OSHA-PSM",
                angle,
                "Does a stored highly hazardous chemical meet the OSHA PSM threshold quantity?",
                "OSHA Process Safety Management applies when a listed highly hazardous chemical is at or above its threshold quantity.",
            ),
        ]

    if angle_id == "A-WASTE-GENERATOR-STATUS":
        return [
            _hypothesis(
                "H-WASTE-GENERATOR",
                angle,
                "Does waste generation change hazardous waste generator status?",
                "Spent solvent may affect generator status.",
            ),
        ]

    # wastewater
    return [
        _hypothesis(
            "H-WASTEWATER-PRETREATMENT",
            angle,
            "Does process wastewater discharge require pretreatment review?",
            "Industrial process wastewater may require pretreatment review.",
        ),
    ]


def _hypothesis(id_: str, angle: dict, question: str, claim: str) -> dict:
    return {
        "id": id_,
        "angle_id": angle["id"],
        "family": angle["family"],
        "question": question,
        "claim_to_test": claim,
        "required_facts": list(angle["triggering_facts"]),
        "expected_source_type": "regulation",
        "success_criteria": [
            "official or high-authority source",
            "quote contains trigger, threshold, exemption, or blocker",
            "predicate evaluation is reproducible",
        ],
        "dependencies": [],
    }


# ---------------------------------------------------------------------------
# taskForHypothesis
# ---------------------------------------------------------------------------


def _task_for_hypothesis(hyp: dict) -> dict:
    return {
        "task_id": f"T-{hyp['id'][2:]}",  # strip leading "H-"
        "hypothesis_id": hyp["id"],
        "assigned_agent": f"{hyp['family']}_researcher",
        "allowed_tools": research_worker_tool_ids(),
        "blocked_tools": blocked_tool_ids_for_role("researcher"),
        "budget": {
            "max_sources": 3,
            "max_runtime_seconds": 30,
            "max_model_calls": 4,
        },
    }
