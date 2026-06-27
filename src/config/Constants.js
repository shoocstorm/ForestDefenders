// Central tuning constants — sourced from docs/design/* specs.
// Keeping all magic numbers here so milestones stay data-driven and easy to verify.

export const PLAYER = {
  // Locomotion (HERO_SPEC §7)
  SPEED: 7.0,
  RUN_MULT: 1.7,
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
