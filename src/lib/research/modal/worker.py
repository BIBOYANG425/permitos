"""Modal Sandbox worker for PermitPilot research tasks.

For each ResearchTask, this worker spins up an ephemeral Modal Sandbox,
runs a trivial isolation-proof command inside it, and returns a
deterministic EvidenceBundle dict (mirrors src/lib/research/fixtures/sources.ts).

Modeled after modal-labs/openai-agents-python-example: one sandbox per
subagent / per research task.

Invocation:
    modal run src/lib/research/modal/worker.py --task-json '{"task_id":"T-1","hypothesis_id":"H-AIR-201"}'
"""

from __future__ import annotations

import json
import sys

import modal

app = modal.App("permitpilot-research")

# Slim image — sandbox payload is just `echo`, no deps needed.
sandbox_image = modal.Image.debian_slim()


# Mirror of src/lib/research/fixtures/sources.ts. Kept in sync by hand
# because the hackathon stage doesn't need a build-time pipeline. If you
# add a fixture in sources.ts, mirror it here.
SOURCE_FIXTURES: dict[str, dict] = {
    "scaqmd_rule_201": {
        "source_name": "SCAQMD Rule 201",
        "url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf",
        "authority_rank": 1,
        "fetched_at": "2026-05-30T00:00:00Z",
        "content_hash": "sha256:demo-scaqmd-rule-201",
        "effective_date": None,
        "quote": "A person shall not build, erect, install, alter, or replace any equipment that may emit air contaminants without written authorization.",
        "extracted": {"permit_trigger": "new or altered equipment that may emit air contaminants"},
    },
    "scaqmd_rule_219": {
        "source_name": "SCAQMD Rule 219",
        "url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-219.pdf",
        "authority_rank": 1,
        "fetched_at": "2026-05-30T00:00:00Z",
        "content_hash": "sha256:demo-scaqmd-rule-219",
        "effective_date": None,
        "quote": "Equipment listed in this rule may be exempt from written permit requirements when the listed conditions are satisfied.",
        "extracted": {"exemption_check_required": True},
    },
    "scaqmd_rule_222": {
        "source_name": "SCAQMD Rule 222",
        "url": "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-222.pdf",
        "authority_rank": 1,
        "fetched_at": "2026-05-30T00:00:00Z",
        "content_hash": "sha256:demo-scaqmd-rule-222",
        "effective_date": None,
        "quote": "Owners or operators of specified equipment shall file registration information when the rule applies to that equipment category.",
        "extracted": {"registration_possible": True},
    },
    "industrial_general_permit": {
        "source_name": "California Industrial General Permit",
        "url": "https://www.waterboards.ca.gov/water_issues/programs/stormwater/industrial.html",
        "authority_rank": 1,
        "fetched_at": "2026-05-30T00:00:00Z",
        "content_hash": "sha256:demo-ca-igp",
        "effective_date": None,
        "quote": "Industrial facilities described by regulated Standard Industrial Classification codes must obtain coverage under the Industrial General Permit unless an exclusion applies.",
        "extracted": {"regulated_sic": "3471"},
    },
    "construction_general_permit": {
        "source_name": "California Construction General Permit",
        "url": "https://www.waterboards.ca.gov/water_issues/programs/stormwater/construction.html",
        "authority_rank": 1,
        "fetched_at": "2026-05-30T00:00:00Z",
        "content_hash": "sha256:demo-ca-cgp",
        "effective_date": None,
        "quote": "Construction activity that disturbs one or more acres of soil must obtain coverage under the Construction General Permit.",
        "extracted": {"acreage_threshold": 1},
    },
    "hmbp_threshold_bad": {
        "source_name": "California HMBP Threshold Summary",
        "url": "https://calepa.ca.gov/cupa/hazardous-materials-business-plan/",
        "authority_rank": 1,
        "fetched_at": "2026-05-30T00:00:00Z",
        "content_hash": "sha256:demo-hmbp-bad",
        "effective_date": None,
        "quote": "Businesses must submit information for hazardous materials at or above threshold quantities.",
        "extracted": {"overbroad_claim": "HMBP applies to all hazardous material storage"},
    },
    "hazardous_waste_generator": {
        "source_name": "EPA Hazardous Waste Generator Categories",
        "url": "https://www.epa.gov/hwgenerators/categories-hazardous-waste-generators",
        "authority_rank": 1,
        "fetched_at": "2026-05-30T00:00:00Z",
        "content_hash": "sha256:demo-epa-generator",
        "effective_date": None,
        "quote": "Generator category depends on the amount of hazardous waste generated in a calendar month.",
        "extracted": {"generator_quantity_required": True},
    },
    "wastewater_pretreatment": {
        "source_name": "EPA Pretreatment Program Overview",
        "url": "https://www.epa.gov/npdes/national-pretreatment-program",
        "authority_rank": 1,
        "fetched_at": "2026-05-30T00:00:00Z",
        "content_hash": "sha256:demo-epa-pretreatment",
        "effective_date": None,
        "quote": "Industrial users that discharge process wastewater to publicly owned treatment works may be subject to pretreatment requirements.",
        "extracted": {"process_discharge_required": True},
    },
}


# Mirror of fixtureForHypothesis() in workers.ts.
HYPOTHESIS_TO_FIXTURE: dict[str, str] = {
    "H-AIR-201": "scaqmd_rule_201",
    "H-AIR-VOC": "scaqmd_rule_201",
    "H-AIR-219": "scaqmd_rule_219",
    "H-AIR-222": "scaqmd_rule_222",
    "H-STORM-IGP": "industrial_general_permit",
    "H-STORM-CGP": "construction_general_permit",
    "H-HAZMAT-HMBP": "hmbp_threshold_bad",
    "H-WASTE-GENERATOR": "hazardous_waste_generator",
    "H-WASTEWATER-PRETREATMENT": "wastewater_pretreatment",
}


def _failed_bundle(hypothesis_id: str, reason: str) -> dict:
    return {
        "hypothesis_id": hypothesis_id,
        "sources": [],
        "extracted_claims": [],
        "researcher_conclusion": "needs_review",
        "uncertainties": [reason],
    }


def _preliminary_conclusion(hypothesis_id: str) -> str:
    if hypothesis_id in ("H-WASTE-GENERATOR", "H-WASTEWATER-PRETREATMENT"):
        return "needs_review"
    return "applies"


def _build_evidence_bundle(hypothesis_id: str) -> dict:
    fixture_id = HYPOTHESIS_TO_FIXTURE.get(hypothesis_id, "")
    fixture = SOURCE_FIXTURES.get(fixture_id)
    if fixture is None:
        return _failed_bundle(hypothesis_id, f"No source fixture found for {hypothesis_id}")

    extracted = fixture["extracted"]
    first_field = next(iter(extracted.keys()), "source_claim")
    first_value = next(iter(extracted.values()), hypothesis_id)

    return {
        "hypothesis_id": hypothesis_id,
        "sources": [
            {
                "url": fixture["url"],
                "source_name": fixture["source_name"],
                "authority_rank": fixture["authority_rank"],
                "fetched_at": fixture["fetched_at"],
                "content_hash": fixture["content_hash"],
                "effective_date": fixture["effective_date"],
                "quote": fixture["quote"],
            }
        ],
        "extracted_claims": [
            {
                "field": first_field,
                "value": str(first_value),
                "source_url": fixture["url"],
                "quote": fixture["quote"],
                "confidence": 0.82,
            }
        ],
        "researcher_conclusion": _preliminary_conclusion(hypothesis_id),
        "uncertainties": (
            ["Monthly hazardous waste quantity is missing."]
            if hypothesis_id == "H-WASTE-GENERATOR"
            else []
        ),
    }


@app.function(image=sandbox_image, timeout=120)
def research_task(task_spec: dict) -> dict:
    """Run one research task: spin up a Modal Sandbox, prove isolation, return evidence.

    The sandbox is currently a stand-in for the real fetcher/extractor pipeline.
    It runs `echo` to prove sandbox-per-task isolation works end-to-end; the
    deterministic fixture lookup happens in the caller process so we don't
    waste sandbox-cold-start time on a pure dict lookup.
    """
    hypothesis_id = task_spec.get("hypothesis_id", "")
    task_id = task_spec.get("task_id", "unknown-task")

    # Prove sandbox isolation: ephemeral sandbox, runs one command, exits.
    sandbox = modal.Sandbox.create(
        "echo",
        f"permitpilot worker isolated run for task={task_id} hypothesis={hypothesis_id}",
        app=app,
        image=sandbox_image,
        timeout=60,
    )
    try:
        sandbox.wait()
    finally:
        sandbox.terminate()

    return _build_evidence_bundle(hypothesis_id)


@app.local_entrypoint()
def main(task_json: str) -> None:
    """Entry point for `modal run`. Parses task JSON, calls research_task, prints result JSON.

    The TS bridge (runModalPool.ts) extracts the last JSON line from stdout,
    so we keep stdout disciplined: status comes from Modal itself, we only
    print the final JSON line.
    """
    task_spec = json.loads(task_json)
    result = research_task.remote(task_spec)
    # Single JSON line on stdout, marked for the TS bridge to grep.
    sys.stdout.write("PERMITPILOT_BUNDLE_JSON " + json.dumps(result) + "\n")
    sys.stdout.flush()
