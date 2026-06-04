from research_agentic.sandbox_tools.compute import compute_voc_threshold


def test_mass_limit_to_usage_limit_alg_case():
    # ~6.8 lb VOC/gal material, 200 lb/period exemption threshold -> ~29 gal/period.
    out = compute_voc_threshold(voc_content=6.8, voc_content_unit="lb/gal", mass_limit_lb=200.0)
    assert out["ok"] is True
    assert out["usage_limit"]["gal"] == 29.41


def test_weight_percent_requires_density():
    out = compute_voc_threshold(voc_content=50.0, voc_content_unit="weight_percent")
    assert out["ok"] is False
    assert out["error"]["code"] == "density_required"


def test_weight_percent_with_density():
    out = compute_voc_threshold(voc_content=50.0, voc_content_unit="weight_percent", density=8.0, density_unit="lb/gal")
    assert out["ok"] is True
    assert out["voc_mass_per_volume"]["lb_per_gal"] == 4.0


def test_usage_to_emissions_with_control():
    out = compute_voc_threshold(voc_content=4.0, voc_content_unit="lb/gal", usage=100.0, usage_unit="gal", control_efficiency=0.5)
    assert out["ok"] is True
    assert out["emissions"]["lb"] == 200.0  # 100 gal * 4 lb/gal * (1 - 0.5)


def test_unknown_unit():
    out = compute_voc_threshold(voc_content=1.0, voc_content_unit="furlongs")
    assert out["ok"] is False and out["error"]["code"] == "unknown_unit"


def test_bad_control_efficiency():
    out = compute_voc_threshold(voc_content=1.0, voc_content_unit="lb/gal", control_efficiency=2.0)
    assert out["ok"] is False and out["error"]["code"] == "invalid_argument"
