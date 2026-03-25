import { Bone, Code, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Panel, PanelHeader, Button, cn } from "../ui/cyber-ui";
import { usePipelineStore } from "../../store/use-pipeline-store";
import { useMeshyGetRig } from "../../hooks/use-meshy";

export function SkeletonPanel() {
  const { rigTaskId } = usePipelineStore();
  const rigQuery = useMeshyGetRig(rigTaskId);
  const fbxUrl = rigQuery.data?.result?.rigged_character_fbx_url || "(paste rigged FBX URL here)";

  const [copied, setCopied] = useState(false);

  const codeSnippet = `{
  id: "meshy_custom_01",
  name: "Generated Operator",
  mesh: "${fbxUrl}",
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
