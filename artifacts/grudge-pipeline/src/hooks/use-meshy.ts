import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  ChatRequest, ChatResponse, PreviewRequest, RefineRequest,
  RigRequest, TaskIdResponse, MeshyTask, RigTask,
  TextToImageRequest, TextToImageTask,
  RetextureRequest, RetextureTask,
  RemeshRequest, RemeshTask,
} from "../types/api";

const DONE_STATUSES = new Set(["SUCCEEDED", "FAILED", "EXPIRED"]);

const fetchApi = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || "API request failed");
  }
  return res.json();
};

function pollInterval(status?: string): number | false {
  if (!status || DONE_STATUSES.has(status)) return false;
  return 3000;
}

export function useMeshyChat() {
  return useMutation({
    mutationFn: (data: ChatRequest) =>
      fetchApi<ChatResponse>("/meshy/chat", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useMeshyCreatePreview() {
  return useMutation({
    mutationFn: (data: PreviewRequest) =>
      fetchApi<TaskIdResponse>("/meshy/text-to-3d/preview", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useMeshyCreateRefine() {
  return useMutation({
    mutationFn: (data: RefineRequest) =>
      fetchApi<TaskIdResponse>("/meshy/text-to-3d/refine", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useMeshyGetTask(id: string | null) {
  return useQuery({
    queryKey: ["meshyTask", id],
    queryFn: () => fetchApi<MeshyTask>(`/meshy/text-to-3d/${id}`),
    enabled: !!id,
    refetchInterval: (query) => pollInterval(query.state.data?.status),
  });
}

export function useMeshyCreateRig() {
  return useMutation({
    mutationFn: (data: RigRequest) =>
      fetchApi<TaskIdResponse>("/meshy/rig", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useMeshyGetRig(id: string | null) {
  return useQuery({
    queryKey: ["meshyRigTask", id],
    queryFn: () => fetchApi<RigTask>(`/meshy/rig/${id}`),
    enabled: !!id,
    refetchInterval: (query) => pollInterval(query.state.data?.status),
  });
}

export function useMeshyCreateTextToImage() {
  return useMutation({
    mutationFn: (data: TextToImageRequest) =>
      fetchApi<TaskIdResponse>("/meshy/text-to-image", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useMeshyGetTextToImage(id: string | null) {
  return useQuery({
    queryKey: ["meshyTextToImage", id],
    queryFn: () => fetchApi<TextToImageTask>(`/meshy/text-to-image/${id}`),
    enabled: !!id,
    refetchInterval: (query) => pollInterval(query.state.data?.status),
  });
}

export function useMeshyCreateRetexture() {
  return useMutation({
    mutationFn: (data: RetextureRequest) =>
      fetchApi<TaskIdResponse>("/meshy/retexture", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useMeshyGetRetexture(id: string | null) {
  return useQuery({
    queryKey: ["meshyRetexture", id],
    queryFn: () => fetchApi<RetextureTask>(`/meshy/retexture/${id}`),
    enabled: !!id,
    refetchInterval: (query) => pollInterval(query.state.data?.status),
  });
}

export function useMeshyCreateRemesh() {
  return useMutation({
    mutationFn: (data: RemeshRequest) =>
      fetchApi<TaskIdResponse>("/meshy/remesh", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useMeshyGetRemesh(id: string | null) {
  return useQuery({
    queryKey: ["meshyRemesh", id],
    queryFn: () => fetchApi<RemeshTask>(`/meshy/remesh/${id}`),
    enabled: !!id,
    refetchInterval: (query) => pollInterval(query.state.data?.status),
  });
}
