import type { ClientSdsExtraction } from "./types";

type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfLoadingTask = ReturnType<Pdfjs["getDocument"]>;
type PdfDocument = Awaited<PdfLoadingTask["promise"]>;

export async function extractSdsTextFromClientFile(
  file: File
): Promise<ClientSdsExtraction> {
  if (isPdf(file)) {
    let loadingTask: PdfLoadingTask | undefined;
    let pdf: PdfDocument | undefined;

    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      configurePdfWorker(pdfjs);
      const data = new Uint8Array(await file.arrayBuffer());
      loadingTask = pdfjs.getDocument({ data });
      pdf = await loadingTask.promise;
      const pages: string[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(extractPdfPageText(content.items));
      }

      const text = pages.join("\n").trim();
      return {
        name: file.name,
        source_type: "pdf",
        text,
        text_extraction_status: text.length > 0 ? "ok" : "needs_pasted_text"
      };
    } catch {
      return {
        name: file.name,
        source_type: "pdf",
        text: "",
        text_extraction_status: "needs_pasted_text"
      };
    } finally {
      await destroyPdfResource(pdf);
      await destroyPdfResource(loadingTask);
    }
  }

  const text = await file.text();
  return {
    name: file.name,
    source_type: "pasted_text",
    text,
    text_extraction_status: text.trim().length > 0 ? "ok" : "empty"
  };
}

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

function configurePdfWorker(
  pdfjs: Pdfjs
): void {
  if (pdfjs.GlobalWorkerOptions.workerSrc) {
    return;
  }

  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url
  ).toString();
}

function extractPdfPageText(items: readonly unknown[]): string {
  let text = "";

  for (const item of items) {
    if (!isPdfTextItem(item)) {
      continue;
    }

    text += item.str;
    text += item.hasEOL === true ? "\n" : " ";
  }

  return text.trimEnd();
}

function isPdfTextItem(
  item: unknown
): item is { str: string; hasEOL?: unknown } {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof item.str === "string"
  );
}

async function destroyPdfResource(resource?: unknown): Promise<void> {
  if (!hasDestroy(resource)) {
    return;
  }

  try {
    await resource.destroy();
  } catch {
    // Cleanup should not replace the extraction result or fallback signal.
  }
}

function hasDestroy(resource: unknown): resource is { destroy: () => unknown } {
  return (
    typeof resource === "object" &&
    resource !== null &&
    "destroy" in resource &&
    typeof resource.destroy === "function"
  );
}
