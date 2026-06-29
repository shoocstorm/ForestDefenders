import * as THREE from 'three';
import { toon, addOutlines } from '../materials/CelMaterial.js';
import { damp, lerp, clamp } from '../util/MathUtils.js';

// Hero "Squrriel" — fully PROCEDURAL pivot rig (no GLB). Built from cel-shaded
// primitives organized into named pivots (legs / arms / body / head / tail / gun)
// so locomotion + one-shots are driven analytically in update(). This replaces the
// heavyweight authored squrriel.glb: every proportion, pose and animation is a
// number here, which makes it trivial to fine-tune and to bolt on more clips later.
//
// Primitives are authored facing -Z, but Player's facing math
// (group.rotation.y = atan2(wish.x, wish.z)) expects a +Z-facing model, so we apply
// an inner 180° flip on modelRoot (Player keeps setting group.rotation.y = facing
// unchanged). Without this flip the hero faces opposite its movement direction.
//
// Interface consumed by Player.js (unchanged):
//   .group, .muzzleWorldPosition, .update(dt),
//   .setLocomotion({moving,running,grounded}), .playJump(), .playShot(),
//   .setFirstPerson(fp)

const HIP_Y = 0.40;          // hip pivot height (legs hang below to the ground)
const SHOT_DUR = 0.26;       // recoil one-shot length (s)
const JUMP_POP = 0.18;       // takeoff knee-pop decay window (s)
const SWITCH_DUR = 0.4;      // weapon-swap dip
const KICK_DUR = 0.6;        // kick one-shot (extended for jump kick)
const TAIL_DUR = 0.7;        // tail-swing spin one-shot

// Palette — "Frost Ranger": cool slate-blue fur, frost-white belly, teal mids,
// glowing cyan accents + warm amber eyes for contrast, dark gunmetal rifle.
const FUR      = 0x4a6c8f;   // slate blue
const FUR_DARK = 0x2f4a66;   // deep navy (shadow fur / boots / forearms)
const CREAM    = 0xe7f1f7;   // frost-white belly
const PINK     = 0x9fd8e6;   // icy ear inner
const DARK     = 0x10161d;   // near-black detailing
const METAL    = 0x3a3d44;
const WOOD     = 0x6e4a26;
const GLOW     = 0x5fe6ff;   // cyan energy glow (eyes, gem, tail tip)
const AMBER    = 0xffb347;   // warm amber iris (pops against the cool fur)

const T = (c, o = {}) => toon({ color: c, ...o });
// Self-lit glow material (emissive cel) for energy accents.
const GLOWMAT = (c = GLOW, i = 1.6) =>
  toon({ color: c, emissive: c, emissiveIntensity: i, rim: { color: c, intensity: 0.9 } });

// Per-weapon gun silhouettes (keyed by WEAPONS id). The hero rebuilds its held
// gun from these so the selected weapon is visible in the hand, without authoring
// 9 separate GLBs. `barL`/`barR` size the barrel; `barrels` adds a side-by-side
// twin; `tip` adds a distinctive muzzle device; `bigMag`/`bow` toggle extras.
const GUN_SHAPES = {
  ACORN:       { body: WOOD,     metal: METAL,    barL: 0.34, barR: 0.022, barrels: 1, tip: 'none' },
  GANON:       { body: 0x2c3550, metal: 0x35507a, barL: 0.30, barR: 0.030, barrels: 1, tip: 'coil' },
  MACHINE:     { body: 0x33363d, metal: METAL,    barL: 0.44, barR: 0.024, barrels: 1, tip: 'vent', bigMag: true },
  BOOM:        { body: WOOD,     metal: 0x4a3115, barL: 0.24, barR: 0.050, barrels: 2, tip: 'none' },
  LASER:       { body: 0x3a2230, metal: 0x6a2240, barL: 0.36, barR: 0.018, barrels: 1, tip: 'emitter' },
  SHOTGUN:     { body: WOOD,     metal: METAL,    barL: 0.26, barR: 0.046, barrels: 2, tip: 'none' },
  FIRE_BULLET: { body: 0x4a2a18, metal: 0x6e3a1a, barL: 0.30, barR: 0.030, barrels: 1, tip: 'vent' },
  BOW:         { body: 0x2f5a2a, metal: 0x3f7a35, barL: 0.30, barR: 0.016, barrels: 1, tip: 'none', bow: true },
  TOROID:      { body: 0x214a55, metal: 0x2c6470, barL: 0.20, barR: 0.070, barrels: 1, tip: 'ring' },
};

function mesh(geo, mat, parent, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export class HeroModel {
  constructor() {
    this.group = new THREE.Group();
    this.modelRoot = new THREE.Group();
    this.group.add(this.modelRoot);
    this.rig = {};
    this.pivots = {};
    this.arms = [];      // two-bone IK chains (shoulder→elbow→paw) that grip the gun

    // Reusable scratch for the per-frame arm IK (no per-frame allocations).
    this._ik = {
      to: new THREE.Vector3(), pole: new THREE.Vector3(),
      x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(),
      tgt: new THREE.Vector3(), m: new THREE.Matrix4(),
      qBase: new THREE.Quaternion(), qBend: new THREE.Quaternion(),
      X: new THREE.Vector3(1, 0, 0),
    };

    // Locomotion + one-shot state (all posing is analytic in update()).
    this.grounded = true;
    this.moving = false;
    this.running = false;
    this._speed01 = 0;  // idle→run blend (damped)
    this._move01 = 0;   // stand→move blend (damped)
    this._air01 = 0;    // grounded→airborne blend (damped)
    this._phase = 0;    // stride phase
    this._t = 0;        // global clock (idle breathing, tail sway)
    this._shotT = 0;    // recoil timer
    this._popT = 0;     // takeoff knee-pop timer
    this._switchT = 0;  // weapon-swap dip timer
    this._kickT = 0;    // kick one-shot timer
    this._tailT = 0;    // tail-swing one-shot timer

    this._build();
  }

  _build() {
    const root = this.modelRoot;
    // -Z-authored geometry → +Z-facing in group space (matches Player.facing math).
    root.rotation.y = Math.PI;

    // --- Legs (hip pivots under root so the feet stay planted while the body
    // bobs). Each leg points down; the foot reaches the ground at y≈0. ---
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.13, HIP_Y, 0);
      root.add(hip);
      mesh(new THREE.CapsuleGeometry(0.075, 0.20, 4, 8), T(FUR), hip, [0, -0.16, 0]);
      mesh(new THREE.CapsuleGeometry(0.06, 0.14, 4, 8), T(FUR_DARK), hip, [0, -0.30, 0.01]);
      // Foot — pointing forward (-Z).
      const foot = mesh(new THREE.SphereGeometry(0.085, 10, 8), T(FUR_DARK), hip, [0, -0.38, -0.05]);
      foot.scale.set(1, 0.6, 1.7);
      this.rig[side < 0 ? 'legL' : 'legR'] = hip;
    }

    // --- Body pivot (torso + everything above; carries bob + lean). ---
    const body = new THREE.Group();
    body.position.set(0, HIP_Y, 0);
    root.add(body);
    this.rig.body = body;

    // Torso: cream belly over a fur back, slight pear taper.
    const torso = mesh(new THREE.SphereGeometry(0.21, 14, 12), T(FUR), body, [0, 0.16, 0]);
    torso.scale.set(1.0, 1.25, 0.95);
    const belly = mesh(new THREE.SphereGeometry(0.17, 14, 12), T(CREAM), body, [0, 0.13, -0.07]);
    belly.scale.set(0.9, 1.2, 0.7);

    // Ranger scarf — a dark navy collar ring that breaks the neck silhouette,
    // with a glowing energy gem set at the throat (the hero's "core").
    const scarf = mesh(new THREE.TorusGeometry(0.13, 0.045, 8, 16), T(FUR_DARK), body, [0, 0.34, -0.02], [Math.PI / 2, 0, 0]);
    scarf.scale.set(1, 1, 0.8);
    const gem = mesh(new THREE.OctahedronGeometry(0.05, 0), GLOWMAT(GLOW, 1.8), body, [0, 0.30, -0.16]);
    gem.scale.set(1, 1.4, 0.7);
    gem.userData.__outline = true; // keep the gem reading as pure light
    this.rig.gem = gem;

    // --- Head pivot. ---
    const head = new THREE.Group();
    head.position.set(0, 0.44, -0.02);
    body.add(head);
    this.rig.head = head;
    mesh(new THREE.SphereGeometry(0.18, 16, 14), T(FUR), head, [0, 0, 0]);
    // Chubby cream cheeks — the chipmunk/squirrel "stuffed" look, framing a short
    // rounded muzzle with a small dark nose. Kept simple: no mask band, no brows.
    for (const sx of [-1, 1]) {
      const cheek = mesh(new THREE.SphereGeometry(0.075, 10, 8), T(CREAM), head, [sx * 0.075, -0.05, -0.10]);
      cheek.scale.set(1.0, 0.9, 1.0);
    }
    const snout = mesh(new THREE.SphereGeometry(0.085, 12, 10), T(CREAM), head, [0, -0.04, -0.13]);
    snout.scale.set(1.05, 0.9, 1.05);
    const nose = mesh(new THREE.SphereGeometry(0.028, 8, 8), T(0x3a2a2e), head, [0, -0.02, -0.205]); // small nose
    nose.scale.set(1.1, 0.85, 1);
    for (const sx of [-1, 1]) {
      // Simple beady eyes: a round dark sphere with one bright catchlight. Friendly,
      // not heroic — the typical squirrel read.
      const eye = mesh(new THREE.SphereGeometry(0.042, 12, 12), T(DARK), head, [sx * 0.078, 0.055, -0.15]);
      eye.scale.set(1, 1.05, 1);
      mesh(new THREE.SphereGeometry(0.014, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff }), head, [sx * 0.088, 0.075, -0.182]);
      // Ears — tall tufted squirrel ears with icy inner + glow tip.
      const ear = mesh(new THREE.ConeGeometry(0.05, 0.16, 7), T(FUR), head, [sx * 0.10, 0.20, 0.02], [0.1, 0, sx * 0.2]);
      mesh(new THREE.ConeGeometry(0.026, 0.10, 7), T(PINK), ear, [0, -0.01, 0.012]);
      mesh(new THREE.SphereGeometry(0.018, 6, 6), GLOWMAT(GLOW, 1.2), ear, [0, 0.085, 0]); // glowing ear tuft
    }
    // Prominent buck teeth — the squirrel signature, two front incisors.
    for (const sx of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.026, 0.05, 0.018), T(0xfffef2), head, [sx * 0.016, -0.10, -0.205]);
    }

    // --- Arms: real two-bone chains (shoulder → elbow → paw). Built straight,
    // hanging down -Y; update() solves IK each frame so the paws land on the
    // gun's grip pivots and follow it through bob/recoil (genuine grip, not a
    // fixed pose). l1/l2 are the upper/forearm bone lengths the solver uses. ---
    const L1 = 0.19, L2 = 0.19; // bone lengths → total reach 0.38
    for (const side of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(side * 0.17, 0.30, -0.02);
      body.add(sh);
      // Upper arm hangs along -Y; elbow pivot sits at its far end.
      mesh(new THREE.CapsuleGeometry(0.055, L1 - 0.06, 4, 8), T(FUR), sh, [0, -L1 / 2, 0]);
      const elbow = new THREE.Group();
      elbow.position.set(0, -L1, 0);
      sh.add(elbow);
      mesh(new THREE.CapsuleGeometry(0.05, L2 - 0.06, 4, 8), T(FUR_DARK), elbow, [0, -L2 / 2, 0]);
      mesh(new THREE.SphereGeometry(0.06, 10, 8), T(CREAM), elbow, [0, -L2, 0]); // paw
      this.rig[side < 0 ? 'armL' : 'armR'] = sh;
      // side<0 (left) takes the forward fore-grip; side>0 (right) the rear trigger grip.
      this.arms.push({ shoulder: sh, elbow, l1: L1, l2: L2, side, grip: side < 0 ? 'gripFore' : 'gripRear' });
    }

    // --- Rifle (held under the body pivot so it tracks chest pose). Barrel -Z. ---
    const gun = new THREE.Group();
    gun.position.set(0.02, 0.26, -0.18);
    body.add(gun);
    this.rig.gun = gun;
    // Disposable visual shell — rebuilt per selected weapon by setWeapon(). The
    // grips/muzzle/bolt/accent pivots below are persistent so the IK + VFX keep
    // working across swaps.
    const gunMeshes = new THREE.Group();
    gun.add(gunMeshes);
    this.rig.gunMeshes = gunMeshes;
    // Charging bolt: rides on top of the receiver and slides back on each shot.
    const bolt = mesh(new THREE.BoxGeometry(0.03, 0.03, 0.08), T(0x202227), gun, [0.045, 0.06, -0.06]);
    this.rig.bolt = bolt;
    this._boltRestZ = bolt.position.z;
    // Grip pivots the paws IK onto (children of the gun → they track recoil/bob).
    const gripRear = new THREE.Object3D();   // right trigger hand, by the receiver
    gripRear.position.set(0.02, -0.05, -0.04);
    gun.add(gripRear);
    this.pivots.gripRear = gripRear;
    const gripFore = new THREE.Object3D();    // left support hand, on the forestock
    gripFore.position.set(-0.02, -0.04, -0.16);
    gun.add(gripFore);
    this.pivots.gripFore = gripFore;
    // Muzzle origin at the barrel tip (non-mesh → no outline). Repositioned per
    // weapon (barrel length varies) by setWeapon().
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.02, -0.48);
    gun.add(muzzle);
    this.pivots.muzzle = muzzle;
    // Glowing energy cell — recolored per weapon (setWeaponTint) so each weapon
    // reads distinctly on top of the per-weapon silhouette.
    const accent = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.11),
      new THREE.MeshBasicMaterial({ color: 0xc7e08a }));
    accent.position.set(-0.045, 0.055, -0.02);
    accent.userData.__outline = true; // skip inverted-hull outline on the glow cell
    gun.add(accent);
    this.gunAccent = accent;
    // Build the default silhouette; Player calls setWeapon() with the real def.
    this._buildGunMeshes(null);

    // --- Bushy tail: S-curve of swelling spheres rising up behind the back. ---
    const tail = new THREE.Group();
    tail.position.set(0, 0.10, 0.16);
    body.add(tail);
    this.rig.tail = tail;
    const segs = [
      { p: [0, 0.02, 0.06], r: 0.10, c: FUR },
      { p: [0, 0.14, 0.14], r: 0.15, c: FUR },
      { p: [0, 0.30, 0.16], r: 0.19, c: FUR_DARK },
      { p: [0, 0.46, 0.10], r: 0.20, c: FUR },
      { p: [0, 0.58, -0.02], r: 0.16, c: CREAM },
    ];
    for (const s of segs) mesh(new THREE.SphereGeometry(s.r, 12, 10), T(s.c), tail, s.p);
    // Frost-glow tip caps the tail with a cool energy accent.
    mesh(new THREE.SphereGeometry(0.07, 10, 8), GLOWMAT(GLOW, 0.9), tail, [0, 0.64, -0.05]);

    addOutlines(root, { thickness: 0.014 });

    // Cache rest transforms we overlay animation onto.
    this._bodyRestY = body.position.y;
    this._gunRestZ = gun.position.z;
    this._gunRestY = gun.position.y;
  }

  // --- State intake from Player (no early-out: posing all happens in update). ---
  setLocomotion({ moving, running, grounded }) {
    this.moving = !!moving;
    this.running = !!running;
    this.grounded = grounded !== false;
  }

  playJump() { this._popT = JUMP_POP; }
  playShot() { this._shotT = SHOT_DUR; }
  playSwitch() { this._switchT = SWITCH_DUR; }
  playKick() { this._kickT = KICK_DUR; }
  playTail() { this._tailT = TAIL_DUR; }
  setFirstPerson(fp) { this.modelRoot.visible = !fp; }
  setWeaponTint(color) { this.gunAccent?.material.color.setHex(color); }

  // Swap the held weapon: rebuild the gun silhouette + retint the glow cell so the
  // hero visibly holds whatever the player selected. Called by Player on switch.
  setWeapon(def) {
    this._buildGunMeshes(def);
    if (def?.muzzleColor != null) this.setWeaponTint(def.muzzleColor);
  }

  // (Re)build the disposable gun shell from the weapon's GUN_SHAPES profile and
  // park the muzzle pivot at the new barrel tip. Pivots/bolt/accent are untouched.
  _buildGunMeshes(def) {
    const g = this.rig.gunMeshes;
    for (let i = g.children.length - 1; i >= 0; i--) {
      const c = g.children[i];
      c.traverse?.((o) => o.geometry?.dispose?.());
      g.remove(c);
    }
    const s = GUN_SHAPES[def?.id] || GUN_SHAPES.ACORN;
    const rearZ = -0.13;                 // barrel root, just ahead of the receiver
    const barCenterZ = rearZ - s.barL / 2;
    const tipZ = rearZ - s.barL;

    const stock = mesh(new THREE.BoxGeometry(0.07, 0.09, 0.20), T(s.body), g, [0, 0, 0.12]);
    stock.rotation.x = 0.15;
    mesh(new THREE.BoxGeometry(0.06, 0.07, 0.26), T(s.metal), g, [0, 0.01, -0.06]);   // receiver
    mesh(new THREE.BoxGeometry(0.05, 0.045, 0.16), T(s.body), g, [0, 0.0, -0.20]);     // forestock
    const offsets = s.barrels === 2 ? [-0.028, 0.028] : [0];
    for (const ox of offsets) {
      mesh(new THREE.CylinderGeometry(s.barR, s.barR, s.barL, 10), T(s.metal), g,
        [ox, 0.02, barCenterZ], [Math.PI / 2, 0, 0]);
    }
    mesh(new THREE.BoxGeometry(0.035, s.bigMag ? 0.14 : 0.10, 0.05), T(s.metal), g, [0, -0.08, 0.0]); // magazine

    // Distinctive muzzle device at the tip.
    if (s.tip === 'coil') {
      mesh(new THREE.TorusGeometry(s.barR + 0.02, 0.012, 6, 12), T(s.metal), g, [0, 0.02, tipZ + 0.03], [0, 0, 0]);
    } else if (s.tip === 'vent') {
      mesh(new THREE.BoxGeometry(0.055, 0.05, 0.06), T(s.metal), g, [0, 0.02, tipZ + 0.02]);
    } else if (s.tip === 'emitter') {
      mesh(new THREE.CylinderGeometry(0.01, 0.026, 0.07, 10), T(s.metal), g, [0, 0.02, tipZ - 0.02], [Math.PI / 2, 0, 0]);
    } else if (s.tip === 'ring') {
      mesh(new THREE.TorusGeometry(s.barR + 0.01, 0.018, 8, 16), T(s.metal), g, [0, 0.02, tipZ + 0.02], [0, 0, 0]);
    }
    // Forest Bow: a pair of curved limbs framing the barrel instead of a tube body.
    if (s.bow) {
      for (const sy of [-1, 1]) {
        mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 10, Math.PI * 0.7), T(s.metal), g,
          [0, 0.02 + sy * 0.0, barCenterZ + 0.04], [0, sy > 0 ? 0 : Math.PI, sy * 0.9]);
      }
    }

    this.pivots.muzzle.position.set(0, 0.02, tipZ - 0.02);
    addOutlines(g, { thickness: 0.014 });
  }

  get muzzleWorldPosition() {
    return this.pivots.muzzle.getWorldPosition(new THREE.Vector3());
  }

  // Two-bone IK (law of cosines) solved in body-local space: orient the shoulder
  // + elbow so the paw lands on its gun grip pivot. The grip is a child of the
  // gun, so the hand tracks every bit of bob, lean and recoil for a real grip.
  _solveArm(arm) {
    const ik = this._ik;
    const gun = this.rig.gun;
    // Grip target in body-local space (gun only rotates about X + slides in Z).
    ik.tgt.copy(this.pivots[arm.grip].position).applyEuler(gun.rotation).add(gun.position);
    const S = arm.shoulder.position;
    ik.to.subVectors(ik.tgt, S);
    let d = ik.to.length();
    const reach = arm.l1 + arm.l2;
    d = clamp(d, Math.abs(arm.l1 - arm.l2) + 1e-3, reach * 0.999);
    ik.to.normalize(); // shoulder→grip dir; the arm aims its local -Y down this.

    // Pole splays elbows down + outward so they read as elbows (not back-bent).
    ik.pole.set(arm.side * 0.6, -1, 0.25).normalize();
    ik.x.crossVectors(ik.to, ik.pole).normalize(); // hinge axis (local +X)
    ik.y.copy(ik.to).multiplyScalar(-1);           // local +Y (arm hangs along -Y)
    ik.z.crossVectors(ik.x, ik.y).normalize();
    ik.m.makeBasis(ik.x, ik.y, ik.z);
    ik.qBase.setFromRotationMatrix(ik.m);

    const a = arm.l1, b = arm.l2;
    const alpha = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1)); // shoulder bend
    const gamma = Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1)); // elbow interior
    ik.qBend.setFromAxisAngle(ik.X, alpha);
    arm.shoulder.quaternion.copy(ik.qBase).multiply(ik.qBend);
    arm.elbow.rotation.set(-(Math.PI - gamma), 0, 0);
  }

  update(dt) {
    this._t += dt;
    if (this._shotT > 0) this._shotT = Math.max(0, this._shotT - dt);
    if (this._popT > 0) this._popT = Math.max(0, this._popT - dt);
    if (this._switchT > 0) this._switchT = Math.max(0, this._switchT - dt);
    if (this._kickT > 0) this._kickT = Math.max(0, this._kickT - dt);
    if (this._tailT > 0) this._tailT = Math.max(0, this._tailT - dt);

    // Blend locomotion weights smoothly.
    const moveTarget = this.moving && this.grounded ? 1 : 0;
    const runTarget = this.running ? 1 : 0;
    const airTarget = this.grounded ? 0 : 1;
    this._move01 = damp(this._move01, moveTarget, 10, dt);
    this._speed01 = damp(this._speed01, runTarget, 8, dt);
    this._air01 = damp(this._air01, airTarget, 12, dt);

    const m = this._move01, sp = this._speed01, air = this._air01;

    // Advance the stride only while moving (faster at a run).
    const strideHz = lerp(2.2, 3.6, sp);
    this._phase += dt * Math.PI * 2 * strideHz * m;
    const ph = this._phase;

    const legAmp = m * lerp(0.5, 0.9, sp);
    const lean = m * lerp(0.10, 0.30, sp);
    const recoil = this._shotT > 0 ? Math.sin((this._shotT / SHOT_DUR) * Math.PI) : 0;
    const pop = this._popT > 0 ? this._popT / JUMP_POP : 0;

    // Legs: walk swing, or tuck up when airborne.
    const swingL = Math.sin(ph) * legAmp;
    const swingR = Math.sin(ph + Math.PI) * legAmp;
    const tuck = lerp(0, -0.9, air) - pop * 0.6;
    this.rig.legL.rotation.x = lerp(swingL, tuck, air);
    this.rig.legR.rotation.x = lerp(swingR, tuck, air * 0.85);

    // Body: bob + forward lean (− on recoil it rocks back), small idle breathing.
    const walkBob = Math.abs(Math.sin(ph)) * lerp(0.02, 0.045, sp) * m;
    const breathe = Math.sin(this._t * 1.7) * 0.012 * (1 - m);
    this.rig.body.position.y = this._bodyRestY + walkBob + breathe - air * 0.04;
    this.rig.body.rotation.x = lean + air * 0.15 - recoil * 0.12;
    this.rig.body.rotation.z = Math.sin(ph) * 0.04 * m;

    // Firing kick: the rifle slams back toward +Z, the muzzle climbs, and the
    // charging bolt cycles. The grips are children of the gun, so both paws
    // recoil with it through the IK below — the whole shooting action reads.
    // Weapon-swap dip: lower + tilt the gun down and back up over SWITCH_DUR.
    const sw = this._switchT > 0 ? Math.sin((this._switchT / SWITCH_DUR) * Math.PI) : 0;
    this.rig.gun.position.z = this._gunRestZ + recoil * 0.09;
    this.rig.gun.position.y = this._gunRestY - sw * 0.14;
    this.rig.gun.rotation.x = -recoil * 0.32 + sw * 0.6;
    this.rig.bolt.position.z = this._boltRestZ + recoil * 0.06; // bolt slides back

    // Jump kick (V): flying kick pose — body horizontal, both legs extended,
    // leading leg kicks forward, trailing leg extends back. The whole pose reads
    // as a mid-air lunge to the enemy's head.
    if (this._kickT > 0) {
      const kt = 1 - this._kickT / KICK_DUR; // 0→1 over the clip
      const kp = Math.sin(kt * Math.PI);     // 0→1→0 ease
      // Wind-up phase (early): crouch and coil
      const windup = kt < 0.25 ? (0.25 - kt) / 0.25 : 0;
      // Kick extension (main): full flying pose
      const extend = kt >= 0.25 ? Math.sin((kt - 0.25) / 0.75 * Math.PI) : 0;
      // Left leg: plants then tucks back
      this.rig.legL.rotation.x = windup * 0.8 - extend * 1.8;
      // Right leg (kicking leg): winds back then extends full forward
      this.rig.legR.rotation.x = windup * 0.5 - extend * 2.2;
      // Body: leans way forward into the kick, horizontal at peak
      this.rig.body.rotation.x += extend * 1.3;
      this.rig.body.rotation.z -= extend * 0.4; // slight tilt into the kick
      // Head: looks forward along the kick line
      this.rig.head.rotation.x = -extend * 0.8;
      // Arms: flail back for balance/momentum
      this.rig.armL.rotation.x = extend * 1.1;
      this.rig.armR.rotation.x = extend * 0.8;
    }

    // Solve the arm IK last so the paws lock onto the (now-posed) gun grips.
    for (const arm of this.arms) this._solveArm(arm);

    // Head: subtle counter-bob + look-into-run.
    this.rig.head.rotation.x = -lean * 0.4 + Math.sin(ph * 2) * 0.02 * m;

    // Energy gem: gentle breathing pulse, brighter while moving/firing.
    if (this.rig.gem) {
      this.rig.gem.material.emissiveIntensity =
        1.4 + Math.sin(this._t * 3.2) * 0.3 + recoil * 1.2 + m * 0.4;
    }

    // Tail: lazy idle sway, streams up/out at speed, flares on jump.
    const tailSway = Math.sin(this._t * 2.2 + ph) * lerp(0.12, 0.28, m);
    this.rig.tail.rotation.z = tailSway;
    this.rig.tail.rotation.x = -lean * 0.6 - air * 0.4 + Math.sin(this._t * 1.4) * 0.05;

    // Tail swing (R): 3 fast full-body spins with the tail flared huge (JUICE §12).
    if (this._tailT > 0) {
      const tp = this._tailT / TAIL_DUR;        // 1→0
      this.modelRoot.rotation.y = Math.PI + (1 - tp) * Math.PI * 2 * 3;
      const flare = Math.sin(tp * Math.PI) * 1.7; // 0→huge→0
      this.rig.tail.scale.setScalar(1 + flare);
    } else if (this.modelRoot.rotation.y !== Math.PI) {
      this.modelRoot.rotation.y = Math.PI;        // restore base facing flip
      this.rig.tail.scale.setScalar(1);
    }
  }
}
