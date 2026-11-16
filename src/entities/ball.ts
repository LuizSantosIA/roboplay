import Matter from 'matter-js';
import { CAT } from '../config';
import { Entity } from './entity';
import type { Game } from '../game';

export class Ball extends Entity {
  kind = 'ball' as const;
  r = 12;
  spin = 0;
  floatT = 0;

  constructor(x: number, y: number) {
    super();
    this.radius = 12;
    this.height = 24;
    this.bounce = 0.62;
    this.groundFriction = 0.025;
    this.airFriction = 0.002;
    this.groundMask = CAT.ROBOT | CAT.OBJ | CAT.WALL | CAT.SOLID;
    this.body = Matter.Bodies.circle(x, y, 11, {
      frictionAir: 0.025,
      restitution: 0.85,
      friction: 0.01,
      density: 0.0012,
      label: 'ball',
      collisionFilter: { category: CAT.OBJ, mask: this.groundMask },
    });
    this.setPos(x, y);
  }

  update(dt: number) {
    if (this.body) this.spin += this.body.velocity.x * 60 * dt / this.r;
    this.floatT += dt;
  }

  onLand(impact: number, g: Game) {
    if (impact > 260) g.audio.bounce(Math.min(1, impact / 900));
  }

  hitTest(wx: number, wy: number) {
    const s = this.scale;
    const cy = this.y - this.z - this.r * s;
    return Math.hypot(wx - this.x, wy - cy) < (this.r + 10) * s;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const s = this.scale;
    if (!this.carriedBy) this.drawShadow(ctx, 13, 4.5);
    const r = this.r * s;
    let cy = this.y - this.z - r;
    if (this.inWater) cy += 8 * s + Math.sin(this.floatT * 3) * 1.5;
    const cx = this.x;
    ctx.save();
    if (this.inWater) {
      ctx.beginPath();
      ctx.rect(cx - 30, cy - 40, 60, this.y + 1 - (cy - 40));
      ctx.clip();
    }
    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#d9dde3');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#26303a';
    for (let i = 0; i < 3; i++) {
      const a = this.spin + (i * Math.PI * 2) / 3;
      const px = cx + Math.cos(a) * r * 0.62;
      const py = cy + Math.sin(a) * r * 0.25;
      ctx.beginPath();
      ctx.arc(px, py, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(30,40,50,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
