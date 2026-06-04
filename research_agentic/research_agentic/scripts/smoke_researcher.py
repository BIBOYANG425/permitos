"""Live Phase 2 smoke: run ONE researcher end-to-end in a real modal.Sandbox.

Usage (from research_agentic/, with Modal + OpenAI auth):
    .venv/bin/python research_agentic/scripts/smoke_researcher.py

Gives the researcher a real hypothesis (Cayi graphic-arts, VCAPCD Rule 23 exemption),
runs the full agent loop in a sandbox, and asserts it submitted a finding citing a real
source. Prints PASS/FAIL.
"""

from __future__ import annotations

import sys

from research_agentic.researcher import run_researcher
from research_agentic.task import ResearcherTask


def main() -> int:
    task = ResearcherTask(
        run_id="smoke-p2",
        hypothesis=("Does a graphic-arts/printing operation in Ventura County (SIC 2759) using "
                    "UV-curing inkjet inks qualify for a VCAPCD Rule 23 exemption from the Rule 10 "
                    "permit (graphic-arts operations under 200 lb ROC per rolling 12 months)?"),
        skill_id="vcapcd-rule-23-exemption",
        facts={"county": "Ventura", "city": "Oxnard", "sic": "2759", "air_district": "Ventura County APCD"},
        provided_documents=[],
    )
    result = run_researcher(task)
    n_find = len(result.findings)
    n_tools = len(result.trace)
    used = sorted({r.get("tool") for r in result.trace})
    print(f"agent_output_head={result.agent_output[:120]!r}")
    print(f"findings={n_find} tool_calls={n_tools} tools_used={used}")
    if result.findings:
        f0 = result.findings[0]
        print(f"finding.title={f0.get('title')!r}  sources={f0.get('sources')}  confidence={f0.get('confidence')}")
    # PASS = at least one finding, the loop used read_skill + a fetch/search, and the finding cites a source.
    fetched = any(t in used for t in ("web_fetch", "web_search", "browser_use"))
    grounded = bool(result.findings and result.findings[0].get("sources"))
    passed = n_find >= 1 and "read_skill" in used and fetched and grounded
    print("SMOKE:", "PASS" if passed else "FAIL")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
