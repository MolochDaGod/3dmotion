import { Bone, Code, Copy, Check, Send, Loader2 } from "lucide-react";
import { useState } from "react";
import { Panel, PanelHeader, Button, cn } from "../ui/cyber-ui";
import { usePipelineStore } from "../../store/use-pipeline-store";
import { useMeshyGetRig } from "../../hooks/use-meshy";

const fetchApi = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "API request failed");
  }
  return res.json();
};

export function SkeletonPanel() {
  const { rigTaskId } = usePipelineStore();
  const rigQuery = useMeshyGetRig(rigTaskId);
  const fbxUrl = rigQuery.data?.result?.rigged_character_fbx_url;
  const rigSucceeded = rigQuery.data?.status === "SUCCEEDED" && !!fbxUrl;

  const [copied, setCopied] = useState(false);
  const [sendName, setSendName] = useState("");
  const [sendScale, setSendScale] = useState(0.01);
  const [sendColor, setSendColor] = useState("#39ff14");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<"success" | "error" | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const displayUrl = fbxUrl ?? "(paste rigged FBX URL here)";

  const codeSnippet = `{
  id: "meshy_custom_01",
  name: "Generated Operator",
  mesh: "${displayUrl}",
  scale: 1,
  capsuleHH: 0.9,
  capsuleR: 0.4,
  color: "#39ff14"
}`;

  const copyCode = () => {
    navigator.clipboard.writeText(codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToGame = async () => {
    if (!fbxUrl || !sendName.trim()) return;
    setSending(true);
    setSendResult(null);
    setSendError(null);
    try {
      await fetchApi("/characters", {
        method: "POST",
        body: JSON.stringify({
          name: sendName.trim(),
          meshUrl: fbxUrl,
          scale: sendScale,
          capsuleHH: 0.5,
          capsuleR: 0.35,
          color: sendColor,
          source: "meshy",
        }),
      });
      setSendResult("success");
      setSendName("");
    } catch (err) {
      setSendResult("error");
      setSendError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSending(false);
    }
  };

  return (
    <Panel className="h-full">
      <PanelHeader title="SKELETON MAP" icon={Bone} />
      
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        
        <div className="bg-black/30 border border-panel-border p-3 rounded font-mono text-xs text-muted">
          <p className="text-primary mb-2">// MIXAMO_COMPAT_HIERARCHY</p>
          <ul className="pl-2 border-l border-panel-border/50 ml-2 space-y-1">
            <li>mixamorig:Hips
              <ul className="pl-4 border-l border-panel-border/50 ml-2 space-y-1 mt-1">
                <li>mixamorig:Spine
                  <ul className="pl-4 border-l border-panel-border/50 ml-2 space-y-1 mt-1">
                    <li>mixamorig:Spine1
                      <ul className="pl-4 border-l border-panel-border/50 ml-2 space-y-1 mt-1">
                        <li>mixamorig:Spine2
                          <ul className="pl-4 border-l border-panel-border/50 ml-2 space-y-1 mt-1">
                            <li>mixamorig:Neck</li>
                            <li>mixamorig:RightShoulder
                              <ul className="pl-4 border-l border-panel-border/50 ml-2 space-y-1 mt-1">
                                <li>mixamorig:RightArm
                                  <ul className="pl-4 border-l border-panel-border/50 ml-2 space-y-1 mt-1">
                                    <li>mixamorig:RightForeArm
                                      <ul className="pl-4 border-l border-primary ml-2 space-y-1 mt-1 py-1">
                                        <li className="text-primary font-bold bg-primary/10 px-1 inline-block rounded">
                                          ► mixamorig:RightHand [WEAPON_MOUNT]
                                        </li>
                                      </ul>
                                    </li>
                                  </ul>
                                </li>
                              </ul>
                            </li>
                            <li className="opacity-50">mixamorig:LeftShoulder...</li>
                          </ul>
                        </li>
                      </ul>
                    </li>
                  </ul>
                </li>
                <li className="opacity-50">mixamorig:RightUpLeg...</li>
                <li className="opacity-50">mixamorig:LeftUpLeg...</li>
              </ul>
            </li>
          </ul>
        </div>

        {rigSucceeded && (
          <div className="border border-primary/30 rounded-lg p-4 bg-primary/5 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-primary font-mono text-xs font-bold">
              <Send className="w-3 h-3" />
              SEND TO GAME
            </div>
            <p className="font-mono text-[10px] text-muted leading-relaxed">
              Save this character to the game roster. It will appear in Motion Training's character select screen on the next load.
            </p>

            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[10px] text-muted">Character Name</label>
                <input
                  type="text"
                  value={sendName}
                  onChange={(e) => setSendName(e.target.value)}
                  placeholder="e.g. Volt Specter"
                  className={cn(
                    "bg-black/50 border border-panel-border rounded px-2 py-1.5",
                    "font-mono text-xs text-foreground placeholder:text-muted/40",
                    "focus:outline-none focus:border-primary/50",
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-[10px] text-muted">Scale (Mixamo ≈ 0.01)</label>
                  <input
                    type="number"
                    value={sendScale}
                    onChange={(e) => setSendScale(parseFloat(e.target.value) || 0.01)}
                    step={0.001}
                    min={0.001}
                    max={10}
                    className={cn(
                      "bg-black/50 border border-panel-border rounded px-2 py-1.5",
                      "font-mono text-xs text-foreground",
                      "focus:outline-none focus:border-primary/50",
                    )}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-[10px] text-muted">HUD Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={sendColor}
                      onChange={(e) => setSendColor(e.target.value)}
                      className="w-8 h-7 rounded cursor-pointer bg-transparent border-0"
                    />
                    <span className="font-mono text-[10px] text-muted">{sendColor}</span>
                  </div>
                </div>
              </div>
            </div>

            <Button
              variant="default"
              className="w-full gap-2 font-mono text-xs"
              disabled={sending || !sendName.trim()}
              onClick={handleSendToGame}
            >
              {sending ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> SENDING...</>
              ) : (
                <><Send className="w-3 h-3" /> DEPLOY TO GAME</>
              )}
            </Button>

            {sendResult === "success" && (
              <div className="flex items-center gap-2 font-mono text-[10px] text-primary">
                <Check className="w-3 h-3" />
                Character added to game roster! Reload Motion Training to see it.
              </div>
            )}
            {sendResult === "error" && (
              <div className="font-mono text-[10px] text-destructive">
                Error: {sendError}
              </div>
            )}
          </div>
        )}

        <div className="border border-panel-border rounded-lg overflow-hidden flex flex-col">
          <div className="bg-black/50 px-3 py-2 border-b border-panel-border flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-accent flex items-center gap-2">
              <Code className="w-3 h-3" /> CharacterRegistry Export
            </span>
            <Button variant="ghost" className="h-6 px-2 text-[10px]" onClick={copyCode}>
              {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
            </Button>
          </div>
          <pre className="p-3 text-[11px] font-mono text-foreground/80 overflow-x-auto bg-[#0a0a0f]">
            <code>{codeSnippet}</code>
          </pre>
        </div>

      </div>
    </Panel>
  );
}
