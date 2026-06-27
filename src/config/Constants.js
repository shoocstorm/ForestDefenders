// Central tuning constants — sourced from docs/design/* specs.
// Keeping all magic numbers here so milestones stay data-driven and easy to verify.

export const PLAYER = {
  // Locomotion (HERO_SPEC §7 baseline was 7.0/1.7; raised for a swifter arcade feel)
  SPEED: 10.0,
  RUN_MULT: 1.8,
  JUMP_VELOCITY: 9.0,
  DOUBLE_JUMP_VELOCITY: 7.5,
  ROTATION_SPEED: 9.0,
  GRAVITY: 24.0, // tuned so 9.0 jump feels snappy (not realistic g)
  // Collider (HERO_SPEC §2)
  RADIUS: 0.3,
  HEIGHT: 0.8, // capsule body height (excluding caps)
  EYE_HEIGHT: 0.95,
  MODEL_HEIGHT: 1.05,
  // Combat / health (GAME_SPEC §3.2)
  MAX_HP: 100,
  HP_PER_LEVEL: 20,
  DAMAGE_PER_LEVEL: 0.15,
  // Melee
  KICK_DAMAGE: 30, KICK_RANGE: 1.7, KICK_COOLDOWN: 0.7,
  TAIL_DAMAGE: 28, TAIL_RANGE: 2.8, TAIL_COOLDOWN: 1.3, TAIL_IFRAMES: 0.95,
};

export const CAMERA = {
  FP: 'fp',
  TP: 'tp',
  TOP: 'top',
  FOV: 70,
  EYE_HEIGHT: 1.02, // first-person eye height above the hero's feet (clears the torso top)
  MOUSE_SENS: 0.0022,
  PITCH_MIN: -1.3,
  PITCH_MAX: 1.3,
  TP_DISTANCE: 6.0,
  TP_HEIGHT: 2.4,
  TOP_HEIGHT: 26.0,
};

// Arena (LEVELS_SPEC §3): linear corridor ~70m × 30m
export const ARENA = {
  LENGTH: 70, // along Z (player west/-Z start → enemies east/+Z)
  WIDTH: 30, // along X
  PLATFORM_HEIGHT: 3.0,
};

// Elemental weakness matrix (COMBAT_SPEC). Row = attack element, col = target element.
export const ELEMENTS = ['WOOD', 'FIRE', 'ICE', 'WATER', 'METAL', 'EARTH'];
export const ATTACK_ELEMENTS = ['PHYSICAL', 'NATURE', 'FIRE', 'ICE', 'WATER', 'ENERGY'];
export const ELEMENT_MATRIX = {
  //          WOOD FIRE ICE  WATER METAL EARTH
  PHYSICAL: [ 1.0, 1.0, 1.0, 1.0, 0.5, 1.0 ],
  NATURE:   [ 1.0, 1.0, 1.0, 1.5, 1.0, 1.5 ],
  FIRE:     [ 2.0, 0.5, 2.0, 0.5, 1.0, 1.0 ],
  ICE:      [ 1.0, 2.0, 0.5, 0.5, 1.0, 2.0 ],
  WATER:    [ 1.0, 1.5, 1.0, 0.5, 1.0, 1.5 ],
  ENERGY:   [ 1.0, 1.0, 1.0, 1.5, 1.0, 0.5 ],
};

export function elementMultiplier(attackElement, targetElement) {
  const row = ELEMENT_MATRIX[attackElement];
  if (!row) return 1.0;
  const idx = ELEMENTS.indexOf(targetElement);
  return idx < 0 ? 1.0 : row[idx];
}

// --- Weapons (WEAPONS_SPEC §2). M2 ships only the Acorn Gun. ---
export const WEAPONS = {
  ACORN: {
    name: 'Acorn Gun', element: 'NATURE', damage: 10, cooldown: 0.3,
    recoil: 0.35, projectileSpeed: 20, projectileRadius: 0.16,
    color: 0x9a6a35, muzzleColor: 0xc7e08a, automatic: true,
  },
};

// Shared camera-recoil tuning (JUICE_SPEC §2); per-weapon `recoil` scales it.
export const RECOIL = {
  PITCH: 0.14, FOV: 2.0, RETURN: 13.0,
};

// --- Enemies (ENEMIES_SPEC §2). M2 ships Wood + Fire shrooms. ---
export const ENEMY_DEFS = {
  WOOD_SHROOM: {
    type: 'WOOD_SHROOM', element: 'WOOD', role: 'melee',
    hp: 30, speed: 5.5, attackDamage: 10, attackRange: 2.6, attackCooldown: 1.5,
    detectionRange: 12, hitRadius: 0.7, accent: 0x8fe04a,
  },
  FIRE_SHROOM: {
    type: 'FIRE_SHROOM', element: 'FIRE', role: 'ranged',
    hp: 20, speed: 4.0, attackDamage: 15, attackRange: 10.0, attackCooldown: 3.0,
    detectionRange: 14, hitRadius: 0.65, accent: 0xff7a30, projectileSpeed: 12,
  },
  // Earth Shroom — L1 wave-3 boss/elite (ENEMIES_SPEC §2). Tank, ground-slam AoE.
  EARTH_SHROOM: {
    type: 'EARTH_SHROOM', element: 'EARTH', role: 'boss',
    hp: 80, speed: 3.0, attackDamage: 25, attackRange: 3.2, attackCooldown: 4.0,
    detectionRange: 16, hitRadius: 1.15, accent: 0xe0a83a, scale: 1.7,
  },
};

// --- Combat / juice tuning (COMBAT_SPEC, ENEMIES_SPEC §5, JUICE_SPEC §12). ---
export const COMBAT = {
  PLAYER_IFRAMES: 0.6,
  ENEMY_RADIUS: 0.5,        // body radius for tree/separation collision
  SEPARATION_RADIUS: 1.5,   // boids push range (ENEMIES_SPEC §3.2)
  LEVEL_SCALE: 0.15,        // (1 + 0.15*level) per campaign level
  GOLD_MIN: 1, GOLD_MAX: 5,
};

export const JUICE = {
  IMPACT_FREEZE: 0.05, IMPACT_RESTORE: 0.07,
  HIT_STOP: 0.04, HIT_STOP_DUR: 0.08,
  SLOW_MO: 0.12, SLOW_MO_DUR: 1.1,
};

// --- Level 1 wave script (LEVELS_SPEC §4). Each enemy: type from ENEMY_DEFS. ---
// `delay` = seconds after the previous wave is cleared (wave 1 = after level start).
// `animal` = the creature endangered during that wave (ANIMALS_SPEC §2).
export const LEVEL1_WAVES = [
  { delay: 3, animal: 'HEDGEHOG', spread: false,
    enemies: [['WOOD_SHROOM', 5], ['FIRE_SHROOM', 3]] },
  { delay: 5, animal: 'BIRD', spread: true,
    enemies: [['WOOD_SHROOM', 3], ['FIRE_SHROOM', 3]] },
  { delay: 5, animal: 'RABBIT', spread: true,
    enemies: [['EARTH_SHROOM', 1], ['FIRE_SHROOM', 3], ['WOOD_SHROOM', 2]] },
];

// --- Animals (ANIMALS_SPEC §2). pos in world coords; buff granted on rescue. ---
export const ANIMALS = {
  HEDGEHOG: { type: 'HEDGEHOG', hp: 50, buff: 'SHIELD', flying: false,
    pos: [3, 0, 4], cage: true, color: 0x8a6f4a },
  BIRD: { type: 'BIRD', hp: 40, buff: 'REVEAL', flying: true,
    pos: [0, 3.2, 4], cage: true, color: 0x4aa3d8 },
  RABBIT: { type: 'RABBIT', hp: 45, buff: 'SPEED', flying: false,
    pos: [-6, 0, 26], cage: true, color: 0xd8cfc4 },
};

// --- Buffs (COMBAT_SPEC §5). Rescue grants these for the level. ---
export const BUFFS = {
  SHIELD_POWER: 30,     // Hedgehog: shield points absorbed before HP
  SPEED_MULT: 1.15,     // Rabbit: +15% move speed
  // REVEAL: Bird → enemies marked on HUD (flag only)
};

// Rescue scoring (ANIMALS_SPEC §6): saved/total → rank → bonus gold.
export const RESCUE_RANKS = [
  { min: 3, rank: 'S', stars: 3, bonus: 40 },
  { min: 2, rank: 'A', stars: 2, bonus: 24 },
  { min: 1, rank: 'B', stars: 1, bonus: 10 },
  { min: 0, rank: 'C', stars: 0, bonus: 0 },
];

// --- Cinematic-cel render quality tiers + post params (LEVELS_SPEC §10). ---
// HIGH = full stack (bloom + GTAO + god-rays); LOW drops the heavy passes for 60fps.
export const QUALITY = {
  DEFAULT: 'HIGH',
  HIGH: { bloom: true, ao: true, godrays: true, bloomScale: 1.0 },
  LOW:  { bloom: true, ao: false, godrays: false, bloomScale: 0.5 },
};
export const POST = {
  BLOOM_STRENGTH: 0.9, BLOOM_RADIUS: 0.5, BLOOM_THRESHOLD: 0.0, // selective: threshold 0 (bloom layer only)
  AO_RADIUS: 0.5, AO_INTENSITY: 1.0,
  GODRAY_STRENGTH: 0.45,
};
export const BLOOM_LAYER = 1; // objects on this layer glow (boss, rings, lanterns, spores)

export const VEGETATION = { SEED: 1337 }; // deterministic procedural variation
