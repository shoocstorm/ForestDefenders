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
  KICK_DAMAGE: 40, KICK_RANGE: 3.0, KICK_COOLDOWN: 0.7,
  KICK_LUNGE_SPEED: 16, KICK_JUMP_VELOCITY: 8, KICK_KNOCKBACK: 35, // Jump kick: lunge forward, launch up, send enemies flying
  TAIL_DAMAGE: 14, TAIL_RANGE: 4.0, TAIL_COOLDOWN: 0.8, TAIL_IFRAMES: 0.7, // Wider 360° sweep — clears crowders
};

export const CAMERA = {
  FP: 'fp',
  TP: 'tp',
  TOP: 'top',
  FOV: 70,
  EYE_HEIGHT: 1.02, // first-person eye height above the hero's feet (clears the torso top)
  FP_BACK: 1.6,     // pull the FP eye back behind the head so the hero stays in view
  FP_LIFT: 0.5,     // raise the FP eye so it looks over the head, not into it
  FP_SHOULDER: 0.7, // lateral FP offset so the muzzle plume fires down an empty lane
  MOUSE_SENS: 0.0022,
  PITCH_MIN: -1.3,
  PITCH_MAX: 1.3,
  TP_DISTANCE: 7.0,
  TP_HEIGHT: 3.1,
  TP_SHOULDER: 1.1, // lateral over-shoulder offset (keeps muzzle plume out of centre)
  TOP_HEIGHT: 52.0, // [2x] raised so the top-down camera frames the doubled arena
};

// Arena (LEVELS_SPEC §3): linear corridor — doubled to ~140m × 60m for a vaster
// battlefield. All world systems (ground, bounds, spawns, lanterns, vegetation,
// scatter props, fireflies) read these, so changing them scales the whole scene.
export const ARENA = {
  LENGTH: 140, // along Z (player west/-Z start → enemies east/+Z)
  WIDTH: 60, // along X
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

// --- Weapons (WEAPONS_SPEC §2–3). All 9 ship in M4; switching via number keys 1-9 / Q.
// `mode` drives the firing behavior in weapons/Weapon.js. `ammo` shapes:
//   { type:'infinite' } | { type:'magazine', mag, max } |
//   { type:'overheat', perShot, cool, lockout } | { type:'energy', max, perShot, regen }
// Unlock gating (cage/shop/achievement) is deferred to M5 — all are available now. ---
export const WEAPONS = {
  ACORN: {
    id: 'ACORN', name: 'Acorn Gun', element: 'NATURE', mode: 'single',
    damage: 10, cooldown: 0.3, recoil: 0.35, automatic: true,
    projectileSpeed: 34, projectileRadius: 0.16, bullet: 'acorn',
    color: 0x9a6a35, muzzleColor: 0xc7e08a, ammo: { type: 'infinite' },
  },
  GANON: {
    id: 'GANON', name: 'Ganon Rifle', element: 'ENERGY', mode: 'charge',
    damage: 25, cooldown: 0.5, recoil: 0.7, automatic: false,
    projectileSpeed: 52, projectileRadius: 0.2, chargeTime: 0.7, minMult: 0.5, maxMult: 1.6, bullet: 'shard',
    color: 0x49e8ff, muzzleColor: 0x49e8ff, ammo: { type: 'magazine', mag: 5, max: 15 },
  },
  MACHINE: {
    id: 'MACHINE', name: 'Machine Gun', element: 'PHYSICAL', mode: 'rapid',
    damage: 5, cooldown: 0.08, recoil: 0.16, automatic: true,
    projectileSpeed: 48, projectileRadius: 0.12, spread: 0.05, bullet: 'tracer',
    color: 0xffe07a, muzzleColor: 0xffb13a,
    // Tolerant overheat: 3 heat/shot ≈ 33 shots (~2.7s) of sustained fire from
    // cold (was 20 / ~1.6s); cools at 55/s once released (full vent ≈ 1.8s);
    // a 1.25s lockout if you do max it out (was 2s).
    ammo: { type: 'overheat', perShot: 3, cool: 55, lockout: 1.25 },
  },
  BOOM: {
    id: 'BOOM', name: 'Boomstick', element: 'FIRE', mode: 'explosive',
    damage: 40, cooldown: 1.2, recoil: 0.6, automatic: false,
    projectileSpeed: 36, projectileRadius: 0.26, explodeRadius: 3.0, knockback: 9, bullet: 'fire',
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
    projectileSpeed: 42, projectileRadius: 0.13, pellets: 6, spreadAngle: 0.18, bullet: 'pellet',
    color: 0xffd27a, muzzleColor: 0xffe24a, ammo: { type: 'infinite' },
  },
  FIRE_BULLET: {
    id: 'FIRE_BULLET', name: 'Fire Bullet', element: 'FIRE', mode: 'explosive',
    damage: 35, cooldown: 0.9, recoil: 0.5, automatic: false,
    projectileSpeed: 44, projectileRadius: 0.2, explodeRadius: 2.4, knockback: 6, bullet: 'fire',
    color: 0xff5a2a, muzzleColor: 0xff7a2a, ammo: { type: 'magazine', mag: 20, max: 40 },
  },
  BOW: {
    id: 'BOW', name: 'Forest Bow', element: 'ENERGY', mode: 'charge',
    damage: 30, cooldown: 0.6, recoil: 0.25, automatic: false,
    projectileSpeed: 60, projectileRadius: 0.16, chargeTime: 0.8, minMult: 0.4, maxMult: 1.8, arc: 4, bullet: 'arrow',
    color: 0x9bff6a, muzzleColor: 0x9bff6a, ammo: { type: 'infinite' },
  },
  TOROID: {
    id: 'TOROID', name: 'Toroid Cannon', element: 'ENERGY', mode: 'ring',
    damage: 50, cooldown: 1.5, recoil: 0.5, automatic: false,
    projectileSpeed: 30, projectileRadius: 0.45, empRadius: 3.5, empDuration: 3.5, knockback: 4, bullet: 'ring',
    color: 0x6ad0ff, muzzleColor: 0x6ad0ff, ammo: { type: 'energy', max: 100, perShot: 25, regen: 6 },
  },
};

// Catalog order for 1-9 selection / Q cycling (WEAPONS_SPEC §2 table order).
export const WEAPON_ORDER = ['ACORN', 'GANON', 'MACHINE', 'BOOM', 'LASER', 'SHOTGUN', 'FIRE_BULLET', 'BOW', 'TOROID'];

// Shared camera-recoil tuning (JUICE_SPEC §2); per-weapon `recoil` scales it.
export const RECOIL = {
  BACK: 0.02, UP: 0.01, PITCH: 0.001, YAW: 0.001, FOV: 0.1, RETURN: 18.0,
};

// Enemy stun (Toroid EMP, JUICE_SPEC): frozen, no AI/attacks, tinted.
export const STUN = { TINT: 0x6ad0ff };

// --- Enemies (ENEMIES_SPEC §2). M2 ships Wood + Fire shrooms. ---
export const ENEMY_DEFS = {
  WOOD_SHROOM: {
    type: 'WOOD_SHROOM', name: 'Wood Shroom', element: 'WOOD', role: 'melee',
    blurb: 'Melee brute that charges in packs — the forest’s front line.',
    hp: 30, speed: 5.5, attackDamage: 10, attackRange: 2.6, attackCooldown: 1.5,
    detectionRange: 12, hitRadius: 0.7, accent: 0x8fe04a,
  },
  FIRE_SHROOM: {
    type: 'FIRE_SHROOM', name: 'Fire Shroom', element: 'FIRE', role: 'ranged',
    blurb: 'Ranged lobber that arcs fireballs from a distance.',
    hp: 20, speed: 4.0, attackDamage: 15, attackRange: 10.0, attackCooldown: 3.0,
    detectionRange: 14, hitRadius: 0.65, accent: 0xff7a30, projectileSpeed: 12,
  },
  // Earth Shroom — L1 wave-3 boss/elite (ENEMIES_SPEC §2). Tank, ground-slam AoE.
  EARTH_SHROOM: {
    type: 'EARTH_SHROOM', name: 'Earth Shroom', element: 'EARTH', role: 'boss',
    blurb: 'Level 1’s boss — a lumbering tank with a ground-slam AoE.',
    hp: 80, speed: 3.0, attackDamage: 25, attackRange: 3.2, attackCooldown: 4.0,
    detectionRange: 16, hitRadius: 1.15, accent: 0xe0a83a, scale: 1.7,
  },
  // Water Shroom (L2) — controller: water jet pushes the player/animals back.
  WATER_SHROOM: {
    type: 'WATER_SHROOM', name: 'Water Shroom', element: 'WATER', role: 'ranged',
    blurb: 'Ranged controller whose jet blasts knock you back.',
    hp: 25, speed: 3.5, attackDamage: 8, attackRange: 9.0, attackCooldown: 2.5,
    detectionRange: 13, hitRadius: 0.68, accent: 0x4ac8e8, projectileSpeed: 14,
    knockback: 7,
  },
  // Ice Shroom (L2) — ranged icicle shot; FIRE-vulnerable, ICE-resistant.
  ICE_SHROOM: {
    type: 'ICE_SHROOM', name: 'Ice Shroom', element: 'ICE', role: 'ranged',
    blurb: 'Ranged shooter — fire melts it, but its icicles bite hard.',
    hp: 22, speed: 3.8, attackDamage: 12, attackRange: 10.0, attackCooldown: 3.0,
    detectionRange: 14, hitRadius: 0.65, accent: 0x9fd8ff, projectileSpeed: 16,
  },
  // Metal Shroom (L3) — tank: resists PHYSICAL (0.5×), high HP, spike shot.
  METAL_SHROOM: {
    type: 'METAL_SHROOM', name: 'Metal Shroom', element: 'METAL', role: 'melee',
    blurb: 'Armored melee tank, highly resistant to physical hits.',
    hp: 45, speed: 2.5, attackDamage: 14, attackRange: 2.8, attackCooldown: 1.8,
    detectionRange: 11, hitRadius: 0.85, accent: 0xb0b8c0, scale: 1.15,
  },
};

// Catalog order for the Gallery's Enemies tab (mirrors WEAPON_ORDER).
export const ENEMY_ORDER = ['WOOD_SHROOM', 'FIRE_SHROOM', 'EARTH_SHROOM', 'WATER_SHROOM', 'ICE_SHROOM', 'METAL_SHROOM'];

// Where each enemy type first appears (LEVEL1/2/3_WAVES below) — shown on its
// locked Gallery entry until GameManager.markEnemySeen() has fired for it.
export const ENEMY_FIRST_SEEN_HINTS = {
  WOOD_SHROOM: 'Level 1',
  FIRE_SHROOM: 'Level 1',
  EARTH_SHROOM: 'Level 1 · Wave 3 (Boss)',
  WATER_SHROOM: 'Level 2',
  ICE_SHROOM: 'Level 2',
  METAL_SHROOM: 'Level 2',
};

// --- Combat / juice tuning (COMBAT_SPEC, ENEMIES_SPEC §5, JUICE_SPEC §12). ---
export const COMBAT = {
  PLAYER_IFRAMES: 0.6,
  ENEMY_RADIUS: 0.5,        // body radius for tree/separation collision
  SEPARATION_RADIUS: 1.5,   // boids push range (ENEMIES_SPEC §3.2)
  LEVEL_SCALE: 0.15,        // (1 + 0.15*level) per campaign level
  GOLD_MIN: 1, GOLD_MAX: 5,
};

// --- Adaptive difficulty Director (subtle, assistive). Reads live player
// performance and nudges a single `intensity` scalar (centered on 1.0 =
// current balance), which feeds wave size, spawn pacing, and enemy aggression.
// Tuned to relieve quickly and ramp gently so the hand on the dial stays unseen.
export const DIRECTOR = {
  INTENSITY_MIN: 0.7, INTENSITY_MAX: 1.3,   // clamp bounds for the smoothed scalar
  EASE_LAMBDA: 2.2,   // fast damp toward a LOWER target (relief after a near-death)
  RAMP_LAMBDA: 0.45,  // slow damp toward a HIGHER target (gentle ramp when dominating)
  NEAR_DEATH_HP: 0.25,    // HP fraction below which we ease off hard
  COMFORT_HP: 0.85,       // HP fraction above which (with momentum) we ramp up
  FAST_CLEAR_SEC: 12,     // clearing a wave faster than this counts as dominating
  SLOW_CLEAR_SEC: 30,     // taking longer than this nudges intensity down
  DAMAGE_EASE: 0.18,      // per-point-of-HP-lost downward pull on the target (scaled)
  // Output mappings from intensity → system multipliers (all bounded).
  SPAWN_COUNT_MIN: 0.7, SPAWN_COUNT_MAX: 1.3,   // per-type count scale (floored separately)
  SPAWN_DELAY_MIN: 0.85, SPAWN_DELAY_MAX: 1.4,  // prewave delay scale (more rest when low)
  AGGRO_MIN: 0.85, AGGRO_MAX: 1.15,             // enemy attack cadence + approach commitment
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

// --- Level 2 wave script (Ember Hollow). More enemies, faster spawns, adds ---
// Water + Ice shrooms. `delay` shrinks vs L1; stat scaling via campaign level 1.
export const LEVEL2_WAVES = [
  { delay: 2.5, animal: 'HEDGEHOG', spread: true,
    enemies: [['FIRE_SHROOM', 4], ['WATER_SHROOM', 3], ['WOOD_SHROOM', 3]] },
  { delay: 4, animal: 'BIRD', spread: true,
    enemies: [['FIRE_SHROOM', 4], ['ICE_SHROOM', 3], ['METAL_SHROOM', 1]] },
  { delay: 4, animal: 'RABBIT', spread: true,
    enemies: [['EARTH_SHROOM', 1], ['ICE_SHROOM', 3], ['FIRE_SHROOM', 4], ['WATER_SHROOM', 2]] },
];

// --- Level 3 wave script (Ancient Grove). Climactic — heaviest mix, Metal ---
// tanks, multiple boss-grade adds. Stat scaling via campaign level 2.
export const LEVEL3_WAVES = [
  { delay: 2, animal: 'HEDGEHOG', spread: true,
    enemies: [['ICE_SHROOM', 4], ['METAL_SHROOM', 2], ['WATER_SHROOM', 3], ['FIRE_SHROOM', 2]] },
  { delay: 3.5, animal: 'BIRD', spread: true,
    enemies: [['METAL_SHROOM', 3], ['ICE_SHROOM', 3], ['FIRE_SHROOM', 3], ['EARTH_SHROOM', 1]] },
  { delay: 3.5, animal: 'RABBIT', spread: true,
    enemies: [['EARTH_SHROOM', 2], ['METAL_SHROOM', 3], ['ICE_SHROOM', 3], ['FIRE_SHROOM', 3], ['WATER_SHROOM', 2]] },
];

// --- Animals (ANIMALS_SPEC §2). pos in world coords; buff granted on rescue. ---
export const ANIMALS = {
  HEDGEHOG: { type: 'HEDGEHOG', hp: 50, buff: 'SHIELD', flying: false,
    pos: [9, 0, 4], cage: true, color: 0x8a6f4a },
  BIRD: { type: 'BIRD', hp: 40, buff: 'REVEAL', flying: true,
    // Front of the deck, between the stair head and the power tower (deck centre
    // z=4 is the tower's footprint/collider — see Arena._platform).
    pos: [0, 3.2, 1.2], cage: true, color: 0x4aa3d8 },
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
  DAMAGE: { id: 'DAMAGE', name: 'Sharpened Tips', desc: '+12% damage', icon: 'crossed-swords', per: 0.12, prices: [40, 70, 110, 160, 230] },
  HP:     { id: 'HP', name: 'Tough Hide', desc: '+25 max HP', icon: 'bell-shield', per: 25, prices: [35, 60, 95, 140, 200] },
  SPEED:  { id: 'SPEED', name: 'Fleet Footed', desc: '+7% move speed', icon: 'run', per: 0.07, prices: [45, 80, 120, 175, 250] },
};
export const UPGRADE_ORDER = ['DAMAGE', 'HP', 'SPEED'];

// One-shot consumables (ECONOMY_SHOP_SPEC §2.2). `effect` is interpreted by
// GameManager.applyConsumable: heal / shield / speedStep / tailGuard / fireRounds /
// ammo:{weapon,amount}.
export const CONSUMABLES = [
  { id: 'HEALTH_PACK', name: 'Health Pack', icon: 'hearts', price: 20, desc: 'Heal 40 HP', cat: 'Supplies', effect: { heal: 40 } },
  { id: 'SHIELD_CHARGE', name: 'Shield Charge', icon: 'bell-shield', price: 25, desc: '+30 shield power', cat: 'Supplies', effect: { shield: 30 } },
  { id: 'AMMO_PACK', name: 'Ammo Pack', icon: 'ammo-box', price: 15, desc: '+5 Ganon ammo', cat: 'Supplies', effect: { ammo: { weapon: 'GANON', amount: 5 } } },
  { id: 'BOOM_AMMO', name: 'Boom Ammo', icon: 'spiky-explosion', price: 30, desc: '+3 Boomstick ammo', cat: 'Supplies', effect: { ammo: { weapon: 'BOOM', amount: 3 } } },
  { id: 'FIRE_BULLET_PACK', name: 'Fire Bullet Pack', icon: 'fire-silhouette', price: 90, desc: '+3 Fire Bullet ammo', cat: 'Supplies', effect: { ammo: { weapon: 'FIRE_BULLET', amount: 3 } } },
  { id: 'FIRE_ROUNDS', name: 'Fire Rounds', icon: 'fire-silhouette', price: 25, desc: '10 shots with fire element', cat: 'Supplies', effect: { fireRounds: 10 } },
  { id: 'TAIL_GUARD', name: 'Tail Guard Fruit', icon: 'fox-tail', price: 55, desc: '60s auto tail-swing', cat: 'Hero', effect: { tailGuard: 60 } },
  { id: 'SPEED_BOOST', name: 'Speed Boost', icon: 'run', price: 45, desc: '+15% move speed (run)', cat: 'Hero', effect: { speedStep: 0.15 } },
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
  { id: 'LASER', name: 'Laser Rifle', icon: 'pistol-gun', price: 180, desc: 'Penetrating energy beam', cat: 'Weapons' },
];

// Achievement catalog (ECONOMY_SHOP_SPEC §4). `metric` + `goal` drive evaluation
// against GameManager counters; multi/boss are event-driven.
export const ACHIEVEMENTS = [
  { id: 'pest_control', name: 'Pest Control', desc: 'Defeat 50 enemies', icon: 'mushroom', color: '#9fe35a', metric: 'enemiesDefeatedTotal', goal: 50 },
  { id: 'menagerie', name: 'Menagerie', desc: 'Rescue 10 animals', icon: 'paw-print', color: '#7fe0a0', metric: 'rescuedAnimalsTotal', goal: 10 },
  { id: 'treasure', name: 'Treasure Hunter', desc: 'Collect 300 gold', icon: 'credits-currency', color: '#ffd24a', metric: 'goldCollectedTotal', goal: 300 },
  { id: 'sharpshooter', name: 'Sharpshooter', desc: '200 accurate shots', icon: 'archery-target', color: '#ff7a4a', metric: 'accurateShots', goal: 200 },
  { id: 'sanctuary', name: 'Sanctuary', desc: 'Rescue 25 animals', icon: 'flower-emblem', color: '#9fe8c0', metric: 'rescuedAnimalsTotal', goal: 25 },
  { id: 'big_spender', name: 'Big Spender', desc: 'Spend 500 gold', icon: 'shopping-cart', color: '#ffb13a', metric: 'goldSpentTotal', goal: 500 },
  { id: 'dragons_hoard', name: "Dragon's Hoard", desc: 'Collect 600 gold', icon: 'credits-currency', color: '#ffd24a', metric: 'goldCollectedTotal', goal: 600 },
  { id: 'boss_hunter', name: 'Boss Hunter', desc: 'Defeat 3 bosses', icon: 'minotaur', color: '#ff5a4a', metric: 'bossesDefeated', goal: 3 },
  { id: 'combo_king', name: 'Combo King', desc: '5 multi-kills', icon: 'moebius-star', color: '#b48aff', metric: 'multiKills', goal: 5 },
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
// (z≈4); Bounce Fruit hugs the platform's west edge (deck edge x≈-5.1) as an
// alternate vault route up, opposite the front stairs (z≈-1..-5 at x≈0). Two
// berry bushes flank mid-map for the hurt.
export const PLANT_PLACEMENT = [
  { type: 'VITALITY', pos: [9, 0, -8] },
  { type: 'VITALITY', pos: [-9, 0, 12] },
  { type: 'BOUNCE', pos: [-8, 0, 8] },
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
  // msaa: multisample count for the final composer's render targets. The
  // renderer's canvas antialias is dead while the post stack is active (all
  // geometry renders into composer targets, not the canvas), so MSAA has to be
  // set on the targets themselves — without it every crisp cel edge aliases.
  HIGH: { bloom: true, ao: true, godrays: true, bloomScale: 1.0, msaa: 4,
          polish: { vignette: 0.32, grain: 0.045, saturation: 1.06, contrast: 1.04 } },
  LOW:  { bloom: true, ao: false, godrays: false, bloomScale: 0.5, msaa: 0,
          polish: { vignette: 0.28, grain: 0.030, saturation: 1.04, contrast: 1.02 } },
};
export const POST = {
  BLOOM_STRENGTH: 0.9, BLOOM_RADIUS: 0.5, BLOOM_THRESHOLD: 0.0, // selective: threshold 0 (bloom layer only)
  AO_RADIUS: 0.5, AO_INTENSITY: 1.0,
  GODRAY_STRENGTH: 0.45,
};
// GTAO is the single heaviest pass on mobile GPUs. This player-facing tier lets
// users render it at reduced resolution (LOW) or drop it entirely (OFF) to claw
// back FPS, independent of the global HIGH/LOW quality toggle. `scale` is the
// linear resolution multiplier applied to the GTAO render targets.
export const AO_QUALITY = {
  DEFAULT: 'HIGH',
  ORDER: ['HIGH', 'LOW', 'OFF'], // cycle order for the Settings toggle
  HIGH: { enabled: true,  scale: 1.0,  label: 'High' },
  LOW:  { enabled: true,  scale: 0.5,  label: 'Low'  }, // quarter the AO pixels
  OFF:  { enabled: false, scale: 1.0,  label: 'Off'  },
};

// Player-facing graphics preset (Settings → Graphics). One lever drives every
// dominant mobile-FPS cost at once, because GTAO alone is not enough on phones:
//   - pixelRatio: the cap passed to renderer.setPixelRatio. Pixel count scales
//     with its square, so 2.0 → 1.0 is ~4× fewer fragments on a DPR-3 phone —
//     the single biggest win.
//   - post: 'full' runs the bloom+GTAO+ACES composer stack; 'none' bypasses it
//     for one direct scene render (kills a whole extra scene pass + bloom mips).
//   - ao: which AO_QUALITY tier the GTAO pass uses when post is 'full'.
//   - shadowMap: sun shadow-map resolution (4096² PCF-soft is very costly on mobile).
export const GRAPHICS = {
  DEFAULT: 'HIGH',
  ORDER: ['HIGH', 'BALANCED', 'PERFORMANCE'], // cycle order for the Settings toggle
  // High caps at 1.5× (was 2×): with 4× MSAA on the composer targets the edge
  // quality is near-identical, and every pass (lighting, post) costs ~44% less
  // on retina laptops — 2× was the main reason the fans spun up.
  HIGH:        { label: 'High',        pixelRatio: 1.5, post: 'full', ao: 'HIGH', shadowMap: 4096 },
  BALANCED:    { label: 'Balanced',    pixelRatio: 1.5, post: 'full', ao: 'LOW',  shadowMap: 2048 },
  PERFORMANCE: { label: 'Performance', pixelRatio: 1,   post: 'none', ao: 'OFF',  shadowMap: 1024 },
};
// Render frame cap (fps). The sim is a fixed 60Hz step, so rendering faster on
// 120/144Hz displays only redraws identical states at double GPU cost.
export const FRAME_CAP = 60;
export const BLOOM_LAYER = 1; // objects on this layer glow (boss, rings, lanterns, spores)

export const VEGETATION = { SEED: 1337 }; // deterministic procedural variation

// ===========================================================================
// M6 — Biome palettes (LEVELS_SPEC §2 + SEASONS_SPEC), 3-level campaign. Each
// biome drives the Arena re-skin: sky/fog/lights, ground/path/trees, water,
// boss landmark, spawn rings, lanterns, platform, ambient particles.
// ===========================================================================
export const BIOMES = {
  // L1 — Misty Forest: green/misty, soft daylight (SEASONS spring/summer mix).
  L1: {
    id: 'L1', name: 'Misty Forest',
    music: 'L1', ambient: 'L1',
    sky: 0xaed2dc, fog: 0xc2dbe0, fogNear: 30, fogFar: 200,
    // Sky-dome gradient (SkyDome.js) — soft spring morning: pale cyan horizon
    // matched to the fog color so distant geometry dissolves into the sky.
    skyGrad: { zenith: 0x6f9cc2, horizon: 0xc7dde2, bottom: 0x93a8ae,
      sunGlow: 0xffe9c4, sunPow: 24, sunGlowI: 0.4, stars: 0 },
    sun: { color: 0xfff2d6, intensity: 1.9, pos: [-25, 40, -10] },
    hemi: { sky: 0xcfe8ff, ground: 0x3a4a2a, intensity: 0.75 },
    fill: { color: 0xa0d8ff, intensity: 0.25 },
    tech: { accent: 0x7fff9f, accentEmissive: 0x39ff88, metal: 0x161922, metalRim: 0x7fff9f, panel: 0x232834 },
    ground: 0x1b1f28, groundRim: 0x7fff9f, groundRimI: 0.4, groundAlt: 0x27313c,
    // Low drifting mist banks (GroundFog.js) — the biome's namesake.
    mist: { count: 14, opacity: 0.11, color: 0xd9e9ed, size: [16, 30], speed: 0.35 },
    path: 0x222a30, pathRim: 0x7fff9f,
    boundary: 0x14171e, boundaryRim: 0x39ff88,
    trees: { broadleaf: 0x46962f, broadleaf2: 0x3a7d28, pine: 0x2f7a3a, pine2: 0x276633, bark: 0x6e4a2a, barkRim: 0x7fff9f },
    water: { color: 0x2f8fa6, emissive: 0x0e5566, rock: 0x8a8475, pos: [-9, -12], radius: 4.5 },
    landmark: { type: 'mushroom', emissive: 0x6a1f9a, glow: 0xa060ff, glowI: 40, glowRange: 34, mote: 0xc89bff },
    ring: 0x7fff9f,
    lantern: { lit: 0xaeffc8, litEmissive: 0x39ff88, unlit: 0x2a2f38, post: 0x1b1f28, light: 0x7fff9f, lightI: 3.4 },
    platform: { top: 0x1f242e, topRim: 0x7fff9f, cap: 0x262c38, pillar: 0x161922, step: 0x232834, pillarRim: 0x39ff88 },
    firefly: 0x7fff9f, fireflyN: 210,
    ambientFall: { type: 'petals', color: 0x7fff9f, size: 0.10, opacity: 0.75 },
    skyDecor: { body: 'sun', bodyColor: 0xfff4d8, bodyGlow: 0xffe2a0, bodyPos: [-420, 210, 120], bodyR: 26,
      cloud: 0xeef3f7, cloudShadow: 0xb9c6d2, cloudN: 16, comets: 1, ships: 2, stars: 40,
      balloons: 3, balloonColors: [0xff5e5e, 0xfff4d8] },
  },
  // L2 — Ember Hollow: hot orange/charred, volcanic haze (SEASONS autumn/decay).
  L2: {
    id: 'L2', name: 'Ember Hollow',
    music: 'L2', ambient: 'L2',
    sky: 0x4a2820, fog: 0x6a3018, fogNear: 26, fogFar: 175,
    // Volcanic dusk: deep maroon zenith into a hot ember horizon.
    skyGrad: { zenith: 0x2a1220, horizon: 0xb04a20, bottom: 0x552016,
      sunGlow: 0xff5a1a, sunPow: 12, sunGlowI: 0.85, stars: 0 },
    sun: { color: 0xff8a3a, intensity: 1.7, pos: [-18, 30, -8] },
    hemi: { sky: 0xff6a2a, ground: 0x2a1410, intensity: 0.7 },
    fill: { color: 0xff4a1a, intensity: 0.3 },
    tech: { accent: 0xff5a2a, accentEmissive: 0xff3a00, metal: 0x1c1512, metalRim: 0xff7a3a, panel: 0x2c211c },
    ground: 0x1c1512, groundRim: 0xff5a2a, groundRimI: 0.45, groundAlt: 0x2e2018,
    // Thin smouldering haze drifting low over the char.
    mist: { count: 9, opacity: 0.085, color: 0x59301c, size: [14, 26], speed: 0.5 },
    path: 0x2c211c, pathRim: 0xff7a3a,
    boundary: 0x17110e, boundaryRim: 0xff3a00,
    trees: { broadleaf: 0xcc5500, broadleaf2: 0x990000, pine: 0x556b2f, pine2: 0x3a4a1f, bark: 0x232b2b, barkRim: 0xff7a3a },
    water: { color: 0xff4a10, emissive: 0xff2000, rock: 0x3a2018, pos: [9, -12], radius: 5.0 },
    landmark: { type: 'tree', emissive: 0xff3a00, glow: 0xff6a20, glowI: 50, glowRange: 30, mote: 0xffaa30 },
    ring: 0xff5a2a,
    lantern: { lit: 0xffa05a, litEmissive: 0xff3a00, unlit: 0x2e221c, post: 0x1c1512, light: 0xff5a2a, lightI: 4.2 },
    platform: { top: 0x241a16, topRim: 0xff7a3a, cap: 0x2c211c, pillar: 0x1c1512, step: 0x2c211c, pillarRim: 0xff3a00 },
    firefly: 0xff7a3a, fireflyN: 270,
    ambientFall: { type: 'ash', color: 0xff7a30, size: 0.08, opacity: 0.8 },
    skyDecor: { body: 'sun', bodyColor: 0xff5a1a, bodyGlow: 0xff3000, bodyPos: [420, 160, 110], bodyR: 34,
      cloud: 0x5a2c20, cloudShadow: 0x331812, cloudN: 18, comets: 3, ships: 3, stars: 0,
      balloons: 2, balloonColors: [0xff5a2a, 0x2c211c] },
  },
  // L3 — Ancient Grove: cool blue/violet, ethereal moonlight (SEASONS winter).
  L3: {
    id: 'L3', name: 'Ancient Grove',
    music: 'L3', ambient: 'L3',
    sky: 0x1a1a3a, fog: 0x2a2a5a, fogNear: 28, fogFar: 185,
    // Moonlit night: indigo zenith, cool violet horizon, faint shader stars.
    skyGrad: { zenith: 0x0c1030, horizon: 0x33457e, bottom: 0x1c2140,
      sunGlow: 0xaebfff, sunPow: 36, sunGlowI: 0.5, stars: 0.4 },
    sun: { color: 0x8aa0ff, intensity: 1.45, pos: [-20, 45, -12] },
    hemi: { sky: 0x6080ff, ground: 0x1a1a3a, intensity: 0.7 },
    fill: { color: 0x6040ff, intensity: 0.3 },
    tech: { accent: 0x6ad0ff, accentEmissive: 0x4080ff, metal: 0x14172a, metalRim: 0x6ad0ff, panel: 0x1e2440 },
    ground: 0x14172a, groundRim: 0x6ad0ff, groundRimI: 0.5, groundAlt: 0x1e2648,
    // Faint ethereal haze catching the moonlight.
    mist: { count: 7, opacity: 0.07, color: 0x3a4670, size: [15, 28], speed: 0.28 },
    path: 0x1e2440, pathRim: 0x6ad0ff,
    boundary: 0x101324, boundaryRim: 0x4080ff,
    trees: { broadleaf: 0x4a6b6c, broadleaf2: 0x3a5a6c, pine: 0x4a6b6c, pine2: 0x3a5a5c, bark: 0x232b2b, barkRim: 0x6ad0ff },
    water: { color: 0x2a3a8a, emissive: 0x4060ff, rock: 0x4a4a6a, pos: [-9, -12], radius: 4.5 },
    landmark: { type: 'portal', emissive: 0x4080ff, glow: 0x60a0ff, glowI: 45, glowRange: 32, mote: 0x80c0ff },
    ring: 0x6ad0ff,
    lantern: { lit: 0x9ae0ff, litEmissive: 0x4080ff, unlit: 0x222a48, post: 0x14172a, light: 0x6ad0ff, lightI: 3.8 },
    platform: { top: 0x1a1f38, topRim: 0x6ad0ff, cap: 0x1e2440, pillar: 0x14172a, step: 0x1e2440, pillarRim: 0x4080ff },
    firefly: 0x6ad0ff, fireflyN: 240,
    ambientFall: { type: 'leaves', color: 0x80c0ff, size: 0.09, opacity: 0.78 },
    skyDecor: { body: 'moon', bodyColor: 0xdfe8ff, bodyGlow: 0x8ab0ff, bodyPos: [390, 230, 90], bodyR: 24,
      cloud: 0x3a4a78, cloudShadow: 0x222d52, cloudN: 12, comets: 2, ships: 4, stars: 260,
      balloons: 2, balloonColors: [0x9ae0ff, 0x222a48] },
  },
};

// --- Campaign definition (3 levels, each referencing its biome + wave config). ---
// `level` = the campaign index used for enemy stat scaling (L1=0, L2=1, L3=2).
export const CAMPAIGN = [
  { biome: 'L1', waves: () => LEVEL1_WAVES, name: 'Misty Forest' },
  { biome: 'L2', waves: () => LEVEL2_WAVES, name: 'Ember Hollow' },
  { biome: 'L3', waves: () => LEVEL3_WAVES, name: 'Ancient Grove' },
];
