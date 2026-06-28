# Enhancements Log

Running log of **enhancements, polish, and creative changes** made to ForestDefenderII
*after* the migration from the original Godot version. This is the place to record
intentional improvements (visual, gameplay, feel) — as opposed to bug fixes and
performance gotchas, which live in [`AGENTS.md`](../AGENTS.md).

> **AI coding agents:** when you add or refine a feature/asset/visual beyond a bug fix,
> append a dated entry to the **top** of this file. Keep each entry focused: what changed,
> which files, and why it's better. See the note at the top of `AGENTS.md`.

<!-- Append newest entry to the top. -->

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
