// ─── Rapier Collision Groups ───────────────────────────────────────────────────
// Format: (filterMask << 16) | membershipMask
// Two colliders interact iff:
//   (A.membership & B.filter) !== 0  AND  (B.membership & A.filter) !== 0
//
// Layer layout:
//   bit 0 (0x0001) — WORLD  : terrain heightfield, boulders, ruin props
//   bit 1 (0x0002) — PLAYER : player kinematic capsule
//   bit 2 (0x0004) — ZOMBIE : zombie sensor balls (pass-through, hit-detection only)

export const G_WORLD  = 0x0001;
export const G_PLAYER = 0x0002;
export const G_ZOMBIE = 0x0004;

// ── Pre-baked collisionGroups values ──────────────────────────────────────────

// World: belongs to WORLD, interacts with WORLD + PLAYER
export const CG_WORLD  = ((G_WORLD | G_PLAYER) << 16) | G_WORLD;   // 0x00030001

// Player: belongs to PLAYER, interacts with WORLD only
export const CG_PLAYER = (G_WORLD << 16) | G_PLAYER;                // 0x00010002

// Zombie sensors are kinematic + sensor=true — no physical interaction needed,
// but we still assign a group so shape-cast hit tests can distinguish them
export const CG_ZOMBIE_SENSOR = (0x0000 << 16) | G_ZOMBIE;          // 0x00000004
