import Phaser from 'phaser';
import type { Theme } from '../theme';

const R = 16;
const BASE_SPEED = 5;     // px per physics step (~300 px/s)
const MAX_TARGET = 9;     // target speed late in the run
const ACCEL = 0.12;
const SPEED_CAP = 16;     // hard cap against tunneling

export class BallController {
  body: MatterJS.BodyType;
  private gfx: Phaser.GameObjects.Graphics;
  readonly startX: number;

  constructor(private scene: Phaser.Scene, x: number, y: number, private theme: Theme) {
    this.startX = x;
    this.body = scene.matter.add.circle(x, y, R, {
      friction: 0.05,
      frictionAir: 0.0005,
      restitution: 0.05,
      density: 0.002,
      label: 'ball',
    });
    scene.matter.body.setVelocity(this.body, { x: BASE_SPEED, y: 0 });
    this.gfx = scene.add.graphics().setDepth(6);
  }

  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  update() {
    const travelled = this.x - this.startX;
    const target = Math.min(MAX_TARGET, BASE_SPEED + travelled / 5000);
    let { x: vx, y: vy } = this.body.velocity;
    if (vx < target) vx = Math.min(target, vx + ACCEL);
    const sp = Math.hypot(vx, vy);
    if (sp > SPEED_CAP) { vx *= SPEED_CAP / sp; vy *= SPEED_CAP / sp; }
    this.scene.matter.body.setVelocity(this.body, { x: vx, y: vy });

    const a = this.body.angle;
    this.gfx.clear();
    const th = this.theme;
    if (th.ballGlow) {
      this.gfx.fillStyle(th.ball, 0.12).fillCircle(this.x, this.y, R + 12);
      this.gfx.fillStyle(th.ball, 0.25).fillCircle(this.x, this.y, R + 5);
    }
    if (th.id === 'pop') this.gfx.fillStyle(0x111111, 1).fillCircle(this.x + 3, this.y + 4, R + 2);
    this.gfx.fillStyle(th.ball, 1).fillCircle(this.x, this.y, R);
    if (th.id === 'pop') this.gfx.lineStyle(4, 0x111111, 1).strokeCircle(this.x, this.y, R);
    this.gfx.lineStyle(3, th.ballMark, 0.8)
      .lineBetween(this.x, this.y, this.x + Math.cos(a) * R, this.y + Math.sin(a) * R);
  }
}
