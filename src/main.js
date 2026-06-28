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

// Build the level-select landing screen and resolve once the player picks one.
function chooseLevel() {
  const landing = document.getElementById('landing');
  const list = landing.querySelector('.levels');
  list.innerHTML = '';
  return new Promise((resolve) => {
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
        resolve(i);
      });
      list.appendChild(card);
    });
    landing.classList.add('show');
  });
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

    // Hide the loading overlay and let the player pick a level to play directly.
    boot?.classList.add('hidden');
    const level = await chooseLevel();
    game.loadLevel(level);
    game.start();
  } catch (err) {
    console.error('Failed to start Forest Defender:', err);
    console.error(err.stack || err);
    setHint('Error: ' + (err.message || err));
  }
})();
