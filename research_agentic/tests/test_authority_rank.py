from research_agentic.policy import host_allowed, source_authority_rank


def test_rank1_curated_and_air_districts():
    assert source_authority_rank("https://www.aqmd.gov/docs/rule-201.pdf") == 1
    assert source_authority_rank("https://vcapcd.org/Rulebook/RULE23.pdf") == 1  # non-.gov authority


def test_rank2_other_gov():
    assert source_authority_rank("https://www.calrecycle.ca.gov/x") == 1  # ca.gov is curated -> 1
    assert source_authority_rank("https://www.ready.gov/x") == 2          # other .gov
    assert source_authority_rank("https://www.defense.mil/x") == 2


def test_rank3_non_authoritative():
    assert source_authority_rank("https://example.com/x") == 3
    assert source_authority_rank("https://medium.com/some-post") == 3


def test_spoof_suffix_not_substring():
    # aqmd.gov.evil.example ends in .example -> rank 3, never treated as government.
    assert source_authority_rank("https://aqmd.gov.evil.example/x") == 3


def test_host_allowed_suffix_match():
    assert host_allowed("https://sub.epa.gov/x") is True
    assert host_allowed("https://epa.gov.attacker.com/x") is False
