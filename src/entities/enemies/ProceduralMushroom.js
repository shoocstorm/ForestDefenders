import * as THREE from 'three';
import { toon, addOutlines, mergeCelParts } from '../../materials/CelMaterial.js';

// Procedural mutant-mushroom enemies (ENEMIES_SPEC §9: enemies are built from
// primitives, only the hero uses an authored GLB). Fire & Earth shrooms ship as
// code instead of GLB because their authored meshes were >2MB each — far too
// heavy for two enemy variants. These rebuild the same silhouette from cap/stem/
// face/legs/arms/prop primitives and, crucially, expose the SAME shape the GLB
// path returns — { group, capPivot, emissives, mixer, actions } — with real
// AnimationClips (idle/walk/attack/hit/dying) driven through an AnimationMixer,
// so EnemyBase's clip-driven locomotion/attack/hit handling works unchanged.
//
// Convention: feet at y=0, model front (face) on local +Z so EnemyBase's
// facing-yaw (group.rotation.y = atan2(toX,toZ)) points the face at its target.
// Heights are normalized to a per-type gameplay height after build.

// --- Per-type look & proportions (natural units; height-normalized after build) ---
const TYPE = {
  WOOD_SHROOM: {
    height: 1.25,
    legH: 0.20, stemH: 0.50, stemRtop: 0.29, stemRbot: 0.40, capR: 0.62, capSquashY: 0.74,
    stemColor: 0xe2d2a8, capColor: 0x4f9a3a, spotColor: 0xd8f59a,
    capEmissive: 0x3e8a2a, capEmInt: 0.3, gillEmissive: 0x9fe86a, gillEmInt: 0.35,
    arm: 'slim', prop: 'leaves', accent: 0x8fe04a,
  },
  FIRE_SHROOM: {
    height: 1.30,
    legH: 0.20, stemH: 0.52, stemRtop: 0.30, stemRbot: 0.42, capR: 0.62, capSquashY: 0.78,
    stemColor: 0xc4683a, capColor: 0xd23b22, spotColor: 0xffd24a,
    capEmissive: 0xff5a1e, capEmInt: 0.5, gillEmissive: 0xff7a30, gillEmInt: 0.45,
    arm: 'slim', prop: 'flame', accent: 0xff7a30,
  },
  EARTH_SHROOM: {
    height: 1.9,
    legH: 0.24, stemH: 0.60, stemRtop: 0.48, stemRbot: 0.66, capR: 0.92, capSquashY: 0.70,
    stemColor: 0x7a6248, capColor: 0x564433, spotColor: 0x6f9a3a,
    capEmissive: 0xffab3a, capEmInt: 0.32, gillEmissive: 0xd98a2a, gillEmInt: 0.3,
    arm: 'chunky', prop: 'rocks', accent: 0xe0a83a,
  },
  WATER_SHROOM: {
    height: 1.28,
    legH: 0.20, stemH: 0.52, stemRtop: 0.30, stemRbot: 0.42, capR: 0.62, capSquashY: 0.76,
    stemColor: 0x3a7898, capColor: 0x1a6ab0, spotColor: 0x8fdfff,
    capEmissive: 0x2a8fd0, capEmInt: 0.45, gillEmissive: 0x4ac8e8, gillEmInt: 0.4,
    arm: 'slim', prop: 'bubble', accent: 0x4ac8e8,
  },
  ICE_SHROOM: {
    height: 1.32,
    legH: 0.20, stemH: 0.54, stemRtop: 0.30, stemRbot: 0.42, capR: 0.64, capSquashY: 0.80,
    stemColor: 0x9fc8e8, capColor: 0x6ac8ff, spotColor: 0xffffff,
    capEmissive: 0x8fdfff, capEmInt: 0.5, gillEmissive: 0xbfe8ff, gillEmInt: 0.45,
    arm: 'slim', prop: 'crystal', accent: 0x9fd8ff,
  },
  METAL_SHROOM: {
    height: 1.42,
    legH: 0.22, stemH: 0.56, stemRtop: 0.36, stemRbot: 0.50, capR: 0.74, capSquashY: 0.72,
    stemColor: 0x6a7080, capColor: 0x909aa8, spotColor: 0xc8d0d8,
    capEmissive: 0xb0b8c0, capEmInt: 0.28, gillEmissive: 0x8a9098, gillEmInt: 0.25,
    arm: 'chunky', prop: 'spikes', accent: 0xb0b8c0,
  },
};

export function buildProceduralMushroom(type) {
  const cfg = TYPE[type] || TYPE.FIRE_SHROOM;
  const group = new THREE.Group();
  const emissives = [];

  // Helper: cel-toon mesh with shadows; tracks emissive materials for hit-flash.
  // Parts without their own glow get a self-lit floor (same trick as the
  // hero) so the camera-facing side of the stem — usually in the cel shadow
  // band — doesn't collapse to near-black and swallow the face. The floor
  // isn't a "glow", so it stays out of the hit-flash list.
  const part = (geo, color, opts = {}) => {
    const glow = opts.emissiveIntensity != null;
    const mat = toon({ color, emissive: glow ? (opts.emissive ?? 0x000000) : color,
      emissiveIntensity: glow ? opts.emissiveIntensity : 0.22, rim: opts.rim, side: opts.side });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if ((opts.emissiveIntensity ?? 0) > 0.01) emissives.push(mat);
    return mesh;
  };
  const noOutline = (o) => { o.userData.__outline = true; return o; }; // skip on tiny features

  // --- Hips: the bob/sway/lean node that carries the whole upper body ---
  const hipY = cfg.legH;
  const hips = new THREE.Object3D();
  hips.name = 'Hips';
  hips.position.y = hipY;
  hips.userData.baseY = hipY;
  group.add(hips);

  // --- Legs (pivot at hips, extend down to feet at y=0) ---
  const legGeo = new THREE.CylinderGeometry(0.08, 0.1, cfg.legH, 8);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Object3D();
    leg.name = sx < 0 ? 'LegL' : 'LegR';
    leg.position.set(sx * 0.16, 0, 0.02);
    const mesh = part(legGeo, cfg.stemColor);
    mesh.position.y = -cfg.legH / 2;
    leg.add(mesh);
    // Little foot pad so legs read against the ground.
    const foot = part(new THREE.SphereGeometry(0.12, 10, 8), cfg.stemColor);
    foot.position.set(0, -cfg.legH, 0.05);
    foot.scale.set(1, 0.5, 1.3);
    leg.add(foot);
    hips.add(leg);
  }

  // --- Stem: a chubby lathed bulb (belly bulge, slight waist, flared neck) —
  // a straight cylinder read as a can, this reads as a cute mushroom body. ---
  const H = cfg.stemH, rB = cfg.stemRbot, rT = cfg.stemRtop;
  const stemProfile = [
    [0, 0], [rB * 0.82, 0], [rB * 1.0, H * 0.1], [rB * 1.06, H * 0.32],
    [rB * 0.98, H * 0.55], [rT * 1.02, H * 0.78], [rT * 1.1, H * 0.94], [rT * 0.9, H], [0, H],
  ];
  const stemR = (y) => { // radius of the profile at height y (linear interp)
    for (let i = 1; i < stemProfile.length; i++) {
      const [x0, y0] = stemProfile[i - 1], [x1, y1] = stemProfile[i];
      if (y >= y0 && y <= y1 && y1 > y0) return x0 + (x1 - x0) * ((y - y0) / (y1 - y0));
    }
    return rT;
  };
  const stem = part(new THREE.LatheGeometry(stemProfile.map(([x, y]) => new THREE.Vector2(x, y)), 20), cfg.stemColor);
  hips.add(stem);

  // --- Cartoon face on the stem front (+Z): white eyes with a dark pupil
  // (solid black dots vanished at range), heavy angled brows, a snarl and two
  // little fangs — menacing but still chibi. ---
  const faceY = H * 0.6;
  const faceZ = stemR(faceY) - 0.02;
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x120a06 });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Object3D();
    eye.position.set(sx * 0.15, faceY, faceZ);
    eye.rotation.y = sx * 0.3; // follow the stem's curve
    hips.add(eye);
    const sclera = part(new THREE.SphereGeometry(0.105, 12, 10), 0xfffdf4, { emissive: 0xfffdf4, emissiveIntensity: 0.35 });
    sclera.scale.set(0.95, 1.1, 0.5);
    eye.add(sclera);
    const pupil = noOutline(new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), pupilMat));
    pupil.position.set(-sx * 0.022, -0.012, 0.035); // cross-eyed glare at the target
    pupil.scale.set(1, 1.15, 0.5);
    eye.add(pupil);
    const glint = noOutline(new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), glintMat));
    glint.position.set(-sx * 0.005, 0.02, 0.064);
    eye.add(glint);
    // Angry brow (tilted toward the nose), sitting on the eye's upper lid.
    const brow = part(new THREE.CapsuleGeometry(0.03, 0.15, 3, 8), 0x2a1a10);
    brow.position.set(sx * 0.15, faceY + 0.105, faceZ + 0.04);
    brow.rotation.z = Math.PI / 2 + sx * 0.45;
    hips.add(brow);
    // Fangs at the mouth corners.
    const fang = noOutline(part(new THREE.ConeGeometry(0.022, 0.06, 5), 0xfffdf4));
    fang.position.set(sx * 0.05, faceY - 0.2, faceZ + 0.02);
    fang.rotation.x = Math.PI;
    hips.add(fang);
  }
  const mouth = part(new THREE.TorusGeometry(0.075, 0.022, 8, 14, Math.PI), 0x2a1410);
  noOutline(mouth);
  mouth.position.set(0, faceY - 0.15, faceZ + 0.01);
  mouth.rotation.x = Math.PI; // upper arc → snarl
  hips.add(mouth);

  // --- Gills: the cap's underside, a shallow cone from the stem neck out to
  // the rim with a faint inner glow (double-sided: seen from below + inside). ---
  const gills = part(new THREE.LatheGeometry([
    new THREE.Vector2(rT * 0.95, 0), new THREE.Vector2(cfg.capR * 0.6, 0.05), new THREE.Vector2(cfg.capR * 0.93, 0.07),
  ], 24), 0xf0e4cf, { emissive: cfg.gillEmissive, emissiveIntensity: cfg.gillEmInt, side: THREE.DoubleSide });
  gills.position.y = H - 0.02;
  hips.add(gills);

  // --- Arms (pivot at shoulders; rest pose hangs down) ---
  const arms = {};
  const armR = cfg.arm === 'chunky' ? 0.14 : 0.08;
  const armLen = cfg.arm === 'chunky' ? 0.42 : 0.38;
  const armGeo = new THREE.CylinderGeometry(armR * 0.8, armR, armLen, 8);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Object3D();
    arm.name = sx < 0 ? 'ArmL' : 'ArmR';
    arm.position.set(sx * (cfg.stemRtop + armR * 0.6), cfg.stemH * 0.78, 0);
    arm.rotation.z = sx * 0.25;
    const mesh = part(armGeo, cfg.stemColor);
    mesh.position.y = -armLen / 2;
    arm.add(mesh);
    const hand = part(new THREE.SphereGeometry(armR * 1.25, 10, 8), cfg.stemColor);
    hand.position.y = -armLen;
    arm.add(hand);
    hips.add(arm);
    arms[arm.name] = arm;
  }

  // --- Cap pivot (dome + glowing dots + element prop) ---
  const cap = new THREE.Object3D();
  cap.name = 'Cap';
  const capBaseY = cfg.stemH + 0.06;
  cap.position.y = capBaseY;
  cap.userData.baseY = capBaseY;
  hips.add(cap);

  // Lathed mushroom cap: a soft dome that bulges out past the gill line and
  // curls under at the rim (a plain half-sphere read as a bowl/helmet).
  // capSurface(t): t=0 crown → t=1 rim edge; also used to seat the spots.
  const capH = cfg.capR * cfg.capSquashY;
  const capSurface = (t) => {
    const a = t * Math.PI / 2;
    return new THREE.Vector2(cfg.capR * Math.pow(Math.sin(a), 0.8), capH * Math.cos(a) * (1 - 0.06 * t) + 0.02);
  };
  const capPts = [new THREE.Vector2(cfg.capR * 0.9, -0.03), new THREE.Vector2(cfg.capR * 1.0, -0.01)];
  for (let i = 16; i >= 0; i--) capPts.push(capSurface(i / 16)); // lathe wants bottom → top
  capPts[capPts.length - 1].x = 0;
  const dome = part(new THREE.LatheGeometry(capPts, 28),
    cfg.capColor, { emissive: cfg.capEmissive, emissiveIntensity: cfg.capEmInt });
  cap.add(dome);

  // Glowing polka dots seated on the cap surface, facing outward.
  const dotMat = new THREE.MeshBasicMaterial({ color: cfg.spotColor });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
    const t = i === 0 ? 0.05 : 0.3 + Math.random() * 0.5;
    const s = capSurface(t);
    const dot = noOutline(new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.05, 8, 8), dotMat));
    dot.position.set(Math.cos(a) * s.x, s.y, Math.sin(a) * s.x);
    dot.scale.z = 0.35;
    dot.lookAt(dot.position.clone().multiplyScalar(2).setY(s.y * 2 + 0.2));
    cap.add(dot);
  }

  buildProp(cfg, cap, part, emissives);

  // Outline opaque parts (tiny features were pre-flagged to skip). Shares geometry,
  // children of the animated nodes so outlines track the rig.
  // Collapse each node's plain parts into one vertex-coloured mesh (≈45 draw
  // calls + outlines per enemy → a handful). Glow/hit-flash parts stay separate.
  mergeCelParts(group, { skipMats: emissives });
  addOutlines(group, { thickness: 0.012 });

  // Normalize: feet to y=0, scale to gameplay height. (Built front-on +Z already.)
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = cfg.height / Math.max(0.001, size.y);
  group.scale.setScalar(s);
  group.position.y = -box.min.y * s;

  // --- Animation rig: real clips bound by node name, played via a mixer ---
  const mixer = new THREE.AnimationMixer(group);
  const clips = buildClips(type, { hipY, capBaseY, arms });
  const actions = {};
  for (const clip of clips) {
    const action = mixer.clipAction(clip);
    actions[clip.name] = action;
    if (clip.name === 'idle' || clip.name === 'walk') action.setLoop(THREE.LoopRepeat, Infinity);
  }
  actions.idle?.play();
  mixer._curName = 'idle';

  // capPivot kept for parity with the GLB path; EnemyBase nulls it when a mixer
  // is present (the clips own the cap bob), so it's only a fallback handle.
  // Every geometry/material here is built fresh for this instance (never shared
  // with another mushroom), so EnemyBase.dispose() is safe — and responsible —
  // to free them when this enemy dies.
  return { group, capPivot: cap, emissives, mixer, actions, ownsMaterials: true };
}

// --- Element prop on the cap ---
function buildProp(cfg, cap, part, emissives) {
  if (cfg.prop === 'leaves') {
    // Wood Shroom: a sapling sprout on the crown — twig + two leaf blades.
    const top = cfg.capR * cfg.capSquashY;
    const twig = part(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 6), 0x6e4a26);
    twig.position.y = top + 0.1;
    cap.add(twig);
    for (const sx of [-1, 1]) {
      const leaf = part(new THREE.SphereGeometry(0.13, 10, 6), 0x6cc23a, { emissive: 0x3e8a2a, emissiveIntensity: 0.35 });
      leaf.scale.set(0.45, 0.12, 1);
      leaf.position.set(sx * 0.1, top + 0.2, 0);
      leaf.rotation.set(0, Math.PI / 2, sx * 0.5);
      cap.add(leaf);
    }
  } else if (cfg.prop === 'flame') {
    // A licking flame crown — three emissive cones, animated by the idle clip.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.26;
      const inner = i === 0;
      const flame = part(new THREE.ConeGeometry(inner ? 0.16 : 0.12, inner ? 0.5 : 0.34, 8),
        inner ? 0xffe24a : 0xff6a2a, { emissive: inner ? 0xffd24a : 0xff5a1e, emissiveIntensity: 1.1 });
      flame.userData.__outline = true; // flames read better without a dark rim
      flame.position.set(Math.cos(a) * r, cfg.capR * cfg.capSquashY + (inner ? 0.22 : 0.12), Math.sin(a) * r);
      cap.add(flame);
    }
  } else if (cfg.prop === 'rocks') {
    // Jagged rock shards + mossy boulder erupting from the cap (earthy/tanky read).
    const boulder = part(new THREE.DodecahedronGeometry(0.3, 0), 0x4a4036);
    boulder.position.y = cfg.capR * cfg.capSquashY + 0.14;
    boulder.rotation.set(0.4, 0.6, 0.2);
    cap.add(boulder);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const r = 0.42;
      const shard = part(new THREE.ConeGeometry(0.1, 0.34 + Math.random() * 0.14, 5),
        0x6a5a48, { emissive: cfg.capEmissive, emissiveIntensity: 0.22 });
      shard.position.set(Math.cos(a) * r, cfg.capR * cfg.capSquashY - 0.02, Math.sin(a) * r);
      shard.rotation.set(0.5 * Math.cos(a), 0, 0.5 * Math.sin(a));
      cap.add(shard);
    }
  } else if (cfg.prop === 'bubble') {
    // Water Shroom: translucent bubble crown with inner glow.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.24;
      const bubble = part(new THREE.SphereGeometry(i === 0 ? 0.18 : 0.12, 12, 10),
        0x9fe8ff, { emissive: cfg.capEmissive, emissiveIntensity: 0.6, rim: { color: 0xffffff, intensity: 0.5 } });
      bubble.userData.__outline = true;
      bubble.position.set(Math.cos(a) * r, cfg.capR * cfg.capSquashY + (i === 0 ? 0.2 : 0.1), Math.sin(a) * r);
      cap.add(bubble);
    }
  } else if (cfg.prop === 'crystal') {
    // Ice Shroom: jagged ice crystal spires catching the light.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.22;
      const h = i === 0 ? 0.5 : 0.3 + Math.random() * 0.14;
      const crystal = part(new THREE.ConeGeometry(0.11, h, 6),
        0xcfeeff, { emissive: cfg.capEmissive, emissiveIntensity: 0.7, rim: { color: 0xffffff, intensity: 0.6 } });
      crystal.position.set(Math.cos(a) * r, cfg.capR * cfg.capSquashY + h * 0.4, Math.sin(a) * r);
      crystal.rotation.set(0.1 * Math.cos(a), 0, 0.1 * Math.sin(a));
      cap.add(crystal);
    }
  } else if (cfg.prop === 'spikes') {
    // Metal Shroom: jagged metal spike crown + riveted plating read.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 0.38;
      const spike = part(new THREE.ConeGeometry(0.09, 0.4 + Math.random() * 0.1, 5),
        0xa0a8b0, { emissive: cfg.capEmissive, emissiveIntensity: 0.2 });
      spike.position.set(Math.cos(a) * r, cfg.capR * cfg.capSquashY + 0.06, Math.sin(a) * r);
      spike.rotation.set(0.2 * Math.cos(a), 0, 0.2 * Math.sin(a));
      cap.add(spike);
    }
    // Central hub bolt.
    const bolt = part(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 8), 0xc8d0d8);
    bolt.position.y = cfg.capR * cfg.capSquashY + 0.2;
    cap.add(bolt);
  }
}

// --- Animation track helpers ---
// Euler keyframes → a QuaternionKeyframeTrack (mixer-friendly rotation).
function quatTrack(node, times, eulers) {
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  const values = [];
  for (const [x, y, z] of eulers) { e.set(x || 0, y || 0, z || 0); q.setFromEuler(e); values.push(q.x, q.y, q.z, q.w); }
  return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, values);
}
// [x,y,z] keyframes → a VectorKeyframeTrack on .position / .scale.
function vecTrack(node, prop, times, vecs) {
  const values = [];
  for (const v of vecs) values.push(v[0], v[1], v[2]);
  return new THREE.VectorKeyframeTrack(`${node}.${prop}`, times, values);
}

// Build all clips for a type. Earth's attack is a heavy ground-slam; Fire's is a
// two-handed cast. idle/walk are shared in spirit but tuned per silhouette.
// X+ rotation tips the top toward +Z (forward/at-target); X- rears it back.
function buildClips(type, { hipY, capBaseY }) {
  const clips = [];
  const isTank = type === 'EARTH_SHROOM' || type === 'METAL_SHROOM';
  const walkSpeed = type === 'EARTH_SHROOM' ? 0.9 : (type === 'METAL_SHROOM' ? 0.8 : 0.65);

  // idle — breathing bob + gentle cap nod + (fire) flame flicker via cap scale.
  clips.push(new THREE.AnimationClip('idle', 2.4, [
    vecTrack('Hips', 'position', [0, 1.2, 2.4], [[0, hipY, 0], [0, hipY + 0.03, 0], [0, hipY, 0]]),
    vecTrack('Cap', 'position', [0, 1.2, 2.4], [[0, capBaseY, 0], [0, capBaseY + 0.05, 0], [0, capBaseY, 0]]),
    quatTrack('Cap', [0, 0.6, 1.2, 1.8, 2.4],
      [[0, 0, 0], [0.05, 0, 0.04], [0, 0, 0], [0.05, 0, -0.04], [0, 0, 0]]),
    vecTrack('Cap', 'scale', [0, 0.6, 1.2, 1.8, 2.4],
      [[1, 1, 1], [1.03, 0.97, 1.03], [1, 1, 1], [0.98, 1.03, 0.98], [1, 1, 1]]),
  ]));

  // walk — alternating leg/arm swing + double bob + slight forward lean.
  const W = walkSpeed;
  clips.push(new THREE.AnimationClip('walk', W, [
    quatTrack('LegL', [0, W / 2, W], [[0.6, 0, 0], [-0.6, 0, 0], [0.6, 0, 0]]),
    quatTrack('LegR', [0, W / 2, W], [[-0.6, 0, 0], [0.6, 0, 0], [-0.6, 0, 0]]),
    quatTrack('ArmL', [0, W / 2, W], [[-0.4, 0, -0.25], [0.4, 0, -0.25], [-0.4, 0, -0.25]]),
    quatTrack('ArmR', [0, W / 2, W], [[0.4, 0, 0.25], [-0.4, 0, 0.25], [0.4, 0, 0.25]]),
    vecTrack('Hips', 'position', [0, W / 4, W / 2, (3 * W) / 4, W],
      [[0, hipY, 0], [0, hipY + 0.06, 0], [0, hipY, 0], [0, hipY + 0.06, 0], [0, hipY, 0]]),
    quatTrack('Hips', [0, W / 2, W], [[0.1, 0, 0.04], [0.1, 0, -0.04], [0.1, 0, 0.04]]),
  ]));

  // hit — recoil: body leans back, cap snaps back, then settles.
  clips.push(new THREE.AnimationClip('hit', 0.3, [
    quatTrack('Hips', [0, 0.08, 0.3], [[0, 0, 0], [-0.25, 0, 0], [0, 0, 0]]),
    quatTrack('Cap', [0, 0.08, 0.3], [[0, 0, 0], [-0.4, 0, 0], [0, 0, 0]]),
  ]));

  // dying — collapse + topple (authored for completeness; EnemyBase's squash-flop
  // death currently stops the mixer, so this is a fallback / future hook).
  clips.push(new THREE.AnimationClip('dying', 0.6, [
    vecTrack('Hips', 'position', [0, 0.6], [[0, hipY, 0], [0, hipY * 0.3, 0]]),
    quatTrack('Hips', [0, 0.35, 0.6], [[0, 0, 0], [0.2, 0, 0.3], [-0.1, 0, 1.3]]),
  ]));

  if (isTank) {
    // attack — telegraphed ground slam (Earth boss + Metal tank): rear, raise, slam, settle.
    clips.push(new THREE.AnimationClip('attack', 0.9, [
      quatTrack('Hips', [0, 0.35, 0.55, 0.75, 0.9],
        [[0, 0, 0], [-0.4, 0, 0], [0.5, 0, 0], [0.15, 0, 0], [0, 0, 0]]),
      quatTrack('Cap', [0, 0.35, 0.55, 0.75, 0.9],
        [[0, 0, 0], [-0.6, 0, 0], [0.7, 0, 0], [0.1, 0, 0], [0, 0, 0]]),
      quatTrack('ArmL', [0, 0.35, 0.55, 0.9],
        [[0, 0, -0.25], [-2.4, 0, -0.4], [0.9, 0, -0.2], [0, 0, -0.25]]),
      quatTrack('ArmR', [0, 0.35, 0.55, 0.9],
        [[0, 0, 0.25], [-2.4, 0, 0.4], [0.9, 0, 0.2], [0, 0, 0.25]]),
    ]));
  } else {
    // attack — two-handed fireball cast: wind up, thrust forward, recover.
    clips.push(new THREE.AnimationClip('attack', 0.7, [
      quatTrack('Hips', [0, 0.2, 0.45, 0.7], [[0, 0, 0], [-0.18, 0, 0], [0.2, 0, 0], [0, 0, 0]]),
      quatTrack('Cap', [0, 0.2, 0.45, 0.7], [[0, 0, 0], [-0.2, 0, 0], [0.3, 0, 0], [0, 0, 0]]),
      quatTrack('ArmL', [0, 0.2, 0.45, 0.7],
        [[0, 0, -0.25], [-1.6, 0, -0.5], [-2.4, 0, -0.1], [0, 0, -0.25]]),
      quatTrack('ArmR', [0, 0.2, 0.45, 0.7],
        [[0, 0, 0.25], [-1.6, 0, 0.5], [-2.4, 0, 0.1], [0, 0, 0.25]]),
    ]));
  }

  return clips;
}
