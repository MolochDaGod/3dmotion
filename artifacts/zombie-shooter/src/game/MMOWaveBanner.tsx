/**
 * MMOWaveBanner — shows a brief on-screen banner when the shared wave changes.
 * "Wave 4 — 3 players online"
 */
import { useEffect, useRef, useState } from "react";
import { useMMOStore } from "./useMMOStore";

export function MMOWaveBanner() {
  const wave = useMMOStore((s) => s.wave);
  const [visible, setVisible] = useState(false);
  const prevWaveRef = useRef(0);
  const timerRef   = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (wave.wave === prevWaveRef.current) return;
    prevWaveRef.current = wave.wave;
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 3_500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [wave.wave]);

  if (!visible) return null;

  const count = wave.playerCount;
  return (
    <div style={{
      position: "fixed",
      top: "18%",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 600,
      textAlign: "center",
      fontFamily: "'Courier New', monospace",
      pointerEvents: "none",
      animation: "mmoWaveFadeIn 0.35s ease",
    }}>
      <style>{`
        @keyframes mmoWaveFadeIn {
          from { opacity: 0; transform: translateX(-50%) scale(0.85); }
          to   { opacity: 1; transform: translateX(-50%) scale(1); }
        }
      `}</style>
      <div style={{
        background: "rgba(0,0,0,0.72)",
        border: "1px solid #39ff14",
        borderRadius: 4,
        padding: "10px 28px",
        boxShadow: "0 0 20px rgba(57,255,20,0.2)",
      }}>
        <div style={{ color: "#39ff14", fontSize: 22, letterSpacing: 6, textTransform: "uppercase", fontWeight: "bold" }}>
          Wave {wave.wave}
        </div>
        <div style={{ color: "#aaa", fontSize: 11, letterSpacing: 2, marginTop: 3 }}>
          {count} {count === 1 ? "player" : "players"} online
        </div>
      </div>
    </div>
  );
}
