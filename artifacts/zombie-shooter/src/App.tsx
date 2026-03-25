import { useEffect, useRef, useState } from "react";
import Game from "@/game/Game";

function TitleScreen({
  onStart,
  gameOver,
  score,
}: {
  onStart: () => void;
  gameOver: boolean;
  score: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = 0.2;
    v.play().catch(() => {});
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      {/* ── Background video ───────────────────────────────────────────── */}
      <video
        ref={videoRef}
        src="/hero-scroll.mp4"
        autoPlay
        loop
        muted
        playsInline
        style={{
          position:  "absolute",
          inset:     0,
          width:     "100%",
          height:    "100%",
          objectFit: "cover",
          zIndex:    0,
        }}
      />

      {/* ── Dark gradient overlay ──────────────────────────────────────── */}
      <div
        style={{
          position:   "absolute",
          inset:      0,
          zIndex:     1,
          background: "linear-gradient(to bottom, rgba(2,5,2,0.55) 0%, rgba(5,10,6,0.82) 55%, rgba(5,10,6,0.97) 100%)",
        }}
      />

      {/* ── UI content ────────────────────────────────────────────────── */}
      <div
        style={{
          position:       "relative",
          zIndex:         2,
          height:         "100%",
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          fontFamily:     "'Courier New', Courier, monospace",
          color:          "#e8ddd0",
          userSelect:     "none",
        }}
      >
        {/* Decorative border */}
        <div style={{ opacity: 0.22, fontSize: 13, letterSpacing: 8, marginBottom: 28, color: "#8a6a4a" }}>
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

        {/* Game Over panel */}
        {gameOver && (
          <div style={{ marginBottom: 24, textAlign: "center" }}>
            <p style={{ fontSize: "1.5rem", color: "#FFD700", margin: "0 0 6px", letterSpacing: 4 }}>GAME OVER</p>
            <p style={{ fontSize: "1.1rem", margin: 0 }}>
              Final Score: <span style={{ color: "#ee4444", fontWeight: "bold" }}>{score}</span>
            </p>
          </div>
        )}

        {/* Subtitle */}
        {!gameOver && (
          <p style={{ color: "#7a6a5a", letterSpacing: 4, fontSize: 14, margin: "0 0 28px", textTransform: "uppercase" }}>
            Third Person Shooter
          </p>
        )}

        {/* Controls */}
        <div style={{ color: "#5a4a3a", fontSize: 12, textAlign: "center", lineHeight: 1.9, marginBottom: 36, letterSpacing: 1 }}>
          <p style={{ margin: 0 }}>WASD — Move &nbsp;·&nbsp; Shift — Sprint &nbsp;·&nbsp; Space — Jump &nbsp;·&nbsp; Alt — Crouch</p>
          <p style={{ margin: 0 }}>Mouse — Aim &nbsp;·&nbsp; LMB — Shoot / Attack &nbsp;·&nbsp; R — Spell Radial</p>
          <p style={{ margin: 0 }}>Q — Cycle Weapon &nbsp;·&nbsp; F — Cast Spell &nbsp;·&nbsp; Ctrl — Roll &nbsp;·&nbsp; C — Character &nbsp;·&nbsp; P — Camera</p>
          <p style={{ margin: 0 }}>1 / 2 / 3 / 4 — Weapon Skills</p>
        </div>

        {/* Start button */}
        <button
          onClick={onStart}
          style={{
            background:    "linear-gradient(180deg, #aa1111, #771111)",
            border:        "2px solid #ee3333",
            color:         "#fff",
            fontFamily:    "inherit",
            fontWeight:    900,
            fontSize:      18,
            letterSpacing: 4,
            padding:       "14px 52px",
            borderRadius:  4,
            cursor:        "pointer",
            textTransform: "uppercase",
            boxShadow:     "0 0 24px #cc111155, 0 2px 0 #000",
            transition:    "all 0.12s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(180deg, #cc1111, #991111)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 36px #cc1111aa, 0 2px 0 #000";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(180deg, #aa1111, #771111)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 24px #cc111155, 0 2px 0 #000";
          }}
        >
          {gameOver ? "PLAY AGAIN" : "START GAME"}
        </button>

        {/* Bottom decoration */}
        <div style={{ position: "absolute", bottom: 28, fontSize: 11, color: "#2a1a0a", letterSpacing: 4 }}>
          THIRD PERSON SHOOTER
        </div>
      </div>
    </div>
  );
}

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver,    setGameOver]    = useState(false);
  const [score,       setScore]       = useState(0);

  const handleStart    = () => { setGameStarted(true); setGameOver(false); setScore(0); };
  const handleGameOver = (finalScore: number) => { setGameOver(true); setScore(finalScore); setGameStarted(false); };

  if (!gameStarted) {
    return <TitleScreen onStart={handleStart} gameOver={gameOver} score={score} />;
  }

  return <Game onGameOver={handleGameOver} />;
}

export default App;
