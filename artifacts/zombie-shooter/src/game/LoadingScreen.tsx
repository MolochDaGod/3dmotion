import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";

// ── ProgressBridge — lives inside the Canvas so useProgress works ─────────────
// Calls onProgress/onLoaded whenever the drei loading manager updates.
// Guards against firing onLoaded before any assets have started loading.
export function ProgressBridge({
  onProgress,
  onLoaded,
}: {
  onProgress: (p: number) => void;
  onLoaded:   () => void;
}) {
  const { progress, active, total, loaded } = useProgress();
  const readyFired  = useRef(false);
  const hasStarted  = useRef(false); // true once at least one asset has been queued

  useEffect(() => {
    if (total > 0) hasStarted.current = true;
    onProgress(progress);

    // Only fire onLoaded after loading has actually started and completed
    if (
      !readyFired.current &&
      hasStarted.current &&
      !active &&
      loaded > 0 &&
      loaded >= total
    ) {
      readyFired.current = true;
      // Small delay so the progress bar can visually reach 100% first
      const t = setTimeout(onLoaded, 300);
      return () => clearTimeout(t);
    }
  }, [progress, active, total, loaded, onProgress, onLoaded]);

  return null;
}

// ── Loading overlay — lives OUTSIDE the Canvas ────────────────────────────────
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
  const [dots, setDots] = useState("");

  // Cycle through flavour messages every 2 s
  useEffect(() => {
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % MESSAGES.length), 2000);
    return () => clearInterval(t);
  }, []);

  // Animate trailing dots
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 420);
    return () => clearInterval(t);
  }, []);

  const pct = Math.round(progress);

  return (
    <div
      style={{
        position:        "fixed",
        inset:           0,
        zIndex:          9999,
        background:      "#050a06",
        display:         "flex",
        flexDirection:   "column",
        alignItems:      "center",
        justifyContent:  "center",
        fontFamily:      "'Courier New', Courier, monospace",
        color:           "#e8ddd0",
        userSelect:      "none",
      }}
    >
      {/* ── Decorative border ───────────────────────────────────────── */}
      <div style={{ opacity: 0.25, fontSize: 13, letterSpacing: 8, marginBottom: 28, color: "#8a6a4a" }}>
        ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦
      </div>

      {/* ── Title ───────────────────────────────────────────────────── */}
      <h1
        style={{
          fontSize:    "clamp(2.4rem, 7vw, 5rem)",
          fontWeight:  900,
          color:       "#cc1111",
          margin:      0,
          letterSpacing: 6,
          textShadow:  "0 0 40px #cc111180, 0 0 80px #cc111140, 0 2px 0 #000",
          lineHeight:  1,
        }}
      >
        MOTION TRAINING
      </h1>

      {/* ── Sub-divider ─────────────────────────────────────────────── */}
      <div style={{ width: 320, height: 1, background: "linear-gradient(90deg,transparent,#8a3a2a,transparent)", margin: "22px 0" }} />

      {/* ── Progress bar ────────────────────────────────────────────── */}
      <div
        style={{
          width:         "min(480px, 80vw)",
          height:        18,
          background:    "#0e1409",
          border:        "1px solid #3a2a1a",
          borderRadius:  2,
          overflow:      "hidden",
          boxShadow:     "0 0 12px #00000080 inset",
        }}
      >
        <div
          style={{
            height:     "100%",
            width:      `${pct}%`,
            background: "linear-gradient(90deg, #7a0a0a, #cc2222, #ee4444)",
            boxShadow:  "0 0 14px #cc222280",
            transition: "width 0.25s ease-out",
          }}
        />
      </div>

      {/* ── Percentage ──────────────────────────────────────────────── */}
      <p style={{ margin: "10px 0 0", fontSize: 13, color: "#6a5a4a", letterSpacing: 3 }}>
        {pct < 100 ? `${pct}%` : "READY"}
      </p>

      {/* ── Flavour message ─────────────────────────────────────────── */}
      <p
        style={{
          marginTop:     32,
          fontSize:      14,
          color:         "#7a6a5a",
          letterSpacing: 2,
          minHeight:     20,
          textTransform: "uppercase",
        }}
      >
        {MESSAGES[msgIdx]}{dots}
      </p>

      {/* ── Bottom decoration ───────────────────────────────────────── */}
      <div style={{ position: "absolute", bottom: 28, fontSize: 11, color: "#3a2a1a", letterSpacing: 4 }}>
        THIRD PERSON SHOOTER
      </div>
    </div>
  );
}
