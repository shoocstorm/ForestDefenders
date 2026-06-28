# Forest Defender II — Progress & Handoff

> Living tracker for the Three.js re-implementation. Update this at the end of every
> work session so a fresh conversation can continue without re-deriving context.

**Last updated:** 2026-06-28
**Current milestone:** M4 complete ✅ · next up: **M5 — Economy & systems**

---

## 1. Project at a glance

- **What:** Three.js remake of *Forest Defender: Mushroom Mayhem* (originally Godot).
- **Authoritative design specs:** `../ForestDefender/docs/design/*.md`
  (`GAME_SPEC.md` is the index; sub-specs cover hero, enemies, weapons, levels, combat, etc.).
  When in doubt about numbers/behavior, the spec wins.
- **Stack:** **Bun 1.3** (install + dev server + bundler — no Node/npm/Vite) · **three.js r171** ·
  vanilla JS ES modules (no TypeScript) · all geometry procedural (primitives, no authored assets yet).

## 2. How to run / verify

```bash
bun install
bun run dev      # http://localhost:3000  (Bun dev server + HMR)
bun run build    # bundle to dist/, then npx http-server dist/
```

**Gotchas:**
- Bun **swallows `--port`** when serving an HTML entrypoint → it defaults to 3000.
  Port can be set via the **`BUN_PORT`** env var if needed.
- `index.html` must reference **`./src/main.js`** (relative path) for Bun's HTML bundler.
- **Headless screenshot verification** (no GPU): use Chrome with software WebGL —
  ```bash
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-sandbox \
    --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
    --window-size=1280,720 --virtual-time-budget=6000 --screenshot=out.png "http://localhost:3000/"
  ```
  Plain `--disable-gpu` fails with "Error creating WebGL context". FPS will read ~15
  under SwiftShader; that's the software renderer, not the game — real GPU is 60.

## 3. Current architecture

```
src/
  main.js               entry: instantiates Game, exposes window.__game for debugging
  core/
    Game.js             renderer, scene, fixed-step loop (1/60), ambient petals, stats HUD, resize
    Input.js            keyboard/mouse, pointer-lock, edge-triggered (wasPressed) + held state
    CameraRig.js        FP/TP/TOP modes, mouse-look (yaw/pitch), shake(trauma)/recoil hooks, getAimDirection()
  config/Constants.js   PLAYER/CAMERA/ARENA tuning + ELEMENT_MATRIX + elementMultiplier()
  util/MathUtils.js     clamp, lerp, damp, dampAngle, randRange, randInt, pick
  world/Arena.js        Misty Forest: ground, lights+shadows, fog, trees(+collider data), platform, boss landmark, spawn rings
  entities/
    HeroModel.js        procedural "Squrriel" (primitives) with named pivots: torso/head/tail/armL/armR/legL/legR/gun/muzzle
    Player.js           camera-relative movement, jump+double-jump, facing, locomotion animator; holds hp/maxHp; owns Acorn weapon + takeDamage (i-framed, respawns at 0)
    EnemyBase.js        HealthComponent + PURSUE/ATTACK AI, boids separation, anti-stuck veer, hit-squash/flash, death sequence (gold+spore+freeze+squash-flop), level scaling
    enemies/
      MushroomModel.js  buildMushroom() — wood/boss/glow clone their GLB; FIRE/EARTH dispatch to ProceduralMushroom
      ProceduralMushroom.js  buildProceduralMushroom() — fire/earth built from primitives (cap/stem/face/legs/arms/prop) with real AnimationClips (idle/walk/attack/hit/dying) on a mixer; replaces the >2MB fire/earth GLBs
      WoodShroom.js     WOOD melee (vine slash)
      FireShroom.js     FIRE ranged (lobs enemy-team fireball projectile)
  combat/
    HealthComponent.js  dumb HP pool (subtract/heal + onDeath/onChange); damage pipeline lives in EnemyBase.takeDamage
  weapons/
    Weapon.js           base: cooldown + auto/semi fire mode → spawns projectile + muzzle flash + camera recoil
    Acorn.js            default NATURE single-shot (WEAPONS.ACORN)
    Projectile.js       ProjectilePool — team-aware ('player'→enemies, 'enemy'→player), pooled meshes + point light, sphere hit test
  vfx/
    VFX.js              pooled additive particle bursts + flash lights + shockwave rings: muzzleFlash / hitSpark / spore (simplified)
    Loot.js             gold "acorn" drops that scatter then magnetize to camera → GameManager.gold + HUD pulse
  ui/
    DamageNumbers.js    DOM floating combat text (white/green WEAK!/yellow EFFECTIVE/red RESIST), world→screen projected
    HUD.js              DOM overlay: HP bar (color ramp), gold, enemies/kills, weapon/ammo, crosshair, damage vignette
  systems/
    Juice.js            global timeScale (impactFreeze/hitStop/slowMo, token-guarded) — Game scales sim dt by it
    GameManager.js      gold, kills, level (enemy scaling), playerDamageMult
    EnemyManager.js     enemy list: spawn / update / reap; exposes list on ctx for separation
```

**Key integration points already in place for later milestones:**
- `CameraRig.addShake(amount)` / `addRecoil(amount)` — wired into update/decay; call from combat (M2/M4).
- `CameraRig.getAimDirection(out)` — world-space aim ray for spawning projectiles (M2).
- `HeroModel.pivots.muzzle` + `HeroModel.muzzleWorldPosition` — projectile spawn origin (M2).
- `Arena.colliders` — array of `{type:'cylinder', x, z, r}` for tree trunks (enemy nav / collision, M2/M3).
- `Constants.elementMultiplier(attackElement, targetElement)` — damage pipeline (M2).
- `Game.systems` pattern: add per-frame systems by extending `_fixedUpdate` / `_raf`.
- `Player`: `hasDoubleJump` currently forced `true` for testing — should become a Bounce-Fruit unlock (M5).

## 4. Milestone roadmap

| Milestone | Scope | Status |
|---|---|---|
| **M1 — Foundation & Hero** | Bun+three scaffold, arena, procedural squirrel, run/jump/double-jump, 3 cameras, mouse-look | ✅ done |
| **M2 — Combat core** | Acorn gun + projectiles, 2 enemy types + pursue/attack AI, health + element matrix + damage pipeline, death VFX, gold drops, basic HUD (HP/gold/ammo/crosshair) | ✅ done |
| **M3 — Level 1 loop** | Set pieces, 3-wave spawner, animals to rescue, victory/defeat + rescue scoring, full L1 playthrough | ✅ done |
| **M4 — Weapons & juice** | All 9 weapons + switching, kick/tail melee, camera recoil/shake/hit-stop/slow-mo, muzzle flashes, full spore-death VFX | ✅ done |
| **M5 — Economy & systems** | Shop, permanent upgrades, plants, achievements, JSON save/load, level-up | ⬜ |
| **M6 — Full campaign & audio** | L2/L3 biomes, procedural audio, ambient particles, atmosphere/bloom polish | ⬜ |

## 5. M1 — done

- [x] Bun + three.js scaffold (`package.json`, `index.html`, dev/build/preview scripts)
- [x] Fixed-step game loop (1/60) with variable-rate camera/particles + FPS-clamped delta
- [x] Misty Forest arena: ground + stone lane, fog, sun/hemisphere/fill lights + shadows,
      ~26 trees (with trunk colliders), raised platform (stairs/pillars/moss cap), violet boss
      mushroom landmark + glow light, 3 spawn-telegraph rings, ambient petal fall
- [x] Procedural squirrel hero (fur/cream/vest/belt/goggles/ears/eyes/tail/rifle) with named pivots
- [x] Player controller: camera-relative WASD, Shift run, Space jump + double-jump, arena bounds, facing damp
- [x] Procedural locomotion animator (leg/arm swing, body bob+lean, tail sway, jump tuck, head look)
- [x] 3 camera modes (1/2/3), pointer-lock mouse-look, shake/recoil hooks ready
- [x] Debug stats overlay (FPS/cam/pos/HP) + controls help bar + boot/loading overlay
- [x] Verified: build bundles 12 modules; headless render shows full scene, zero app JS errors

### Known small deferrals (intentional, not bugs)
- Ambient petals render as square points (no circular sprite texture yet) — polish in M6.
- Camera has no collision against geometry (can clip through trees/platform) — polish later.
- Player collides only with ground + arena bounds, not trees/platform sides yet — add in M3.
  (Enemies DO resolve against tree colliders + bounds via `util/Collision.js`; player can reuse it.)
- Outline (inverted-hull) uses a flat 1.06 uniform scale; fine for chunky primitives, revisit if needed.

## 6. M2 — done

- [x] **Damage pipeline** (`combat/HealthComponent.js` + `EnemyBase.takeDamage`): base × `playerDamageMult`
      × `elementMultiplier(attack, target)` → HP; floating `WEAK!/EFFECTIVE/RESIST` + number text.
- [x] **Acorn gun** (`weapons/Weapon.js` + `Acorn.js`): cooldown + auto/semi fire, muzzle-origin spawn
      along camera aim, camera recoil. Left-click **or** Z to fire.
- [x] **Projectiles** (`weapons/Projectile.js`): pooled, **team-aware** — player shots hit enemies,
      enemy fireballs hit the player; sphere hit test, point-light glow, lifetime/bounds cull.
- [x] **Enemies** (`EnemyBase.js` + `WoodShroom`/`FireShroom` + `MushroomModel.js`): PURSUE/ATTACK AI,
      boids separation, anti-stuck veer, tree+bounds collision, hit-squash/flash, death sequence
      (gold + spore + impact-freeze + squash-flop), level scaling. Procedural cap/stem/face/spots/prop.
- [x] **VFX** (`vfx/VFX.js`): pooled additive bursts + flash lights + shockwave rings — muzzle/hit/spore.
- [x] **Loot** (`vfx/Loot.js`): gold acorns scatter then magnetize to camera → `GameManager.gold` + HUD pulse.
- [x] **HUD** (`ui/HUD.js`): HP bar w/ color ramp, gold, enemies/kills, weapon/ammo, crosshair, damage vignette.
- [x] **Juice time-scale** (`systems/Juice.js`): `impactFreeze/hitStop/slowMo` dip `Game`'s sim dt (token-guarded).
- [x] **Systems**: `GameManager` (gold/kills/level/damageMult), `EnemyManager` (spawn/update/reap).
- [x] Wired into `Game._fixedUpdate` (player→enemies→projectiles) with a reused `ctx`; endless test wave
      (3 Wood + 2 Fire) respawns 2s after a clear so there's always something to shoot.
- [x] Verified via CDP on the live headless build: element mult (NATURE×WOOD=1.0, 10 dmg), kill→`kills++`,
      1–5 gold acorns drop + collect (HUD `GOLD` ticked to 4), impact-freeze dipped `timeScale`,
      acorn projectile hit (HP 20→10), enemy melee damaged player (HP→10, red bar). Build = 28 modules.

### M2 deferrals (intentional)
- Only the Acorn ships; the other 8 weapons + switching are M4 (Weapon base is ready for them).
- Spore explosion is the simplified ~160-particle version; full ~520-particle death burst is M4.
- Player death just respawns at start w/ full HP (i-framed) — real defeat screen + run end is M3.
- Enemy projectiles travel straight (no FireShroom dodge / arc yet) — refine in M4.

## 6c. M3 — done

- [x] **`systems/WaveManager.js`** — 3 scripted L1 waves (`LEVEL1_WAVES`); each wave's enemies spawn at
      arena spawn rings, next wave starts `delay`s after the previous clears; `onWaveStart`/`onAllCleared`
      drive the HUD banner + victory. Replaced the M2 endless test spawn.
- [x] **`entities/Animal.js` + cages** — 3 rescuable animals (hedgehog/bird/rabbit), `[E]/[F] FREE` prompt
      via `AnimalManager` + `WorldLabels`. Hedgehog & bird are procedural; rabbit uses bunny.glb.
- [x] **Rescue reward** — freeing grants the animal's buff (shield/speed/reveal) **plus** an instant
      reward: gold + HP heal (`RESCUE_REWARD`), floating reward numbers + gold pulse, then the animal
      floats away and is removed. (Replaces the earlier "freed animal roams and must survive" model.)
- [x] **Win/lose flow** — `ui/Overlays.js` victory (LEVEL CLEAR + rescue rank/stars/score) and defeat
      (retry) screens; `Player` 0-HP now triggers a real defeat (`onPlayerDeath`) instead of respawning.
- [x] **HUD additions** — top-center wave counter + animals-safe counter; shield bar; buff icons.
- [x] **Player tree/platform collision** — `resolveCircleColliders` + platform side-resolve.
- [x] **Rescue scoring** — `GameManager.computeRank` (RESCUE_RANKS) → rank/stars/bonus gold at victory.

## 6d. M4 — done

- [x] **All 9 weapons** (`config/Constants.js` `WEAPONS` + `WEAPON_ORDER`): Acorn, Ganon, Machine Gun,
      Boomstick, Laser, Scattergun, Fire Bullet, Forest Bow, Toroid Cannon — each with mode/ammo/recoil/
      muzzle color per `WEAPONS_SPEC §2`.
- [x] **Data-driven `weapons/Weapon.js`** — one class, `def.mode` dispatch:
      `single · rapid · spread · charge · explosive · beam · ring`. Ammo by `def.ammo.type`:
      `infinite · magazine` (mag/reserve + auto-reload) · `overheat` (heat gauge + lockout) ·
      `energy` (regen). `ammoText()` feeds the HUD. (Replaced the old `Acorn.js` subclass — deleted.)
- [x] **`weapons/Projectile.js`** — explosive/ring shots carry `explodeRadius`/`empRadius`/`knockback`/
      `empDuration`; `_detonate()` does radial falloff damage + knockback + EMP stun + `VFX.explosion` +
      shake + hit-stop. Beam weapons are hit-scan (`Weapon._beamDamage`, penetrates N) with `VFX.beam`.
- [x] **`weapons/WeaponManager.js`** on `Player` — 9-weapon roster, `next/prev/select`; **Q** + **mouse
      wheel** cycle; `HeroModel.playSwitch()` dip + `setWeaponTint()` recolors the gun's energy cell;
      HUD shows weapon name / ammo / element.
- [x] **Melee** (`HERO_SPEC §6.3`): **V** kick (forward cone, 30 dmg + knockback + hit-stop) and **R**
      tail swing (360° radial, 28 dmg + distance-scaled fling + 0.95s i-frames + heavy shake). Poses via
      `HeroModel.playKick` (thigh drive) / `playTail` (3 full-body spins + tail flared ~2.7×).
- [x] **`EnemyBase`** — `applyKnockback(dir,speed)` (decaying slide) + `stun(dur)` (EMP freeze: no AI/
      attack, glow pulse, knockback still slides).
- [x] **Juice** (`JUICE_SPEC §2,6`): `CameraRig.addRecoil(mult)` now does pitch-up + random yaw kick +
      FOV punch from shared `RECOIL` (back/up/pitch/yaw/fov/return); per-weapon `recoil` scales it.
- [x] **Verified:** `bun build` clean (60 modules); headless render shows scene + new HUD ammo/element
      readout, zero app JS errors; 16/16 weapon-logic assertions pass (every mode + ammo + switch path).

### M4 deferrals (intentional)
- **Unlock gating** → M5: all 9 weapons are available + switchable now; cage/shop/achievement unlocks +
  the Scattergun multi-kill-attribution (`WEAPONS_SPEC §4`) land with the economy.
- **Special weapon meshes** → the gun is recolored per weapon (energy-cell tint), not modeled as 7 distinct
  meshes yet (`HERO_SPEC §6.2`); revisit in polish.
- **Static Harvest** (Toroid energy-refund orbs on killing EMP-stunned enemies) not implemented — EMP stun
  itself works; the refund loop is a small M5 add.
- Boomstick/Fire-Bullet world interactions (blow rocks, ignite `burnable` trees) deferred — needs the
  obstacle/plant systems (`OBSTACLE_PHYSICS_SPEC`, `PLANTS_SPEC`) from M5.

## 6e. M5 — plan (next session starts here)

Goal (`ECONOMY_SHOP_SPEC` + `PLANTS_SPEC` + `OBSTACLE_PHYSICS_SPEC`): shop, permanent upgrades, plants,
achievements, JSON save/load, level-up, and weapon **unlock gating** (wire the M4 roster behind unlocks).

Specs to read first for M5: `ECONOMY_SHOP_SPEC.md`, `PLANTS_SPEC.md`, `OBSTACLE_PHYSICS_SPEC.md`,
`GALLERY_SPEC.md`, `SEASONS_SPEC.md`.

## 7. Tuning reference (already in `src/config/Constants.js`)

- Player: SPEED 7.0, RUN_MULT 1.7, JUMP 9.0, DOUBLE_JUMP 7.5, GRAVITY 24.0 (arcade), ROT 9.0,
  RADIUS 0.3, HEIGHT 0.8, MAX_HP 100; melee kick 30/1.7/0.7s, tail 28/2.8/1.3s, i-frames 0.95s; acorn cd 0.3s.
- Camera: FOV 70, sens 0.0022, pitch ±1.3, TP dist 6.0 / height 2.4, TOP height 26.
- Arena: 70 (Z) × 30 (X), platform height 3.0.
- Element matrix + `elementMultiplier()` exported from Constants.
- **M2 added:** `WEAPONS.ACORN` (10 dmg / 0.3s cd / NATURE), `RECOIL`, `ENEMY_DEFS` (WOOD_SHROOM melee 30hp,
  FIRE_SHROOM ranged 20hp), `COMBAT` (player i-frames 0.6s, enemy radius/separation, level scale 0.15, gold 1–5),
  `JUICE` (impact-freeze 0.05/0.07, hit-stop, slow-mo).

## 8. Conventions

- All tuning numbers live in `Constants.js` — don't scatter magic numbers.
- Edge-triggered input via `input.wasPressed(code)`; held via `input.isDown(code)`.
- Game forward is **-Z**; the hero model faces -Z (rotated by `facing` yaw).
- Keep comments at the density of existing files (explain *why*, not *what*).
- Update this file + the milestone checkboxes at the end of each session.
