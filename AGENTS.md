# Agent Notes

<!-- Running log of non-obvious bugs, gotchas, and fixes discovered by coding agents.
     Append newest entry to the top. Keep each entry focused: symptom, root cause, fix. -->

> **For AI coding agents:** This file is the log for **bugs, gotchas, and fixes**.
> Feature work, polish, and creative/visual improvements made *after the migration from
> the original Godot version* go in [`docs/ENHANCEMENTS.md`](docs/ENHANCEMENTS.md) instead.
> Keep **both** files current: when you fix a non-obvious bug, append here; when you add or
> refine a feature/asset/visual, append to `docs/ENHANCEMENTS.md`. Newest entry on top in
> both. This running history is how future agents avoid re-deriving past decisions.

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
