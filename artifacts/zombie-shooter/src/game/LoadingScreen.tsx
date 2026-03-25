import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";

// ── ProgressBridge — lives inside the Canvas so useProgress works ─────────────
export function ProgressBridge({
  onProgress,
  onLoaded,
}: {
  onProgress: (p: number) => void;
  onLoaded:   () => void;
}) {
  const { progress, active, total, loaded } = useProgress();
  const readyFired  = useRef(false);
  const hasStarted  = useRef(false);

  useEffect(() => {
    if (total > 0) hasStarted.current = true;
    onProgress(progress);

    if (
      !readyFired.current &&
      hasStarted.current &&
      !active &&
      loaded > 0 &&
      loaded >= total
    ) {
      readyFired.current = true;
      const t = setTimeout(onLoaded, 300);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [progress, active, total, loaded, onProgress, onLoaded]);

  return null;
}

// ── Loading overlay — simple dark screen, no video ────────────────────────────
const MESSAGES = [
  "Awakening the dead…",
  "Sharpening the blades…",
  "Summoning the horde…",
  "Polishing the tombstones…",
  "Lighting the torches…",
  "Digging the graves…",
];

export function LoadingScreen({ progress }: { progress: number }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [dots,   setDots]   = useState("");

  useEffect(() => {
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % MESSAGES.length), 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 420);
    return () => clearInterval(t);
  }, []);

  const pct = Math.round(progress);

  return (
    <div
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         9999,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        background:     "#050905",
        fontFamily:     "'Courier New', Courier, monospace",
        color:          "#e8ddd0",
        userSelect:     "none",
      }}
    >
      {/* Title */}
      <h1
        style={{
          fontSize:      "clamp(1.6rem, 4vw, 2.8rem)",
          fontWeight:    900,
          color:         "#cc1111",
          margin:        "0 0 8px",
          letterSpacing: 6,
          textShadow:    "0 0 30px #cc111166",
        }}
      >
        MOTION TRAINING
      </h1>

      {/* Divider */}
      <div style={{ width: 220, height: 1, background: "linear-gradient(90deg,transparent,#6a2a1a,transparent)", margin: "16px 0 24px" }} />

      {/* Progress bar track */}
      <div
        style={{
          width:        "min(420px, 72vw)",
          height:       14,
          background:   "#0e1409",
          border:       "1px solid #2a1a0a",
          borderRadius: 2,
          overflow:     "hidden",
          boxShadow:    "0 0 10px #00000080 inset",
        }}
      >
        <div
          style={{
            height:     "100%",
            width:      `${pct}%`,
            background: "linear-gradient(90deg, #7a0a0a, #cc2222, #ee4444)",
            boxShadow:  "0 0 12px #cc222280",
            transition: "width 0.25s ease-out",
          }}
        />
      </div>

      {/* Percentage */}
      <p style={{ margin: "10px 0 0", fontSize: 12, color: "#5a4a3a", letterSpacing: 3 }}>
        {pct < 100 ? `${pct}%` : "READY"}
      </p>

      {/* Flavour message */}
      <p
        style={{
          marginTop:     28,
          fontSize:      13,
          color:         "#6a5a4a",
          letterSpacing: 2,
          minHeight:     20,
          textTransform: "uppercase",
        }}
      >
        {MESSAGES[msgIdx]}{dots}
      </p>

      {/* Bottom tag */}
      <div style={{ position: "absolute", bottom: 24, fontSize: 10, color: "#2a1a0a", letterSpacing: 4 }}>
        THIRD PERSON SHOOTER
      </div>
    </div>
  );
}
