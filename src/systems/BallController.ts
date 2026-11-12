import Phaser from 'phaser';
import type { Theme } from '../theme';
import { BALLS, getBall } from '../skins';
import { targetSpeed } from './Difficulty';

export const BALL_R = 16;
const R = BALL_R;
const BASE_SPEED = 5;     // px per physics step (~300 px/s)
const ACCEL = 0.25;       // motor: strong enough to climb ~35° ramps at target speed
const SPEED_CAP = 16;     // hard cap against tunneling
const STEP = 1000 / 60;   // physics step (ms), must match GameScene
const STICK = 0.18;       // extra downward accel while on a surface (gravity is ~0.3 per step)

export class BallController {
  body: MatterJS.BodyType;
  private gfx: Phaser.GameObjects.Graphics;
  readonly startX: number;
  // previous physics state, for smooth interpolation between 60 Hz steps
  private px: number; private py: number; private pa = 0;
  /** Interpolated position actually shown on screen (camera follows this). */
  rx: number; ry: number;
  skin = getBall();

  constructor(private scene: Phaser.Scene, x: number, y: number, private theme: Theme) {
    this.startX = x;
    this.body = scene.matter.add.circle(x, y, R, {
      friction: 0.05,
      frictionAir: 0.0005,
      restitution: 0,
      density: 0.002,
      label: 'ball',
    });
    scene.matter.body.setVelocity(this.body, { x: BASE_SPEED, y: 0 });
    this.gfx = scene.add.graphics().setDepth(6);
    this.px = this.rx = x; this.py = this.ry = y;
  }

  get color() { return BALLS[this.skin].color ?? this.theme.ball; }
  get x() { return this.body.position.x; }
  get y() { return this.body.position.y; }

  /** Call right before each physics step. */
  savePrev() { this.px = this.x; this.py = this.y; this.pa = this.body.angle; }

  /** Called once per 60 Hz physics step, before the step.
   *  normal: surface normal if the ball is touching ink/ground -> a light "stick" force toward the
   *  surface so it hugs the line instead of hopping over the tiny joints between ink segments. */
  update(normal: { nx: number; ny: number } | null = null) {
    // stick INTO the surface (along -normal), so on ramps it doesn't pull the ball backwards
    if (normal) {
      const f = (this.body.mass * STICK) / (STEP * STEP);
      this.body.force.x -= normal.nx * f;
      this.body.force.y -= normal.ny * f;
    }
    const travelled = this.x - this.startX;
    const target = targetSpeed(travelled / 40); // 40 px = 1 m
    const { x: vx, y: vy } = this.body.velocity;
    // Push with a FORCE instead of overwriting velocity every step: overwriting breaks
    // Matter's resting contact and made the ball micro-bounce. Matter integrates
    // v += F/m * dt², so this force adds exactly `dv` speed this step.
    if (vx < target) {
      const dv = Math.min(ACCEL, target - vx);
      this.body.force.x += (this.body.mass * dv) / (STEP * STEP);
    }
    // Hard cap against tunneling (rarely triggers, so the override is harmless)
    const sp = Math.hypot(vx, vy);
    if (sp > SPEED_CAP) this.scene.matter.body.setVelocity(this.body, { x: (vx * SPEED_CAP) / sp, y: (vy * SPEED_CAP) / sp });
  }

  /** Render once per frame. alpha = how far we are between the last two physics steps (0..1). */
  draw(alpha: number) {
    const x = this.rx = this.px + (this.x - this.px) * alpha;
    const y = this.ry = this.py + (this.y - this.py) * alpha;
    const a = this.pa + (this.body.angle - this.pa) * alpha;
    const th = this.theme, sk = BALLS[this.skin];
    const color = sk.color ?? th.ball, mark = sk.mark ?? th.ballMark;
    const g = this.gfx;
    g.clear();
    if (th.ballGlow) {
      g.fillStyle(color, 0.12).fillCircle(x, y, R + 12);
      g.fillStyle(color, 0.25).fillCircle(x, y, R + 5);
    }
    if (th.id === 'pop') g.fillStyle(0x111111, 1).fillCircle(x + 3, y + 4, R + 2);
    g.fillStyle(color, 1).fillCircle(x, y, R);
    if (sk.ring !== undefined) g.lineStyle(2, sk.ring, 0.9).strokeCircle(x, y, R - 5);
    if (th.id === 'pop') g.lineStyle(4, 0x111111, 1).strokeCircle(x, y, R);
    g.lineStyle(3, mark, 0.85).lineBetween(x, y, x + Math.cos(a) * R, y + Math.sin(a) * R);
  }
}
