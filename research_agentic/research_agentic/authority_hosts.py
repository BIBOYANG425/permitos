"""Known California EHS authority hostnames — the rank-1 source seed.

The parent derives air-district hosts from research_core.jurisdiction_registry; this
greenfield package does NOT depend on research_core, so the seed is static here. Hosts
are pre-normalized (lowercase, no leading 'www.', no trailing '.'). DEFAULT_ALLOWED_HOSTS
is the curated federal/state core; CA_AIR_DISTRICT_HOSTS adds district sites that live on
non-.gov TLDs (.org/.us/.net) which a naive government-TLD check would miss. Phase 3's
recall checklist expands CA_AIR_DISTRICT_HOSTS to the full ~35-district set (and may derive
it from the ported skills/*/program.json authority_source_url hosts).
"""

from __future__ import annotations

# Curated federal/state core (verbatim from parent tools.DEFAULT_ALLOWED_HOSTS).
DEFAULT_ALLOWED_HOSTS: tuple[str, ...] = (
    "aqmd.gov",
    "scaqmd.gov",
    "arb.ca.gov",
    "ca.gov",
    "epa.gov",
    "osha.gov",
    "govinfo.gov",
    "ecfr.gov",
    "law.cornell.edu",
)

# CA air-district sites on non-.gov TLDs (Phase 1 seed; expanded in Phase 3).
CA_AIR_DISTRICT_HOSTS: frozenset[str] = frozenset(
    {
        "vcapcd.org",
        "baaqmd.gov",
        "valleyair.org",
        "ourair.org",
        "slocleanair.org",
        "aqmd.gov",
    }
)


def ca_authority_hosts() -> frozenset[str]:
    """All known rank-1 authority hosts: the curated core UNION the CA air districts."""
    return frozenset(DEFAULT_ALLOWED_HOSTS) | CA_AIR_DISTRICT_HOSTS
