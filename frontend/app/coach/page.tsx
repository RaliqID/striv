"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export default function CoachPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const fetchHistory = async () => {
    try {
      const res = await apiClient.get<{ messages: Message[]; remaining_today: number }>("/chat");
      setMessages(res.messages ?? []);
      setRemaining(res.remaining_today ?? 20);
    } catch (e: any) {
      if (e.status === 401) { window.location.href = "/login"; return; }
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setInput("");
    setError("");
    setLoading(true);

    // Optimistic add user message
    const userMsg: Message = { id: Date.now(), role: "user", content: trimmed, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await apiClient.post<{ assistant_message: Message; remaining_today: number }>("/chat", { content: trimmed });
      setMessages((prev) => [...prev, res.assistant_message]);
      setRemaining(res.remaining_today);
    } catch (e: any) {
      if (e.status === 401) { window.location.href = "/login"; return; }
      setError(e.message || "Couldn't send message.");
      // Remove optimistic user message on failure
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    if (!confirm("Clear chat history?")) return;
    try {
      await apiClient.delete("/chat");
      setMessages([]);
    } catch {}
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-12rem)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-primary">AI Coach</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Ask about your training, progress, or get advice based on your data.
            </p>
          </div>
          <button
            onClick={clearHistory}
            className="text-on-surface-variant hover:text-error transition-colors font-label-caps text-label-caps"
          >
            Clear history
          </button>
        </div>

        {remaining !== null && (
          <div className="text-sm text-on-surface-variant mb-2">
            {remaining} messages remaining today
          </div>
        )}

        <div className="flex-1 overflow-y-auto border border-outline-variant rounded-xl bg-surface-container-lowest p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl">chat</span>
              <p className="mt-2 font-body-md">Ask Striv about your training.</p>
              <p className="text-sm">e.g. &quot;How is my bench press trending?&quot;</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-low border border-outline-variant text-on-surface"
                  }`}
                >
                  <p className="font-body-md text-body-md whitespace-pre-wrap">{msg.content}</p>
                  <p className="text-[10px] opacity-60 mt-1">
                    {new Date(msg.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 max-w-[80%]">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-pulse" />
                  <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-pulse delay-75" />
                  <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-pulse delay-150" />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="mt-2 text-error font-body-md text-sm">{error}</div>
        )}

        <form onSubmit={sendMessage} className="mt-4 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your training..."
            className="flex-1 rounded-xl border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-primary text-on-primary rounded-xl px-6 py-3 font-metric-sm text-metric-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </AppLayout>
  );
}