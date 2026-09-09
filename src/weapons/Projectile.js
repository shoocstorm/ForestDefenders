import * as THREE from 'three';
import { ARENA, BLOOM_LAYER, CAMERA } from '../config/Constants.js';

// Team-aware projectile pool. Player-team shots test against enemies; enemy-team
// shots (e.g. Fire Shroom fireballs) test against the player. Meshes are pooled
// and reused — spawning never allocates geometry after warm-up.
//
// Spawn opts: { team:'player'|'enemy', speed, damage, element, color, radius,
//               lifetime, gravity }.
// Bullet lights live in a FIXED pool of LIGHT_BUDGET PointLights owned by this
// pool and added to the scene once at construction — bullets never own lights.
// (The old design attached one PointLight per pooled mesh, so the pool's light
// count grew with the sustained-fire high-water mark: each growth step changed
// the scene light count and forced a recompile of every lit material — the
// exact freeze class documented in AGENTS.md — and every dead-but-pooled light
// kept burning uniform slots in all lit shaders.) The first LIGHT_BUDGET live
// bullets each borrow a light and drag it along; bullets past the budget still
// render — they glow via the bloom layer — they just don't cast dynamic light.
//
// --- Visual redesign (retention pass) ---
// Each bullet layers THREE reads: (1) the bright core mesh (toneMapped=false so
// the color pops pre-ACES), (2) an additive billboard halo sprite for energy
// shots, and (3) a comet trail rendered as ONE global Points cloud — a fixed
// 64-bullet × 16-point ring buffer, zero allocation per frame, one draw call.
// Trails linger ~0.3s after a bullet dies, so kills/expiry leave a fading streak.
const LIGHT_BUDGET = 6;
const MAX_BULLETS = 64;   // trail-slice capacity (bullets past this skip trails)
const TRAIL_LEN = 16;     // points per bullet's trail
const TRAIL_FADE = 1 / 0.3; // alpha decay rate → ~0.3s visible tail

// Per-weapon bullet looks. Each shot is a single pooled mesh; `geo` selects the
// cached geometry (built unit-sized, then scaled by the shot radius * `scale`),
// `orient` aligns local +Z to the flight direction (so streaks/arrows/rings point
// where they travel and the bow arrow tips down as its arc falls), `spin` rolls it
// about the travel axis (rad/s) and `flicker` pulses the scale for a fiery shimmer.
// `trail` = comet-trail length in points (0 = none); `halo` = additive glow-sprite
// scale multiplier (0 = none — solid physical shots stay unhaloed).
// `orb` is the default fallback used by enemy shots and anything without a style.
const BULLET_STYLES = {
  orb:    { geo: 'sphere',  scale: [1, 1, 1], trail: 10, halo: 4.2 },
  acorn:  { geo: 'sphere',  scale: [0.8, 0.8, 1.35], orient: true, trail: 6 },     // little nut, long axis forward
  shard:  { geo: 'octa',    scale: [0.7, 0.7, 1.6], orient: true, spin: 9, trail: 14, halo: 3.6 }, // spinning energy crystal
  tracer: { geo: 'capsule', scale: [0.45, 0.45, 2.6], orient: true, trail: 16 },   // thin high-speed streak
  pellet: { geo: 'sphere',  scale: [0.85, 0.85, 0.85], trail: 5 },                 // small buckshot
  fire:   { geo: 'sphere',  scale: [1.15, 1.15, 1.15], flicker: true, trail: 12, halo: 4.6 }, // throbbing fireball
  arrow:  { geo: 'cone',    scale: [0.5, 0.5, 1.7], orient: true, spin: 3, trail: 8 }, // dart pointing forward
  ring:   { geo: 'torus',   scale: [1, 1, 1], orient: true, spin: 13, halo: 3.2 }, // spinning EMP halo
};
const Z_AXIS = new THREE.Vector3(0, 0, 1);
// Largest hitRadius across ENEMY_DEFS (Constants.js), rounded up. Used to size the
// SpatialGrid query margin for the player-team hit-test below — generous enough to
// never miss a real hit, still narrow enough to keep the query to a handful of cells.
const MAX_ENEMY_HIT_RADIUS = 1.2;

// Shared soft-glow texture for the halo sprites (module-level: built once).
let _haloTex;
function haloTexture() {
  if (_haloTex) return _haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 63);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  _haloTex = new THREE.CanvasTexture(c);
  return _haloTex;
}

// One additive Points cloud renders every bullet's comet trail. Per-point color,
// fade and size; the vertex shader tapers point size by fade so tails shrink
// toward their end. Custom shader → no tone-mapping → the trail core stays hot.
const TRAIL_VERT = /* glsl */`
  attribute vec3 aColor;
  attribute float aFade;
  attribute float aSize;
  uniform float uPx; // drawing-buffer pixels per world unit at 1m (set per tick)
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vColor = aColor;
    vFade = aFade;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(aSize * (0.35 + 0.65 * aFade) * (uPx / max(0.1, -mv.z)), 96.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const TRAIL_FRAG = /* glsl */`
  varying vec3 vColor;
  varying float vFade;
  void main() {
    if (vFade <= 0.01) discard;
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.15, d) * vFade;
    gl_FragColor = vec4(vColor * a, a); // additive
  }
`;

export class ProjectilePool {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this._geos = new Map(); // geo key -> shared BufferGeometry (built on demand)
    this._up = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._spin = new THREE.Quaternion();
    this._hitBuf = []; // reused SpatialGrid query results (player-team hit-test)
    // Fixed bullet-light pool: added to the scene ONCE, never removed — only
    // intensity is toggled and the light repositioned to its borrowing bullet
    // (same pattern as the VFX flash-light pool; see comment above).
    this._lightSlots = [];
    for (let i = 0; i < LIGHT_BUDGET; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 6, 2);
      scene.add(light);
      this._lightSlots.push({ light, owner: null });
    }
    this._buildTrails(scene);
  }

  // Fixed-capacity trail cloud: every pooled bullet (up to MAX_BULLETS) owns a
  // TRAIL_LEN slice of the attribute arrays and writes its live position into a
  // advancing ring slot each tick; fades decay globally so tails linger briefly
  // after death. One draw call for ALL trails, nothing allocated per frame.
  _buildTrails(scene) {
    const n = MAX_BULLETS * TRAIL_LEN;
    this._trailPos = new Float32Array(n * 3);
    this._trailCol = new Float32Array(n * 3);
    this._trailFade = new Float32Array(n);
    this._trailSize = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this._trailPos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this._trailCol, 3));
    geo.setAttribute('aFade', new THREE.BufferAttribute(this._trailFade, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this._trailSize, 1));
    this._trailMat = new THREE.ShaderMaterial({
      uniforms: { uPx: { value: 700 } },
      vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._trails = new THREE.Points(geo, this._trailMat);
    this._trails.frustumCulled = false;
    this._trails.layers.enable(BLOOM_LAYER);
    scene.add(this._trails);
  }

  // Drawing-buffer pixels per world unit at 1m distance — approximated from the
  // viewport height, camera FOV and device pixel ratio (soft glow, no precision
  // needed). Refreshed each tick so resizes/DPR changes stay roughly right.
  _updateTrailScale() {
    const fovRad = (CAMERA.FOV * Math.PI) / 180;
    this._trailMat.uniforms.uPx.value =
      (window.innerHeight * Math.min(window.devicePixelRatio, 2)) / (2 * Math.tan(fovRad / 2));
  }

  // Lazily build & cache the unit geometry for a style. Elongated shapes are baked
  // to point along +Z so a single quaternion aligns them to the flight direction.
  _geoFor(key) {
    let g = this._geos.get(key);
    if (g) return g;
    switch (key) {
      case 'octa':    g = new THREE.OctahedronGeometry(1, 0); break;
      case 'capsule': g = new THREE.CapsuleGeometry(0.5, 1.1, 4, 8); g.rotateX(Math.PI / 2); break;
      case 'cone':    g = new THREE.ConeGeometry(0.6, 2, 12); g.rotateX(Math.PI / 2); g.translate(0, 0, -0.4); break;
      case 'torus':   g = new THREE.TorusGeometry(0.7, 0.28, 8, 18); break;
      default:        g = new THREE.SphereGeometry(1, 10, 8); break; // 'sphere'
    }
    this._geos.set(key, g);
    return g;
  }

  _acquire() {
    for (const p of this.items) if (!p.active) return p;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    mat.toneMapped = false; // core color pops pre-ACES instead of washing out
    const mesh = new THREE.Mesh(this._geoFor('sphere'), mat);
    mesh.castShadow = false;
    mesh.layers.enable(BLOOM_LAYER); // projectiles glow in the post pipeline
    // Additive halo sprite (energy shots): sibling of the mesh, NOT a child —
    // child sprites inherit the mesh's non-uniform style scale (a stretched
    // tracer would squash its round glow).
    const haloMat = new THREE.SpriteMaterial({
      map: haloTexture(), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.visible = false;
    halo.layers.enable(BLOOM_LAYER);
    this.scene.add(halo);
    const p = {
      active: false, mesh, mat, halo, slot: null,
      trailIdx: Math.min(this.items.length, MAX_BULLETS - 1), trailHead: 0,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      damage: 0, element: 'PHYSICAL', team: 'player',
      radius: 0.16, life: 0, gravity: 0,
      styleKey: 'sphere', style: BULLET_STYLES.orb, spinPhase: 0,
      sx: 1, sy: 1, sz: 1, // resolved per-axis scale (radius * style.scale)
    };
    this.scene.add(mesh);
    this.items.push(p);
    return p;
  }

  spawn(origin, dir, opts = {}) {
    const p = this._acquire();
    p.active = true;
    p.team = opts.team ?? 'player';
    p.damage = opts.damage ?? 10;
    p.element = opts.element ?? 'PHYSICAL';
    p.radius = opts.radius ?? 0.16;
    p.life = opts.lifetime ?? 3;
    p.gravity = opts.gravity ?? 0;
    // AOE / EMP payloads (explosive + ring weapons). 0 → plain single-target shot.
    p.explodeRadius = opts.explodeRadius ?? 0;
    p.knockback = opts.knockback ?? 0;
    p.empRadius = opts.empRadius ?? 0;
    p.empDuration = opts.empDuration ?? 0;
    p.pos.copy(origin);
    p.vel.copy(dir).normalize().multiplyScalar(opts.speed ?? 20);
    const color = opts.color ?? 0xffffff;
    p.mat.color.setHex(color);
    // Borrow a light from the fixed pool if one is free; over budget the bullet
    // stays unlit (it still glows via the bloom layer). Fixed 6-entry scan.
    p.slot = null;
    for (const s of this._lightSlots) {
      if (!s.owner) {
        s.owner = p;
        p.slot = s;
        s.light.color.setHex(color);
        s.light.intensity = 5;
        s.light.position.copy(p.pos);
        break;
      }
    }

    // Resolve the bullet look: swap geometry only when the style's shape changes
    // (keeps the pool allocation-free on repeat fire), then bake the per-axis scale.
    const style = BULLET_STYLES[opts.bullet] || BULLET_STYLES.orb;
    p.style = style;
    if (style.geo !== p.styleKey) { p.mesh.geometry = this._geoFor(style.geo); p.styleKey = style.geo; }
    p.spinPhase = Math.random() * Math.PI * 2; // desync spin/flicker across shots
    p.sx = p.radius * style.scale[0];
    p.sy = p.radius * style.scale[1];
    p.sz = p.radius * style.scale[2];

    // Halo sprite: colored + sized per shot for glow styles, hidden for solid ones.
    if (style.halo) {
      p.halo.visible = true;
      p.halo.material.color.setHex(color);
      const hs = p.radius * style.halo;
      p.halo.scale.set(hs, hs, 1);
      p.halo.position.copy(p.pos);
    } else {
      p.halo.visible = false;
    }
    // Reset this bullet's trail slice (stale fade from its previous life would
    // otherwise streak from the old death point to the new spawn point).
    if (style.trail) {
      const base = p.trailIdx * TRAIL_LEN;
      this._trailFade.fill(0, base, base + TRAIL_LEN);
      p.trailHead = 0;
    }

    p.mesh.position.copy(origin);
    p.mesh.scale.set(p.sx, p.sy, p.sz);
    if (style.orient) this._orient(p); // face flight direction on spawn frame
    else p.mesh.quaternion.identity();
    p.mesh.visible = true;
    return p;
  }

  // Aim the mesh's +Z down the velocity, then roll it by the accumulated spin phase.
  _orient(p) {
    this._dir.copy(p.vel);
    if (this._dir.lengthSq() < 1e-6) { p.mesh.quaternion.identity(); return; }
    this._dir.normalize();
    p.mesh.quaternion.setFromUnitVectors(Z_AXIS, this._dir);
    if (p.style.spin) p.mesh.quaternion.multiply(this._spin.setFromAxisAngle(Z_AXIS, p.spinPhase));
  }

  // Advance the global trail cloud one tick: fade every point down, then let each
  // live trailing bullet stamp its position into its slice's ring slot.
  _updateTrails(dt) {
    const fade = this._trailFade;
    let touched = false;
    for (let i = 0; i < fade.length; i++) {
      if (fade[i] > 0) { fade[i] = Math.max(0, fade[i] - dt * TRAIL_FADE); touched = true; }
    }
    for (const p of this.items) {
      if (!p.active || !p.style.trail || p.trailIdx >= MAX_BULLETS) continue;
      const base = p.trailIdx * TRAIL_LEN;
      const i = base + p.trailHead;
      this._trailPos[i * 3] = p.pos.x;
      this._trailPos[i * 3 + 1] = p.pos.y;
      this._trailPos[i * 3 + 2] = p.pos.z;
      // Hot-core colour: bullet tint lifted toward white so the trail's head
      // reads like sparks, not paint.
      const c = p.mat.color;
      this._trailCol[i * 3] = c.r + (1 - c.r) * 0.45;
      this._trailCol[i * 3 + 1] = c.g + (1 - c.g) * 0.45;
      this._trailCol[i * 3 + 2] = c.b + (1 - c.b) * 0.45;
      this._trailFade[i] = 1;
      this._trailSize[i] = p.radius * 1.5;
      p.trailHead = (p.trailHead + 1) % TRAIL_LEN;
      touched = true;
    }
    if (touched) {
      const g = this._trails.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.aColor.needsUpdate = true;
      g.attributes.aFade.needsUpdate = true;
      g.attributes.aSize.needsUpdate = true;
    }
    this._updateTrailScale();
  }

  update(dt, ctx) {
    // Horizontal kill margin is the arena + a grace band: shots aimed at sky
    // targets (the shootable balloon drifts just past the far edge) must be
    // allowed to leave the play field. Lifetime still caps every shot, so the
    // grace band costs nothing in cleanup.
    const halfX = ARENA.WIDTH / 2 + 80, halfZ = ARENA.LENGTH / 2 + 80;
    for (const p of this.items) {
      if (!p.active) continue;
      if (p.gravity) p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;

      let dead = p.life <= 0 || p.pos.y <= 0.05 ||
        Math.abs(p.pos.x) > halfX || Math.abs(p.pos.z) > halfZ;
      const aoe = p.explodeRadius > 0 || p.empRadius > 0;

      if (!dead) {
        if (p.team === 'player') {
          // Broad-phase via the shared per-frame SpatialGrid (built in
          // EnemyManager.update, before projectiles update in Game._fixedUpdate)
          // instead of testing every live enemy against every bullet — was an
          // O(bullets * enemies) scan every frame, worst under rapid fire.
          ctx.enemyGrid.queryNear(p.pos.x, p.pos.z, p.radius + MAX_ENEMY_HIT_RADIUS, this._hitBuf);
          for (const e of this._hitBuf) {
            if (e.dead) continue;
            const rr = p.radius + e.hitRadius;
            if (this._tmp.copy(e.position).setY(e.position.y + 0.6).distanceToSquared(p.pos) < rr * rr) {
              if (!aoe) { // AOE shots detonate below instead of single-target hit
                const res = e.takeDamage(p.damage, p.element, ctx);
                ctx.vfx.hitSpark(p.pos, p.mat.color.getHex());
                ctx.gameManager?.registerAccurateShot?.(); // Sharpshooter achievement
                ctx.audio?.hit(p.element, res?.mult >= 2 ? 'weak' : res?.mult <= 0.5 ? 'resist' : null);
              }
              dead = true;
              break;
            }
          }
          // Sky targets (shootable balloons): a hit starts the burn sequence in
          // SkyDecor, pays a small gold reward, and pops the bullet. AOE shots
          // additionally detonate in the dead-branch below — a distant flash.
          if (!dead && ctx.shootSky?.(p.pos, p.radius)) {
            ctx.gameManager?.addGold?.(10);
            this._tmp.copy(p.pos);
            ctx.damageNumbers?.spawn?.(this._tmp, '+10', '#ffd24a', true);
            ctx.audio?.hit?.('FIRE');
            ctx.vfx.hitSpark(p.pos, p.mat.color.getHex());
            dead = true;
          }
        } else {
          // Enemy projectile: test the player, then any attackable animal.
          const player = ctx.player;
          const rr = p.radius + 0.55;
          if (this._tmp.copy(player.position).setY(player.position.y + 0.8).distanceToSquared(p.pos) < rr * rr) {
            player.takeDamage(p.damage, ctx);
            ctx.vfx.hitSpark(p.pos, p.mat.color.getHex());
            dead = true;
          } else if (ctx.animals) {
            for (const a of ctx.animals) {
              if (!a.isAttackable()) continue;
              const ar = p.radius + a.hitRadius;
              if (this._tmp.copy(a.position).setY(a.position.y + 0.4).distanceToSquared(p.pos) < ar * ar) {
                a.takeDamage(p.damage, ctx);
                ctx.vfx.hitSpark(p.pos, p.mat.color.getHex());
                dead = true;
                break;
              }
            }
          }
        }
      }

      if (dead) {
        if (aoe && p.team === 'player') this._detonate(p, ctx);
        else if (p.pos.y <= 0.05 || p.life <= 0) {
          // Miss deaths (ground skid / burnout / range) get a small pop so even
          // misses sparkle — hit deaths already hitSpark, AOE detonates.
          ctx.vfx.hitSpark(p.pos, p.mat.color.getHex());
        }
        p.active = false;
        p.mesh.visible = false;
        p.halo.visible = false;
        if (p.slot) { p.slot.light.intensity = 0; p.slot.owner = null; p.slot = null; } // return the light
      } else {
        p.mesh.position.copy(p.pos);
        if (p.halo.visible) p.halo.position.copy(p.pos); // halo rides along (sibling, not child)
        if (p.slot) p.slot.light.position.copy(p.pos); // borrowed light rides along
        const s = p.style;
        if (s.spin) p.spinPhase += s.spin * dt;
        if (s.orient) this._orient(p); // re-aim (arrows tip with their arc) + roll
        if (s.flicker) {
          const f = 1 + 0.22 * Math.sin(p.spinPhase + p.life * 26);
          p.mesh.scale.set(p.sx * f, p.sy * f, p.sz * f);
        }
      }
    }
    this._updateTrails(dt);
  }

  // AOE detonation for explosive (Boomstick / Fire Bullet) and ring (Toroid) shots:
  // radial damage + knockback to every enemy in range, plus EMP stun for the ring.
  // Heavy juice — flash, shockwaves, camera shake + hit-stop (JUICE_SPEC §3,6).
  _detonate(p, ctx) {
    const radius = Math.max(p.explodeRadius, p.empRadius);
    const color = p.mat.color.getHex();
    let kills = 0; // 3+ kills in one blast → multi-kill (Shotgun unlock / Combo King)
    for (const e of ctx.enemies) {
      if (e.dead) continue;
      const d = this._tmp.copy(e.position).setY(e.position.y + 0.6).distanceTo(p.pos);
      if (d > radius + e.hitRadius) continue;
      const falloff = 1 - Math.min(1, d / (radius + e.hitRadius));
      e.takeDamage(p.damage * (0.4 + 0.6 * falloff), p.element, ctx);
      ctx.gameManager?.registerAccurateShot?.();
      if (p.knockback) {
        this._up.copy(e.position).sub(p.pos).setY(0).normalize();
        e.applyKnockback?.(this._up, p.knockback * (0.5 + falloff));
      }
      if (p.empDuration) e.stun?.(p.empDuration);
      if (e.dead) kills++; // takeDamage resolves death synchronously
    }
    if (kills >= 3) ctx.onMultiKill?.(kills);
    ctx.vfx.explosion?.(p.pos, color, radius);
    ctx.cameraRig?.addShake?.(0.5);
    ctx.juice?.hitStop?.();
    if (p.empRadius > 0) ctx.audio?.zap();
    else ctx.audio?.explosion();
  }

  // Deactivate a live projectile from outside the pool (e.g. PlantManager's
  // shoot-trigger consumes the bullet). Handles the borrowed-light bookkeeping
  // callers shouldn't need to know about.
  despawn(p) {
    p.active = false;
    p.mesh.visible = false;
    p.halo.visible = false;
    if (p.slot) { p.slot.light.intensity = 0; p.slot.owner = null; p.slot = null; }
  }

  // Clear all active projectiles (called on level restart to prevent accumulation).
  clear() {
    for (const p of this.items) {
      if (!p.active) continue;
      p.active = false;
      p.mesh.visible = false;
      p.halo.visible = false;
    }
    for (const s of this._lightSlots) { s.light.intensity = 0; s.owner = null; }
    this._trailFade.fill(0); // wipe every comet tail instantly on level load
    this._trails.geometry.attributes.aFade.needsUpdate = true;
  }
}
