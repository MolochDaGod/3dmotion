# Annihilate Repo — Architecture Learnings

Studied: `/tmp/annihilate` (three.js + cannon-es game, ~2024)

---

## 1. Model Assets

| Model | Format | Animations |
|-------|--------|-----------|
| `model/mutant/a.gltf + a.bin + a.jpg` | GLTF | idle, running, punch, punchStart, punchEnd, fist, jumpAttack, jumpAttackStart, jumpAttackEnd, dash, hit, knockDown, jump |
| `model/fel_lord/a.glb` | GLB | (boss creature) |
| `model/maria/` | GLTF | (player) |
| `model/paladin/` | GLTF | (knight enemy) |

**Copied to our game:** `public/models/mutant.{gltf,bin,jpg}` + `public/models/boss.glb`

---

## 2. Character FSM (XState)

Each character (Mutant, Paladin, Robot) has its own XState machine:

```
loading → idle → run ⇄ attack
                ↓         ↓
               hit      knockDown
                ↓         ↓
               dead ←────┘
```

States use **tags** instead of direct state checks:
- `canMove` — body position can be updated
- `canFacing` — rotation can change
- `canDamage` — weapon/attacker body causes damage
- `canLaunch` — heavy hit that launches enemy into air

**Key pattern:** FSM sends `finish` event from `mixer.addEventListener('finished')`, not timeouts.

---

## 3. Physics — Compound Capsule (cannon-es)

```js
// Sphere-cylinder-sphere capsule (equivalent to Rapier CapsuleCollider)
const RADIUS = 0.5;
const CYLINDER_H = 0.65; // bodyHeight(1.65) - radius*2
body.addShape(new Sphere(RADIUS), new Vec3(0, +CYLINDER_H/2, 0)); // top sphere
body.addShape(new Sphere(RADIUS), new Vec3(0, -CYLINDER_H/2, 0)); // bottom sphere
body.addShape(new Cylinder(RADIUS, RADIUS, CYLINDER_H, 8));         // middle cylinder
body.fixedRotation = true; // prevent tipping
// Visual mesh offset: mesh.y = body.y - bodyHeight/2
```

**Rapier equivalent** already in our game: `CapsuleCollider` + `KinematicPositionBased` controller.

---

## 4. Collision Bitmask Groups

```js
GROUP_SCENE          = 2   // terrain, walls, boxes
GROUP_ROLE           = 4   // player character body
GROUP_ENEMY          = 8   // enemy character bodies
GROUP_ROLE_ATTACKER  = 16  // player weapon/sword bodies
GROUP_ENEMY_ATTACKER = 32  // enemy weapon / bullet bodies
GROUP_TRIGGER        = 64  // detector spheres (no collision response)
GROUP_ENEMY_SHIELD   = 128 // shield bodies
```

Player body: group=ROLE, mask=SCENE|ENEMY|ENEMY_ATTACKER
Enemy body: group=ENEMY, mask=SCENE|ROLE|ENEMY|ROLE_ATTACKER
Detector: group=TRIGGER, mask=ROLE (collisionResponse=false)

---

## 5. AI System (Ai.js + MutantAi.js)

### Detection (Ai.js)
- Static `CANNON.Sphere` body attached to enemy (10-unit radius default, 10 for mutant)
- Group: `TRIGGER`, Mask: `ROLE`
- `collisionResponse = false` — no physical push, just overlap detection
- `beginContact` → `setTarget(event.body.belongTo)` — stores player ref
- `endContact` → `setTarget(null)` — loses target

### Per-frame AI Update
```js
update(dt) {
  if (!this.enabled) return;
  if (this.target) {
    // Direction to target (XZ plane only)
    this.character.direction.x = target.body.position.x - character.body.position.x;
    this.character.direction.y = target.body.position.z - character.body.position.z;
    
    // Face toward target
    if (state.hasTag('canFacing')) {
      character.mesh.rotation.y = -direction.angle() + Math.PI/2;
    }
    
    if (direction.length() > this.distance) {
      character.service.send('run');
      // Direct position mutation (no velocity):
      character.body.position.x += direction.normalized.x * speed * dt * 60;
      character.body.position.z += direction.normalized.y * speed * dt * 60;
    } else {
      this.attack(); // within attack range
    }
  } else {
    // No target → return to initial spawn position if far away
    character.service.send('stop');
  }
  // Detector follows enemy body
  this.detector.position.copy(character.body.position);
}
```

### Attack Cooldown (MutantAi.js)
- Own XState machine: `canAttack` → (4000ms timer) → `canNotAttack`
- On attack: sends `attack` then (1600ms later) `keyJUp` to character FSM

---

## 6. Weapon Tracking (GreatSword.js + Attacker.js)

```js
// Every frame: track sword delegate bone in world space
update() {
  if (this.owner.gltf) {
    const tempVec3 = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    this.owner.swordDelegate.getWorldPosition(tempVec3);  // delegate Object3D on bone
    this.owner.swordDelegate.getWorldQuaternion(tempQuat);
    this.body.position.copy(tempVec3);
    this.body.quaternion.copy(tempQuat);
  }
  // Then check collisions
}
```

**`belongTo` pattern:** Every body has `body.belongTo = this` for reverse lookup in collision callbacks.

---

## 7. `isBeginCollide` Pattern

```js
body.collidings = [];  // currently touching bodies

body.addEventListener('collide', (event) => {
  const isBeginCollide = !body.collidings.includes(event.body);
  if (isBeginCollide) body.collidings.push(event.body);
  this.collide(event, isBeginCollide); // only process first contact
});

body.addEventListener('endContact', (event) => {
  body.collidings.splice(body.collidings.indexOf(event.body), 1);
});
```

Prevents multiple hits when two bodies stay in contact over multiple frames.

---

## 8. Hit + Knockdown + Launch

```js
// In GreatSword.collide():
if (owner.service.state.hasTag('knockDown')) {
  event.body.belongTo.knockDown(event);
} else {
  event.body.belongTo.hit(event);
  if (state.hasTag('canLaunch') && !target.isAir) {
    gsap.to(event.body.position, { duration: 0.3, y: body.position.y + 3.7 });
    target.isAir = true;
  }
}
```

---

## 9. `isAir` Flag

- Set `true` when launched by hit
- Cleared when `beginContact` fires with non-attacker/non-trigger body
- Used to prevent multiple launches and for air-hit animations

---

## 10. `fadeToAction` Pattern

```js
fadeToAction(name, duration = 0.2) {
  this.action_act.stop();          // stop current
  this.oaction[name].reset().play();
  this.action_act = this.oaction[name];
}
```

A simpler variant; annihilate sometimes uses crossfade, sometimes hard stop+play.

---

## 11. Splash (Blood) Effects

```js
// new Splash(event.collideEvent) — uses contact normal to spawn particle effect
// event.contact.rj / event.contact.bi gives contact point info
```

---

## Key Takeaways for Our Game

1. **Use detector sphere** instead of per-frame `distanceTo` for aggro — more performant, event-driven
2. **Direct position mutation** for AI movement (not physics impulses) — smoother, more predictable
3. **`canMove` tag** gates whether AI can move the body
4. **Bone delegate Object3D** for weapon tracking — add Object3D child to weapon-tip bone
5. **`mixer.addEventListener('finished')`** + FSM `finish` event for animation transitions
6. **`body.belongTo = this`** for O(1) collision lookup
7. **`beginContact` not `collide`** for gameplay hits (prevents multi-hit)
8. **`isAir` flag** driven by contact events for physics state tracking
9. **Bitmask collision groups** for separating player/enemy/weapon/trigger layers
10. **GLTF** preferred over FBX — smaller, native animation names, all-in-one file
