"""browser_use — guarded headless-browser navigation (Playwright; runs inside the sandbox).

Ported from the parent repo's browser.py (PR #38). Every request is route-guarded by
host_fetchable, service workers are blocked, the final URL is re-checked, and a PDF landed
on by the browser is extracted through the browser's own request context. Playwright is
import-guarded (Phase 2 installs it + chromium in the sandbox image).
"""

from __future__ import annotations

from typing import Any

from research_agentic.policy import (
    SandboxPolicy,
    _error,
    _exception_error,
    _invalid_argument,
    _success,
    host_fetchable,
)


def _pdf_text_via_browser(context: Any, response: Any, final_url: str) -> str | None:
    content_type = ""
    try:
        headers = getattr(response, "headers", None) or {}
        content_type = (headers.get("content-type") or "").lower()
    except Exception:  # noqa: BLE001
        content_type = ""
    path = final_url.lower().split("?", 1)[0]
    if "pdf" not in content_type and not path.endswith(".pdf"):
        return None
    try:
        api_response = context.request.get(final_url)
        data = api_response.body()
    except Exception:  # noqa: BLE001
        return None
    from research_agentic.sandbox_tools.web import _extract_pdf_text  # lazy: breaks browser<->web cycle

    return _extract_pdf_text(data)


def browser_use(policy: SandboxPolicy, url: str, *, wait_until: str = "domcontentloaded") -> dict[str, Any]:
    if not isinstance(url, str):
        return _invalid_argument("url", "a string", url)
    if not policy.allow_browser:
        return _error("blocked", "browser_disabled", "Browser access is disabled by sandbox policy.", url=url)
    if not host_fetchable(url):
        return _error("blocked", "host_not_fetchable", "URL is not a fetchable public host (SSRF guard).", url=url)
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return _error("unavailable", "dependency_missing", "playwright is not installed.", dependency="playwright")
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = None
            try:
                blocked_requests: list[dict[str, Any]] = []

                def guard_route(route: Any, request: Any) -> None:
                    request_url = getattr(request, "url", "")
                    if host_fetchable(request_url):
                        route.continue_()
                        return
                    blocked_requests.append({"url": request_url, "resource_type": getattr(request, "resource_type", None)})
                    route.abort()

                context = browser.new_context(service_workers="block")
                context.route("**/*", guard_route)
                page = context.new_page()
                try:
                    response = page.goto(url, wait_until=wait_until, timeout=int(policy.timeout_seconds * 1000))
                except Exception:
                    if blocked_requests:
                        return _error("blocked", "resource_blocked", "Browser blocked a request outside sandbox policy.",
                                      url=url, blocked_url=blocked_requests[0]["url"], blocked_requests=blocked_requests)
                    raise
                if blocked_requests:
                    return _error("blocked", "resource_blocked", "Browser blocked a request outside sandbox policy.",
                                  url=url, blocked_url=blocked_requests[0]["url"], blocked_requests=blocked_requests)
                final_url = page.url
                if not host_fetchable(final_url):
                    return _error("blocked", "redirect_blocked", "Browser navigation reached a host outside sandbox policy.",
                                  url=url, final_url=final_url)
                pdf_text = _pdf_text_via_browser(context, response, final_url)
                if pdf_text:
                    snapshot = {"url": final_url, "title": page.title(), "text": pdf_text,
                                "status_code": response.status if response is not None else None,
                                "content_type": "application/pdf"}
                else:
                    body = page.locator("body")
                    snapshot = {"url": final_url, "title": page.title(),
                                "text": body.inner_text(timeout=int(policy.timeout_seconds * 1000)) if body.count() else "",
                                "status_code": response.status if response is not None else None}
            finally:
                if context is not None:
                    context.close()
                browser.close()
        return _success("navigated", snapshot=snapshot)
    except Exception as exc:
        return _exception_error("browser_failed", exc, url=url)
