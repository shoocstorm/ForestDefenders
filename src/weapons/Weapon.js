import { RECOIL } from '../config/Constants.js';

// Base weapon: owns a fire-rate cooldown and a firing-mode (automatic vs.
// semi-auto). On fire it spawns a projectile from the muzzle along the aim ray
// and kicks the camera. Subclasses set `def` (WEAPONS.* entry). Switching, ammo,
// and special fire modes (charge/beam/spread) arrive in M4.
export class Weapon {
  constructor(def) {
    this.def = def;
    this.name = def.name;
    this.element = def.element;
    this._cd = 0;          // seconds until next shot allowed
    this._wasFiring = false;
  }

  // dt: scaled sim delta. firing: trigger held this step. ctx: fire context
  // { origin, dir, projectiles, vfx, cameraRig }.
  update(dt, firing, ctx) {
    if (this._cd > 0) this._cd -= dt;
    const edge = firing && !this._wasFiring;
    if (firing && this._cd <= 0 && (this.def.automatic || edge)) {
      this._fire(ctx);
      this._cd = this.def.cooldown;
    }
    this._wasFiring = firing;
  }

  _fire(ctx) {
    const d = this.def;
    ctx.projectiles.spawn(ctx.origin, ctx.dir, {
      team: 'player',
      speed: d.projectileSpeed,
      damage: d.damage,
      element: d.element,
      color: d.color,
      radius: d.projectileRadius,
    });
    ctx.vfx.muzzleFlash(ctx.origin, d.muzzleColor);
    ctx.cameraRig.addRecoil(RECOIL.PITCH * d.recoil);
  }
}
