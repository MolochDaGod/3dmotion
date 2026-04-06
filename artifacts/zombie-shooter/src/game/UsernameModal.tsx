/**
 * UsernameModal — shown once on first play to pick an MMO display name.
 * Persists to localStorage via useMMOStore.
 */
import { useState } from "react";
import { useMMOStore } from "./useMMOStore";

export function UsernameModal() {
  const username    = useMMOStore((s) => s.username);
  const setUsername = useMMOStore((s) => s.setUsername);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  if (username) return null; // already set — don't show

  function confirm() {
    const trimmed = draft.trim();
    if (trimmed.length < 2) { setError("Name must be at least 2 characters."); return; }
    if (trimmed.length > 18) { setError("Max 18 characters."); return; }
    setUsername(trimmed);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.82)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Courier New', monospace",
    }}>
      <div style={{
        background: "#0a0a0a",
        border: "1px solid #39ff14",
        borderRadius: 4,
        padding: "32px 40px",
        minWidth: 320,
        boxShadow: "0 0 32px rgba(57,255,20,0.18)",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ color: "#39ff14", fontSize: 11, letterSpacing: 4, textTransform: "uppercase", marginBottom: 4 }}>
          MMO — Set Display Name
        </div>
        <div style={{ color: "#aaa", fontSize: 12 }}>
          Other players will see this name above your character.
        </div>
        <input
          autoFocus
          maxLength={18}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && confirm()}
          placeholder="YourName"
          style={{
            background: "#111",
            border: "1px solid #333",
            borderRadius: 3,
            color: "#fff",
            fontSize: 15,
            padding: "8px 12px",
            outline: "none",
            letterSpacing: 1,
          }}
        />
        {error && <div style={{ color: "#ef4444", fontSize: 11 }}>{error}</div>}
        <button
          onClick={confirm}
          style={{
            background: "transparent",
            border: "1px solid #39ff14",
            color: "#39ff14",
            padding: "8px 0",
            borderRadius: 3,
            cursor: "pointer",
            fontSize: 13,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          Join World
        </button>
      </div>
    </div>
  );
}
