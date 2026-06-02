"""
Faithful Python port of the PURE helper functions from src/lib/research/scope.ts
that the planner depends on.

Excluded: parseScope (LLM, async), applySdsHandoffToScope (SDS, later task).
"""

from __future__ import annotations

import random
import time

JURISDICTION_STACK = ["SCAQMD", "California Water Boards", "Local CUPA"]


def create_run_id() -> str:
    """Mirror TS: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`"""
    now_36 = format(int(time.time() * 1000), "b")  # not base-36 yet — fix below
    # Python: int to base-36
    now_b36 = _to_base36(int(time.time() * 1000))
    rand_b36 = _to_base36(random.randint(0, 2**32))[2:8]  # slice(2, 8) from random string
    return f"run_{now_b36}_{rand_b36}"


def _to_base36(n: int) -> str:
    if n == 0:
        return "0"
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    result = ""
    while n:
        n, r = divmod(n, 36)
        result = digits[r] + result
    return result


def empty_scope(run_id: str, description: str) -> dict:
    return {
        "run_id": run_id,
        "facility": {
            "address": "Unspecified Southern California facility",
            "jurisdiction_stack": list(JURISDICTION_STACK),
            "naics": None,
            "sic": None,
        },
        "project_change": {
            "description": description or "Unspecified project change.",
            "equipment": [],
            "chemicals": [],
            "waste_streams": [],
            "disturbance_acres": None,
            "process_discharge": None,
        },
        "missing_facts": [
            {
                "field": "scope_extraction",
                "why_needed": "Project facts could not be extracted (no LLM key or extraction failed).",
                "blocks": ["air", "stormwater", "hazmat", "waste", "wastewater"],
            }
        ],
        "assumptions": [],
    }


def scope_pack_from_facts(facts: dict, run_id: str, description: str) -> dict:
    """Port of scopePackFromFacts in scope.ts."""
    raw_equipment = facts.get("equipment") or []
    equipment = [
        {
            "kind": e["kind"],
            "description": e.get("description", "") if isinstance(e.get("description"), str) else "",
        }
        for e in raw_equipment
        if e and isinstance(e.get("kind"), str)
    ]

    raw_chemicals = facts.get("chemicals") or []
    chemicals = []
    for c in raw_chemicals:
        if not c or not isinstance(c.get("name"), str):
            continue
        item: dict = {
            "name": c["name"],
            "quantity": c["quantity"] if isinstance(c.get("quantity"), (int, float)) else None,
            "unit": c["unit"] if isinstance(c.get("unit"), str) else None,
        }
        if isinstance(c.get("hazard"), str):
            item["hazard"] = c["hazard"]
        chemicals.append(item)

    raw_waste = facts.get("waste_streams") or []
    waste_streams = [
        {
            "description": w["description"],
            "kg_per_month": w["kg_per_month"] if isinstance(w.get("kg_per_month"), (int, float)) else None,
        }
        for w in raw_waste
        if w and isinstance(w.get("description"), str)
    ]

    disturbance_acres = facts.get("disturbance_acres")
    if not isinstance(disturbance_acres, (int, float)):
        disturbance_acres = None

    process_discharge = facts.get("process_discharge")
    if not isinstance(process_discharge, bool):
        process_discharge = None

    naics = facts.get("naics")
    if not isinstance(naics, str):
        naics = None

    sic = facts.get("sic")
    if not isinstance(sic, str):
        sic = None

    missing_facts: list[dict] = []
    if any(c["quantity"] is None for c in chemicals):
        missing_facts.append({
            "field": "chemicals.quantity",
            "why_needed": "HMBP threshold comparison needs the stored quantity.",
            "blocks": ["hazmat"],
        })
    if any(w["kg_per_month"] is None for w in waste_streams):
        missing_facts.append({
            "field": "waste_streams.kg_per_month",
            "why_needed": "Hazardous waste generator category depends on monthly generation quantity.",
            "blocks": ["waste"],
        })
    if not naics and not sic:
        missing_facts.append({
            "field": "facility.naics_or_sic",
            "why_needed": "Industrial stormwater coverage depends on SIC/NAICS.",
            "blocks": ["stormwater"],
        })
    if process_discharge is None:
        missing_facts.append({
            "field": "project_change.process_discharge",
            "why_needed": "Wastewater pretreatment depends on whether process wastewater is discharged.",
            "blocks": ["wastewater"],
        })

    raw_address = facts.get("address")
    address = raw_address if isinstance(raw_address, str) and raw_address else "Southern California facility"

    return {
        "run_id": run_id,
        "facility": {
            "address": address,
            "jurisdiction_stack": list(JURISDICTION_STACK),
            "naics": naics,
            "sic": sic,
        },
        "project_change": {
            "description": description or "Project change.",
            "equipment": equipment,
            "chemicals": chemicals,
            "waste_streams": waste_streams,
            "disturbance_acres": disturbance_acres,
            "process_discharge": process_discharge,
        },
        "missing_facts": missing_facts,
        "assumptions": [
            {
                "claim": "Facility is in SCAQMD / California jurisdiction.",
                "basis": "Southern-California-scoped demo.",
                "confidence": 0.7,
            }
        ],
    }


def project_facts(scope: dict) -> dict:
    return {
        "address": scope["facility"]["address"],
        "naics": scope["facility"]["naics"],
        "sic": scope["facility"]["sic"],
        "equipment": scope["project_change"]["equipment"],
        "chemicals": scope["project_change"]["chemicals"],
        "waste_streams": scope["project_change"]["waste_streams"],
        "disturbance_acres": scope["project_change"]["disturbance_acres"],
        "process_discharge": scope["project_change"]["process_discharge"],
        "missing_facts": scope["missing_facts"],
    }
