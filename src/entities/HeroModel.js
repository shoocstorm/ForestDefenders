import * as THREE from 'three';
import { toon, addOutlines } from '../materials/CelMaterial.js';
import { damp, lerp } from '../util/MathUtils.js';

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

// Palette (squirrel-red fur + cream belly, dark gunmetal rifle).
const FUR      = 0xc06a2e;
const FUR_DARK = 0x8a4720;
const CREAM    = 0xf3e3c2;
const PINK     = 0xe79bb0;
const DARK     = 0x161310;
const METAL    = 0x3a3d44;
const WOOD     = 0x6e4a26;

const T = (c, o = {}) => toon({ color: c, ...o });

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

    // --- Head pivot. ---
    const head = new THREE.Group();
    head.position.set(0, 0.44, -0.02);
    body.add(head);
    this.rig.head = head;
    mesh(new THREE.SphereGeometry(0.18, 16, 14), T(FUR), head, [0, 0, 0]);
    // Muzzle/snout + cheeks (cream), forward -Z.
    const snout = mesh(new THREE.SphereGeometry(0.10, 12, 10), T(CREAM), head, [0, -0.03, -0.13]);
    snout.scale.set(1.0, 0.85, 1.1);
    mesh(new THREE.SphereGeometry(0.035, 8, 8), T(DARK), head, [0, 0.0, -0.235]); // nose
    for (const sx of [-1, 1]) {
      // Eyes.
      mesh(new THREE.SphereGeometry(0.045, 10, 10), T(DARK), head, [sx * 0.08, 0.06, -0.145]);
      mesh(new THREE.SphereGeometry(0.016, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff }), head, [sx * 0.085, 0.085, -0.175]);
      // Ears — tall tufted squirrel ears.
      const ear = mesh(new THREE.ConeGeometry(0.05, 0.16, 7), T(FUR), head, [sx * 0.10, 0.20, 0.02], [0.1, 0, sx * 0.2]);
      mesh(new THREE.ConeGeometry(0.026, 0.10, 7), T(PINK), ear, [0, -0.01, 0.012]);
    }
    // Buck teeth.
    mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), T(0xfffef2), head, [0, -0.10, -0.20]);

    // --- Arms (shoulder pivots): posed to grip the rifle in front of the chest. ---
    for (const side of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(side * 0.17, 0.30, -0.02);
      body.add(sh);
      // Reach forward + inward toward the gun.
      sh.rotation.set(-0.9, side * 0.25, side * 0.15);
      mesh(new THREE.CapsuleGeometry(0.055, 0.16, 4, 8), T(FUR), sh, [0, -0.10, 0]);
      mesh(new THREE.CapsuleGeometry(0.05, 0.13, 4, 8), T(FUR_DARK), sh, [0, -0.22, -0.02], [-0.3, 0, 0]);
      mesh(new THREE.SphereGeometry(0.06, 10, 8), T(CREAM), sh, [0, -0.30, -0.05]); // paw
      this.rig[side < 0 ? 'armL' : 'armR'] = sh;
    }

    // --- Rifle (held under the body pivot so it tracks chest pose). Barrel -Z. ---
    const gun = new THREE.Group();
    gun.position.set(0.02, 0.26, -0.18);
    body.add(gun);
    this.rig.gun = gun;
    const stock = mesh(new THREE.BoxGeometry(0.07, 0.09, 0.20), T(WOOD), gun, [0, 0, 0.12]);
    stock.rotation.x = 0.15;
    mesh(new THREE.BoxGeometry(0.06, 0.07, 0.26), T(METAL), gun, [0, 0.01, -0.06]);     // receiver
    mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.34, 10), T(METAL), gun, [0, 0.02, -0.30], [Math.PI / 2, 0, 0]); // barrel
    mesh(new THREE.BoxGeometry(0.035, 0.10, 0.05), T(METAL), gun, [0, -0.08, 0.0]);      // magazine
    // Muzzle origin at the barrel tip (non-mesh → no outline).
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.02, -0.48);
    gun.add(muzzle);
    this.pivots.muzzle = muzzle;

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

    addOutlines(root, { thickness: 0.014 });

    // Cache rest transforms we overlay animation onto.
    this._bodyRestY = body.position.y;
    this._gunRestZ = gun.position.z;
  }

  // --- State intake from Player (no early-out: posing all happens in update). ---
  setLocomotion({ moving, running, grounded }) {
    this.moving = !!moving;
    this.running = !!running;
    this.grounded = grounded !== false;
  }

  playJump() { this._popT = JUMP_POP; }
  playShot() { this._shotT = SHOT_DUR; }
  setFirstPerson(fp) { this.modelRoot.visible = !fp; }

  get muzzleWorldPosition() {
    return this.pivots.muzzle.getWorldPosition(new THREE.Vector3());
  }

  update(dt) {
    this._t += dt;
    if (this._shotT > 0) this._shotT = Math.max(0, this._shotT - dt);
    if (this._popT > 0) this._popT = Math.max(0, this._popT - dt);

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

    // Gun recoil kick (pushes back toward +Z and muzzle rises).
    this.rig.gun.position.z = this._gunRestZ + recoil * 0.08;
    this.rig.gun.rotation.x = -recoil * 0.25;

    // Arms counter-sway slightly with the stride; rise a touch when airborne.
    const armSway = Math.sin(ph) * 0.08 * m;
    this.rig.armL.rotation.x = -0.9 + armSway + air * 0.2 - recoil * 0.15;
    this.rig.armR.rotation.x = -0.9 - armSway + air * 0.2 - recoil * 0.15;

    // Head: subtle counter-bob + look-into-run.
    this.rig.head.rotation.x = -lean * 0.4 + Math.sin(ph * 2) * 0.02 * m;

    // Tail: lazy idle sway, streams up/out at speed, flares on jump.
    const tailSway = Math.sin(this._t * 2.2 + ph) * lerp(0.12, 0.28, m);
    this.rig.tail.rotation.z = tailSway;
    this.rig.tail.rotation.x = -lean * 0.6 - air * 0.4 + Math.sin(this._t * 1.4) * 0.05;
  }
}
