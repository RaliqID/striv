"use client";

import AppLayout from "@/components/AppLayout";
import { apiClient } from "@/lib/api";
import { useEffect, useRef, useState } from "react";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  image_url: string | null;
  session_id: number;
  created_at: string;
};

type Session = {
  id: number;
  title: string;
  last_message_at: string;
  created_at: string;
};

type SessionSummary = {
  id: number;
  title: string;
  last_message_at: string;
  created_at: string;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_EDGE = 1024;

const fmtRelative = (iso: string) => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

// Downscale image via canvas to max 1024px longest edge, JPEG q0.8 data URL.
const downscaleImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(
          1,
          MAX_IMAGE_EDGE / Math.max(img.width, img.height)
        );
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Could not process image."));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image file."));
    };
    img.src = url;
  });

export default function CoachPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [processingImage, setProcessingImage] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handle401 = (e: any) => {
    if (e?.status === 401) {
      window.location.href = "/login";
      return true;
    }
    return false;
  };

  const fetchSessions = async () => {
    try {
      const res = await apiClient.get<{ sessions: SessionSummary[] }>(
        "/chat/sessions"
      );
      setSessions(res.sessions ?? []);
    } catch (e: any) {
      handle401(e);
    }
  };

  // Load latest session + messages on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get<{ session: Session; messages: Message[] }>(
          "/chat"
        );
        setMessages(res.messages ?? []);
        setActiveSessionId(res.session?.id ?? null);
      } catch (e: any) {
        if (!handle401(e)) {
          setError(e.message || "Could not load chat.");
        }
      } finally {
        fetchSessions();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const switchSession = async (id: number) => {
    if (id === activeSessionId || switching) return;
    setSwitching(true);
    setError("");
    setMessages([]);
    try {
      const res = await apiClient.get<{ session: Session; messages: Message[] }>(
        `/chat/sessions/${id}`
      );
      setActiveSessionId(id);
      setMessages(res.messages ?? []);
    } catch (e: any) {
      if (!handle401(e)) {
        setError(e.message || "Could not open conversation.");
      }
    } finally {
      setSwitching(false);
    }
  };

  const startNewChat = async () => {
    if (switching) return;
    setSwitching(true);
    setError("");
    try {
      const res = await apiClient.post<{ session: Session }>("/chat/sessions");
      setSessions((prev) => [res.session, ...prev]);
      setActiveSessionId(res.session.id);
      setMessages([]);
    } catch (e: any) {
      if (!handle401(e)) {
        setError(e.message || "Could not start a new conversation.");
      }
    } finally {
      setSwitching(false);
    }
  };

  const deleteSession = async (id: number) => {
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    try {
      await apiClient.delete(`/chat/sessions/${id}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (id === activeSessionId) {
        setActiveSessionId(null);
        setMessages([]);
        // Load latest remaining session, if any
        try {
          const res = await apiClient.get<{ session: Session; messages: Message[] }>(
            "/chat"
          );
          setMessages(res.messages ?? []);
          setActiveSessionId(res.session?.id ?? null);
        } catch (e: any) {
          handle401(e);
        }
      }
    } catch (e: any) {
      if (!handle401(e)) {
        setError(e.message || "Could not delete conversation.");
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting same file
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("Image is larger than 10MB. Choose a smaller image.");
      return;
    }
    setError("");
    setProcessingImage(true);
    try {
      const dataUrl = await downscaleImage(file);
      setImagePreview(dataUrl);
    } catch (err: any) {
      setError(err.message || "Could not process image.");
    } finally {
      setProcessingImage(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading || switching) return;
    const image = imagePreview;
    setInput("");
    setImagePreview(null);
    setError("");
    setLoading(true);

    const tempId = -Date.now();
    const userMsg: Message = {
      id: tempId,
      role: "user",
      content: trimmed,
      image_url: image,
      session_id: activeSessionId ?? 0,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await apiClient.post<{
        user_message: Message;
        assistant_message: Message;
        session: Session;
      }>("/chat", {
        content: trimmed,
        image: image ?? undefined,
        session_id: activeSessionId ?? undefined,
      });
      // Reconcile: replace optimistic msg with server user_message, append assistant reply
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        res.user_message,
        res.assistant_message,
      ]);
      // Update local session state (title/last_message_at set server-side)
      setActiveSessionId(res.session.id);
      setSessions((prev) => {
        const rest = prev.filter((s) => s.id !== res.session.id);
        return [
          {
            id: res.session.id,
            title: res.session.title,
            last_message_at: res.session.last_message_at,
            created_at: res.session.created_at,
          },
          ...rest,
        ].sort(
          (a, b) =>
            new Date(b.last_message_at).getTime() -
            new Date(a.last_message_at).getTime()
        );
      });
    } catch (e: any) {
      if (handle401(e)) return;
      setError(e.message || "Couldn't send message.");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setLoading(false);
    }
  };

  const sessionRail = (
    <div className="flex flex-col h-full border border-outline-variant rounded-xl bg-surface-container-lowest">
      <div className="p-3 border-b border-outline-variant">
        <button
          onClick={startNewChat}
          disabled={switching}
          className="w-full bg-primary text-on-primary rounded-lg px-4 py-2.5 font-metric-sm text-metric-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant px-3 py-4 text-center">
            No conversations yet.
          </p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={`group relative rounded-lg transition-colors cursor-pointer ${
                s.id === activeSessionId
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface"
              }`}
              onClick={() => switchSession(s.id)}
            >
              <div className="px-3 py-2.5 pr-10">
                <p className="font-metric-sm text-metric-sm truncate">{s.title}</p>
                <p
                  className={`font-label-caps text-label-caps mt-0.5 ${
                    s.id === activeSessionId
                      ? "text-on-secondary-container/70"
                      : "text-on-surface-variant/70"
                    }`}
                >
                  {fmtRelative(s.last_message_at)}
                </p>
              </div>
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  deleteSession(s.id);
                }}
                aria-label={`Delete conversation: ${s.title}`}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-on-surface-variant hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto flex flex-col h-[calc(100vh-9rem)]">
        <div className="mb-4">
          <h1 className="font-headline-lg text-headline-lg text-primary">AI Coach</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Ask about your training, progress, or get advice based on your data.
          </p>
        </div>

        <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
          {/* Desktop sessions rail */}
          <div className="hidden md:flex w-[260px] shrink-0 min-h-0">
            {sessionRail}
          </div>

          {/* Mobile: horizontal chips row */}
          <div className="md:hidden flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 items-center">
            <button
              onClick={startNewChat}
              disabled={switching}
              className="shrink-0 bg-primary text-on-primary rounded-full px-4 py-1.5 font-metric-sm text-metric-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              New
            </button>
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`shrink-0 group relative rounded-full pr-8 pl-4 py-1.5 font-metric-sm text-metric-sm transition-colors cursor-pointer ${
                  s.id === activeSessionId
                    ? "bg-secondary-container text-on-secondary-container"
                    : "bg-surface-container-low border border-outline-variant text-on-surface-variant"
                }`}
                onClick={() => switchSession(s.id)}
              >
                <span className="block max-w-[140px] truncate">{s.title}</span>
                <button
                  onClick={(ev) => {
                    ev.stopPropagation();
                    deleteSession(s.id);
                  }}
                  aria-label={`Delete conversation: ${s.title}`}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-on-surface-variant hover:text-error opacity-70 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            ))}
          </div>

          {/* Chat pane */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto border border-outline-variant rounded-xl bg-surface-container-lowest p-4 space-y-4">
              {switching && (
                <div className="flex justify-center py-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-pulse" />
                    <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-pulse delay-75" />
                    <span className="w-2 h-2 bg-on-surface-variant rounded-full animate-pulse delay-150" />
                  </div>
                </div>
              )}
              {messages.length === 0 && !switching ? (
                <div className="flex flex-col items-center justify-center h-full text-on-surface-variant">
                  <span className="material-symbols-outlined text-4xl">chat</span>
                  <p className="mt-2 font-body-md">Ask Striv about your training.</p>
                  <p className="text-sm">e.g. &quot;How is my bench press trending?&quot;</p>
                  <p className="text-sm mt-1">You can also attach an image of your form or setup.</p>
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
                      {msg.role === "user" && msg.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={msg.image_url}
                          alt="Attached image"
                          className="rounded-lg max-h-48 object-cover mb-2"
                        />
                      )}
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

            {/* Image preview before send */}
            {imagePreview && (
              <div className="mt-2 flex items-center gap-2">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="Image to attach"
                    className="h-16 w-16 rounded-lg object-cover border border-outline-variant"
                  />
                  <button
                    onClick={() => setImagePreview(null)}
                    aria-label="Remove image"
                    className="absolute -top-2 -right-2 bg-surface border border-outline-variant rounded-full p-0.5 text-on-surface-variant hover:text-error transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
                <p className="font-label-caps text-label-caps text-on-surface-variant">
                  Image attached
                </p>
              </div>
            )}

            <form onSubmit={sendMessage} className="mt-4 flex gap-2 items-end">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                aria-label="Attach image"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || processingImage}
                aria-label="Attach image"
                className="shrink-0 rounded-xl border border-outline-variant bg-surface px-3 py-3 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="material-symbols-outlined">
                  {processingImage ? "hourglass_top" : "add_photo_alternate"}
                </span>
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your training..."
                className="flex-1 rounded-xl border border-outline-variant bg-surface px-4 py-3 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary transition disabled:opacity-50"
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
        </div>
      </div>
    </AppLayout>
  );
}
