import { useRef, useState, useEffect, useCallback, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { CHARACTER_REGISTRY } from "./CharacterRegistry";
import { ANIM_PISTOL, ANIM_MELEE, WEAPON_PROPS, WEAPON_TEXTURES } from "./assets/manifest";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";

// ─── Animation catalogue ──────────────────────────────────────────────────────
const VIEWER_ANIMS: { label: string; path: string }[] = [
  { label: "Idle (Pistol)",  path: ANIM_PISTOL.idle },
  { label: "Walk Forward",   path: ANIM_PISTOL.walkFwd },
  { label: "Run",            path: ANIM_PISTOL.run },
  { label: "Jump",           path: ANIM_PISTOL.jump },
  { label: "Melee Idle",     path: ANIM_MELEE.idle },
  { label: "Melee Walk",     path: ANIM_MELEE.walkFwd },
  { label: "Attack 1",       path: ANIM_MELEE.attack1 },
  { label: "Attack 2",       path: ANIM_MELEE.attack2 },
  { label: "Block",          path: ANIM_MELEE.block },
];

// ─── Weapon catalogue ─────────────────────────────────────────────────────────
const WEAPON_LIST: { label: string; key: keyof typeof WEAPON_PROPS; texKey?: keyof typeof WEAPON_TEXTURES }[] = [
  { label: "Sword",    key: "sword",   texKey: "sword"  },
  { label: "Axe",     key: "axe",     texKey: "axe"    },
  { label: "Axe 2",   key: "axe2",    texKey: "axe"    },
  { label: "Pistol",  key: "pistol"                    },
  { label: "Rifle",   key: "rifle"                     },
  { label: "Bow",     key: "bow"                       },
  { label: "Shield",  key: "shield",  texKey: "shield" },
  { label: "Staff 1", key: "staff1",  texKey: "staff"  },
  { label: "Staff 5", key: "staff5",  texKey: "staff"  },
  { label: "Staff 10",key: "staff10", texKey: "staff"  },
];

// ─── Model stats ──────────────────────────────────────────────────────────────
interface ModelStats {
  vertices: number; triangles: number; meshes: number;
  materials: number; textures: number; hasSkeleton: boolean; boneCount: number;
}
function collectStats(obj: THREE.Object3D): ModelStats {
  let vertices = 0, triangles = 0, meshes = 0, materials = 0, textures = 0;
  let hasSkeleton = false, boneCount = 0;
  const matSet = new Set<THREE.Material>(), texSet = new Set<THREE.Texture>();
  obj.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh || child instanceof THREE.Mesh) {
      meshes++;
      const geo = child.geometry as THREE.BufferGeometry;
      const pos = geo.attributes.position;
      if (pos) vertices += pos.count;
      const idx = geo.index;
      triangles += idx ? idx.count / 3 : (pos?.count ?? 0) / 3;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        matSet.add(m);
        const mm = m as THREE.MeshPhongMaterial;
        if (mm.map) texSet.add(mm.map);
        if (mm.normalMap) texSet.add(mm.normalMap);
      });
    }
    if (child instanceof THREE.Bone) { hasSkeleton = true; boneCount++; }
  });
  return { vertices, triangles, meshes, materials: matSet.size, textures: texSet.size, hasSkeleton, boneCount };
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const mono = "monospace";
const S = {
  sidebar: {
    width: 280, background: "rgba(4,8,6,0.97)", borderRight: "1px solid #1a2a1a",
    display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0,
  } as React.CSSProperties,
  section:  { borderBottom: "1px solid #111a11", padding: "14px 16px" } as React.CSSProperties,
  label:    { fontSize: 10, fontFamily: mono, color: "#3a6a3a", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, display: "block" } as React.CSSProperties,
  btn: (active?: boolean) => ({
    display: "block", width: "100%", textAlign: "left",
    padding: "6px 10px", marginBottom: 3,
    background: active ? "rgba(180,30,30,0.18)" : "rgba(255,255,255,0.02)",
    border: `1px solid ${active ? "#882222" : "#1a1a1a"}`,
    color: active ? "#ee6666" : "#778877", fontFamily: mono, fontSize: 11,
    cursor: "pointer", borderRadius: 2, letterSpacing: 0.5,
  } as React.CSSProperties),
  toggle: (on: boolean) => ({
    display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
    padding: "5px 10px", width: "100%", marginBottom: 4,
    background: on ? "rgba(60,200,60,0.08)" : "rgba(255,255,255,0.02)",
    border: `1px solid ${on ? "#2a5a2a" : "#1a1a1a"}`,
    borderRadius: 2, fontSize: 11, fontFamily: mono,
    color: on ? "#5aaa5a" : "#445544",
  } as React.CSSProperties),
  camBtn: (active: boolean) => ({
    flex: 1, padding: "5px 4px",
    background: active ? "rgba(180,30,30,0.18)" : "rgba(255,255,255,0.02)",
    border: `1px solid ${active ? "#882222" : "#1a1a1a"}`,
    color: active ? "#ee6666" : "#556655", fontFamily: mono, fontSize: 10,
    cursor: "pointer", borderRadius: 2,
  } as React.CSSProperties),
  stat:    { display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10, color: "#556655", marginBottom: 4 } as React.CSSProperties,
  statVal: { color: "#88cc88" } as React.CSSProperties,
};

// ─── Camera preset helper ─────────────────────────────────────────────────────
function CameraPreset({ preset }: { preset: string }) {
  const { camera } = useThree();
  useEffect(() => {
    switch (preset) {
      case "front":         camera.position.set(0, 1.6, 3.5);  break;
      case "side":          camera.position.set(3.5, 1.6, 0);  break;
      case "three-quarter": camera.position.set(2.5, 1.8, 2.5); break;
      case "top":           camera.position.set(0, 6, 0.01);   break;
    }
    camera.lookAt(0, 1, 0);
  }, [preset, camera]);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHARACTER VIEW  scene
// ═══════════════════════════════════════════════════════════════════════════════
function ModelScene({
  meshPath, animPath, wireframe, showSkeleton, showGrid, onStats,
}: {
  meshPath: string; animPath: string; wireframe: boolean;
  showSkeleton: boolean; showGrid: boolean; onStats: (s: ModelStats) => void;
}) {
  const groupRef            = useRef<THREE.Group>(null);
  const mixerRef            = useRef<THREE.AnimationMixer | null>(null);
  const skeletonHelperRef   = useRef<THREE.SkeletonHelper | null>(null);
  const { scene }           = useThree();
  const [model, setModel]   = useState<THREE.Group | null>(null);

  useEffect(() => {
    const loader = new FBXLoader();
    loader.load(meshPath, (fbx) => {
      fbx.scale.setScalar(0.01);
      const box    = new THREE.Box3().setFromObject(fbx);
      const center = box.getCenter(new THREE.Vector3());
      fbx.position.y = -box.min.y * 0.01 - center.y * 0.01;
      fbx.traverse((c) => {
        if (c instanceof THREE.Mesh || c instanceof THREE.SkinnedMesh) { c.castShadow = true; c.receiveShadow = true; }
      });
      setModel(fbx);
      onStats(collectStats(fbx));
    }, undefined, (err) => console.warn("[ModelViewer] mesh error:", err));
  }, [meshPath]);

  useEffect(() => {
    if (!model || !groupRef.current) return;
    while (groupRef.current.children.length) groupRef.current.remove(groupRef.current.children[0]);
    groupRef.current.add(model);
    mixerRef.current = new THREE.AnimationMixer(model);
  }, [model]);

  useEffect(() => {
    if (!model || !mixerRef.current) return;
    const loader = new FBXLoader();
    loader.load(animPath, (aFbx) => {
      const clip = aFbx.animations[0];
      if (!clip || !mixerRef.current) return;
      mixerRef.current.stopAllAction();
      mixerRef.current.clipAction(clip, model).reset().play();
    }, undefined, () => {});
  }, [animPath, model]);

  useEffect(() => {
    if (!model) return;
    model.traverse((c) => {
      if (c instanceof THREE.Mesh || c instanceof THREE.SkinnedMesh) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach((m) => { (m as THREE.MeshStandardMaterial).wireframe = wireframe; });
      }
    });
  }, [wireframe, model]);

  useEffect(() => {
    if (skeletonHelperRef.current) { scene.remove(skeletonHelperRef.current); skeletonHelperRef.current.dispose(); skeletonHelperRef.current = null; }
    if (showSkeleton && model) {
      const h = new THREE.SkeletonHelper(model);
      (h.material as THREE.LineBasicMaterial).linewidth = 2;
      scene.add(h);
      skeletonHelperRef.current = h;
    }
    return () => { if (skeletonHelperRef.current) { scene.remove(skeletonHelperRef.current); skeletonHelperRef.current.dispose(); } };
  }, [showSkeleton, model, scene]);

  useFrame((_, dt) => { mixerRef.current?.update(dt); });

  return (
    <>
      <group ref={groupRef} />
      {showGrid && <Grid args={[10,10]} cellSize={0.5} cellThickness={0.5} cellColor="#333" sectionColor="#555" fadeDistance={20} position={[0,0,0]} />}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEAPON FIT  scene
// ═══════════════════════════════════════════════════════════════════════════════
export interface WeaponOffset {
  position: [number, number, number];
  rotation: [number, number, number];
  scale:    [number, number, number];
}

function WeaponFitScene({
  charPath, animPath, weaponPath, weaponTexPath, targetBone,
  transformMode, orbitRef, onBoneList, onOffsetChange, showGrid,
}: {
  charPath:      string;
  animPath:      string;
  weaponPath:    string;
  weaponTexPath: string | null;
  targetBone:    string;
  transformMode: "translate" | "rotate" | "scale";
  orbitRef:      React.RefObject<OrbitControlsImpl>;
  onBoneList:    (bones: string[]) => void;
  onOffsetChange:(o: WeaponOffset) => void;
  showGrid:      boolean;
}) {
  const charGroupRef   = useRef<THREE.Group>(null);
  const mixerRef       = useRef<THREE.AnimationMixer | null>(null);
  const weaponPivotRef = useRef<THREE.Group>(null);
  const tcRef          = useRef<TransformControlsImpl>(null);

  const [charModel,   setCharModel]   = useState<THREE.Group | null>(null);
  const [weaponModel, setWeaponModel] = useState<THREE.Group | null>(null);
  const [handBone,    setHandBone]    = useState<THREE.Bone | null>(null);

  // ── Load character ────────────────────────────────────────────────────────
  useEffect(() => {
    const loader = new FBXLoader();
    loader.load(charPath, (fbx) => {
      fbx.scale.setScalar(0.01);
      const box = new THREE.Box3().setFromObject(fbx);
      fbx.position.y = -box.min.y * 0.01 - box.getCenter(new THREE.Vector3()).y * 0.01;
      setCharModel(fbx);

      // collect bones
      const bones: string[] = [];
      fbx.traverse((c) => { if (c instanceof THREE.Bone) bones.push(c.name); });
      onBoneList(bones);
    }, undefined, (e) => console.warn("[WeaponFit] char load:", e));
  }, [charPath]);

  // ── Attach char to group + build mixer ───────────────────────────────────
  useEffect(() => {
    if (!charModel || !charGroupRef.current) return;
    while (charGroupRef.current.children.length) charGroupRef.current.remove(charGroupRef.current.children[0]);
    charGroupRef.current.add(charModel);
    mixerRef.current = new THREE.AnimationMixer(charModel);
  }, [charModel]);

  // ── Load + play animation ─────────────────────────────────────────────────
  useEffect(() => {
    if (!charModel || !mixerRef.current) return;
    const loader = new FBXLoader();
    loader.load(animPath, (aFbx) => {
      const clip = aFbx.animations[0];
      if (!clip || !mixerRef.current) return;
      mixerRef.current.stopAllAction();
      mixerRef.current.clipAction(clip, charModel).reset().play();
    }, undefined, () => {});
  }, [animPath, charModel]);

  // ── Load weapon ───────────────────────────────────────────────────────────
  useEffect(() => {
    const loader = new FBXLoader();
    loader.load(weaponPath, (fbx) => {
      fbx.scale.setScalar(1);

      // apply texture if available
      if (weaponTexPath) {
        const tex = new THREE.TextureLoader().load(weaponTexPath);
        tex.colorSpace = THREE.SRGBColorSpace;
        fbx.traverse((c) => {
          if (c instanceof THREE.Mesh) {
            const mat = new THREE.MeshStandardMaterial({ map: tex });
            c.material = mat;
            c.castShadow = true;
          }
        });
      } else {
        fbx.traverse((c) => { if (c instanceof THREE.Mesh) { c.castShadow = true; } });
      }

      setWeaponModel(fbx);
    }, undefined, (e) => console.warn("[WeaponFit] weapon load:", e));
  }, [weaponPath, weaponTexPath]);

  // ── Find target bone in char skeleton ────────────────────────────────────
  useEffect(() => {
    if (!charModel || !targetBone) return;
    let found: THREE.Bone | null = null;
    charModel.traverse((c) => { if (c instanceof THREE.Bone && c.name === targetBone) found = c; });
    setHandBone(found);
  }, [charModel, targetBone]);

  // ── Attach weapon pivot to bone ───────────────────────────────────────────
  useEffect(() => {
    if (!weaponPivotRef.current || !weaponModel) return;
    const pivot = weaponPivotRef.current;
    while (pivot.children.length) pivot.remove(pivot.children[0]);
    pivot.add(weaponModel);
  }, [weaponModel]);

  // ── Parent pivot to bone (done every frame since bone moves) ─────────────
  // We add the pivot as a bone child on first connection.
  const pivotAttached = useRef(false);
  useEffect(() => {
    pivotAttached.current = false;
  }, [handBone]);

  // ── TransformControls: block orbit while dragging ─────────────────────────
  useEffect(() => {
    const tc = tcRef.current;
    if (!tc || !orbitRef.current) return;
    const onDragging = (e: THREE.Event & { value?: boolean }) => {
      if (orbitRef.current) orbitRef.current.enabled = !e.value;
    };
    tc.addEventListener("dragging-changed", onDragging as (e: THREE.Event) => void);
    return () => tc.removeEventListener("dragging-changed", onDragging as (e: THREE.Event) => void);
  }, [orbitRef]);

  // ── Report offset on TransformControls change ─────────────────────────────
  useEffect(() => {
    const tc = tcRef.current;
    if (!tc) return;
    const onchange = () => {
      const pivot = weaponPivotRef.current;
      if (!pivot) return;
      const p = pivot.position;
      const e = new THREE.Euler().setFromQuaternion(pivot.quaternion);
      const sc = pivot.scale;
      onOffsetChange({
        position: [+p.x.toFixed(4),  +p.y.toFixed(4),  +p.z.toFixed(4)],
        rotation: [+e.x.toFixed(4),  +e.y.toFixed(4),  +e.z.toFixed(4)],
        scale:    [+sc.x.toFixed(4), +sc.y.toFixed(4), +sc.z.toFixed(4)],
      });
    };
    tc.addEventListener("change", onchange);
    return () => tc.removeEventListener("change", onchange);
  }, [onOffsetChange]);

  useFrame((_, dt) => {
    mixerRef.current?.update(dt);

    // Attach / keep pivot under bone each frame (bone world matrix updates post-animation)
    if (handBone && weaponPivotRef.current && !pivotAttached.current) {
      handBone.add(weaponPivotRef.current);
      pivotAttached.current = true;
    }
  });

  return (
    <>
      <group ref={charGroupRef} />

      {/* Weapon pivot lives in bone-space */}
      <group ref={weaponPivotRef} />

      {/* Gizmo — only when bone is found */}
      {handBone && weaponPivotRef.current && (
        <TransformControls
          ref={tcRef}
          object={weaponPivotRef.current}
          mode={transformMode}
          size={0.6}
        />
      )}

      {showGrid && <Grid args={[10,10]} cellSize={0.5} cellThickness={0.5} cellColor="#333" sectionColor="#555" fadeDistance={20} position={[0,0,0]} />}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export function ModelViewer({ onBack }: { onBack: () => void }) {
  // ── shared state ──────────────────────────────────────────────────────────
  const chars      = CHARACTER_REGISTRY;
  const [mode,     setMode]     = useState<"character" | "weapon">("character");
  const [charIdx,  setCharIdx]  = useState(0);
  const [animIdx,  setAnimIdx]  = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [camPreset,setCamPreset]= useState("three-quarter");
  const orbitRef = useRef<OrbitControlsImpl>(null);

  // ── character-view state ──────────────────────────────────────────────────
  const [wireframe,     setWireframe]     = useState(false);
  const [showSkeleton,  setShowSkeleton]  = useState(false);
  const [stats,         setStats]         = useState<ModelStats | null>(null);
  const [customUrl,     setCustomUrl]     = useState("");
  const [activeUrl,     setActiveUrl]     = useState("");

  // ── weapon-fit state ──────────────────────────────────────────────────────
  const [weaponIdx,      setWeaponIdx]     = useState(0);
  const [boneList,       setBoneList]      = useState<string[]>([]);
  const [targetBone,     setTargetBone]    = useState("mixamorigRightHand");
  const [boneFilter,     setBoneFilter]    = useState("hand");
  const [transformMode,  setTransformMode] = useState<"translate"|"rotate"|"scale">("translate");
  const [offset,         setOffset]        = useState<WeaponOffset>({
    position: [0,0,0], rotation: [0,0,0], scale: [1,1,1],
  });
  const [copied, setCopied] = useState(false);

  const activeDef    = chars[charIdx];
  const meshPath     = activeUrl || activeDef.mesh;
  const weaponEntry  = WEAPON_LIST[weaponIdx];
  const weaponPath   = WEAPON_PROPS[weaponEntry.key];
  const weaponTexPath= weaponEntry.texKey ? WEAPON_TEXTURES[weaponEntry.texKey] : null;

  const filteredBones = boneList.filter((b) =>
    boneFilter.trim() === "" || b.toLowerCase().includes(boneFilter.toLowerCase())
  );

  const handleCopy = useCallback(() => {
    const json = JSON.stringify({
      bone:     targetBone,
      position: offset.position,
      rotation: offset.rotation,
      scale:    offset.scale,
    }, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [offset, targetBone]);

  const resetOffset = useCallback(() => {
    setOffset({ position:[0,0,0], rotation:[0,0,0], scale:[1,1,1] });
  }, []);

  // ── scene remount keys ───────────────────────────────────────────────────
  const charSceneKey   = `${meshPath}-${animIdx}`;
  const weaponSceneKey = `${meshPath}-${weaponPath}-${animIdx}`;

  return (
    <div style={{ position:"fixed", inset:0, display:"flex", flexDirection:"column", background:"#030705", fontFamily:mono }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{ height:44, background:"#040a06", borderBottom:"1px solid #0d1a0d", display:"flex", alignItems:"center", padding:"0 16px", gap:12, flexShrink:0 }}>
        <button onClick={onBack} style={{ background:"none", border:"1px solid #333", color:"#aaa", fontFamily:mono, fontSize:11, padding:"4px 12px", cursor:"pointer", borderRadius:2, letterSpacing:1 }}>
          ← BACK
        </button>
        <span style={{ fontSize:12, letterSpacing:4, color:"#cc3333", fontWeight:700 }}>MODEL VIEWER</span>

        {/* Mode tabs */}
        <div style={{ display:"flex", gap:4, marginLeft:16 }}>
          {(["character","weapon"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding:"4px 14px", fontFamily:mono, fontSize:10, letterSpacing:2, cursor:"pointer", borderRadius:2,
              background: mode===m ? "rgba(180,30,30,0.25)" : "transparent",
              border: `1px solid ${mode===m ? "#882222" : "#222"}`,
              color: mode===m ? "#ee6666" : "#556655",
              textTransform:"uppercase",
            }}>
              {m === "weapon" ? "⚔ WEAPON FIT" : "◈ CHARACTER"}
            </button>
          ))}
        </div>

        {/* Custom URL — character mode only */}
        {mode === "character" && (
          <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
            <input
              type="text" placeholder="Paste custom FBX/GLB URL..."
              value={customUrl} onChange={(e) => setCustomUrl(e.target.value)}
              style={{ background:"#0a120a", border:"1px solid #1a2a1a", color:"#88aa88", fontFamily:mono, fontSize:11, padding:"4px 10px", width:340, borderRadius:2 }}
            />
            <button onClick={() => { setActiveUrl(customUrl); setStats(null); }}
              style={{ background:"#cc1111", border:"none", color:"#fff", fontFamily:mono, fontSize:11, padding:"4px 14px", cursor:"pointer", borderRadius:2 }}>
              LOAD
            </button>
            {activeUrl && (
              <button onClick={() => { setActiveUrl(""); setCustomUrl(""); setStats(null); }}
                style={{ background:"none", border:"1px solid #333", color:"#888", fontFamily:mono, fontSize:11, padding:"4px 10px", cursor:"pointer", borderRadius:2 }}>
                ✕ CLEAR
              </button>
            )}
          </div>
        )}

        {/* Weapon-fit toolbar */}
        {mode === "weapon" && (
          <div style={{ marginLeft:"auto", display:"flex", gap:6, alignItems:"center" }}>
            <span style={{ fontSize:10, color:"#3a6a3a", letterSpacing:2 }}>GIZMO</span>
            {(["translate","rotate","scale"] as const).map((tm) => (
              <button key={tm} onClick={() => setTransformMode(tm)} style={{
                padding:"4px 10px", fontFamily:mono, fontSize:10, cursor:"pointer", borderRadius:2,
                background: transformMode===tm ? "rgba(60,200,60,0.15)" : "transparent",
                border: `1px solid ${transformMode===tm ? "#2a7a2a" : "#222"}`,
                color: transformMode===tm ? "#5aaa5a" : "#445544",
                letterSpacing:1,
              }}>
                {tm === "translate" ? "⊹ MOVE" : tm === "rotate" ? "↻ ROTATE" : "⊡ SCALE"}
              </button>
            ))}
            <button onClick={resetOffset} style={{ padding:"4px 10px", fontFamily:mono, fontSize:10, cursor:"pointer", borderRadius:2, background:"transparent", border:"1px solid #222", color:"#556655", letterSpacing:1 }}>
              ↺ RESET
            </button>
            <button onClick={handleCopy} style={{
              padding:"4px 14px", fontFamily:mono, fontSize:10, cursor:"pointer", borderRadius:2,
              background: copied ? "rgba(60,200,60,0.3)" : "rgba(180,30,30,0.2)",
              border: `1px solid ${copied ? "#2a7a2a" : "#882222"}`,
              color: copied ? "#5aaa5a" : "#ee6666", letterSpacing:1,
            }}>
              {copied ? "✓ COPIED" : "⎘ COPY JSON"}
            </button>
          </div>
        )}
      </div>

      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
        {/* ── Left sidebar ────────────────────────────────────────────── */}
        <div style={S.sidebar}>
          {/* Character */}
          <div style={S.section}>
            <span style={S.label}>Character</span>
            {chars.map((c, i) => (
              <button key={c.id}
                style={{ ...S.btn(i===charIdx && !activeUrl), borderLeft:`3px solid ${c.color}` }}
                onClick={() => { setCharIdx(i); setActiveUrl(""); setCustomUrl(""); setStats(null); setBoneList([]); }}>
                <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:c.color, marginRight:6 }} />
                {c.name}
              </button>
            ))}
          </div>

          {/* Animations */}
          <div style={S.section}>
            <span style={S.label}>Animation</span>
            {VIEWER_ANIMS.map((a, i) => (
              <button key={i} style={S.btn(i===animIdx)} onClick={() => setAnimIdx(i)}>
                {i===animIdx ? "▶ " : "  "}{a.label}
              </button>
            ))}
          </div>

          {/* Weapon list — weapon mode only */}
          {mode === "weapon" && (
            <div style={S.section}>
              <span style={S.label}>Weapon</span>
              {WEAPON_LIST.map((w, i) => (
                <button key={w.key} style={S.btn(i===weaponIdx)} onClick={() => setWeaponIdx(i)}>
                  {w.label}
                </button>
              ))}
            </div>
          )}

          {/* Bone picker — weapon mode only */}
          {mode === "weapon" && (
            <div style={S.section}>
              <span style={S.label}>Attach Bone</span>
              <input
                type="text"
                placeholder="filter bones…"
                value={boneFilter}
                onChange={(e) => setBoneFilter(e.target.value)}
                style={{ background:"#0a120a", border:"1px solid #1a2a1a", color:"#88aa88", fontFamily:mono, fontSize:10, padding:"4px 8px", width:"100%", borderRadius:2, marginBottom:6, boxSizing:"border-box" }}
              />
              <div style={{ maxHeight:180, overflowY:"auto" }}>
                {boneList.length === 0
                  ? <div style={{ fontSize:9, color:"#2a4a2a", letterSpacing:1 }}>loading bones…</div>
                  : filteredBones.map((b) => (
                    <button key={b} style={S.btn(b===targetBone)} onClick={() => setTargetBone(b)}>
                      {b === targetBone ? "● " : "○ "}{b}
                    </button>
                  ))
                }
              </div>
            </div>
          )}

          {/* Camera */}
          <div style={S.section}>
            <span style={S.label}>Camera Preset</span>
            <div style={{ display:"flex", gap:4 }}>
              {(["front","side","three-quarter","top"] as const).map((p) => (
                <button key={p} style={S.camBtn(camPreset===p)} onClick={() => setCamPreset(p)}>
                  {p==="three-quarter" ? "3/4" : p.charAt(0).toUpperCase()+p.slice(1)}
                </button>
              ))}
            </div>
            <p style={{ fontSize:9, color:"#2a3a2a", margin:"8px 0 0", letterSpacing:1 }}>
              DRAG — orbit · SCROLL — zoom · RMB — pan
            </p>
          </div>

          {/* Display toggles — character mode */}
          {mode === "character" && (
            <div style={S.section}>
              <span style={S.label}>Display</span>
              <button style={S.toggle(wireframe)} onClick={() => setWireframe((v) => !v)}>
                <span>{wireframe ? "■" : "□"}</span> Wireframe
              </button>
              <button style={S.toggle(showSkeleton)} onClick={() => setShowSkeleton((v) => !v)}>
                <span>{showSkeleton ? "■" : "□"}</span> Skeleton overlay
              </button>
              <button style={S.toggle(showGrid)} onClick={() => setShowGrid((v) => !v)}>
                <span>{showGrid ? "■" : "□"}</span> Ground grid
              </button>
            </div>
          )}

          {/* Display toggles — weapon mode */}
          {mode === "weapon" && (
            <div style={S.section}>
              <span style={S.label}>Display</span>
              <button style={S.toggle(showGrid)} onClick={() => setShowGrid((v) => !v)}>
                <span>{showGrid ? "■" : "□"}</span> Ground grid
              </button>
            </div>
          )}

          {/* Model stats */}
          {mode === "character" && stats && (
            <div style={S.section}>
              <span style={S.label}>Model Stats</span>
              <div style={S.stat}><span>Vertices</span>  <span style={S.statVal}>{stats.vertices.toLocaleString()}</span></div>
              <div style={S.stat}><span>Triangles</span> <span style={S.statVal}>{Math.round(stats.triangles).toLocaleString()}</span></div>
              <div style={S.stat}><span>Meshes</span>    <span style={S.statVal}>{stats.meshes}</span></div>
              <div style={S.stat}><span>Materials</span> <span style={S.statVal}>{stats.materials}</span></div>
              <div style={S.stat}><span>Textures</span>  <span style={S.statVal}>{stats.textures}</span></div>
              <div style={S.stat}><span>Skeleton</span>  <span style={S.statVal}>{stats.hasSkeleton ? `✓ (${stats.boneCount} bones)` : "—"}</span></div>
            </div>
          )}

          {/* Offset readout — weapon mode */}
          {mode === "weapon" && (
            <div style={S.section}>
              <span style={S.label}>Offset Output</span>
              {(["position","rotation","scale"] as const).map((k) => (
                <div key={k} style={{ marginBottom:8 }}>
                  <div style={{ fontSize:9, color:"#3a6a3a", letterSpacing:2, marginBottom:3 }}>{k.toUpperCase()}</div>
                  {offset[k].map((v, i) => (
                    <div key={i} style={{ ...S.stat, marginBottom:2 }}>
                      <span style={{ color:"#445544" }}>{["X","Y","Z"][i]}</span>
                      <span style={S.statVal}>{v.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ fontSize:9, color:"#2a4a2a", marginTop:4, letterSpacing:1 }}>
                Bone: {targetBone || "—"}
              </div>
            </div>
          )}
        </div>

        {/* ── 3D Viewport ─────────────────────────────────────────────── */}
        <div style={{ flex:1, position:"relative" }}>
          <Canvas
            shadows
            camera={{ fov:50, position:[2.5,1.8,2.5], near:0.01, far:100 }}
            gl={{ antialias:true }}
            style={{ background:"#060e08" }}
          >
            <color attach="background" args={["#060e08"]} />
            <fog   attach="fog"        args={["#060e08", 15, 40]} />
            <ambientLight intensity={0.6} />
            <directionalLight position={[5,8,5]} intensity={2.5} castShadow shadow-mapSize={[2048,2048]} />
            <directionalLight position={[-4,4,-4]} intensity={0.8} color="#334466" />
            <pointLight position={[0,3,0]} intensity={0.4} color="#ff2200" distance={8} />
            <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0,0,0]}>
              <planeGeometry args={[20,20]} />
              <shadowMaterial opacity={0.4} />
            </mesh>

            <Suspense fallback={null}>
              {mode === "character" ? (
                <ModelScene
                  key={charSceneKey}
                  meshPath={meshPath}
                  animPath={VIEWER_ANIMS[animIdx].path}
                  wireframe={wireframe}
                  showSkeleton={showSkeleton}
                  showGrid={showGrid}
                  onStats={setStats}
                />
              ) : (
                <WeaponFitScene
                  key={weaponSceneKey}
                  charPath={meshPath}
                  animPath={VIEWER_ANIMS[animIdx].path}
                  weaponPath={weaponPath}
                  weaponTexPath={weaponTexPath}
                  targetBone={targetBone}
                  transformMode={transformMode}
                  orbitRef={orbitRef}
                  onBoneList={setBoneList}
                  onOffsetChange={setOffset}
                  showGrid={showGrid}
                />
              )}
            </Suspense>

            <CameraPreset preset={camPreset} />
            <OrbitControls
              ref={orbitRef}
              target={[0,1,0]}
              enableDamping
              dampingFactor={0.08}
              minDistance={0.5}
              maxDistance={12}
            />
          </Canvas>

          {/* Overlay */}
          <div style={{ position:"absolute", bottom:16, left:16, fontFamily:mono, pointerEvents:"none" }}>
            <div style={{ fontSize:10, color:"#cc3333", letterSpacing:2 }}>
              {activeUrl ? "CUSTOM MODEL" : activeDef.name.toUpperCase()}
              {mode === "weapon" ? ` + ${weaponEntry.label.toUpperCase()}` : ""}
            </div>
            <div style={{ fontSize:9, color:"#2a5a2a", letterSpacing:1, marginTop:2 }}>
              {mode === "weapon"
                ? `bone: ${targetBone || "—"} · gizmo: ${transformMode}`
                : VIEWER_ANIMS[animIdx].label}
            </div>
          </div>

          {/* Weapon-fit hint overlay */}
          {mode === "weapon" && boneList.length > 0 && !targetBone && (
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
              <div style={{ fontFamily:mono, fontSize:12, color:"#cc6622", letterSpacing:3 }}>SELECT A BONE →</div>
            </div>
          )}

          {/* Character-mode loading hint */}
          {mode === "character" && !stats && (
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
              <div style={{ fontFamily:mono, fontSize:12, color:"#2a4a2a", letterSpacing:4 }}>LOADING MODEL...</div>
            </div>
          )}

          {/* Weapon-fit instructions */}
          {mode === "weapon" && (
            <div style={{ position:"absolute", top:12, right:12, background:"rgba(4,8,6,0.85)", border:"1px solid #1a2a1a", padding:"10px 14px", fontFamily:mono, fontSize:9, color:"#3a6a3a", lineHeight:1.8, letterSpacing:1, pointerEvents:"none" }}>
              <div style={{ color:"#cc3333", marginBottom:4, letterSpacing:2 }}>WEAPON FIT MODE</div>
              <div>1. Pick weapon in sidebar</div>
              <div>2. Filter &amp; select the hand bone</div>
              <div>3. Use gizmo to align weapon grip</div>
              <div>4. Switch MOVE → ROTATE to orient</div>
              <div>5. Click ⎘ COPY JSON for offset data</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
