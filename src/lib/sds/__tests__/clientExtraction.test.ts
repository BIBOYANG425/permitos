import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractSdsTextFromClientFile } from "../clientExtraction";

const pdfjsMock = vi.hoisted(() => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {
    workerSrc: ""
  }
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => pdfjsMock);

describe("extractSdsTextFromClientFile", () => {
  beforeEach(() => {
    pdfjsMock.getDocument.mockReset();
    pdfjsMock.GlobalWorkerOptions.workerSrc = "";
  });

  it("extracts plain text files as pasted text-compatible SDS input", async () => {
    const file = new File(
      ["Section 1: Identification\nSection 2: Hazard(s) identification"],
      "sds.txt",
      { type: "text/plain" }
    );

    const extraction = await extractSdsTextFromClientFile(file);

    expect(extraction).toEqual({
      name: "sds.txt",
      source_type: "pasted_text",
      text: "Section 1: Identification\nSection 2: Hazard(s) identification",
      text_extraction_status: "ok"
    });
  });

  it("marks empty plain text files as empty pasted text input", async () => {
    const file = new File(["   \n"], "empty-sds.txt", { type: "text/plain" });

    const extraction = await extractSdsTextFromClientFile(file);

    expect(extraction).toEqual({
      name: "empty-sds.txt",
      source_type: "pasted_text",
      text: "   \n",
      text_extraction_status: "empty"
    });
  });

  it("configures the pdfjs worker and extracts PDF text", async () => {
    const getTextContent = vi.fn().mockResolvedValue({
      items: [{ str: "Section 1:" }, { str: "Identification" }]
    });
    const getPage = vi.fn().mockResolvedValue({ getTextContent });
    let workerSrcAtGetDocument = "";
    pdfjsMock.getDocument.mockImplementation(() => {
      workerSrcAtGetDocument = pdfjsMock.GlobalWorkerOptions.workerSrc;
      return {
        promise: Promise.resolve({
          numPages: 1,
          getPage
        })
      };
    });
    const file = new File(["%PDF-1.7"], "sds.pdf", {
      type: "application/pdf"
    });

    const extraction = await extractSdsTextFromClientFile(file);

    expect(workerSrcAtGetDocument).toContain("pdf.worker.mjs");
    expect(pdfjsMock.getDocument).toHaveBeenCalledWith({
      data: expect.any(Uint8Array)
    });
    expect(extraction).toEqual({
      name: "sds.pdf",
      source_type: "pdf",
      text: "Section 1: Identification",
      text_extraction_status: "ok"
    });
  });

  it("preserves PDF text item line endings and destroys the loading task after success", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const getTextContent = vi.fn().mockResolvedValue({
      items: [
        { str: "Section 1: Identification", hasEOL: true },
        { str: "Section 2: Hazard(s) identification", hasEOL: false }
      ]
    });
    const getPage = vi.fn().mockResolvedValue({ getTextContent });
    pdfjsMock.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage
      }),
      destroy
    });
    const file = new File(["%PDF-1.7"], "sds.pdf", {
      type: "application/pdf"
    });

    const extraction = await extractSdsTextFromClientFile(file);

    expect(extraction).toEqual({
      name: "sds.pdf",
      source_type: "pdf",
      text: "Section 1: Identification\nSection 2: Hazard(s) identification",
      text_extraction_status: "ok"
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("returns a pasted text fallback and destroys the loading task when PDF loading rejects", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    pdfjsMock.getDocument.mockReturnValue({
      promise: Promise.reject(new Error("Invalid PDF")),
      destroy
    });
    const file = new File(["not a valid pdf"], "scan.pdf", {
      type: "application/pdf"
    });

    const extraction = await extractSdsTextFromClientFile(file);

    expect(extraction).toEqual({
      name: "scan.pdf",
      source_type: "pdf",
      text: "",
      text_extraction_status: "needs_pasted_text"
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("returns a pasted text fallback signal when PDF parsing fails", async () => {
    pdfjsMock.getDocument.mockImplementation(() => {
      throw new Error("Invalid PDF");
    });
    const file = new File(["not a valid pdf"], "scan.pdf", {
      type: "application/pdf"
    });

    const extraction = await extractSdsTextFromClientFile(file);

    expect(extraction.name).toBe("scan.pdf");
    expect(extraction.source_type).toBe("pdf");
    expect(extraction.text_extraction_status).toBe("needs_pasted_text");
  });
});
