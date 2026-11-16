import Matter from 'matter-js';
import { CAT, GROUND_BOTTOM, GROUND_TOP, depthScale } from '../config';
import { dist, pick, rand, roundRect, shade } from '../util';
import { Entity } from '../entities/entity';
import { Robot } from '../entities/robot';
import { Box, BOX_COLORS, BoxColor } from '../entities/box';
import { Ball } from '../entities/ball';
import type { Game, Prop } from '../game';
import type { Obstacle } from './pathing';

function staticRect(g: Game, x: number, y: number, w: number, h: number, label: string) {
  const b = Matter.Bodies.rectangle(x, y, w, h, { isStatic: true, label, collisionFilter: { category: CAT.SOLID, mask: 0xffff } });
  g.physics.add(b);
  return b;
}

function onGround(e: Entity) {
  return !e.airborne && !e.carriedBy && !e.dragged;
}

// ---------------------------------------------------------------- Esteira
export class Conveyor implements Prop {
  minX: number;
  maxX: number;
  offset = 0;
  constructor(public x1: number, public x2: number, public y: number, public speed = -70, public depth = 30) {
    this.minX = Math.min(x1, x2) - 20;
    this.maxX = Math.max(x1, x2) + 20;
  }
  sortKey() {
    return this.y - this.depth;
  }
  on(e: Entity) {
    return e.x > this.minX + 20 && e.x < this.maxX - 20 && Math.abs(e.y - this.y) < this.depth / 2 + 4 && e.z < 4;
  }
  update(dt: number, g: Game) {
    this.offset = (this.offset + this.speed * dt) % 24;
    for (const e of g.entities) {
      if (!e.body || e.carriedBy || e.dragged || e.airborne) continue;
      if (!this.on(e)) continue;
      const v = e.body.velocity;
      const want = this.speed / 60;
      Matter.Body.setVelocity(e.body, { x: v.x + (want - v.x) * (e instanceof Robot ? 0.15 : 0.35), y: v.y * 0.9 + ((this.y - e.y) / 60) * 0.5 });
    }
  }
  drawGround(ctx: CanvasRenderingContext2D) {
    const x = this.minX + 20;
    const w = this.maxX - this.minX - 40;
    const top = this.y - this.depth / 2;
    ctx.fillStyle = '#3a4048';
    roundRect(ctx, x - 6, top - 6, w + 12, this.depth + 14, 8);
    ctx.fill();
    ctx.fillStyle = '#2a2f35';
    ctx.fillRect(x, top, w, this.depth);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, top, w, this.depth);
    ctx.clip();
    ctx.strokeStyle = '#4b535c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let sx = x - 24 + ((this.offset % 24) + 24) % 24; sx < x + w + 24; sx += 24) {
      ctx.moveTo(sx, top);
      ctx.lineTo(sx - 8, top + this.depth);
    }
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#f2c230';
    for (let sx = x; sx < x + w; sx += 40) ctx.fillRect(sx, top + this.depth + 2, 20, 4);
    // rolos
    ctx.fillStyle = '#7a838c';
    for (const rx of [x - 2, x + w + 2]) {
      ctx.beginPath();
      ctx.ellipse(rx, this.y, 6, this.depth / 2 + 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  draw() {}
}

// ---------------------------------------------------------------- Cerca + porta + botões
const FENCE_K = 0.38; // inclinação da cerca (x por unidade de y)

/** Cerca diagonal com uma porta que abre por botões de pressão. */
export class FenceWithDoor {
  open = 0; // 0..1 (animação)
  isOpen = false;
  holdT = 0;
  doorObstacles: Obstacle[] = [];
  doorBody: Matter.Body;
  plates: PressurePlate[] = [];
  obstacles: Obstacle[] = [];
  y1: number;
  y2: number;
  constructor(g: Game, public x0: number, public doorY: number, public gap = 96) {
    this.y1 = doorY - gap / 2;
    this.y2 = doorY + gap / 2;
    const top = GROUND_TOP - 30;
    const bot = GROUND_BOTTOM + 30;
    const circ = (y: number) =>
      Matter.Bodies.circle(this.xAt(y), y, 8, { isStatic: true, label: 'fence', collisionFilter: { category: CAT.SOLID, mask: 0xffff } });
    for (let y = top; y <= bot; y += 10) {
      if (y > this.y1 - 4 && y < this.y2 + 4) continue;
      g.physics.add(circ(y));
    }
    const parts: Matter.Body[] = [];
    for (let y = this.y1; y <= this.y2; y += 10) parts.push(circ(y));
    this.doorBody = Matter.Body.create({ parts, isStatic: true, label: 'door', collisionFilter: { category: CAT.SOLID, mask: 0xffff } });
    g.physics.add(this.doorBody);
    const seg = (ya: number, yb: number, door: boolean) => {
      for (let y = ya; y < yb; y += 32) {
        const ye = Math.min(yb, y + 32);
        const o: Obstacle = { kind: 'rect', x: this.xAt((y + ye) / 2), y: (y + ye) / 2, rx: 8 + ((ye - y) * FENCE_K) / 2, ry: (ye - y) / 2, active: true };
        this.obstacles.push(o);
        if (door) this.doorObstacles.push(o);
      }
    };
    seg(top, this.y1, false);
    seg(this.y1, this.y2, true);
    seg(this.y2, bot, false);
    // estacas como props separados para ordenar por profundidade
    for (let y = GROUND_TOP - 6; y <= GROUND_BOTTOM + 10; y += 30) {
      const ye = Math.min(GROUND_BOTTOM + 12, y + 30);
      g.addProp(new FenceSegment(this, y, ye));
    }
    g.addProp(this as unknown as Prop);
  }
  xAt(y: number) {
    return this.x0 + (y - this.doorY) * FENCE_K;
  }
  get minX() {
    return this.xAt(GROUND_TOP) - 30;
  }
  get maxX() {
    return this.xAt(GROUND_BOTTOM) + 30;
  }
  sortKey() {
    return this.y2;
  }
  setOpen(g: Game, open: boolean) {
    if (open === this.isOpen) return;
    this.isOpen = open;
    for (const o of this.doorObstacles) o.active = !open;
    if (open) g.physics.remove(this.doorBody);
    else g.physics.add(this.doorBody);
    g.audio.beep(open ? 1000 : 500);
    g.emit(open ? 'doorOpen' : 'doorClose');
  }
  update(dt: number, g: Game) {
    const pressed = this.plates.some((p) => p.pressed);
    if (pressed) this.holdT = 6;
    else this.holdT -= dt;
    const want = this.holdT > 0;
    if (!want && this.isOpen) {
      const blocked = g.entities.some((e) => e.y > this.y1 - 14 && e.y < this.y2 + 14 && Math.abs(e.x - this.xAt(e.y)) < 22);
      if (!blocked) this.setOpen(g, false);
    } else if (want) this.setOpen(g, true);
    this.open += ((this.isOpen ? 1 : 0) - this.open) * Math.min(1, dt * 6);
  }
  /** Porta: painel de estacas que sobe. */
  draw(ctx: CanvasRenderingContext2D) {
    const lift = this.open * 64;
    for (let y = this.y1 + 6; y < this.y2; y += 12) {
      const s = depthScale(y);
      drawPicket(ctx, this.xAt(y), y - lift * s, s, '#7d8a96', '#5c6772');
    }
    // trilhos da porta
    ctx.strokeStyle = '#5c6772';
    ctx.lineWidth = 4;
    for (const hz of [14, 34]) {
      ctx.beginPath();
      ctx.moveTo(this.xAt(this.y1), this.y1 - (hz + lift) * depthScale(this.y1));
      ctx.lineTo(this.xAt(this.y2), this.y2 - (hz + lift) * depthScale(this.y2));
      ctx.stroke();
    }
    // pórtico
    for (const y of [this.y1, this.y2]) {
      const s = depthScale(y);
      ctx.fillStyle = '#4a545e';
      ctx.fillRect(this.xAt(y) - 4 * s, y - 92 * s, 8 * s, 92 * s);
    }
    const s1 = depthScale(this.y1);
    const s2 = depthScale(this.y2);
    ctx.strokeStyle = '#4a545e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(this.xAt(this.y1), this.y1 - 90 * s1);
    ctx.lineTo(this.xAt(this.y2), this.y2 - 90 * s2);
    ctx.stroke();
    const mx = this.xAt(this.doorY);
    const my = this.doorY - 92 * depthScale(this.doorY);
    ctx.fillStyle = this.isOpen ? '#6effb4' : '#ff6a4f';
    ctx.beginPath();
    ctx.arc(mx, my, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPicket(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, c1 = '#c99258', c2 = '#9b6a3c') {
  const w = 9 * s;
  const h = 46 * s;
  ctx.fillStyle = c2;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + 1.5 * s, y);
  ctx.lineTo(x - w / 2 + 1.5 * s, y - h);
  ctx.lineTo(x + 1.5 * s, y - h - 6 * s);
  ctx.lineTo(x + w / 2 + 1.5 * s, y - h);
  ctx.lineTo(x + w / 2 + 1.5 * s, y);
  ctx.fill();
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x - w / 2, y - h);
  ctx.lineTo(x, y - h - 6 * s);
  ctx.lineTo(x + w / 2, y - h);
  ctx.lineTo(x + w / 2, y);
  ctx.fill();
}

class FenceSegment implements Prop {
  minX: number;
  maxX: number;
  constructor(public f: FenceWithDoor, public ya: number, public yb: number) {
    this.minX = f.xAt(ya) - 20;
    this.maxX = f.xAt(yb) + 20;
  }
  sortKey() {
    return this.yb;
  }
  draw(ctx: CanvasRenderingContext2D) {
    const f = this.f;
    const ys: number[] = [];
    for (let y = this.ya; y < this.yb; y += 12) if (y < f.y1 || y > f.y2) ys.push(y);
    if (!ys.length) return;
    // trilhos
    ctx.strokeStyle = '#9b6a3c';
    ctx.lineWidth = 4;
    for (const hz of [14, 34]) {
      ctx.beginPath();
      let first = true;
      for (const y of ys) {
        const px = f.xAt(y);
        const py = y - hz * depthScale(y);
        if (first) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
        first = false;
      }
      const ye = Math.min(this.yb, f.y1 > this.ya && f.y1 < this.yb ? f.y1 : this.yb);
      if (ye > ys[ys.length - 1]) ctx.lineTo(f.xAt(ye), ye - hz * depthScale(ye));
      ctx.stroke();
    }
    for (const y of ys) drawPicket(ctx, f.xAt(y), y, depthScale(y));
  }
}

export class PressurePlate implements Prop {
  minX: number;
  maxX: number;
  pressed = false;
  clickT = 0;
  constructor(public x: number, public y: number, public label = '') {
    this.minX = x - 30;
    this.maxX = x + 30;
  }
  sortKey() {
    return this.y - 50;
  }
  update(dt: number, g: Game) {
    this.clickT -= dt;
    const was = this.pressed;
    this.pressed = this.clickT > 0 || g.entities.some((e) => e.z < 4 && !e.carriedBy && Math.abs(e.x - this.x) < 24 && Math.abs(e.y - this.y) < 12);
    if (this.pressed && !was) g.audio.beep(1200);
  }
  hit(wx: number, wy: number) {
    return Math.abs(wx - this.x) < 26 && Math.abs(wy - this.y) < 14;
  }
  onTap(g: Game) {
    this.clickT = 0.4;
    g.hud?.toast('Porta aberta! 🚪');
  }
  drawGround(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#4a545e';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 2, 26, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.pressed ? '#2fb46b' : '#e0483e';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y - (this.pressed ? 0 : 3), 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(this.x - 5, this.y - (this.pressed ? 2 : 5), 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  draw() {}
}

// ---------------------------------------------------------------- Rampa
export class Ramp implements Prop {
  minX: number;
  maxX: number;
  constructor(public x: number, public y: number, public dir = 1, public w = 70, public h = 34) {
    this.minX = x - w;
    this.maxX = x + w;
  }
  sortKey() {
    return this.y - 12;
  }
  update(_dt: number, g: Game) {
    for (const e of g.entities) {
      if (!e.body || !onGround(e) || e.inWater) continue;
      const lx = (e.x - this.x) * this.dir;
      if (lx < -this.w / 2 || lx > this.w / 2 || Math.abs(e.y - this.y) > this.h / 2) continue;
      const v = e.body.velocity.x * 60 * this.dir;
      if (v > 120 && lx > this.w / 2 - 14) {
        e.vz = Math.min(560, v * 0.85);
        e.z = 6;
        if (e instanceof Robot) e.say('Uhuuul!', 1.2);
        g.audio.beep(600);
      }
    }
  }
  drawGround(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(30,40,20,0.25)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 4, this.w / 2 + 6, this.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  draw(ctx: CanvasRenderingContext2D) {
    const d = this.dir;
    const x0 = this.x - (this.w / 2) * d;
    const x1 = this.x + (this.w / 2) * d;
    const yb = this.y + this.h / 2;
    const yt = this.y - this.h / 2;
    const H = 26;
    // lateral
    ctx.fillStyle = '#9b6a3c';
    ctx.beginPath();
    ctx.moveTo(x0, yb);
    ctx.lineTo(x1, yb);
    ctx.lineTo(x1, yb - H);
    ctx.closePath();
    ctx.fill();
    // superfície
    ctx.fillStyle = '#c8894a';
    ctx.beginPath();
    ctx.moveTo(x0, yb);
    ctx.lineTo(x1, yb - H);
    ctx.lineTo(x1, yt - H);
    ctx.lineTo(x0, yt);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,50,20,0.4)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      ctx.beginPath();
      ctx.moveTo(x0 + (x1 - x0) * t, yb - H * t);
      ctx.lineTo(x0 + (x1 - x0) * t, yt - H * t);
      ctx.stroke();
    }
    ctx.fillStyle = '#7a5130';
    ctx.fillRect(Math.min(x1, x1 - 4 * d), yt - H, 4, yb - yt + H);
  }
}

// ---------------------------------------------------------------- Pedra (obstáculo)
export class Rock implements Prop {
  minX: number;
  maxX: number;
  obstacle: Obstacle;
  constructor(g: Game, public x: number, public y: number, public r = 20) {
    this.minX = x - r - 10;
    this.maxX = x + r + 10;
    const b = Matter.Bodies.circle(x, y, r * 0.75, { isStatic: true, label: 'rock', collisionFilter: { category: CAT.SOLID, mask: 0xffff } });
    g.physics.add(b);
    this.obstacle = { kind: 'ellipse', x, y, rx: r * 0.8, ry: r * 0.45, active: true };
  }
  sortKey() {
    return this.y;
  }
  draw(ctx: CanvasRenderingContext2D, g: Game) {
    const { x, y, r } = this;
    ctx.fillStyle = 'rgba(20,30,10,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, r * 1.1, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8c939b';
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.quadraticCurveTo(x - r * 1.05, y - r * 0.9, x - r * 0.2, y - r * 1.05);
    ctx.quadraticCurveTo(x + r * 0.8, y - r * 1.1, x + r, y - r * 0.2);
    ctx.quadraticCurveTo(x + r, y + r * 0.2, x, y + r * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, y - r * 0.7, r * 0.35, r * 0.18, -0.3, 0, Math.PI * 2);
    ctx.fill();
    if (g.world.weather.snowCover > 0.05) {
      ctx.fillStyle = `rgba(255,255,255,${g.world.weather.snowCover})`;
      ctx.beginPath();
      ctx.ellipse(x, y - r * 0.9, r * 0.7, r * 0.2, 0, Math.PI, 0);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- Gol + placar
export class Goal implements Prop {
  minX: number;
  maxX: number;
  goals = 0;
  flashT = 0;
  cooldown = 0;
  lastKicker: Robot | null = null;
  depthHalf = 52;
  netD = 46;
  crossH = 74;
  constructor(g: Game, public x: number, public y: number, public front: GoalFront | null = null) {
    this.minX = x - 30;
    this.maxX = x + this.netD + 30;
    const d = this.depthHalf;
    staticRect(g, x + this.netD + 4, y, 8, d * 2 + 8, 'goal');
    staticRect(g, x + this.netD / 2, y - d - 2, this.netD + 8, 6, 'goal');
    staticRect(g, x + this.netD / 2, y + d + 2, this.netD + 8, 6, 'goal');
    g.on('kick', ({ robot }: { robot: Robot }) => (this.lastKicker = robot));
  }
  sortKey() {
    return this.y - this.depthHalf;
  }
  update(dt: number, g: Game) {
    this.flashT -= dt;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    for (const e of g.entities) {
      if (!(e instanceof Ball) || e.carriedBy || e.dragged) continue;
      if (e.x > this.x + 8 && e.x < this.x + this.netD && Math.abs(e.y - this.y) < this.depthHalf - 4 && e.z < this.crossH - 10) {
        this.goals++;
        this.flashT = 2;
        this.cooldown = 2;
        g.particles.confetti(this.x + 20, this.y, 80, 50);
        g.particles.floatText(this.x, this.y, 120, 'GOOOL!', '#ffd23f');
        g.audio.fanfare();
        if (this.lastKicker && !this.lastKicker.dead) this.lastKicker.celebrate(g);
        g.emit('goal', { goals: this.goals, by: this.lastKicker });
        const ball = e;
        setTimeout(() => {
          if (ball.dead) return;
          ball.setPos(this.x - 260, this.y);
          ball.z = 200;
          ball.vz = 0;
          if (ball.body) Matter.Body.setVelocity(ball.body, { x: 0, y: 0 });
        }, 1300);
      }
    }
  }
  drawGround(ctx: CanvasRenderingContext2D) {
    // pequena área
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeRect(this.x - 90, this.y - this.depthHalf - 30, 90, this.depthHalf * 2 + 60);
    ctx.beginPath();
    ctx.ellipse(this.x - 330, this.y, 70, 30, 0, 0, Math.PI * 2);
    ctx.moveTo(this.x - 330, GROUND_TOP + 2);
    ctx.lineTo(this.x - 330, GROUND_BOTTOM - 2);
    ctx.stroke();
  }
  draw(ctx: CanvasRenderingContext2D) {
    const { x, y, netD, crossH } = this;
    const yb = y - this.depthHalf;
    const sb = depthScale(yb);
    // rede do fundo
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const yy = yb + (i / 8) * this.depthHalf * 2;
      const s = depthScale(yy);
      ctx.moveTo(x + netD, yy);
      ctx.lineTo(x + netD, yy - crossH * s * 0.8);
    }
    for (let j = 0; j <= 5; j++) {
      const hz = (j / 5) * crossH * 0.8;
      ctx.moveTo(x + netD, yb - hz * sb);
      ctx.lineTo(x + netD, yb + this.depthHalf * 2 - hz * depthScale(yb + this.depthHalf * 2));
    }
    // rede lateral de cima
    for (let i = 0; i <= 5; i++) {
      const xx = x + (i / 5) * netD;
      ctx.moveTo(xx, yb);
      ctx.lineTo(xx, yb - crossH * sb * (1 - (i / 5) * 0.2));
    }
    ctx.stroke();
    // trave de trás
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, yb);
    ctx.lineTo(x, yb - crossH * sb);
    ctx.stroke();
  }
}

export class GoalFront implements Prop {
  minX: number;
  maxX: number;
  constructor(public goal: Goal) {
    this.minX = goal.minX;
    this.maxX = goal.maxX;
  }
  sortKey() {
    return this.goal.y + this.goal.depthHalf;
  }
  draw(ctx: CanvasRenderingContext2D) {
    const gl = this.goal;
    const yb = gl.y - gl.depthHalf;
    const yf = gl.y + gl.depthHalf;
    const sf = depthScale(yf);
    const sb = depthScale(yb);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const xx = gl.x + (i / 5) * gl.netD;
      ctx.moveTo(xx, yf);
      ctx.lineTo(xx, yf - gl.crossH * sf * (1 - (i / 5) * 0.2));
    }
    ctx.moveTo(gl.x, yf - gl.crossH * sf);
    ctx.lineTo(gl.x + gl.netD, yf - gl.crossH * sf * 0.8);
    ctx.lineTo(gl.x + gl.netD, yb - gl.crossH * sb * 0.8);
    ctx.lineTo(gl.x, yb - gl.crossH * sb);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gl.x, yf);
    ctx.lineTo(gl.x, yf - gl.crossH * sf);
    ctx.lineTo(gl.x, yb - gl.crossH * sb);
    ctx.stroke();
  }
}

export class Scoreboard implements Prop {
  minX: number;
  maxX: number;
  constructor(public x: number, public y: number, public goal: Goal) {
    this.minX = x - 60;
    this.maxX = x + 60;
  }
  sortKey() {
    return this.y;
  }
  draw(ctx: CanvasRenderingContext2D, g: Game) {
    const { x, y } = this;
    ctx.fillStyle = '#4a545e';
    ctx.fillRect(x - 30, y - 60, 5, 60);
    ctx.fillRect(x + 25, y - 60, 5, 60);
    ctx.fillStyle = '#1d2a36';
    roundRect(ctx, x - 48, y - 110, 96, 54, 8);
    ctx.fill();
    const flash = this.goal.flashT > 0 && Math.sin(g.time * 20) > 0;
    ctx.fillStyle = flash ? '#ffd23f' : '#9aa4ad';
    ctx.font = '800 10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GOLS', x, y - 99);
    ctx.fillStyle = flash ? '#ffd23f' : '#6effb4';
    ctx.font = '800 28px "Baloo 2", system-ui';
    ctx.fillText(String(this.goal.goals), x, y - 76);
    if (g.night > 0.2) {
      const m = ctx.getTransform();
      g.glows.push({ x: m.a * x + m.e, y: m.d * (y - 80) + m.f, r: 50, a: g.night * 0.7, color: 'rgba(110,255,180,A)' });
    }
  }
}

// ---------------------------------------------------------------- Cesta
export class Basket implements Prop {
  minX: number;
  maxX: number;
  hoopZ = 120;
  count = 0;
  prev = new Map<number, number>();
  flashT = 0;
  constructor(g: Game, public x: number, public y: number) {
    this.minX = x - 50;
    this.maxX = x + 50;
    staticRect(g, x + 26, y, 8, 8, 'pole');
  }
  sortKey() {
    return this.y;
  }
  update(dt: number, g: Game) {
    this.flashT -= dt;
    for (const e of g.entities) {
      if (e.kind === 'robot' || e.kind === 'remote' || e.carriedBy || e.dragged) continue;
      const pz = this.prev.get(e.id);
      this.prev.set(e.id, e.z);
      if (pz === undefined) continue;
      if (pz > this.hoopZ && e.z <= this.hoopZ && e.vz < 0 && Math.abs(e.x - this.x) < 20 && Math.abs(e.y - this.y) < 14) {
        this.count++;
        this.flashT = 1.5;
        g.particles.confetti(this.x, this.y, this.hoopZ, 30);
        g.particles.floatText(this.x, this.y, this.hoopZ + 30, 'CESTA!', '#ff9a4a');
        g.audio.good();
        g.emit('basket', { count: this.count, entity: e });
      }
    }
    if (this.prev.size > 200) this.prev.clear();
  }
  draw(ctx: CanvasRenderingContext2D, g: Game) {
    const { x, y } = this;
    const s = depthScale(y);
    ctx.fillStyle = 'rgba(20,30,10,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + 26, y + 2, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a636d';
    ctx.fillRect(x + 23, y - 150 * s, 6, 150 * s);
    // tabela
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 2;
    roundRect(ctx, x + 14, y - 170 * s, 14, 56 * s, 3);
    ctx.fill();
    ctx.stroke();
    const hy = y - this.hoopZ * s;
    // rede
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
      ctx.moveTo(x + i * 5.5, hy);
      ctx.lineTo(x + i * 3, hy + 22);
    }
    ctx.moveTo(x - 13, hy + 8);
    ctx.lineTo(x + 13, hy + 8);
    ctx.moveTo(x - 10, hy + 16);
    ctx.lineTo(x + 10, hy + 16);
    ctx.stroke();
    ctx.strokeStyle = this.flashT > 0 && Math.sin(g.time * 20) > 0 ? '#ffd23f' : '#ff6a3d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, hy, 18, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.count) return;
    const s = depthScale(this.y);
    ctx.font = '800 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c0392b';
    ctx.fillText(String(this.count), this.x + 21, this.y - 136 * s);
  }
}

// ---------------------------------------------------------------- Alvo
export class Target implements Prop {
  minX: number;
  maxX: number;
  down = 0; // 0 = em pé, 1 = caído
  downT = 0;
  constructor(public x: number, public y: number) {
    this.minX = x - 40;
    this.maxX = x + 40;
  }
  sortKey() {
    return this.y;
  }
  update(dt: number, g: Game) {
    if (this.downT > 0) {
      this.downT -= dt;
      this.down = Math.min(1, this.down + dt * 5);
      if (this.downT <= 0) g.audio.beep(700);
      return;
    }
    this.down = Math.max(0, this.down - dt * 3);
    for (const e of g.entities) {
      if (e.kind === 'robot' || e.kind === 'remote' || e.carriedBy || e.dragged || !e.body) continue;
      const sp = Math.hypot(e.body.velocity.x, e.body.velocity.y) * 60 + Math.abs(e.vz) * 0.5;
      if (sp < 140) continue;
      if (Math.abs(e.x - this.x) < 22 && Math.abs(e.y - this.y) < 16 && e.z < 70) {
        this.downT = 5;
        g.audio.thud(0.8);
        g.particles.sparkle(this.x, this.y, 40, '#ffd23f', 14);
        g.particles.floatText(this.x, this.y, 80, 'Na mosca!', '#fff');
        g.emit('target', this);
        Matter.Body.setVelocity(e.body, { x: -e.body.velocity.x * 0.4, y: e.body.velocity.y * 0.4 });
        break;
      }
    }
  }
  draw(ctx: CanvasRenderingContext2D) {
    const { x, y } = this;
    const s = depthScale(y);
    ctx.fillStyle = 'rgba(20,30,10,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5130';
    ctx.fillRect(x - 12, y - 4, 24, 5);
    ctx.save();
    ctx.translate(x, y - 2);
    ctx.scale(1, 1 - this.down * 0.85);
    ctx.fillStyle = '#7a5130';
    ctx.fillRect(-2, -30 * s, 4, 30 * s);
    const cy = -52 * s;
    const cols = ['#ffffff', '#e0483e', '#ffffff', '#e0483e', '#ffd23f'];
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = cols[i];
      ctx.beginPath();
      ctx.arc(0, cy, (22 - i * 4.4) * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- Planta
export class Plant implements Prop {
  minX: number;
  maxX: number;
  water = 0.35; // 0..1
  growth = 0; // 0..4
  wiggle = 0;
  obstacle: Obstacle;
  dropsT = 0;
  constructor(g: Game, public x: number, public y: number) {
    this.minX = x - 30;
    this.maxX = x + 30;
    const b = Matter.Bodies.circle(x, y, 7, { isStatic: true, label: 'plant', collisionFilter: { category: CAT.SOLID, mask: CAT.ROBOT | CAT.OBJ } });
    g.physics.add(b);
    this.obstacle = { kind: 'ellipse', x, y, rx: 12, ry: 6, active: true };
  }
  get grown() {
    return this.growth >= 3.99;
  }
  sortKey() {
    return this.y;
  }
  waterIt(g: Game, amount = 0.45) {
    const was = this.water;
    this.water = Math.min(1, this.water + amount);
    this.wiggle = 1;
    this.dropsT = 1;
    if (was < 0.95) g.emit('watered', this);
  }
  update(dt: number, g: Game) {
    const rain = g.world.weather.current === 'chuva' ? g.world.weather.intensity : 0;
    if (rain > 0.3) this.water = Math.min(1, this.water + dt * 0.08);
    if (this.water > 0.15 && !this.grown) {
      const before = Math.floor(this.growth);
      this.growth = Math.min(4, this.growth + dt * 0.12 * this.water);
      if (Math.floor(this.growth) > before) {
        this.wiggle = 1;
        g.particles.sparkle(this.x, this.y, 30, '#b8ff9a', 8);
        if (this.grown) {
          g.audio.good();
          g.particles.floatText(this.x, this.y, 70, 'Floresceu!', '#ffb3d1');
          g.emit('plantGrown', this);
        }
      }
    }
    this.water = Math.max(0, this.water - dt * 0.006);
    this.wiggle = Math.max(0, this.wiggle - dt * 1.5);
    if (this.dropsT > 0) {
      this.dropsT -= dt;
      if (Math.random() < 0.6) g.particles.spawn({ type: 'gota', x: this.x + rand(-10, 10), y: this.y, z: 50, vz: -60, life: 0.6, color: 'rgba(120,190,255,0.9)', size: 2, gravity: 800 });
    }
  }
  draw(ctx: CanvasRenderingContext2D, g: Game) {
    const { x, y } = this;
    const s = depthScale(y) * 1.45;
    const gr = this.growth;
    const dry = this.water < 0.1;
    // canteiro
    ctx.fillStyle = dry ? '#a07a52' : '#6b4a2e';
    ctx.beginPath();
    ctx.ellipse(x, y, 20 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dry ? '#b8916a' : '#7d5838';
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 15 * s, 5 * s, 0, Math.PI, 0);
    ctx.fill();
    const h = (8 + gr * 12) * s;
    const sway = Math.sin(g.time * 2 + x) * 1.5 + Math.sin(this.wiggle * 20) * this.wiggle * 4;
    const droop = dry ? 0.5 : 0;
    ctx.strokeStyle = dry ? '#8aa04a' : '#3f9a3f';
    ctx.lineWidth = 3 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.quadraticCurveTo(x + sway * 0.5, y - h * 0.6, x + sway + droop * 8, y - h);
    ctx.stroke();
    ctx.fillStyle = dry ? '#9ab04a' : '#4cb24c';
    const leaves = Math.min(4, Math.floor(gr) + 1);
    for (let i = 0; i < leaves; i++) {
      const t = (i + 1) / (leaves + 1);
      const lx = x + sway * t;
      const ly = y - 3 - h * t;
      const side = i % 2 ? 1 : -1;
      ctx.beginPath();
      ctx.ellipse(lx + side * 6 * s, ly + droop * 4, 7 * s, 3 * s, side * (0.5 + droop), 0, Math.PI * 2);
      ctx.fill();
    }
    const tx = x + sway + droop * 8;
    const ty = y - h;
    if (gr >= 3.99) {
      const pc = ['#ff7aa8', '#ffd84a', '#b48cff', '#ff9a4a'][Math.floor(x) % 4];
      ctx.fillStyle = pc;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + g.time * 0.3;
        ctx.beginPath();
        ctx.ellipse(tx + Math.cos(a) * 6 * s, ty + Math.sin(a) * 6 * s, 5 * s, 3.2 * s, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffcf33';
      ctx.beginPath();
      ctx.arc(tx, ty, 4 * s, 0, Math.PI * 2);
      ctx.fill();
    } else if (gr >= 2.5) {
      ctx.fillStyle = '#5fbf5f';
      ctx.beginPath();
      ctx.ellipse(tx, ty, 4 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  drawOverlay(ctx: CanvasRenderingContext2D, g: Game) {
    // gota de água indicando sede
    if (this.water > 0.12 || this.grown) return;
    const bob = Math.sin(g.time * 4 + this.x) * 2;
    const yy = this.y - (20 + this.growth * 12) * depthScale(this.y) * 1.45 - 24 + bob;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(this.x, yy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a9be0';
    ctx.beginPath();
    ctx.moveTo(this.x, yy - 6);
    ctx.quadraticCurveTo(this.x + 5, yy + 1, this.x, yy + 5);
    ctx.quadraticCurveTo(this.x - 5, yy + 1, this.x, yy - 6);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- Fábrica
export class SortPad implements Prop {
  minX: number;
  maxX: number;
  flashT = 0;
  bad = 0;
  constructor(public x: number, public y: number, public color: BoxColor, public rx = 46, public ry = 20) {
    this.minX = x - rx;
    this.maxX = x + rx;
  }
  contains(px: number, py: number) {
    const dx = (px - this.x) / this.rx;
    const dy = (py - this.y) / this.ry;
    return dx * dx + dy * dy < 1;
  }
  sortKey() {
    return this.y - 100;
  }
  drawGround(ctx: CanvasRenderingContext2D, g: Game) {
    const c = BOX_COLORS[this.color];
    ctx.fillStyle = shade(c, -0.25);
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 2, this.rx + 3, this.ry + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.flashT > 0 ? '#ffffff' : c;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.rx, this.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -g.time * 10;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.rx - 6, this.ry - 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '800 16px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.color === 'vermelha' ? '●' : this.color === 'azul' ? '■' : '▲', this.x, this.y);
  }
  draw() {}
}

export class Factory implements Prop {
  minX: number;
  maxX: number;
  on = true;
  spawnT = 2;
  sorted = 0;
  conveyor: Conveyor;
  pads: SortPad[];
  interval = 5;
  maxBoxes = 8;
  wobble = 0;
  constructor(g: Game, public x: number, public y: number) {
    this.minX = x - 70;
    this.maxX = x + 70;
    this.conveyor = new Conveyor(x - 470, x - 56, y + 4, -70, 30);
    this.pads = [
      new SortPad(x - 600, GROUND_BOTTOM - 70, 'vermelha'),
      new SortPad(x - 400, GROUND_BOTTOM - 46, 'azul'),
      new SortPad(x - 200, GROUND_BOTTOM - 70, 'amarela'),
    ];
    g.addProp(this.conveyor);
    for (const p of this.pads) g.addProp(p);
    staticRect(g, x, y - 6, 100, 24, 'factory');
  }
  sortKey() {
    return this.y;
  }
  hit(wx: number, wy: number) {
    return Math.abs(wx - this.x) < 55 && wy < this.y + 10 && wy > this.y - 130;
  }
  onTap(g: Game) {
    this.on = !this.on;
    g.audio.beep(this.on ? 900 : 400);
    g.hud?.toast(this.on ? 'Fábrica ligada 🏭' : 'Fábrica desligada');
  }
  colored(g: Game) {
    return g.entities.filter((e): e is Box => e instanceof Box && e.color !== 'madeira' && e.color !== 'metal');
  }
  spawnBox(g: Game, color?: BoxColor) {
    const b = g.add(new Box(this.x - 72, this.y + 4, color ?? pick(['vermelha', 'azul', 'amarela'] as const)));
    b.z = 30;
    this.wobble = 1;
    g.audio.pop();
    return b;
  }
  update(dt: number, g: Game) {
    this.wobble = Math.max(0, this.wobble - dt * 3);
    if (this.on) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = this.interval;
        if (this.colored(g).length < this.maxBoxes) this.spawnBox(g);
      }
    }
    for (const p of this.pads) p.flashT -= dt;
    for (const b of this.colored(g)) {
      if (b.carriedBy || b.dragged || b.airborne || b.dead) continue;
      for (const p of this.pads) {
        if (!p.contains(b.x, b.y)) continue;
        if (p.color === b.color) {
          b.dead = true;
          this.sorted++;
          p.flashT = 0.4;
          g.particles.sparkle(b.x, b.y, 20, '#ffffff', 14);
          g.particles.floatText(b.x, b.y, 50, '+1', '#ffffff');
          g.audio.good();
          g.emit('sorted', { color: b.color, total: this.sorted });
          const near = g.robots.filter((r) => dist(r.x, r.y, b.x, b.y) < 120);
          if (near[0] && Math.random() < 0.5) near[0].say(pick(['Certinho!', 'Essa vai aqui!', 'Organizado!']), 1.4);
        } else if (b.body) {
          // cor errada: a caixa é empurrada para fora
          const dx = b.x - p.x || 1;
          const dy = b.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          Matter.Body.setVelocity(b.body, { x: (dx / d) * 5, y: (dy / d) * 2 });
          b.vz = 220;
          g.audio.bad();
          const near = g.robots.find((r) => dist(r.x, r.y, b.x, b.y) < 140);
          near?.say('Cor errada!', 1.4);
          g.emit('wrongSort', b);
        }
        break;
      }
    }
  }
  draw(ctx: CanvasRenderingContext2D, g: Game) {
    const { x, y } = this;
    const w = 1 + Math.sin(this.wobble * 30) * this.wobble * 0.03;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(w, 2 - w);
    ctx.fillStyle = 'rgba(20,30,10,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 70, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    // chaminé
    ctx.fillStyle = '#8a5a3c';
    ctx.fillRect(22, -150, 20, 60);
    ctx.fillStyle = '#6d4630';
    ctx.fillRect(18, -156, 28, 8);
    // corpo
    ctx.fillStyle = '#c45a3a';
    roundRect(ctx, -55, -104, 110, 108, 8);
    ctx.fill();
    ctx.fillStyle = '#a84a2f';
    for (let i = 0; i < 4; i++) ctx.fillRect(-55, -90 + i * 24, 110, 3);
    // telhado serrilhado
    ctx.fillStyle = '#5a636d';
    ctx.beginPath();
    ctx.moveTo(-58, -104);
    for (let i = 0; i < 4; i++) {
      ctx.lineTo(-58 + i * 29, -124);
      ctx.lineTo(-58 + (i + 1) * 29, -104);
    }
    ctx.closePath();
    ctx.fill();
    // boca da esteira
    ctx.fillStyle = '#1d2228';
    roundRect(ctx, -58, -44, 40, 44, 6);
    ctx.fill();
    // painel
    ctx.fillStyle = '#1d2a36';
    roundRect(ctx, -6, -86, 52, 36, 6);
    ctx.fill();
    ctx.fillStyle = this.on ? '#6effb4' : '#ff6a4f';
    ctx.beginPath();
    ctx.arc(4, -76, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 15px "Baloo 2", system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(this.sorted), 26, -66);
    ctx.font = '700 7px system-ui';
    ctx.fillStyle = '#9aa4ad';
    ctx.fillText(this.on ? 'LIGADA' : 'DESLIG.', 4, -58);
    ctx.restore();
    if (this.on && Math.random() < 0.05) g.particles.spawn({ type: 'fumaca', x: x + 32, y, z: 160, vx: 10, vz: 30, life: 2.5, color: 'rgba(230,230,230,0.35)', size: 8, gravity: 0 });
    if (g.night > 0.2) {
      const m = ctx.getTransform();
      g.glows.push({ x: m.a * (x + 4) + m.e, y: m.d * (y - 76) + m.f, r: 40, a: g.night, color: this.on ? 'rgba(110,255,180,A)' : 'rgba(255,110,90,A)' });
    }
  }
  drawOverlay(ctx: CanvasRenderingContext2D) {
    ctx.font = '700 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(20,30,40,0.55)';
    roundRect(ctx, this.x - 46, this.y + 12, 92, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('Mini-fábrica', this.x, this.y + 20.5);
  }
}

// ---------------------------------------------------------------- Montagem do cenário
export interface Scenery {
  plants: Plant[];
  goal: Goal;
  basket: Basket;
  targets: Target[];
  factory: Factory;
  fence: FenceWithDoor;
}

export function buildScenery(g: Game): Scenery {
  const w = g.world;
  // jardim
  const plants: Plant[] = [];
  for (let i = 0; i < 5; i++) {
    const p = new Plant(g, 380 + i * 62, GROUND_TOP + 46 + (i % 2) * 22);
    plants.push(p);
    g.addProp(p);
    w.obstacles.push(p.obstacle);
  }
  // campo
  const goal = new Goal(g, 2560, 585);
  g.addProp(goal);
  g.addProp(new GoalFront(goal));
  g.addProp(new Scoreboard(2470, GROUND_TOP + 8, goal));
  w.obstacles.push({ kind: 'rect', x: goal.x + goal.netD / 2, y: goal.y, rx: goal.netD / 2 + 4, ry: goal.depthHalf + 4, active: true });
  const basket = new Basket(g, 2020, GROUND_TOP + 70);
  g.addProp(basket);
  const targets = [new Target(2280, GROUND_TOP + 30), new Target(2350, GROUND_TOP + 56), new Target(2420, GROUND_TOP + 30)];
  for (const t of targets) g.addProp(t);
  g.addProp(new Ramp(2120, GROUND_BOTTOM - 50, 1));
  g.addProp(new Ramp(2380, GROUND_BOTTOM - 40, 1, 60, 30));
  for (const [x, y, r] of [[1880, GROUND_BOTTOM - 24, 18], [2640, GROUND_TOP + 22, 22], [960, GROUND_BOTTOM - 30, 16], [3580, GROUND_BOTTOM - 26, 20]]) {
    const rock = new Rock(g, x, y, r);
    g.addProp(rock);
    w.obstacles.push(rock.obstacle);
  }
  // cerca com porta e botões
  const fence = new FenceWithDoor(g, 2730, 585);
  w.obstacles.push(...fence.obstacles);
  const p1 = new PressurePlate(fence.xAt(650) - 70, 650);
  const p2 = new PressurePlate(fence.xAt(650) + 70, 650);
  fence.plates.push(p1, p2);
  g.addProp(p1);
  g.addProp(p2);
  // fábrica
  const factory = new Factory(g, 3480, GROUND_TOP + 64);
  g.addProp(factory);
  w.obstacles.push({ kind: 'rect', x: factory.x, y: factory.y - 6, rx: 50, ry: 12, active: true });
  return { plants, goal, basket, targets, factory, fence };
}
