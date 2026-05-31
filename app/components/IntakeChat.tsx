"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/ui/store";
import type { ChatMessage, IntakeChatResponse } from "@/lib/intake/types";

type Props = {
  onStarted: () => void;
  onSkip: () => void;
};

export function IntakeChat({ onStarted, onSkip }: Props) {
  const startRun = useStore((s) => s.startRun);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  async function send(history: ChatMessage[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/intake/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      // Read as text first: a timed-out/crashed function returns an HTML error
      // page, and a blind res.json() would throw a cryptic "Unexpected token '<'".
      const raw = await res.text();
      let data: IntakeChatResponse | { error: string };
      try {
        data = JSON.parse(raw) as IntakeChatResponse | { error: string };
      } catch {
        throw new Error("The assistant took too long to respond — please try again.");
      }
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Intake failed");
      }
      if (data.complete) {
        onStarted();
        void startRun({ project_description: data.project_description, demo_documents: [] });
        return;
      }
      setMessages([...history, { role: "assistant", content: data.message }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Intake failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void send([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    setInput("");
    void send(history);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 p-3">
          <h1 className="text-sm font-semibold uppercase tracking-wide text-slate-400">EHS Intake</h1>
          <button type="button" onClick={onSkip} className="text-xs text-slate-400 hover:text-slate-100">
            Skip to manual entry
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((message, index) => (
              <div key={index} className={message.role === "user" ? "text-right" : "text-left"}>
                <span
                  className={`inline-block rounded px-3 py-2 text-sm ${
                    message.role === "user" ? "bg-emerald-700" : "bg-slate-800"
                  }`}
                >
                  {message.content}
                </span>
              </div>
            ))}
          {busy && <p className="text-xs text-slate-500">thinking…</p>}
          {error && (
            <div className="rounded bg-red-900/50 p-2 text-xs text-red-200">
              {error}{" "}
              <button type="button" onClick={onSkip} className="underline">
                Use manual entry instead
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-2 border-t border-slate-800 p-3">
          <input
            className="flex-1 rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
            placeholder="Type your answer…"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSend();
            }}
            disabled={busy}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || input.trim().length === 0}
            className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </main>
  );
}
