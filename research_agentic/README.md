# research_agentic

AIQ-native open-discovery EHS research core (sub-project E). Phase 1 builds the sandbox + tools foundation: a `modal.Sandbox` provisioning layer, a mechanical safety policy (SSRF guard, path guard, output cap), and the 10-tool open-discovery suite (web fetch, web search, PDF/DOCX/spreadsheet readers, VOC calculator, artifact writer, finding submitter, browser, skill reader) executed inside the sandbox via a CLI dispatcher and registered as AIQ functions. Phases 2–4 add the researcher agent, orchestration, and eval. Run the offline unit-test suite with:

```
python -m pytest tests/ -q
```
