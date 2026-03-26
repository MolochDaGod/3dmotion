import { useEffect, useRef, useState, useCallback } from "react";
import * as pc from "playcanvas";
import GameHUD from "../components/GameHUD";
import PortalUI from "../components/PortalUI";
import { SCENES, WEAPONS, WEAPON_ORDER, SKILLS } from "../game/scene-configs";
import type { WeaponId, SceneConfig } from "../game/types";

// ─── Constants ──────────────────────────────────────────────────────────────
const MOVE_SPEED = 5.5;
const RUN_SPEED  = 10.0;
const CAM_DIST   = 7.0;
const CAM_HEIGHT = 2.8;
const CAM_LERP   = 12;
const PORTAL_RADIUS = 4.0;

// ─── Material helpers ────────────────────────────────────────────────────────
function stdMat(r: number, g: number, b: number, metalness = 0, gloss = 0.4,
  er = 0, eg = 0, eb = 0, emissiveIntensity = 0
): pc.StandardMaterial {
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(r, g, b);
  m.metalness = metalness;
  m.gloss = gloss;
  if (emissiveIntensity > 0) {
    m.emissive = new pc.Color(er * emissiveIntensity, eg * emissiveIntensity, eb * emissiveIntensity);
    m.emissiveIntensity = emissiveIntensity;
  }
  m.update();
  return m;
}

function addMesh(app: pc.Application, type: string, parent: pc.Entity | null,
  pos: [number,number,number], scale: [number,number,number],
  mat: pc.StandardMaterial, castShadow = true, receiveShadow = true
): pc.Entity {
  const e = new pc.Entity();
  e.addComponent("render", { type, castShadows: castShadow, receiveShadows: receiveShadow });
  (e.render as pc.RenderComponent).meshInstances[0].material = mat;
  e.setLocalPosition(...pos);
  e.setLocalScale(...scale);
  if (parent) parent.addChild(e);
  else app.root.addChild(e);
  return e;
}

// ─── Environment builder ─────────────────────────────────────────────────────
function buildEnvironment(app: pc.Application, scene: SceneConfig, envRoot: pc.Entity) {
  const gc = scene.groundColor;
  const ac = scene.accentColor;
  const groundMat  = stdMat(gc[0], gc[1], gc[2], 0.0, 0.5);
  const stoneMat   = stdMat(gc[0]*1.3, gc[1]*1.3, gc[2]*1.4, 0.05, 0.35);
  const glowMat    = stdMat(ac[0]*0.2, ac[1]*0.2, ac[2]*0.2, 0.3, 0.9,
                             ac[0], ac[1], ac[2], 2.0);

  // Ground
  addMesh(app, "plane", envRoot, [0, 0, 0], [60, 1, 60], groundMat, false, true);

  // Stone columns / ruins
  const ruinPositions: Array<[number,number,number,number,number]> = [
    [-12, 2.0, -10, 0.9, 4.0],
    [-14, 1.5,  -8, 0.8, 3.0],
    [ 12, 2.5, -10, 1.0, 5.0],
    [ 14, 1.8,  -7, 0.7, 3.5],
    [ -8, 1.2, -18, 1.2, 2.4],
    [  8, 1.6, -20, 1.0, 3.2],
    [-18, 1.5,   0, 0.9, 3.0],
    [ 18, 2.0,   2, 1.1, 4.0],
    [ -6, 1.0,  16, 0.8, 2.0],
    [  6, 1.4,  16, 0.9, 2.8],
  ];
  for (const [x, hw, z, r, h] of ruinPositions) {
    addMesh(app, "cylinder", envRoot, [x, hw, z], [r, h, r], stoneMat);
    // rubble shard
    addMesh(app, "box", envRoot, [x + 1.5, 0.3, z + 1.5], [1.2, 0.6, 0.8], stoneMat);
  }

  // Stone floor slabs
  const slabs: Array<[number,number,number]> = [
    [0,0.05,-5],[3,0.05,-3],[-3,0.05,-4],[5,0.05,-8],[-5,0.05,-7],
    [0,0.05,8],[4,0.05,10],[-4,0.05,11],
  ];
  for (const [x, y, z] of slabs) {
    addMesh(app, "box", envRoot, [x, y, z], [2.5 + Math.random()*1.5, 0.1, 2 + Math.random()*1.5], stoneMat);
  }

  // Accent glow orbs on ground (small decorative light sources)
  const orbPositions: Array<[number,number,number]> = [
    [-4, 0.2, -12], [4, 0.2, -12], [0, 0.2, -18],
    [-10, 0.2, 5],  [10, 0.2, 5],
  ];
  for (const [x, y, z] of orbPositions) {
    addMesh(app, "sphere", envRoot, [x, y, z], [0.3, 0.3, 0.3], glowMat, false, false);
  }

  // Trees (for open world scene)
  if (scene.id === "open_world") {
    const treePos: Array<[number,number]> = [
      [-15, -15], [15, -10], [-20, 5], [20, 8], [-10, 20], [12, 22],
    ];
    const trunkMat = stdMat(0.35, 0.2, 0.1);
    const leafMat  = stdMat(0.1, 0.5, 0.15, 0.0, 0.3);
    for (const [x, z] of treePos) {
      const h = 3 + Math.random() * 2;
      addMesh(app, "cylinder", envRoot, [x, h/2, z], [0.25, h, 0.25], trunkMat);
      addMesh(app, "sphere",   envRoot, [x, h + 1.2, z], [2.0, 2.0, 2.0], leafMat);
    }
  }

  // Dungeon walls
  if (scene.id === "dark_dungeon") {
    const wallMat = stdMat(0.12, 0.12, 0.16, 0.05, 0.25);
    const wallDefs: Array<[number,number,number,number,number,number]> = [
      [-15, 3, 0, 0.8, 6, 30],
      [ 15, 3, 0, 0.8, 6, 30],
      [0, 3, -20, 30, 6, 0.8],
    ];
    for (const [x, y, z, sx, sy, sz] of wallDefs) {
      addMesh(app, "box", envRoot, [x, y, z], [sx, sy, sz], wallMat);
    }
  }

  // Arena seats/bleachers
  if (scene.id === "combat_arena") {
    const seatMat = stdMat(0.3, 0.12, 0.06, 0.0, 0.2);
    for (let a = 0; a < 8; a++) {
      const angle = (a / 8) * Math.PI * 2;
      const r = 18;
      addMesh(app, "box", envRoot,
        [Math.sin(angle) * r, 1, Math.cos(angle) * r],
        [4, 2, 2], seatMat
      );
    }
  }
}

// ─── Portal builder ──────────────────────────────────────────────────────────
function buildPortals(
  app: pc.Application,
  scene: SceneConfig,
  envRoot: pc.Entity,
  portalEntities: Array<{ entity: pc.Entity; light: pc.Entity; targetId: string }>,
) {
  const targets = scene.portalTargets.slice(0, 3);
  const positions: Array<[number, number, number]> = [
    [-8, 0, -14],
    [0,  0, -16],
    [8,  0, -14],
  ];
  const ac = scene.accentColor;

  for (let i = 0; i < targets.length; i++) {
    const pos = positions[i];
    const targetScene = SCENES[targets[i]];
    if (!targetScene) continue;
    const tc = targetScene.accentColor;

    const portalRoot = new pc.Entity(`portal_${i}`);
    portalRoot.setLocalPosition(...pos);
    envRoot.addChild(portalRoot);

    // Arch frame: box segments forming a U-shape
    const archMat = stdMat(0.2, 0.18, 0.22, 0.2, 0.5, tc[0], tc[1], tc[2], 0.5);
    // left pillar
    const lp = new pc.Entity(); lp.addComponent("render", { type: "box", castShadows: true });
    (lp.render as pc.RenderComponent).meshInstances[0].material = archMat;
    lp.setLocalPosition(-1.4, 2, 0); lp.setLocalScale(0.4, 4, 0.4); portalRoot.addChild(lp);
    // right pillar
    const rp = new pc.Entity(); rp.addComponent("render", { type: "box", castShadows: true });
    (rp.render as pc.RenderComponent).meshInstances[0].material = archMat;
    rp.setLocalPosition(1.4, 2, 0); rp.setLocalScale(0.4, 4, 0.4); portalRoot.addChild(rp);
    // top bar
    const tp = new pc.Entity(); tp.addComponent("render", { type: "box", castShadows: true });
    (tp.render as pc.RenderComponent).meshInstances[0].material = archMat;
    tp.setLocalPosition(0, 4.2, 0); tp.setLocalScale(3.2, 0.45, 0.4); portalRoot.addChild(tp);

    // Portal inner glow plane
    const innerMat = stdMat(tc[0]*0.3, tc[1]*0.3, tc[2]*0.3, 0, 0.9, tc[0], tc[1], tc[2], 3.5);
    const inner = new pc.Entity("portalInner");
    inner.addComponent("render", { type: "plane", castShadows: false });
    (inner.render as pc.RenderComponent).meshInstances[0].material = innerMat;
    inner.setLocalPosition(0, 2.2, 0);
    inner.setLocalScale(2.4, 1, 3.6);
    inner.setLocalEulerAngles(90, 0, 0); // stand upright
    portalRoot.addChild(inner);

    // Portal label (small sphere above arch)
    const labelMat = stdMat(tc[0], tc[1], tc[2], 0.8, 0.95, tc[0], tc[1], tc[2], 4.0);
    const label = new pc.Entity();
    label.addComponent("render", { type: "sphere", castShadows: false });
    (label.render as pc.RenderComponent).meshInstances[0].material = labelMat;
    label.setLocalPosition(0, 5.0, 0); label.setLocalScale(0.4, 0.4, 0.4); portalRoot.addChild(label);

    // Point light
    const lightEntity = new pc.Entity(`portalLight_${i}`);
    lightEntity.addComponent("light", {
      type: 'omni',
      color: new pc.Color(tc[0], tc[1], tc[2]),
      intensity: 3.5,
      range: 8,
      castShadows: false,
    });
    lightEntity.setLocalPosition(0, 2, 0.5);
    portalRoot.addChild(lightEntity);

    portalEntities.push({ entity: portalRoot, light: lightEntity, targetId: targets[i] });
  }
}

// ─── Character builder ───────────────────────────────────────────────────────
function buildCharacter(app: pc.Application) {
  const root = new pc.Entity("character");
  app.root.addChild(root);

  const skinMat   = stdMat(0.8, 0.55, 0.4);
  const clothMat  = stdMat(0.1, 0.1, 0.2, 0.0, 0.3);
  const pantsMat  = stdMat(0.15, 0.12, 0.08);
  const bootsMat  = stdMat(0.1, 0.08, 0.06);

  // Head
  const head = addMesh(app, "sphere", root, [0, 1.72, 0], [0.22, 0.25, 0.22], skinMat);
  // Torso
  const torso = addMesh(app, "box", root, [0, 1.2, 0], [0.4, 0.48, 0.24], clothMat);
  // Hips
  addMesh(app, "box", root, [0, 0.88, 0], [0.36, 0.16, 0.22], pantsMat);

  // Left upper arm
  const leftArmRoot = new pc.Entity("leftArmRoot");
  leftArmRoot.setLocalPosition(-0.28, 1.32, 0); root.addChild(leftArmRoot);
  addMesh(app, "cylinder", leftArmRoot, [0, -0.18, 0], [0.09, 0.36, 0.09], clothMat);
  // Left forearm
  addMesh(app, "cylinder", leftArmRoot, [0, -0.42, 0], [0.08, 0.3, 0.08], skinMat);

  // Right upper arm
  const rightArmRoot = new pc.Entity("rightArmRoot");
  rightArmRoot.setLocalPosition(0.28, 1.32, 0); root.addChild(rightArmRoot);
  addMesh(app, "cylinder", rightArmRoot, [0, -0.18, 0], [0.09, 0.36, 0.09], clothMat);
  const rightForearm = addMesh(app, "cylinder", rightArmRoot, [0, -0.42, 0], [0.08, 0.3, 0.08], skinMat);

  // Left leg
  const leftLegRoot = new pc.Entity("leftLegRoot");
  leftLegRoot.setLocalPosition(-0.12, 0.78, 0); root.addChild(leftLegRoot);
  addMesh(app, "cylinder", leftLegRoot, [0, -0.28, 0], [0.11, 0.56, 0.11], pantsMat);
  addMesh(app, "cylinder", leftLegRoot, [0, -0.65, 0], [0.1,  0.4,  0.1 ], pantsMat);
  addMesh(app, "box",      leftLegRoot, [0, -0.9,  0.06], [0.14, 0.12, 0.22], bootsMat);

  // Right leg
  const rightLegRoot = new pc.Entity("rightLegRoot");
  rightLegRoot.setLocalPosition(0.12, 0.78, 0); root.addChild(rightLegRoot);
  addMesh(app, "cylinder", rightLegRoot, [0, -0.28, 0], [0.11, 0.56, 0.11], pantsMat);
  addMesh(app, "cylinder", rightLegRoot, [0, -0.65, 0], [0.1,  0.4,  0.1 ], pantsMat);
  addMesh(app, "box",      rightLegRoot, [0, -0.9,  0.06], [0.14, 0.12, 0.22], bootsMat);

  return { root, head, torso, leftArmRoot, rightArmRoot, leftLegRoot, rightLegRoot, rightForearm };
}

// ─── Weapon builder ──────────────────────────────────────────────────────────
function buildWeapon(app: pc.Application, rightArmRoot: pc.Entity, weaponId: WeaponId): pc.Entity {
  // Remove old weapon
  const old = rightArmRoot.findByName("weapon");
  if (old) old.destroy();

  const def = WEAPONS[weaponId];
  const mat = stdMat(
    def.color[0], def.color[1], def.color[2],
    0.6, 0.8,
    def.emissiveColor[0], def.emissiveColor[1], def.emissiveColor[2], 1.2
  );
  const weapon = new pc.Entity("weapon");
  weapon.addComponent("render", { type: def.shape, castShadows: true });
  (weapon.render as pc.RenderComponent).meshInstances[0].material = mat;
  weapon.setLocalPosition(...def.offset);
  weapon.setLocalScale(...def.scale);
  rightArmRoot.addChild(weapon);
  return weapon;
}

// ─── Skill effect spawner ────────────────────────────────────────────────────
function spawnSkillEffect(app: pc.Application, charPos: pc.Vec3, yaw: number, skillIdx: number, weaponId: WeaponId) {
  const skill = SKILLS[weaponId][skillIdx];
  if (!skill) return;

  const colHex = skill.color;
  const cr = parseInt(colHex.slice(1, 3), 16) / 255;
  const cg = parseInt(colHex.slice(3, 5), 16) / 255;
  const cb = parseInt(colHex.slice(5, 7), 16) / 255;
  const mat = stdMat(cr*0.2, cg*0.2, cb*0.2, 0, 0.9, cr, cg, cb, 5.0);

  if (skill.effectType === "projectile") {
    // Spawn 1-3 spheres flying forward
    const count = skill.name.includes("Fan") ? 5 : 1;
    for (let i = 0; i < count; i++) {
      const orb = new pc.Entity("projectile");
      orb.addComponent("render", { type: "sphere", castShadows: false });
      (orb.render as pc.RenderComponent).meshInstances[0].material = mat;
      const spread = (Math.random() - 0.5) * 0.3;
      orb.setLocalPosition(charPos.x, charPos.y + 1.2, charPos.z);
      orb.setLocalScale(0.15, 0.15, 0.15);
      app.root.addChild(orb);

      const dir = new pc.Vec3(
        Math.sin(yaw + spread) * 18,
        (Math.random() - 0.3) * 2,
        Math.cos(yaw + spread) * 18
      );
      let life = 0;
      const tick = app.on("update", (dt: number) => {
        life += dt;
        const p = orb.getLocalPosition();
        p.x += dir.x * dt; p.y += dir.y * dt; p.z += dir.z * dt;
        orb.setLocalPosition(p.x, p.y, p.z);
        if (life > 1.2) { orb.destroy(); app.off("update", tick); }
      });
    }
  } else if (skill.effectType === "aoe") {
    // Expanding ring
    const ring = new pc.Entity("aoe");
    ring.addComponent("render", { type: "cylinder", castShadows: false });
    (ring.render as pc.RenderComponent).meshInstances[0].material = mat;
    ring.setLocalPosition(charPos.x, charPos.y + 0.05, charPos.z);
    ring.setLocalScale(0.5, 0.05, 0.5);
    app.root.addChild(ring);
    let life = 0;
    const tick = app.on("update", (dt: number) => {
      life += dt;
      const s = 0.5 + life * 8;
      ring.setLocalScale(s, 0.05, s);
      if (life > 0.8) { ring.destroy(); app.off("update", tick); }
    });
  } else if (skill.effectType === "nova") {
    // Burst of spheres in all directions
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const orb = new pc.Entity("nova");
      orb.addComponent("render", { type: "sphere", castShadows: false });
      (orb.render as pc.RenderComponent).meshInstances[0].material = mat;
      orb.setLocalPosition(charPos.x, charPos.y + 1.0, charPos.z);
      orb.setLocalScale(0.2, 0.2, 0.2);
      app.root.addChild(orb);
      const dx = Math.sin(angle) * 10;
      const dz = Math.cos(angle) * 10;
      let life = 0;
      const tick = app.on("update", (dt: number) => {
        life += dt;
        const p = orb.getLocalPosition();
        p.x += dx * dt; p.y -= 2 * dt; p.z += dz * dt;
        orb.setLocalPosition(p.x, p.y, p.z);
        if (life > 0.7) { orb.destroy(); app.off("update", tick); }
      });
    }
  } else if (skill.effectType === "beam") {
    // A stretched box beam firing forward
    const beam = new pc.Entity("beam");
    beam.addComponent("render", { type: "box", castShadows: false });
    (beam.render as pc.RenderComponent).meshInstances[0].material = mat;
    const len = 15;
    beam.setLocalPosition(
      charPos.x + Math.sin(yaw) * len / 2,
      charPos.y + 1.1,
      charPos.z + Math.cos(yaw) * len / 2
    );
    beam.setLocalEulerAngles(0, (-yaw * 180) / Math.PI, 0);
    beam.setLocalScale(0.15, 0.15, len);
    app.root.addChild(beam);
    let life = 0;
    const tick = app.on("update", (dt: number) => {
      life += dt;
      const s = Math.max(0, 0.15 - life * 0.25);
      beam.setLocalScale(s, s, len);
      if (life > 0.6) { beam.destroy(); app.off("update", tick); }
    });
  }
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function PlayCanvasGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<pc.Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [webglError, setWebglError] = useState(false);
  const [renderBackend, setRenderBackend] = useState("WebGL2");
  const [portalUI, setPortalUI] = useState<{ open: boolean; targetId: string }>({ open: false, targetId: "" });
  const [nearPortal, setNearPortal] = useState(false);
  const [currentSceneId, setCurrentSceneId] = useState("lost_portal");
  const [currentWeapon, setCurrentWeapon] = useState<WeaponId>("sword");
  const [cooldowns, setCooldowns] = useState<Record<number, number>>({});
  const [health] = useState(85);
  const [mana, setMana] = useState(100);

  // Refs shared with game loop
  const envRootRef = useRef<pc.Entity | null>(null);
  const portalEntitiesRef = useRef<Array<{ entity: pc.Entity; light: pc.Entity; targetId: string }>>([]);

  const stateRef = useRef({
    sceneId: "lost_portal",
    weaponId: "sword" as WeaponId,
    weaponIdx: 2,
    yaw: Math.PI,
    pitch: -0.2,
    velocity: new pc.Vec3(),
    camPos: new pc.Vec3(0, 4, 8),
    animTime: 0,
    moveSpeed: 0,
    attackTimer: 0,
    attackType: "none" as string,
    cooldowns: {} as Record<number, number>,
    nearPortalId: "",
    mana: 100,
  });

  const rebuildScene = useCallback((
    app: pc.Application,
    sceneId: string,
    envRootRef: { current: pc.Entity | null },
    portalEntities: Array<{ entity: pc.Entity; light: pc.Entity; targetId: string }>,
  ) => {
    const scene = SCENES[sceneId];
    if (!scene) return;

    // Tear down old environment
    if (envRootRef.current) envRootRef.current.destroy();
    portalEntities.length = 0;

    const envRoot = new pc.Entity("environment");
    app.root.addChild(envRoot);
    envRootRef.current = envRoot;

    // Sky / fog (PlayCanvas 2.x: scene.fog is a FogParams object, ambientLight is a Color)
    app.scene.ambientLight.copy(new pc.Color(...scene.ambientColor));
    (app.scene.fog as any).type = pc.FOG_EXP2;
    (app.scene.fog as any).color.copy(new pc.Color(...scene.fogColor));
    (app.scene.fog as any).density = scene.fogDensity;

    // Rebuild
    buildEnvironment(app, scene, envRoot);
    buildPortals(app, scene, envRoot, portalEntities);

    stateRef.current.sceneId = sceneId;
    setCurrentSceneId(sceneId);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let alive = true;
    let app: pc.Application;
    // Use component-level refs so handleEnterPortal shares the same objects
    portalEntitiesRef.current.length = 0;
    const portalEntities = portalEntitiesRef.current;
    let charParts: ReturnType<typeof buildCharacter> | null = null;
    let weaponEntity: pc.Entity | null = null;
    let cameraEntity: pc.Entity | null = null;
    let dirLightEntity: pc.Entity | null = null;
    let keyboard: pc.Keyboard;
    const keysJustPressed = new Set<number>();
    const prevKeys = new Set<number>();

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode;
      if (!prevKeys.has(code)) keysJustPressed.add(code);
      prevKeys.add(code);
    };
    const onKeyUp = (e: KeyboardEvent) => { prevKeys.delete(e.keyCode); };

    // Mouse tracking (manual, outside PlayCanvas Mouse)
    let mouseDX = 0, mouseDY = 0;
    let isPointerLocked = false;
    const onMouseMove = (e: MouseEvent) => {
      if (isPointerLocked) { mouseDX += e.movementX; mouseDY += e.movementY; }
    };
    const onPointerLock = () => { isPointerLocked = document.pointerLockElement === canvas; };
    const onCanvasClick = () => { if (!isPointerLocked) canvas.requestPointerLock(); };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLock);
    canvas.addEventListener("click", onCanvasClick);

    // ESC closes portal UI
    const onKeyDownPortal = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPortalUI(p => ({ ...p, open: false }));
    };
    window.addEventListener("keydown", onKeyDownPortal);

    async function init() {
      try {
        app = new pc.Application(canvas!, {
          graphicsDeviceOptions: { preferWebGpu: true, alpha: false, antialias: true },
        });
      } catch {
        // Try fallback without WebGPU preference
        try {
          app = new pc.Application(canvas!, {
            graphicsDeviceOptions: { preferWebGpu: false, alpha: false, antialias: false },
          });
        } catch (e) {
          console.warn("WebGL not available in this environment:", e);
          setWebglError(true);
          setLoading(false);
          return;
        }
      }
      if (!alive) { app.destroy(); return; }
      appRef.current = app;

      app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
      app.setCanvasResolution(pc.RESOLUTION_AUTO);

      keyboard = new pc.Keyboard(window);

      // Detect backend
      const isWebGPU = !!(app.graphicsDevice as any).webgpu;
      setRenderBackend(isWebGPU ? "WebGPU" : "WebGL2");

      // Camera entity (standalone, manually positioned)
      cameraEntity = new pc.Entity("camera");
      cameraEntity.addComponent("camera", {
        clearColor: new pc.Color(...SCENES.lost_portal.skyColor),
        fov: 58,
        nearClip: 0.1,
        farClip: 500,
      });
      cameraEntity.setPosition(0, 4, 8);
      app.root.addChild(cameraEntity);

      // Directional light
      dirLightEntity = new pc.Entity("sun");
      dirLightEntity.addComponent("light", {
        type: 'directional',
        color: new pc.Color(...SCENES.lost_portal.lightColor),
        intensity: 1.8,
        castShadows: true,
        shadowBias: 0.04,
        normalOffsetBias: 0.04,
        shadowResolution: 1024,
      });
      dirLightEntity.setEulerAngles(...SCENES.lost_portal.lightAngle);
      app.root.addChild(dirLightEntity);

      // Build initial scene
      rebuildScene(app, "lost_portal", envRootRef, portalEntities);

      // Build character
      charParts = buildCharacter(app);
      charParts.root.setLocalPosition(0, 0, 0);

      // Initial weapon
      weaponEntity = buildWeapon(app, charParts.rightArmRoot, stateRef.current.weaponId);

      // ─── Game loop ───────────────────────────────────────────────────────
      app.on("update", (dt: number) => {
        if (!alive || !charParts) return;
        const s = stateRef.current;

        // ── Camera mouse look ──
        const MOUSE_SENS = 0.004;
        s.yaw   += mouseDX * MOUSE_SENS;
        s.pitch  = Math.max(-0.55, Math.min(0.55, s.pitch - mouseDY * MOUSE_SENS));
        mouseDX = 0; mouseDY = 0;

        // ── Weapon switch (Q) ──
        const Q = 81;
        if (keysJustPressed.has(Q)) {
          s.weaponIdx = (s.weaponIdx + 1) % WEAPON_ORDER.length;
          s.weaponId  = WEAPON_ORDER[s.weaponIdx];
          setCurrentWeapon(s.weaponId);
          weaponEntity = buildWeapon(app, charParts!.rightArmRoot, s.weaponId);
        }

        // ── Skills (1-4) ──
        const skillKeys = [49, 50, 51, 52]; // keyCode for 1-4
        const now = Date.now();
        for (let i = 0; i < 4; i++) {
          if (keysJustPressed.has(skillKeys[i])) {
            const key = (i + 1) as 1|2|3|4;
            const endTime = s.cooldowns[key] ?? 0;
            if (now > endTime) {
              const skill = SKILLS[s.weaponId][i];
              const cdMs = (skill?.cooldown ?? 5) * 1000;
              s.cooldowns[key] = now + cdMs;
              s.mana = Math.max(0, s.mana - 15);
              setMana(s.mana);
              setCooldowns({ ...s.cooldowns });
              spawnSkillEffect(app, charParts!.root.getPosition(), s.yaw, i, s.weaponId);
              s.attackTimer = 0.3;
              s.attackType  = "cast";
            }
          }
        }

        // ── Attack (LMB via keyboard substitute: Space or LMB, we just use F) ──
        const F_KEY = 70;
        if (keysJustPressed.has(F_KEY) && s.attackTimer <= 0) {
          s.attackTimer = 0.35;
          s.attackType  = WEAPONS[s.weaponId].attackAnim;
          spawnSkillEffect(app, charParts!.root.getPosition(), s.yaw, 0, s.weaponId);
        }

        // Clear just-pressed
        keysJustPressed.clear();

        // ── Movement ──
        const isRunning = keyboard.isPressed(pc.KEY_SHIFT);
        const speed = isRunning ? RUN_SPEED : MOVE_SPEED;
        let dx = 0, dz = 0;
        if (keyboard.isPressed(pc.KEY_W)) dz += 1;
        if (keyboard.isPressed(pc.KEY_S)) dz -= 1;
        if (keyboard.isPressed(pc.KEY_A)) dx -= 1;
        if (keyboard.isPressed(pc.KEY_D)) dx += 1;

        const moving = dx !== 0 || dz !== 0;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        dx /= len; dz /= len;

        // World direction relative to camera yaw
        const worldDX = dx * Math.cos(s.yaw) + dz * Math.sin(s.yaw);
        const worldDZ = -dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);

        s.moveSpeed = moving
          ? Math.min(speed, s.moveSpeed + speed * 8 * dt)
          : Math.max(0, s.moveSpeed - speed * 8 * dt);

        const charPos = charParts.root.getLocalPosition();
        charPos.x += worldDX * s.moveSpeed * dt;
        charPos.z += worldDZ * s.moveSpeed * dt;
        charPos.y = 0; // clamp to ground
        charParts.root.setLocalPosition(charPos.x, charPos.y, charPos.z);

        // Character facing direction (smoothly rotate toward movement)
        if (moving) {
          const targetYaw = Math.atan2(worldDX, worldDZ);
          const curEuler  = charParts.root.getLocalEulerAngles();
          let diffY = (targetYaw * 180 / Math.PI) - curEuler.y;
          while (diffY > 180) diffY -= 360;
          while (diffY < -180) diffY += 360;
          charParts.root.setLocalEulerAngles(0, curEuler.y + diffY * Math.min(1, 12 * dt), 0);
        }

        // ── Procedural animation ──
        s.animTime += dt * (s.moveSpeed / MOVE_SPEED);
        const walkPhase = s.animTime * 2.8;
        const swingAmp  = Math.min(1, s.moveSpeed / MOVE_SPEED) * 28;
        const idleBob   = Math.sin(Date.now() / 1000 * 0.9) * 1.5;

        // Legs
        charParts.leftLegRoot.setLocalEulerAngles(Math.sin(walkPhase) * swingAmp, 0, 0);
        charParts.rightLegRoot.setLocalEulerAngles(-Math.sin(walkPhase) * swingAmp, 0, 0);

        // Attack animation override on right arm
        if (s.attackTimer > 0) {
          s.attackTimer -= dt;
          const t = 1 - Math.max(0, s.attackTimer / 0.35);
          const wave = Math.sin(t * Math.PI);
          const atkAngle = s.attackType === "swing" ? -70 : s.attackType === "cast" ? -40 : -55;
          charParts.rightArmRoot.setLocalEulerAngles(atkAngle * wave, 0, -15 + 10 * wave);
          charParts.leftArmRoot.setLocalEulerAngles(20 * wave, 0, 10 * wave);
        } else {
          // Normal walk arm swing
          charParts.rightArmRoot.setLocalEulerAngles(-Math.sin(walkPhase) * swingAmp * 0.7, 0, -12);
          charParts.leftArmRoot.setLocalEulerAngles(Math.sin(walkPhase) * swingAmp * 0.7, 0, 12);
        }

        // Head idle bob
        charParts.head.setLocalEulerAngles(idleBob * 0.5, idleBob, 0);

        // ── Camera follow (as child — same speed, always tracking) ──
        const cy = Math.cos(s.pitch), sy = Math.sin(s.pitch);
        const camOffX =  Math.sin(s.yaw) * CAM_DIST * cy;
        const camOffY =  CAM_HEIGHT + sy * CAM_DIST;
        const camOffZ =  Math.cos(s.yaw) * CAM_DIST * cy;

        const targetCamX = charPos.x + camOffX;
        const targetCamY = charPos.y + camOffY;
        const targetCamZ = charPos.z + camOffZ;

        const curCam = s.camPos;
        const lerpFactor = Math.min(1, CAM_LERP * dt);
        curCam.x += (targetCamX - curCam.x) * lerpFactor;
        curCam.y += (targetCamY - curCam.y) * lerpFactor;
        curCam.z += (targetCamZ - curCam.z) * lerpFactor;

        if (cameraEntity) {
          cameraEntity.setPosition(curCam.x, curCam.y, curCam.z);
          cameraEntity.lookAt(new pc.Vec3(charPos.x, charPos.y + 1.1, charPos.z));
        }

        // ── Portal proximity ──
        let closestPortalId = "";
        let closestDist = PORTAL_RADIUS;
        for (const p of portalEntities) {
          const pp = p.entity.getPosition();
          const d = Math.sqrt(
            (charPos.x - pp.x) ** 2 + (charPos.z - pp.z) ** 2
          );
          if (d < closestDist) { closestDist = d; closestPortalId = p.targetId; }

          // Pulse portal light
          const phase = Math.sin(Date.now() / 600 + portalEntities.indexOf(p));
          if (p.light.light) (p.light.light as any).intensity = 3.0 + phase * 1.2;
        }

        if (closestPortalId !== s.nearPortalId) {
          s.nearPortalId = closestPortalId;
          setNearPortal(closestPortalId !== "");
        }

        // Mana regen
        s.mana = Math.min(100, s.mana + 5 * dt);
        setMana(Math.floor(s.mana));
      });

      app.start();
      setLoading(false);
    }

    init();

    return () => {
      alive = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onPointerLock);
      canvas?.removeEventListener("click", onCanvasClick);
      window.removeEventListener("keydown", onKeyDownPortal);
      if (appRef.current) { appRef.current.destroy(); appRef.current = null; }
    };
  }, [rebuildScene]);

  const handleEnterPortal = useCallback((targetId: string) => {
    setPortalUI({ open: false, targetId: "" });
    const app = appRef.current;
    if (!app) return;
    // Rebuild environment using shared refs so the game loop sees new portals
    rebuildScene(app, targetId, envRootRef, portalEntitiesRef.current);

    // Update lights
    const scene = SCENES[targetId];
    if (!scene) return;
    const sun = app.root.findByName("sun");
    if (sun?.light) {
      (sun.light as any).color = new pc.Color(...scene.lightColor);
      sun.setEulerAngles(...scene.lightAngle);
    }
    const cam = app.root.findByName("camera");
    if (cam?.camera) {
      (cam.camera as any).clearColor = new pc.Color(...scene.skyColor);
    }
  }, [rebuildScene]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />

      {loading && !webglError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-50">
          <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-violet-300 text-sm tracking-widest uppercase font-mono">Initializing Scene…</p>
        </div>
      )}

      {webglError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 z-50">
          <div className="text-center max-w-sm">
            <p className="text-4xl mb-4">🎮</p>
            <h2 className="text-white text-xl font-bold mb-2">WebGL Required</h2>
            <p className="text-white/50 text-sm">
              This 3D game requires WebGL support. Please open it in a modern browser
              (Chrome, Firefox, Edge, or Safari) for the full experience.
            </p>
            <div className="mt-4 flex gap-2 justify-center">
              <span className="bg-violet-900/50 border border-violet-500/30 text-violet-300 text-xs px-3 py-1 rounded-full">WebGPU</span>
              <span className="bg-cyan-900/50 border border-cyan-500/30 text-cyan-300 text-xs px-3 py-1 rounded-full">WebGL2</span>
            </div>
          </div>
        </div>
      )}

      {!loading && !webglError && (
        <GameHUD
          currentWeapon={currentWeapon}
          cooldowns={cooldowns}
          sceneId={currentSceneId}
          nearPortal={nearPortal && !portalUI.open}
          onPortalOpen={() => {
            const targetId = stateRef.current.nearPortalId;
            if (targetId) setPortalUI({ open: true, targetId });
          }}
          health={health}
          mana={mana}
          renderBackend={renderBackend}
        />
      )}

      {portalUI.open && (
        <PortalUI
          currentSceneId={currentSceneId}
          targetSceneId={portalUI.targetId}
          onEnter={handleEnterPortal}
          onClose={() => setPortalUI(p => ({ ...p, open: false }))}
        />
      )}
    </div>
  );
}
