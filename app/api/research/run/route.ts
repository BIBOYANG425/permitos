import { NextRequest, NextResponse } from "next/server";
import { buildScope } from "@/lib/research/buildScope";
import { assertConfigured, runResearch } from "@/lib/research/orchestrateClient";

// Hold the serverless function open as long as the Vercel plan allows (60s — the proven
// value the intake route deploys with). The orchestrate Modal endpoint itself runs up to
// 600s (not subject to Vercel limits). A run that needs longer than the Vercel route
// allows is a future durable Function.spawn+poll case (out of scope for this cutover).
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      project_description?: string;
      demo_documents?: Array<{ name: string; type: string; text: string }>;
    };

    // Fail fast: if the research backend isn't configured, surface it BEFORE doing any
    // external work (buildScope makes an OpenAI intake call). The catch below turns this
    // into a 500 with a clear message — no silent fixture fallback.
    assertConfigured();

    // Intake stays in Node: extract the scope (+ SDS review) here, then hand the scope to
    // the Python orchestrate endpoint. sds_reviews are computed Node-side and merged back
    // (the agentic tier does not produce them) so the SDS UI keeps working.
    const { scope, sds_reviews } = await buildScope({
      project_description: body.project_description ?? "",
      demo_documents: body.demo_documents ?? [],
    });

    const run = await runResearch(scope);
    run.sds_reviews = sds_reviews;

    return NextResponse.json(run);
  } catch (error) {
    // Fail-loud: a missing/unreachable endpoint or a non-2xx response surfaces a clear
    // error to the client (no silent fixture fallback). The UI store throws on !res.ok.
    return NextResponse.json(
      {
        run_id: "run_failed",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown research run failure",
      },
      { status: 500 },
    );
  }
}
