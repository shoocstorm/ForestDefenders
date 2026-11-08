import './ui/Theme.js'; // injects the shared sci-fi UI skin (must load first)
import './firebase.js'; // Firebase app + Analytics (non-blocking)
import { Game } from './core/Game.js';
import { loadAll } from './core/Assets.js';
import { CAMPAIGN } from './config/Constants.js';

const container = document.getElementById('app');
const boot = document.getElementById('boot');
const hint = boot?.querySelector('.hint');

function setHint(text) { if (hint) hint.textContent = text; }

// Short flavour text per campaign level for the landing cards.
const LEVEL_DESC = {
  L1: 'Drifting fog and gentle foes — a calm start.',
  L2: 'Smouldering ash and fierce fire shrooms.',
  L3: 'Old roots stir — the toughest stand awaits.',
};

// Build the level-select landing screen. Can be called multiple times.
function showLevelSelect() {
  const landing = document.getElementById('landing');
  const list = landing.querySelector('.levels');
  list.innerHTML = '';
  CAMPAIGN.forEach((lvl, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'level';
    card.innerHTML =
      `<div class="num">LEVEL ${i + 1}</div>` +
      `<div class="name">${lvl.name}</div>` +
      `<div class="desc">${LEVEL_DESC[lvl.biome] || ''}</div>`;
    card.addEventListener('click', () => {
      landing.classList.remove('show');
      // Use the globally exposed game instance to load the level
      if (window.__game) {
        window.__game.loadLevel(i);
        window.__game.start();
      }
    });
    list.appendChild(card);
  });
  landing.classList.add('show');
}

(async () => {
  try {
    // All GLB models load up-front so gameplay code can build entities
    // synchronously and never null-check a model.
    await loadAll((p, key) => setHint(`Loading ${key}… ${Math.round(p * 100)}%`));
    setHint('Building world…');
    const game = new Game(container);
    // Expose for debugging in the console.
    window.__game = game;

    // Hide the loading overlay and let the player pick a level. The landing
    // screen is fully opaque, so nothing behind it is visible — don't call
    // game.start() here, or the sim (waves, damage, defeat) runs invisibly
    // behind the menu before the player has chosen anything. Each level card
    // already calls loadLevel() + start() on click.
    boot?.classList.add('hidden');
    showLevelSelect();
  } catch (err) {
    console.error('Failed to start Forest Defender:', err);
    console.error(err.stack || err);
    setHint('Error: ' + (err.message || err));
  }
})();

// --- HMR cleanup (Bun dev server hot reload) ---
// Before the module is re-evaluated, dispose the old Game instance to release the
// WebGL context and remove the stale canvas from the DOM. Without this, each HMR
// cycle creates a new WebGLRenderer + WebGL context, accumulating GPU resources
// and eventually causing high CPU / Chrome GPU process bloat.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (window.__game) {
      console.log('[HMR] dispose() called — tearing down old Game instance');
      window.__game.dispose();
      window.__game = null;
      console.log('[HMR] old Game disposed, module will re-evaluate');
    }
  });
}
