"""web_fetch + web_search — open-discovery network tools (run inside the sandbox).

Ported from the parent repo's tools.py (PR #38). web_fetch follows redirects under the
SSRF guard, extracts PDF text (PyMuPDF) and HTML main content (BeautifulSoup), caps the
output, and falls back to the headless browser on a Cloudflare bot-block. web_search does
real open web discovery via the OpenAI Responses web_search tool (no host restriction;
authority is judged downstream). Heavy deps are import-guarded.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

from research_agentic.policy import (
    MAX_REDIRECT_HOPS,
    REDIRECT_STATUS_CODES,
    SandboxPolicy,
    _cap_text,
    _error,
    _exception_error,
    _invalid_argument,
    _success,
    host_allowed,
    host_fetchable,
    source_authority_rank,
)


def _extract_pdf_text(data: bytes) -> str | None:
    if not isinstance(data, (bytes, bytearray)) or not data:
        return None
    try:
        import fitz
    except ImportError:
        return None
    try:
        with fitz.open(stream=bytes(data), filetype="pdf") as document:
            text = "\n".join(page.get_text("text") for page in document)
        return text or None
    except Exception:  # noqa: BLE001 — not a parseable PDF; let caller fall back
        return None


def _extract_main_text(html: str) -> str:
    try:
        import re

        from bs4 import BeautifulSoup
    except ImportError:
        return html
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg", "button"]):
        tag.decompose()
    main = soup.find("main") or soup.find("article") or soup.find(attrs={"role": "main"})
    text = main.get_text("\n", strip=True) if main else ""
    if len(text) < 400:
        text = (soup.body or soup).get_text("\n", strip=True)
    return re.sub(r"\n{3,}", "\n\n", text)


_BOT_BLOCK_STATUS = {403, 429, 503}
_BOT_BLOCK_BODY_MARKERS = (
    "just a moment",
    "cf-browser-verification",
    "challenge-platform",
    "attention required",
    "enable javascript and cookies",
    "_cf_chl",
)


def _looks_bot_blocked(response: Any) -> bool:
    if getattr(response, "status_code", None) not in _BOT_BLOCK_STATUS:
        return False
    headers = {str(k).lower(): str(v).lower() for k, v in dict(getattr(response, "headers", {})).items()}
    if "cf-ray" in headers or "cf-mitigated" in headers or "cloudflare" in headers.get("server", ""):
        return True
    try:
        body = (response.text or "")[:4000].lower()
    except Exception:  # noqa: BLE001
        return False
    return any(marker in body for marker in _BOT_BLOCK_BODY_MARKERS)


def _header(response: Any, name: str) -> str | None:
    headers = getattr(response, "headers", {})
    return headers.get(name) or headers.get(name.lower()) or headers.get(name.title())


def _is_redirect(response: Any) -> bool:
    return getattr(response, "status_code", None) in REDIRECT_STATUS_CODES and bool(_header(response, "location"))


def _guarded_get(
    policy: SandboxPolicy,
    client: Any,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    context: dict[str, Any] | None = None,
) -> tuple[Any | None, dict[str, Any] | None, list[dict[str, Any]]]:
    current_url = url
    redirect_chain: list[dict[str, Any]] = []
    context = context or {}
    for hop in range(MAX_REDIRECT_HOPS + 1):
        response = client.get(current_url, params=params if hop == 0 else None)
        status_code = getattr(response, "status_code", None)
        chain_entry = {"url": current_url, "status_code": status_code}
        redirect_chain.append(chain_entry)
        if not _is_redirect(response):
            return response, None, redirect_chain
        raw_location = _header(response, "location")
        next_url = urljoin(current_url, raw_location or "")
        chain_entry["location"] = next_url
        if not host_fetchable(next_url):
            return (None, _error("blocked", "redirect_blocked",
                                 "Redirect target is not a fetchable public host (SSRF guard).",
                                 redirect_chain=redirect_chain, blocked_url=next_url, **context), redirect_chain)
        current_url = next_url
    return (None, _error("error", "redirect_limit_exceeded", "Redirect hop limit exceeded.",
                         redirect_chain=redirect_chain, **context), redirect_chain)


def _browser_fallback(policy: SandboxPolicy, url: str, *, redirect_chain: list[dict[str, Any]], original_url: str) -> dict[str, Any] | None:
    try:
        from research_agentic.sandbox_tools.browser import browser_use  # lazy: breaks web<->browser cycle
        result = browser_use(policy, url)
    except Exception:  # noqa: BLE001 — browser is best-effort; fall through on any error
        return None
    if not isinstance(result, dict) or not result.get("ok"):
        return None
    snapshot = result.get("snapshot") or {}
    return _success("fetched", url=original_url, final_url=snapshot.get("url", url),
                    status_code=snapshot.get("status_code"), content_type=snapshot.get("content_type", "text/html"),
                    text=_cap_text(snapshot.get("text", "")), via="browser_fallback", redirect_chain=redirect_chain)


def web_fetch(policy: SandboxPolicy, url: str) -> dict[str, Any]:
    if not isinstance(url, str):
        return _invalid_argument("url", "a string", url)
    if not policy.allow_network:
        return _error("blocked", "network_disabled", "Network access is disabled by sandbox policy.", url=url)
    if not host_fetchable(url):
        return _error("blocked", "host_not_fetchable", "URL is not a fetchable public host (SSRF guard).", url=url)
    try:
        import httpx
    except ImportError:
        return _error("unavailable", "dependency_missing", "httpx is not installed.", dependency="httpx")
    try:
        with httpx.Client(follow_redirects=False, timeout=policy.timeout_seconds) as client:
            response, redirect_error, redirect_chain = _guarded_get(policy, client, url, context={"url": url})
        if redirect_error is not None:
            return redirect_error
        final_url = str(response.url)
        # Defense-in-depth: _guarded_get already checks every hop, but re-verify the
        # terminal URL in case a future client diverges response.url from current_url.
        if not host_fetchable(final_url):
            return _error("blocked", "redirect_blocked", "Fetch redirected to a non-fetchable public host (SSRF guard).",
                          url=url, final_url=final_url)
        content_type = response.headers.get("content-type")
        ctype = (content_type or "").lower()
        if not response.is_success and policy.allow_browser and _looks_bot_blocked(response):
            fallback = _browser_fallback(policy, final_url, redirect_chain=redirect_chain, original_url=url)
            if fallback is not None:
                return fallback
        body_bytes = response.content if response.is_success else b""
        is_pdf = ("pdf" in ctype) or (body_bytes[:5].startswith(b"%PDF"))
        if is_pdf and body_bytes:
            extracted = _extract_pdf_text(body_bytes)
            if extracted is not None:
                return _success("fetched", url=url, final_url=final_url, status_code=response.status_code,
                                content_type=content_type or "application/pdf", text=_cap_text(extracted),
                                extracted_format="pdf", headers=dict(response.headers), redirect_chain=redirect_chain)
        raw = response.text if response.is_success else ""
        is_html = "html" in ctype or (raw[:512].lstrip().lower().startswith(("<!doctype html", "<html")))
        text = _extract_main_text(raw) if (is_html and raw) else raw
        return _success("fetched" if response.is_success else "http_error", url=url, final_url=final_url,
                        status_code=response.status_code, content_type=content_type, text=_cap_text(text),
                        headers=dict(response.headers), redirect_chain=redirect_chain)
    except Exception as exc:
        return _exception_error("fetch_failed", exc, url=url)


def _openai_web_search(query: str, *, limit: int = 5) -> dict[str, Any]:
    import os

    try:
        from openai import OpenAI
    except ImportError:
        return _error("unavailable", "search_dependency_missing", "openai is not installed.", query=query)
    if not os.environ.get("OPENAI_API_KEY"):
        return _error("unavailable", "search_provider_unavailable", "No OPENAI_API_KEY configured for web search.", query=query)
    model = os.environ.get("RESEARCH_CORE_AGENT_MODEL") or "gpt-5.5"
    instruction = ("Find official primary sources that answer this California EHS permit question. "
                   "Prefer government/authority sites. Question: " + query)
    resp = None
    client = OpenAI(timeout=45.0, max_retries=1)
    for tool_type in ("web_search", "web_search_preview"):
        try:
            resp = client.responses.create(model=model, tools=[{"type": tool_type}], input=instruction)
            break
        except Exception:  # noqa: BLE001
            resp = None
    if resp is None:
        return _error("unavailable", "search_failed", "Web search call failed.", query=query)
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in (getattr(resp, "output", None) or []):
        for content in (getattr(item, "content", None) or []):
            for ann in (getattr(content, "annotations", None) or []):
                u = getattr(ann, "url", None)
                if not u or u in seen or not host_fetchable(u):
                    continue
                seen.add(u)
                results.append({"url": u, "title": getattr(ann, "title", "") or "", "authority_rank": source_authority_rank(u)})
                if len(results) >= max(1, limit):
                    break
    return _success("searched", query=query, results=results)


def web_search(policy: SandboxPolicy, query: str, *, limit: int = 5) -> dict[str, Any]:
    if not isinstance(query, str):
        return _invalid_argument("query", "a string", query)
    if not isinstance(limit, int) or isinstance(limit, bool):
        return _invalid_argument("limit", "an integer", limit)
    if not policy.allow_network:
        return _error("blocked", "network_disabled", "Network access is disabled by sandbox policy.", query=query)
    if not query.strip():
        return _error("error", "empty_query", "Search query must not be empty.", query=query)
    if policy.search_endpoint is None:
        return _openai_web_search(query, limit=limit)
    if not isinstance(policy.search_endpoint, str):
        return _invalid_argument("search_endpoint", "a string", policy.search_endpoint)
    if not host_allowed(policy.search_endpoint, policy.allowed_hosts):
        return _error("blocked", "host_not_allowed", "Search endpoint host is not allowed by sandbox policy.",
                      endpoint=policy.search_endpoint)
    try:
        import httpx
    except ImportError:
        return _error("unavailable", "dependency_missing", "httpx is not installed.", dependency="httpx")
    try:
        with httpx.Client(follow_redirects=False, timeout=policy.timeout_seconds) as client:
            response, redirect_error, redirect_chain = _guarded_get(
                policy, client, policy.search_endpoint, params={"q": query, "limit": limit},
                context={"query": query, "endpoint": policy.search_endpoint})
        if redirect_error is not None:
            return redirect_error
        final_url = str(response.url)
        if not host_allowed(final_url, policy.allowed_hosts):
            return _error("blocked", "redirect_host_not_allowed", "Search redirected to a host outside sandbox policy.",
                          endpoint=policy.search_endpoint, final_url=final_url)
        content_type = response.headers.get("content-type", "")
        results: Any = response.json() if "json" in content_type else response.text
        return _success("searched" if response.is_success else "http_error", query=query,
                        endpoint=policy.search_endpoint, final_url=final_url, status_code=response.status_code,
                        results=results, redirect_chain=redirect_chain)
    except Exception as exc:
        return _exception_error("search_failed", exc, query=query, endpoint=policy.search_endpoint)
