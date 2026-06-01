"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { extractSdsTextFromClientFile } from "@/lib/sds/clientExtraction";
import type {
  ClientSdsExtraction,
  SdsDocumentInput,
  SdsRetention,
  SdsSourceType
} from "@/lib/sds/types";

type Props = {
  documents: SdsDocumentInput[];
  onChange: (documents: SdsDocumentInput[]) => void;
  onBusyChange?: (busy: boolean) => void;
};

export function SdsDocumentPicker({ documents, onChange, onBusyChange }: Props) {
  const [text, setText] = useState("");
  const [retention, setRetention] = useState<SdsRetention>("ephemeral");
  const [busy, setBusy] = useState(false);
  const documentsRef = useRef(documents);
  documentsRef.current = documents;

  function setUploadBusy(nextBusy: boolean) {
    setBusy(nextBusy);
    onBusyChange?.(nextBusy);
  }

  function addPastedText() {
    if (busy) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    onChange([
      ...documents,
      {
        name: "Pasted SDS",
        type: "sds",
        text: trimmed,
        source_type: "pasted_text",
        retention,
        text_extraction_status: "ok"
      }
    ]);
    setText("");
    setRetention("ephemeral");
  }

  async function addFiles(files: FileList | null) {
    if (busy || !files?.length) return;

    const uploadFiles = Array.from(files);
    setUploadBusy(true);
    try {
      const results = await Promise.allSettled(
        uploadFiles.map((file) => extractSdsTextFromClientFile(file))
      );
      const uploadedDocuments = results.map((result, index) =>
        result.status === "fulfilled"
          ? createExtractedDocument(result.value, retention)
          : createFailedUploadDocument(uploadFiles[index], retention)
      );

      onChange([
        ...documentsRef.current,
        ...uploadedDocuments
      ]);
    } finally {
      setUploadBusy(false);
    }
  }

  function removeAt(index: number) {
    if (busy) return;

    onChange(documents.filter((_, current) => current !== index));
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-800/60 bg-slate-950/35 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="brand-label">SDS review</div>
        <label
          className={`flex items-center gap-1.5 text-slate-400 transition-colors ${
            busy ? "cursor-wait opacity-70" : "cursor-pointer hover:text-cyan-300"
          }`}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          <span>{busy ? "Extracting" : "Upload"}</span>
          <input
            aria-label="Upload SDS"
            type="file"
            accept=".pdf,.txt,text/plain,application/pdf"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              void addFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      <textarea
        aria-label="SDS text"
        rows={4}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Paste SDS text"
        disabled={busy}
        className="w-full resize-y rounded-lg border border-slate-700/40 bg-slate-950/60 p-2 text-slate-100 placeholder:text-slate-500 transition-colors focus:border-cyan-600/50 focus:outline-none"
      />

      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        <input
          aria-label="Save SDS text for audit"
          type="checkbox"
          checked={retention === "save_for_audit"}
          disabled={busy}
          onChange={(event) =>
            setRetention(event.target.checked ? "save_for_audit" : "ephemeral")
          }
        />
        Save SDS text for audit
      </label>

      <button
        type="button"
        onClick={addPastedText}
        disabled={busy || !text.trim()}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 font-semibold text-slate-100 transition-colors hover:bg-slate-700 disabled:cursor-default disabled:opacity-40"
      >
        <FileText size={13} />
        Add SDS text
      </button>

      {documents.length > 0 && (
        <div className="space-y-1">
          {documents.map((document, index) => (
            <div
              key={`${document.name}-${index}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-800/60 bg-slate-900/50 px-2 py-1.5"
            >
              <span className="truncate text-slate-300">{document.name}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-600">
                {document.text_extraction_status && document.text_extraction_status !== "ok"
                  ? document.text_extraction_status.replaceAll("_", " ")
                  : document.retention === "save_for_audit"
                    ? "Audit"
                    : "Ephemeral"}
              </span>
              <button
                type="button"
                aria-label={`Remove ${document.name}`}
                disabled={busy}
                onClick={() => removeAt(index)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-transparent text-slate-500 transition-colors hover:bg-red-950/50 hover:text-red-300 disabled:cursor-wait disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function createExtractedDocument(
  item: ClientSdsExtraction,
  retention: SdsRetention
): SdsDocumentInput {
  return {
    name: item.name,
    type: "sds",
    text: item.text,
    source_type: item.source_type,
    retention,
    text_extraction_status: item.text_extraction_status
  };
}

function createFailedUploadDocument(
  file: File | undefined,
  retention: SdsRetention
): SdsDocumentInput {
  return {
    name: file?.name ?? "Unreadable SDS",
    type: "sds",
    text: "",
    source_type: inferSdsSourceType(file),
    retention,
    text_extraction_status: "needs_pasted_text"
  };
}

function inferSdsSourceType(file: File | undefined): SdsSourceType {
  if (file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }

  return "pasted_text";
}
