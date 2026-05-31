import { NextRequest, NextResponse } from "next/server";
import { runResearch } from "@/lib/research/run";

// Hold the serverless function open as long as the plan allows. Vercel REJECTS the
// deploy if this exceeds the plan's ceiling (800 failed → the plan caps lower), so we
// use 60s — the proven-good value the intake route already deploys with. The Modal
// worker itself runs up to 600s (not subject to Vercel limits); a live run that needs
// longer than the Vercel route allows is the durable Function.spawn+poll case (deferred).
export const maxDuration = 60;

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
