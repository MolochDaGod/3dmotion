export type WeaponId = "pistol" | "rifle" | "sword" | "axe" | "staff" | "bow" | "shield";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  color: [number, number, number];
  emissiveColor: [number, number, number];
  shape: "box" | "cylinder" | "sphere";
  scale: [number, number, number];
  offset: [number, number, number];
  attackAnim: "lunge" | "swing" | "cast" | "draw" | "bash";
}

export interface SkillDef {
  name: string;
  icon: string;
  cooldown: number;
  color: string;
  effectType: "projectile" | "aoe" | "nova" | "beam";
}

export interface SceneConfig {
  id: string;
  name: string;
  description: string;
  fogColor: [number, number, number];
  fogDensity: number;
  ambientColor: [number, number, number];
  skyColor: [number, number, number];
  groundColor: [number, number, number];
  lightColor: [number, number, number];
  lightAngle: [number, number, number];
  accentColor: [number, number, number];
  portalTargets: string[];
}

export interface PortalDef {
  targetSceneId: string;
  position: [number, number, number];
  rotation: [number, number, number];
  color: [number, number, number];
}

export interface SkillCooldowns {
  1: number;
  2: number;
  3: number;
  4: number;
}
