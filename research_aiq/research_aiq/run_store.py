"""In-process, run-scoped store. The supervisor runs in one local process, so a
module-level store keyed by run_id is sufficient. spawn_researchers writes
gathered bundles here; finalize reads them.

run_id flows to the agent's tools via TWO mechanisms:
- a contextvar (set_run_id / current_run_id) — convenient, but it does NOT survive
  langgraph's forked execution contexts. langgraph runs the tool_calling_agent and
  its tool nodes in COPIED contexts captured before our code mutates the var, so a
  ContextVar.set() made inside one step is invisible inside a sibling/child step.
- a plain process-global (set_active_run_id / get_active_run_id) — survives ANY
  async-context or task boundary because it is module state, not context state.
  The `orchestrate` function sets this fresh at the start of each run (in its own
  coroutine, after reading run_id from the plan output), so it is the load-bearing
  carrier that reaches spawn_researchers. ASSUMES ONE ACTIVE RUN PER PROCESS at a
  time (true for `nat run` and sequential `nat eval --reps`)."""
from __future__ import annotations

import contextvars

_run_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "research_aiq_run_id", default=None
)

# Process-global run_id (NOT a contextvar) — survives langgraph context forks.
_active_run_id: str | None = None


def set_run_id(run_id: str):
    return _run_id_var.set(run_id)


def current_run_id() -> str | None:
    return _run_id_var.get()


def set_active_run_id(run_id: str | None) -> None:
    """Set the process-global active run_id. Survives any async-context/task boundary.

    Assumes a single active run per process at a time (one run_id live at once).
    """
    global _active_run_id
    _active_run_id = run_id


def get_active_run_id() -> str | None:
    return _active_run_id


class RunStore:
    def __init__(self) -> None:
        self._runs: dict[str, dict] = {}

    def init(
        self, run_id: str, scope: dict, candidates: list[dict], tasks: list[dict] | None = None
    ) -> None:
        # `tasks` are the planner's research_tasks (one per candidate). spawn_researchers
        # forwards the task_spec for each investigated id to the Modal worker, which
        # consumes the full spec (hypothesis_id + allowed_tools + budget). Optional so
        # existing callers/tests that only seed candidates keep working.
        self._runs[run_id] = {
            "scope": scope,
            "candidates": candidates,
            "tasks": {t["hypothesis_id"]: t for t in (tasks or [])},
            "bundles": {},
            "notes": [],
        }

    def add_bundles(self, run_id: str, bundles: list[dict]) -> None:
        store = self._runs[run_id]["bundles"]
        for b in bundles:
            store[b["hypothesis_id"]] = b  # last write wins (dedupe)

    def bundles(self, run_id: str) -> list[dict]:
        return list(self._runs[run_id]["bundles"].values())

    def investigated_ids(self, run_id: str) -> list[str]:
        return list(self._runs[run_id]["bundles"].keys())

    def scope(self, run_id: str) -> dict:
        return self._runs[run_id]["scope"]

    def candidates(self, run_id: str) -> list[dict]:
        return self._runs[run_id]["candidates"]

    def task_for(self, run_id: str, hypothesis_id: str) -> dict:
        """The planner's research_task (Modal task_spec) for a hypothesis.

        Falls back to a minimal {"hypothesis_id": ...} spec when no task was seeded
        (e.g. tests that only seed candidates) — the worker still needs the id.
        """
        tasks = self._runs[run_id].get("tasks", {})
        return tasks.get(hypothesis_id, {"hypothesis_id": hypothesis_id})

    def add_note(self, run_id: str, note: str) -> None:
        self._runs[run_id]["notes"].append(note)

    def notes(self, run_id: str) -> list[str]:
        return list(self._runs[run_id]["notes"])


STORE = RunStore()  # module singleton
