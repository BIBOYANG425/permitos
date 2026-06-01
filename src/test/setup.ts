import "@testing-library/jest-dom/vitest";

// Default the whole suite to deterministic fixture research so tests never depend
// on an ambient OPENAI_API_KEY or make real network calls. Tests that exercise the
// live/modal routing override process.env.RESEARCH_MODE locally.
process.env.RESEARCH_MODE = "fixture";
