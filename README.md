# Forest Defender II — Three.js

Three.js re-implementation of **Forest Defender: Mushroom Mayhem** (originally Godot).
Design specs live in `../ForestDefender/docs/design/*.md`.

## Run

Uses [Bun](https://bun.sh) (1.3+) for dependency install, dev server, and bundling — no Node/Vite required.

```bash
bun install
bun run dev      # http://localhost:3000 (Bun dev server + HMR)
bun run build    # production bundle in dist/
```

Click the canvas to capture the mouse (pointer-lock look).

## Controls (current)

| Action | Input |
|---|---|
| Move | WASD / arrows |
| Run | Shift (held) |
| Jump / double-jump | Space (×2) |
| Look | Mouse |
| Camera mode | 1 = first-person · 2 = third-person · 3 = top-down |

## Architecture

```
src/
  main.js               entry point
  core/
    Game.js             renderer, scene, fixed-step loop, systems registry
    Input.js            keyboard/mouse + pointer-lock
    CameraRig.js        3 camera modes, mouse-look, shake/recoil hooks
  config/Constants.js   all tuning values + elemental matrix (from specs)
  util/MathUtils.js     clamp/lerp/damp/angle helpers
  world/Arena.js        Misty Forest biome: ground, lights, fog, trees, platform, boss landmark
  entities/
    HeroModel.js        procedural "Squrriel" hero (primitives + named pivots)
    Player.js           movement controller + procedural locomotion animator
```

