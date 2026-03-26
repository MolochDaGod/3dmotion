import { useEffect, useRef, useState } from "react";
import * as pc from "playcanvas";

interface RendererInfo {
  backend: string;
  vendor: string;
  renderer: string;
}

export default function PlayCanvasScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<pc.Application | null>(null);
  const [info, setInfo] = useState<RendererInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let app: pc.Application;
    let alive = true;

    async function init() {
      try {
        app = new pc.Application(canvas!, {
          keyboard: new pc.Keyboard(window),
          mouse: new pc.Mouse(canvas!),
          graphicsDeviceOptions: {
            preferWebGpu: true,
            alpha: false,
            antialias: true,
          },
        });

        if (!alive) { app.destroy(); return; }
        appRef.current = app;

        app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
        app.setCanvasResolution(pc.RESOLUTION_AUTO);

        // Detect backend
        const gd = app.graphicsDevice;
        const backendName = (gd as any).webgpu ? "WebGPU" : "WebGL2";
        const gl = (gd as any).gl as WebGL2RenderingContext | undefined;
        const ext = gl ? gl.getExtension("WEBGL_debug_renderer_info") : null;
        const vendor = ext ? gl!.getParameter(ext.UNMASKED_VENDOR_WEBGL) : navigator.vendor;
        const renderer = ext
          ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : backendName === "WebGPU" ? "WebGPU Adapter" : "WebGL2 Renderer";

        setInfo({ backend: backendName, vendor, renderer });

        // ─── Scene setup ───────────────────────────────────────────────

        // Skybox colour camera
        const camera = new pc.Entity("camera");
        camera.addComponent("camera", {
          clearColor: new pc.Color(0.04, 0.04, 0.08),
          fov: 55,
          nearClip: 0.1,
          farClip: 1000,
        });
        camera.setPosition(0, 6, 14);
        camera.lookAt(new pc.Vec3(0, 0, 0));
        app.root.addChild(camera);

        // Directional light with shadows
        const dirLight = new pc.Entity("dirLight");
        dirLight.addComponent("light", {
          type: pc.LIGHTTYPE_DIRECTIONAL,
          color: new pc.Color(1, 0.96, 0.88),
          intensity: 1.4,
          castShadows: true,
          shadowBias: 0.05,
          normalOffsetBias: 0.05,
          shadowResolution: 2048,
        });
        dirLight.setEulerAngles(50, 30, 0);
        app.root.addChild(dirLight);

        // Ambient fill
        const fillLight = new pc.Entity("fillLight");
        fillLight.addComponent("light", {
          type: pc.LIGHTTYPE_DIRECTIONAL,
          color: new pc.Color(0.25, 0.35, 0.55),
          intensity: 0.6,
          castShadows: false,
        });
        fillLight.setEulerAngles(-50, -30, 0);
        app.root.addChild(fillLight);

        // Ground plane
        const ground = new pc.Entity("ground");
        ground.addComponent("render", {
          type: "plane",
          castShadows: false,
          receiveShadows: true,
        });
        const groundMat = new pc.StandardMaterial();
        groundMat.diffuse = new pc.Color(0.08, 0.08, 0.12);
        groundMat.gloss = 0.6;
        groundMat.metalness = 0.0;
        groundMat.update();
        (ground.render as pc.RenderComponent).meshInstances[0].material = groundMat;
        ground.setLocalScale(20, 1, 20);
        ground.setPosition(0, -1.5, 0);
        app.root.addChild(ground);

        // Material palette
        const makeStdMat = (
          r: number, g: number, b: number,
          metalness = 0, gloss = 0.5
        ) => {
          const m = new pc.StandardMaterial();
          m.diffuse = new pc.Color(r, g, b);
          m.metalness = metalness;
          m.gloss = gloss;
          m.update();
          return m;
        };

        const palettes = [
          makeStdMat(0.9, 0.15, 0.1,  0.0, 0.3),  // red matte
          makeStdMat(0.1, 0.6,  0.9,  0.9, 0.8),  // blue metal
          makeStdMat(0.9, 0.7,  0.1,  0.0, 0.5),  // yellow
          makeStdMat(0.1, 0.9,  0.4,  0.5, 0.7),  // green semi-metal
          makeStdMat(0.8, 0.1,  0.8,  0.8, 0.9),  // purple metal
          makeStdMat(0.95, 0.95, 0.95, 1.0, 0.95), // chrome
        ];

        // Grid of cubes
        const COLS = 5;
        const ROWS = 2;
        const GAP = 2.8;
        const offsetX = ((COLS - 1) * GAP) / 2;
        const entities: { entity: pc.Entity; speed: number; axis: pc.Vec3 }[] = [];

        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            const box = new pc.Entity(`box_${row}_${col}`);
            box.addComponent("render", {
              type: "box",
              castShadows: true,
              receiveShadows: true,
            });
            const mat = palettes[(row * COLS + col) % palettes.length];
            (box.render as pc.RenderComponent).meshInstances[0].material = mat;

            const x = col * GAP - offsetX;
            const y = row * GAP;
            box.setPosition(x, y, 0);
            box.setLocalScale(1.4, 1.4, 1.4);
            app.root.addChild(box);

            // Random rotation axis & speed
            const axis = new pc.Vec3(
              (Math.random() - 0.5) * 2,
              (Math.random() - 0.5) * 2,
              (Math.random() - 0.5) * 2
            ).normalize();
            entities.push({ entity: box, speed: 25 + Math.random() * 45, axis });
          }
        }

        // Floating sphere showcase
        const sphere = new pc.Entity("sphere");
        sphere.addComponent("render", { type: "sphere", castShadows: true });
        const chromeMat = makeStdMat(0.92, 0.92, 0.96, 1.0, 0.98);
        (sphere.render as pc.RenderComponent).meshInstances[0].material = chromeMat;
        sphere.setPosition(0, 6, 0);
        sphere.setLocalScale(2.2, 2.2, 2.2);
        app.root.addChild(sphere);

        // Orbit root for camera
        const orbitRoot = new pc.Entity("orbitRoot");
        app.root.addChild(orbitRoot);

        let time = 0;
        let camAngle = 0;

        // ─── Update loop ────────────────────────────────────────────────
        app.on("update", (dt: number) => {
          time += dt;

          // Spin each cube on its own axis
          for (const { entity, speed, axis } of entities) {
            entity.rotate(axis.x * speed * dt, axis.y * speed * dt, axis.z * speed * dt);
          }

          // Float the sphere
          sphere.setPosition(0, 5.5 + Math.sin(time * 0.8) * 0.6, 0);
          sphere.rotate(0, 40 * dt, 15 * dt);

          // Slowly orbit the camera
          camAngle += dt * 0.12;
          const cx = Math.sin(camAngle) * 14;
          const cz = Math.cos(camAngle) * 14;
          camera.setPosition(cx, 7, cz);
          camera.lookAt(new pc.Vec3(0, 2, 0));
        });

        app.start();
        setLoading(false);
      } catch (err) {
        console.error("PlayCanvas init error:", err);
        setLoading(false);
      }
    }

    init();

    return () => {
      alive = false;
      if (appRef.current) {
        appRef.current.destroy();
        appRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-cyan-400 text-sm tracking-widest uppercase">Initializing GPU…</p>
        </div>
      )}

      {/* Renderer badge */}
      {info && !loading && (
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase border ${
              info.backend === "WebGPU"
                ? "bg-violet-950/80 border-violet-500 text-violet-200"
                : "bg-cyan-950/80 border-cyan-500 text-cyan-200"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full animate-pulse ${
                info.backend === "WebGPU" ? "bg-violet-400" : "bg-cyan-400"
              }`}
            />
            {info.backend} Active
          </span>
          <span className="bg-black/60 border border-white/10 text-white/50 text-[10px] px-3 py-1 rounded-full font-mono truncate max-w-xs">
            {info.renderer}
          </span>
        </div>
      )}

      {/* Title */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-center pointer-events-none">
        <p className="text-white/20 text-xs tracking-[0.3em] uppercase font-mono">PlayCanvas Engine</p>
        <p className="text-white/10 text-[10px] tracking-wider font-mono mt-0.5">WebGPU ∙ WebGL2 ∙ PBR Materials ∙ Real-time Shadows</p>
      </div>
    </div>
  );
}
