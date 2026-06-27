# Forest Defender II — Progress & Handoff

> Living tracker for the Three.js re-implementation. Update this at the end of every
> work session so a fresh conversation can continue without re-deriving context.

**Last updated:** 2026-06-27
**Current milestone:** M1 complete ✅ · next up: **M2 — Combat core**

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
bun run dev      # http://localhost:5173  (Bun dev server + HMR)
bun run build    # bundle to dist/
bun run preview  # serve on :4173
```

**Gotchas (important):**
- Bun **swallows `--port`** when serving an HTML entrypoint → it defaults to 3000.
  Port MUST be set via the **`BUN_PORT`** env var (already wired into the npm scripts).
- `index.html` must reference **`./src/main.js`** (relative path) for Bun's HTML bundler.
- **Headless screenshot verification** (no GPU): use Chrome with software WebGL —
  ```bash
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-sandbox \
    --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
    --window-size=1280,720 --virtual-time-budget=6000 --screenshot=out.png "http://localhost:5173/"
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
    Player.js           camera-relative movement, jump+double-jump, facing, procedural locomotion animator; holds hp/maxHp
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
| **M2 — Combat core** | Acorn gun + projectiles, 2 enemy types + pursue/attack AI, health + element matrix + damage pipeline, death VFX, gold drops, basic HUD (HP/gold/ammo/crosshair) | ⬜ next |
| **M3 — Level 1 loop** | Set pieces, 3-wave spawner, animals to rescue, victory/defeat + rescue scoring, full L1 playthrough | ⬜ |
| **M4 — Weapons & juice** | All 9 weapons + switching, kick/tail melee, camera recoil/shake/hit-stop/slow-mo, muzzle flashes, full spore-death VFX | ⬜ |
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
- Player collides only with ground + arena bounds, not trees/platform sides yet — add in M2/M3.
- Outline (inverted-hull) uses a flat 1.06 uniform scale; fine for chunky primitives, revisit if needed.

## 6. M2 — plan (next session starts here)

Goal: shoot enemies, they fight back, they die with juice and drop gold. Verifiable by
playing: spawn a few enemies, kill them with the acorn gun, watch gold tick up on the HUD.

Suggested build order & new files:
1. **`combat/HealthComponent.js`** — `max/current`, `takeDamage(amount, attackElement)` →
   applies `player_damage_mult` (start 1.0) × `elementMultiplier(...)`, returns result; `onDeath` callback.
2. **`combat/DamageNumbers.js`** (or fold into HUD) — floating `WEAK!`/`RESIST`/`EFFECTIVE` + amount text (CSS or sprites).
3. **`weapons/Weapon.js` + `weapons/Acorn.js`** — fire-rate cooldown, muzzle position, recoil amount;
   spawns a projectile along `cameraRig.getAimDirection()` from `player.model.muzzleWorldPosition`.
4. **`weapons/Projectile.js`** + a projectile pool — travel, lifetime, sphere-vs-enemy hit test,
   trail/muzzle flash, calls `HealthComponent.takeDamage`. NATURE element for acorn.
5. **`entities/EnemyBase.js`** — HealthComponent, AI state machine (IDLE→PURSUE→ATTACK→cooldown,
   plus anti-stuck veer + boids separation), `element`, hit-squash, death sequence
   (gold drop + spore burst + impact-freeze hook), level-scaling `(1 + 0.15*level)`.
6. **`entities/enemies/WoodShroom.js`** (melee, WOOD) + **`FireShroom.js`** (ranged fireball, FIRE) —
   procedural mushroom models from primitives (cap/stem/face). Reference `MUSHROOM_BASE_SPEC.md`.
7. **`vfx/`** — minimal: muzzle flash, hit spark, simplified spore explosion (full ~520-particle
   version is M4), gold "acorn" loot that magnetizes to camera.
8. **`systems/GameManager.js`** — gold, player_damage_mult, kill count; the eventual singleton.
9. **`ui/HUD.js`** — HP bar, gold counter, ammo/weapon readout, crosshair (DOM overlay; replace inline stats later).
10. Wire input: left-click / Z to fire; spawn a handful of test enemies on start to verify.

Specs to read first for M2: `ENEMIES_SPEC.md`, `WEAPONS_SPEC.md`, `COMBAT_SPEC.md`,
`MUSHROOM_BASE_SPEC.md`, `JUICE_SPEC.md` (death sequence / hit-stop), `HUD_SPEC.md`.

## 7. Tuning reference (already in `src/config/Constants.js`)

- Player: SPEED 7.0, RUN_MULT 1.7, JUMP 9.0, DOUBLE_JUMP 7.5, GRAVITY 24.0 (arcade), ROT 9.0,
  RADIUS 0.3, HEIGHT 0.8, MAX_HP 100; melee kick 30/1.7/0.7s, tail 28/2.8/1.3s, i-frames 0.95s; acorn cd 0.3s.
- Camera: FOV 70, sens 0.0022, pitch ±1.3, TP dist 6.0 / height 2.4, TOP height 26.
- Arena: 70 (Z) × 30 (X), platform height 3.0.
- Element matrix + `elementMultiplier()` exported from Constants.

## 8. Conventions

- All tuning numbers live in `Constants.js` — don't scatter magic numbers.
- Edge-triggered input via `input.wasPressed(code)`; held via `input.isDown(code)`.
- Game forward is **-Z**; the hero model faces -Z (rotated by `facing` yaw).
- Keep comments at the density of existing files (explain *why*, not *what*).
- Update this file + the milestone checkboxes at the end of each session.
