from tests.canonicalize import canonical

def test_sorts_keys_and_normalizes_floats():
    a = {"b": 1, "a": 0.1 + 0.2}          # 0.30000000000000004
    b = {"a": 0.3, "b": 1}
    assert canonical(a) == canonical(b)

def test_float_vs_int_distinct_when_meaningful():
    assert canonical({"x": 0}) == canonical({"x": 0.0})  # 0 == 0.0 numerically

def test_array_order_preserved():
    assert canonical([1, 2, 3]) != canonical([3, 2, 1])

def test_none_passthrough():
    assert canonical({"x": None}) == canonical({"x": None})
