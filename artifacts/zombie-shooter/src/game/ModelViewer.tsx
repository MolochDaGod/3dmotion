import { useRef, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, SkeletonUtils } from "@react-three/drei";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { CHARACTER_REGISTRY, CharacterDef } from "./CharacterRegistry";
import { ANIM_PISTOL, ANIM_MELEE } from "./assets/manifest";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

// ─── Animation catalogue shown in the viewer ──────────────────────────────────
const VIEWER_ANIMS: { label: string; path: string }[] = [
  { label: "Idle (Pistol)",    path: ANIM_PISTOL.idle },
  { label: "Walk Forward",     path: ANIM_PISTOL.walkFwd },
  { label: "Run",              path: ANIM_PISTOL.run },
  { label: "Jump",             path: ANIM_PISTOL.jump },
  { label: "Melee Idle",       path: ANIM_MELEE.idle },
  { label: "Melee Walk",       path: ANIM_MELEE.walkFwd },
  { label: "Attack 1",         path: ANIM_MELEE.attack1 },
  { label: "Attack 2",         path: ANIM_MELEE.attack2 },
  { label: "Block",            path: ANIM_MELEE.block },
];

// ─── Stats collected from the loaded model ────────────────────────────────────
interface ModelStats {
  vertices: number;
  triangles: number;
  meshes: number;
  materials: number;
  textures: number;
  hasSkeleton: boolean;
  boneCount: number;
}

function collectStats(obj: THREE.Object3D): ModelStats {
  let vertices = 0, triangles = 0, meshes = 0, materials = 0, textures = 0;
  let hasSkeleton = false, boneCount = 0;
  const matSet = new Set<THREE.Material>();
  const texSet = new Set<THREE.Texture>();

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
    if (child instanceof THREE.Bone) {
      hasSkeleton = true;
      boneCount++;
    }
  });

  materials = matSet.size;
  textures = texSet.size;
  return { vertices, triangles, meshes, materials, textures, hasSkeleton, boneCount };
}

// ─── Internal R3F scene: loads FBX + animation, shows skeleton/wireframe ──────
function ModelScene({
  meshPath,
  animPath,
  wireframe,
  showSkeleton,
  showGrid,
  onStats,
}: {
  meshPath: string;
  animPath: string;
  wireframe: boolean;
  showSkeleton: boolean;
  showGrid: boolean;
  onStats: (s: ModelStats) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const skeletonHelperRef = useRef<THREE.SkeletonHelper | null>(null);
  const { scene } = useThree();
  const [model, setModel] = useState<THREE.Group | null>(null);

  // Load mesh
  useEffect(() => {
    const loader = new FBXLoader();
    loader.load(meshPath, (fbx) => {
      fbx.scale.setScalar(0.01);
      fbx.position.set(0, 0, 0);

      // Center the model
      const box = new THREE.Box3().setFromObject(fbx);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      fbx.position.y = -box.min.y * 0.01 - center.y * 0.01;

      fbx.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      setModel(fbx);
      onStats(collectStats(fbx));
    }, undefined, (err) => {
      console.warn("[ModelViewer] mesh load error:", err);
    });
  }, [meshPath]);

  // Attach model to group
  useEffect(() => {
    if (!model || !groupRef.current) return;
    while (groupRef.current.children.length) {
      groupRef.current.remove(groupRef.current.children[0]);
    }
    groupRef.current.add(model);
    mixerRef.current = new THREE.AnimationMixer(model);
  }, [model]);

  // Load + play animation
  useEffect(() => {
    if (!model || !mixerRef.current) return;
    const loader = new FBXLoader();
    loader.load(animPath, (animFbx) => {
      const clip = animFbx.animations[0];
      if (!clip || !mixerRef.current) return;
      mixerRef.current.stopAllAction();
      const action = mixerRef.current.clipAction(clip, model);
      action.reset().play();
    }, undefined, () => {});
  }, [animPath, model]);

  // Wireframe
  useEffect(() => {
    if (!model) return;
    model.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => { (m as THREE.MeshStandardMaterial).wireframe = wireframe; });
      }
    });
  }, [wireframe, model]);

  // Skeleton helper
  useEffect(() => {
    if (skeletonHelperRef.current) {
      scene.remove(skeletonHelperRef.current);
      skeletonHelperRef.current.dispose();
      skeletonHelperRef.current = null;
    }
    if (showSkeleton && model) {
      const helper = new THREE.SkeletonHelper(model);
      (helper.material as THREE.LineBasicMaterial).linewidth = 2;
      scene.add(helper);
      skeletonHelperRef.current = helper;
    }
    return () => {
      if (skeletonHelperRef.current) {
        scene.remove(skeletonHelperRef.current);
        skeletonHelperRef.current.dispose();
      }
    };
  }, [showSkeleton, model, scene]);

  useFrame((_, dt) => {
    mixerRef.current?.update(dt);
  });

  return (
    <>
      <group ref={groupRef} />
      {showGrid && (
        <Grid
          args={[10, 10]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#333"
          sectionColor="#555"
          fadeDistance={20}
          position={[0, 0, 0]}
        />
      )}
    </>
  );
}

// ─── Camera reset helper ───────────────────────────────────────────────────────
function CameraPreset({ preset }: { preset: string }) {
  const { camera } = useThree();
  useEffect(() => {
    switch (preset) {
      case "front":   camera.position.set(0, 1.6, 3.5); break;
      case "side":    camera.position.set(3.5, 1.6, 0); break;
      case "three-quarter": camera.position.set(2.5, 1.8, 2.5); break;
      case "top":     camera.position.set(0, 6, 0.01); break;
    }
    camera.lookAt(0, 1, 0);
  }, [preset, camera]);
  return null;
}

// ─── Public component ─────────────────────────────────────────────────────────
export function ModelViewer({ onBack }: { onBack: () => void }) {
  const chars = CHARACTER_REGISTRY;
  const [charIdx, setCharIdx] = useState(0);
  const [animIdx, setAnimIdx] = useState(0);
  const [wireframe, setWireframe] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [camPreset, setCamPreset] = useState("three-quarter");
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [activeUrl, setActiveUrl] = useState("");
  const orbitRef = useRef<OrbitControlsImpl>(null);

  const activeDef = chars[charIdx];
  const meshPath = activeUrl || activeDef.mesh;

  const S = { // style shorthand
    sidebar: {
      width: 280,
      background: "rgba(4,8,6,0.97)",
      borderRight: "1px solid #1a2a1a",
      display: "flex" as const,
      flexDirection: "column" as const,
      overflowY: "auto" as const,
      flexShrink: 0,
    } as React.CSSProperties,
    section: {
      borderBottom: "1px solid #111a11",
      padding: "14px 16px",
    } as React.CSSProperties,
    label: {
      fontSize: 10,
      fontFamily: "monospace",
      color: "#3a6a3a",
      letterSpacing: 2,
      textTransform: "uppercase" as const,
      marginBottom: 8,
      display: "block",
    } as React.CSSProperties,
    btn: (active?: boolean) => ({
      display: "block",
      width: "100%",
      textAlign: "left" as const,
      padding: "6px 10px",
      marginBottom: 3,
      background: active ? "rgba(180,30,30,0.18)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${active ? "#882222" : "#1a1a1a"}`,
      color: active ? "#ee6666" : "#778877",
      fontFamily: "monospace",
      fontSize: 11,
      cursor: "pointer",
      borderRadius: 2,
      letterSpacing: 0.5,
    }),
    toggle: (on: boolean) => ({
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      cursor: "pointer",
      padding: "5px 10px",
      background: on ? "rgba(60,200,60,0.08)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${on ? "#2a5a2a" : "#1a1a1a"}`,
      borderRadius: 2,
      fontSize: 11,
      fontFamily: "monospace",
      color: on ? "#5aaa5a" : "#445544",
      width: "100%",
      marginBottom: 4,
    }),
    camBtn: (active: boolean) => ({
      flex: 1,
      padding: "5px 4px",
      background: active ? "rgba(180,30,30,0.18)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${active ? "#882222" : "#1a1a1a"}`,
      color: active ? "#ee6666" : "#556655",
      fontFamily: "monospace",
      fontSize: 10,
      cursor: "pointer",
      borderRadius: 2,
    }),
    stat: {
      display: "flex",
      justifyContent: "space-between",
      fontFamily: "monospace",
      fontSize: 10,
      color: "#556655",
      marginBottom: 4,
    } as React.CSSProperties,
    statVal: { color: "#88cc88" } as React.CSSProperties,
  };

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#030705", fontFamily: "monospace" }}>
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div style={{ height: 44, background: "#040a06", borderBottom: "1px solid #0d1a0d", display: "flex", alignItems: "center", padding: "0 16px", gap: 16, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "1px solid #333", color: "#aaa", fontFamily: "monospace", fontSize: 11, padding: "4px 12px", cursor: "pointer", borderRadius: 2, letterSpacing: 1 }}>
          ← BACK
        </button>
        <span style={{ fontSize: 12, letterSpacing: 4, color: "#cc3333", fontWeight: 700 }}>MODEL VIEWER</span>
        <span style={{ fontSize: 10, color: "#2a4a2a", letterSpacing: 2 }}>// RENDER VALIDATION TOOL</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Paste custom FBX/GLB URL..."
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            style={{ background: "#0a120a", border: "1px solid #1a2a1a", color: "#88aa88", fontFamily: "monospace", fontSize: 11, padding: "4px 10px", width: 360, borderRadius: 2 }}
          />
          <button
            onClick={() => { setActiveUrl(customUrl); setStats(null); }}
            style={{ background: "#cc1111", border: "none", color: "#fff", fontFamily: "monospace", fontSize: 11, padding: "4px 14px", cursor: "pointer", borderRadius: 2, letterSpacing: 1 }}
          >
            LOAD
          </button>
          {activeUrl && (
            <button
              onClick={() => { setActiveUrl(""); setCustomUrl(""); setStats(null); }}
              style={{ background: "none", border: "1px solid #333", color: "#888", fontFamily: "monospace", fontSize: 11, padding: "4px 10px", cursor: "pointer", borderRadius: 2 }}
            >
              ✕ CLEAR
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ── Left sidebar ──────────────────────────────────────────────── */}
        <div style={S.sidebar}>
          {/* Character select */}
          <div style={S.section}>
            <span style={S.label}>Character</span>
            {chars.map((c, i) => (
              <button
                key={c.id}
                style={{ ...S.btn(i === charIdx && !activeUrl), borderLeft: `3px solid ${c.color}` }}
                onClick={() => { setCharIdx(i); setActiveUrl(""); setCustomUrl(""); setStats(null); }}
              >
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: c.color, marginRight: 6 }} />
                {c.name}
              </button>
            ))}
            {activeUrl && (
              <div style={{ fontSize: 10, color: "#cc6622", marginTop: 6, wordBreak: "break-all" }}>
                Custom: {activeUrl.split("/").pop()}
              </div>
            )}
          </div>

          {/* Animations */}
          <div style={S.section}>
            <span style={S.label}>Animation</span>
            {VIEWER_ANIMS.map((a, i) => (
              <button key={i} style={S.btn(i === animIdx)} onClick={() => setAnimIdx(i)}>
                {i === animIdx ? "▶ " : "  "}{a.label}
              </button>
            ))}
          </div>

          {/* Camera */}
          <div style={S.section}>
            <span style={S.label}>Camera Preset</span>
            <div style={{ display: "flex", gap: 4 }}>
              {(["front","side","three-quarter","top"] as const).map((p) => (
                <button key={p} style={S.camBtn(camPreset === p)} onClick={() => setCamPreset(p)}>
                  {p === "three-quarter" ? "3/4" : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 9, color: "#2a3a2a", margin: "8px 0 0", letterSpacing: 1 }}>
              DRAG — orbit · SCROLL — zoom · RMB — pan
            </p>
          </div>

          {/* Display toggles */}
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

          {/* Model stats */}
          {stats && (
            <div style={S.section}>
              <span style={S.label}>Model Stats</span>
              <div style={S.stat}><span>Vertices</span><span style={S.statVal}>{stats.vertices.toLocaleString()}</span></div>
              <div style={S.stat}><span>Triangles</span><span style={S.statVal}>{Math.round(stats.triangles).toLocaleString()}</span></div>
              <div style={S.stat}><span>Meshes</span><span style={S.statVal}>{stats.meshes}</span></div>
              <div style={S.stat}><span>Materials</span><span style={S.statVal}>{stats.materials}</span></div>
              <div style={S.stat}><span>Textures</span><span style={S.statVal}>{stats.textures}</span></div>
              <div style={S.stat}><span>Skeleton</span><span style={S.statVal}>{stats.hasSkeleton ? `✓ (${stats.boneCount} bones)` : "—"}</span></div>
            </div>
          )}
        </div>

        {/* ── 3D Viewport ───────────────────────────────────────────────── */}
        <div style={{ flex: 1, position: "relative" }}>
          <Canvas
            shadows
            camera={{ fov: 50, position: [2.5, 1.8, 2.5], near: 0.01, far: 100 }}
            gl={{ antialias: true }}
            style={{ background: "#060e08" }}
          >
            <color attach="background" args={["#060e08"]} />
            <fog attach="fog" args={["#060e08", 15, 40]} />

            {/* Lights */}
            <ambientLight intensity={0.6} />
            <directionalLight
              position={[5, 8, 5]}
              intensity={2.5}
              castShadow
              shadow-mapSize={[2048, 2048]}
            />
            <directionalLight position={[-4, 4, -4]} intensity={0.8} color="#334466" />
            <pointLight position={[0, 3, 0]} intensity={0.4} color="#ff2200" distance={8} />

            {/* Ground shadow plane */}
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
              <planeGeometry args={[20, 20]} />
              <shadowMaterial opacity={0.4} />
            </mesh>

            <Suspense fallback={null}>
              <ModelScene
                meshPath={meshPath}
                animPath={VIEWER_ANIMS[animIdx].path}
                wireframe={wireframe}
                showSkeleton={showSkeleton}
                showGrid={showGrid}
                onStats={setStats}
              />
            </Suspense>

            <CameraPreset preset={camPreset} />
            <OrbitControls
              ref={orbitRef}
              target={[0, 1, 0]}
              enableDamping
              dampingFactor={0.08}
              minDistance={0.5}
              maxDistance={12}
            />
          </Canvas>

          {/* Overlay: current anim + char info */}
          <div style={{ position: "absolute", bottom: 16, left: 16, fontFamily: "monospace", pointerEvents: "none" }}>
            <div style={{ fontSize: 10, color: "#cc3333", letterSpacing: 2 }}>
              {activeUrl ? "CUSTOM MODEL" : activeDef.name.toUpperCase()}
            </div>
            <div style={{ fontSize: 9, color: "#2a5a2a", letterSpacing: 1, marginTop: 2 }}>
              {VIEWER_ANIMS[animIdx].label}
            </div>
          </div>

          {/* Loading hint */}
          {!stats && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ fontFamily: "monospace", fontSize: 12, color: "#2a4a2a", letterSpacing: 4 }}>LOADING MODEL...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
