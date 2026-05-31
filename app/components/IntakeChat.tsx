"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/ui/store";
import { Send, ArrowRight } from "lucide-react";
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
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(history: ChatMessage[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/intake/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = (await res.json()) as IntakeChatResponse | { error: string };
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    setInput("");
    void send(history);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 text-slate-100" style={{ background: "#05070b" }}>
      <div className="flex h-[80vh] w-full max-w-2xl flex-col glass rounded-2xl shadow-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/40 px-5 py-3.5">
          <div>
            <div className="brand-label mb-0.5">PermitOS</div>
            <h1 className="text-sm font-medium text-slate-300">EHS Project Intake</h1>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-300 transition-colors bg-transparent border-0 cursor-pointer"
          >
            Skip to manual entry
            <ArrowRight size={12} />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-5">
          {messages.map((message, index) => (
            <div key={index} className={message.role === "user" ? "text-right" : "text-left"}>
              <span
                className={`inline-block rounded-xl px-3.5 py-2 text-sm leading-relaxed max-w-[85%] ${
                  message.role === "user"
                    ? "bg-cyan-800/50 text-cyan-100 border border-cyan-700/30"
                    : "bg-slate-800/60 text-slate-200 border border-slate-700/20"
                }`}
              >
                {message.content}
              </span>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              thinking…
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-800/30 p-3 text-xs text-red-200">
              {error}{" "}
              <button type="button" onClick={onSkip} className="underline hover:text-red-100 bg-transparent border-0 cursor-pointer text-red-200">
                Use manual entry instead
              </button>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2 border-t border-slate-700/40 p-3.5">
          <input
            className="flex-1 rounded-xl border border-slate-700/40 bg-slate-950/60 p-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-600/50 transition-colors"
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
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-30 transition-all duration-200 border-0 cursor-pointer hover:shadow-glow disabled:cursor-default"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </main>
  );
}
