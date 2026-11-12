import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { renderSize, view } from './res';
// Fonts are bundled with the game (CrazyGames doesn't allow external CDNs). Latin subset only = small.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/bungee/latin-400.css';

// Wait (max ~1.5 s) for the fonts so Phaser text doesn't render in the fallback font.
const fonts = ['400 20px "Inter"', '600 20px "Inter"', '700 20px "Space Grotesk"', '400 20px "Bungee"'];
await Promise.race([
  Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null))),
  new Promise((r) => setTimeout(r, 1500)),
]);

const parent = document.getElementById('app')!;
const start = renderSize(parent.clientWidth, parent.clientHeight);
view.zoom = start.zoom;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#1b1e24',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: start.width,
    height: start.height,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1.1 },
      // more iterations = fewer "ball falls through the line" bugs at speed
      positionIterations: 10,
      velocityIterations: 8,
      debug: false,
      autoUpdate: false, // we step physics ourselves at a fixed 60 Hz (see GameScene.update)
    },
  },
  scene: [GameScene],
});

// Re-shape the game when the window/iframe is resized or the phone is rotated
let t = 0;
const onResize = () => {
  clearTimeout(t);
  t = window.setTimeout(() => {
    const s = renderSize(parent.clientWidth, parent.clientHeight);
    if (s.width !== game.scale.gameSize.width || s.height !== game.scale.gameSize.height) {
      view.zoom = s.zoom;
      game.scale.setGameSize(s.width, s.height);
    }
  }, 80);
};
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

// Portal hygiene: no right-click menu, no page scrolling from game keys
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => { if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault(); });

// Debug hooks for automated playtests — only when opened as a local file or with ?debug
if (location.protocol === 'file:' || location.search.includes('debug')) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
  import('./systems/Sfx').then((m) => ((window as unknown as { __sfx: unknown }).__sfx = m.sfx));
}
