"""AIQ function wrappers for the sandboxed researcher tools (host-side, thin).

Each wrapper resolves the current researcher's SandboxSession (a contextvar set by the
researcher agent in Phase 2; set by tests/smoke in Phase 1) and runs the tool INSIDE that
sandbox via run_tool. With no active session the wrapper returns a structured
'sandbox_required' error. A genuine sandbox crash propagates from run_tool (fail-loud).
Registering these makes nat discover the 10-tool suite; no agent calls them until Phase 2.
"""

from __future__ import annotations

import json
from typing import Any

from nat.builder.builder import Builder
from nat.builder.function_info import FunctionInfo
from nat.cli.register_workflow import register_function
from nat.data_models.function import FunctionBaseConfig

from research_agentic.sandbox import current_sandbox_session, run_tool

TOOL_NAMES = (
    "read_skill",
    "web_search",
    "web_fetch",
    "browser_use",
    "read_pdf",
    "read_docx",
    "read_spreadsheet",
    "compute_voc_threshold",
    "write_artifact",
    "submit_finding",
)

_DESCRIPTIONS = {
    "read_skill": "Load a law-code skill for orientation on this hypothesis's thresholds/exemptions. Orientation only — NEVER citable evidence.",
    "web_search": "Search the open web for official primary sources (returns title/url/authority_rank).",
    "web_fetch": "Fetch a public URL inside the sandbox; extracts PDF/HTML text, follows redirects under the SSRF guard.",
    "browser_use": "Open a public page in a guarded headless browser (runs JS / clears bot challenges).",
    "read_pdf": "Read a PDF from the run workspace.",
    "read_docx": "Read a DOCX from the run workspace.",
    "read_spreadsheet": "Read a CSV/XLSX from the run workspace.",
    "compute_voc_threshold": "Compute VOC/ROC thresholds: mass limit (lb/period) <-> usage limit (gal) or emissions.",
    "write_artifact": "Write an artifact into the run workspace.",
    "submit_finding": "Submit the final sourced finding. Terminal.",
}


def _no_session() -> str:
    return json.dumps({
        "ok": False, "status": "blocked",
        "error": {"code": "sandbox_required", "message": "No active sandbox session for this researcher."},
    })


def _call(tool: str, args: dict[str, Any]) -> str:
    session = current_sandbox_session()
    if session is None:
        return _no_session()
    return json.dumps(run_tool(session, tool, args))


# --- per-tool impls (typed signatures so nat/LangChain builds a proper tool schema) ---

def _read_skill_impl(skill_id: str = "") -> str:
    return _call("read_skill", {"skill_id": skill_id})


def _web_search_impl(query: str, limit: int = 5) -> str:
    return _call("web_search", {"query": query, "limit": limit})


def _web_fetch_impl(url: str) -> str:
    return _call("web_fetch", {"url": url})


def _browser_use_impl(url: str, wait_until: str = "domcontentloaded") -> str:
    return _call("browser_use", {"url": url, "wait_until": wait_until})


def _read_pdf_impl(path: str) -> str:
    return _call("read_pdf", {"path": path})


def _read_docx_impl(path: str) -> str:
    return _call("read_docx", {"path": path})


def _read_spreadsheet_impl(path: str) -> str:
    return _call("read_spreadsheet", {"path": path})


def _compute_voc_threshold_impl(
    voc_content: float,
    voc_content_unit: str = "weight_percent",
    density: float | None = None,
    density_unit: str = "lb/gal",
    mass_limit_lb: float | None = None,
    usage: float | None = None,
    usage_unit: str = "gal",
    control_efficiency: float = 0.0,
) -> str:
    return _call("compute_voc_threshold", {
        "voc_content": voc_content, "voc_content_unit": voc_content_unit,
        "density": density, "density_unit": density_unit, "mass_limit_lb": mass_limit_lb,
        "usage": usage, "usage_unit": usage_unit, "control_efficiency": control_efficiency,
    })


def _write_artifact_impl(relative_path: str, contents: str) -> str:
    return _call("write_artifact", {"relative_path": relative_path, "contents": contents})


def _submit_finding_impl(
    title: str, summary: str, sources: list[str], confidence: float, metadata_json: str | None = None,
) -> str:
    metadata: dict[str, Any] | None = None
    if metadata_json:
        try:
            parsed = json.loads(metadata_json)
            metadata = parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return json.dumps({"ok": False, "status": "error",
                               "error": {"code": "invalid_metadata_json", "message": "metadata_json must be valid JSON object."}})
    return _call("submit_finding", {
        "title": title, "summary": summary, "sources": sources, "confidence": confidence, "metadata": metadata,
    })


_IMPLS = {
    "read_skill": _read_skill_impl,
    "web_search": _web_search_impl,
    "web_fetch": _web_fetch_impl,
    "browser_use": _browser_use_impl,
    "read_pdf": _read_pdf_impl,
    "read_docx": _read_docx_impl,
    "read_spreadsheet": _read_spreadsheet_impl,
    "compute_voc_threshold": _compute_voc_threshold_impl,
    "write_artifact": _write_artifact_impl,
    "submit_finding": _submit_finding_impl,
}


# --- AIQ registration: one config + builder per tool ---

class ReadSkillConfig(FunctionBaseConfig, name="read_skill"):
    pass


class WebSearchConfig(FunctionBaseConfig, name="web_search"):
    pass


class WebFetchConfig(FunctionBaseConfig, name="web_fetch"):
    pass


class BrowserUseConfig(FunctionBaseConfig, name="browser_use"):
    pass


class ReadPdfConfig(FunctionBaseConfig, name="read_pdf"):
    pass


class ReadDocxConfig(FunctionBaseConfig, name="read_docx"):
    pass


class ReadSpreadsheetConfig(FunctionBaseConfig, name="read_spreadsheet"):
    pass


class ComputeVocThresholdConfig(FunctionBaseConfig, name="compute_voc_threshold"):
    pass


class WriteArtifactConfig(FunctionBaseConfig, name="write_artifact"):
    pass


class SubmitFindingConfig(FunctionBaseConfig, name="submit_finding"):
    pass


def _yield(name: str):
    return FunctionInfo.from_fn(_IMPLS[name], description=_DESCRIPTIONS[name])


@register_function(config_type=ReadSkillConfig)
async def read_skill(config: ReadSkillConfig, builder: Builder):
    yield _yield("read_skill")


@register_function(config_type=WebSearchConfig)
async def web_search(config: WebSearchConfig, builder: Builder):
    yield _yield("web_search")


@register_function(config_type=WebFetchConfig)
async def web_fetch(config: WebFetchConfig, builder: Builder):
    yield _yield("web_fetch")


@register_function(config_type=BrowserUseConfig)
async def browser_use(config: BrowserUseConfig, builder: Builder):
    yield _yield("browser_use")


@register_function(config_type=ReadPdfConfig)
async def read_pdf(config: ReadPdfConfig, builder: Builder):
    yield _yield("read_pdf")


@register_function(config_type=ReadDocxConfig)
async def read_docx(config: ReadDocxConfig, builder: Builder):
    yield _yield("read_docx")


@register_function(config_type=ReadSpreadsheetConfig)
async def read_spreadsheet(config: ReadSpreadsheetConfig, builder: Builder):
    yield _yield("read_spreadsheet")


@register_function(config_type=ComputeVocThresholdConfig)
async def compute_voc_threshold(config: ComputeVocThresholdConfig, builder: Builder):
    yield _yield("compute_voc_threshold")


@register_function(config_type=WriteArtifactConfig)
async def write_artifact(config: WriteArtifactConfig, builder: Builder):
    yield _yield("write_artifact")


@register_function(config_type=SubmitFindingConfig)
async def submit_finding(config: SubmitFindingConfig, builder: Builder):
    yield _yield("submit_finding")
