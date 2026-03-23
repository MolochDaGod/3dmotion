import { useState } from "react";
import Game from "@/game/Game";

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);

  const handleStart = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
  };

  const handleGameOver = (finalScore: number) => {
    setGameOver(true);
    setScore(finalScore);
    setGameStarted(false);
  };

  if (!gameStarted) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-6xl font-bold mb-4 text-red-500 drop-shadow-lg">
            ZOMBIE HUNTER
          </h1>
          {gameOver && (
            <div className="mb-6">
              <p className="text-2xl text-yellow-400 mb-2">GAME OVER</p>
              <p className="text-xl">Final Score: <span className="text-red-400 font-bold">{score}</span></p>
            </div>
          )}
          <p className="text-gray-400 mb-2 text-lg">Third Person Shooter</p>
          <div className="text-gray-500 text-sm mb-8 space-y-1">
            <p>WASD — Move &nbsp;·&nbsp; Shift — Sprint &nbsp;·&nbsp; Space — Jump</p>
            <p>Mouse — Aim &nbsp;·&nbsp; LMB — Shoot &nbsp;·&nbsp; R — Reload</p>
            <p>RMB — Melee &nbsp;·&nbsp; Ctrl — Roll (dodge) &nbsp;·&nbsp; Alt — Crouch</p>
          </div>
          <button
            onClick={handleStart}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-12 rounded-lg text-xl transition-colors border-2 border-red-400"
          >
            {gameOver ? "PLAY AGAIN" : "START GAME"}
          </button>
        </div>
      </div>
    );
  }

  return <Game onGameOver={handleGameOver} />;
}

export default App;
