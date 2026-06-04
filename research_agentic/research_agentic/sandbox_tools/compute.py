"""compute_voc_threshold — deterministic VOC/ROC permit-threshold calculator.

Ported verbatim from the parent repo's tools.compute_voc_threshold (PR #38). Pure math
(no network/filesystem): converts a mass-based rule limit (lb/period) into an equivalent
material-usage limit (gallons), or estimates emissions from usage. Runs inside the sandbox
but needs no policy.
"""

from __future__ import annotations

from typing import Any

from research_agentic.policy import _error, _invalid_argument, _success

# Exact NIST unit constants: 1 lb = 453.59237 g, 1 US gal = 3.785411784 L.
_G_PER_LB = 453.59237
_L_PER_GAL = 3.785411784
_G_PER_L_PER_LB_PER_GAL = _G_PER_LB / _L_PER_GAL  # 119.826427...

_MASS_PER_VOLUME_TO_LB_PER_GAL = {
    "lb/gal": 1.0,
    "lbs/gal": 1.0,
    "lb/gallon": 1.0,
    "g/l": 1.0 / _G_PER_L_PER_LB_PER_GAL,
    "mg/l": 0.001 / _G_PER_L_PER_LB_PER_GAL,
    "kg/l": 1000.0 / _G_PER_L_PER_LB_PER_GAL,
    "g/ml": 1000.0 / _G_PER_L_PER_LB_PER_GAL,
    "g/cm3": 1000.0 / _G_PER_L_PER_LB_PER_GAL,
    "g/cc": 1000.0 / _G_PER_L_PER_LB_PER_GAL,
}
_FRACTION_UNITS = {"weight_fraction": 1.0, "mass_fraction": 1.0, "fraction": 1.0}
_PERCENT_UNITS = {"weight_percent": 0.01, "wt%": 0.01, "wt %": 0.01, "percent": 0.01, "%": 0.01}
_GALLON_UNITS = {"gal", "gallon", "gallons", "us_gal"}
_LITER_UNITS = {"l", "liter", "liters", "litre", "litres"}


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def compute_voc_threshold(
    *,
    voc_content: float,
    voc_content_unit: str = "weight_percent",
    density: float | None = None,
    density_unit: str = "lb/gal",
    mass_limit_lb: float | None = None,
    usage: float | None = None,
    usage_unit: str = "gal",
    control_efficiency: float = 0.0,
) -> dict[str, Any]:
    if not _is_number(voc_content):
        return _invalid_argument("voc_content", "a number", voc_content)
    if not _is_number(control_efficiency):
        return _invalid_argument("control_efficiency", "a number between 0 and 1", control_efficiency)
    if control_efficiency < 0 or control_efficiency > 1:
        return _error("error", "invalid_argument", "control_efficiency must be between 0 and 1.", argument="control_efficiency")

    formula: list[str] = []
    unit = str(voc_content_unit).strip().lower()
    if unit in _MASS_PER_VOLUME_TO_LB_PER_GAL:
        voc_lb_per_gal = voc_content * _MASS_PER_VOLUME_TO_LB_PER_GAL[unit]
        formula.append(f"VOC concentration {voc_content} {voc_content_unit} = {voc_lb_per_gal:.4g} lb VOC/gal")
    elif unit in _FRACTION_UNITS or unit in _PERCENT_UNITS:
        scale = _FRACTION_UNITS.get(unit, _PERCENT_UNITS.get(unit, 1.0))
        fraction = voc_content * scale
        if not _is_number(density):
            return _error("error", "density_required",
                          "A material density is required to convert a weight fraction/percent to VOC mass per volume.",
                          argument="density")
        dunit = str(density_unit).strip().lower()
        if dunit not in _MASS_PER_VOLUME_TO_LB_PER_GAL:
            return _error("error", "unknown_unit", f"Unknown density unit: {density_unit!r}.", argument="density_unit")
        density_lb_per_gal = density * _MASS_PER_VOLUME_TO_LB_PER_GAL[dunit]
        voc_lb_per_gal = fraction * density_lb_per_gal
        formula.append(
            f"VOC mass/vol = {fraction:g} (fraction) x {density_lb_per_gal:.4g} lb/gal density = {voc_lb_per_gal:.4g} lb VOC/gal"
        )
    else:
        return _error("error", "unknown_unit", f"Unknown voc_content_unit: {voc_content_unit!r}.", argument="voc_content_unit")

    if voc_lb_per_gal <= 0:
        return _error("error", "invalid_argument", "Computed VOC mass per volume must be positive.", argument="voc_content")

    control_factor = 1.0 - control_efficiency
    effective = voc_lb_per_gal * control_factor

    result: dict[str, Any] = {
        "voc_mass_per_volume": {
            "lb_per_gal": round(voc_lb_per_gal, 4),
            "g_per_l": round(voc_lb_per_gal * _G_PER_L_PER_LB_PER_GAL, 2),
        },
        "control_efficiency": control_efficiency,
        "effective_voc_lb_per_gal": round(effective, 4),
        "inputs": {
            "voc_content": voc_content,
            "voc_content_unit": voc_content_unit,
            "density": density,
            "density_unit": density_unit if density is not None else None,
            "mass_limit_lb": mass_limit_lb,
            "usage": usage,
            "usage_unit": usage_unit if usage is not None else None,
        },
    }

    if mass_limit_lb is not None:
        if not _is_number(mass_limit_lb) or mass_limit_lb <= 0:
            return _invalid_argument("mass_limit_lb", "a positive number", mass_limit_lb)
        usage_limit_gal = mass_limit_lb / effective
        result["usage_limit"] = {"gal": round(usage_limit_gal, 2), "l": round(usage_limit_gal * _L_PER_GAL, 2)}
        ctl = f" x (1 - {control_efficiency} control)" if control_efficiency else ""
        formula.append(
            f"usage_limit = {mass_limit_lb} lb / ({voc_lb_per_gal:.4g} lb/gal{ctl}) = {usage_limit_gal:.2f} gal per period"
        )

    if usage is not None:
        if not _is_number(usage) or usage < 0:
            return _invalid_argument("usage", "a non-negative number", usage)
        uunit = str(usage_unit).strip().lower()
        if uunit in _GALLON_UNITS:
            usage_gal = float(usage)
        elif uunit in _LITER_UNITS:
            usage_gal = usage / _L_PER_GAL
        else:
            return _error("error", "unknown_unit", f"Unknown usage_unit: {usage_unit!r}.", argument="usage_unit")
        emissions_lb = usage_gal * effective
        result["emissions"] = {"lb": round(emissions_lb, 2), "usage_gal": round(usage_gal, 4)}
        ctl = f" x (1 - {control_efficiency} control)" if control_efficiency else ""
        formula.append(
            f"emissions = {usage_gal:.4g} gal x {voc_lb_per_gal:.4g} lb/gal{ctl} = {emissions_lb:.2f} lb VOC/ROC"
        )

    result["formula"] = formula
    return _success("computed", **result)
