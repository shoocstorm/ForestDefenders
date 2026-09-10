# Enhancements Log

Running log of **enhancements, polish, and creative changes** made to ForestDefenderII
*after* the migration from the original Godot version. This is the place to record
intentional improvements (visual, gameplay, feel) — as opposed to bug fixes and
performance gotchas, which live in [`AGENTS.md`](../AGENTS.md).

> **AI coding agents:** when you add or refine a feature/asset/visual beyond a bug fix,
> append a dated entry to the **top** of this file. Keep each entry focused: what changed,
> which files, and why it's better. See the note at the top of `AGENTS.md`.

<!-- Append newest entry to the top. -->

## Dramatic jump kick — 3-phase choreography, swoosh crescents, impact juice

**Date:** 2026-09-09 · **Files:** `src/entities/HeroModel.js`,
`src/entities/Player.js`, `src/vfx/VFX.js`

The V-key flying kick is now a set-piece move (gameplay timing/damage/collision
unchanged — pure presentation):

- **Choreography** (0.75s, was 0.6s): a readable COIL (crouch dip, hips twist
  +0.55 rad, kick leg cocks −1.25 rad back, arms gather) → explosive EXTENSION
  (body whips near-horizontal, hips unwind −1.05 rad through, kick leg swings a
  2.9 rad arc up and over, support leg trails, head tracks the kick line,
  tail counter-swings, ears pin back in the slipstream) → RECOVER with an
  overshoot wobble and a full release of every coil offset.
- **Twin swoosh crescents** sweep the kick plane lagging the foot — white-hot
  lead + gold accent, additive, bloom-layer, scaling up and fading through the
  extension (built once, pooled, hidden between kicks).
- **Arm whip now actually renders**: it is applied AFTER the two-bone IK solve
  as additive local rotation (the old pre-IK pose write was dead code — the
  solver overwrote it every frame).
- **Impact**: `VFX.melee` upgraded to a tailSwing-class recipe (twin flash
  lights, white-hot blast cores, accent spark fan + hard white leading edge,
  twin shockwave ripples, debris chunks); camera gets heavier shake (0.65) plus
  an FOV punch via the weapon-recoil hook.

Verified headless: leg sweep −1.25→+1.65 with 2.9 rad total travel, body twist
+0.55→−0.5, arcs visible only during 0.2–0.72s with peak opacity 1, arm whip
1.1 rad at peak, ear pin 0.45 rad, all joints restore to rest (legR 0,
body twist 0), player kick + melee smoke paths clean, 0 errors.

## Shootable hot-air balloons — catch fire, char, fall, respawn

**Date:** 2026-09-07 · **Files:** `src/world/SkyDecor.js`,
`src/weapons/Projectile.js`, `src/core/Game.js`

The sky is now interactive — a fun long-shot mini-game between waves:

- Each biome's FIRST balloon drifts near enough to shoot (z 86–118, y 30–55,
  wrapping within the arena's airspace so it stays reachable); the rest remain
  far painted backdrop (long-range snipes on them still work).
- Shooting one pays **+10 gold** (floating label + fire hit sound), and the
  balloon runs a full burn sequence: envelope chars while fire flickers up the
  crown and the burner flares → it loses lift, sags and tips → accelerating
  fall with a worsening wobble, still burning → despawn → respawns fresh
  (paint restored) after a 5–9s pause. AOE weapons additionally detonate a
  distant flash.
- Bullets now get an +80u grace band beyond the arena bounds (lifetime still
  caps cleanup) so sky shots can leave the field; hit test is wired through
  `ctx.shootSky` → `Arena.sky.tryHit`.

Verified headless: aimed bullet connects mid-flight (tick 156), gold paid,
burn → fall → gone → respawn cycle with restored materials, misses trigger
nothing, direct hit test + miss test, 0 errors.

## Bullet visual redesign — comet trails, glow halos, punchy cores, miss pops

**Date:** 2026-09-07 · **Files:** `src/weapons/Projectile.js`

Every projectile now layers three reads instead of one flat colored shape:

- **Comet trails** — ONE global additive Points cloud (fixed 64-bullet × 16-point
  ring buffer, one draw call, zero per-frame allocation) with a custom shader:
  per-point color lifted toward white (hot-core spark read), fade-driven size
  taper, ~0.3s lingering tail after death so kills leave a fading streak. Trail
  length varies per style (tracer 16, shard 14, fire 12, orb 10 …; the slow EMP
  ring gets none). Enemy fireballs get ember trails for free — better dodge
  readability.
- **Additive halo sprites** on energy styles (orb, shard, fire, ring): a shared
  radial glow texture, colored + sized per shot, positioned as a *sibling* of
  the mesh so non-uniform style scales (stretched tracers) can't squash the
  round glow. Solid physical shots (acorn, pellet, arrow, tracer) stay clean.
- **Tone-punchy cores** — bullet materials are `toneMapped: false`, so colors
  render pre-ACES and stay hot instead of washing out.
- **Miss pops** — ground skids, burnouts and range expiries now fire a small
  hitSpark so even misses sparkle (hit deaths already sparked; AOE detonates).

Verified headless: all 8 styles fire with correct halo visibility, trails fill
16/16 points, light budget unchanged (6, no leaks), trails fully fade after
expiry, `clear()` wipes tails on level load, 0 console errors.

## Simpler cartoon face + "confectionery lilac" hero theme

**Date:** 2026-09-07 · **Files:** `src/entities/HeroModel.js`

Third hero pass: fewer, bolder facial parts and a new palette theme.

- **Minimal cartoon face** — authored head meshes 33→**19**: removed the
  forehead patch, blush halo, whiskers, brows, eye iris + second catchlight,
  and ear tufts/beads. Eyes are now solid deep-plum beans with ONE big white
  catchlight (classic minimal-cartoon eye); ears are bare lilac+rose bubbles;
  blush is a single flat bright sticker dot (strongly self-lit so it stays
  rose in every light band); nose/smile/teeth slightly bolder.
- **New theme: "confectionery lilac"** — soft lilac fur (0xc5b3e6) with plum
  shading (0x8d6fae), warm vanilla cream, rose ear-inner/blush, honey-gold
  energy glow (gem/tail). The violet family pops in all three biomes (mint L1,
  complementary against L2's ember, bright against L3's dark indigo) where the
  old honey-orange blended into Ember Hollow.
- **Fixed a latent bug:** the blush sphere had been geometrically embedded
  inside the cheek puff (invisible) since the previous pass — repositioned to
  poke clearly through the cheek surface and verified by projecting its screen
  position and sampling the exact pixels (rose 227/187/193 vs plum fur ~50).
- All contracts re-verified: head:torso 1.43, eye height 31% of head, feet
  +0.012 off ground, IK grip error 0.000, blink + ear-twitch fire, 0 errors.

## Even cuter hero — deeper chibi proportions, baby-face eyes, blush, charm motion

**Date:** 2026-09-07 · **Files:** `src/entities/HeroModel.js`

Second cuteness pass on the procedural squirrel, this time against a written
quality contract with measured before/after values (all rig/interface contracts
preserved — IK, muzzle, one-shots, weapon swap):

- **Proportions**: head-subtree:torso height 1.08→**1.43** (head ball Ø 1.24×
  torso Ø), smaller round pear torso, chibi-stub limbs with chunkier mitts and
  plush feet (feet no longer sink −0.03 below ground: now +0.012).
- **Face**: eyes 0.13→**0.18u tall (30% of head height)**, re-set low and wide
  (baby-face), each in a named eye group so it can blink; two-tone blush
  (vivid core + soft halo — face-crop pink pixels 10→**233**); shorter rounder
  muzzle; rounder, wider, outward-tilted koala ears; smaller calmer brows.
- **Palette**: lighter honey fur, warmer walnut, brighter cream/pinks, warmer
  near-black detailing, brighter amber iris.
- **Charm motion**: periodic random blink (group squash 1→0.06→1), random ear
  twitch, slow curious head tilt while idling, calmer deeper breathing, bigger
  lazy tail sway with a secondary curl.
- **Tail**: plume segments ~15% bigger — the signature squirrel sweep reads
  even from the over-shoulder camera.

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
