# NVIDIA OCR Document Extraction — Design Spec

**Repo:** permitos (production base, seeded from antler)
**Slice:** 1 of the antler ← Permit_-overview capability merge
**Date:** 2026-06-01

## Goal

When the SDS/document extractor's pdfjs text-layer pass yields no text (scanned /
image-only PDFs), automatically recover text via NVIDIA NeMo Retriever OCR
(`nvidia/nemoretriever-ocr-v1`) instead of forcing the user to paste text manually —
feeding the recovered text into the existing `extracted_text` contract unchanged.

## Context — why this is one clean seam

`src/lib/sds/clientExtraction.ts` extracts PDF text **client-side** via pdfjs
(`getTextContent()`). Digital PDFs work; scanned/image PDFs have no text layer, so it
returns `text_extraction_status: "needs_pasted_text"` and the user must paste manually.
Everything downstream (`reviewer.ts` section mapping, freshness, handoff facts) consumes
only `extracted_text`. So OCR slots into exactly one branch and nothing downstream changes.
This is the first capability imported from the NVIDIA side of the merge, and it stays
wrapped by antler's rigor (extraction status + per-section confidence → `needs_expert_review`).

## The seam (one place)

`extractSdsTextFromClientFile(file)`:
- PDF empty-text-layer branch — `clientExtraction.ts:33` / `:36`
- non-PDF / image branch — `clientExtraction.ts:48`

Today: empty text → `needs_pasted_text`. New: empty text → try OCR → text → `ok`;
OCR fails/unavailable → `needs_pasted_text` (behavior unchanged).

## Architecture (server-side OCR, client-driven)

The `NVIDIA_API_KEY` and the OCR call cannot live in the browser, so OCR is a server route
and the client orchestrates:

1. **Client (`clientExtraction.ts`)** — keep the pdfjs text-layer pass (fast, free). When
   empty, render each PDF page to a PNG via pdfjs canvas and POST the images to the OCR
   route. Image-file uploads (png/jpg) POST the file directly.
2. **Server route `POST /api/ocr` (`src/app/api/ocr/route.ts`)** — receives page images,
   calls the NIM OCR client, returns `{ text, confidence }` (reading-order concatenated).
3. **NIM OCR client (`src/lib/ocr/nimOcr.ts`)** — dependency-injected (fetch injected),
   calls `nvidia/nemoretriever-ocr-v1` at `NIM_BASE_URL` with `NVIDIA_API_KEY`. Pure +
   unit-testable with a fake fetch.

Recommended for slice 1: **client rasterizes via pdfjs** (reuses existing pdfjs; no server
rasterizer). Alternative — server-side `pymupdf` rasterization in the Modal worker — is
deferred. → **Decision 1 to confirm.**

## Provider / config

- `NVIDIA_API_KEY` (server only), `NIM_BASE_URL` (default `https://integrate.api.nvidia.com/v1`),
  `NVIDIA_OCR_MODEL` (default `nvidia/nemoretriever-ocr-v1`).
- **Invariant:** when `NVIDIA_API_KEY` is unset, OCR is disabled and extraction behaves
  exactly as today — preserving fixtures/demo and the existing SDS test suite.

## Fallback chain (zero regression)

pdfjs text layer → (empty) OCR via `/api/ocr` → (fail / no key / empty) `needs_pasted_text`.
No NVIDIA key ⇒ identical to current behavior.

## Data contract (unchanged downstream)

`ClientSdsExtraction { name, source_type, text, text_extraction_status }` and
`SdsTextExtractionStatus` stay as-is. OCR-recovered text sets `text_extraction_status: "ok"`.

## Rigor (antler wins)

OCR text is an *input*, not a determination — but a poor scan must not be silently trusted.
The OCR client returns a confidence; below a threshold the extraction is flagged so the
reviewer surfaces it via the existing `needs_expert_review` path rather than producing
confident output from garbage text.

## Files

- New: `src/lib/ocr/nimOcr.ts` — NIM OCR client (DI fetch) + reading-order concat.
- New: `src/app/api/ocr/route.ts` — server route (holds the key, calls `nimOcr`).
- New: `src/lib/sds/pdfRasterize.ts` — pdfjs page → PNG (client).
- Modify: `src/lib/sds/clientExtraction.ts` — empty-text-layer + image branches call OCR.
- Tests: `src/lib/ocr/__tests__/nimOcr.test.ts`, `src/lib/sds/__tests__/clientExtraction.ocr.test.ts`.

## Test plan (TDD)

- **Task 1 (L0, online, opt-in):** confirm the `nemoretriever-ocr-v1` request/response
  contract against the model card + one smoke call with `NVIDIA_API_KEY`. Everything below
  depends on this shape; capture a real response as a fixture.
- **nimOcr unit (offline, fake fetch):** correct request shape; reading-order concat across
  pages; confidence surfaced; HTTP error → typed failure (never throws to the caller).
- **clientExtraction integration (offline, mock `/api/ocr`):** digital PDF → text layer used,
  OCR **not** called; scanned PDF (empty layer) → OCR called → text + `ok`; OCR failure / no
  key → `needs_pasted_text`; image upload → OCR path.
- **Regression:** existing `reviewer.test.ts` + SDS suite stay green (no contract change).

## Decisions to confirm

1. **Rasterization location:** client (pdfjs canvas) *[recommended]* vs server (Modal `pymupdf`).
2. **Model + scope:** `nemoretriever-ocr-v1`, plain reading-ordered text only *[recommended]*
   vs `nemoretriever-parse` structured layout *(deferred)*.

## Non-goals (slice 1)

Layout/table/markdown parsing; server-side rasterization; changes to `reviewer.ts` / section
mapping; NIM support for the LLM seams (separate slice); persisting OCR output.

## Risks

- OCR API contract unknown until Task 1 (mitigated: it's the first task, fixture-captured).
- pdfjs canvas rendering in the upload context (the pdf worker is already configured in
  `clientExtraction.ts`).
- Large/many-page scans → latency/cost; cap page count for slice 1.
