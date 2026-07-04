# Agent Notes

<!-- Running log of non-obvious bugs, gotchas, and fixes discovered by coding agents.
     Append newest entry to the top. Keep each entry focused: symptom, root cause, fix. -->

> **For AI coding agents:** This file is the log for **bugs, gotchas, and fixes**.
> Feature work, polish, and creative/visual improvements made *after the migration from
> the original Godot version* go in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md) instead.
> Keep **both** files current: when you fix a non-obvious bug, append here; when you add or
> refine a feature/asset/visual, append to `docs/ENHANCEMENTS.md`. Newest entry on top in
> both. This running history is how future agents avoid re-deriving past decisions.

## Enemy boids separation + projectile hit-tests independently O(n²)-scan the enemy list

**Date:** 2026-07-02 · **Files:** `src/util/SpatialGrid.js` (new), `src/systems/EnemyManager.js`,
`src/entities/EnemyBase.js`, `src/weapons/Projectile.js`

**Symptom:** (Found via audit, not yet a visible bottleneck at current wave sizes)
Three separate hot paths each scanned the *entire* live enemy list independently:
`EnemyBase._separation()` (every enemy, every frame), `EnemyBase._chooseTactic()`
(every enemy, every 0.5s), and `Projectile.update()`'s player-team hit-test (every
active bullet, every frame). None of these were bottlenecks yet at the game's current
enemy caps (~13-20 alive, `DIRECTOR.SPAWN_COUNT_MAX` only scales waves 1.3x), but the
adaptive Director exists specifically to push difficulty up over a session, and three
independent O(n) scans per query compounds fast if that cap ever grows.

**Fix:** Added `SpatialGrid` — a uniform grid over the XZ plane, rebuilt from scratch
once per frame (simplest correct option at this entity count, no incremental-update
staleness risk). `EnemyManager.update()` builds it from the alive enemy list once and
exposes it as `ctx.enemyGrid`, **before** enemies or projectiles update that frame
(`Game._fixedUpdate` order: `enemies.update()` then `projectiles.update()` — this
matters, see gotcha below). All three consumers now call `grid.queryNear(x, z, radius,
buf)` (fills a reused scratch array, no per-call allocation) instead of scanning
`ctx.enemies` directly:
```js
// EnemyBase.js — was `for (const e of enemies)` scanning the full list
ctx.enemyGrid.queryNear(this.position.x, this.position.z, r, _neighborBuf);
for (const e of _neighborBuf) { /* exact distance check, same as before */ }

// Projectile.js — was `for (const e of ctx.enemies)` per bullet per frame
ctx.enemyGrid.queryNear(p.pos.x, p.pos.z, p.radius + MAX_ENEMY_HIT_RADIUS, this._hitBuf);
for (const e of this._hitBuf) { /* exact distance check, same as before */ }
```
Cell size is `COMBAT.SEPARATION_RADIUS * 2` (tuned for the hottest/most frequent
query); wider queries (tactic's 18-unit radius) just walk more cells.

**Gotcha to remember:** A grid/tree exposed via `ctx` for one frame is only valid if
**every consumer reads it after the one writer built it that same tick** — here that
means `EnemyManager.update()` (which owns and rebuilds `ctx.enemyGrid`) must run
before `ProjectilePool.update()` in `Game._fixedUpdate`, or projectiles would test
against a stale/empty grid. If you reorder systems in the fixed-update pipeline, check
what each system's `ctx.*` reads assume was already written this tick. Also: `queryNear`
returns a **broad-phase** candidate set (square cells vs. a circular query) — every
consumer still does its own exact `distanceToSquared` check on the results, same as
the original full-list scan did; only the candidate set shrank.

## Game permanently "gets stuck"/slow-motion in Performance mode after a rough frame

**Date:** 2026-07-01 · **Files:** `src/core/Game.js`

**Symptom:** In Performance quality mode especially, the game would periodically get
stuck/enter slow motion and — unlike an ordinary stutter — never recover on its own.
Happened often enough to be disruptive.

**Root cause:** Classic fixed-timestep "spiral of death." `_raf()` accumulates real
elapsed time into `this.accum` and drains it in `1/60` fixed steps, capped at 5
sub-steps per frame so a single slow frame can't block the render loop:
```js
this.accum += simDt;
let steps = 0;
while (this.accum >= this.fixedDt && steps < 5) {
  this._fixedUpdate(this.fixedDt);
  this.accum -= this.fixedDt;
  steps++;
}
```
The cap is correct for a *transient* hitch, but nothing trimmed the leftover backlog
when the cap was hit — if the sim falls behind faster than 5 steps/frame can catch up
(sustained <12fps, e.g. from a GC pause or the OS backgrounding the tab), `this.accum`
keeps growing every frame forever. The game doesn't crash — it just runs in permanent
slow motion, because the simulation is perpetually seconds behind real time with no
way to ever pay off the debt.

**Fix:** When the step cap is hit, drop the remainder instead of carrying it forward:
```js
if (steps >= 5) this.accum = 0; // sustained slowdown — drop the debt, don't compound it
```
This trades "catch up perfectly" for "recover to real-time on the next good frame,"
which is the right tradeoff for a game (a momentary stutter should stay a stutter, not
convert into a permanent slow-mo state).

**Gotcha to remember:** Any fixed-timestep accumulator loop with a per-frame step cap
needs an explicit policy for what happens when the cap is hit *and the backlog wasn't
fully drained* — silently carrying the leftover forward is a spiral-of-death waiting
for a slow-enough frame (or a long enough tab-backgrounding) to trigger. Either reset
the accumulator (simplest — used here) or clamp it to some small multiple of `fixedDt`
if partial catch-up across a couple of frames is desired.

## Disposing a GLB-cloned enemy/prop corrupts its living siblings (blank/missing meshes)

**Date:** 2026-07-01 · **Files:** `src/entities/EnemyBase.js`,
`src/entities/enemies/MushroomModel.js`, `src/entities/enemies/ProceduralMushroom.js`,
`src/world/Arena.js`, `src/core/Assets.js`, `src/materials/CelMaterial.js`

**Symptom:** (Found via audit, not yet observed live) Killing one enemy of a GLB-based
type (wood/boss/glow mushroom, or an Arena landmark/scatter prop) risks other living
clones of that same asset — or the next level's fresh clones — rendering blank,
corrupted, or with missing geometry.

**Root cause:** `Assets.clone(key)` uses `SkeletonUtils.clone()`, which deep-clones the
**hierarchy/skeleton** but leaves `geometry` and `material` as **shared references** —
every clone of an asset, plus the cached master scene used for *future* clones, points
at the same geometry/material objects. A blanket `mesh.geometry.dispose(); mesh.material.dispose()`
on death/teardown (a pattern that's correct for procedurally-built objects) frees GPU
buffers/shaders still in use by every other living clone and by the master cache.
Meanwhile procedurally-built meshes (`ProceduralMushroom`, `Plant.js`, Arena's own
boundary/platform/grid geometry) build fresh geometry/materials per instance and
**must** be disposed the same way, or every death/level-reload leaks GPU memory
(the class of bug already logged above under "Progressive FPS degradation").

**Fix:** Model builders now return ownership info; consumers branch on it instead of
disposing unconditionally.
```js
// MushroomModel.js (GLB path) — never dispose what you don't own
return { group, capPivot, emissives, mixer, actions, ownsMaterials: false };
// ProceduralMushroom.js — everything here is built fresh for this instance
return { group, capPivot: cap, emissives, mixer, actions, ownsMaterials: true };

// EnemyBase.dispose()
if (this._ownsMaterials) {
  this.group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose?.();
    if (!o.userData.__isOutline) o.material?.dispose?.(); // outline mat is a shared cache too
  });
}
```
Arena tags every GLB-cloned landmark/prop with `userData.__sharedAsset = true` at
spawn and its `dispose()` skips disposing that subtree entirely, while still disposing
geometry+material for its own procedural meshes (boundary/platform/portal/grid) —
and now also `THREE.Points` (fireflies), which a `c.isMesh`-only check had been
silently skipping.

**Gotcha to remember:** Before writing or reviewing a `dispose()` that frees
`geometry`/`material`, first ask **"was this object built fresh for this instance, or
is it a clone of a shared/cached asset?"** — check for `SkeletonUtils.clone()` /
`Assets.clone()` upstream. Cloned-hierarchy objects share geometry+materials with
every sibling clone and the master cache; disposing them is a correctness bug
(corrupted rendering), not just a leak. Procedurally-built objects (fresh
`new THREE.*Geometry()` / `new THREE.*Material()` per instance, e.g. `Plant.js`,
`ProceduralMushroom.js`, Arena's own terrain) must be disposed or they leak. Also
watch for **module-level side-registries** that hold a reference independent of the
scene graph: `CelMaterial.js`'s `_windMaterials` Set (populated by `toon()`/`painted()`
when `wind` is passed) is iterated every frame by `updateTime()` and is **never
auto-cleared** — a system that builds fresh wind-enabled materials per instance
(`Vegetation.js`, one per tree with foliage) must call the new `untrackWind(mat)`
export from its own `dispose()`, or the Set accumulates one dead material per tree per
level reload forever. GLB wind materials (trees loaded via `Assets.js`) are the
opposite case — assigned once per asset at load time and shared by every clone, so
they're correctly registered once and never removed.

## Debris chunks (explosions/tail-swing/spore deaths) allocate fresh geometry+material per chunk

**Date:** 2026-07-01 · **Files:** `src/vfx/VFX.js`

**Symptom:** (Found via audit) Minor stutter clustered around explosion-heavy moments
(Boomstick, Fire Bullet, tail swing, spore/enemy-death VFX) — smaller-scale version of
the Machine Gun light/burst recompile-storm bug already logged above, but for
`_debris()` instead of `_flash()`/`_burst()`.

**Root cause:** `_debris()` called `new THREE.DodecahedronGeometry(...)` and
`new THREE.MeshStandardMaterial({...})` per chunk (8-14 chunks per call) on every
explosion, disposing them ~1.2s later. Every other short-lived VFX object in this file
was already pooled (`_ringGeo`, `_sphereGeo`, `_beamGeo`, the flash-light pool, the
burst-particle pool) — debris was the one leftover per-call allocator.

**Fix:** Added `_debrisGeo` (one shared unit `DodecahedronGeometry`, scaled per chunk
via `mesh.scale`) and `_debrisPool` (free-list of reusable `Mesh`es, each keeping its
own `MeshStandardMaterial` whose `color`/`emissive` are mutated with `.setHex()` on
reuse instead of constructing a new material). Retiring a chunk (`life <= 0` in
`update()`, or `clear()` on level reload) now pushes it back into `_debrisPool` instead
of calling `.dispose()`.

**Gotcha to remember:** In this file, any new short-lived VFX object should follow the
existing pool pattern (shared/reused geometry + a free-list of meshes with mutated
material properties) rather than allocating fresh Three.js resources per call — that
convention exists specifically because this codebase already hit (and fixed, twice
now) stutter from per-call allocation in a hot VFX path.

## Weapon switching (1-9) & tail swing (R) feel sluggish / need a double-press

**Date:** 2026-06-29 · **Files:** `src/core/Input.js`, `src/core/Game.js`,
`src/entities/Player.js`, `src/systems/AnimalManager.js`

**Symptom:** Number-key weapon switching, `Q` cycle, tail swing (`R`), kick (`V`),
jump (`Space`), and animal rescue (`E`/`F`) feel laggy — presses are frequently
dropped and you have to hit the same key twice to trigger the action. Camera/UI
hotkeys (`C`, `Esc`, `P`, `G`, …) always felt fine.

**Root cause:** A fixed-timestep vs. render-rate mismatch. Those gameplay actions
are edge-triggered reads (`input.wasPressed(...)`) consumed **only inside
`_fixedUpdate`**, which runs in the `while (accum >= 1/60)` loop (`Game.js`). But
`input.endFrame()` cleared the `pressed` edge set on **every render frame**. On a
display faster than 60 Hz the render loop outruns the sim, so most frames run
**zero** fixed steps — and the keypress edge was wiped by `endFrame()` before any
fixed step could ever see it. The hotkeys were immune because they're polled
directly in `_raf` every frame (not in the fixed loop).

**Fix:** Gave the simulation its own edge set that's cleared only once a fixed step
has actually consumed it (or when the sim is paused, so a carried-over press can't
fire on resume) — otherwise the press is held for the next frame's fixed step
instead of being dropped.
- `Input.js`: added `simPressed` (populated alongside `pressed` on keydown), a
  `wasPressedSim(code)` getter, and `endFrame(simConsumed)` which only clears the
  sim edges (`simPressed` + virtual taps) when `simConsumed` is true.
- `Game.js`: `_raf` tracks whether a fixed step ran this frame (`_simStepped`,
  also true when the sim is paused) and passes it to `endFrame(this._simStepped)`.
- `Player.js` / `AnimalManager.js`: sim-side reads switched from `wasPressed` →
  `wasPressedSim` (weapon `Digit1-9`/`Q`, melee `V`/`R`, `Space`, rescue `E`/`F`).
  Realtime hotkeys in `Game._raf` stay on `wasPressed` (cleared every frame).

**Gotcha to remember:** Edge-triggered input (`wasPressed`-style "pressed this
frame") consumed inside a **fixed-step** loop must not be cleared on the **render**
frame cadence. If the render loop can outrun the sim (high-refresh monitors,
variable rAF), presses land on frames with zero fixed steps and vanish. Either
latch edges until a step consumes them (this fix) or accumulate input separately
for the fixed loop. Realtime reads (polled every render frame) and sim reads need
**separate** edge buffers.

## Progressive FPS degradation over play sessions, especially after death/retry

**Date:** 2026-06-28 · **Files:** `src/core/Game.js`, `src/weapons/Projectile.js`,
`src/vfx/VFX.js`, `src/vfx/Loot.js`, `src/world/Water.js`, `src/world/Lanterns.js`,
`src/world/Vegetation.js`, `src/ui/DamageNumbers.js`

**Symptom:** Game gets progressively slower the longer you play. FPS drops significantly
after the hero dies and the player retries a new round. The more you restart levels,
the worse the performance becomes. Eventually the game gets stuck/freezes periodically.

**Root cause:** Resource accumulation — Three.js objects, DOM elements, and scene meshes
were accumulating without proper cleanup on `Game.loadLevel()`.

When the level restarts, several systems persist across loads (by design — they're not
recreated) but their **dynamic content** was never cleared:
- `ProjectilePool` — in-flight bullets stayed active
- `VFX` — shockwave rings, debris chunks, particle bursts, laser beams
- `Loot` — gold coin meshes piled up
- `Water`, `Lanterns`, `Vegetation` — added objects to scene but had no `dispose()`
- These were recreated by `Arena` but old instances' scene objects lingered

Each restart ~doubled the accumulated objects in the scene, causing:
- More draw calls and GPU work
- Larger scene graphs to traverse
- DOM element leaks (damage numbers divs)
- Eventual GC pressure and renderer stalls

**Fix:** Added cleanup methods to every system that accumulates dynamic state:

```javascript
// In Game.loadLevel(), added these critical cleanup calls:
this.projectiles.clear();   // deactivates all in-flight projectiles
this.vfx.clear();          // disposes rings, debris, bursts, hides laser
this.loot.clear();         // removes all loot meshes from scene
this.damageNumbers.clear(); // hides all active damage number divs

// Also added dispose() methods to:
// - Water (water geometry + rocks)
// - Lanterns (posts, orbs, lights) — now tracks allMeshes
// - Vegetation (all tree groups + geometries)
// - Arena.dispose() now calls vegetation?.dispose(), water?.dispose(), lanterns?.dispose()
```

**Gotcha to remember:** In Three.js games with level transitions, **every system that
adds objects to the scene must have a corresponding cleanup method**. This includes:
- Objects added via `scene.add()` must be removed via `scene.remove()`
- Geometries and materials must be `dispose()`'d when no longer needed
- DOM elements should be pooled/recycled rather than created/destroyed
- Event listeners added in constructors should be removed on teardown

**Pattern for level-restartable systems:**
```javascript
// Good pattern for any system that adds to the scene:
class Foo {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  spawn() {
    const mesh = new THREE.Mesh(...);
    this.scene.add(mesh);
    this.items.push(mesh);
  }

  dispose() {
    for (const item of this.items) {
      this.scene.remove(item);
      item.geometry?.dispose?.();
      item.material?.dispose?.();
    }
    this.items.length = 0;
  }
}
```

Then in your level reload function, always call `foo.dispose()` before creating a
new `Foo` instance or clearing its state.

## Severe CPU/GPU stutter & freezes, worst when firing the Machine Gun (esp. L2)

**Date:** 2026-06-28 · **Files:** `src/vfx/VFX.js`, `src/weapons/Projectile.js`,
`src/ui/DamageNumbers.js`, `src/core/Game.js`

**Symptom:** Game runs hot and janky in Chrome; periodic freezes that spike while
firing the rapid weapons. Machine Gun (`cooldown 0.08`, ~12.5 shots/s) was the worst
trigger. L1 firing froze; after the first round of fixes L1 was smooth but **L2 was
still extremely slow** specifically while firing.

**Root causes (four independent costs, all scaling with rate of fire):**

1. **Per-shot light add/remove → shader recompiles.** `VFX._flash()` did
   `scene.add(light)` then removed it ~0.18s later (and `Projectile` lights were
   uncapped). Every change to the scene's light count forces Three.js to **recompile
   every lit material's shader program**. At 12.5 shots/s this was a recompile storm =
   the freeze. (The `beam()` comment already documented this exact hazard.)
2. **Per-shot geometry/material allocation.** `VFX._burst()` allocated a fresh
   `BufferGeometry` + 2 `Float32Array`s + `PointsMaterial` + `Points` per muzzle flash
   and per hit spark, disposed a fraction of a second later → GC churn → hitches.
3. **Uncapped dynamic projectile lights.** Each pooled projectile carried a live
   `PointLight`. Low-damage Machine Gun vs the tankier/denser **L2** waves left many
   more bullets alive at once → many simultaneous lights → per-fragment lighting cost
   on every lit material exploded. This is why **L2 specifically** stayed slow.
4. **DOM damage-number thrash.** `DamageNumbers` created/removed a div per hit and
   positioned via `left`/`top` (invalidates **document layout** synchronously every
   frame). L2's elemental hits (PHYSICAL gun vs Water/Ice/Metal) add a second label
   node per hit → ~2 DOM nodes/hit → continuous main-thread layout passes.

**Fixes:**
- **VFX flash lights pooled** (`VFX.js`): 8 `PointLight`s added to the scene **once**,
  grow-on-demand, never removed — only intensity toggled. Light count is now constant,
  so no per-shot recompiles.
- **VFX bursts pooled** (`VFX.js`): reusable `Points` objects with fixed 200-particle
  capacity + `setDrawRange`; expired bursts are hidden, never disposed.
- **Projectile light budget** (`Projectile.js`): `LIGHT_BUDGET = 6` — only the 6 most
  recent in-flight bullets cast light; the rest still render via the bloom layer. Bounds
  on-screen dynamic lights regardless of weapon or wave density. Decrement the counter
  when a lit projectile dies.
- **DamageNumbers rewritten** (`DamageNumbers.js`): pooled divs (cap 28, oldest
  recycled), positioned with `transform: translate3d` (compositor-only, **no layout**).
- **Pause-aware render loop** (`Game.js`): skip the heavy bloom+GTAO pipeline entirely
  while the gallery is open (it draws its own full-screen canvas), throttle to ~30fps on
  shop/victory/defeat overlays, and **stop the rAF loop while the tab is hidden**
  (`visibilitychange`) — Chrome only throttles rAF when *fully* hidden, not when occluded.

**Gotcha to remember:** In Three.js, **never add/remove lights at runtime** in a hot
path — the scene light count is baked into every lit material's shader, so each change
recompiles them all. Pool lights and toggle `intensity` instead (as the projectile pool
and laser beam already did). Likewise, pool short-lived particle objects rather than
alloc/dispose per spawn, and position DOM overlays with `transform`, never `left`/`top`.

**Quality levers if still heavy:** press `/` in-game for `QUALITY.LOW` (drops GTAO,
halves bloom res); lower the pixel-ratio cap at `Game.js:41` (`Math.min(devicePixelRatio, 2)`
→ `1.5`). To diagnose: Chrome DevTools → Performance → record while firing; the widest
band names the culprit (Layout/Recalc = DOM, Composite/GPU = render pipeline, Minor GC
sawtooth = allocation).

## PostFX beauty pass renders black (only bloom glows show)

**Date:** 2026-06-27 · **Files:** `src/core/PostFX.js`

**Symptom:** Scene is all black except for glowing bloom-layer objects (lanterns,
fireflies, spawn rings, boss cap). Hero, enemies, animals, ground, trees all invisible.
Switching cameras does not help.

**Root cause:** The cinematic-cel post pipeline (`PostFX.js`) uses two composers:
- `bloomComposer` — renders **only** bloom-layer objects (layer 1) on a black background.
- `finalComposer` — renders the full beauty pass, then composites the bloom texture additively.

On `QUALITY.HIGH` (the default), `GTAOPass` was added as the **first** pass in
`finalComposer` with **no `RenderPass` before it**. But `GTAOPass.OUTPUT.Default`
does **not** render the scene — it reads the beauty already living in the
composer's `readBuffer` and blends AO on top:

```js
// node_modules/three/.../GTAOPass.js — OUTPUT.Default branch
this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture;  // EMPTY → black
```

With no `RenderPass` filling that buffer, `readBuffer` was empty → the beauty pass
output pure black → only the separately-rendered bloom layer bled through on top.

**Fix:** Add `new RenderPass(scene, camera)` **before** `GTAOPass` so the scene
populates the composer's `readBuffer`. (`QUALITY.LOW` already had a `RenderPass`
and worked fine; `HIGH` needs it too.)

```js
if (q.ao) {
  this.finalComposer.addPass(new RenderPass(this.scene, this.camera)); // <-- required
  this.gtao = new GTAOPass(this.scene, this.camera, w, h);
  this.gtao.output = GTAOPass.OUTPUT.Default; // composites AO onto the beauty render
  this.gtao.blendIntensity = POST.AO_INTENSITY;
  this.finalComposer.addPass(this.gtao);
}
```

**Gotcha to remember:** In Three.js's `EffectComposer`, *compositing* passes
(`GTAOPass`, `SAOPass`, custom `ShaderPass`es) consume the previous pass's output.
They are **not** scene renders — you must always have a `RenderPass` (or equivalent
source) earlier in the chain. A correct chain is: `RenderPass → (compositors) → OutputPass`.

**How it was verified:** Headless Chrome screenshot (SwiftShader software WebGL)
gave mean brightness 124.2/255 with 0.0% black pixels across all 921,600 pixels,
versus the broken build's near-pure-black frame. See the headless verification recipe
in `docs/PROGRESS.md §2`.
