"""Always-on, pure, deterministic output invariants for the agentic research run.

These are the cheap safety checks that run on EVERY finished run (distinct from the
offline sampled eval). They assert the final determinations honor the two hard
guarantees the deterministic backstop is built to protect — grounding and the
recall floor — plus honest uncertainty on missing facts. check_invariants does NOT
raise; it returns a list of human-readable violation strings (empty = all good) so
the caller (wired in Task 13) can decide how to surface them.

Contract
--------
    check_invariants(result, bundles) -> list[str]

  result:  a recorded-run dict carrying at least:
             {"scope": <ScopePack>, "determinations": [<Determination>, ...], "status": ...}
           scope is REQUIRED — invariant (b) derives the expected-program set from it
           via research_core.completeness.expected_programs_for_scope, the SAME
           registry x scope derivation finalize_run's recall floor uses. (finalize's
           own output dict does not echo scope, so the run must be recorded WITH its
           scope before calling this; see research_aiq.functions.finalize.)
  bundles: the gathered EvidenceBundle dicts (for the invariant-(a) quote-in-source
           verification and the invariant-(c) "did the researcher actually decide" signal).

Invariants
----------
  (a) grounding: any determination marked verified whose verbatim quote is NOT
      actually present in its cited source bundle. A verified determination must be
      backed by a real verbatim quote (the same substring-after-whitespace-normalize
      test verify_evidence uses for its grounding check).
  (b) recall-floor coverage: any program EXPECTED for this scope that is entirely
      ABSENT from the determinations. The recall floor guarantees every expected
      program at least APPEARS (as needs_review if uninvestigated), so total absence
      is a violation.
  (c) honest uncertainty: any determination tied to a missing decision-relevant fact
      that is presented as a confident, verified yes/no instead of needs_review.

Purity: no I/O, no AIQ imports, no mutation of inputs. Only research_core is reused.

Header last reviewed: 2026-06-02
"""

from __future__ import annotations

from research_core.completeness import expected_programs_for_scope
from research_core.program_registry import PROGRAM_REGISTRY
from research_core.synthesis import _requirement_for
from research_core.verifier import _norm_ws

# ---------------------------------------------------------------------------
# Linkage helpers — a Determination row carries NO hypothesis_id; its
# `requirement` label is the only link back to a hypothesis/program. These
# reverse maps recover that link using research_core's own definitions, so
# "which program/hypothesis is this row?" means exactly what the pipeline means.
# ---------------------------------------------------------------------------


def _requirement_to_hypotheses() -> dict[str, list[str]]:
    """requirement label -> hypothesis_ids that synthesize to it.

    Built from PROGRAM_REGISTRY x _requirement_for so it tracks the registry. A
    label can map to several hypotheses only if they happen to share a requirement
    string (none do today, but the list form keeps it robust).
    """
    out: dict[str, list[str]] = {}
    for program in PROGRAM_REGISTRY:
        for hid in program["hypothesis_ids"]:
            out.setdefault(_requirement_for(hid), []).append(hid)
    return out


def _program_present_labels(program: dict) -> set[str]:
    """The set of `requirement` labels under which *program* may legitimately appear.

    A program surfaces either as a recall-gap row (requirement == program["name"])
    or as a synthesized row for one of its hypotheses
    (requirement == _requirement_for(hypothesis_id)). The program is ABSENT only if
    NONE of these labels appears among the determinations.
    """
    labels = {program["name"]}
    for hid in program["hypothesis_ids"]:
        labels.add(_requirement_for(hid))
    return labels


def _hypotheses_for_requirement(requirement: str) -> list[str]:
    """Hypothesis ids whose synthesized requirement label equals *requirement*, or
    whose program name equals it (recall-gap rows). Empty if unrecognized."""
    direct = _requirement_to_hypotheses().get(requirement, [])
    if direct:
        return direct
    for program in PROGRAM_REGISTRY:
        if program["name"] == requirement:
            return list(program["hypothesis_ids"])
    return []


# ---------------------------------------------------------------------------
# Invariant (a): grounding
# ---------------------------------------------------------------------------


def _quote_in_any_source(quote: str, sources: list[dict]) -> bool:
    """True if *quote* appears (verbatim, after whitespace normalization) in any
    source's quote. Mirrors verify_evidence's grounding test: collapse whitespace,
    then substring-contains."""
    needle = _norm_ws((quote or "").strip())
    if not needle:
        return False
    for src in sources:
        haystack = _norm_ws((src.get("quote") or "").strip())
        if haystack and needle in haystack:
            return True
    return False


def _sources_for_determination(
    det: dict,
    bundles: list[dict],
    bundles_by_hypothesis: dict[str, dict],
) -> list[dict]:
    """All candidate source dicts a determination's quote could be grounded in.

    Primary link: bundles whose source url == det["source_url"]. Fallback: bundles
    for the hypotheses behind det["requirement"]. Returning the union keeps the check
    robust to either linkage being the one that holds for a given row.
    """
    collected: list[dict] = []
    source_url = det.get("source_url") or ""

    if source_url:
        for bundle in bundles:
            for src in bundle.get("sources", []):
                if src.get("url") == source_url:
                    collected.append(src)

    for hid in _hypotheses_for_requirement(det.get("requirement", "")):
        bundle = bundles_by_hypothesis.get(hid)
        if bundle:
            collected.extend(bundle.get("sources", []))

    return collected


def _check_grounding(
    determinations: list[dict],
    bundles: list[dict],
    bundles_by_hypothesis: dict[str, dict],
) -> list[str]:
    violations: list[str] = []
    for det in determinations:
        if not det.get("verified"):
            continue
        sources = _sources_for_determination(det, bundles, bundles_by_hypothesis)
        if not _quote_in_any_source(det.get("quote", ""), sources):
            requirement = det.get("requirement", "<unknown requirement>")
            violations.append(
                f"grounding: determination {requirement!r} is marked verified but its "
                f"verbatim quote is not present in any cited source bundle "
                f"(quote={det.get('quote', '')!r})"
            )
    return violations


# ---------------------------------------------------------------------------
# Invariant (b): recall-floor coverage
# ---------------------------------------------------------------------------


def _check_recall_floor(scope: dict, determinations: list[dict]) -> list[str]:
    present_labels = {det.get("requirement") for det in determinations}
    violations: list[str] = []
    for program in expected_programs_for_scope(scope):
        if not (_program_present_labels(program) & present_labels):
            violations.append(
                f"recall-floor: expected program {program['name']!r} (id={program['id']}) is "
                f"absent from the determinations — the recall floor must surface every "
                f"expected program at least as needs_review"
            )
    return violations


# ---------------------------------------------------------------------------
# Invariant (c): honest uncertainty
# ---------------------------------------------------------------------------


def _researcher_could_not_decide(bundle: dict) -> bool:
    """True when the gathered evidence shows the researcher could NOT reach a
    grounded decision — the signature of a missing decision-relevant fact.

    Mirrors how the pipeline treats indecision: synthesis only emits a confident
    yes/no when researcher_conclusion is "applies"/"does_not_apply" (see
    synthesis._applies_for); anything else, or stated uncertainties, means the fact
    needed to decide was missing/ungrounded.
    """
    conclusion = bundle.get("researcher_conclusion")
    if conclusion not in ("applies", "does_not_apply"):
        return True
    if bundle.get("uncertainties"):
        return True
    return False


def _check_honest_uncertainty(
    determinations: list[dict],
    bundles_by_hypothesis: dict[str, dict],
) -> list[str]:
    violations: list[str] = []
    for det in determinations:
        applies = det.get("applies")
        if applies not in ("yes", "no"):
            continue  # needs_review is already honest
        if not det.get("verified"):
            continue  # an unverified yes/no is not presented as confident/settled

        # Only flag when the linked evidence shows the researcher could NOT decide
        # (missing decision-relevant fact). A confident yes/no backed by a deciding
        # bundle is legitimate.
        could_not_decide = False
        for hid in _hypotheses_for_requirement(det.get("requirement", "")):
            bundle = bundles_by_hypothesis.get(hid)
            if bundle and _researcher_could_not_decide(bundle):
                could_not_decide = True
                break
        if could_not_decide:
            requirement = det.get("requirement", "<unknown requirement>")
            violations.append(
                f"honest-uncertainty: determination {requirement!r} is presented as a "
                f"confident verified {applies!r} but its evidence shows a missing "
                f"decision-relevant fact — it must be needs_review"
            )
    return violations


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def check_invariants(result: dict, bundles: list[dict]) -> list[str]:
    """Pure, deterministic post-run checks. Returns violation strings (empty = ok).

    See the module docstring for the full contract. Does not raise and does not
    mutate its inputs.
    """
    determinations = result.get("determinations", [])
    scope = result.get("scope")

    # Index bundles by hypothesis_id once (last write wins, matching RunStore dedupe).
    bundles_by_hypothesis: dict[str, dict] = {}
    for bundle in bundles or []:
        hid = bundle.get("hypothesis_id")
        if hid is not None:
            bundles_by_hypothesis[hid] = bundle

    violations: list[str] = []
    violations.extend(_check_grounding(determinations, bundles or [], bundles_by_hypothesis))
    if scope is not None:
        violations.extend(_check_recall_floor(scope, determinations))
    else:
        # scope is required for (b); flag its absence rather than silently skipping a
        # guarantee — a check that quietly does nothing is worse than a loud one.
        violations.append(
            "recall-floor: result is missing 'scope'; cannot verify expected-program "
            "coverage (invariant b). Record the run with its scope before checking."
        )
    violations.extend(_check_honest_uncertainty(determinations, bundles_by_hypothesis))
    return violations
