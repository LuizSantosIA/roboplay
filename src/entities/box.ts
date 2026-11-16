import Matter from 'matter-js';
import { CAT } from '../config';
import { roundRect, shade } from '../util';
import { Entity } from './entity';
import type { Game } from '../game';

export type BoxColor = 'madeira' | 'vermelha' | 'azul' | 'amarela' | 'metal';
export const BOX_COLORS: Record<BoxColor, string> = {
  madeira: '#c8894a',
  vermelha: '#e0483e',
  azul: '#3a7be0',
  amarela: '#f2c230',
  metal: '#9aa4ad',
};

export class Box extends Entity {
  kind = 'box' as const;
  color: BoxColor;
  size = 32;
  sinkT = 0; // animação de afundar
  floatT = Math.random() * 10;
  sorted = false;

  constructor(x: number, y: number, color: BoxColor = 'madeira') {
    super();
    this.color = color;
    this.radius = 16;
    this.height = 30;
    this.canStackOn = true;
    this.bounce = 0.15;
    this.groundFriction = 0.14;
    this.groundMask = CAT.ROBOT | CAT.OBJ | CAT.WALL | CAT.SOLID;
    this.body = Matter.Bodies.rectangle(x, y, 32, 16, {
      inertia: Infinity,
      frictionAir: 0.14,
      friction: 0.05,
      restitution: 0.2,
      density: 0.004,
      label: 'box',
      collisionFilter: { category: CAT.OBJ, mask: this.groundMask },
    });
    this.setPos(x, y);
  }

  /** Madeira boia, metal afunda. */
  get floats() {
    return this.color !== 'metal';
  }

  sortKey() {
    if (this.restingOn) return this.restingOn.sortKey() + 0.01;
    return super.sortKey();
  }

  onLand(impact: number, g: Game) {
    if (impact > 260) g.audio.thud(Math.min(1, impact / 900));
  }

  draw(ctx: CanvasRenderingContext2D, g: Game) {
    const s = this.scale;
    if (!this.carriedBy && !this.restingOn) this.drawShadow(ctx, 20, 6);
    const base = BOX_COLORS[this.color];
    const w = this.size * s;
    const h = this.height * s;
    const d = 9 * s; // profundidade do topo
    let x = this.x - w / 2;
    let y = this.y - this.z - h;
    let clipWater = 0;
    if (this.inWater) {
      const bob = Math.sin(this.floatT * 2.5) * 2;
      y += this.floats ? 10 * s + bob : 10 * s + this.sinkT * 40;
      clipWater = this.y + 2;
    }
    ctx.save();
    if (clipWater) {
      ctx.beginPath();
      ctx.rect(x - 20, y - 40, w + 40, clipWater - (y - 40));
      ctx.clip();
      if (!this.floats) ctx.globalAlpha = Math.max(0, 1 - this.sinkT);
    }
    // topo
    ctx.fillStyle = shade(base, 0.25);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - 3 * s, y - d);
    ctx.lineTo(x + 3 * s, y - d);
    ctx.closePath();
    ctx.fill();
    // frente
    ctx.fillStyle = base;
    roundRect(ctx, x, y, w, h, 3 * s);
    ctx.fill();
    ctx.strokeStyle = shade(base, -0.35);
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();
    if (this.color === 'madeira') {
      ctx.strokeStyle = shade(base, -0.25);
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(x + 3 * s, y + 3 * s);
      ctx.lineTo(x + w - 3 * s, y + h - 3 * s);
      ctx.moveTo(x + w - 3 * s, y + 3 * s);
      ctx.lineTo(x + 3 * s, y + h - 3 * s);
      ctx.stroke();
      ctx.strokeRect(x + 3 * s, y + 3 * s, w - 6 * s, h - 6 * s);
    } else if (this.color === 'metal') {
      ctx.fillStyle = shade(base, -0.3);
      for (const [px, py] of [[5, 5], [w / s - 5, 5], [5, h / s - 5], [w / s - 5, h / s - 5]]) {
        ctx.beginPath();
        ctx.arc(x + px * s, y + py * s, 1.8 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `bold ${13 * s}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const sym = this.color === 'vermelha' ? '●' : this.color === 'azul' ? '■' : '▲';
      ctx.fillText(sym, x + w / 2, y + h / 2 + 1);
    }
    ctx.restore();
    void g;
  }
}
