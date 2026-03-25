import { create } from "zustand";
import type { PreviewRequest } from "../types/api";

interface PipelineState {
  // Chat -> Form payload
  suggestedPrompt: string;
  suggestedParams: Partial<PreviewRequest> | null;
  setSuggestedConfig: (prompt: string, params?: Partial<PreviewRequest>) => void;

  // Task IDs
  previewTaskId: string | null;
  setPreviewTaskId: (id: string | null) => void;
  
  refineTaskId: string | null;
  setRefineTaskId: (id: string | null) => void;
  
  rigTaskId: string | null;
  setRigTaskId: (id: string | null) => void;

  // Form State (kept here so it persists across panel remounts if any)
  previewForm: PreviewRequest;
  setPreviewForm: (data: Partial<PreviewRequest>) => void;
}

const defaultPreviewForm: PreviewRequest = {
  prompt: "",
  ai_model: "latest",
  model_type: "standard",
  topology: "quad",
  target_polycount: 30000,
  should_remesh: true,
  pose_mode: "t-pose",
  enable_pbr: true,
  target_formats: ["glb", "fbx"]
};

export const usePipelineStore = create<PipelineState>((set) => ({
  suggestedPrompt: "",
  suggestedParams: null,
  setSuggestedConfig: (prompt, params) => set((state) => ({ 
    suggestedPrompt: prompt, 
    suggestedParams: params || null,
    previewForm: { ...state.previewForm, prompt, ...params }
  })),

  previewTaskId: null,
  setPreviewTaskId: (id) => set({ previewTaskId: id }),
  
  refineTaskId: null,
  setRefineTaskId: (id) => set({ refineTaskId: id }),
  
  rigTaskId: null,
  setRigTaskId: (id) => set({ rigTaskId: id }),

  previewForm: defaultPreviewForm,
  setPreviewForm: (data) => set((state) => ({ previewForm: { ...state.previewForm, ...data } })),
}));
