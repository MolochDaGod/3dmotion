import { useState, useEffect } from "react";
import { Layers, Image as ImageIcon, Crosshair, Play, Download, Settings2 } from "lucide-react";
import { Panel, PanelHeader, Button, Input, Textarea, Label, Badge, ProgressBar, cn } from "../ui/cyber-ui";
import { usePipelineStore } from "../../store/use-pipeline-store";
import { 
  useMeshyCreatePreview, useMeshyGetTask, 
  useMeshyCreateRefine, useMeshyCreateRig, useMeshyGetRig 
} from "../../hooks/use-meshy";

export function PipelinePanel() {
  return (
    <Panel className="h-full">
      <PanelHeader title="PIPELINE STATUS" icon={Layers} />
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <PreviewStep />
        <RefineStep />
        <RigStep />
      </div>
    </Panel>
  );
}

function StepCard({ 
  stepNum, title, status, progress, isActive, children 
}: { 
  stepNum: number, title: string, status?: string, progress?: number, isActive: boolean, children: React.ReactNode 
}) {
  const statusColor = 
    status === 'SUCCEEDED' ? 'bg-primary' : 
    status === 'FAILED' ? 'bg-destructive' : 
    (status === 'IN_PROGRESS' || status === 'PENDING') ? 'bg-accent' : 'bg-panel-border';

  return (
    <div className={cn(
      "border rounded-lg relative overflow-hidden transition-all duration-300",
      isActive ? "border-primary/50 shadow-[0_0_15px_rgba(57,255,20,0.1)]" : "border-panel-border opacity-60 grayscale-[50%]"
    )}>
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", statusColor)} />
      
      <div className="p-4 pl-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className={cn(
              "font-mono text-xs font-bold px-2 py-0.5 border rounded-sm",
              isActive ? "border-primary text-primary" : "border-muted text-muted"
            )}>STEP {0}{stepNum}</span>
            <h3 className="font-bold text-lg tracking-widest">{title}</h3>
          </div>
          {status && <Badge status={status === 'SUCCEEDED' ? 'success' : status === 'FAILED' ? 'error' : status ? 'warning' : 'default'}>{status}</Badge>}
        </div>
        
        <div className={cn("space-y-4", !isActive && "pointer-events-none")}>
          {children}
        </div>
      </div>
      
      {typeof progress === 'number' && (
         <ProgressBar progress={progress} status={status} />
      )}
    </div>
  );
}

function PreviewStep() {
  const { previewForm, setPreviewForm, previewTaskId, setPreviewTaskId } = usePipelineStore();
  const createPreview = useMeshyCreatePreview();
  const taskQuery = useMeshyGetTask(previewTaskId);

  const status = taskQuery.data?.status;
  const progress = taskQuery.data?.progress;

  const handleGenerate = () => {
    createPreview.mutate(previewForm, {
      onSuccess: (data) => setPreviewTaskId(data.result)
    });
  };

  return (
    <StepCard stepNum={1} title="PREVIEW MESH" isActive={true} status={status} progress={progress}>
      <div>
        <Label>Prompt</Label>
        <Textarea 
          id="preview-prompt"
          value={previewForm.prompt}
          onChange={e => setPreviewForm({ prompt: e.target.value })}
          placeholder="Detailed description..."
          className="min-h-[100px]"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Pose Mode</Label>
          <select 
            value={previewForm.pose_mode} 
            onChange={e => setPreviewForm({ pose_mode: e.target.value as any })}
            className="w-full bg-black/40 border border-panel-border p-2 text-sm text-foreground focus:border-primary/50 outline-none"
          >
            <option value="t-pose">T-Pose (Rigging Ready)</option>
            <option value="a-pose">A-Pose</option>
            <option value="">Default</option>
          </select>
        </div>
        <div>
          <Label>Polycount Target</Label>
          <div className="flex items-center gap-2 pt-1">
            <input 
              type="range" min="1000" max="100000" step="1000"
              value={previewForm.target_polycount}
              onChange={e => setPreviewForm({ target_polycount: parseInt(e.target.value) })}
              className="flex-1 accent-primary"
            />
            <span className="font-mono text-xs text-primary">{Math.round((previewForm.target_polycount||0)/1000)}k</span>
          </div>
        </div>
      </div>

      <Button 
        className="w-full" 
        onClick={handleGenerate}
        isLoading={createPreview.isPending || (status === 'IN_PROGRESS' || status === 'PENDING')}
        disabled={!previewForm.prompt || status === 'IN_PROGRESS' || status === 'PENDING'}
      >
        <Play className="w-4 h-4" /> Initialize Preview
      </Button>

      {previewTaskId && (
        <div className="text-[10px] font-mono text-muted flex items-center justify-between">
          <span>TASK_ID: {previewTaskId}</span>
        </div>
      )}
    </StepCard>
  );
}

function RefineStep() {
  const { previewTaskId, refineTaskId, setRefineTaskId } = usePipelineStore();
  const previewQuery = useMeshyGetTask(previewTaskId);
  const isPreviewDone = previewQuery.data?.status === 'SUCCEEDED';
  
  const [texturePrompt, setTexturePrompt] = useState("");
  const createRefine = useMeshyCreateRefine();
  const taskQuery = useMeshyGetTask(refineTaskId);

  const status = taskQuery.data?.status;
  const progress = taskQuery.data?.progress;
  const thumbUrl = taskQuery.data?.result?.thumbnail_url || previewQuery.data?.result?.thumbnail_url;

  const handleRefine = () => {
    if (!previewTaskId) return;
    createRefine.mutate({
      preview_task_id: previewTaskId,
      texture_prompt: texturePrompt,
      enable_pbr: true
    }, {
      onSuccess: (data) => setRefineTaskId(data.result)
    });
  };

  return (
    <StepCard stepNum={2} title="PBR TEXTURE REFINE" isActive={isPreviewDone} status={status} progress={progress}>
      <div className="flex gap-4">
        {thumbUrl && (
          <div className="w-24 h-24 rounded border border-panel-border overflow-hidden shrink-0 bg-black/50">
            <img src={thumbUrl} alt="Preview" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1">
          <Label>Refinement Prompt (Optional)</Label>
          <Textarea 
            value={texturePrompt}
            onChange={e => setTexturePrompt(e.target.value)}
            placeholder="Specific texturing details..."
            className="h-24"
          />
        </div>
      </div>

      <Button 
        variant="secondary"
        className="w-full" 
        onClick={handleRefine}
        isLoading={createRefine.isPending || (status === 'IN_PROGRESS' || status === 'PENDING')}
        disabled={!isPreviewDone || status === 'IN_PROGRESS' || status === 'PENDING'}
      >
        <ImageIcon className="w-4 h-4" /> Apply Textures
      </Button>

      {refineTaskId && (
        <div className="text-[10px] font-mono text-muted">TASK_ID: {refineTaskId}</div>
      )}
    </StepCard>
  );
}

function RigStep() {
  const { refineTaskId, rigTaskId, setRigTaskId } = usePipelineStore();
  const refineQuery = useMeshyGetTask(refineTaskId);
  const isRefineDone = refineQuery.data?.status === 'SUCCEEDED';
  
  const [height, setHeight] = useState("1.7");
  const createRig = useMeshyCreateRig();
  const rigQuery = useMeshyGetRig(rigTaskId);

  const status = rigQuery.data?.status;
  const progress = rigQuery.data?.progress;
  const result = rigQuery.data?.result;

  const handleRig = () => {
    if (!refineTaskId) return;
    createRig.mutate({
      input_task_id: refineTaskId,
      height_meters: parseFloat(height)
    }, {
      onSuccess: (data) => setRigTaskId(data.result)
    });
  };

  return (
    <StepCard stepNum={3} title="AUTO-RIG BINDING" isActive={isRefineDone} status={status} progress={progress}>
      <div>
        <Label>Character Height (meters)</Label>
        <Input 
          type="number" step="0.1" 
          value={height}
          onChange={e => setHeight(e.target.value)}
          className="w-32"
        />
      </div>

      <Button 
        className="w-full !bg-accent/10 !text-accent border-accent/50 hover:!bg-accent/20" 
        onClick={handleRig}
        isLoading={createRig.isPending || (status === 'IN_PROGRESS' || status === 'PENDING')}
        disabled={!isRefineDone || status === 'IN_PROGRESS' || status === 'PENDING'}
      >
        <Crosshair className="w-4 h-4" /> Execute Rigging
      </Button>

      {result && status === 'SUCCEEDED' && (
        <div className="pt-4 border-t border-panel-border mt-4">
          <Label className="text-primary mb-2">OUTPUT ARTIFACTS READY</Label>
          <div className="grid grid-cols-2 gap-2">
            {result.rigged_character_fbx_url && (
              <Button variant="outline" className="text-xs py-1 h-8" onClick={() => window.open(result.rigged_character_fbx_url)}>
                <Download className="w-3 h-3" /> Rigged FBX
              </Button>
            )}
            {result.rigged_character_glb_url && (
              <Button variant="outline" className="text-xs py-1 h-8" onClick={() => window.open(result.rigged_character_glb_url)}>
                <Download className="w-3 h-3" /> Rigged GLB
              </Button>
            )}
            {result.basic_animations?.running_fbx_url && (
              <Button variant="outline" className="text-xs py-1 h-8" onClick={() => window.open(result.basic_animations?.running_fbx_url)}>
                <Download className="w-3 h-3" /> Run Anim (FBX)
              </Button>
            )}
            {result.basic_animations?.walking_fbx_url && (
              <Button variant="outline" className="text-xs py-1 h-8" onClick={() => window.open(result.basic_animations?.walking_fbx_url)}>
                <Download className="w-3 h-3" /> Walk Anim (FBX)
              </Button>
            )}
          </div>
        </div>
      )}
    </StepCard>
  );
}
