# "Agents Working" Sandbox Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the conversational intake, show a marvis-style "control room" grid of Modal-sandbox worker tiles that animate off the existing replay timeline (building to the HMBP fail→repair beat), then hand off to the team's React Flow graph.

**Architecture:** On the team's `main` UI (Zustand `useStore` + `useReplay`). A ported full-screen `IntakeChat` calls `useStore().startRun({ project_description })`; while `run && !replayDone` the center pane shows a new `SandboxGrid` derived purely from `deriveSandboxTiles(run, replayedEventIds)`; on `replayDone` it swaps to the existing `ResearchGraph`. No backend change — tiles are a derived illustration.

**Tech Stack:** Next.js 15 (App Router, pnpm), TypeScript, Tailwind v4, Zustand, OpenAI Node SDK, vitest. Base branch: `feat/agents-working` off `origin/main`.

**Spec:** `docs/superpowers/specs/2026-05-30-agents-working-sandbox-grid-design.md`

---

## File Structure

- Modify: `package.json` / `pnpm-lock.yaml` — add `openai`.
- Port (verbatim from `feat/intake-chat`): `src/lib/intake/{types,prompt,compose,complete}.ts` (+ `compose.test.ts`, `complete.test.ts`) and `app/api/intake/chat/route.ts`.
- Create: `src/lib/ui/sandboxState.ts` — `deriveSandboxTiles` (pure, tested).
- Test: `src/lib/ui/__tests__/sandboxState.test.ts`.
- Create: `app/components/SandboxGrid.tsx` — the grid presentation.
- Create: `app/components/IntakeChat.tsx` — full-screen intake, retargeted to `useStore().startRun`.
- Modify: `app/page.tsx` — intake → grid → graph phase gate.

### Task 1: Add the OpenAI SDK

**Files:** `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install**

```bash
cd /Users/mac/Documents/antler
pnpm add openai
```

Expected: `openai` in `dependencies`, lockfile updated.

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add openai sdk for intake chat"
```

### Task 2: Port the intake engine (verbatim from feat/intake-chat)

**Files:** `src/lib/intake/{types,prompt,compose,complete}.ts` (+ tests), `app/api/intake/chat/route.ts`

These files are UI-independent and were already built + tested on `feat/intake-chat`. Bring them over unchanged.

- [ ] **Step 1: Check out the intake files from the other branch**

```bash
cd /Users/mac/Documents/antler
git checkout feat/intake-chat -- src/lib/intake app/api/intake/chat/route.ts
```

Expected: `src/lib/intake/types.ts`, `prompt.ts`, `compose.ts`, `compose.test.ts`, `complete.ts`, `complete.test.ts`, and `app/api/intake/chat/route.ts` now exist.

- [ ] **Step 2: Run the ported tests**

```bash
cd /Users/mac/Documents/antler
pnpm vitest run src/lib/intake
```

Expected: 8 tests pass (3 compose + 5 complete).

- [ ] **Step 3: Commit**

```bash
git add src/lib/intake app/api/intake/chat/route.ts
git commit -m "feat: port OpenAI intake engine (route + lib) onto team UI base"
```

### Task 3: deriveSandboxTiles (TDD)

**Files:**
- Create: `src/lib/ui/sandboxState.ts`
- Test: `src/lib/ui/__tests__/sandboxState.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ui/__tests__/sandboxState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runResearch } from "@/lib/research/run";
import { deriveSandboxTiles } from "@/lib/ui/sandboxState";
import type { ResearchRun } from "@/lib/research/types";

const SOCAL =
  "A Los Angeles County manufacturer is adding a coating booth and storing 60 gallons of a new flammable solvent.";

function eventIds(run: ResearchRun, predicate: (e: ResearchRun["trace_events"][number]) => boolean) {
  return new Set(run.trace_events.filter(predicate).map((e) => e.id));
}

describe("deriveSandboxTiles", () => {
  it("starts every active worker tile as queued before replay", async () => {
    const run = await runResearch({ project_description: SOCAL, demo_documents: [] });
    const tiles = deriveSandboxTiles(run, new Set());
    const active = tiles.filter((t) => t.active);
    expect(active.length).toBe(run.research_tasks.length);
    expect(active.every((t) => t.status === "queued")).toBe(true);
  });

  it("shows workers fetching once fanout is running but not done", async () => {
    const run = await runResearch({ project_description: SOCAL, demo_documents: [] });
    const ids = eventIds(run, (e) => e.actor === "research_pool" && e.phase === "fanout" && e.status === "running");
    const tiles = deriveSandboxTiles(run, ids);
    expect(tiles.some((t) => t.active && t.status === "fetching")).toBe(true);
  });

  it("resolves every active tile to a terminal status when fully replayed", async () => {
    const run = await runResearch({ project_description: SOCAL, demo_documents: [] });
    const all = new Set(run.trace_events.map((e) => e.id));
    const tiles = deriveSandboxTiles(run, all);
    const terminal = ["verified", "repaired", "needs_review", "failed"];
    expect(tiles.filter((t) => t.active).every((t) => terminal.includes(t.status))).toBe(true);
  });

  it("marks a repaired hypothesis tile as repaired when fully replayed", async () => {
    const run = await runResearch({ project_description: SOCAL, demo_documents: [] });
    const all = new Set(run.trace_events.map((e) => e.id));
    const tiles = deriveSandboxTiles(run, all);
    const repairedHyp = new Set(run.repair_tickets.map((r) => r.hypothesis_id));
    // every task whose hypothesis had a repair ticket and ultimately passed reads as "repaired"
    for (const task of run.research_tasks) {
      if (!repairedHyp.has(task.hypothesis_id)) continue;
      const verdict = run.verification_verdicts.find((v) => v.hypothesis_id === task.hypothesis_id);
      if (verdict?.verdict !== "pass") continue;
      const tile = tiles.find((t) => t.id === task.task_id);
      expect(tile?.status).toBe("repaired");
    }
  });

  it("includes muted tiles for coverage families with no worker", async () => {
    const run = await runResearch({ project_description: SOCAL, demo_documents: [] });
    const tiles = deriveSandboxTiles(run, new Set());
    const muted = tiles.filter((t) => !t.active);
    // every muted tile maps to a coverage family that has no research task
    const familiesWithTask = new Set(
      run.research_tasks.map((task) => run.research_graph.find((h) => h.id === task.hypothesis_id)?.family),
    );
    expect(muted.every((t) => !familiesWithTask.has(t.family))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/mac/Documents/antler
pnpm vitest run src/lib/ui/__tests__/sandboxState.test.ts
```

Expected: FAIL — module `@/lib/ui/sandboxState` has no export `deriveSandboxTiles`.

- [ ] **Step 3: Implement**

Create `src/lib/ui/sandboxState.ts`:

```ts
import type { CoverageFamily, ResearchRun } from "@/lib/research/types";

export type SandboxStatus =
  | "queued"
  | "booting"
  | "fetching"
  | "verifying"
  | "verified"
  | "failed"
  | "repairing"
  | "repaired"
  | "needs_review"
  | "out_of_scope";

export type SandboxTile = {
  id: string;
  family: CoverageFamily;
  label: string;
  status: SandboxStatus;
  active: boolean;
};

function fired(
  run: ResearchRun,
  ids: Set<string>,
  actor: string,
  phase: string,
  status: string,
): boolean {
  return run.trace_events.some(
    (e) => e.actor === actor && e.phase === phase && e.status === status && ids.has(e.id),
  );
}

export function deriveSandboxTiles(run: ResearchRun, replayedEventIds: Set<string>): SandboxTile[] {
  const ids = replayedEventIds;
  const fanoutRunning = fired(run, ids, "research_pool", "fanout", "running");
  const fanoutDone = fired(run, ids, "research_pool", "fanout", "done");
  const failFired = fired(run, ids, "verifier", "verification", "failed");
  const repairResolved =
    fired(run, ids, "verifier", "repair_verification", "done") ||
    fired(run, ids, "verifier", "repair_verification", "needs_review") ||
    fired(run, ids, "synthesis_agent", "matrix", "done");

  const hypById = new Map(run.research_graph.map((h) => [h.id, h]));
  const verdictByHyp = new Map(run.verification_verdicts.map((v) => [v.hypothesis_id, v]));
  const repairHyp = new Set(run.repair_tickets.map((r) => r.hypothesis_id));
  const familiesWithTask = new Set<CoverageFamily>();

  const activeTiles: SandboxTile[] = run.research_tasks.map((task) => {
    const hyp = hypById.get(task.hypothesis_id);
    const family = (hyp?.family ?? "air") as CoverageFamily;
    familiesWithTask.add(family);

    const hasRepair = repairHyp.has(task.hypothesis_id);
    const verdict = verdictByHyp.get(task.hypothesis_id);
    const terminal: SandboxStatus =
      verdict?.verdict === "pass"
        ? hasRepair
          ? "repaired"
          : "verified"
        : verdict?.verdict === "needs_review"
          ? "needs_review"
          : verdict?.verdict === "fail"
            ? "failed"
            : "needs_review";

    let status: SandboxStatus;
    if (!fanoutRunning) status = "queued";
    else if (!fanoutDone) status = "fetching";
    else if (!repairResolved) status = hasRepair && failFired ? "repairing" : "verifying";
    else status = terminal;

    return { id: task.task_id, family, label: hyp?.question ?? family, status, active: true };
  });

  const mutedTiles: SandboxTile[] = run.coverage_family_statuses
    .filter((cf) => !familiesWithTask.has(cf.family))
    .map((cf) => ({
      id: cf.id,
      family: cf.family,
      label: cf.reason,
      status: (cf.status === "out_of_scope" ? "out_of_scope" : "needs_review") as SandboxStatus,
      active: false,
    }));

  return [...activeTiles, ...mutedTiles];
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd /Users/mac/Documents/antler
pnpm vitest run src/lib/ui/__tests__/sandboxState.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/sandboxState.ts src/lib/ui/__tests__/sandboxState.test.ts
git commit -m "feat: deriveSandboxTiles for the agents-working grid"
```

### Task 4: SandboxGrid component

**Files:** Create `app/components/SandboxGrid.tsx`

- [ ] **Step 1: Create the grid**

Create `app/components/SandboxGrid.tsx`:

```tsx
"use client";

import { useStore } from "@/lib/ui/store";
import { deriveSandboxTiles, type SandboxStatus } from "@/lib/ui/sandboxState";

const STATUS_META: Record<SandboxStatus, { label: string; cls: string }> = {
  queued: { label: "queued", cls: "border-slate-700 text-slate-500" },
  booting: { label: "booting sandbox", cls: "border-sky-700 text-sky-300 animate-pulse" },
  fetching: { label: "fetching source", cls: "border-sky-700 text-sky-300 animate-pulse" },
  verifying: { label: "verifying", cls: "border-indigo-700 text-indigo-300 animate-pulse" },
  verified: { label: "verified", cls: "border-emerald-700 text-emerald-300" },
  failed: { label: "verifier rejected", cls: "border-red-700 text-red-300" },
  repairing: { label: "repairing", cls: "border-orange-600 text-orange-300 animate-pulse" },
  repaired: { label: "repaired ✓", cls: "border-emerald-700 text-emerald-300" },
  needs_review: { label: "needs review", cls: "border-amber-700 text-amber-300" },
  out_of_scope: { label: "out of scope", cls: "border-slate-800 text-slate-600 opacity-60" },
};

export function SandboxGrid() {
  const run = useStore((s) => s.run);
  const replayedEventIds = useStore((s) => s.replayedEventIds);
  if (!run) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Launching research swarm…
      </div>
    );
  }

  const tiles = deriveSandboxTiles(run, replayedEventIds);
  const workers = tiles.filter((t) => t.active).length;

  return (
    <div className="h-full overflow-auto p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Modal sandboxes · {workers} workers spawned
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {tiles.map((tile) => {
          const meta = STATUS_META[tile.status];
          return (
            <div
              key={tile.id}
              className={`rounded border-l-4 bg-slate-900 p-3 transition-colors ${meta.cls}`}
            >
              <div className="text-xs font-semibold uppercase tracking-wide">{tile.family}</div>
              <div className="mt-1 text-[11px] text-slate-400 line-clamp-2">{tile.label}</div>
              <div className="mt-2 text-xs font-medium">{meta.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + commit**

```bash
cd /Users/mac/Documents/antler
pnpm build
git add app/components/SandboxGrid.tsx
git commit -m "feat: SandboxGrid control-room view"
```

Expected: build succeeds.

### Task 5: IntakeChat component (retargeted to the store)

**Files:** Create `app/components/IntakeChat.tsx`

- [ ] **Step 1: Create the intake chat**

Create `app/components/IntakeChat.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/ui/store";
import type { ChatMessage, IntakeChatResponse } from "@/lib/intake/types";

type Props = {
  onStarted: () => void;
  onSkip: () => void;
};

export function IntakeChat({ onStarted, onSkip }: Props) {
  const startRun = useStore((s) => s.startRun);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  async function send(history: ChatMessage[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/intake/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = (await res.json()) as IntakeChatResponse | { error: string };
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Intake failed");
      }
      if (data.complete) {
        onStarted();
        void startRun({ project_description: data.project_description, demo_documents: [] });
        return;
      }
      setMessages([...history, { role: "assistant", content: data.message }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Intake failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void send([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    setInput("");
    void send(history);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 p-3">
          <h1 className="text-sm font-semibold uppercase tracking-wide text-slate-400">EHS Intake</h1>
          <button type="button" onClick={onSkip} className="text-xs text-slate-400 hover:text-slate-100">
            Skip to manual entry
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages
            .filter((message) => message.role !== "system")
            .map((message, index) => (
              <div key={index} className={message.role === "user" ? "text-right" : "text-left"}>
                <span
                  className={`inline-block rounded px-3 py-2 text-sm ${
                    message.role === "user" ? "bg-emerald-700" : "bg-slate-800"
                  }`}
                >
                  {message.content}
                </span>
              </div>
            ))}
          {busy && <p className="text-xs text-slate-500">thinking…</p>}
          {error && (
            <div className="rounded bg-red-900/50 p-2 text-xs text-red-200">
              {error}{" "}
              <button type="button" onClick={onSkip} className="underline">
                Use manual entry instead
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-2 border-t border-slate-800 p-3">
          <input
            className="flex-1 rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
            placeholder="Type your answer…"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSend();
            }}
            disabled={busy}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || input.trim().length === 0}
            className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify build + commit**

```bash
cd /Users/mac/Documents/antler
pnpm build
git add app/components/IntakeChat.tsx
git commit -m "feat: IntakeChat wired to store.startRun"
```

Expected: build succeeds.

### Task 6: Phase gate in page.tsx

**Files:** Modify `app/page.tsx`

- [ ] **Step 1: Read the current page**

```bash
cd /Users/mac/Documents/antler
cat app/page.tsx
```

It renders (from the team): `Header`, `InputPanel`, `ResearchGraph` (center), `SidePanel`, `EvidenceDrawer`, `BottomPanel`, and calls `useReplay()`.

- [ ] **Step 2: Replace `app/page.tsx` with the phased version**

Replace the entire contents of `app/page.tsx` with:

```tsx
"use client";
import { useState } from "react";
import { Header } from "./components/Header";
import { InputPanel } from "./components/InputPanel";
import { ResearchGraph } from "./components/ResearchGraph";
import { SidePanel } from "./components/SidePanel";
import { BottomPanel } from "./components/BottomPanel";
import { EvidenceDrawer } from "./components/EvidenceDrawer";
import { SandboxGrid } from "./components/SandboxGrid";
import { IntakeChat } from "./components/IntakeChat";
import { useReplay } from "@/lib/ui/useReplay";
import { useStore } from "@/lib/ui/store";

export default function Page() {
  useReplay();
  const run = useStore((s) => s.run);
  const replayDone = useStore((s) => s.replayDone);
  const [showIntake, setShowIntake] = useState(true);

  if (showIntake) {
    return <IntakeChat onStarted={() => setShowIntake(false)} onSkip={() => setShowIntake(false)} />;
  }

  const showGrid = run !== null && !replayDone;

  return (
    <div className="grid grid-rows-[auto_1fr_auto] h-screen bg-slate-950 text-slate-100">
      <Header />
      <div className="grid grid-cols-[320px_minmax(0,1fr)_360px] overflow-hidden relative">
        <InputPanel />
        <main className="relative overflow-hidden">
          {showGrid ? <SandboxGrid /> : <ResearchGraph />}
        </main>
        <SidePanel />
        <EvidenceDrawer />
      </div>
      <BottomPanel />
    </div>
  );
}
```

- [ ] **Step 3: Verify build + full test suite**

```bash
cd /Users/mac/Documents/antler
pnpm build
pnpm test
```

Expected: build succeeds; the team's existing tests plus the ported intake tests and the new `sandboxState` tests all pass.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: intake -> sandbox grid -> research graph phase gate"
```

### Task 7: Manual QA

- [ ] **Step 1: With an OpenAI key**

```bash
cd /Users/mac/Documents/antler
# OPENAI_API_KEY set in env
pnpm build && pnpm start -p 3010
```
Open `http://localhost:3010`:
- App opens to the intake chat.
- After enough answers, the chat triggers the run; the center pane shows the sandbox grid with tiles animating booting → fetching → verifying → verified, HMBP visibly repairing → repaired.
- When replay finishes, the React Flow graph takes over; matrix rows + evidence drawer work.

- [ ] **Step 2: Without a key (fallback)**

```bash
cd /Users/mac/Documents/antler
env -u OPENAI_API_KEY pnpm start -p 3011
```
- The intake chat shows an error banner with "Use manual entry instead".
- Clicking it (or "Skip to manual entry") reveals the team's `InputPanel`; clicking a scenario button runs the engine and the sandbox grid → graph flow still plays.

(No commit — verification only.)

## Self-Review

**Spec coverage:**
- Sandbox grid visual → Task 3 (`deriveSandboxTiles`) + Task 4 (`SandboxGrid`).
- Three-phase flow (intake → grid → graph) → Task 6 (`showIntake` + `showGrid`).
- Intake calls `store.startRun` → Task 5 (`IntakeChat`).
- Intake engine + completeness gate reused → Task 2 (port).
- Derived illustration, no backend change → Task 3 (pure function over `run` + `replayedEventIds`).
- No-key fallback to manual entry → Task 5 (`onSkip`) + Task 6 (`InputPanel` shown) + Task 7 Step 2.
- Testing (sandboxState unit + ported intake + team suite green) → Task 3, Task 6 Step 3.

**Placeholder scan:** every code step contains the full file or exact commands. The intake engine is ported verbatim (Task 2) rather than re-pasted.

**Type consistency:** `SandboxTile` / `SandboxStatus` defined in Task 3 are consumed in Task 4. `IntakeChat` props `{ onStarted, onSkip }` (Task 5) match the call site in Task 6. `useStore().startRun({ project_description, demo_documents })` matches the team store's `startRun(payload: ResearchRunInput)` and `ResearchRunInput` shape. `ChatMessage` / `IntakeChatResponse` come from the ported `src/lib/intake/types.ts`.
