import { create } from "zustand";
import type { PreviewRequest } from "../types/api";

interface PipelineState {
  suggestedPrompt: string;
  suggestedParams: Partial<PreviewRequest> | null;
  setSuggestedConfig: (prompt: string, params?: Partial<PreviewRequest>) => void;

  previewTaskId: string | null;
  setPreviewTaskId: (id: string | null) => void;

  refineTaskId: string | null;
  setRefineTaskId: (id: string | null) => void;

  rigTaskId: string | null;
  setRigTaskId: (id: string | null) => void;

  textToImageTaskId: string | null;
  setTextToImageTaskId: (id: string | null) => void;

  conceptImageUrl: string | null;
  setConceptImageUrl: (url: string | null) => void;

  remeshTaskId: string | null;
  setRemeshTaskId: (id: string | null) => void;

  retextureTaskId: string | null;
  setRetextureTaskId: (id: string | null) => void;

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
  target_formats: ["glb", "fbx"],
};

export const usePipelineStore = create<PipelineState>((set) => ({
  suggestedPrompt: "",
  suggestedParams: null,
  setSuggestedConfig: (prompt, params) =>
    set((state) => ({
      suggestedPrompt: prompt,
      suggestedParams: params || null,
      previewForm: { ...state.previewForm, prompt, ...params },
    })),

  previewTaskId: null,
  setPreviewTaskId: (id) => set({ previewTaskId: id }),

  refineTaskId: null,
  setRefineTaskId: (id) => set({ refineTaskId: id }),

  rigTaskId: null,
  setRigTaskId: (id) => set({ rigTaskId: id }),

  textToImageTaskId: null,
  setTextToImageTaskId: (id) => set({ textToImageTaskId: id }),

  conceptImageUrl: null,
  setConceptImageUrl: (url) => set({ conceptImageUrl: url }),

  remeshTaskId: null,
  setRemeshTaskId: (id) => set({ remeshTaskId: id }),

  retextureTaskId: null,
  setRetextureTaskId: (id) => set({ retextureTaskId: id }),

  previewForm: defaultPreviewForm,
  setPreviewForm: (data) =>
    set((state) => ({ previewForm: { ...state.previewForm, ...data } })),
}));
