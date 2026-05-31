import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { IntakeFacts } from "@/lib/intake/types";
import { INTAKE_SYSTEM_PROMPT, SUBMIT_INTAKE_TOOL } from "@/lib/intake/prompt";
import { composeProjectDescription } from "@/lib/intake/compose";
import { followUpForMissing, isIntakeComplete } from "@/lib/intake/complete";

// The OpenAI call grows slower as the conversation history grows; the default
// ~10s function budget was timing out on later turns, returning a platform HTML
// error page (which broke the client's JSON parse). Give it real headroom.
export const runtime = "nodejs";
export const maxDuration = 60;

const OPENAI_TIMEOUT_MS = 25_000;
const MAX_MESSAGES = 30;
const MAX_CONTENT_CHARS = 4000;
const MAX_TOTAL_CHARS = 16000;
const DEFAULT_FOLLOWUP = "Could you tell me a bit more about the project?";

type ClientMessage = { role: "user" | "assistant"; content: string };

function sanitizeMessages(input: unknown): ClientMessage[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length > MAX_MESSAGES) return null;
  const out: ClientMessage[] = [];
  let total = 0;
  for (const m of input) {
    if (!m || typeof m !== "object") return null;
    const obj = m as { role?: unknown; content?: unknown };
    if (typeof obj.content !== "string") return null;
    if (obj.content.length > MAX_CONTENT_CHARS) return null;
    total += obj.content.length;
    if (total > MAX_TOTAL_CHARS) return null;
    // Drop system/tool roles silently — only trust the server's INTAKE_SYSTEM_PROMPT.
    if (obj.role !== "user" && obj.role !== "assistant") continue;
    out.push({ role: obj.role, content: obj.content });
  }
  return out;
}

function validateIntakeFacts(raw: unknown): IntakeFacts | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.project_change !== undefined && typeof r.project_change !== "string") return null;
  if (r.address !== undefined && typeof r.address !== "string") return null;
  if (r.naics !== undefined && r.naics !== null && typeof r.naics !== "string") return null;
  if (r.sic !== undefined && r.sic !== null && typeof r.sic !== "string") return null;
  if (r.notes !== undefined && typeof r.notes !== "string") return null;
  if (r.disturbance_acres !== undefined && r.disturbance_acres !== null && typeof r.disturbance_acres !== "number") return null;
  if (r.process_discharge !== undefined && r.process_discharge !== null && typeof r.process_discharge !== "boolean") return null;
  if (r.jurisdiction_stack !== undefined) {
    if (!Array.isArray(r.jurisdiction_stack)) return null;
    if (!r.jurisdiction_stack.every((s) => typeof s === "string")) return null;
  }
  if (r.equipment !== undefined) {
    if (!Array.isArray(r.equipment)) return null;
    for (const e of r.equipment) {
      if (!e || typeof e !== "object") return null;
      if (typeof (e as { kind?: unknown }).kind !== "string") return null;
    }
  }
  if (r.chemicals !== undefined) {
    if (!Array.isArray(r.chemicals)) return null;
    for (const c of r.chemicals) {
      if (!c || typeof c !== "object") return null;
      if (typeof (c as { name?: unknown }).name !== "string") return null;
    }
  }
  if (r.waste_streams !== undefined) {
    if (!Array.isArray(r.waste_streams)) return null;
    for (const w of r.waste_streams) {
      if (!w || typeof w !== "object") return null;
      if (typeof (w as { description?: unknown }).description !== "string") return null;
    }
  }
  return r as IntakeFacts;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // 500: permanent server misconfiguration (not transient overload).
    return NextResponse.json({ error: "Intake unavailable: server misconfiguration" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = sanitizeMessages((body as { messages?: unknown } | null)?.messages ?? []);
  if (messages === null) {
    return NextResponse.json({ error: "Invalid messages payload" }, { status: 400 });
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_INTAKE_MODEL ?? "gpt-4o-mini";

  // Abort a slow upstream call before the platform hard-kills the function, so
  // the caller always gets a JSON error rather than an HTML timeout page.
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), OPENAI_TIMEOUT_MS);
  try {
    const completion = await client.chat.completions.create(
      {
        model,
        // Server-owned system prompt is the ONLY trusted system message.
        messages: [{ role: "system", content: INTAKE_SYSTEM_PROMPT }, ...messages],
        tools: [SUBMIT_INTAKE_TOOL],
        tool_choice: "auto",
        max_tokens: 800,
      },
      { signal: ac.signal },
    );

    const choice = completion.choices[0]?.message;
    const toolCall = choice?.tool_calls?.[0];

    if (toolCall && toolCall.type === "function" && toolCall.function.name === "submit_intake") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        // Malformed LLM tool args → ask for more detail, don't 502.
        return NextResponse.json({ complete: false, message: DEFAULT_FOLLOWUP });
      }
      const facts = validateIntakeFacts(parsed);
      if (!facts) {
        return NextResponse.json({ complete: false, message: DEFAULT_FOLLOWUP });
      }
      const completeness = isIntakeComplete(facts);
      if (!completeness.complete) {
        return NextResponse.json({ complete: false, message: followUpForMissing(completeness.missing) });
      }
      const project_description = composeProjectDescription(facts);
      return NextResponse.json({ complete: true, project_description, facts });
    }

    return NextResponse.json({
      complete: false,
      message: choice?.content ?? DEFAULT_FOLLOWUP,
    });
  } catch (error) {
    // Log full error server-side, return generic message to the unauthenticated caller.
    console.error("Intake chat upstream error:", error);
    return NextResponse.json({ error: "Intake chat failed" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
