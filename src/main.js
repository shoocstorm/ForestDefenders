import { Game } from './core/Game.js';
import { loadAll } from './core/Assets.js';

const container = document.getElementById('app');
const boot = document.getElementById('boot');
const hint = boot?.querySelector('.hint');

function setHint(text) { if (hint) hint.textContent = text; }

(async () => {
  try {
    // All GLB models load up-front so gameplay code can build entities
    // synchronously and never null-check a model.
    await loadAll((p, key) => setHint(`Loading ${key}… ${Math.round(p * 100)}%`));
    setHint('Building world…');
    const game = new Game(container);
    game.start();
    // Expose for debugging in the console.
    window.__game = game;
  } catch (err) {
    console.error('Failed to start Forest Defender:', err);
    console.error(err.stack || err);
    setHint('Error: ' + (err.message || err));
  }
})();
