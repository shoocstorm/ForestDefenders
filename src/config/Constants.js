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

// --- Weapons (WEAPONS_SPEC §2–3). All 9 ship in M4; switching via Q / wheel.
// `mode` drives the firing behavior in weapons/Weapon.js. `ammo` shapes:
//   { type:'infinite' } | { type:'magazine', mag, max } |
//   { type:'overheat', perShot, cool, lockout } | { type:'energy', max, perShot, regen }
// Unlock gating (cage/shop/achievement) is deferred to M5 — all are available now. ---
export const WEAPONS = {
  ACORN: {
    id: 'ACORN', name: 'Acorn Gun', element: 'NATURE', mode: 'single',
    damage: 10, cooldown: 0.3, recoil: 0.35, automatic: true,
    projectileSpeed: 20, projectileRadius: 0.16,
    color: 0x9a6a35, muzzleColor: 0xc7e08a, ammo: { type: 'infinite' },
  },
  GANON: {
    id: 'GANON', name: 'Ganon Rifle', element: 'ENERGY', mode: 'charge',
    damage: 25, cooldown: 0.5, recoil: 0.7, automatic: false,
    projectileSpeed: 34, projectileRadius: 0.2, chargeTime: 0.7, minMult: 0.5, maxMult: 1.6,
    color: 0x49e8ff, muzzleColor: 0x49e8ff, ammo: { type: 'magazine', mag: 5, max: 15 },
  },
  MACHINE: {
    id: 'MACHINE', name: 'Machine Gun', element: 'PHYSICAL', mode: 'rapid',
    damage: 5, cooldown: 0.08, recoil: 0.16, automatic: true,
    projectileSpeed: 30, projectileRadius: 0.12, spread: 0.05,
    color: 0xffe07a, muzzleColor: 0xffb13a,
    ammo: { type: 'overheat', perShot: 5, cool: 38, lockout: 2 },
  },
  BOOM: {
    id: 'BOOM', name: 'Boomstick', element: 'FIRE', mode: 'explosive',
    damage: 40, cooldown: 1.2, recoil: 0.6, automatic: false,
    projectileSpeed: 22, projectileRadius: 0.26, explodeRadius: 3.0, knockback: 9,
    color: 0xff8a2a, muzzleColor: 0xff6a1a, ammo: { type: 'magazine', mag: 10, max: 30 },
  },
  LASER: {
    id: 'LASER', name: 'Laser Rifle', element: 'ENERGY', mode: 'beam',
    damage: 20, cooldown: 0.4, recoil: 0.3, automatic: true,
    beamRange: 40, beamTick: 0.06, penetrate: 3,
    color: 0xff3a4a, muzzleColor: 0xff3a4a, ammo: { type: 'infinite' },
  },
  SHOTGUN: {
    id: 'SHOTGUN', name: 'Scattergun', element: 'PHYSICAL', mode: 'spread',
    damage: 8, cooldown: 0.7, recoil: 0.6, automatic: false,
    projectileSpeed: 26, projectileRadius: 0.13, pellets: 6, spreadAngle: 0.18,
    color: 0xffd27a, muzzleColor: 0xffe24a, ammo: { type: 'infinite' },
  },
  FIRE_BULLET: {
    id: 'FIRE_BULLET', name: 'Fire Bullet', element: 'FIRE', mode: 'explosive',
    damage: 35, cooldown: 0.9, recoil: 0.5, automatic: false,
    projectileSpeed: 28, projectileRadius: 0.2, explodeRadius: 2.4, knockback: 6,
    color: 0xff5a2a, muzzleColor: 0xff7a2a, ammo: { type: 'magazine', mag: 20, max: 40 },
  },
  BOW: {
    id: 'BOW', name: 'Forest Bow', element: 'ENERGY', mode: 'charge',
    damage: 30, cooldown: 0.6, recoil: 0.25, automatic: false,
    projectileSpeed: 40, projectileRadius: 0.16, chargeTime: 0.8, minMult: 0.4, maxMult: 1.8, arc: 4,
    color: 0x9bff6a, muzzleColor: 0x9bff6a, ammo: { type: 'infinite' },
  },
  TOROID: {
    id: 'TOROID', name: 'Toroid Cannon', element: 'ENERGY', mode: 'ring',
    damage: 50, cooldown: 1.5, recoil: 0.5, automatic: false,
    projectileSpeed: 18, projectileRadius: 0.45, empRadius: 3.5, empDuration: 3.5, knockback: 4,
    color: 0x6ad0ff, muzzleColor: 0x6ad0ff, ammo: { type: 'energy', max: 100, perShot: 25, regen: 6 },
  },
};

// Catalog order for Q / wheel cycling (WEAPONS_SPEC §2 table order).
export const WEAPON_ORDER = ['ACORN', 'GANON', 'MACHINE', 'BOOM', 'LASER', 'SHOTGUN', 'FIRE_BULLET', 'BOW', 'TOROID'];

// Shared camera-recoil tuning (JUICE_SPEC §2); per-weapon `recoil` scales it.
export const RECOIL = {
  BACK: 0.16, UP: 0.07, PITCH: 0.14, YAW: 0.03, FOV: 2.0, RETURN: 13.0,
};

// Enemy stun (Toroid EMP, JUICE_SPEC): frozen, no AI/attacks, tinted.
export const STUN = { TINT: 0x6ad0ff };

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

// Aim assist (soft lock-on): each step the view is gently rotated so the crosshair
// settles onto the enemy nearest screen-center (within a forward cone + range), and
// the shot is fired from the muzzle straight at that enemy so it connects. The pull
// strengthens as the target nears the crosshair (sticky) and releases when you look
// away, so mouse-look stays in control.
export const AIM_ASSIST = {
  ENABLED: true,
  CONE_DEG: 16,        // half-angle of the assist cone around the camera aim ray
  RANGE: 55,           // max target distance (world units)
  TARGET_Y: 1.0,       // aim height above an enemy's foot position (torso)
  PULL_MIN: 4,         // crosshair pull (damp λ) at the cone edge
  PULL_MAX: 16,        // crosshair pull (damp λ) dead-centre (firm lock)
  RETICLE_DIST: 40,    // reticle distance down the aim ray when no enemy is locked
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

// Instant reward when an animal is freed: gold + HP healed (on top of its buff).
// Per-animal overrides via ANIMALS.*.rewardGold / rewardHp.
export const RESCUE_REWARD = { GOLD: 15, HP: 25 };

// Rescue scoring (ANIMALS_SPEC §6): saved/total → rank → bonus gold.
export const RESCUE_RANKS = [
  { min: 3, rank: 'S', stars: 3, bonus: 40 },
  { min: 2, rank: 'A', stars: 2, bonus: 24 },
  { min: 1, rank: 'B', stars: 1, bonus: 10 },
  { min: 0, rank: 'C', stars: 0, bonus: 0 },
];

// ===========================================================================
// M5 — Economy, shop, achievements, weapon unlocks, plants (ECONOMY_SHOP_SPEC,
// PLANTS_SPEC). All meta-progression numbers live here so save/shop stay data-driven.
// ===========================================================================

// Gold economy (ECONOMY_SHOP_SPEC §1).
export const ECONOMY = {
  STARTING_GOLD: 50,        // new game starts with enough for 1–2 items
  LEVEL_CLEAR_GOLD: 30,     // base reward on a level win (rescue bonus added on top)
};

// Permanent upgrades (ECONOMY_SHOP_SPEC §2.1) — max 5 tiers each, escalating prices.
export const UPGRADE_MAX_TIER = 5;
export const UPGRADES = {
  DAMAGE: { id: 'DAMAGE', name: 'Sharpened Tips', desc: '+12% damage', icon: '🗡', per: 0.12, prices: [40, 70, 110, 160, 230] },
  HP:     { id: 'HP', name: 'Tough Hide', desc: '+25 max HP', icon: '🛡', per: 25, prices: [35, 60, 95, 140, 200] },
  SPEED:  { id: 'SPEED', name: 'Fleet Footed', desc: '+7% move speed', icon: '👟', per: 0.07, prices: [45, 80, 120, 175, 250] },
};
export const UPGRADE_ORDER = ['DAMAGE', 'HP', 'SPEED'];

// One-shot consumables (ECONOMY_SHOP_SPEC §2.2). `effect` is interpreted by
// GameManager.applyConsumable: heal / shield / speedStep / tailGuard / fireRounds /
// ammo:{weapon,amount}.
export const CONSUMABLES = [
  { id: 'HEALTH_PACK', name: 'Health Pack', icon: '❤', price: 20, desc: 'Heal 40 HP', cat: 'Supplies', effect: { heal: 40 } },
  { id: 'SHIELD_CHARGE', name: 'Shield Charge', icon: '🛡', price: 25, desc: '+30 shield power', cat: 'Supplies', effect: { shield: 30 } },
  { id: 'AMMO_PACK', name: 'Ammo Pack', icon: '🔋', price: 15, desc: '+5 Ganon ammo', cat: 'Supplies', effect: { ammo: { weapon: 'GANON', amount: 5 } } },
  { id: 'BOOM_AMMO', name: 'Boom Ammo', icon: '💥', price: 30, desc: '+3 Boomstick ammo', cat: 'Supplies', effect: { ammo: { weapon: 'BOOM', amount: 3 } } },
  { id: 'FIRE_BULLET_PACK', name: 'Fire Bullet Pack', icon: '🔥', price: 90, desc: '+3 Fire Bullet ammo', cat: 'Supplies', effect: { ammo: { weapon: 'FIRE_BULLET', amount: 3 } } },
  { id: 'FIRE_ROUNDS', name: 'Fire Rounds', icon: '🔥', price: 25, desc: '10 shots with fire element', cat: 'Supplies', effect: { fireRounds: 10 } },
  { id: 'TAIL_GUARD', name: 'Tail Guard Fruit', icon: '🌀', price: 55, desc: '60s auto tail-swing', cat: 'Hero', effect: { tailGuard: 60 } },
  { id: 'SPEED_BOOST', name: 'Speed Boost', icon: '⚡', price: 45, desc: '+15% move speed (run)', cat: 'Hero', effect: { speedStep: 0.15 } },
];

// Weapons available from the start; the rest are gated (ECONOMY_SHOP_SPEC §3).
export const DEFAULT_WEAPON_UNLOCKS = ['ACORN', 'GANON'];

// How each gated weapon is earned (mirrors ECONOMY_SHOP_SPEC §3). Wiring lives in
// Game (cage/bird/all-animals/multi-kill) + Shop (purchase).
export const WEAPON_UNLOCK_HINTS = {
  MACHINE: 'Rescue an animal in Level 1',
  BOOM: 'Cage reward — Level 2',
  LASER: 'Buy in the shop',
  SHOTGUN: 'Score a 3+ multi-kill',
  FIRE_BULLET: 'Rescue every animal in Level 1',
  BOW: 'Hidden cage — Level 3',
  TOROID: 'Rescue the Bird in Level 1',
};

// Laser is the only shop-purchasable weapon unlock (ECONOMY_SHOP_SPEC §3).
export const SHOP_WEAPONS = [
  { id: 'LASER', name: 'Laser Rifle', icon: '🔺', price: 180, desc: 'Penetrating energy beam', cat: 'Weapons' },
];

// Achievement catalog (ECONOMY_SHOP_SPEC §4). `metric` + `goal` drive evaluation
// against GameManager counters; multi/boss are event-driven.
export const ACHIEVEMENTS = [
  { id: 'pest_control', name: 'Pest Control', desc: 'Defeat 50 enemies', icon: '🍄', color: '#9fe35a', metric: 'enemiesDefeatedTotal', goal: 50 },
  { id: 'menagerie', name: 'Menagerie', desc: 'Rescue 10 animals', icon: '🐾', color: '#7fe0a0', metric: 'rescuedAnimalsTotal', goal: 10 },
  { id: 'treasure', name: 'Treasure Hunter', desc: 'Collect 300 gold', icon: '💰', color: '#ffd24a', metric: 'goldCollectedTotal', goal: 300 },
  { id: 'sharpshooter', name: 'Sharpshooter', desc: '200 accurate shots', icon: '🎯', color: '#ff7a4a', metric: 'accurateShots', goal: 200 },
  { id: 'sanctuary', name: 'Sanctuary', desc: 'Rescue 25 animals', icon: '🏵', color: '#9fe8c0', metric: 'rescuedAnimalsTotal', goal: 25 },
  { id: 'big_spender', name: 'Big Spender', desc: 'Spend 500 gold', icon: '🛒', color: '#ffb13a', metric: 'goldSpentTotal', goal: 500 },
  { id: 'dragons_hoard', name: "Dragon's Hoard", desc: 'Collect 600 gold', icon: '🐉', color: '#ffd24a', metric: 'goldCollectedTotal', goal: 600 },
  { id: 'boss_hunter', name: 'Boss Hunter', desc: 'Defeat 3 bosses', icon: '👹', color: '#ff5a4a', metric: 'bossesDefeated', goal: 3 },
  { id: 'combo_king', name: 'Combo King', desc: '5 multi-kills', icon: '💫', color: '#b48aff', metric: 'multiKills', goal: 5 },
];

// Level-up gates (ECONOMY_SHOP_SPEC §5): earned on a flawless rescue clear.
export const LEVEL_UP = { HP_PER_LEVEL: 20, DAMAGE_PER_LEVEL: 0.15, HP_THRESHOLD: 0.5 };

// --- Interactive plants (PLANTS_SPEC §1). `interact`: how it's triggered;
// `effect` is dispatched by PlantManager → Player/GameManager. ---
export const PLANTS = {
  BOUNCE: { id: 'BOUNCE', name: 'Bounce Fruit', label: 'BOUNCE', interact: 'touch', respawn: 30,
    color: 0x3a6aff, glow: 0x6a9bff, radius: 0.55, effect: { bounce: 13, doubleJump: true } },
  VITALITY: { id: 'VITALITY', name: 'Vitality Berry Bush', label: 'HEAL', interact: 'both', respawn: 30,
    color: 0xd83040, glow: 0xff5a6a, radius: 0.7, effect: { heal: 25 } },
  TAIL_GUARD: { id: 'TAIL_GUARD', name: 'Tail Guard Fruit', label: 'TAIL GUARD', interact: 'touch', respawn: 45,
    color: 0xcfe04a, glow: 0x9bff6a, radius: 0.5, effect: { tailGuard: 60 } },
  OAKSHIELD: { id: 'OAKSHIELD', name: 'Oakshield Moss', label: 'SHIELD', interact: 'touch', respawn: 40,
    color: 0xdcc23a, glow: 0xffe08a, radius: 0.6, effect: { hitShield: 2 } },
  FLAME_CHILI: { id: 'FLAME_CHILI', name: 'Flame Chili Fern', label: 'FIRE ROUNDS', interact: 'both', respawn: 35,
    color: 0xff3a2a, glow: 0xff7a2a, radius: 0.55, effect: { fireRounds: 10 } },
};

// Level 1 plant placement (PLANTS_SPEC §3). The Bird sits on the central platform
// (z≈4); Bounce Fruit is at its foot. Two berry bushes flank mid-map for the hurt.
export const PLANT_PLACEMENT = [
  { type: 'VITALITY', pos: [9, 0, -8] },
  { type: 'VITALITY', pos: [-9, 0, 12] },
  { type: 'BOUNCE', pos: [4, 0, -1] },
  { type: 'TAIL_GUARD', pos: [-5, 0, 5] },
  { type: 'OAKSHIELD', pos: [-7.6, 1.3, 4] },   // clings to the west ancient tree
  { type: 'FLAME_CHILI', pos: [6, 0, -16] },
];

// Tail Guard auto-swing tuning (PLANTS_SPEC §1 Tail Guard).
export const TAIL_GUARD = { RANGE: 3.4, WARN_TIME: 5 };

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
