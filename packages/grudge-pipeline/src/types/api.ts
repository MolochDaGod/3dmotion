export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  extractedPrompt?: string;
  extractedParams?: Partial<PreviewRequest>;
}

export interface PreviewRequest {
  prompt: string;
  ai_model?: 'meshy-5' | 'meshy-6' | 'latest';
  model_type?: 'standard' | 'lowpoly';
  topology?: 'quad' | 'triangle';
  target_polycount?: number;
  should_remesh?: boolean;
  pose_mode?: 'a-pose' | 't-pose' | '';
  target_formats?: ('glb' | 'fbx' | 'obj' | 'stl' | 'usdz')[];
  enable_pbr?: boolean;
}

export interface RefineRequest {
  preview_task_id: string;
  texture_prompt?: string;
  enable_pbr?: boolean;
  ai_model?: 'meshy-5' | 'meshy-6' | 'latest';
}

export interface RigRequest {
  input_task_id?: string;
  model_url?: string;
  height_meters?: number;
}

export interface TaskIdResponse {
  result: string;
}

export interface MeshyTaskResult {
  model_urls?: Record<string, string>;
  thumbnail_url?: string;
  video_url?: string;
  texture_urls?: Record<string, string>[];
}

export interface MeshyTask {
  id: string;
  type: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  progress: number;
  task_error?: { message: string };
  result?: MeshyTaskResult;
}

export interface RigTaskResult {
  rigged_character_fbx_url?: string;
  rigged_character_glb_url?: string;
  basic_animations?: {
    walking_glb_url?: string;
    walking_fbx_url?: string;
    walking_armature_glb_url?: string;
    running_glb_url?: string;
    running_fbx_url?: string;
    running_armature_glb_url?: string;
  };
}

export interface RigTask {
  id: string;
  type: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  progress: number;
  task_error?: { message: string };
  result?: RigTaskResult;
}

export type TextToImageAiModel = 'nano-banana' | 'nano-banana-pro';
export type TextToImagePoseMode = 'a-pose' | 't-pose' | '';
export type TextToImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export interface TextToImageRequest {
  prompt: string;
  ai_model?: TextToImageAiModel;
  generate_multi_view?: boolean;
  pose_mode?: TextToImagePoseMode;
  aspect_ratio?: TextToImageAspectRatio;
}

export interface TextToImageTaskResult {
  image_urls?: string[];
}

export interface TextToImageTask {
  id: string;
  type: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  progress: number;
  task_error?: { message: string };
  result?: TextToImageTaskResult;
}

export type RetextureFormat = 'glb' | 'fbx' | 'obj' | 'stl' | 'usdz';

export interface RetextureRequest {
  input_task_id?: string;
  model_url?: string;
  text_style_prompt?: string;
  image_style_url?: string;
  ai_model?: 'meshy-5' | 'meshy-6' | 'latest';
  enable_original_uv?: boolean;
  enable_pbr?: boolean;
  remove_lighting?: boolean;
  target_formats?: RetextureFormat[];
}

export interface RetextureTaskResult {
  model_urls?: Record<string, string>;
  texture_urls?: Record<string, string>[];
}

export interface RetextureTask {
  id: string;
  type: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  progress: number;
  task_error?: { message: string };
  result?: RetextureTaskResult;
}

export type RemeshFormat = 'glb' | 'fbx' | 'obj' | 'usdz' | 'blend' | 'stl';

export interface RemeshRequest {
  input_task_id?: string;
  model_url?: string;
  target_formats?: RemeshFormat[];
  topology?: 'quad' | 'triangle';
  target_polycount?: number;
  resize_height?: number;
  auto_size?: boolean;
  origin_at?: 'bottom' | 'center' | '';
  convert_format_only?: boolean;
}

export interface RemeshTaskResult {
  model_urls?: Record<string, string>;
}

export interface RemeshTask {
  id: string;
  type: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  progress: number;
  task_error?: { message: string };
  result?: RemeshTaskResult;
}
