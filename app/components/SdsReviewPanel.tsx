"use client";

import { useStore } from "@/lib/ui/store";
import type { PermitHandoffFact, SdsFinding, SdsOverallStatus, SdsReview } from "@/lib/sds/types";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Flame,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

const STATUS_CLASS: Record<SdsOverallStatus, string> = {
  complete: "border-teal-700/50 bg-teal-950/30 text-teal-300",
  incomplete: "border-amber-700/50 bg-amber-950/30 text-amber-300",
  stale: "border-amber-700/50 bg-amber-950/30 text-amber-300",
  unreadable: "border-red-700/50 bg-red-950/30 text-red-300",
  needs_expert_review: "border-red-700/50 bg-red-950/30 text-red-300",
};

const SEVERITY_ICON_CLASS: Record<SdsFinding["severity"], string> = {
  info: "text-teal-400",
  warning: "text-amber-400",
  critical: "text-red-400",
};

export function SdsReviewPanel() {
  const sdsReviews = useStore((state) => state.run?.sds_reviews);
  const reviews = sdsReviews ?? [];

  if (reviews.length === 0) return null;

  return (
    <section className="border-b border-slate-800/40 p-3">
      <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-300/80">
        <ShieldAlert size={13} />
        SDS review
      </div>
      <div
        data-testid="sds-review-scroll"
        role="region"
        aria-label="SDS review artifacts"
        tabIndex={0}
        className="max-h-80 space-y-2 overflow-y-auto pr-1 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
      >
        {reviews.map((review) => (
          <ReviewArticle key={review.document.id} review={review} />
        ))}
      </div>
    </section>
  );
}

function ReviewArticle({ review }: { review: SdsReview }) {
  return (
    <article className="border border-slate-800/70 bg-slate-950/35 p-2.5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
            <FileText size={13} className="shrink-0 text-slate-400" />
            <span className="min-w-0 break-words">{review.document.name}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
            <span>{review.document.source_type}</span>
            <span>{review.document.retention}</span>
          </div>
        </div>
        <span
          className={`shrink-0 border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[review.overall_status]}`}
        >
          {formatToken(review.overall_status)}
        </span>
      </div>

      <FindingList findings={review.quality_findings} title="Quality" variant="quality" />
      <FindingList findings={review.safety_findings} title="Safety" variant="safety" />
      <PermitHandoffFacts facts={review.permit_handoff_facts} />
    </article>
  );
}

function FindingList({
  findings,
  title,
  variant,
}: {
  findings: SdsFinding[];
  title: string;
  variant: "quality" | "safety";
}) {
  if (findings.length === 0) return null;
  const HeadingIcon = variant === "quality" ? Sparkles : Flame;

  return (
    <div className="mt-2 border-t border-slate-800/70 pt-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <HeadingIcon size={11} />
        {title}
      </div>
      <div className="space-y-1.5">
        {findings.map((finding) => (
          <div key={finding.id} className="flex gap-1.5 break-words text-[11px] leading-snug text-slate-300">
            {finding.severity === "info" ? (
              <CheckCircle2
                size={12}
                className={`mt-0.5 shrink-0 ${SEVERITY_ICON_CLASS[finding.severity]}`}
              />
            ) : (
              <AlertTriangle
                size={12}
                className={`mt-0.5 shrink-0 ${SEVERITY_ICON_CLASS[finding.severity]}`}
              />
            )}
            <div className="min-w-0">
              <div className="font-medium text-slate-200">{finding.title}</div>
              <div className="text-slate-500">{finding.reason}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-600">
                <span>{formatToken(finding.category)}</span>
                {finding.source_section !== undefined && <span>section {finding.source_section}</span>}
              </div>
              {finding.quote && <div className="mt-0.5 break-words text-slate-500">"{finding.quote}"</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PermitHandoffFacts({ facts }: { facts: PermitHandoffFact[] }) {
  if (facts.length === 0) return null;

  return (
    <div className="mt-2 border-t border-slate-800/70 pt-2">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Permit handoff candidates
      </div>
      <div className="mb-1.5 text-[10px] leading-snug text-slate-500">
        Review-only candidate facts from SDS content; not final determinations.
      </div>
      <div className="space-y-1.5">
        {facts.map((fact) => (
          <div
            key={`${fact.field}-${fact.source_section}-${fact.quote}`}
            className="min-w-0 break-words border-l border-cyan-800/40 pl-2 text-[11px] leading-snug"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="min-w-0 break-all font-mono text-cyan-300">{fact.field}</span>
              <span className="text-slate-500">section {fact.source_section}</span>
              <span className="text-slate-500">{formatConfidence(fact.confidence)} confidence</span>
              <span className="border border-cyan-800/50 bg-cyan-950/20 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">
                candidate fact
              </span>
              <span className="border border-slate-700/70 bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                {fact.review_flag ? "review flagged" : "not review flagged"}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-1.5 gap-y-0.5 text-slate-400">
              <span className="text-slate-600">value</span>
              <span className="min-w-0 break-words font-mono text-slate-200">{formatFactValue(fact.value)}</span>
              <span className="text-slate-600">quote</span>
              <span className="min-w-0 break-words text-slate-300">"{fact.quote}"</span>
            </div>
            <div className="mt-0.5 text-slate-500">{fact.reason}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatToken(value: string) {
  return value.replaceAll("_", " ");
}

function formatFactValue(value: PermitHandoffFact["value"]) {
  if (value === null) return "null";
  return String(value);
}

function formatConfidence(confidence: number) {
  const percent = confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.round(percent)}%`;
}
