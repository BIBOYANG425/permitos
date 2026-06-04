def test_build_sandbox_image_returns_image():
    import modal

    from research_agentic.sandbox import build_sandbox_image

    image = build_sandbox_image()
    assert isinstance(image, modal.Image)
