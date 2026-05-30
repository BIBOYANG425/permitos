import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatMessage, IntakeFacts } from "@/lib/intake/types";
import { INTAKE_SYSTEM_PROMPT, SUBMIT_INTAKE_TOOL } from "@/lib/intake/prompt";
import { composeProjectDescription } from "@/lib/intake/compose";
import { followUpForMissing, isIntakeComplete } from "@/lib/intake/complete";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 503 });
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = (await request.json()) as { messages?: ChatMessage[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = body.messages ?? [];
  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_INTAKE_MODEL ?? "gpt-4o-mini";

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "system", content: INTAKE_SYSTEM_PROMPT }, ...messages],
      tools: [SUBMIT_INTAKE_TOOL],
      tool_choice: "auto",
    });

    const choice = completion.choices[0]?.message;
    const toolCall = choice?.tool_calls?.[0];

    if (toolCall && toolCall.type === "function" && toolCall.function.name === "submit_intake") {
      const facts = JSON.parse(toolCall.function.arguments || "{}") as IntakeFacts;
      const completeness = isIntakeComplete(facts);
      if (!completeness.complete) {
        // Reject early completion — keep asking until the gate passes.
        return NextResponse.json({ complete: false, message: followUpForMissing(completeness.missing) });
      }
      const project_description = composeProjectDescription(facts);
      return NextResponse.json({ complete: true, project_description, facts });
    }

    return NextResponse.json({
      complete: false,
      message: choice?.content ?? "Could you tell me a bit more about the project?",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Intake chat failed" },
      { status: 502 },
    );
  }
}
