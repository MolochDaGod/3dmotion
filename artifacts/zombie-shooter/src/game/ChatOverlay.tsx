/**
 * ChatOverlay — fixed bottom-left chat panel for world chat.
 * Press Enter to open, type, Enter to send, Escape to close.
 */
import { useEffect, useRef, useState } from "react";
import { useMMOStore } from "./useMMOStore";
import { sendChat } from "./MMOClient";

const MAX_VISIBLE = 8;
const FADE_AFTER_MS = 12_000;

export function ChatOverlay() {
  const username = useMMOStore((s) => s.username);
  const chat     = useMMOStore((s) => s.chat);
  const connected = useMMOStore((s) => s.connected);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [chat]);

  // Global key listener: Enter opens chat
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Enter") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 30);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function send() {
    const text = draft.trim();
    if (!text || !username) return;
    sendChat(username, text);
    setDraft("");
  }

  if (!username) return null;

  const visibleMessages = chat.slice(-MAX_VISIBLE);
  const now = Date.now();

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        left: 20,
        width: 340,
        zIndex: 500,
        fontFamily: "'Courier New', monospace",
        pointerEvents: open ? "auto" : "none",
        userSelect: open ? "text" : "none",
      }}
    >
      {/* Message list */}
      <div
        ref={listRef}
        style={{
          maxHeight: 160,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          marginBottom: 4,
          paddingBottom: 2,
          // Hide scrollbar
          scrollbarWidth: "none",
        }}
      >
        {visibleMessages.map((m, i) => {
          const age    = now - m.ts;
          const fading = !open && age > FADE_AFTER_MS;
          const opacity = fading
            ? Math.max(0, 1 - (age - FADE_AFTER_MS) / 4000)
            : (open ? 1 : 0.85);
          const isMine = m.username === username;
          return (
            <div
              key={`${m.ts}-${i}`}
              style={{
                opacity,
                transition: "opacity 1s",
                background: "rgba(0,0,0,0.55)",
                borderRadius: 3,
                padding: "2px 7px",
                fontSize: 12,
                lineHeight: 1.5,
                pointerEvents: "auto",
                backdropFilter: "blur(2px)",
              }}
            >
              <span style={{ color: isMine ? "#39ff14" : "#7dd3fc", fontWeight: "bold" }}>
                {m.username}
              </span>
              <span style={{ color: "#ccc" }}>: {m.text}</span>
            </div>
          );
        })}
      </div>

      {/* Input */}
      {open && (
        <div style={{ display: "flex", gap: 4, pointerEvents: "auto" }}>
          <input
            ref={inputRef}
            value={draft}
            maxLength={256}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); send(); }
              if (e.key === "Escape") { setOpen(false); setDraft(""); }
            }}
            placeholder="Say something… (Esc to close)"
            style={{
              flex: 1,
              background: "rgba(0,0,0,0.75)",
              border: "1px solid #39ff14",
              borderRadius: 3,
              color: "#fff",
              fontSize: 12,
              padding: "5px 8px",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={send}
            style={{
              background: "transparent",
              border: "1px solid #39ff14",
              color: "#39ff14",
              fontSize: 11,
              padding: "0 10px",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            Send
          </button>
        </div>
      )}

      {/* Prompt hint when closed */}
      {!open && (
        <div style={{ color: "rgba(200,200,200,0.3)", fontSize: 10, paddingLeft: 2, pointerEvents: "none" }}>
          {connected ? "↵ Enter — open chat" : "· offline"}
        </div>
      )}
    </div>
  );
}
