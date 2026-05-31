import { NextRequest, NextResponse } from "next/server";
import { getDurableRun } from "@/lib/research/durable/durableRun";

export const maxDuration = 60;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const run = await getDurableRun(id);
    return NextResponse.json(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ run_id: id, status: "failed", error: message }, { status });
  }
}
