import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Cel-shaded NPR material system (CEL_SHADER_ART_STYLE_SPEC).
//
// Two base materials share the same "extras" (fresnel rim + optional wind sway),
// chosen per surface so each looks its best:
//
//   • toon()  — MeshToonMaterial with a crisp 3-band gradient map. Used for
//     PROCEDURAL geometry (ground, walls, props) where we want hard cel banding.
//   • painted() — MeshStandardMaterial with matte hand-painted PBR (high rough,
//     no metal). Used for GLB models that already carry baked/painted albedo +
//     emissive textures; real lighting + shadows read as stylized cel (Genshin-
//     style: lit texture + outline + rim) without double-shading baked art.
//
// Both get a fresnel rim (ambient-tinted edge glow) injected via onBeforeCompile.
// The rim is computed in WORLD space (world normal · view dir) so it is correct
// regardless of three's internal view-space varyings.
//
// Outlines are true inverted-hull pushed along object-space normals (crisp dark
// edges that survive non-uniform geometry, unlike uniform scaling). Outline
// children inherit their parent mesh's node transform, so node-animated models
// (hero pivot rig, mushroom Cap/Stem/Base) keep their outlines in sync.

// --- Shared 3-band gradient map (hard cel transitions: shadow / mid / lit) ---
// RGBAFormat (not RGBFormat): WebGL2's glTexStorage2D rejects the unsized GL_RGB
// (0x1907) internal format on strict drivers (SwiftShader, some Mobile/Apple GPUs),
// which silently leaves the texture empty and makes MeshToonMaterial render as if
// every surface faced away from every light. RGBA8 is sized and works everywhere.
let _gradient;
function gradientMap() {
  if (_gradient) return _gradient;
  const data = new Uint8Array([
    80, 80, 80, 255,
    160, 160, 160, 255,
    255, 255, 255, 255,
  ]); // 3 steps, 4 bytes/texel
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  _gradient = tex;
  return tex;
}

// Materials carrying wind need their uTime updated each frame.
const _windMaterials = new Set();
export function updateTime(t) {
  for (const m of _windMaterials) if (m.userData.__uTime) m.userData.__uTime.value = t;
}

// Drop a disposed wind material from the update set. Only needed for
// PROCEDURAL wind materials (one fresh instance per tree, e.g. Vegetation.js) —
// GLB wind materials are assigned once per asset at load time (celifyGLTF) and
// shared by every clone of that asset for the session, so they're never disposed
// per-instance and must stay registered. Safe to call on any material (no-op if
// it was never tracked).
export function untrackWind(mat) {
  _windMaterials.delete(mat);
}

// --- Fresnel rim injection (world-space) + optional wind sway ---
function injectExtras(mat, { rim, wind, vcolEmissive } = {}) {
  mat.userData = mat.userData || {};
  rim = { color: 0xffffff, power: 3.2, intensity: 0.55, ...rim };

  mat.onBeforeCompile = (shader) => {
    const vs = shader.vertexShader;
    const fs = shader.fragmentShader;

    // Vertex: declare world varyings + wind.
    shader.vertexShader = vs
      .replace('#include <common>',
        `#include <common>\n` +
        `varying vec3 vCelWN;\nvarying vec3 vCelWP;\n` +
        (wind ? `uniform float uTime;\nuniform float uWindBase;\nuniform float uWindFreq;\nuniform float uWindAmp;\n` : ''))
      .replace('#include <project_vertex>',
        `#include <project_vertex>\n` +
        `vCelWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n` +
        `vCelWN = normalize(mat3(modelMatrix) * objectNormal);\n`);

    if (wind) {
      // Sway the top of the mesh (masked by object-space Y) with a phase keyed
      // to the instance's world position so clones don't sync up.
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n` +
        `{ float ph = (modelMatrix[3].x + modelMatrix[3].z) * 0.6 + position.y * 1.7;\n` +
        `  float m = smoothstep(uWindBase, uWindBase + 0.6, position.y);\n` +
        `  transformed.x += sin(uTime * uWindFreq + ph) * m * uWindAmp;\n` +
        `  transformed.z += cos(uTime * uWindFreq * 0.9 + ph) * m * uWindAmp; }`);
    }

    // Fragment: ambient-tinted fresnel rim added to outgoing light.
    shader.fragmentShader = fs
      .replace('#include <common>',
        `#include <common>\n` +
        `varying vec3 vCelWN;\nvarying vec3 vCelWP;\n` +
        `uniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimIntensity;\n`)
      .replace('#include <opaque_fragment>',
        `{ vec3 V = normalize(cameraPosition - vCelWP);\n` +
        `  float f = 1.0 - clamp(dot(normalize(vCelWN), V), 0.0, 1.0);\n` +
        `  float rim = pow(f, uRimPower) * uRimIntensity;\n` +
        `  outgoingLight += uRimColor * rim; }\n` +
        `#include <opaque_fragment>`);

    // Merged vertex-coloured parts (mergeCelParts): the self-lit floor follows
    // each vertex's own colour, exactly as the separate per-part materials did.
    if (vcolEmissive) {
      shader.fragmentShader = shader.fragmentShader.replace(
        'vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor.rgb;');
    }

    shader.uniforms.uRimColor = { value: new THREE.Color(rim.color) };
    shader.uniforms.uRimPower = { value: rim.power };
    shader.uniforms.uRimIntensity = { value: rim.intensity };

    if (wind) {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uWindBase = { value: wind.base ?? 0.2 };
      shader.uniforms.uWindFreq = { value: wind.freq ?? 2.4 };
      shader.uniforms.uWindAmp = { value: wind.amp ?? 0.05 };
      mat.userData.__uTime = shader.uniforms.uTime;
      _windMaterials.add(mat);
    }
  };
  if (vcolEmissive) mat.customProgramCacheKey = () => 'cel-vcol-emissive';
  return mat;
}

// Cel-toon material for procedural geometry (hard bands).
export function toon(opts = {}) {
  const { color = 0xffffff, emissive = 0x000000, emissiveIntensity = 0, map = null,
          rim, transparent = false, wind, side, vertexColors = false, vcolEmissive = false } = opts;
  const params = { color, emissive, emissiveIntensity, map, transparent, vertexColors,
    gradientMap: gradientMap() };
  if (side !== undefined) params.side = side;
  const m = new THREE.MeshToonMaterial(params);
  return injectExtras(m, { rim, wind, vcolEmissive });
}

// Hand-painted PBR material for textured GLB meshes (real light + baked art).
export function painted(opts = {}) {
  const { color = 0xffffff, map = null, emissive = 0x000000, emissiveMap = null,
          emissiveIntensity = 0, roughness = 0.92, metalness = 0.0, rim, wind,
          transparent = false, alphaTest = 0, side } = opts;
  const params = { color, map, emissive, emissiveMap, emissiveIntensity,
    roughness, metalness, transparent, alphaTest };
  if (side !== undefined) params.side = side;
  const m = new THREE.MeshStandardMaterial(params);
  return injectExtras(m, { rim, wind });
}

// --- Inverted-hull outline pushed along object-space normals ---
let _outlineGeoWarn = 0;
const _outlineMatCache = new Map();
function outlineMaterial(color = 0x14140e, thickness = 0.018) {
  const key = color + ':' + thickness.toFixed(3);
  let m = _outlineMatCache.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uThick: { value: thickness } },
      vertexShader:
        `uniform float uThick;\n` +
        `void main(){\n` +
        `  vec4 mv = modelViewMatrix * vec4(position, 1.0);\n` +
        // Inflate the hull with view distance so the projected line weight stays
        // roughly constant in pixels — hand-inked consistency — instead of
        // hairline-thin at range and heavy up close. Capped so distant objects
        // don't balloon (and poke through fog/far geometry).
        `  float f = clamp(-mv.z * 0.5, 1.0, 5.0);\n` +
        `  vec3 p = position + normal * (uThick * f);\n` +
        `  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }\n`,
      fragmentShader: `uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0); }`,
      side: THREE.BackSide,
    });
    _outlineMatCache.set(key, m);
  }
  return m;
}

// Add an outline child to every mesh under `root`. Skips transparent/cutout parts
// (eyes, glints) so outlines don't ring translucent surfaces, and any mesh whose
// name matches `skip` (small facial/detail parts where a fixed hull thickness
// would dwarf the feature itself — see celifyGLTF's `outlineSkip`). Returns count added.
export function addOutlines(root, { color = 0x14140e, thickness = 0.018, skip = null } = {}) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.userData.__outline) return;
    if (skip && o.name && skip.some((s) => o.name.toLowerCase().includes(s))) return;
    const mat = o.material;
    const transparent = mat && (mat.transparent || (mat.alphaTest && mat.alphaTest > 0.5));
    if (transparent) return; // don't outline glass/eyes
    const outline = new THREE.Mesh(o.geometry, outlineMaterial(color, thickness));
    outline.renderOrder = -1;
    // Outlines share the source mesh's geometry, so their bounding sphere (and
    // thus frustum culling) matches the parent exactly — they're culled WITH
    // their mesh. (frustumCulled=false used to force every outline behind the
    // camera to still submit a draw call, doubling enemy/prop mesh count.)
    // Mark BOTH flags so this outline isn't given its own outline when traverse
    // reaches it as a newly-added child of o (avoids infinite recursion).
    outline.userData.__isOutline = true;
    outline.userData.__outline = true;
    o.add(outline);
    o.userData.__outline = true;
    n++;
  });
  return n;
}

// Convert a loaded GLTF scene's PBR materials into hand-painted cel materials
// (preserving albedo/emissive textures), enable shadows, and (optionally) add
// outlines. Returns { meshes, emissives, bounds } for the caller.
//
//  - opts.outline: bool — add inverted-hull outline to opaque meshes.
//  - opts.wind:   object — enable canopy/foliage sway on all meshes.
//  - opts.rim:    object — fresnel rim params.
//  - opts.emissiveBoost: multiply emissiveIntensity for glowy parts.
//  - opts.scaleBias: scale all geometry (applied to root by caller usually).
export function celifyGLTF(root, opts = {}) {
  const { outline = true, wind = null, rim = { color: 0xffffff, power: 3.4, intensity: 0.5 },
          emissiveBoost = 1.0, selfLit = 0 } = opts;
  const meshes = [];
  const emissives = [];
  const box = new THREE.Box3();

  root.traverse((o) => {
    if (!o.isMesh) return;
    // GLTFLoader already parses materials into THREE.MeshStandardMaterial, so we
    // read THREE properties directly (color/map/emissive/emissiveMap/etc).
    const src = o.material;
    const color = src.color ? src.color.clone() : new THREE.Color(0xffffff);
    const map = src.map || null;
    // selfLit: a textured model with no glow of its own gets its albedo map as
    // a faint emissive floor, so faces turned away from the sun don't sink into
    // the cel shadow band (same idea as the hero/enemy emissive floor).
    const lit = selfLit > 0 && !src.emissiveMap && map;
    const emMap = lit ? map : (src.emissiveMap || null);
    const emColor = src.emissive ? src.emissive.clone() : new THREE.Color(0x000000);
    const emInt = lit ? selfLit : (src.emissiveIntensity ?? 0) * emissiveBoost;

    const mat = painted({
      color, map,
      emissive: emMap ? 0xffffff : emColor, emissiveMap: emMap,
      emissiveIntensity: emInt,
      roughness: 0.94, metalness: 0.0, rim, wind,
      transparent: src.transparent || false, alphaTest: src.alphaTest || 0,
    });
    o.material = mat;
    o.receiveShadow = true;
    meshes.push(o);
    if (emInt > 0.01 || emMap) emissives.push(mat);
    box.expandByObject(o);
  });

  // Shadow casters are size-gated: parts tiny relative to the model (eyes,
  // glints, facial detail, thin trims) can't produce a readable shadow, but
  // each still costs a full draw in the sun's shadow pass — and this scene has
  // several hundred GLB meshes across enemies/props/landmarks.
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const partBox = new THREE.Box3();
  const partSize = new THREE.Vector3();
  for (const o of meshes) {
    partBox.makeEmpty().expandByObject(o);
    partBox.getSize(partSize);
    o.castShadow = Math.max(partSize.x, partSize.y, partSize.z) > maxDim * 0.12;
  }

  if (outline) addOutlines(root, { color: 0x14140e, thickness: opts.outlineThickness ?? 0.02, skip: opts.outlineSkip });

  return { meshes, emissives, box };
}

// Spike emissive intensity for a hit-flash ( EnemyBase hit feedback ).
export function flashEmissive(materials, baseIntensities, amount) {
  for (let i = 0; i < materials.length; i++) {
    materials[i].emissive = materials[i].emissive ?? new THREE.Color(0xffffff);
    materials[i].emissiveIntensity = (baseIntensities[i] ?? 0) + amount;
  }
}

// Draw-call reducer for procedural pivot rigs (hero, mushroom enemies). Under
// each node, the plain self-lit toon parts — emissive == colour at a shared
// floor intensity, front-sided, opaque, not vertex-coloured — are merged into
// ONE vertex-coloured mesh (colour baked per vertex, emissive floor follows it
// via vcolEmissive). Pivots/nodes stay put, so animation is untouched; only
// leaf meshes merge. Skipped: glow materials, parts flagged
// `userData.__outline` (outline-skipped tiny features) or `userData.noMerge`
// (meshes code animates directly), materials in `skipMats` (e.g. an enemy's
// hit-flash list), and anything under `skipRoots`.
// Call BEFORE addOutlines so each merged mesh gets one outline, not N.
const _keepAttrs = ['position', 'normal'];
export function mergeCelParts(root, { skipRoots = [], skipMats = [] } = {}) {
  const skipMat = new Set(skipMats);
  const nodes = [];
  root.traverse((o) => { if (!o.isMesh) nodes.push(o); });
  const skip = new Set();
  for (const r of skipRoots) r?.traverse((o) => skip.add(o));
  let merged = 0;
  for (const node of nodes) {
    if (skip.has(node)) continue;
    const buckets = new Map();
    for (const c of node.children) {
      const m = c.material;
      if (!c.isMesh || c.userData.__outline || c.userData.noMerge || c.children.length || skipMat.has(c.material)) continue;
      if (!m?.isMeshToonMaterial || m.transparent || m.vertexColors || m.map || m.side !== THREE.FrontSide) continue;
      if (!m.emissive.equals(m.color)) continue; // a real glow tint, not the floor
      const key = m.emissiveIntensity.toFixed(3) + '|' + c.castShadow;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(c);
    }
    for (const parts of buckets.values()) {
      if (parts.length < 2) continue;
      const geos = parts.map((c) => {
        c.updateMatrix();
        const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!_keepAttrs.includes(name)) g.deleteAttribute(name);
        g.applyMatrix4(c.matrix);
        const col = c.material.color, n = g.attributes.position.count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        return g;
      });
      const geo = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!geo) continue;
      const src = parts[0];
      const mat = toon({ color: 0xffffff, vertexColors: true, vcolEmissive: true,
        emissive: 0xffffff, emissiveIntensity: src.material.emissiveIntensity });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = src.castShadow;
      mesh.receiveShadow = parts.some((p) => p.receiveShadow);
      for (const p of parts) { node.remove(p); p.material.dispose(); }
      node.add(mesh);
      merged += parts.length - 1;
    }
  }
  return merged;
}
