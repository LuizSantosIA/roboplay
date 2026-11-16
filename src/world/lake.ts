import Matter from 'matter-js';
import { CAT } from '../config';
import { rand, rgb, seeded } from '../util';
import { Box } from '../entities/box';
import { Robot } from '../entities/robot';
import type { Game, Prop } from '../game';
import type { Obstacle } from './pathing';

/** Lago: robôs contornam; bolas e caixas de madeira boiam, caixas de metal afundam (e voltam!). */
export class Lake implements Prop {
  x: number;
  y: number;
  rx: number;
  ry: number;
  minX: number;
  maxX: number;
  obstacle: Obstacle;
  body: Matter.Body;
  ripples: { x: number; y: number; t: number }[] = [];
  pads: { x: number; y: number; r: number; a: number }[] = [];
  reeds: { x: number; y: number; h: number }[] = [];

  constructor(x: number, y: number, rx: number, ry: number) {
    this.x = x;
    this.y = y;
    this.rx = rx;
    this.ry = ry;
    this.minX = x - rx - 40;
    this.maxX = x + rx + 40;
    this.obstacle = { kind: 'ellipse', x, y, rx: rx - 6, ry: ry - 4, active: true };
    const verts: Matter.Vector[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      verts.push({ x: x + Math.cos(a) * (rx - 8), y: y + Math.sin(a) * (ry - 5) });
    }
    this.body = Matter.Bodies.fromVertices(x, y, [verts], {
      isStatic: true,
      label: 'lake',
      collisionFilter: { category: CAT.LAKE, mask: CAT.ROBOT },
    });
    Matter.Body.setPosition(this.body, { x, y });
    const r = seeded(7);
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.45 + r() * 0.4;
      this.pads.push({ x: x + Math.cos(a) * rx * d, y: y + Math.sin(a) * ry * d, r: 7 + r() * 6, a: r() * 6 });
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (0.95 + r() * 1.1);
      this.reeds.push({ x: x + Math.cos(a) * (rx + 2), y: y + Math.sin(a) * (ry + 1), h: 16 + r() * 18 });
    }
  }

  inside(px: number, py: number, m = 0) {
    const dx = (px - this.x) / (this.rx - m);
    const dy = (py - this.y) / (this.ry - m * 0.5);
    return dx * dx + dy * dy < 1;
  }

  shorePoint(px: number, py: number, out = 26) {
    const a = Math.atan2((py - this.y) / this.ry, (px - this.x) / this.rx);
    return { x: this.x + Math.cos(a) * (this.rx + out), y: this.y + Math.sin(a) * (this.ry + out * 0.6) };
  }

  sortKey() {
    return this.y - this.ry - 1000;
  }

  update(dt: number, g: Game) {
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < 1.6);
    const raining = g.world.weather.current === 'chuva' ? g.world.weather.intensity : 0;
    if (Math.random() < dt * (0.6 + raining * 14)) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * 0.9;
      this.ripples.push({ x: this.x + Math.cos(a) * this.rx * d, y: this.y + Math.sin(a) * this.ry * d, t: 0 });
    }
    for (const e of g.entities) {
      if (e.carriedBy || e.dragged || e.kind === 'remote') continue;
      const inside = this.inside(e.x, e.y, 4);
      if (e instanceof Robot) {
        if (inside && !e.airborne) {
          const p = this.shorePoint(e.x, e.y, 30);
          g.particles.splash(e.x, e.y, 24);
          g.audio.splash();
          e.setPos(p.x, p.y);
          e.vz = 360;
          if (e.body) Matter.Body.setVelocity(e.body, { x: 0, y: 0 });
          e.say('Socorro, água!', 1.8);
          g.emit('robotSplash', e);
        }
        continue;
      }
      if (inside && e.z < 3 && !e.inWater) {
        e.inWater = true;
        e.z = 0;
        e.vz = 0;
        g.particles.splash(e.x, e.y, 18);
        g.audio.splash();
        this.ripples.push({ x: e.x, y: e.y, t: 0 });
        g.emit('splash', e);
      }
      if (!e.inWater) continue;
      if (!inside) {
        e.inWater = false;
        continue;
      }
      e.z = 0;
      e.vz = 0;
      const b = e.body;
      if (!b) continue;
      if (e instanceof Box) e.floatT += dt;
      if (e instanceof Box && !e.floats) {
        e.sinkT += dt * 0.45;
        Matter.Body.setVelocity(b, { x: b.velocity.x * 0.9, y: b.velocity.y * 0.9 });
        if (Math.random() < dt * 8) g.particles.spawn({ type: 'bolha', x: e.x + rand(-8, 8), y: e.y, z: 0, vz: 30, life: 1, color: 'rgba(255,255,255,0.8)', size: 2 + Math.random() * 2, gravity: -20 });
        if (e.sinkT >= 1.6) {
          // o lago "cospe" a caixa de volta
          e.sinkT = 0;
          e.inWater = false;
          const p = this.shorePoint(e.x + rand(-40, 40), e.y + rand(-20, 20), 40);
          e.setPos(p.x, p.y);
          e.z = 20;
          e.vz = 520;
          g.particles.splash(this.x, this.y, 30);
          g.audio.pop();
        }
        continue;
      }
      // boia e é levado devagar até a margem
      const dx = e.x - this.x;
      const dy = (e.y - this.y) * (this.rx / this.ry);
      const d = Math.hypot(dx, dy) || 1;
      Matter.Body.setVelocity(b, {
        x: b.velocity.x * 0.96 + ((dx / d) * 16) / 60 * 0.04,
        y: b.velocity.y * 0.96 + ((dy / d) * 10) / 60 * 0.04,
      });
      if (Math.hypot(b.velocity.x, b.velocity.y) < 0.18) Matter.Body.setVelocity(b, { x: ((dx / d) * 14) / 60, y: ((dy / d) * 8) / 60 });
    }
  }

  drawGround(ctx: CanvasRenderingContext2D, g: Game) {
    const { x, y, rx, ry } = this;
    const [top, bot] = g.world.dayNight.sky();
    // margem
    ctx.fillStyle = '#9fb36a';
    ctx.beginPath();
    ctx.ellipse(x, y + 3, rx + 12, ry + 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9b98a';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, rx + 5, ry + 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // água refletindo o céu
    const gr = ctx.createLinearGradient(0, y - ry, 0, y + ry);
    gr.addColorStop(0, rgb([bot[0] * 0.55 + 20, bot[1] * 0.7 + 40, bot[2] * 0.8 + 50]));
    gr.addColorStop(1, rgb([top[0] * 0.6 + 10, top[1] * 0.7 + 20, top[2] * 0.85 + 30]));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    // brilhos
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const sx = x - rx + ((i * 83 + g.time * 12) % (rx * 2));
      const sy = y - ry * 0.6 + ((i * 37) % (ry * 1.4));
      ctx.beginPath();
      ctx.moveTo(sx - 14, sy);
      ctx.lineTo(sx + 14, sy);
      ctx.stroke();
    }
    for (const r of this.ripples) {
      const k = r.t / 1.6;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - k)})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, 4 + k * 26, 1.5 + k * 9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, rx - 3, ry - 2, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    // vitórias-régias
    for (const p of this.pads) {
      const bob = Math.sin(g.time * 1.5 + p.a) * 1;
      ctx.fillStyle = '#3f9a4c';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + bob, p.r, p.r * 0.45, 0, p.a + 0.4, p.a + Math.PI * 2 - 0.1);
      ctx.lineTo(p.x, p.y + bob);
      ctx.fill();
    }
    // juncos
    ctx.strokeStyle = '#4c7f34';
    ctx.lineWidth = 2;
    for (const r of this.reeds) {
      const sw = Math.sin(g.time * 1.8 + r.x) * 2;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.quadraticCurveTo(r.x + sw * 0.5, r.y - r.h * 0.5, r.x + sw, r.y - r.h);
      ctx.stroke();
      ctx.fillStyle = '#7a5130';
      ctx.beginPath();
      ctx.ellipse(r.x + sw, r.y - r.h + 3, 2, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  draw() {}
}
