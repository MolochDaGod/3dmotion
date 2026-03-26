# Grudge Pipeline — Meshy AI Character Studio

A web-based production pipeline for generating, texturing, rigging, and deploying AI-generated 3D game characters using the [Meshy AI API](https://www.meshy.ai/). Built as a React + Vite SPA with an Express backend.

---

## Table of Contents

1. [Overview](#overview)
2. [Pipeline Stages](#pipeline-stages)
3. [Project Structure](#project-structure)
4. [Source Files & What They Do](#source-files--what-they-do)
5. [API Routes (Backend)](#api-routes-backend)
6. [State Management](#state-management)
7. [Hooks & Data Fetching](#hooks--data-fetching)
8. [Type System](#type-system)
9. [Dependencies](#dependencies)
10. [Math & Animation](#math--animation)
11. [Controller & Controls](#controller--controls)
12. [Environment Variables](#environment-variables)
13. [Build & Deploy](#build--deploy)
14. [Database Schema](#database-schema)
15. [Character Registry Export](#character-registry-export)

---

## Overview

Grudge Pipeline is a three-panel editor:

```
┌─────────────────────────────────────────────────────────┐
│  AI LOG (left)  │  PIPELINE STATUS (center)  │  SKELETON MAP (right)  │
└─────────────────────────────────────────────────────────┘
```

- **AI LOG** — Conversational AI (Claude Haiku) that understands the Meshy API and generates optimized generation parameters. You describe your character in plain language; the AI responds with a structured `<meshy_params>` block that auto-fills the pipeline form.
- **PIPELINE STATUS** — Six sequential (and branching) steps that call the Meshy API to go from text → concept art → 3D mesh → PBR textures → rigged character with animations.
- **SKELETON MAP** — Shows the Mixamo-compatible bone hierarchy output from rigging, lets you configure and deploy the rigged character directly to the game roster database.

---

## Pipeline Stages

### Step 0 — Concept Art (Optional)
`POST /api/meshy/text-to-image`

Generates 2D reference images before committing to 3D generation. Supports:
- **Multi-view T-pose** (recommended for game characters) — generates 4 orthographic views simultaneously.
- Aspect ratios: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`.
- Models: `nano-banana` (standard), `nano-banana-pro` (higher quality).

The selected concept image URL flows downstream and auto-fills the Retexture step as a style reference.

### Step 1 — Preview Mesh
`POST /api/meshy/text-to-3d/preview`

Generates a low-fidelity 3D preview mesh from a text prompt. Key parameters:

| Parameter | Recommended | Notes |
|---|---|---|
| `pose_mode` | `t-pose` | Required for Mixamo rigging. Never use a-pose for rigging. |
| `topology` | `quad` | Quad meshes animate cleaner than triangle meshes. |
| `target_polycount` | `30000` | Good for web games. Use 10k–15k for mobile. |
| `should_remesh` | `true` | Cleaner mesh output. |
| `enable_pbr` | `true` | Produces albedo, normal, metalness, roughness maps. |
| `target_formats` | `["glb", "fbx"]` | GLB for web preview; FBX for Unity/Unreal/Mixamo. |

Poll `GET /api/meshy/text-to-3d/:id` every 3 seconds until `status === "SUCCEEDED"`.

### Step 2 — PBR Texture Refine
`POST /api/meshy/text-to-3d/refine`

Takes the preview task ID and generates full PBR textures (albedo, normal, metalness/roughness). Optional texture prompt to guide the material style.

### Step 2B — Retexture (Optional branch)
`POST /api/meshy/retexture`

Re-styles an existing model's textures without re-generating geometry. Accepts either:
- A pipeline task ID (from preview or refine).
- A standalone model URL (external GLB/FBX).

Style source: image URL (e.g. from Step 0 concept art) or a text style prompt.

Options:
- `enable_original_uv` — preserves the original UV layout.
- `remove_lighting` — strips baked lighting from textures.
- `enable_pbr` — outputs PBR maps.

### Step 3 — Remesh (Optional, needed before rigging if >300k faces)
`POST /api/meshy/remesh`

Decimates the mesh to a game-ready polycount. Required if your source mesh exceeds ~300,000 faces — the Meshy rigging API rejects dense meshes.

Options:
- `topology`: `quad` (for animation) or `triangle`.
- `target_polycount`: target face count.
- `resize_height`: resize character to a specific height in meters.
- `origin_at`: `bottom` or `center` — sets the mesh pivot.
- `convert_format_only`: skip decimation, just convert format.

### Step 4 — Rig
`POST /api/meshy/rig`

Runs automatic AI rigging, producing a **Mixamo-compatible skeleton** with the standard `mixamorig:*` bone naming convention. Output includes:

- `rigged_character_fbx_url` — full rigged character FBX.
- `rigged_character_glb_url` — full rigged character GLB.
- `basic_animations.walking_glb_url` — pre-baked walk cycle.
- `basic_animations.running_glb_url` — pre-baked run cycle.
- `basic_animations.walking_armature_glb_url` — walk cycle armature only (no mesh).
- `basic_animations.running_armature_glb_url` — run cycle armature only.

Input: either a pipeline task ID (`input_task_id`) or a direct model URL (`model_url`). `height_meters` defaults to `1.7`.

---

## Project Structure

```
artifacts/grudge-pipeline/
├── src/
│   ├── App.tsx                        # Root — router + QueryClient + Toaster
│   ├── main.tsx                       # Entry point
│   ├── index.css                      # Global styles (Tailwind + cyber theme)
│   │
│   ├── pages/
│   │   ├── Home.tsx                   # Three-panel layout
│   │   └── not-found.tsx              # 404 fallback
│   │
│   ├── components/
│   │   ├── panels/
│   │   │   ├── ChatPanel.tsx          # AI LOG — prompt optimizer chat UI
│   │   │   ├── PipelinePanel.tsx      # PIPELINE STATUS — 6-step pipeline UI
│   │   │   └── SkeletonPanel.tsx      # SKELETON MAP — bone tree + deploy UI
│   │   └── ui/
│   │       ├── cyber-ui.tsx           # Core design system (Panel, Button, Badge, etc.)
│   │       └── ...                    # shadcn/ui components (accordion, dialog, etc.)
│   │
│   ├── hooks/
│   │   ├── use-meshy.ts               # React Query hooks for all Meshy API endpoints
│   │   ├── use-toast.ts               # Toast notification hook
│   │   └── use-mobile.tsx             # Responsive breakpoint hook
│   │
│   ├── store/
│   │   └── use-pipeline-store.ts      # Zustand global state (task IDs, form, concept image)
│   │
│   ├── types/
│   │   └── api.ts                     # TypeScript interfaces for all API requests/responses
│   │
│   └── lib/
│       └── utils.ts                   # cn() — Tailwind class merger
│
├── vite.config.ts                     # Vite build config (reads PORT + BASE_PATH env vars)
├── package.json
└── README.md
```

---

## Source Files & What They Do

### `src/App.tsx`
Root application shell. Wraps everything in:
- `QueryClientProvider` — provides the React Query client to all children. Configured with `retry: false` and `refetchOnWindowFocus: false` (avoids spurious refetches during pipeline work).
- `WouterRouter` — lightweight client-side router, base path set from `import.meta.env.BASE_URL` for correct path-prefix routing when deployed under a sub-path.
- `Toaster` — global toast notification layer.

### `src/pages/Home.tsx`
Renders the three-panel layout using CSS flexbox. On desktop (`md:`), the panels are side-by-side at 25%/50%/25% width. On mobile, they stack vertically. A dev-mode warning banner is shown at the top when the API is not fully provisioned.

### `src/components/panels/ChatPanel.tsx`
The AI prompt optimization assistant.

**How it works:**
1. Maintains a local `messages: ChatMessage[]` array (kept in component state — not the global store).
2. On submit, calls `POST /api/meshy/chat` via `useMeshyChat()` mutation with the full conversation history.
3. The server calls Claude Haiku with a specialist system prompt and returns a `reply` plus optionally `extractedPrompt` and `extractedParams`.
4. If params are extracted (from the `<meshy_params>` XML block in Claude's response), calls `setSuggestedConfig()` on the Zustand store — this auto-populates the PipelinePanel's preview form and shows a "Use Optimized Prompt" button.
5. The textarea sends on `Enter` (without Shift), so Shift+Enter inserts a newline.

**Key interaction:**
The AI produces a `<meshy_params>{ ... }</meshy_params>` block inside its reply. The server strips this block from the visible response (so users see clean text), extracts the JSON, and returns it as `extractedParams`. The store merges it into `previewForm`.

### `src/components/panels/PipelinePanel.tsx`
The main pipeline controller. Contains six sub-components rendered sequentially:

- **`ConceptArtStep`** — Calls text-to-image, shows generated images in a 2×2 grid, lets user select a concept image for downstream use.
- **`PreviewStep`** — The primary text-to-3D preview generation. Shows a polycount slider (1k–100k range).
- **`RefineStep`** — Locked until preview succeeds. Shows the preview thumbnail alongside the texture prompt input.
- **`RetextureStep`** — Optional re-texturing branch. Auto-populates `image_style_url` from the concept image when one is selected.
- **`RemeshStep`** — Optional decimation step with all remesh options exposed.
- **`RigStep`** — Final step. Rigging requires a completed preview (or refined) task. Shows download buttons for rigged FBX/GLB and all animation clips.

**`StepCard` component:**
Each step is rendered inside a `StepCard` which:
- Shows a colored status indicator bar on the left edge (green = success, red = failed, yellow = in-progress).
- Dims and disables interaction (`pointer-events-none`, `grayscale`) when the step's prerequisite hasn't been met (`isActive` prop).
- Shows a live `ProgressBar` using the Meshy task `progress` field (0–100).

**Polling logic:**
All `useQuery` hooks for task status use the `refetchInterval` option. The `pollInterval()` helper in `use-meshy.ts` returns `3000` (ms) while the task is not in a terminal state (`SUCCEEDED`, `FAILED`, `EXPIRED`), and `false` once it's done — stopping polling automatically.

### `src/components/panels/SkeletonPanel.tsx`
Displays the Mixamo bone hierarchy and the "SEND TO GAME" deployment panel.

**Bone hierarchy displayed (abridged):**
```
mixamorig:Hips
└── mixamorig:Spine
    └── mixamorig:Spine1
        └── mixamorig:Spine2
            ├── mixamorig:Neck
            ├── mixamorig:RightShoulder
            │   └── mixamorig:RightArm
            │       └── mixamorig:RightForeArm
            │           └── mixamorig:RightHand  ← WEAPON_MOUNT
            └── mixamorig:LeftShoulder...
├── mixamorig:RightUpLeg...
└── mixamorig:LeftUpLeg...
```

`mixamorig:RightHand` (also aliased as `hand_r` / `RightHand` in some exporters) is the canonical weapon attachment socket.

**SEND TO GAME flow:**
1. Once rigging succeeds and `fbxUrl` is available, the form appears.
2. User sets: character name, scale (Mixamo FBX from Meshy uses ~0.01 world units), HUD color.
3. Clicking "DEPLOY TO GAME" calls `POST /api/characters` with `{ name, meshUrl, scale, capsuleHH, capsuleR, color, source: "meshy" }`.
4. The backend writes a row to the `ai_characters` PostgreSQL table.
5. On next load of the game client, this character appears in the character selection screen.

**CharacterRegistry Export:**
A copyable code snippet formatted as a character definition object. Useful for manually adding characters to a hardcoded registry without the database.

### `src/hooks/use-meshy.ts`
All Meshy API integrations live here as React Query hooks. See [Hooks & Data Fetching](#hooks--data-fetching) for details.

### `src/store/use-pipeline-store.ts`
Zustand store holding the shared pipeline state. See [State Management](#state-management).

### `src/types/api.ts`
TypeScript types for all request/response shapes. See [Type System](#type-system).

### `src/lib/utils.ts`
Single utility: `cn(...classes)` — merges Tailwind class strings using `clsx` + `tailwind-merge`. This correctly handles conflicting Tailwind classes (e.g., `cn("p-2 p-4")` → `"p-4"`).

### `vite.config.ts`
Build configuration. Reads two required environment variables at startup:
- `PORT` — the port Vite's dev server binds to.
- `BASE_PATH` — the URL sub-path prefix (e.g. `/grudge-pipeline/`), used for correct asset URLs when the app is hosted at a path other than `/`.

The `@` alias maps to `src/`, so `import "@/components/..."` resolves correctly in both dev and build.

---

## API Routes (Backend)

All routes are prefixed with `/api` by the Express app. The backend is a separate artifact (`artifacts/api-server`).

### `POST /api/meshy/chat`
Calls Claude Haiku (Anthropic) with a specialist system prompt. Parses `<meshy_params>` XML block from the response.

**Request:** `{ messages: { role, content }[] }`
**Response:** `{ reply: string, extractedPrompt?: string, extractedParams?: object }`

The system prompt teaches Claude:
- All Meshy API parameters and their valid ranges.
- Game-specific best practices (T-pose for rigging, quad topology, 30k polys for web).
- The `<meshy_params>` output format for structured extraction.

### `POST /api/meshy/text-to-3d/preview`
Starts a Text-to-3D preview generation job.

**Maps to:** `POST https://api.meshy.ai/openapi/v2/text-to-3d` with `mode: "preview"`.
**Returns:** `{ result: "<task-id>" }`

### `GET /api/meshy/text-to-3d/:id`
Polls a Text-to-3D task (preview or refine).

**Maps to:** `GET https://api.meshy.ai/openapi/v2/text-to-3d/:id`
**Returns:** `MeshyTask` — includes `status`, `progress`, `result.model_urls`, `result.thumbnail_url`.

### `POST /api/meshy/text-to-3d/refine`
Starts PBR texture refinement on a completed preview.

**Maps to:** `POST https://api.meshy.ai/openapi/v2/text-to-3d` with `mode: "refine"`.

### `POST /api/meshy/text-to-image`
Generates concept art images.

**Maps to:** `POST https://api.meshy.ai/openapi/v1/text-to-image`

### `GET /api/meshy/text-to-image/:id`
Polls a text-to-image task.

### `POST /api/meshy/retexture`
Re-styles an existing mesh's textures.

**Maps to:** `POST https://api.meshy.ai/openapi/v1/retexture`

### `GET /api/meshy/retexture/:id`
Polls a retexture task.

### `POST /api/meshy/remesh`
Decimates / converts a mesh.

**Maps to:** `POST https://api.meshy.ai/openapi/v1/remesh`

### `GET /api/meshy/remesh/:id`
Polls a remesh task.

### `POST /api/meshy/rig`
Runs AI auto-rigging.

**Maps to:** `POST https://api.meshy.ai/openapi/v1/rigging`
**Input:** `{ input_task_id?, model_url?, height_meters? }`

### `GET /api/meshy/rig/:id`
Polls a rigging task.

**Returns:** `RigTask` — includes `rigged_character_fbx_url`, `rigged_character_glb_url`, and the `basic_animations` object with walking/running URLs.

### `GET /api/characters`
Lists all characters in the game roster (ordered newest-first).

**Returns:** `{ characters: AiCharacter[] }`

### `POST /api/characters`
Creates a new character in the game roster.

**Request:** `{ name, meshUrl, scale, capsuleHH, capsuleR, color, source }`
**Returns:** `{ character: AiCharacter }` with a generated UUID.

---

## State Management

`src/store/use-pipeline-store.ts` — a single Zustand store. All task IDs and the active preview form live here so all three panels stay synchronized.

| Field | Type | Purpose |
|---|---|---|
| `previewForm` | `PreviewRequest` | Live form state for Step 1. Merges AI-extracted params on chat response. |
| `suggestedPrompt` | `string` | Most recent AI-optimized prompt (shown as a hint in ChatPanel). |
| `suggestedParams` | `Partial<PreviewRequest>` | Params extracted from the AI response's `<meshy_params>` block. |
| `textToImageTaskId` | `string \| null` | Concept art task (Step 0). |
| `conceptImageUrl` | `string \| null` | Selected concept art URL — flows into retexture `image_style_url`. |
| `previewTaskId` | `string \| null` | Step 1 task. |
| `refineTaskId` | `string \| null` | Step 2 task. |
| `retextureTaskId` | `string \| null` | Step 2B task. |
| `remeshTaskId` | `string \| null` | Step 3 task. |
| `rigTaskId` | `string \| null` | Step 4 task. |

Default `previewForm` values: `ai_model: "latest"`, `topology: "quad"`, `target_polycount: 30000`, `should_remesh: true`, `pose_mode: "t-pose"`, `enable_pbr: true`, `target_formats: ["glb", "fbx"]`.

---

## Hooks & Data Fetching

All hooks are in `src/hooks/use-meshy.ts`. The pattern is:

**Mutation hooks** (for starting jobs):
```ts
const create = useMeshyCreateXxx();
create.mutate(payload, { onSuccess: (data) => setTaskId(data.result) });
```

**Query hooks** (for polling):
```ts
const query = useMeshyGetXxx(taskId); // null → disabled
const { status, progress, result } = query.data ?? {};
```

`pollInterval(status)` returns `3000` when status is `PENDING` or `IN_PROGRESS`, and `false` when status is `SUCCEEDED`, `FAILED`, or `EXPIRED` — passed to React Query's `refetchInterval`.

**All hooks:**

| Hook | Method | Purpose |
|---|---|---|
| `useMeshyChat()` | POST | Send conversation to Claude Haiku |
| `useMeshyCreatePreview()` | POST | Start Text-to-3D preview |
| `useMeshyGetTask(id)` | GET | Poll Text-to-3D task (preview or refine) |
| `useMeshyCreateRefine()` | POST | Start PBR texture refinement |
| `useMeshyCreateTextToImage()` | POST | Start concept art generation |
| `useMeshyGetTextToImage(id)` | GET | Poll text-to-image task |
| `useMeshyCreateRetexture()` | POST | Start retexture |
| `useMeshyGetRetexture(id)` | GET | Poll retexture task |
| `useMeshyCreateRemesh()` | POST | Start remesh/decimation |
| `useMeshyGetRemesh(id)` | GET | Poll remesh task |
| `useMeshyCreateRig()` | POST | Start AI rigging |
| `useMeshyGetRig(id)` | GET | Poll rigging task |

---

## Type System

All interfaces are in `src/types/api.ts`. Key types:

### `PreviewRequest`
```ts
{
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
```

### `MeshyTask`
```ts
{
  id: string;
  type: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  progress: number; // 0–100
  task_error?: { message: string };
  result?: {
    model_urls?: Record<string, string>; // { glb: "...", fbx: "..." }
    thumbnail_url?: string;
    video_url?: string;
    texture_urls?: Record<string, string>[];
  };
}
```

### `RigTaskResult`
```ts
{
  rigged_character_fbx_url?: string;
  rigged_character_glb_url?: string;
  basic_animations?: {
    walking_glb_url?: string;
    walking_fbx_url?: string;
    walking_armature_glb_url?: string; // armature only, no mesh
    running_glb_url?: string;
    running_fbx_url?: string;
    running_armature_glb_url?: string;
  };
}
```

---

## Dependencies

### Runtime / Core

| Package | Version | Purpose |
|---|---|---|
| `react` / `react-dom` | 19.x | UI framework |
| `zustand` | 5.x | Global state management (pipeline task IDs, form state) |
| `@tanstack/react-query` | 5.x | Async data fetching, caching, polling |
| `wouter` | 3.x | Lightweight client-side router (~2 KB) |
| `framer-motion` | 11.x | Layout / transition animations |
| `lucide-react` | — | Icon library (SVG icons) |

### UI / Styling

| Package | Version | Purpose |
|---|---|---|
| `tailwindcss` | 4.x | Utility-first CSS framework |
| `@tailwindcss/vite` | — | Tailwind v4 Vite plugin |
| `tailwind-merge` | — | Merges conflicting Tailwind classes |
| `clsx` | — | Conditional class name builder |
| `class-variance-authority` | — | Typed component variant system |
| `tw-animate-css` | — | Additional Tailwind animation utilities |
| `@radix-ui/*` | — | Headless accessible UI primitives (Dialog, Select, Tooltip, etc.) |
| `next-themes` | — | Dark/light theme management |
| `sonner` | — | Toast notifications (secondary) |
| `vaul` | — | Mobile-friendly drawer |
| `cmdk` | — | Command palette component |
| `embla-carousel-react` | — | Carousel/slider component |
| `recharts` | — | Chart library (for potential analytics views) |

### Forms & Validation

| Package | Version | Purpose |
|---|---|---|
| `react-hook-form` | 7.x | Form state management |
| `@hookform/resolvers` | 3.x | Schema validation adapters |
| `zod` | 3.x | TypeScript-first schema validation |

### Build & Dev

| Package | Version | Purpose |
|---|---|---|
| `vite` | 7.x | Fast dev server + production bundler |
| `@vitejs/plugin-react` | — | React Fast Refresh + JSX transform |
| `typescript` | 5.x | Static type checking |
| `@types/react` / `@types/react-dom` | — | React TypeScript types |
| `@types/node` | — | Node.js types for Vite config |

### Backend (API Server — `artifacts/api-server`)

| Package | Purpose |
|---|---|
| `express` | HTTP server framework |
| `cors` | Cross-origin request handling |
| `pino` + `pino-http` | Structured JSON logging |
| `drizzle-orm` | Type-safe SQL ORM |
| `drizzle-zod` | Auto-generates Zod schemas from Drizzle tables |
| `@workspace/db` | Shared database package (schema + connection) |

---

## Math & Animation

### Polling Interval Function
```ts
function pollInterval(status?: string): number | false {
  if (!status || DONE_STATUSES.has(status)) return false;
  return 3000;
}
```
Returns `3000` ms (3-second poll) while the task is live, and `false` to stop polling on terminal states. Passed directly to React Query's `refetchInterval` callback.

### Progress Bar
Meshy tasks return `progress: number` (0–100). The `ProgressBar` component in `cyber-ui.tsx` renders this as a CSS `width` percentage:
```
width = `${progress}%`
```
Color changes based on `status`: green for SUCCEEDED, red for FAILED, yellow/amber for IN_PROGRESS.

### Concept Image → Retexture Flow
When a concept image is selected in Step 0, its URL is stored in `conceptImageUrl` in the Zustand store. The Retexture step uses a `useEffect` that watches `conceptImageUrl`:

```ts
useEffect(() => {
  const prev = prevConceptImageUrlRef.current;
  prevConceptImageUrlRef.current = conceptImageUrl;
  if (!conceptImageUrl) return;
  if (imageStyleUrl === prev || !imageStyleUrl) {
    setImageStyleUrl(conceptImageUrl);
  }
}, [conceptImageUrl]);
```

This only auto-fills if the user hasn't manually typed a different URL (checked by comparing against the previous value with a ref).

---

## Controller & Controls

The Grudge Pipeline itself is a **form-driven editor** — there is no keyboard or mouse controller in this app. All interaction is through:

- **Textarea inputs** — prompt fields, texture prompts, style prompts.
- **Select dropdowns** — model, topology, pose mode, aspect ratio, output formats.
- **Range slider** — polycount target (1,000 – 100,000 faces, step 1,000).
- **Checkboxes** — multi-view, PBR, preserve UV, remove lighting, format toggles.
- **Buttons** — trigger each pipeline step, download outputs, copy code snippets, deploy to game.
- **Chat input** — `Enter` to send, `Shift+Enter` for newline.
- **Color picker** — character HUD color for the SEND TO GAME panel.

### Scripts Used by the Controller

| Script | Command | Purpose |
|---|---|---|
| `dev` | `vite --config vite.config.ts --host 0.0.0.0` | Development server with hot module replacement |
| `build` | `vite build --config vite.config.ts` | Production build (outputs to `dist/public/`) |
| `serve` | `vite preview --config vite.config.ts --host 0.0.0.0` | Preview the production build locally |
| `typecheck` | `tsc -p tsconfig.json --noEmit` | TypeScript type checking without emitting JS |

---

## Environment Variables

| Variable | Required | Where Set | Purpose |
|---|---|---|---|
| `PORT` | Yes | Replit / host | Port the Vite dev server binds to |
| `BASE_PATH` | Yes | Replit / host | URL sub-path prefix for asset routing |
| `MESHY_API_KEY` | Yes (backend) | Replit secret | Meshy AI API key for all 3D generation calls |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Yes (backend) | Replit Integration | Anthropic API base URL (provided by Replit Integration proxy) |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Yes (backend) | Replit Integration | Anthropic API key (provided by Replit Integration proxy) |

To get a Meshy API key: [https://www.meshy.ai/api](https://www.meshy.ai/api)

---

## Build & Deploy

### Development
```bash
# Install dependencies
pnpm install

# Run the frontend dev server (requires PORT and BASE_PATH env vars)
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/grudge-pipeline run dev

# Run the API server (separate process)
pnpm --filter @workspace/api-server run dev
```

### Production Build
```bash
pnpm --filter @workspace/grudge-pipeline run build
# Output: artifacts/grudge-pipeline/dist/public/
```

### Deploying as a Standalone App
If you want to run this outside of the Replit monorepo:

1. Copy `artifacts/grudge-pipeline/` to your server.
2. Copy `artifacts/api-server/` to your server.
3. Set environment variables: `PORT`, `BASE_PATH`, `MESHY_API_KEY`, Anthropic credentials.
4. Run `pnpm install` in each directory.
5. Build the frontend: `pnpm run build`.
6. Serve `dist/public/` as static files behind your API server, or via a CDN/nginx.
7. The API server (`artifacts/api-server`) must be reachable at `/api/*` from the frontend origin.

---

## Database Schema

The game roster uses a PostgreSQL table managed by Drizzle ORM:

```ts
// lib/db/src/schema/characters.ts
export const aiCharacters = pgTable("ai_characters", {
  id:         uuid("id").primaryKey().defaultRandom(),
  name:       text("name").notNull(),
  meshUrl:    text("mesh_url").notNull(),      // rigged FBX/GLB URL from Meshy
  scale:      real("scale").notNull().default(0.01),      // world scale (Mixamo FBX ≈ 0.01)
  capsuleHH:  real("capsule_hh").notNull().default(0.5),  // physics capsule half-height
  capsuleR:   real("capsule_r").notNull().default(0.35),  // physics capsule radius
  color:      text("color").notNull().default("#39ff14"), // HUD accent color (hex)
  source:     text("source").notNull().default("meshy"),  // origin tag
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});
```

**Field notes:**
- `meshUrl` — the `rigged_character_fbx_url` from the rig task result, pointing to Meshy's CDN.
- `scale: 0.01` — Meshy's Mixamo-format FBX exports use centimeter units; 0.01 converts to meters in Three.js / R3F.
- `capsuleHH` / `capsuleR` — used by the Rapier physics capsule collider in the zombie-shooter game. Half-height + radius define the character collision shape.
- `color` — neon green `#39ff14` is the default (Matrix aesthetic). Used for HUD name tags, health bars, and glow effects.

---

## Character Registry Export

The SkeletonPanel generates a code snippet in the format expected by the game's character registry:

```js
{
  id: "meshy_custom_01",
  name: "Generated Operator",
  mesh: "https://assets.meshy.ai/...rigged_character.fbx",
  scale: 1,
  capsuleHH: 0.9,
  capsuleR: 0.4,
  color: "#39ff14"
}
```

This can be pasted into the `CHARACTER_REGISTRY` array in `zombie-shooter/src/game/useCharacterStore.ts` for hardcoded characters, bypassing the database. The "DEPLOY TO GAME" button automates this by writing to the database instead.

---

## Mixamo Bone Naming Reference

Meshy's rigging API outputs the standard Mixamo hierarchy. Key bones for game integration:

| Bone | Use |
|---|---|
| `mixamorig:Hips` | Root motion bone. Translate this to move the character. |
| `mixamorig:Spine` → `Spine2` | Torso chain — rotate `Spine2` for upper-body aim offset. |
| `mixamorig:RightHand` | Primary weapon attachment socket. |
| `mixamorig:LeftHand` | Secondary weapon / shield socket. |
| `mixamorig:Head` | Camera follow target for first-person view. |
| `mixamorig:RightFoot` / `LeftFoot` | IK targets for foot placement on uneven terrain. |
| `mixamorig:RightUpLeg` / `LeftUpLeg` | Upper leg — rotate for directional walk blending. |
