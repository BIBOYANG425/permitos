import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import type { ResearchHypothesis, ResearchTask } from "../../types";
import { __setSpawnForTests, runModalResearchPool } from "../runModalPool";

// We inject a fake spawn into runModalPool via __setSpawnForTests so the
// test never touches the real `modal` CLI. (vi.mock of node:child_process
// did not reach the source module under this vitest config, so we use an
// explicit DI seam instead.)

type FakeChild = ChildProcess & { __finish: (code: number) => void };

function makeFakeChild(stdoutChunks: string[], stderr = ""): FakeChild {
  const emitter = new EventEmitter() as unknown as FakeChild;
  const stdout = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  Object.assign(emitter, {
    stdout,
    stderr: stderrEmitter,
    kill: () => {},
  });

  emitter.__finish = (code: number) => {
    setTimeout(() => {
      for (const chunk of stdoutChunks) {
        stdout.emit("data", Buffer.from(chunk, "utf8"));
      }
      if (stderr) {
        stderrEmitter.emit("data", Buffer.from(stderr, "utf8"));
      }
      emitter.emit("close", code, null);
    }, 0);
  };
  return emitter;
}

function bundleLine(hypothesisId: string): string {
  const bundle = {
    hypothesis_id: hypothesisId,
    sources: [
      {
        url: "https://example.test/source",
        source_name: "Test Source",
        authority_rank: 1,
        fetched_at: "2026-05-30T00:00:00Z",
        content_hash: "sha256:test",
        effective_date: null,
        quote: "Test quote.",
      },
    ],
    extracted_claims: [
      {
        field: "test_field",
        value: "test_value",
        source_url: "https://example.test/source",
        quote: "Test quote.",
        confidence: 0.9,
      },
    ],
    researcher_conclusion: "applies",
    uncertainties: [],
  };
  return `PERMITPILOT_BUNDLE_JSON ${JSON.stringify(bundle)}\n`;
}

const tasks: ResearchTask[] = [
  {
    task_id: "T-1",
    hypothesis_id: "H-AIR-201",
    assigned_agent: "modal-worker",
    allowed_tools: [],
    blocked_tools: [],
    budget: { max_sources: 1, max_runtime_seconds: 30, max_model_calls: 1 },
  },
  {
    task_id: "T-2",
    hypothesis_id: "H-AIR-219",
    assigned_agent: "modal-worker",
    allowed_tools: [],
    blocked_tools: [],
    budget: { max_sources: 1, max_runtime_seconds: 30, max_model_calls: 1 },
  },
];

const hypotheses: ResearchHypothesis[] = [
  {
    id: "H-AIR-201",
    angle_id: "A-1",
    family: "air",
    question: "?",
    required_facts: [],
    expected_source_type: "regulation",
    success_criteria: [],
    dependencies: [],
  },
  {
    id: "H-AIR-219",
    angle_id: "A-1",
    family: "air",
    question: "?",
    required_facts: [],
    expected_source_type: "regulation",
    success_criteria: [],
    dependencies: [],
  },
];

describe("runModalResearchPool", () => {
  afterEach(() => {
    __setSpawnForTests(null);
  });

  it("spawns modal run with the expected argv shape and parses the marker line", async () => {
    const seen: Array<{ cmd: string; argv: readonly string[] }> = [];
    const fakeSpawn = vi.fn((cmd: string, argv: readonly string[]) => {
      seen.push({ cmd, argv });
      const spec = JSON.parse(argv[3]);
      const child = makeFakeChild([
        "Initialized.\n",
        "Created objects.\n",
        bundleLine(spec.hypothesis_id),
      ]);
      child.__finish(0);
      return child as unknown as ChildProcess;
    });
    __setSpawnForTests(fakeSpawn);

    const result = await runModalResearchPool(tasks, hypotheses);

    expect(fakeSpawn).toHaveBeenCalledTimes(2);
    for (const { cmd, argv } of seen) {
      expect(cmd).toBe("modal");
      expect(argv[0]).toBe("run");
      expect(argv[1]).toBe("src/lib/research/modal/worker.py");
      expect(argv[2]).toBe("--task-json");
      const spec = JSON.parse(argv[3]);
      expect(spec).toHaveProperty("task_id");
      expect(spec).toHaveProperty("hypothesis_id");
    }

    expect(result).toHaveLength(2);
    expect(result.map((b) => b.hypothesis_id).sort()).toEqual(["H-AIR-201", "H-AIR-219"]);
    expect(result.every((b) => b.sources.length === 1)).toBe(true);
    expect(result.every((b) => b.extracted_claims.length === 1)).toBe(true);
  });

  it("returns a needs_review failure bundle when modal CLI exits non-zero", async () => {
    __setSpawnForTests(() => {
      const child = makeFakeChild(["no marker here\n"], "boom: auth error\n");
      child.__finish(1);
      return child as unknown as ChildProcess;
    });

    const result = await runModalResearchPool(tasks.slice(0, 1), hypotheses.slice(0, 1));

    expect(result).toHaveLength(1);
    expect(result[0].hypothesis_id).toBe("H-AIR-201");
    expect(result[0].researcher_conclusion).toBe("needs_review");
    expect(result[0].uncertainties.join(" ")).toMatch(/modal CLI failed/);
  });
});
