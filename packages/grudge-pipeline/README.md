# @grudgestudio/pipeline

> Dark cyberpunk Meshy AI Studio — React components, hooks, and Zustand store for generating, texturing, remeshing, and auto-rigging 3D game characters via the Meshy API.

## Install

```bash
npm install @grudgestudio/pipeline
# or
pnpm add @grudgestudio/pipeline
```

### Peer dependencies

```bash
npm install react react-dom @tanstack/react-query zustand framer-motion lucide-react
```

## Usage

### Drop-in UI panels

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatPanel, PipelinePanel, SkeletonPanel } from "@grudgestudio/pipeline";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="grid grid-cols-3 h-screen">
        <ChatPanel />
        <PipelinePanel />
        <SkeletonPanel />
      </div>
    </QueryClientProvider>
  );
}
```

### Configure the API base URL

By default hooks call `/api/meshy/*`. Point them at your own backend:

```ts
// Before rendering any components:
(window as any).__GRUDGE_API_BASE = "https://your-api.example.com/api";
```

### Use hooks directly

```ts
import { useMeshyCreatePreview, useMeshyGetTask } from "@grudgestudio/pipeline";

function MyComponent() {
  const createPreview = useMeshyCreatePreview();
  const taskQuery = useMeshyGetTask(taskId);

  const start = () => createPreview.mutate({
    prompt: "cyberpunk ninja with a glowing katana",
    ai_model: "latest",
    pose_mode: "t-pose",
    topology: "quad",
    target_polycount: 30000,
    target_formats: ["glb", "fbx"],
  });
}
```

### Available hooks

| Hook | Description |
|---|---|
| `useMeshyChat` | Claude AI prompt optimizer |
| `useMeshyCreatePreview` / `useMeshyGetTask` | Text-to-3D preview |
| `useMeshyCreateRefine` | PBR texture refinement |
| `useMeshyCreateTextToImage` / `useMeshyGetTextToImage` | Concept art generation |
| `useMeshyCreateRetexture` / `useMeshyGetRetexture` | Retexture existing model |
| `useMeshyCreateRemesh` / `useMeshyGetRemesh` | Remesh / topology conversion |
| `useMeshyCreateRig` / `useMeshyGetRig` | Auto-rig to Mixamo skeleton |

### Zustand store

```ts
import { usePipelineStore } from "@grudgestudio/pipeline";

const { previewTaskId, rigTaskId, conceptImageUrl } = usePipelineStore();
```

## Backend requirements

Your API server must proxy these Meshy endpoints with a `Bearer <MESHY_API_KEY>` header:

| Route | Meshy endpoint |
|---|---|
| `POST /api/meshy/text-to-3d/preview` | `POST /openapi/v2/text-to-3d` (preview) |
| `POST /api/meshy/text-to-3d/refine` | `POST /openapi/v2/text-to-3d` (refine) |
| `GET /api/meshy/text-to-3d/:id` | `GET /openapi/v2/text-to-3d/:id` |
| `POST /api/meshy/text-to-image` | `POST /openapi/v1/text-to-image` |
| `GET /api/meshy/text-to-image/:id` | `GET /openapi/v1/text-to-image/:id` |
| `POST /api/meshy/retexture` | `POST /openapi/v1/retexture` |
| `GET /api/meshy/retexture/:id` | `GET /openapi/v1/retexture/:id` |
| `POST /api/meshy/remesh` | `POST /openapi/v1/remesh` |
| `GET /api/meshy/remesh/:id` | `GET /openapi/v1/remesh/:id` |
| `POST /api/meshy/rig` | `POST /openapi/v1/rigging` |
| `GET /api/meshy/rig/:id` | `GET /openapi/v1/rigging/:id` |
| `POST /api/meshy/chat` | Claude AI (Anthropic) |

## License

MIT
