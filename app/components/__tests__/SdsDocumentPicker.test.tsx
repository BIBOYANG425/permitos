import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SdsDocumentPicker } from "../SdsDocumentPicker";
import { extractSdsTextFromClientFile } from "@/lib/sds/clientExtraction";
import type { SdsDocumentInput } from "@/lib/sds/types";

vi.mock("@/lib/sds/clientExtraction", () => ({
  extractSdsTextFromClientFile: vi.fn()
}));

const mockExtractSdsTextFromClientFile = vi.mocked(extractSdsTextFromClientFile);

describe("SdsDocumentPicker", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("adds pasted SDS text with ephemeral retention by default", () => {
    const onChange = vi.fn();
    render(<SdsDocumentPicker documents={[]} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("SDS text"), {
      target: { value: "Section 1: Identification" }
    });
    fireEvent.click(screen.getByText("Add SDS text"));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "Pasted SDS",
        type: "sds",
        source_type: "pasted_text",
        retention: "ephemeral",
        text: "Section 1: Identification",
        text_extraction_status: "ok"
      })
    ]);
  });

  it("keeps save-for-audit as an explicit opt-in", () => {
    const onChange = vi.fn();
    render(<SdsDocumentPicker documents={[]} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("Save SDS text for audit"));
    fireEvent.change(screen.getByLabelText("SDS text"), {
      target: { value: "Section 1: Identification" }
    });
    fireEvent.click(screen.getByText("Add SDS text"));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        retention: "save_for_audit"
      })
    ]);
  });

  it("adds uploaded files through extraction", async () => {
    const onChange = vi.fn();
    mockExtractSdsTextFromClientFile.mockResolvedValueOnce({
      name: "sds.txt",
      source_type: "pasted_text",
      text: "Section 1: Identification",
      text_extraction_status: "ok"
    });
    render(<SdsDocumentPicker documents={[]} onChange={onChange} />);

    const file = new File(["Section 1: Identification"], "sds.txt", {
      type: "text/plain"
    });
    fireEvent.change(screen.getByLabelText("Upload SDS"), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(mockExtractSdsTextFromClientFile).toHaveBeenCalledWith(file);
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "sds.txt",
          type: "sds",
          source_type: "pasted_text",
          retention: "ephemeral",
          text: "Section 1: Identification",
          text_extraction_status: "ok"
        })
      ]);
    });
  });

  it("removes selected documents by index", () => {
    const onChange = vi.fn();
    const documents: SdsDocumentInput[] = [
      {
        name: "first SDS",
        type: "sds",
        text: "Section 1",
        source_type: "pasted_text",
        retention: "ephemeral",
        text_extraction_status: "ok"
      },
      {
        name: "second SDS",
        type: "sds",
        text: "Section 2",
        source_type: "pasted_text",
        retention: "save_for_audit",
        text_extraction_status: "ok"
      }
    ];

    render(<SdsDocumentPicker documents={documents} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Remove first SDS"));

    expect(onChange).toHaveBeenCalledWith([documents[1]]);
  });

  it("disables document mutations while file extraction is pending", async () => {
    let resolveExtraction: (value: Awaited<ReturnType<typeof extractSdsTextFromClientFile>>) => void;
    const onChange = vi.fn();
    const documents: SdsDocumentInput[] = [
      {
        name: "existing SDS",
        type: "sds",
        text: "Section 1",
        source_type: "pasted_text",
        retention: "ephemeral",
        text_extraction_status: "ok"
      }
    ];
    mockExtractSdsTextFromClientFile.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveExtraction = resolve;
      })
    );
    render(<SdsDocumentPicker documents={documents} onChange={onChange} />);

    const file = new File(["Section 2"], "pending.txt", {
      type: "text/plain"
    });
    fireEvent.change(screen.getByLabelText("Upload SDS"), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(screen.getByText("Extracting")).toBeInTheDocument();
      expect(screen.getByText("Add SDS text")).toBeDisabled();
      expect(screen.getByLabelText("Remove existing SDS")).toBeDisabled();
      expect(screen.getByLabelText("Upload SDS")).toBeDisabled();
    });

    fireEvent.change(screen.getByLabelText("SDS text"), {
      target: { value: "Section 3: Composition" }
    });
    fireEvent.click(screen.getByText("Add SDS text"));
    fireEvent.click(screen.getByLabelText("Remove existing SDS"));
    expect(onChange).not.toHaveBeenCalled();

    resolveExtraction!({
      name: "pending.txt",
      source_type: "pasted_text",
      text: "Section 2",
      text_extraction_status: "ok"
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([
        documents[0],
        expect.objectContaining({
          name: "pending.txt",
          text: "Section 2"
        })
      ]);
    });
  });

  it("merges uploaded files with latest parent documents after extraction resolves", async () => {
    let resolveExtraction: (value: Awaited<ReturnType<typeof extractSdsTextFromClientFile>>) => void;
    const onChange = vi.fn();
    const initialDocuments: SdsDocumentInput[] = [
      {
        name: "initial SDS",
        type: "sds",
        text: "Section 1",
        source_type: "pasted_text",
        retention: "ephemeral",
        text_extraction_status: "ok"
      }
    ];
    const parentAddedDocument: SdsDocumentInput = {
      name: "parent-added SDS",
      type: "sds",
      text: "Section 3",
      source_type: "pasted_text",
      retention: "save_for_audit",
      text_extraction_status: "ok"
    };
    mockExtractSdsTextFromClientFile.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveExtraction = resolve;
      })
    );
    const { rerender } = render(
      <SdsDocumentPicker documents={initialDocuments} onChange={onChange} />
    );

    const file = new File(["Section 2"], "upload.txt", {
      type: "text/plain"
    });
    fireEvent.change(screen.getByLabelText("Upload SDS"), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(screen.getByText("Extracting")).toBeInTheDocument();
    });

    rerender(
      <SdsDocumentPicker
        documents={[...initialDocuments, parentAddedDocument]}
        onChange={onChange}
      />
    );

    resolveExtraction!({
      name: "upload.txt",
      source_type: "pasted_text",
      text: "Section 2",
      text_extraction_status: "ok"
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([
        initialDocuments[0],
        parentAddedDocument,
        expect.objectContaining({
          name: "upload.txt",
          text: "Section 2"
        })
      ]);
    });
  });

  it("preserves successful uploads and adds a placeholder for failed uploads", async () => {
    const onChange = vi.fn();
    mockExtractSdsTextFromClientFile
      .mockResolvedValueOnce({
        name: "good-sds.txt",
        source_type: "pasted_text",
        text: "Section 1: Identification",
        text_extraction_status: "ok"
      })
      .mockRejectedValueOnce(new Error("PDF extraction failed"));
    render(<SdsDocumentPicker documents={[]} onChange={onChange} />);

    const goodFile = new File(["Section 1: Identification"], "good-sds.txt", {
      type: "text/plain"
    });
    const failedFile = new File([""], "failed-sds.pdf", {
      type: "application/pdf"
    });
    fireEvent.change(screen.getByLabelText("Upload SDS"), {
      target: { files: [goodFile, failedFile] }
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "good-sds.txt",
          type: "sds",
          source_type: "pasted_text",
          retention: "ephemeral",
          text: "Section 1: Identification",
          text_extraction_status: "ok"
        }),
        expect.objectContaining({
          name: "failed-sds.pdf",
          type: "sds",
          source_type: "pdf",
          retention: "ephemeral",
          text: "",
          text_extraction_status: "needs_pasted_text"
        })
      ]);
    });
  });
});
