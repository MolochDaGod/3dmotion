import { useRef, useEffect, useCallback, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { useGameStore } from "./useGameStore";

interface PlayerProps {
  onShoot: (position: THREE.Vector3, direction: THREE.Vector3) => void;
  onDead: () => void;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
}

const MOVE_SPEED   = 4;
const SPRINT_SPEED = 8;
const JUMP_FORCE   = 8;
const GRAVITY      = -20;
const MOUSE_SENSITIVITY = 0.002;
const SHOULDER_OFFSET   = new THREE.Vector3(0.55, 1.6, 3.2);

const ANIM_FILES: Record<string, string> = {
  idle: "/models/pistol idle.fbx",
  walk: "/models/pistol walk.fbx",
  run:  "/models/pistol run.fbx",
  jump: "/models/pistol jump.fbx",
};

export function Player({ onShoot, onDead, playerPosRef }: PlayerProps) {
  const rootRef = useRef<THREE.Group>(null!);

  const velocityY     = useRef(0);
  const isOnGround    = useRef(true);
  const isMoving      = useRef(false);
  const isSprinting   = useRef(false);
  const yaw           = useRef(0);
  const pitch         = useRef(0);
  const keys          = useRef<Record<string, boolean>>({});
  const isPointerLocked = useRef(false);
  const deadFired     = useRef(false);
  const shootCooldown = useRef(0);

  // FBX model & animation state
  const mixerRef      = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef    = useRef<Record<string, THREE.AnimationAction>>({});
  const currentAnim   = useRef("idle");
  const modelLoaded   = useRef(false);
  const [modelObj, setModelObj] = useState<THREE.Group | null>(null);

  const { camera } = useThree();
  const { health, shoot, reload, ammo, isReloading } = useGameStore();

  // ── Attach 3-D crosshair to camera ──────────────────────────────────────
  useEffect(() => {
    const group = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.013, 0.024, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.005, 16),
      new THREE.MeshBasicMaterial({ color: 0xff2222, depthTest: false, transparent: true, opacity: 1, side: THREE.DoubleSide })
    );
    const line = (x: number, y: number, w: number, h: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
      );
      m.position.set(x, y, 0);
      return m;
    };

    group.add(ring, dot);
    group.add(line(0, 0.042, 0.003, 0.016));
    group.add(line(0, -0.042, 0.003, 0.016));
    group.add(line(0.042, 0, 0.016, 0.003));
    group.add(line(-0.042, 0, 0.016, 0.003));

    group.position.set(0, 0, -5);
    group.renderOrder = 999;
    camera.add(group);
    return () => { camera.remove(group); };
  }, [camera]);

  // ── Sequential FBX loading ───────────────────────────────────────────────
  useEffect(() => {
    if (modelLoaded.current) return;
    modelLoaded.current = true;

    const loader = new FBXLoader();

    // 1. Load the character model first
    loader.load("/models/Meshy_AI_Corsair_King_0323082850_texture_fbx.fbx", (fbx) => {
      fbx.scale.setScalar(0.01);
      fbx.rotation.y = Math.PI;
      fbx.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          c.castShadow    = true;
          c.receiveShadow = true;
        }
      });

      const mixer = new THREE.AnimationMixer(fbx);
      mixerRef.current = mixer;
      setModelObj(fbx);

      // 2. Load animations one at a time to avoid GPU OOM
      const animNames = Object.keys(ANIM_FILES);
      let idx = 0;
      const loadNext = () => {
        if (idx >= animNames.length) return;
        const name = animNames[idx++];
        loader.load(ANIM_FILES[name], (animFbx) => {
          const clip = animFbx.animations[0];
          if (clip) {
            clip.name = name;
            const action = mixer.clipAction(clip);
            actionsRef.current[name] = action;
            if (name === "idle") {
              action.play();
              currentAnim.current = "idle";
            }
          }
          loadNext();
        }, undefined, () => loadNext());
      };
      loadNext();
    });

    return () => {
      mixerRef.current?.stopAllAction();
    };
  }, []);

  // ── Pointer lock / input setup ───────────────────────────────────────────
  const getShootDir = useCallback(() =>
    new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch.current, yaw.current, 0, "YXZ")),
  []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isPointerLocked.current) return;
    yaw.current   -= e.movementX * MOUSE_SENSITIVITY;
    pitch.current -= e.movementY * MOUSE_SENSITIVITY;
    pitch.current  = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 6, pitch.current));
  }, []);

  const handleClick = useCallback(() => {
    if (!isPointerLocked.current) { document.body.requestPointerLock(); return; }
    if (shootCooldown.current > 0 || isReloading) return;
    const fired = shoot();
    if (fired) {
      shootCooldown.current = 0.15;
      onShoot(
        rootRef.current.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
        getShootDir()
      );
    } else if (ammo <= 0) {
      reload();
    }
  }, [shoot, reload, ammo, isReloading, onShoot, getShootDir]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    keys.current[e.code] = true;
    if (e.code === "KeyR") reload();
  }, [reload]);

  const handleKeyUp   = useCallback((e: KeyboardEvent) => { keys.current[e.code] = false; }, []);
  const handlePLChange = useCallback(() => {
    isPointerLocked.current = document.pointerLockElement === document.body;
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove",         handleMouseMove);
    document.addEventListener("click",             handleClick);
    document.addEventListener("keydown",           handleKeyDown);
    document.addEventListener("keyup",             handleKeyUp);
    document.addEventListener("pointerlockchange", handlePLChange);
    return () => {
      document.removeEventListener("mousemove",         handleMouseMove);
      document.removeEventListener("click",             handleClick);
      document.removeEventListener("keydown",           handleKeyDown);
      document.removeEventListener("keyup",             handleKeyUp);
      document.removeEventListener("pointerlockchange", handlePLChange);
    };
  }, [handleMouseMove, handleClick, handleKeyDown, handleKeyUp, handlePLChange]);

  // ── Main game loop ───────────────────────────────────────────────────────
  useFrame((_, delta) => {
    if (!rootRef.current) return;

    if (health <= 0 && !deadFired.current) {
      deadFired.current = true;
      onDead();
      return;
    }
    if (shootCooldown.current > 0) shootCooldown.current -= delta;

    // Advance animation mixer
    mixerRef.current?.update(delta);

    // Switch animation based on state
    let next = "idle";
    if (!isOnGround.current)        next = "jump";
    else if (isMoving.current)      next = isSprinting.current ? "run" : "walk";

    if (next !== currentAnim.current && actionsRef.current[next]) {
      actionsRef.current[currentAnim.current]?.fadeOut(0.2);
      actionsRef.current[next]!.reset().fadeIn(0.2).play();
      currentAnim.current = next;
    }

    // Movement
    const sprint = keys.current["ShiftLeft"] || keys.current["ShiftRight"];
    isSprinting.current = sprint;
    const speed = sprint ? SPRINT_SPEED : MOVE_SPEED;

    const fwd   = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3( Math.cos(yaw.current), 0, -Math.sin(yaw.current));

    const move = new THREE.Vector3();
    if (keys.current["KeyW"] || keys.current["ArrowUp"])    move.add(fwd);
    if (keys.current["KeyS"] || keys.current["ArrowDown"])  move.sub(fwd);
    if (keys.current["KeyA"] || keys.current["ArrowLeft"])  move.sub(right);
    if (keys.current["KeyD"] || keys.current["ArrowRight"]) move.add(right);

    isMoving.current = move.lengthSq() > 0;
    if (isMoving.current) move.normalize().multiplyScalar(speed * delta);
    rootRef.current.position.add(move);

    // Gravity / jump
    if (keys.current["Space"] && isOnGround.current) {
      velocityY.current  = JUMP_FORCE;
      isOnGround.current = false;
    }
    velocityY.current += GRAVITY * delta;
    rootRef.current.position.y += velocityY.current * delta;
    if (rootRef.current.position.y <= 0) {
      rootRef.current.position.y = 0;
      velocityY.current  = 0;
      isOnGround.current = true;
    }

    // Map bounds
    const half = 49;
    rootRef.current.position.x = Math.max(-half, Math.min(half, rootRef.current.position.x));
    rootRef.current.position.z = Math.max(-half, Math.min(half, rootRef.current.position.z));

    playerPosRef.current.copy(rootRef.current.position);
    rootRef.current.rotation.y = yaw.current;

    // ── Over-shoulder camera ─────────────────────────────────────────────
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(pitch.current * 0.6, yaw.current, 0, "YXZ")
    );
    const offsetWorld = SHOULDER_OFFSET.clone().applyQuaternion(q);
    const camTarget   = rootRef.current.position.clone()
      .add(new THREE.Vector3(0, 1.0, 0))
      .add(offsetWorld);
    camera.position.lerp(camTarget, 0.14);

    // Camera looks at aim point
    const aimPt = rootRef.current.position.clone()
      .add(new THREE.Vector3(0, 1.4, 0))
      .add(getShootDir().multiplyScalar(15));
    const curDir  = new THREE.Vector3();
    camera.getWorldDirection(curDir);
    const wantDir = aimPt.clone().sub(camera.position).normalize();
    camera.lookAt(
      camera.position.clone().add(curDir.lerp(wantDir, 0.14).normalize().multiplyScalar(10))
    );
  });

  return (
    <group ref={rootRef}>
      {modelObj ? (
        <primitive object={modelObj} />
      ) : (
        // Fallback capsule while FBX loads
        <group>
          <mesh position={[0, 0.9, 0]} castShadow>
            <capsuleGeometry args={[0.35, 1.0, 4, 8]} />
            <meshStandardMaterial color="#4a90d9" />
          </mesh>
          <mesh position={[0, 1.75, 0]} castShadow>
            <sphereGeometry args={[0.28, 8, 8]} />
            <meshStandardMaterial color="#f4c896" />
          </mesh>
        </group>
      )}
    </group>
  );
}
