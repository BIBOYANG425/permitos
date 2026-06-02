"""
Python port of src/lib/research/fixtures/scenarios.ts.
Provides seeded ScopePack dicts for tests.
"""
from __future__ import annotations


def seeded_complex_scope(run_id: str, description: str) -> dict:
    return {
        "run_id": run_id,
        "facility": {
            "address": "Los Angeles County manufacturing facility",
            "jurisdiction_stack": ["SCAQMD", "California Water Boards", "Local CUPA"],
            "naics": "332813",
            "sic": "3471",
        },
        "project_change": {
            "description": (
                description
                or "Adding a coating booth and storing a new hazardous liquid at a Southern California manufacturing facility."
            ),
            "equipment": [{"kind": "coating_booth", "description": "new emitting equipment"}],
            "chemicals": [{"name": "flammable solvent", "quantity": 60, "unit": "gallons", "hazard": "flammable"}],
            "waste_streams": [{"description": "spent solvent", "kg_per_month": None}],
            "disturbance_acres": 0,
            "process_discharge": None,
        },
        "missing_facts": [
            {
                "field": "waste_streams.spent_solvent.kg_per_month",
                "why_needed": "Hazardous waste generator category depends on monthly generation quantity.",
                "blocks": ["hazardous_waste_generator_status"],
            },
            {
                "field": "process_discharge",
                "why_needed": "Wastewater pretreatment applicability depends on whether process wastewater is discharged.",
                "blocks": ["wastewater_pretreatment"],
            },
        ],
        "assumptions": [
            {
                "claim": "Facility is in SCAQMD jurisdiction.",
                "basis": "Seeded Los Angeles County demo resolver.",
                "confidence": 0.8,
            }
        ],
    }


def seeded_construction_scope(run_id: str, description: str) -> dict:
    return {
        "run_id": run_id,
        "facility": {
            "address": "Southern California light industrial site",
            "jurisdiction_stack": ["California Water Boards", "Local Municipality"],
            "naics": None,
            "sic": None,
        },
        "project_change": {
            "description": description or "Simple construction project disturbing 1.2 acres.",
            "equipment": [],
            "chemicals": [],
            "waste_streams": [],
            "disturbance_acres": 1.2,
            "process_discharge": False,
        },
        "missing_facts": [],
        "assumptions": [
            {
                "claim": "Construction disturbance acreage is supplied by intake.",
                "basis": "Seeded golden eval case.",
                "confidence": 0.9,
            }
        ],
    }


def seeded_missing_facts_scope(run_id: str, description: str) -> dict:
    return {
        "run_id": run_id,
        "facility": {
            "address": "Southern California manufacturing facility",
            "jurisdiction_stack": ["SCAQMD", "California Water Boards", "Local CUPA"],
            "naics": None,
            "sic": None,
        },
        "project_change": {
            "description": (
                description
                or "Facility adds a new chemical and process but omits quantities and industry codes."
            ),
            "equipment": [{"kind": "process_equipment", "description": "new unspecified process equipment"}],
            "chemicals": [{"name": "hazardous material", "quantity": None, "unit": None}],
            "waste_streams": [{"description": "process waste", "kg_per_month": None}],
            "disturbance_acres": None,
            "process_discharge": None,
        },
        "missing_facts": [
            {
                "field": "facility.naics_or_sic",
                "why_needed": "Industrial stormwater coverage depends on SIC/NAICS or industrial activity.",
                "blocks": ["industrial_stormwater"],
            },
            {
                "field": "chemicals.quantity",
                "why_needed": "HMBP threshold evaluation depends on hazardous material quantity and units.",
                "blocks": ["hmbp_threshold"],
            },
            {
                "field": "waste_streams.kg_per_month",
                "why_needed": "Hazardous waste generator status depends on monthly waste generation.",
                "blocks": ["hazardous_waste_generator_status"],
            },
        ],
        "assumptions": [],
    }
