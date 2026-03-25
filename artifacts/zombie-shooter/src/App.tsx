import { useEffect, useState } from "react";
import Game from "@/game/Game";
import { EditorPanel } from "@/game/EditorPanel";
import { useEditorStore } from "@/game/useEditorStore";
import { MainMenu } from "@/game/MainMenu";

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver,    setGameOver]    = useState(false);
  const [score,       setScore]       = useState(0);

  const { editorVisible, toggleEditor, togglePerf } = useEditorStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Backquote") { e.preventDefault(); toggleEditor(); }
      if (e.code === "F2")        { e.preventDefault(); togglePerf(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleEditor, togglePerf]);

  const handleStart    = () => { setGameStarted(true); setGameOver(false); setScore(0); };
  const handleGameOver = (finalScore: number) => { setGameOver(true); setScore(finalScore); setGameStarted(false); };

  return (
    <>
      <style>{`#leva__root { display: ${editorVisible ? "block" : "none"} !important; }`}</style>
      <EditorPanel />

      {gameStarted
        ? <Game onGameOver={handleGameOver} />
        : <MainMenu onStart={handleStart} gameOver={gameOver} score={score} />
      }
    </>
  );
}

export default App;
