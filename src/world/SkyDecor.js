import * as THREE from 'three';
import { BLOOM_LAYER } from '../config/Constants.js';
import { randRange, randInt } from '../util/MathUtils.js';

// Stylized sky backdrop for the sci-fi arena, themed per biome (LEVELS_SPEC sky):
// a sun (L1/L2) or moon (L3) disc with a soft glow halo, drifting low-poly cloud
// puffs, streaking comets with fading trails, slow low-poly spaceships with engine
// glow, and a far star field. Everything is placed far out (well beyond fog) with
// `fog: false` so it reads as a crisp painted backdrop, and glowing parts join
// BLOOM_LAYER so the post pipeline lights them up. Discs/clouds are oriented once
// toward the play area (objects are ~300u away, so the angular error as the player
// roams the 60×140 arena is negligible — no per-frame billboarding needed).
export class SkyDecor {
  constructor(scene, biome) {
    this.scene = scene;
    this._t = 0;
    this.root = new THREE.Group();
    this.root.userData.arenaOwned = true;
    this._geo = [];   // geometries to dispose
    this._mat = [];   // materials to dispose
    this._clouds = [];
    this._comets = [];
    this._ships = [];
    this._balloons = [];
    this._tex = [];   // textures to dispose

    const cfg = biome.skyDecor || {};
    const accent = (biome.tech && biome.tech.accent) || 0xffffff;

    this._buildBody(cfg);
    this._buildClouds(cfg);
    this._buildStars(cfg);
    for (let i = 0; i < (cfg.comets || 0); i++) this._buildComet(cfg, accent);
    for (let i = 0; i < (cfg.ships || 0); i++) this._buildShip(cfg, accent);
    for (let i = 0; i < (cfg.balloons || 0); i++) this._buildBalloon(cfg, accent);

    scene.add(this.root);
  }

  // Track + return a geometry/material so dispose() can free it.
  _g(geo) { this._geo.push(geo); return geo; }
  _m(mat) { this._mat.push(mat); return mat; }

  _basic(color, opts = {}) {
    return this._m(new THREE.MeshBasicMaterial({ color, fog: false, ...opts }));
  }

  // Sun or moon: a bright disc with a single soft outer glow ring.
  // Moon gets subtle shadow craters. Oriented to face the play area.
  _buildBody(cfg) {
    const pos = cfg.bodyPos || [-150, 200, 320];
    const R = cfg.bodyR || 26;
    const g = new THREE.Group();
    g.position.set(...pos);

    const disc = new THREE.Mesh(this._g(new THREE.CircleGeometry(R, 48)), this._basic(cfg.bodyColor || 0xfff4d8));
    disc.layers.enable(BLOOM_LAYER);
    g.add(disc);

    // Single soft outer glow halo (additive, fades outward).
    const haloMat = this._basic(cfg.bodyGlow || cfg.bodyColor || 0xffe2a0,
      { transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const halo = new THREE.Mesh(this._g(new THREE.CircleGeometry(R * 1.7, 48)), haloMat);
    halo.position.z = -0.3;
    halo.layers.enable(BLOOM_LAYER);
    g.add(halo);

    if (cfg.body === 'moon') {
      const craterMat = this._basic(0xb9c6e0, { transparent: true, opacity: 0.5 });
      for (let i = 0; i < 6; i++) {
        const cr = new THREE.Mesh(this._g(new THREE.CircleGeometry(randRange(R * 0.08, R * 0.22), 16)), craterMat);
        const a = randRange(0, Math.PI * 2), rr = randRange(0, R * 0.7);
        cr.position.set(Math.cos(a) * rr, Math.sin(a) * rr, 0.2);
        g.add(cr);
      }
    }

    g.lookAt(0, 40, 0);
    this.root.add(g);
    this.body = g;
  }

  // Soft fluffy clouds: clusters of flattened spheres with cel shading,
  // scattered broadly across the sky dome at varying heights and depths.
  _buildClouds(cfg) {
    const n = cfg.cloudN || 0;
    if (!n) return;
    // Use a soft cel material that responds to the scene sun for depth.
    const mat = this._m(new THREE.MeshToonMaterial({
      color: cfg.cloud || 0xeef3f7, transparent: true, opacity: 0.92,
      fog: false, side: THREE.DoubleSide,
    }));
    const puffGeo = this._g(new THREE.SphereGeometry(1, 16, 12));
    for (let i = 0; i < n; i++) {
      const cloud = new THREE.Group();
      const lobes = randInt(6, 10);
      for (let j = 0; j < lobes; j++) {
        const lobe = new THREE.Mesh(puffGeo, mat);
        // Scatter lobes in a horizontal cluster with some vertical variation.
        const spread = 24;
        lobe.position.set(
          randRange(-spread, spread),
          randRange(-2, 5),
          randRange(-spread * 0.6, spread * 0.6)
        );
        // Flatten spheres for a puffy, cushion-like cloud shape.
        const baseSize = randRange(10, 18);
        lobe.scale.set(baseSize, baseSize * 0.55, baseSize * 0.7);
        cloud.add(lobe);
      }
      // Scatter clouds broadly across the sky dome: use spherical coordinates
      // to position them at varying heights, azimuths, and distances.
      const spanX = 640;
      const spanZ = 380;
      const azimuth = randRange(-Math.PI * 0.6, Math.PI * 0.6); // spread horizontally
      const elevation = randRange(0.15, 0.7) * Math.PI * 0.5;     // bias to upper sky
      const distance = randRange(280, 480);
      cloud.position.set(
        Math.cos(azimuth) * Math.cos(elevation) * distance,
        Math.sin(elevation) * distance + 80,
        Math.sin(azimuth) * Math.cos(elevation) * distance
      );
      cloud.userData.speed = randRange(2, 6) * (Math.random() < 0.5 ? -1 : 1);
      cloud.userData.span = spanX;
      this.root.add(cloud);
      this._clouds.push(cloud);
    }
  }

  // Far star field (Points) — bright pinpricks on the bloom layer.
  _buildStars(cfg) {
    const n = cfg.stars || 0;
    if (!n) return;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Scatter on a far dome shell, biased to the upper hemisphere.
      const a = randRange(0, Math.PI * 2);
      const el = randRange(0.05, 0.95) * Math.PI * 0.5;
      const r = randRange(430, 520);
      pos[i * 3] = Math.cos(a) * Math.cos(el) * r;
      pos[i * 3 + 1] = Math.sin(el) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r;
    }
    const geo = this._g(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = this._m(new THREE.PointsMaterial({
      color: 0xdfe8ff, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.9,
      fog: false, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const stars = new THREE.Points(geo, mat);
    stars.frustumCulled = false;
    stars.layers.enable(BLOOM_LAYER);
    this.root.add(stars);
    this.stars = stars;
  }

  // A comet: glowing head + a tapered additive trail, travelling along a fixed
  // heading; recycled to a fresh start once it leaves the field.
  _buildComet(cfg, accent) {
    const g = new THREE.Group();
    const head = new THREE.Mesh(this._g(new THREE.SphereGeometry(1.4, 12, 10)),
      this._basic(0xffffff));
    head.layers.enable(BLOOM_LAYER);
    g.add(head);
    const trailGeo = this._g(new THREE.ConeGeometry(1.6, 26, 10, 1, true));
    const trail = new THREE.Mesh(trailGeo, this._basic(accent,
      { transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    trail.rotation.x = -Math.PI / 2; // point the cone's tip backward along -dir
    trail.position.z = 13;
    trail.layers.enable(BLOOM_LAYER);
    g.add(trail);
    this.root.add(g);

    const comet = { obj: g, trail };
    this._resetComet(comet);
    comet.delay = randRange(0, 14); // stagger initial appearances
    this._comets.push(comet);
  }

  _resetComet(c) {
    // Start high on one side, head down-across the sky.
    const fromLeft = Math.random() < 0.5;
    const sx = (fromLeft ? -1 : 1) * randRange(300, 420);
    const sy = randRange(180, 300);
    const sz = randRange(120, 420);
    c.obj.position.set(sx, sy, sz);
    const dir = new THREE.Vector3((fromLeft ? 1 : -1) * randRange(0.6, 1.0), -randRange(0.25, 0.5), randRange(-0.3, 0.3)).normalize();
    c.dir = dir;
    c.speed = randRange(70, 130);
    c.obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    c.life = 0;
    c.maxLife = randRange(6, 11);
  }

  // Low-poly spaceship: an elongated hull + wings + a glowing engine, drifting
  // slowly across the sky with a gentle bob; wraps in X.
  _buildShip(cfg, accent) {
    const g = new THREE.Group();
    const hullMat = this._m(new THREE.MeshLambertMaterial({ color: 0xb8c4d6, emissive: 0x6a7a9a, emissiveIntensity: 0.4, fog: false }));
    const glowMat = this._basic(accent, { transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });

    const hull = new THREE.Mesh(this._g(new THREE.CylinderGeometry(0.7, 1.6, 9, 8)), hullMat);
    hull.rotation.z = Math.PI / 2; // lie along X
    g.add(hull);
    const nose = new THREE.Mesh(this._g(new THREE.ConeGeometry(0.9, 3.2, 8)), hullMat);
    nose.rotation.z = -Math.PI / 2; nose.position.x = 5.5;
    g.add(nose);
    const fin = new THREE.Mesh(this._g(new THREE.BoxGeometry(3, 0.3, 7)), hullMat);
    fin.position.x = -2;
    g.add(fin);
    // Engine glow at the tail.
    const engine = new THREE.Mesh(this._g(new THREE.SphereGeometry(0.9, 10, 8)), glowMat);
    engine.position.x = -4.8;
    engine.layers.enable(BLOOM_LAYER);
    g.add(engine);
    // Cabin running lights.
    for (let i = 0; i < 3; i++) {
      const lt = new THREE.Mesh(this._g(new THREE.SphereGeometry(0.28, 8, 6)), glowMat);
      lt.position.set(2 - i * 2, 0.9, 0);
      lt.layers.enable(BLOOM_LAYER);
      g.add(lt);
    }

    const s = randRange(2.2, 4.0);
    g.scale.setScalar(s);
    const span = 820;
    const dir = Math.random() < 0.5 ? 1 : -1;
    g.position.set(randRange(-span / 2, span / 2), randRange(110, 220), randRange(120, 420));
    g.rotation.y = dir < 0 ? Math.PI : 0;
    this.root.add(g);
    this._ships.push({ obj: g, speed: randRange(6, 14) * dir, span, baseY: g.position.y, bob: randRange(0.6, 1.4), phase: randRange(0, 6.28) });
  }

  // Small striped canvas texture used for balloon envelopes — alternating gore
  // panels, the classic hot-air-balloon look, without any per-face materials.
  _stripeTexture(c1, c2, stripes) {
    const w = 128, h = 8;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');
    const panelW = w / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = hex(i % 2 === 0 ? c1 : c2);
      ctx.fillRect(i * panelW, 0, panelW, h);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    this._tex.push(tex);
    return tex;
  }

  // A hot air balloon: classic teardrop envelope with candy-stripe gore panels,
  // a glowing burner throat, and a hanging basket. Drifts slowly across the sky
  // with a gentle bob and sway; wraps in X like the ships.
  _buildBalloon(cfg, accent) {
    const [c1, c2] = cfg.balloonColors || [accent, 0xffffff];
    const g = new THREE.Group();

    const pts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.5, 0.05),
      new THREE.Vector2(0.78, 0.28),
      new THREE.Vector2(0.95, 0.58),
      new THREE.Vector2(1.0, 0.9),
      new THREE.Vector2(0.88, 1.2),
      new THREE.Vector2(0.58, 1.4),
      new THREE.Vector2(0.22, 1.48),
      new THREE.Vector2(0, 1.5),
    ];
    const tex = this._stripeTexture(c1, c2, randInt(8, 12));
    const envMat = this._m(new THREE.MeshLambertMaterial({ map: tex, fog: false }));
    const envelope = new THREE.Mesh(this._g(new THREE.LatheGeometry(pts, 20)), envMat);
    g.add(envelope);

    // Warm burner glow at the envelope throat.
    const flame = new THREE.Mesh(this._g(new THREE.SphereGeometry(0.12, 8, 6)),
      this._basic(0xffb060, { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.position.y = -0.05;
    flame.layers.enable(BLOOM_LAYER);
    g.add(flame);

    // Basket + ropes hanging below.
    const basketMat = this._m(new THREE.MeshLambertMaterial({ color: 0x5a3a20, fog: false }));
    const basket = new THREE.Mesh(this._g(new THREE.BoxGeometry(0.34, 0.24, 0.34)), basketMat);
    basket.position.y = -0.45;
    g.add(basket);
    const ropeMat = this._basic(0x2a1c10);
    const ropeGeo = this._g(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 4));
    for (const [rx, rz] of [[0.13, 0.13], [-0.13, 0.13], [0.13, -0.13], [-0.13, -0.13]]) {
      const rope = new THREE.Mesh(ropeGeo, ropeMat);
      rope.position.set(rx, -0.24, rz);
      g.add(rope);
    }

    const scale = randRange(9, 15);
    g.scale.setScalar(scale);
    const span = 700;
    const dir = Math.random() < 0.5 ? 1 : -1;
    g.position.set(randRange(-span / 2, span / 2), randRange(70, 150), randRange(140, 420));
    this.root.add(g);
    this._balloons.push({
      obj: g, speed: randRange(4, 9) * dir, span,
      baseY: g.position.y, bob: randRange(1.2, 2.4), phase: randRange(0, 6.28),
      swayAmp: randRange(0.03, 0.07), swayPhase: randRange(0, 6.28),
    });
  }

  update(dt) {
    this._t += dt;

    // Clouds drift horizontally (X) and wrap when they leave the visible span.
    for (const c of this._clouds) {
      c.position.x += c.userData.speed * dt;
      const half = c.userData.span / 2;
      if (c.position.x > half) c.position.x = -half;
      else if (c.position.x < -half) c.position.x = half;
    }

    // Ships drift + bob; wrap in X.
    for (const s of this._ships) {
      s.obj.position.x += s.speed * dt;
      s.obj.position.y = s.baseY + Math.sin(this._t * 0.5 + s.phase) * s.bob;
      const half = s.span / 2;
      if (s.obj.position.x > half) s.obj.position.x = -half;
      else if (s.obj.position.x < -half) s.obj.position.x = half;
    }

    // Balloons drift + bob + sway; wrap in X.
    for (const b of this._balloons) {
      b.obj.position.x += b.speed * dt;
      b.obj.position.y = b.baseY + Math.sin(this._t * 0.35 + b.phase) * b.bob;
      b.obj.rotation.z = Math.sin(this._t * 0.6 + b.swayPhase) * b.swayAmp;
      const half = b.span / 2;
      if (b.obj.position.x > half) b.obj.position.x = -half;
      else if (b.obj.position.x < -half) b.obj.position.x = half;
    }

    // Comets streak and recycle.
    for (const c of this._comets) {
      if (c.delay > 0) { c.delay -= dt; c.obj.visible = false; continue; }
      c.obj.visible = true;
      c.life += dt;
      c.obj.position.addScaledVector(c.dir, c.speed * dt);
      if (c.life > c.maxLife) { this._resetComet(c); c.delay = randRange(2, 10); }
    }

    // Stars twinkle subtly.
    if (this.stars) this.stars.material.opacity = 0.7 + Math.sin(this._t * 1.5) * 0.2;
  }

  dispose() {
    this.scene.remove(this.root);
    for (const g of this._geo) g.dispose();
    for (const m of this._mat) m.dispose();
    for (const t of this._tex) t.dispose();
    this._geo.length = 0; this._mat.length = 0; this._tex.length = 0;
    this._clouds.length = 0; this._comets.length = 0; this._ships.length = 0; this._balloons.length = 0;
  }
}
