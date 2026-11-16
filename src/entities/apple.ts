import Matter from 'matter-js';
import { CAT } from '../config';
import { Entity } from './entity';
import type { Game } from '../game';

export class Apple extends Entity {
  kind = 'apple' as const;
  floatT = 0;
  constructor(x: number, y: number) {
    super();
    this.radius = 8;
    this.height = 14;
    this.bounce = 0.35;
    this.groundFriction = 0.08;
    this.groundMask = CAT.ROBOT | CAT.OBJ | CAT.WALL | CAT.SOLID;
    this.body = Matter.Bodies.circle(x, y, 6, {
      frictionAir: 0.08,
      restitution: 0.4,
      density: 0.001,
      label: 'apple',
      collisionFilter: { category: CAT.OBJ, mask: this.groundMask },
    });
    this.setPos(x, y);
  }
  update(dt: number) {
    this.floatT += dt;
  }
  onLand(impact: number, g: Game) {
    if (impact > 200) g.audio.bounce(0.3);
  }
  draw(ctx: CanvasRenderingContext2D) {
    const s = this.scale;
    if (!this.carriedBy) this.drawShadow(ctx, 8, 3);
    const r = 7 * s;
    const cx = this.x;
    let cy = this.y - this.z - r;
    if (this.inWater) cy += 5 + Math.sin(this.floatT * 3) * 1.2;
    ctx.fillStyle = '#e23b3b';
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy, r * 0.75, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.35, cy, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.45, cy - r * 0.3, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6b4a2b';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.6);
    ctx.lineTo(cx + 1 * s, cy - r * 1.2);
    ctx.stroke();
    ctx.fillStyle = '#4caf50';
    ctx.beginPath();
    ctx.ellipse(cx + 3.5 * s, cy - r * 1.05, 3.5 * s, 1.8 * s, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
