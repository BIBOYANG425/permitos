import os
import pytest
from research_core.scope import parse_scope

pytestmark = pytest.mark.skipif(not os.environ.get("OPENAI_API_KEY"),
                                reason="Regime 2 is opt-in; needs OPENAI_API_KEY")

def test_complex_scope_stable_fields():
    sp = parse_scope({"project_description":
        "Adding a coating booth and storing 60 gallons of a flammable solvent at a "
        "Los Angeles County manufacturing facility."}, "eval-complex")
    assert "SCAQMD" in sp["facility"]["jurisdiction_stack"]
    kinds = [e["kind"] for e in sp["project_change"]["equipment"]]
    assert any("coat" in k.lower() or "booth" in k.lower() for k in kinds)
    chem = sp["project_change"]["chemicals"][0]
    assert chem["quantity"] == 60 and str(chem["unit"]).lower().startswith("gal")
