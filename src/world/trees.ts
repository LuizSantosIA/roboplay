import Matter from 'matter-js';
import { CAT, depthScale } from '../config';
import { rand, seeded } from '../util';
import { Apple } from '../entities/apple';
import type { Game, Prop } from '../game';
import type { Obstacle } from './pathing';

export type TreeType = 'pinheiro' | 'redonda' | 'macieira';

export class Tree implements Prop {
  x: number;
  y: number;
  type: TreeType;
  size: number;
  apples = 0;
  maxApples = 6;
  regrowT = 0;
  shakeT = 0;
  phase = Math.random() * 6;
  minX: number;
  maxX: number;
  obstacle: Obstacle;
  appleSpots: { x: number; y: number }[] = [];
  body: Matter.Body;

  constructor(x: number, y: number, type: TreeType, size = 1) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.size = size * depthScale(y);
    this.minX = x - 80;
    this.maxX = x + 80;
    this.obstacle = { kind: 'ellipse', x, y, rx: 12, ry: 6, active: true };
    this.body = Matter.Bodies.circle(x, y, 9, {
      isStatic: true,
      label: 'tree',
      collisionFilter: { category: CAT.SOLID, mask: 0xffff },
    });
    if (type === 'macieira') {
      this.apples = this.maxApples;
      const r = seeded(Math.floor(x));
      for (let i = 0; i < this.maxApples; i++) {
        const a = r() * Math.PI * 2;
        const d = 0.3 + r() * 0.6;
        this.appleSpots.push({ x: Math.cos(a) * 34 * d, y: Math.sin(a) * 26 * d });
      }
    }
  }

  get crownH() {
    return (this.type === 'pinheiro' ? 120 : 95) * this.size;
  }

  /** Ponto onde um pássaro pousa. */
  perchPoint(i: number) {
    const s = this.size;
    if (this.type === 'pinheiro') return { x: this.x + (i % 2 ? 14 : -14) * s, z: (62 + (i % 3) * 18) * s };
    return { x: this.x + (i % 2 ? 22 : -20) * s + ((i * 7) % 9), z: (118 + (i % 2) * 6) * s };
  }

  sortKey() {
    return this.y;
  }

  update(dt: number) {
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.type === 'macieira' && this.apples < this.maxApples) {
      this.regrowT += dt;
      if (this.regrowT > 12) {
        this.regrowT = 0;
        this.apples++;
      }
    }
  }

  hit(wx: number, wy: number) {
    if (this.type !== 'macieira') return false;
    const s = this.size;
    return Math.abs(wx - this.x) < 50 * s && wy < this.y + 4 && wy > this.y - 150 * s;
  }

  onTap(g: Game) {
    this.shakeT = 0.5;
    if (this.apples <= 0) {
      g.hud?.toast('Sem maçãs agora. Espere crescerem!');
      return;
    }
    this.apples--;
    const spot = this.appleSpots[this.apples];
    const a = g.add(new Apple(this.x + spot.x * this.size, this.y + rand(8, 18)));
    a.z = (100 + spot.y) * this.size;
    a.vz = 40;
    g.audio.pop();
    g.emit('appleDrop', a);
  }

  draw(ctx: CanvasRenderingContext2D, g: Game) {
    const s = this.size;
    const snow = g.world.weather.snowCover;
    const sway = Math.sin(g.time * 1.3 + this.phase) * 1.5 + (this.shakeT > 0 ? Math.sin(this.shakeT * 50) * 4 : 0);
    ctx.save();
    ctx.translate(this.x, this.y);
    // sombra
    ctx.fillStyle = 'rgba(20,40,10,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 38 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (this.type === 'pinheiro') {
      ctx.fillStyle = '#6b4a2e';
      ctx.fillRect(-5 * s, -26 * s, 10 * s, 26 * s);
      const layers = 4;
      for (let i = 0; i < layers; i++) {
        const w = (48 - i * 9) * s;
        const yb = (-20 - i * 26) * s;
        const yt = yb - 46 * s;
        const sx = sway * (i + 1) * 0.4;
        ctx.fillStyle = i % 2 ? '#2f7d4a' : '#2a6f42';
        ctx.beginPath();
        ctx.moveTo(-w + sx * 0.5, yb);
        ctx.lineTo(w + sx * 0.5, yb);
        ctx.lineTo(sx, yt);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.moveTo(sx, yt);
        ctx.lineTo(-w + sx * 0.5, yb);
        ctx.lineTo(-w * 0.3 + sx * 0.5, yb);
        ctx.closePath();
        ctx.fill();
        if (snow > 0.05) {
          ctx.fillStyle = `rgba(255,255,255,${0.95 * snow})`;
          ctx.beginPath();
          ctx.moveTo(sx, yt);
          ctx.lineTo(-w * 0.45 + sx * 0.5, yt + 22 * s);
          ctx.quadraticCurveTo(sx, yt + 28 * s, w * 0.45 + sx * 0.5, yt + 22 * s);
          ctx.closePath();
          ctx.fill();
        }
      }
    } else {
      ctx.strokeStyle = '#6b4a2e';
      ctx.lineCap = 'round';
      ctx.lineWidth = 11 * s;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(2 * s, -40 * s, sway * 0.5, -70 * s);
      ctx.stroke();
      ctx.lineWidth = 5 * s;
      ctx.beginPath();
      ctx.moveTo(0, -48 * s);
      ctx.lineTo(-16 * s, -70 * s);
      ctx.moveTo(1 * s, -55 * s);
      ctx.lineTo(18 * s, -76 * s);
      ctx.stroke();
      const cy = -100 * s;
      const base = this.type === 'macieira' ? '#3e9a4a' : '#4aa851';
      const blobs = [[0, 0, 40], [-28, 10, 28], [28, 8, 30], [-14, -20, 28], [16, -22, 26], [0, 18, 28]];
      ctx.fillStyle = '#2f7d3c';
      for (const [bx, by, br] of blobs) {
        ctx.beginPath();
        ctx.arc(bx * s + sway, cy + by * s + 4 * s, br * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = base;
      for (const [bx, by, br] of blobs) {
        ctx.beginPath();
        ctx.arc(bx * s + sway - 2 * s, cy + by * s, br * s * 0.92, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.arc(-12 * s + sway, cy - 18 * s, 18 * s, 0, Math.PI * 2);
      ctx.fill();
      if (snow > 0.05) {
        ctx.fillStyle = `rgba(255,255,255,${0.95 * snow})`;
        for (const [bx, by, br] of blobs) {
          if (by > 5) continue;
          ctx.beginPath();
          ctx.ellipse(bx * s + sway - 2 * s, cy + by * s - br * s * 0.62, br * s * 0.7, br * s * 0.32, 0, Math.PI, 0);
          ctx.fill();
        }
      }
      if (this.type === 'macieira') {
        for (let i = 0; i < this.apples; i++) {
          const p = this.appleSpots[i];
          const ax = p.x * s + sway;
          const ay = cy + p.y * s;
          ctx.fillStyle = '#e23b3b';
          ctx.beginPath();
          ctx.arc(ax, ay, 5 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath();
          ctx.arc(ax - 1.5 * s, ay - 1.5 * s, 1.4 * s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
}
