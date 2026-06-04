"""Live Phase 1 smoke: run web_fetch inside a real modal.Sandbox.

Usage (from research_agentic/, with Modal auth configured):
    python research_agentic/scripts/smoke_web_fetch.py

Asserts: a real sandbox provisions, web_fetch pulls + PDF-extracts a real SCAQMD rule, the
text contains rule language, and the source is authority rank 1. Prints PASS/FAIL.
"""

from __future__ import annotations

import sys

from research_agentic.policy import source_authority_rank
from research_agentic.sandbox import SandboxSession, run_tool

RULE_PDF = "https://www.aqmd.gov/docs/default-source/rule-book/reg-ii/rule-201.pdf"


def main() -> int:
    assert source_authority_rank(RULE_PDF) == 1, "expected aqmd.gov to be authority rank 1"
    with SandboxSession(run_id="smoke-phase1", timeout_seconds=300) as session:
        result = run_tool(session, "web_fetch", {"url": RULE_PDF})
    ok = bool(result.get("ok"))
    text = result.get("text", "") or ""
    extracted = result.get("extracted_format")
    print(f"ok={ok} extracted_format={extracted!r} text_len={len(text)} status={result.get('status_code')}")
    print("text head:", text[:240].replace("\n", " "))
    passed = ok and extracted == "pdf" and len(text) > 500 and ("Permit" in text or "Rule 201" in text or "201" in text)
    print("SMOKE:", "PASS" if passed else "FAIL")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
