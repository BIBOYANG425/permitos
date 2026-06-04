def test_package_and_register_import():
    import research_agentic  # noqa: F401
    from research_agentic import register  # noqa: F401
    assert research_agentic.__doc__ is not None
