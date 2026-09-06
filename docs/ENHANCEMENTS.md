# Enhancements Log

Running log of **enhancements, polish, and creative changes** made to ForestDefenderII
*after* the migration from the original Godot version. This is the place to record
intentional improvements (visual, gameplay, feel) — as opposed to bug fixes and
performance gotchas, which live in [`AGENTS.md`](../AGENTS.md).

> **AI coding agents:** when you add or refine a feature/asset/visual beyond a bug fix,
> append a dated entry to the **top** of this file. Keep each entry focused: what changed,
> which files, and why it's better. See the note at the top of `AGENTS.md`.

<!-- Append newest entry to the top. -->

## Production visual pass: MSAA, sky gradients, ground painting, mist, film polish

**Date:** 2026-09-06 · **Files:** `src/core/PostFX.js`, `src/world/SkyDome.js` (new),
`src/world/GroundFog.js` (new), `src/world/Arena.js`, `src/materials/CelMaterial.js`,
`src/config/Constants.js`

A retail-quality rendering pass. Every biome keeps its identity; each layer was
tuned against headless screenshots of L1/L2/L3.

- **Real anti-aliasing in post mode** — the renderer's canvas `antialias` never
  applied while the composer stack was active (geometry renders into composer
  targets, not the canvas), so every crisp cel edge aliased on High/Balanced.
  The final composer now renders into 4×-MSAA HalfFloat targets (0 on the LOW
  tier; Performance preset bypasses post and keeps canvas AA).
- **Gradient sky domes** (`SkyDome.js`) — the flat `scene.background` colour is
  replaced by a three-stop gradient (zenith/horizon/bottom) with a directional
  sun/moon glow aligned to SkyDecor's sky body, a fine twinkling star field on
  L3, and per-pixel dithering to kill gradient banding. Horizon colours are
  chosen per biome to sit near the fog colour so distant geometry dissolves
  into the sky. Works in the Performance preset too (it's plain scene geometry).
- **Painted ground** — the floor is now a subdivided plane with value-noise
  vertex painting: biome ground→alt-colour patches, fine luminance grain, a
  worn track beside the runway, contact shading grounding the central dais,
  and a soft falloff toward the containment walls.
- **Drifting mist banks** (`GroundFog.js`) — layered soft alpha cards floating
  low over the ground, biome-tinted and drifting; the volumetric-haze look
  (heavy in Misty Forest, smouldering in Ember Hollow, faint moonglow haze in
  Ancient Grove).
- **Final image polish quad** — after the OutputPass: gentle saturation/
  contrast grade, soft vignette, and luminance-weighted animated film grain
  (lighter strengths on the LOW tier).
- **Consistent outline ink weight** — inverted-hull outlines now inflate with
  view distance (capped), so projected line weight stays roughly constant in
  pixels instead of hairline-thin at range — a hand-inked look.
- **Shadow stability** — sun `normalBias` (~1 texel) removes PCF self-shadow
  stripes on curved toon surfaces.

## Performance pass: instancing, light thinning, shadow gating, DOM gating

**Date:** 2026-09-06 · **Files:** `src/world/Arena.js`, `src/world/Water.js`,
`src/world/Lanterns.js`, `src/materials/CelMaterial.js`, `src/ui/HUD.js`,
`src/ui/WorldLabels.js`, `src/core/Game.js`

A broad render/CPU performance pass (paired with the bug fixes logged in
`AGENTS.md` the same date). Visual intent is preserved throughout:

- **Boundary posts + caps instanced** — the containment perimeter's 52 posts +
  52 caps (previously ~104 individual meshes, each with an identical fresh
  `CylinderGeometry`/`SphereGeometry` and each drawn separately in the shadow
  pass) now render as two `InstancedMesh`es. Same for the pond's 14 rim rocks
  (one shared unit dodecahedron + one `InstancedMesh`).
- **Tech-prop materials shared** — `_techProp`'s metal/panel/glow materials are
  built once per level instead of three fresh (identical-param) materials per
  prop (~177 unique materials per level before; each defeated batching and
  carried its own uniform block).
- **Lantern dynamic lights thinned** — every other runway pylon keeps its point
  light (brighter, slightly wider); all 20 pylons still pulse via emissive orb +
  bloom. Cuts ~10 always-on point lights from every lit fragment.
- **Size-gated GLB shadow casters** — `celifyGLTF` no longer marks every mesh
  (eyes, glints, tiny trims) as a shadow caster; parts smaller than ~12% of the
  model's largest dimension skip the sun's shadow pass (161 of 607 painted GLB
  meshes on L1).
- **Outlines frustum-culled** — inverted-hull outlines share their source
  mesh's geometry, so their bounding sphere (and culling) matches the parent;
  they no longer force-render when behind the camera.
- **HUD radar throttled to ~30 Hz** with a cached sweep gradient, and the sweep
  now advances by elapsed time (it used to spin faster on high-refresh
  displays). Stats overlay string/DOM writes are gated on visibility (4 Hz when
  shown). WorldLabels' HP-bar width/background/prompt writes are change-gated
  instead of per-frame.

## Cuter squirrel hero model

**Date:** 2026-07-04 · **Files:** `src/entities/HeroModel.js`

Redesigned the procedural squirrel hero toward a softer storybook/chibi read: warmer
honey-russet palette, oversized rounded head, larger glossy eyes with catchlights,
plumper cream cheeks and muzzle, pink blush, whiskers, rounded ears, chunkier paws and
feet, a softer belly, and a bigger curled tail with cream inner puffs. The existing
rig, weapon pivots, muzzle position contract, and locomotion/recoil animation hooks
remain intact.

## Side-placed sun and moon

**Date:** 2026-07-04 · **Files:** `src/config/Constants.js`

Moved each biome's sky body away from the forward +Z play direction and into a high
side position, so the sun or moon remains part of the atmosphere without sitting in
the player's main sightline during normal combat.

## Brighter sky clouds

**Date:** 2026-07-04 · **Files:** `src/world/SkyDecor.js`

Clouds now use the same Lambert-plus-emissive readability treatment as hot air
balloon envelopes, with a slight lift toward white so each biome keeps its tint while
the cloud clusters read brighter against the sky.

## Stats overlay defaults off

**Date:** 2026-07-04 · **Files:** `src/systems/GameManager.js`,
`src/ui/Settings.js`, `src/core/Game.js`

Changed the Show Stats (FPS) preference to default off for new and migrated saves.
The settings screen now treats only an explicit `showStats: true` as enabled, and the
in-game stats overlay starts hidden unless the player has opted in.

## Taller trees + redesigned road lanterns

**Date:** 2026-06-28 · **Files:** `src/world/Vegetation.js`, `src/world/Lanterns.js`

**Taller trees:** Added a `TALL = 1.45` multiplier applied to `trunkH` only in
`Vegetation._buildTree()`. Because every branch and canopy attachment point is derived
from `trunkH`, boosting the trunk length lifts the whole crown upward while leaving trunk
radius and canopy size untouched — so trees read as taller and more slender rather than
uniformly scaled up. Shrubs (`canopy === 'bush'`) are exempted (`TALL = 1.0`) so ground
cover stays low.

**Road lanterns — more detail, cuter, more characterful:** The path lights were a plain
tapered cylinder + a single floating icosahedron orb. Redesigned each into a little caged
"storybook" fairy lamp, built per-lantern as a `THREE.Group`:

- Splayed **footing** at the base + a tapered **shaft**
- A bronze **collar ring** (torus) and a **cup holder** (cone) cradling the orb
- The warm glowing **orb** now framed by **4 cage ribs**
- A faceted **clay roof hat** (6-sided cone) with a little **brim** (torus)
- A **glowing gold finial** on top — on the bloom layer, so it sparkles with the orb
- Each lantern gets a **random Y rotation** to break up the repetition along the path

Geometries/materials are created **once** and shared across all lanterns (per-orb material
is unique so each can pulse independently) to keep the draw-call/alloc budget tight.
New optional palette keys `cap` / `roof` fall back to bronze / warm-clay, so no biome
config changes are required. `Lanterns.dispose()` was rewritten for the new group-based
structure (remove each group; dispose shared geos/mats once; dispose per-orb materials),
preserving the no-leak cleanup contract documented in `AGENTS.md`.
