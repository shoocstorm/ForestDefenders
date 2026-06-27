# Agent Notes

<!-- Running log of non-obvious bugs, gotchas, and fixes discovered by coding agents.
     Append newest entry to the top. Keep each entry focused: symptom, root cause, fix. -->

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
