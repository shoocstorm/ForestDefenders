import * as THREE from 'three';

// Data-driven weapon (WEAPONS_SPEC §3). One class handles every firing mode via
// `def.mode`; ammo behavior comes from `def.ammo.type`. Player drives it each step
// with update(dt, firing, ctx) where ctx = { origin, dir, projectiles, vfx,
// cameraRig, enemies, juice }. `justFired` is set on the step a shot leaves the
// barrel (read+reset by Player to trigger the recoil pose).
//
// Modes: single · rapid · spread · charge · explosive · beam · ring.
// Ammo:  infinite · magazine(mag/reserve+reload) · overheat(heat/lockout) · energy(regen).
const RELOAD_TIME = 1.1;

export class Weapon {
  constructor(def) {
    this.def = def;
    this.name = def.name;
    this.element = def.element;
    this._cd = 0;
    this._wasFiring = false;
    this._charge = 0;
    this.justFired = false;

    // Per-weapon scratch (no per-frame allocation in the hot path).
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._end = new THREE.Vector3();   // beam endpoint (kept distinct from _v1/_v2,
                                       // which _beamDamage reuses while scanning)
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._beamHits = [];

    // Runtime ammo state cloned from the def.
    const a = def.ammo || { type: 'infinite' };
    this.ammo = { type: a.type };
    if (a.type === 'magazine') { this._clip = a.mag; this.ammo.mag = a.mag; this.ammo.reserve = a.max; this.ammo.reloading = 0; }
    else if (a.type === 'overheat') { this.ammo.heat = 0; this.ammo.locked = 0; }
    else if (a.type === 'energy') { this.ammo.energy = a.max; }
  }

  // --- Main per-step entry ------------------------------------------------
  update(dt, firing, ctx) {
    this.justFired = false;
    if (this._cd > 0) this._cd -= dt;
    this._tickAmmo(dt, firing);

    if (this.def.mode === 'charge') return this._updateCharge(dt, firing, ctx);
    if (this.def.mode === 'beam') return this._updateBeam(dt, firing, ctx);

    const edge = firing && !this._wasFiring;
    if (firing && this._cd <= 0 && (this.def.automatic || edge) && this._canFire()) {
      this._consume();
      this._fire(ctx, 1);
      this._cd = this.def.cooldown;
      this.justFired = true;
      ctx.cameraRig.addRecoil(this.def.recoil);
      ctx.vfx.muzzleFlash(ctx.origin, this.def.muzzleColor);
    }
    this._wasFiring = firing;
  }

  // --- Ammo bookkeeping ---------------------------------------------------
  _tickAmmo(dt, firing) {
    const a = this.ammo;
    if (a.type === 'magazine') {
      if (a.reloading > 0) {
        a.reloading -= dt;
        if (a.reloading <= 0) {
          const take = Math.min(this._clip - a.mag, a.reserve);
          a.mag += take; a.reserve -= take;
        }
      }
    } else if (a.type === 'overheat') {
      if (a.locked > 0) a.locked -= dt;
      if (!firing && a.heat > 0) a.heat = Math.max(0, a.heat - this.def.ammo.cool * dt);
    } else if (a.type === 'energy') {
      a.energy = Math.min(this.def.ammo.max, a.energy + this.def.ammo.regen * dt);
    }
  }

  _canFire() {
    const a = this.ammo;
    if (a.type === 'magazine') return a.mag > 0;
    if (a.type === 'overheat') return a.locked <= 0 && a.heat < 100;
    if (a.type === 'energy') return a.energy >= this.def.ammo.perShot;
    return true; // infinite
  }

  _consume() {
    const a = this.ammo;
    if (a.type === 'magazine') { a.mag -= 1; if (a.mag <= 0 && a.reserve > 0) a.reloading = RELOAD_TIME; }
    else if (a.type === 'overheat') { a.heat += this.def.ammo.perShot; if (a.heat >= 100) { a.heat = 100; a.locked = this.def.ammo.lockout; } }
    else if (a.type === 'energy') { a.energy -= this.def.ammo.perShot; }
  }

  // Top up magazine reserve (shop ammo packs). No-op for non-magazine weapons.
  addReserve(amount) {
    if (this.ammo.type === 'magazine') this.ammo.reserve += amount;
  }

  // Short HUD ammo string.
  ammoText() {
    const a = this.ammo;
    if (a.type === 'magazine') return a.reloading > 0 ? 'RELOAD' : `${a.mag}/${a.reserve}`;
    if (a.type === 'overheat') return a.locked > 0 ? 'OVERHEAT' : `${Math.round(a.heat)}%`;
    if (a.type === 'energy') return `${Math.round(a.energy)}`;
    return '∞';
  }

  // Structured ammo readout for the rich HUD weapon panel. `ratio` (0..1) drives a
  // small fill gauge; `low` flags the danger tint; `kind` selects the icon/label.
  ammoInfo() {
    const a = this.ammo;
    if (a.type === 'magazine') {
      const reloading = a.reloading > 0;
      return { kind: 'mag', label: reloading ? 'RELOADING' : `${a.mag}/${a.reserve}`,
        primary: a.mag, secondary: a.reserve, ratio: this._clip ? a.mag / this._clip : 0,
        reloading, low: !reloading && a.mag <= Math.max(1, this._clip * 0.25) };
    }
    if (a.type === 'overheat') {
      const locked = a.locked > 0, h = Math.round(a.heat);
      return { kind: 'heat', label: locked ? 'OVERHEAT' : `${h}%`,
        ratio: 1 - a.heat / 100, low: locked || a.heat >= 75, danger: locked };
    }
    if (a.type === 'energy') {
      const max = this.def.ammo.max;
      return { kind: 'energy', label: `${Math.round(a.energy)}`,
        ratio: max ? a.energy / max : 0, low: a.energy < this.def.ammo.perShot };
    }
    return { kind: 'infinite', label: '∞', ratio: 1, low: false };
  }

  // --- Firing dispatch ----------------------------------------------------
  _fire(ctx, mult, extra) {
    switch (this.def.mode) {
      case 'spread': return this._fireSpread(ctx);
      case 'explosive': return this._spawn(ctx, ctx.dir, mult, {
        explodeRadius: this.def.explodeRadius, knockback: this.def.knockback, lifetime: 4 });
      case 'ring': return this._spawn(ctx, ctx.dir, mult, {
        empRadius: this.def.empRadius, empDuration: this.def.empDuration,
        knockback: this.def.knockback, lifetime: 4 });
      case 'rapid': return this._spawn(ctx, this._jitter(ctx.dir, this.def.spread), mult);
      default: return this._spawn(ctx, ctx.dir, mult, extra); // single
    }
  }

  _spawn(ctx, dir, mult = 1, extra = {}) {
    const d = this.def;
    // Fire Rounds buff (Flame Chili / shop) temporarily overrides the shot element.
    const element = ctx.elementOverride ?? d.element;
    const color = ctx.elementOverride === 'FIRE' ? 0xff6a2a : d.color;
    ctx.projectiles.spawn(ctx.origin, dir, {
      team: 'player', speed: d.projectileSpeed, damage: d.damage * mult,
      element, color, radius: d.projectileRadius, ...extra,
    });
  }

  _fireSpread(ctx) {
    for (let i = 0; i < this.def.pellets; i++) this._spawn(ctx, this._jitter(ctx.dir, this.def.spreadAngle));
  }

  // Perturb a direction by up to `angle` radians in a random cone (scratch _dir).
  _jitter(dir, angle = 0) {
    if (!angle) return dir;
    this._right.set(-dir.z, 0, dir.x).normalize();
    this._up.crossVectors(dir, this._right).normalize();
    const a = (Math.random() * 2 - 1) * angle, b = (Math.random() * 2 - 1) * angle;
    return this._dir.copy(dir).addScaledVector(this._right, a).addScaledVector(this._up, b).normalize();
  }

  // --- Charge (Ganon / Bow): hold to charge, release to fire scaled shot ----
  _updateCharge(dt, firing, ctx) {
    const d = this.def;
    if (firing) {
      this._charge = Math.min(d.chargeTime, this._charge + dt);
    } else if (this._wasFiring && this._cd <= 0 && this._canFire()) {
      const t = d.chargeTime > 0 ? Math.min(1, this._charge / d.chargeTime) : 1;
      const mult = d.minMult + (d.maxMult - d.minMult) * t;
      this._consume();
      const extra = { speed: d.projectileSpeed * (0.55 + 0.45 * t) };
      if (d.arc) extra.gravity = d.arc; // bow lobs slightly
      this._spawn(ctx, ctx.dir, mult, extra);
      this._cd = d.cooldown;
      this.justFired = true;
      ctx.cameraRig.addRecoil(d.recoil * (0.5 + t));
      ctx.vfx.muzzleFlash(ctx.origin, d.muzzleColor);
    }
    if (!firing) this._charge = 0;
    this._wasFiring = firing;
  }

  // --- Beam (Laser): continuous visual every frame, hit-scan damage on cadence ---
  _updateBeam(dt, firing, ctx) {
    this._wasFiring = firing;
    if (!firing || !this._canFire()) return;
    const d = this.def;
    // Stop the beam at the first enemy it strikes (so it visibly terminates on a
    // target instead of always shooting to max range). _beamDamage returns the
    // nearest hit distance, or beamRange when it hits nothing.
    const hitDist = this._cd <= 0 ? this._beamDamage(ctx) : (this._lastBeamDist ?? d.beamRange);
    this._lastBeamDist = hitDist;
    if (this._cd <= 0) {
      this._cd = d.cooldown;
      this.justFired = true;
      ctx.cameraRig.addRecoil(d.recoil);
    }
    const end = this._end.copy(ctx.origin).addScaledVector(ctx.dir, hitDist);
    ctx.vfx.beam(ctx.origin, end, d.color); // persistent beam (no per-frame alloc)
  }

  _beamDamage(ctx) {
    const d = this.def, o = ctx.origin, dir = ctx.dir;
    const hits = this._beamHits; hits.length = 0;
    for (const e of ctx.enemies) {
      if (e.dead) continue;
      const to = this._v1.copy(e.position).setY(e.position.y + 0.6).sub(o);
      const t = to.dot(dir);
      if (t < 0 || t > d.beamRange) continue;
      const perp = this._v2.copy(dir).multiplyScalar(t).sub(to).length();
      if (perp > e.hitRadius + 0.25) continue;
      hits.push({ e, t });
    }
    hits.sort((x, y) => x.t - y.t);
    for (let i = 0; i < hits.length && i < d.penetrate; i++) {
      hits[i].e.takeDamage(d.damage, d.element, ctx);
      ctx.vfx.hitSpark(this._v1.copy(o).addScaledVector(dir, hits[i].t), d.color);
    }
    // Beam terminates just past the last penetrated enemy (or max range if it
    // penetrated all hits / hit nothing).
    if (hits.length === 0) return d.beamRange;
    const lastIdx = Math.min(hits.length, d.penetrate) - 1;
    return Math.min(d.beamRange, hits[lastIdx].t + 0.6);
  }
}
