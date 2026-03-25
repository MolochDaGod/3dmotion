# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `artifacts/zombie-shooter` (`@workspace/zombie-shooter`)

Third-person survival shooter built with React Three Fiber + Rapier physics.

**Stack:** React 19, R3F + Drei + Rapier, Three.js, Zustand, TypeScript, Vite

**Architecture:**
- `src/game/Player.tsx` — Rapier kinematic capsule controller, FBX Corsair King character, 6-weapon cycle (pistol/rifle/sword/axe/staff/bow), TPS/FPS camera with yaw/pitch, roll, melee combo, magic staff casting with mana, cane model tracked to right-hand bone; gun props (Pixel Guns 3D PISTOL.fbx/AR.fbx) tracked to right-hand bone; bow prop (craftpix) tracked to left-hand bone
- `src/game/Zombie.tsx` — Mixamo Mutant GLTF model with FSM animation AI (idle→run→attack→hit→dead), SkeletonUtils.clone for per-instance skeletons, texture applied manually, detection radius + chase AI
- `src/game/Game.tsx` — Wave spawning, bullet/melee hit detection, player death, score/wave tracking; calls `initNavGrid(NAV_OBSTACLES)` once on mount
- `src/game/terrain.ts` — Pure-TS terrain utilities: `getTerrainHeight(x,z)`, `buildTerrainHeightArray()`, `TERRAIN_SIZE/SEGS` constants. Single source of truth for physics and visuals. Imported by Graveyard, Zombie, Game.
- `src/game/Graveyard.tsx` — HeightfieldCollider (63×63 quads, 64×64 vertex grid) + matching PlaneGeometry visual mesh; skirt box for thick-earth look; safety-net floor at y=−25; boundary walls. All props/trees/mounds/torches placed at `getTerrainHeight(x,z)`. All physical colliders tagged with `CG_WORLD` collision group. Exports `NAV_OBSTACLES` for A* init.
- `src/game/CollisionLayers.ts` — Rapier collision group bitmask constants: `CG_WORLD` (terrain+boulders+ruins, group 0x0001), `CG_PLAYER` (capsule, group 0x0002), `CG_ZOMBIE_SENSOR` (sensor balls, group 0x0004). Player's `CapsuleCollider` and `computeColliderMovement` both use `CG_PLAYER`.
- `src/game/NavGrid.ts` — Singleton A* navigation grid (2m cell size, 60×60 = 3600 cells covering the 120m terrain). `initNavGrid(obstacles)` marks boulder/ruin footprints blocked. `getPath(fx,fz,tx,tz)` returns world-space `[x,z][]` waypoints via 8-directional A* with binary-heap open set and visibility string-pull smoothing.
- `src/game/HUD.tsx` — Health/mana/ammo/weapon pills overlay with magic reticle for staff mode
- `src/game/CharacterPanel.tsx` — RPG character panel (C key), shows health+mana bars, wave/score/kills, equipped weapon info
- `src/game/useGameStore.ts` — Zustand store (health, mana, score, wave, kills, weaponMode, showCharacterPanel)

**Weapon Modes (Q to cycle):**
- `pistol` — PISTOL.fbx prop tracked to right hand; pistol animations (idle/walk/run/jump/crouch/strafe)
- `rifle` — AR.fbx prop tracked to right hand; rifle animations (idle/walk/run/jump/strafe/fire/reload)
- `sword` — sword.fbx model on right hand, melee combo system
- `axe` — axe.fbx model on right hand, melee combo system
- `staff` — cane1.fbx on right hand, staffCast1 (LMB, 20 mana) / staffCast2 (RMB, 40 mana), 5 mana/s regen
- `bow` — bow_prop.fbx tracked to LEFT-hand bone; Pro Longbow Pack animations (idle/walk/run 4-dir, aim-walk 4-dir, draw+fire sequence); LMB = draw→fire (900 ms cycle), RMB held = aim stance

**Models:**
- `public/models/` — Corsair King FBX + animations (pistol/rifle/melee/staff/bow packs); mutant.{gltf,bin,jpg} (zombie); cane1/5/10.fbx + cane_texture.png; pistol_prop.fbx + rifle_prop.fbx (Pixel Guns 3D); bow_prop.fbx (craftpix); bow*.fbx animations (Pro Longbow Pack)
- Bow animation set: bowIdle/WalkFwd/WalkBwd/StrafeL/StrafeR/RunFwd/RunBwd/Jump/Draw/Aim/Fire/Block/AimWalk×4
- Weapon model tracking: sword/axe/cane/pistolProp/rifleProp → right-hand bone; bowProp → left-hand bone

**Animation systems:**
- **8-directional pistol locomotion** — W+A/D = walkArcL/R or runArcL/R; S+A/D = walkBwdArc/runBwdArc variants; full diagonal coverage
- **Speed-matched timeScale** — walk anims scale by `horizSpeed / 1.5`, run by `horizSpeed / 4.0`, clamped 0.4–3.0; prevents foot sliding
- **Body lean** — strafe lean ±0.07 rad applied via quaternion (yawQ × leanQ) on leanGroupRef, smoothed with 10× lerp
- **Head bob** — camera oscillates Y+X during movement; sprint = 13 Hz / 0.025 amp, walk = 9 Hz / 0.014 amp; fades out when stopping
- **Staff idle variety** — after 7 s of staffIdle, plays staffIdle2 once then returns (nonBlockingOnce pattern)
- **Rifle turn anims** — yaw delta > 1.4°/frame triggers rifleTurnL/R while standing idle; plays once then restores rifleIdle
- **nonBlockingOnce system** — cosmetic ONCE anims (staffIdle2, rifleTurnL/R) play without blocking locomotion; mixer `finished` event auto-restores idle; movement always interrupts

**Physics collision groups:** COLLIDE_TERRAIN on Graveyard ground+walls; COLLIDE_PLAYER on capsule; COLLIDE_ZOMBIE/PROJECTILE defined for future use

**Post-processing:** EffectComposer in Game.tsx with Bloom + DepthOfField + Vignette + ChromaticAberration — all driven by live values from useEditorStore (backtick to open editor panel).

**In-Game Editor Panel (backtick `):**
- `src/game/useEditorStore.ts` — Zustand store for all editor-tunable values (postFX, scene lights, gameplay, perf toggle)
- `src/game/EditorPanel.tsx` — Leva UI controls synced to useEditorStore. 4 folders: Post-FX / Scene / Gameplay / Performance. Always mounted; panel visibility via CSS `#leva__root` injection in App.tsx.
- Editor panel is always available (even on title screen), hidden by default. Values persist across open/close.
- F2 — toggles r3f-perf performance overlay (FPS, draw calls, memory) inside Canvas

**Zombie AI (Zombie.tsx):**
- ZState now includes "wander" — when player is outside detection radius, zombies slowly patrol in random directions
- Wander: `running` animation at 0.35× timeScale (slow creepy lurch), direction changes every 2–5 s, bounded to 80m
- Chase speed and detection radius are live-tweakable from the editor panel
- Attack damage driven by `ed.zombieAttackDamage` (editor slider)

**Key bindings:** WASD move · Shift sprint · Space jump · Alt crouch · Ctrl roll · Q cycle weapon · R reload/spell-select · F cast spell · C character panel · P camera mode · ` editor panel · F2 perf overlay

**Key files:** ANNIHILATE_LEARNINGS.md — architecture reference from studied game repo

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
