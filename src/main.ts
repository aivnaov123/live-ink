import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

// Wait (max ~1.5 s) for web fonts so Phaser text doesn't render in the fallback font.
const fonts = ['600 20px "Inter"', '700 20px "Space Grotesk"', '400 20px "Bungee"'];
await Promise.race([
  Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null))),
  new Promise((r) => setTimeout(r, 1500)),
]);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#1b1e24',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 540,
    height: 960,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1.1 },
      // more iterations = fewer "ball falls through the line" bugs at speed
      positionIterations: 10,
      velocityIterations: 8,
      debug: false,
    },
  },
  scene: [GameScene],
});
(window as any).__game = game; // debug hook for automated playtests
