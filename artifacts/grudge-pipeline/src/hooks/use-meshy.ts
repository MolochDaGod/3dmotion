import { useMutation, useQuery } from "@tanstack/react-query";
import type { 
  ChatRequest, ChatResponse, PreviewRequest, RefineRequest, 
  RigRequest, TaskIdResponse, MeshyTask, RigTask 
} from "../types/api";

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

export function useMeshyChat() {
  return useMutation({
    mutationFn: (data: ChatRequest) => 
      fetchApi<ChatResponse>("/meshy/chat", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
}

export function useMeshyCreatePreview() {
  return useMutation({
    mutationFn: (data: PreviewRequest) => 
      fetchApi<TaskIdResponse>("/meshy/text-to-3d/preview", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
}

export function useMeshyCreateRefine() {
  return useMutation({
    mutationFn: (data: RefineRequest) => 
      fetchApi<TaskIdResponse>("/meshy/text-to-3d/refine", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
}

export function useMeshyGetTask(id: string | null) {
  return useQuery({
    queryKey: ["meshyTask", id],
    queryFn: () => fetchApi<MeshyTask>(`/meshy/text-to-3d/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "SUCCEEDED" || status === "FAILED" || status === "EXPIRED") {
        return false;
      }
      return 3000; // Poll every 3s
    },
  });
}

export function useMeshyCreateRig() {
  return useMutation({
    mutationFn: (data: RigRequest) => 
      fetchApi<TaskIdResponse>("/meshy/rig", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
}

export function useMeshyGetRig(id: string | null) {
  return useQuery({
    queryKey: ["meshyRigTask", id],
    queryFn: () => fetchApi<RigTask>(`/meshy/rig/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "SUCCEEDED" || status === "FAILED" || status === "EXPIRED") {
        return false;
      }
      return 3000;
    },
  });
}
