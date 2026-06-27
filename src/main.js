import { Game } from './core/Game.js';

const container = document.getElementById('app');

try {
  const game = new Game(container);
  game.start();
  // Expose for debugging in the console.
  window.__game = game;
} catch (err) {
  console.error('Failed to start Forest Defender:', err);
  const hint = document.querySelector('#boot .hint');
  if (hint) hint.textContent = 'Error: ' + err.message;
}
