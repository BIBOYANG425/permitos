import { NextRequest, NextResponse } from "next/server";
import { runResearch } from "@/lib/research/run";

// All-reasoning research runs are slow (multi-turn reasoning per task). Hold the
// serverless function open as long as the platform allows. 800 is Vercel's fluid-
// compute ceiling; plans without it are clamped down automatically. A run that needs
// longer than the platform allows is the durable Function.spawn+poll case (deferred).
export const maxDuration = 800;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      project_description?: string;
      demo_documents?: Array<{ name: string; type: string; text: string }>;
    };

    const run = await runResearch({
      project_description: body.project_description ?? "",
      demo_documents: body.demo_documents ?? []
    });

    return NextResponse.json(run);
  } catch (error) {
    return NextResponse.json(
      {
        run_id: "run_failed",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown research run failure"
      },
      { status: 500 }
    );
  }
}
