import * as THREE from 'three';
import { clone, clips, findNode } from '../../core/Assets.js';
import { buildProceduralMushroom } from './ProceduralMushroom.js';

// Mutant mushroom enemies (ENEMIES_SPEC §2/§9). Wood/boss/glow clone their
// authored GLB; Fire & Earth are built procedurally (their GLBs were >2MB each)
// — see ProceduralMushroom.js. Both paths run clips (idle/walk/hit/attack/dying)
// through an AnimationMixer and expose the same { group, capPivot, emissives,
// mixer, actions } shape EnemyBase expects.
//
// The GLB models are normalized to a per-type gameplay height with feet at y=0,
// and face the player's -Z game-forward convention (180° Y flip) so the existing
// facing-yaw math in EnemyBase is unchanged.

// All six elemental enemies use the procedural builder (one consistent chibi
// sculpt). Wood moved off its GLB so it matches the other five.
const PROCEDURAL = new Set(['WOOD_SHROOM', 'FIRE_SHROOM', 'EARTH_SHROOM', 'WATER_SHROOM', 'ICE_SHROOM', 'METAL_SHROOM']);

const TYPE = {
  BOSS_SHROOM:  { asset: 'bossShroom', height: 2.6 },
  GLOW_SHROOM:  { asset: 'glowShroom', height: 1.0 },
};

export function buildMushroom(type) {
  if (PROCEDURAL.has(type)) return buildProceduralMushroom(type);

  const cfg = TYPE[type] || TYPE.GLOW_SHROOM;
  const group = clone(cfg.asset);

  // Normalize: feet at y=0, target height, face -Z.
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3(); box.getSize(size);
  const s = cfg.height / Math.max(0.001, size.y);
  group.scale.setScalar(s);
  group.position.y = -box.min.y * s;
  group.rotation.y = Math.PI;

  // AnimationMixer over the model's authored clips (bind by node name on the clone).
  const mixer = new THREE.AnimationMixer(group);
  const actions = {};
  for (const clip of clips(cfg.asset)) {
    const a = mixer.clipAction(clip);
    actions[clip.name] = a;
    if (clip.name === 'idle' || clip.name === 'walk') a.setLoop(THREE.LoopRepeat, Infinity);
  }
  if (actions.idle) actions.idle.play();
  mixer._curName = 'idle';

  // capPivot: the Cap node (used by the procedural-bob fallback when no clip).
  const capPivot = findNode(group, 'Cap') || null;
  if (capPivot) capPivot.userData.baseY = capPivot.position.y;

  // The GLB ships two overlapping eye node sets (normal round eyes + an
  // alternate "X-eyes" dizzy variant) at the same spot on the face — nothing
  // ever toggles between them, so hide the alternate one to avoid a doubled-up
  // black-circle-plus-X-marks look.
  const altEyes = findNode(group, 'EyesX');
  if (altEyes) altEyes.visible = false;

  // Collect emissive materials (EnemyBase spikes these white on hit).
  const emissives = [];
  group.traverse((o) => {
    if (o.isMesh && o.material && (o.material.emissiveIntensity ?? 0) > 0.01) emissives.push(o.material);
  });

  // GLB path clones a cached master scene (see Assets.js) — geometry/materials
  // are shared across every clone of this asset, so the caller must NOT dispose
  // them when this enemy dies (ownsMaterials: false).
  return { group, capPivot, emissives, mixer, actions, ownsMaterials: false };
}
