import { useState, useEffect, useRef } from "react";
import {
  Layers, Image as ImageIcon, Crosshair, Play, Download,
  Paintbrush, Scissors, AlertTriangle, ExternalLink,
} from "lucide-react";
import {
  Panel, PanelHeader, Button, Input, Textarea, Label, Badge, ProgressBar, cn,
} from "../ui/cyber-ui";
import { usePipelineStore } from "../../store/use-pipeline-store";
import {
  useMeshyCreatePreview, useMeshyGetTask,
  useMeshyCreateRefine, useMeshyCreateRig, useMeshyGetRig,
  useMeshyCreateTextToImage, useMeshyGetTextToImage,
  useMeshyCreateRetexture, useMeshyGetRetexture,
  useMeshyCreateRemesh, useMeshyGetRemesh,
} from "../../hooks/use-meshy";
import type { RetextureFormat, RemeshFormat } from "../../types/api";

export function PipelinePanel() {
  return (
    <Panel className="h-full">
      <PanelHeader title="PIPELINE STATUS" icon={Layers} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <ConceptArtStep />
        <PreviewStep />
        <RefineStep />
        <RetextureStep />
        <RemeshStep />
        <RigStep />
      </div>
    </Panel>
  );
}

function StepCard({
  stepNum, title, status, progress, isActive, badge, children,
}: {
  stepNum: number | string;
  title: string;
  status?: string;
  progress?: number;
  isActive: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const statusColor =
    status === "SUCCEEDED" ? "bg-primary" :
    status === "FAILED" ? "bg-destructive" :
    (status === "IN_PROGRESS" || status === "PENDING") ? "bg-accent" : "bg-panel-border";

  return (
    <div className={cn(
      "border rounded-lg relative overflow-hidden transition-all duration-300",
      isActive
        ? "border-primary/50 shadow-[0_0_15px_rgba(57,255,20,0.1)]"
        : "border-panel-border opacity-60 grayscale-[50%]",
    )}>
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", statusColor)} />
      <div className="p-4 pl-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className={cn(
              "font-mono text-xs font-bold px-2 py-0.5 border rounded-sm",
              isActive ? "border-primary text-primary" : "border-muted text-muted",
            )}>
              STEP {String(stepNum).padStart(2, "0")}
            </span>
            <h3 className="font-bold text-lg tracking-widest">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {badge}
            {status && (
              <Badge status={status === "SUCCEEDED" ? "success" : status === "FAILED" ? "error" : status ? "warning" : "default"}>
                {status}
              </Badge>
            )}
          </div>
        </div>
        <div className={cn("space-y-4", !isActive && "pointer-events-none")}>
          {children}
        </div>
      </div>
      {typeof progress === "number" && <ProgressBar progress={progress} status={status} />}
    </div>
  );
}

function DownloadButton({ url, label }: { url?: string; label: string }) {
  if (!url) return null;
  return (
    <Button
      variant="outline"
      className="text-xs py-1 h-8"
      onClick={() => window.open(url, "_blank")}
    >
      <Download className="w-3 h-3" /> {label}
    </Button>
  );
}

function TaskIdRow({ id }: { id: string }) {
  return (
    <div className="text-[10px] font-mono text-muted flex items-center justify-between">
      <span>TASK_ID: {id}</span>
    </div>
  );
}

function ConceptArtStep() {
  const {
    textToImageTaskId, setTextToImageTaskId,
    conceptImageUrl, setConceptImageUrl,
    previewForm,
  } = usePipelineStore();

  const [imagePrompt, setImagePrompt] = useState("");
  const [model, setModel] = useState<"nano-banana" | "nano-banana-pro">("nano-banana");
  const [multiView, setMultiView] = useState(true);
  const [poseMode, setPoseMode] = useState<"t-pose" | "a-pose" | "">("t-pose");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "16:9" | "9:16" | "4:3" | "3:4">("1:1");

  const createTask = useMeshyCreateTextToImage();
  const taskQuery = useMeshyGetTextToImage(textToImageTaskId);

  const status = taskQuery.data?.status;
  const progress = taskQuery.data?.progress;
  const imageUrls = taskQuery.data?.result?.image_urls ?? [];

  useEffect(() => {
    if (status === "SUCCEEDED" && imageUrls.length > 0 && !conceptImageUrl) {
      setConceptImageUrl(imageUrls[0]);
    }
  }, [status, imageUrls, conceptImageUrl, setConceptImageUrl]);

  const effectivePrompt = imagePrompt || previewForm.prompt;

  const handleGenerate = () => {
    if (!effectivePrompt) return;
    createTask.mutate({
      prompt: effectivePrompt,
      ai_model: model,
      generate_multi_view: multiView,
      pose_mode: multiView ? "t-pose" : (poseMode || undefined),
      aspect_ratio: multiView ? undefined : aspectRatio,
    }, {
      onSuccess: (data) => {
        setTextToImageTaskId(data.result);
        setConceptImageUrl(null);
      },
    });
  };

  return (
    <StepCard
      stepNum="0"
      title="CONCEPT ART"
      isActive={true}
      status={status}
      progress={progress}
      badge={
        <span className="text-[10px] font-mono text-accent/70 border border-accent/30 px-1.5 py-0.5 rounded">
          OPTIONAL
        </span>
      }
    >
      <p className="text-[11px] text-muted font-mono">
        Generate T-pose reference art before committing to 3D generation.
      </p>

      <div>
        <Label>Image Prompt</Label>
        <Textarea
          value={imagePrompt}
          onChange={(e) => setImagePrompt(e.target.value)}
          placeholder={previewForm.prompt || "Describe the character for concept art..."}
          className="min-h-[72px]"
        />
        {!imagePrompt && previewForm.prompt && (
          <p className="text-[10px] text-muted mt-1 font-mono">↑ Using 3D prompt from chat</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Model</Label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as typeof model)}
            className="w-full bg-black/40 border border-panel-border p-2 text-sm text-foreground focus:border-primary/50 outline-none"
          >
            <option value="nano-banana">Standard</option>
            <option value="nano-banana-pro">Pro (Higher Quality)</option>
          </select>
        </div>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={multiView}
              onChange={(e) => setMultiView(e.target.checked)}
              className="accent-primary"
            />
            <span className="text-sm text-foreground/80">Multi-view T-pose</span>
          </label>
        </div>
      </div>

      {!multiView && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Pose Mode</Label>
            <select
              value={poseMode}
              onChange={(e) => setPoseMode(e.target.value as typeof poseMode)}
              className="w-full bg-black/40 border border-panel-border p-2 text-sm text-foreground focus:border-primary/50 outline-none"
            >
              <option value="t-pose">T-Pose</option>
              <option value="a-pose">A-Pose</option>
              <option value="">None</option>
            </select>
          </div>
          <div>
            <Label>Aspect Ratio</Label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as typeof aspectRatio)}
              className="w-full bg-black/40 border border-panel-border p-2 text-sm text-foreground focus:border-primary/50 outline-none"
            >
              <option value="1:1">1:1 Square</option>
              <option value="16:9">16:9 Landscape</option>
              <option value="9:16">9:16 Portrait</option>
              <option value="4:3">4:3</option>
              <option value="3:4">3:4</option>
            </select>
          </div>
        </div>
      )}

      <Button
        className="w-full !bg-accent/10 !text-accent border-accent/50 hover:!bg-accent/20"
        onClick={handleGenerate}
        isLoading={createTask.isPending || status === "IN_PROGRESS" || status === "PENDING"}
        disabled={!effectivePrompt || status === "IN_PROGRESS" || status === "PENDING"}
      >
        <ImageIcon className="w-4 h-4" /> Generate Concept Art
      </Button>

      {imageUrls.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {imageUrls.slice(0, 4).map((url, i) => (
            <div
              key={i}
              className={cn(
                "relative rounded border overflow-hidden cursor-pointer",
                conceptImageUrl === url ? "border-primary" : "border-panel-border",
              )}
              onClick={() => setConceptImageUrl(url)}
            >
              <img src={url} alt={`Concept ${i + 1}`} className="w-full h-auto object-cover" />
              {conceptImageUrl === url && (
                <div className="absolute top-1 right-1 bg-primary text-black text-[9px] font-bold px-1 rounded">
                  SELECTED
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {conceptImageUrl && (
        <p className="text-[10px] font-mono text-primary">
          ✓ Concept image selected — will be used as retexture style reference
        </p>
      )}

      {textToImageTaskId && <TaskIdRow id={textToImageTaskId} />}
    </StepCard>
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
      onSuccess: (data) => setPreviewTaskId(data.result),
    });
  };

  return (
    <StepCard
      stepNum={1}
      title="PREVIEW MESH"
      isActive={true}
      status={status}
      progress={progress}
    >
      <div>
        <Label>Prompt</Label>
        <Textarea
          value={previewForm.prompt}
          onChange={(e) => setPreviewForm({ prompt: e.target.value })}
          placeholder="Detailed description of your character..."
          className="min-h-[80px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Pose Mode</Label>
          <select
            value={previewForm.pose_mode}
            onChange={(e) => setPreviewForm({ pose_mode: e.target.value as any })}
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
              onChange={(e) => setPreviewForm({ target_polycount: parseInt(e.target.value) })}
              className="flex-1 accent-primary"
            />
            <span className="font-mono text-xs text-primary">
              {Math.round((previewForm.target_polycount || 0) / 1000)}k
            </span>
          </div>
        </div>
      </div>

      <Button
        className="w-full"
        onClick={handleGenerate}
        isLoading={createPreview.isPending || status === "IN_PROGRESS" || status === "PENDING"}
        disabled={!previewForm.prompt || status === "IN_PROGRESS" || status === "PENDING"}
      >
        <Play className="w-4 h-4" /> Initialize Preview
      </Button>

      {previewTaskId && <TaskIdRow id={previewTaskId} />}
    </StepCard>
  );
}

function RefineStep() {
  const { previewTaskId, refineTaskId, setRefineTaskId } = usePipelineStore();
  const previewQuery = useMeshyGetTask(previewTaskId);
  const isPreviewDone = previewQuery.data?.status === "SUCCEEDED";

  const [texturePrompt, setTexturePrompt] = useState("");
  const createRefine = useMeshyCreateRefine();
  const taskQuery = useMeshyGetTask(refineTaskId);

  const status = taskQuery.data?.status;
  const progress = taskQuery.data?.progress;
  const thumbUrl =
    taskQuery.data?.result?.thumbnail_url || previewQuery.data?.result?.thumbnail_url;

  const handleRefine = () => {
    if (!previewTaskId) return;
    createRefine.mutate({
      preview_task_id: previewTaskId,
      texture_prompt: texturePrompt,
      enable_pbr: true,
    }, {
      onSuccess: (data) => setRefineTaskId(data.result),
    });
  };

  return (
    <StepCard
      stepNum={2}
      title="PBR TEXTURE REFINE"
      isActive={isPreviewDone}
      status={status}
      progress={progress}
    >
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
            onChange={(e) => setTexturePrompt(e.target.value)}
            placeholder="Additional texturing details..."
            className="h-24"
          />
        </div>
      </div>

      <Button
        variant="secondary"
        className="w-full"
        onClick={handleRefine}
        isLoading={createRefine.isPending || status === "IN_PROGRESS" || status === "PENDING"}
        disabled={!isPreviewDone || status === "IN_PROGRESS" || status === "PENDING"}
      >
        <ImageIcon className="w-4 h-4" /> Apply PBR Textures
      </Button>

      {refineTaskId && <TaskIdRow id={refineTaskId} />}
    </StepCard>
  );
}

function RetextureStep() {
  const {
    previewTaskId, refineTaskId, retextureTaskId, setRetextureTaskId,
    conceptImageUrl,
  } = usePipelineStore();

  const previewQuery = useMeshyGetTask(previewTaskId);
  const refineQuery = useMeshyGetTask(refineTaskId);
  const isPreviewDone = previewQuery.data?.status === "SUCCEEDED";
  const isRefineDone = refineQuery.data?.status === "SUCCEEDED";
  const isActive = isPreviewDone || isRefineDone;

  const sourceTaskId = isRefineDone ? refineTaskId : previewTaskId;

  const [textStylePrompt, setTextStylePrompt] = useState("");
  const [imageStyleUrl, setImageStyleUrl] = useState(conceptImageUrl ?? "");
  const [standaloneModelUrl, setStandaloneModelUrl] = useState("");
  const [enablePbr, setEnablePbr] = useState(false);
  const prevConceptImageUrlRef = useRef(conceptImageUrl);
  const [enableOriginalUv, setEnableOriginalUv] = useState(true);
  const [removeLighting, setRemoveLighting] = useState(true);
  const [retextureAiModel, setRetextureAiModel] = useState<"meshy-5" | "meshy-6" | "latest">("latest");
  const [retextureFormats, setRetextureFormats] = useState<RetextureFormat[]>(["glb", "fbx"]);

  useEffect(() => {
    const prev = prevConceptImageUrlRef.current;
    prevConceptImageUrlRef.current = conceptImageUrl;
    if (!conceptImageUrl) return;
    if (imageStyleUrl === prev || !imageStyleUrl) {
      setImageStyleUrl(conceptImageUrl);
    }
  }, [conceptImageUrl]);

  const createRetexture = useMeshyCreateRetexture();
  const taskQuery = useMeshyGetRetexture(retextureTaskId);

  const status = taskQuery.data?.status;
  const progress = taskQuery.data?.progress;
  const result = taskQuery.data?.result;
  const modelUrls = result?.model_urls ?? {};

  const canSubmit =
    (isActive || !!standaloneModelUrl) &&
    retextureFormats.length > 0 &&
    (!!imageStyleUrl || !!textStylePrompt);

  const handleRetexture = () => {
    const resolvedImageUrl = imageStyleUrl || undefined;
    const payload: Parameters<ReturnType<typeof useMeshyCreateRetexture>["mutate"]>[0] = {
      ai_model: retextureAiModel,
      enable_pbr: enablePbr,
      enable_original_uv: enableOriginalUv,
      remove_lighting: removeLighting,
      target_formats: retextureFormats,
      text_style_prompt: resolvedImageUrl ? undefined : (textStylePrompt || undefined),
      image_style_url: resolvedImageUrl,
    };
    if (standaloneModelUrl) {
      payload.model_url = standaloneModelUrl;
    } else if (sourceTaskId) {
      payload.input_task_id = sourceTaskId;
    } else {
      return;
    }
    createRetexture.mutate(payload, {
      onSuccess: (data) => setRetextureTaskId(data.result),
    });
  };

  const toggleRetextureFormat = (fmt: RetextureFormat) => {
    setRetextureFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt],
    );
  };

  return (
    <StepCard
      stepNum="2B"
      title="RETEXTURE"
      isActive={isActive}
      status={status}
      progress={progress}
      badge={
        <span className="text-[10px] font-mono text-accent/70 border border-accent/30 px-1.5 py-0.5 rounded">
          OPTIONAL
        </span>
      }
    >
      <p className="text-[11px] text-muted font-mono">
        Re-style the model using a new texture prompt or your concept art image.
        {isActive && (
          <span className="text-primary">
            {" "}Input: {isRefineDone ? "refined" : "preview"} model.
          </span>
        )}
      </p>

      <div>
        <Label>Standalone Model URL (optional — overrides pipeline input)</Label>
        <Input
          type="url"
          value={standaloneModelUrl}
          onChange={(e) => setStandaloneModelUrl(e.target.value)}
          placeholder="https://... GLB/FBX URL to retexture directly"
          className="w-full"
        />
      </div>

      {conceptImageUrl && (
        <div className="flex items-center gap-2 text-[11px] font-mono text-primary bg-primary/5 border border-primary/20 rounded px-3 py-2">
          <img src={conceptImageUrl} alt="Concept" className="w-8 h-8 object-cover rounded border border-primary/50 shrink-0" />
          <span>Concept art detected — URL auto-filled below. Clear it to use a text prompt instead.</span>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <Label>Image Style URL {conceptImageUrl ? "(auto-filled from concept art)" : "(optional)"}</Label>
          <Input
            type="url"
            value={imageStyleUrl}
            onChange={(e) => setImageStyleUrl(e.target.value)}
            placeholder="https://... (overrides text prompt when provided)"
            className="w-full"
          />
          {imageStyleUrl && conceptImageUrl && imageStyleUrl === conceptImageUrl && (
            <p className="text-[10px] font-mono text-primary mt-1">↑ Auto-populated from concept art</p>
          )}
        </div>
        {!imageStyleUrl && (
          <div>
            <Label>Style Prompt</Label>
            <Textarea
              value={textStylePrompt}
              onChange={(e) => setTextStylePrompt(e.target.value)}
              placeholder="e.g. cyberpunk neon armor, dark metal plating, glowing circuitry..."
              className="h-20"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>AI Model</Label>
          <select
            value={retextureAiModel}
            onChange={(e) => setRetextureAiModel(e.target.value as typeof retextureAiModel)}
            className="w-full bg-black/40 border border-panel-border p-2 text-sm text-foreground focus:border-primary/50 outline-none"
          >
            <option value="latest">Latest</option>
            <option value="meshy-6">Meshy 6</option>
            <option value="meshy-5">Meshy 5</option>
          </select>
        </div>
        <div>
          <Label>Output Formats</Label>
          <div className="flex gap-3 pt-1 flex-wrap">
            {(["glb", "fbx", "obj", "usdz"] as const).map((fmt) => (
              <label key={fmt} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={retextureFormats.includes(fmt)}
                  onChange={() => toggleRetextureFormat(fmt)}
                  className="accent-primary"
                />
                <span className="text-xs font-mono uppercase">{fmt}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enablePbr}
            onChange={(e) => setEnablePbr(e.target.checked)}
            className="accent-primary"
          />
          <span className="text-sm text-foreground/80">Enable PBR maps</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enableOriginalUv}
            onChange={(e) => setEnableOriginalUv(e.target.checked)}
            className="accent-primary"
          />
          <span className="text-sm text-foreground/80">Preserve original UV</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={removeLighting}
            onChange={(e) => setRemoveLighting(e.target.checked)}
            className="accent-primary"
          />
          <span className="text-sm text-foreground/80">Remove baked lighting</span>
        </label>
      </div>

      <Button
        className="w-full !bg-accent/10 !text-accent border-accent/50 hover:!bg-accent/20"
        onClick={handleRetexture}
        isLoading={createRetexture.isPending || status === "IN_PROGRESS" || status === "PENDING"}
        disabled={
          !canSubmit ||
          status === "IN_PROGRESS" ||
          status === "PENDING"
        }
      >
        <Paintbrush className="w-4 h-4" /> Apply Retexture
      </Button>

      {status === "SUCCEEDED" && Object.keys(modelUrls).length > 0 && (
        <div className="pt-3 border-t border-panel-border">
          <Label className="text-primary mb-2">RETEXTURED MODEL</Label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(modelUrls).map(([fmt, url]) => (
              <DownloadButton key={fmt} url={url} label={`Retextured ${fmt.toUpperCase()}`} />
            ))}
          </div>
        </div>
      )}

      {retextureTaskId && <TaskIdRow id={retextureTaskId} />}
    </StepCard>
  );
}

function RemeshStep() {
  const {
    previewTaskId, refineTaskId, retextureTaskId,
    remeshTaskId, setRemeshTaskId, setRigTaskId,
  } = usePipelineStore();

  const previewQuery = useMeshyGetTask(previewTaskId);
  const refineQuery = useMeshyGetTask(refineTaskId);
  const retextureQuery = useMeshyGetRetexture(retextureTaskId);
  const isPreviewDone = previewQuery.data?.status === "SUCCEEDED";
  const isRefineDone = refineQuery.data?.status === "SUCCEEDED";
  const isRetextureDone = retextureQuery.data?.status === "SUCCEEDED";
  const isActive = isPreviewDone || isRefineDone || isRetextureDone;

  const sourceTaskId = isRetextureDone
    ? retextureTaskId
    : isRefineDone
    ? refineTaskId
    : previewTaskId;

  const sourceLabel = isRetextureDone
    ? "retextured"
    : isRefineDone
    ? "refined"
    : isPreviewDone
    ? "preview"
    : null;

  const [standaloneModelUrl, setStandaloneModelUrl] = useState("");
  const [topology, setTopology] = useState<"quad" | "triangle">("quad");
  const [targetPolycount, setTargetPolycount] = useState(30000);
  const [resizeHeight, setResizeHeight] = useState(0);
  const [autoSize, setAutoSize] = useState(false);
  const [remeshFormats, setRemeshFormats] = useState<RemeshFormat[]>(["glb", "fbx"]);

  const createRemesh = useMeshyCreateRemesh();
  const taskQuery = useMeshyGetRemesh(remeshTaskId);

  const status = taskQuery.data?.status;
  const progress = taskQuery.data?.progress;
  const modelUrls = taskQuery.data?.result?.model_urls ?? {};

  const canSubmit = (isActive || !!standaloneModelUrl) && remeshFormats.length > 0;

  const toggleRemeshFormat = (fmt: RemeshFormat) => {
    setRemeshFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt],
    );
  };

  const handleRemesh = () => {
    const payload: Parameters<ReturnType<typeof useMeshyCreateRemesh>["mutate"]>[0] = {
      topology,
      target_polycount: targetPolycount,
      target_formats: remeshFormats,
      resize_height: resizeHeight > 0 ? resizeHeight : undefined,
      auto_size: autoSize || undefined,
    };
    if (standaloneModelUrl) {
      payload.model_url = standaloneModelUrl;
    } else if (sourceTaskId) {
      payload.input_task_id = sourceTaskId;
    } else {
      return;
    }
    createRemesh.mutate(payload, {
      onSuccess: (data) => {
        setRemeshTaskId(data.result);
        setRigTaskId(null);
      },
    });
  };

  return (
    <StepCard
      stepNum={3}
      title="REMESH / OPTIMIZE"
      isActive={isActive}
      status={status}
      progress={progress}
      badge={
        <span className="flex items-center gap-1 text-[10px] font-mono text-warning border border-warning/40 px-1.5 py-0.5 rounded">
          <AlertTriangle className="w-3 h-3" /> REQUIRED &gt;300k FACES
        </span>
      }
    >
      <p className="text-[11px] text-muted font-mono">
        Reduce polycount and re-topology before rigging.
        {sourceLabel && (
          <span className="text-primary"> Input: {sourceLabel} model.</span>
        )}
      </p>

      <div>
        <Label>Standalone Model URL (optional — overrides pipeline input)</Label>
        <Input
          type="url"
          value={standaloneModelUrl}
          onChange={(e) => setStandaloneModelUrl(e.target.value)}
          placeholder="https://... GLB/OBJ/FBX URL to remesh directly"
          className="w-full"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Topology</Label>
          <select
            value={topology}
            onChange={(e) => setTopology(e.target.value as typeof topology)}
            className="w-full bg-black/40 border border-panel-border p-2 text-sm text-foreground focus:border-primary/50 outline-none"
          >
            <option value="quad">Quad (Better for Rigging)</option>
            <option value="triangle">Triangle</option>
          </select>
        </div>
        <div>
          <Label>Target Polycount</Label>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="range" min="1000" max="100000" step="1000"
              value={targetPolycount}
              onChange={(e) => setTargetPolycount(parseInt(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="font-mono text-xs text-primary">
              {Math.round(targetPolycount / 1000)}k
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Resize Height (m, 0 = off)</Label>
          <Input
            type="number" step="0.1" min="0"
            value={resizeHeight}
            onChange={(e) => setResizeHeight(parseFloat(e.target.value) || 0)}
            className="w-full"
            disabled={autoSize}
          />
        </div>
        <div>
          <Label>Output Formats</Label>
          <div className="flex gap-2 pt-1 flex-wrap">
            {(["glb", "fbx", "obj", "blend", "usdz", "stl"] as const).map((fmt) => (
              <label key={fmt} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remeshFormats.includes(fmt)}
                  onChange={() => toggleRemeshFormat(fmt)}
                  className="accent-primary"
                />
                <span className="text-xs font-mono uppercase">{fmt}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={autoSize}
          onChange={(e) => {
            setAutoSize(e.target.checked);
            if (e.target.checked) setResizeHeight(0);
          }}
          className="accent-primary"
        />
        <span className="text-sm text-foreground/80">Auto-size (AI estimates real-world height)</span>
      </label>

      <Button
        variant="secondary"
        className="w-full"
        onClick={handleRemesh}
        isLoading={createRemesh.isPending || status === "IN_PROGRESS" || status === "PENDING"}
        disabled={!canSubmit || status === "IN_PROGRESS" || status === "PENDING"}
      >
        <Scissors className="w-4 h-4" /> Remesh Model
      </Button>

      {status === "SUCCEEDED" && Object.keys(modelUrls).length > 0 && (
        <div className="pt-3 border-t border-panel-border">
          <Label className="text-primary mb-2">REMESHED OUTPUT</Label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(modelUrls).map(([fmt, url]) => (
              <DownloadButton key={fmt} url={url} label={`Remeshed ${fmt.toUpperCase()}`} />
            ))}
          </div>
        </div>
      )}

      {remeshTaskId && <TaskIdRow id={remeshTaskId} />}
    </StepCard>
  );
}

function RigStep() {
  const {
    refineTaskId, remeshTaskId, retextureTaskId,
    rigTaskId, setRigTaskId,
  } = usePipelineStore();

  const refineQuery = useMeshyGetTask(refineTaskId);
  const remeshQuery = useMeshyGetRemesh(remeshTaskId);
  const retextureQuery = useMeshyGetRetexture(retextureTaskId);

  const isRefineDone = refineQuery.data?.status === "SUCCEEDED";
  const isRemeshDone = remeshQuery.data?.status === "SUCCEEDED";
  const isRetextureDone = retextureQuery.data?.status === "SUCCEEDED";

  const isActive = isRefineDone || isRemeshDone || isRetextureDone;

  const sourceTaskId = isRemeshDone
    ? remeshTaskId
    : isRetextureDone
    ? retextureTaskId
    : refineTaskId;

  const sourceLabel = isRemeshDone
    ? "remeshed"
    : isRetextureDone
    ? "retextured"
    : "refined";

  const [height, setHeight] = useState("1.7");
  const createRig = useMeshyCreateRig();
  const rigQuery = useMeshyGetRig(rigTaskId);

  const status = rigQuery.data?.status;
  const progress = rigQuery.data?.progress;
  const result = rigQuery.data?.result;

  const handleRig = () => {
    if (!sourceTaskId) return;
    createRig.mutate(
      { input_task_id: sourceTaskId, height_meters: parseFloat(height) },
      { onSuccess: (data) => setRigTaskId(data.result) },
    );
  };

  return (
    <StepCard
      stepNum={4}
      title="AUTO-RIG BINDING"
      isActive={isActive}
      badge={<span className="text-[10px] font-mono text-yellow-400 border border-yellow-400/30 bg-yellow-400/5 px-2 py-0.5 rounded">Required if &gt;300k faces skipped</span>}
      status={status}
      progress={progress}
    >
      {isActive && (
        <p className="text-[11px] text-muted font-mono">
          Input: <span className="text-primary">{sourceLabel} model</span>
        </p>
      )}

      <div>
        <Label>Character Height (meters)</Label>
        <Input
          type="number" step="0.1"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          className="w-32"
        />
      </div>

      <Button
        className="w-full !bg-accent/10 !text-accent border-accent/50 hover:!bg-accent/20"
        onClick={handleRig}
        isLoading={createRig.isPending || status === "IN_PROGRESS" || status === "PENDING"}
        disabled={!isActive || status === "IN_PROGRESS" || status === "PENDING"}
      >
        <Crosshair className="w-4 h-4" /> Execute Rigging
      </Button>

      {result && status === "SUCCEEDED" && (
        <div className="pt-4 border-t border-panel-border mt-4 space-y-3">
          <Label className="text-primary">OUTPUT ARTIFACTS READY</Label>

          <div>
            <p className="text-[10px] font-mono text-muted mb-2">RIGGED CHARACTER</p>
            <div className="grid grid-cols-2 gap-2">
              <DownloadButton url={result.rigged_character_fbx_url} label="Rigged FBX" />
              <DownloadButton url={result.rigged_character_glb_url} label="Rigged GLB" />
            </div>
          </div>

          {result.basic_animations && (
            <div>
              <p className="text-[10px] font-mono text-muted mb-2">BASIC ANIMATIONS (with skin)</p>
              <div className="grid grid-cols-2 gap-2">
                <DownloadButton url={result.basic_animations.walking_glb_url} label="Walk (GLB)" />
                <DownloadButton url={result.basic_animations.walking_fbx_url} label="Walk (FBX)" />
                <DownloadButton url={result.basic_animations.running_glb_url} label="Run (GLB)" />
                <DownloadButton url={result.basic_animations.running_fbx_url} label="Run (FBX)" />
              </div>
            </div>
          )}

          {(result.basic_animations?.walking_armature_glb_url ||
            result.basic_animations?.running_armature_glb_url) && (
            <div>
              <p className="text-[10px] font-mono text-muted mb-2">ARMATURE ONLY (skeleton, no skin)</p>
              <div className="grid grid-cols-2 gap-2">
                <DownloadButton url={result.basic_animations?.walking_armature_glb_url} label="Walk Armature" />
                <DownloadButton url={result.basic_animations?.running_armature_glb_url} label="Run Armature" />
              </div>
            </div>
          )}
        </div>
      )}

      {rigTaskId && <TaskIdRow id={rigTaskId} />}
    </StepCard>
  );
}
