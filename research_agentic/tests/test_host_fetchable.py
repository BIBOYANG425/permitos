import pytest

from research_agentic.policy import host_fetchable


@pytest.mark.parametrize("url", [
    "https://www.aqmd.gov/docs/rule.pdf",
    "http://vcapcd.org/rule23",
    "https://example.com/x",
    "https://8.8.8.8/x",
])
def test_public_hosts_are_fetchable(url):
    assert host_fetchable(url) is True


@pytest.mark.parametrize("url", [
    "ftp://aqmd.gov/x",                 # non-http scheme
    "http://localhost/x",
    "http://service.local/x",
    "http://api.internal/x",
    "http://127.0.0.1/x",               # loopback
    "http://10.0.0.5/x",                # private
    "http://192.168.1.1/x",            # private
    "http://169.254.169.254/latest",   # cloud metadata (link-local)
    "http://[::1]/x",                  # ipv6 loopback
    "not-a-url",
    "",
])
def test_ssrf_dangerous_targets_blocked(url):
    assert host_fetchable(url) is False


def test_non_string_blocked():
    assert host_fetchable(None) is False  # type: ignore[arg-type]
