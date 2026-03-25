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
  const [dots, setDots]     = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % MESSAGES.length), 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 420);
    return () => clearInterval(t);
  }, []);

  // Attempt autoplay (browsers may block if not muted — video is muted)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = 0.2;
    v.play().catch(() => {});
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
        fontFamily:     "'Courier New', Courier, monospace",
        color:          "#e8ddd0",
        userSelect:     "none",
        overflow:       "hidden",
      }}
    >
      {/* ── Background video ─────────────────────────────────────────── */}
      <video
        ref={videoRef}
        src="/hero-scroll.mp4"
        autoPlay
        loop
        muted
        playsInline
        style={{
          position:   "absolute",
          inset:      0,
          width:      "100%",
          height:     "100%",
          objectFit:  "cover",
          zIndex:     0,
        }}
      />

      {/* ── Dark gradient overlay so text stays legible ───────────────── */}
      <div
        style={{
          position:   "absolute",
          inset:      0,
          zIndex:     1,
          background: "linear-gradient(to bottom, rgba(2,5,2,0.55) 0%, rgba(5,10,6,0.80) 60%, rgba(5,10,6,0.95) 100%)",
        }}
      />

      {/* ── All UI content sits above the overlay ─────────────────────── */}
      <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>

        {/* Decorative border */}
        <div style={{ opacity: 0.25, fontSize: 13, letterSpacing: 8, marginBottom: 28, color: "#8a6a4a" }}>
          ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦ ✦
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize:      "clamp(2.4rem, 7vw, 5rem)",
            fontWeight:    900,
            color:         "#cc1111",
            margin:        0,
            letterSpacing: 6,
            textShadow:    "0 0 40px #cc111180, 0 0 80px #cc111140, 0 2px 0 #000",
            lineHeight:    1,
          }}
        >
          MOTION TRAINING
        </h1>

        {/* Sub-divider */}
        <div style={{ width: 320, height: 1, background: "linear-gradient(90deg,transparent,#8a3a2a,transparent)", margin: "22px 0" }} />

        {/* Progress bar */}
        <div
          style={{
            width:        "min(480px, 80vw)",
            height:       18,
            background:   "#0e1409",
            border:       "1px solid #3a2a1a",
            borderRadius: 2,
            overflow:     "hidden",
            boxShadow:    "0 0 12px #00000080 inset",
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

        {/* Percentage */}
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "#6a5a4a", letterSpacing: 3 }}>
          {pct < 100 ? `${pct}%` : "READY"}
        </p>

        {/* Flavour message */}
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
      </div>

      {/* Bottom decoration */}
      <div style={{ position: "absolute", bottom: 28, zIndex: 2, fontSize: 11, color: "#3a2a1a", letterSpacing: 4 }}>
        THIRD PERSON SHOOTER
      </div>
    </div>
  );
}
