import { GROUND_BOTTOM, GROUND_TOP, HORIZON, VIEW_H, WORLD_W } from '../config';
import { RGB, clamp, rgb, seeded } from '../util';
import type { Game } from '../game';
import { DayNight } from './daynight';
import { Weather } from './weather';
import { Lake } from './lake';
import { Tree, TreeType } from './trees';
import { Bird } from './birds';
import { Obstacle, insideObstacle, planPath } from './pathing';

const F_CLOUD = 0.05;
const F_FAR = 0.12;
const F_NEAR = 0.26;
const F_HILL = 0.5;
const F_BGTREE = 0.78;

interface Layer {
  f: number;
  base: number;
  amp: number;
  waves: [number, number, number][]; // [freq, amp, phase]
}

function makeLayer(seed: number, f: number, base: number, amp: number, n: number, freq: number): Layer {
  const r = seeded(seed);
  const waves: [number, number, number][] = [];
  for (let i = 0; i < n; i++) waves.push([freq * (1 + i * 1.7 + r() * 0.6), 1 / (1 + i * 1.2), r() * 100]);
  return { f, base, amp, waves };
}

function layerY(l: Layer, x: number) {
  let h = 0;
  let tot = 0;
  for (const [fr, a, ph] of l.waves) {
    h += Math.sin(x * fr + ph) * a;
    tot += a;
  }
  // picos mais pontudos
  const v = h / tot;
  return l.base - l.amp * (0.5 + 0.5 * Math.sign(v) * Math.pow(Math.abs(v), 0.8));
}

interface Cloud {
  x: number;
  y: number;
  s: number;
  v: number;
  puffs: [number, number, number][];
}

/** Paisagem completa: céu, astros, nuvens, montanhas, colinas, gramado, lago, árvores e pássaros. */
export class World {
  g: Game;
  dayNight = new DayNight();
  weather = new Weather();
  lake: Lake;
  trees: Tree[] = [];
  birds: Bird[] = [];
  obstacles: Obstacle[] = [];
  private far = makeLayer(11, F_FAR, 330, 190, 4, 0.006);
  private near = makeLayer(23, F_NEAR, 400, 110, 4, 0.009);
  private hills = makeLayer(31, F_HILL, 432, 46, 3, 0.012);
  private clouds: Cloud[] = [];
  private stars: { x: number; y: number; r: number; p: number }[] = [];
  private tufts: { x: number; y: number; h: number }[] = [];
  private flowers: { x: number; y: number; c: string }[] = [];
  private patches: { x: number; y: number; w: number; light: boolean }[] = [];
  private bgTrees: { x: number; h: number; pine: boolean }[] = [];
  private skyClip: number[] = [];
  private lastDt = 1 / 60;

  constructor(g: Game) {
    this.g = g;
    const r = seeded(99);
    for (let i = 0; i < 16; i++) {
      const puffs: [number, number, number][] = [];
      const n = 4 + Math.floor(r() * 4);
      for (let j = 0; j < n; j++) puffs.push([(j - n / 2) * 22 + r() * 10, -r() * 18, 18 + r() * 16]);
      this.clouds.push({ x: r() * 2400, y: 60 + r() * 190, s: 0.6 + r() * 0.8, v: 4 + r() * 10, puffs });
    }
    for (let i = 0; i < 160; i++) this.stars.push({ x: r(), y: r(), r: 0.6 + r() * 1.4, p: r() * 6 });
    for (let i = 0; i < 1300; i++) this.tufts.push({ x: r() * WORLD_W, y: HORIZON + 6 + r() * (VIEW_H - HORIZON), h: 4 + r() * 6 });
    this.tufts.sort((a, b) => a.y - b.y);
    const fc = ['#ffffff', '#ffd84a', '#ff7aa8', '#b48cff', '#ff9a4a'];
    for (let i = 0; i < 320; i++) this.flowers.push({ x: r() * WORLD_W, y: GROUND_TOP + r() * (VIEW_H - GROUND_TOP), c: fc[Math.floor(r() * fc.length)] });
    for (let i = 0; i < 140; i++) this.patches.push({ x: r() * WORLD_W, y: HORIZON + 10 + r() * (VIEW_H - HORIZON), w: 30 + r() * 90, light: r() < 0.5 });
    const bgSpan = WORLD_W * F_BGTREE + 2200;
    for (let x = 0; x < bgSpan; x += 18 + r() * 40) this.bgTrees.push({ x, h: 26 + r() * 30, pine: r() < 0.5 });

    // lago
    this.lake = new Lake(1500, 578, 230, 74);
    g.addProp(this.lake);
    g.physics.add(this.lake.body);
    this.obstacles.push(this.lake.obstacle);
    this.weather.filterPuddles((x, y) => !this.lake.inside(x, y, -50));

    // árvores no gramado (fundo do gramado)
    const placed: [number, TreeType, number?, number?][] = [
      [70, 'pinheiro'], [300, 'macieira', GROUND_TOP + 14], [640, 'redonda', GROUND_TOP + 6], [880, 'pinheiro'],
      [1070, 'macieira', GROUND_TOP + 16], [1210, 'pinheiro', GROUND_TOP + 4], [1810, 'redonda', GROUND_TOP + 8],
      [1960, 'pinheiro'], [2200, 'macieira', GROUND_TOP + 12], [2720, 'redonda', GROUND_TOP + 6], [3060, 'pinheiro'],
      [3420, 'redonda', GROUND_TOP + 10], [3560, 'pinheiro'],
    ];
    for (const [x, type, y, s] of placed) this.addTree(new Tree(x, y ?? GROUND_TOP + 4, type, s ?? 1));
    // pássaros
    for (let i = 0; i < 7; i++) {
      const t = this.trees[(i * 3 + 1) % this.trees.length];
      const b = new Bird(t, i);
      this.birds.push(b);
      g.addProp(b);
    }
  }

  addTree(t: Tree) {
    this.trees.push(t);
    this.g.addProp(t);
    this.g.physics.add(t.body);
    this.obstacles.push(t.obstacle);
  }

  update(dt: number) {
    this.lastDt = dt;
    this.dayNight.update(dt);
    this.g.night = this.dayNight.night;
    this.weather.update(dt, this.g);
    for (const c of this.clouds) {
      c.x += c.v * dt * (1 + this.weather.intensity);
      const span = WORLD_W * F_CLOUD + this.g.camera.viewW + 400;
      if (c.x > span) c.x -= span + 300;
    }
  }

  isWalkable(x: number, y: number, m = 0) {
    if (y < GROUND_TOP + m || y > GROUND_BOTTOM - m || x < m || x > WORLD_W - m) return false;
    return !this.obstacles.some((o) => insideObstacle(o, x, y, m));
  }

  planPath(fx: number, fy: number, tx: number, ty: number) {
    return planPath(this.obstacles, fx, fy, tx, ty, { minY: GROUND_TOP + 10, maxY: GROUND_BOTTOM - 10, maxX: WORLD_W });
  }

  // ---------- desenho ----------
  private tintCompensate(c: RGB, t: RGB): RGB {
    return [clamp((c[0] * 255) / Math.max(1, t[0]), 0, 255), clamp((c[1] * 255) / Math.max(1, t[1]), 0, 255), clamp((c[2] * 255) / Math.max(1, t[2]), 0, 255)];
  }

  private cloudCache = new Map<string, { img: HTMLCanvasElement; ox: number; oy: number; w: number; h: number }>();
  private cloudSprite(c: Cloud, scale: number, storm: boolean) {
    const key = `${this.clouds.indexOf(c)}:${storm ? 1 : 0}:${scale.toFixed(3)}`;
    let sp = this.cloudCache.get(key);
    if (sp) return sp;
    if (this.cloudCache.size > 200) this.cloudCache.clear();
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const [px, py, pr] of c.puffs) {
      minX = Math.min(minX, (px - pr) * c.s);
      maxX = Math.max(maxX, (px + pr) * c.s);
      minY = Math.min(minY, (py - pr) * c.s);
      maxY = Math.max(maxY, (py + pr + 6) * c.s);
    }
    const w = maxX - minX + 4;
    const h = maxY - minY + 4;
    const img = document.createElement('canvas');
    img.width = Math.ceil(w * scale);
    img.height = Math.ceil(h * scale);
    const ctx = img.getContext('2d')!;
    ctx.setTransform(scale, 0, 0, scale, (-minX + 2) * scale, (-minY + 2) * scale);
    ctx.fillStyle = storm ? 'rgba(90,100,120,0.35)' : 'rgba(150,170,200,0.25)';
    for (const [px, py, pr] of c.puffs) {
      ctx.beginPath();
      ctx.arc(px * c.s, py * c.s + 6 * c.s, pr * c.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = storm ? 'rgb(165,172,190)' : 'rgba(255,255,255,0.97)';
    for (const [px, py, pr] of c.puffs) {
      ctx.beginPath();
      ctx.arc(px * c.s, py * c.s, pr * c.s, 0, Math.PI * 2);
      ctx.fill();
    }
    sp = { img, ox: -minX + 2, oy: -minY + 2, w, h };
    this.cloudCache.set(key, sp);
    return sp;
  }

  drawBackground(ctx: CanvasRenderingContext2D, s: number) {
    const g = this.g;
    const dn = this.dayNight;
    const W = g.camera.viewW;
    const cam = g.camera.x;
    const offY = g.offY;
    const tint = dn.tint();
    const [top, bot] = dn.sky();
    // céu (cores pré-compensadas porque o mundo inteiro recebe a tinta depois)
    ctx.setTransform(s, 0, 0, s, 0, offY * s);
    const gr = ctx.createLinearGradient(0, -offY, 0, HORIZON);
    gr.addColorStop(0, rgb(this.tintCompensate(top, tint)));
    gr.addColorStop(1, rgb(this.tintCompensate(bot, tint)));
    ctx.fillStyle = gr;
    ctx.fillRect(0, -offY, W, HORIZON + offY + 2);

    // sol
    const sunFrac = (dn.t - 0.22) / 0.56;
    if (sunFrac > 0 && sunFrac < 1) {
      const sx = W * (0.08 + 0.84 * sunFrac);
      const sy = 400 - Math.sin(Math.PI * sunFrac) * 330;
      const warm = dn.sunset;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 120);
      glow.addColorStop(0, `rgba(255,${235 - warm * 60 | 0},${170 - warm * 90 | 0},${0.55 * (1 - dn.overcast * 0.7)})`);
      glow.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 120, sy - 120, 240, 240);
      ctx.fillStyle = `rgb(255,${246 - warm * 70 | 0},${200 - warm * 120 | 0})`;
      ctx.globalAlpha = 1 - dn.overcast * 0.6;
      ctx.beginPath();
      ctx.arc(sx, sy, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // amostras das camadas na tela
    const step = 8;
    const n = Math.ceil(W / step) + 2;
    if (this.skyClip.length !== n) this.skyClip = new Array(n).fill(HORIZON);
    const sample = (l: Layer) => {
      const arr = new Array(n);
      for (let i = 0; i < n; i++) arr[i] = layerY(l, i * step + cam * l.f);
      return arr as number[];
    };
    const farY = sample(this.far);
    const nearY = sample(this.near);
    const hillY = sample(this.hills);
    for (let i = 0; i < n; i++) this.skyClip[i] = Math.min(farY[i], nearY[i], hillY[i]);

    const fillLayer = (ys: number[], color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, HORIZON + 10);
      for (let i = 0; i < n; i++) ctx.lineTo(i * step, ys[i]);
      ctx.lineTo((n - 1) * step, HORIZON + 10);
      ctx.closePath();
      ctx.fill();
    };
    const snowCaps = (ys: number[], line: number, l: Layer, alpha: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, HORIZON + 10);
      for (let i = 0; i < n; i++) ctx.lineTo(i * step, ys[i]);
      ctx.lineTo((n - 1) * step, HORIZON + 10);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = `rgba(250,252,255,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(0, -offY - 10);
      ctx.lineTo((n - 1) * step, -offY - 10);
      for (let i = n - 1; i >= 0; i--) {
        const wx = i * step + cam * l.f;
        ctx.lineTo(i * step, line + Math.sin(wx * 0.07) * 6 + Math.sin(wx * 0.023) * 10);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    fillLayer(farY, '#8fa7c4');
    snowCaps(farY, 238 + (1 - this.weather.snowCover) * 0, this.far, 0.95);

    // nuvens
    const storm = this.weather.intensity;
    for (const c of this.clouds) {
      const x = c.x - cam * F_CLOUD - 200;
      if (x < -200 || x > W + 200) continue;
      const sp = this.cloudSprite(c, s, false);
      ctx.drawImage(sp.img, x - sp.ox, c.y - sp.oy, sp.w, sp.h);
      if (storm > 0.02) {
        ctx.globalAlpha = storm;
        const st = this.cloudSprite(c, s, true);
        ctx.drawImage(st.img, x - st.ox, c.y - st.oy, st.w, st.h);
        ctx.globalAlpha = 1;
      }
    }

    fillLayer(nearY, '#6f88a8');
    snowCaps(nearY, 312, this.near, 0.9 * (0.55 + this.weather.snowCover * 0.45));
    // sombreado lateral das montanhas próximas
    fillLayer(hillY, '#7fb35a');
    const hg = ctx.createLinearGradient(0, 380, 0, HORIZON);
    hg.addColorStop(0, 'rgba(255,255,255,0.0)');
    hg.addColorStop(1, 'rgba(40,80,30,0.25)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 380, W, HORIZON - 370);
    if (this.weather.snowCover > 0.02) fillLayer(hillY.map((y) => y), `rgba(240,246,255,${this.weather.snowCover * 0.85})`);

    // fileira de árvores ao fundo
    const bx0 = cam * F_BGTREE;
    for (const t of this.bgTrees) {
      const x = t.x - bx0;
      if (x < -30 || x > W + 30) continue;
      const y = HORIZON + 4;
      if (t.pine) {
        ctx.fillStyle = '#3f7a45';
        ctx.beginPath();
        ctx.moveTo(x - t.h * 0.32, y);
        ctx.lineTo(x, y - t.h);
        ctx.lineTo(x + t.h * 0.32, y);
        ctx.fill();
      } else {
        ctx.fillStyle = '#4c8c47';
        ctx.beginPath();
        ctx.arc(x, y - t.h * 0.55, t.h * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - 1.5, y - t.h * 0.2, 3, t.h * 0.2);
      }
      if (this.weather.snowCover > 0.05) {
        ctx.fillStyle = `rgba(255,255,255,${this.weather.snowCover * 0.9})`;
        ctx.beginPath();
        if (t.pine) {
          ctx.moveTo(x - t.h * 0.12, y - t.h * 0.62);
          ctx.lineTo(x, y - t.h);
          ctx.lineTo(x + t.h * 0.12, y - t.h * 0.62);
        } else ctx.ellipse(x, y - t.h * 0.8, t.h * 0.3, t.h * 0.12, 0, Math.PI, 0);
        ctx.fill();
      }
    }
  }

  private groundCache: { scale: number; chunks: HTMLCanvasElement[] } | null = null;
  private static CW = 400;

  /** Renderiza o gramado estático em pedaços (cache), para manter 60 fps. */
  private buildGround(scale: number) {
    const CW = World.CW;
    const H = VIEW_H - HORIZON + 40;
    const chunks: HTMLCanvasElement[] = [];
    for (let x0 = 0; x0 < WORLD_W; x0 += CW) {
      const c = document.createElement('canvas');
      c.width = Math.ceil(CW * scale);
      c.height = Math.ceil(H * scale);
      const ctx = c.getContext('2d')!;
      ctx.setTransform(scale, 0, 0, scale, -x0 * scale, -HORIZON * scale);
      const minX = x0 - 60;
      const maxX = x0 + CW + 60;
      const gr = ctx.createLinearGradient(0, HORIZON, 0, VIEW_H);
      gr.addColorStop(0, '#8fcf62');
      gr.addColorStop(0.35, '#74bf4f');
      gr.addColorStop(1, '#58a83f');
      ctx.fillStyle = gr;
      ctx.fillRect(minX, HORIZON, maxX - minX, VIEW_H - HORIZON + 40);
      ctx.fillStyle = 'rgba(40,90,30,0.18)';
      ctx.fillRect(minX, HORIZON, maxX - minX, 5);
      for (const p of this.patches) {
        if (p.x + p.w < minX || p.x - p.w > maxX) continue;
        ctx.fillStyle = p.light ? 'rgba(255,255,200,0.07)' : 'rgba(20,70,20,0.07)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.w, p.w * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#4e9a38';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const t of this.tufts) {
        if (t.x < minX || t.x > maxX) continue;
        const k = 0.6 + ((t.y - HORIZON) / (VIEW_H - HORIZON)) * 0.6;
        const h = t.h * k;
        ctx.moveTo(t.x - 3 * k, t.y);
        ctx.lineTo(t.x - 4 * k, t.y - h * 0.8);
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x + 1, t.y - h);
        ctx.moveTo(t.x + 3 * k, t.y);
        ctx.lineTo(t.x + 5 * k, t.y - h * 0.75);
      }
      ctx.stroke();
      for (const f of this.flowers) {
        if (f.x < minX || f.x > maxX) continue;
        ctx.fillStyle = f.c;
        ctx.beginPath();
        ctx.arc(f.x - 2, f.y, 1.8, 0, Math.PI * 2);
        ctx.arc(f.x + 2, f.y, 1.8, 0, Math.PI * 2);
        ctx.arc(f.x, f.y - 2, 1.8, 0, Math.PI * 2);
        ctx.arc(f.x, f.y + 2, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffcf33';
        ctx.beginPath();
        ctx.arc(f.x, f.y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      chunks.push(c);
    }
    this.groundCache = { scale, chunks };
  }

  drawGround(ctx: CanvasRenderingContext2D) {
    const g = this.g;
    const minX = g.camera.x - 60;
    const maxX = g.camera.x + g.camera.viewW + 60;
    const scale = g.cssScale * g.dpr;
    if (!this.groundCache || Math.abs(this.groundCache.scale - scale) > 0.001) this.buildGround(scale);
    const CW = World.CW;
    const H = VIEW_H - HORIZON + 40;
    const chunks = this.groundCache!.chunks;
    for (let i = Math.max(0, Math.floor(minX / CW)); i < chunks.length && i * CW < maxX; i++) {
      ctx.drawImage(chunks[i], i * CW, HORIZON, CW + 0.5, H);
    }
    this.weather.drawGround(ctx, g, minX, maxX);
  }

  /** Tinta de horário, estrelas/lua, brilhos e clima (depois das entidades). */
  drawAfterEntities(ctx: CanvasRenderingContext2D, s: number) {
    const g = this.g;
    const dn = this.dayNight;
    const W = g.camera.viewW;
    const tint = dn.tint();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (tint[0] < 254 || tint[1] < 254 || tint[2] < 254) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgb(tint);
      ctx.fillRect(0, 0, g.canvas.width, g.canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.setTransform(s, 0, 0, s, 0, g.offY * s);
    const night = dn.night;
    if (night > 0.02) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, -g.offY - 5);
      ctx.lineTo(W + 10, -g.offY - 5);
      const step = 8;
      for (let i = this.skyClip.length - 1; i >= 0; i--) ctx.lineTo(i * step, this.skyClip[i] - 2);
      ctx.closePath();
      ctx.clip();
      const vis = night * (1 - dn.overcast * 0.85);
      for (const st of this.stars) {
        const tw = 0.55 + 0.45 * Math.sin(g.time * 2.2 + st.p * 7);
        ctx.fillStyle = `rgba(255,255,240,${vis * tw})`;
        const x = ((st.x * (W + 200) - g.camera.x * 0.02) % (W + 200) + W + 200) % (W + 200) - 100;
        ctx.fillRect(x, -g.offY + st.y * (360 + g.offY), st.r, st.r);
      }
      // lua
      const mf = (((dn.t + 0.5) % 1) - 0.22) / 0.56;
      if (mf > 0 && mf < 1) {
        const mx = W * (0.1 + 0.8 * mf);
        const my = 400 - Math.sin(Math.PI * mf) * 300;
        const glow = ctx.createRadialGradient(mx, my, 0, mx, my, 80);
        glow.addColorStop(0, `rgba(220,230,255,${0.35 * vis})`);
        glow.addColorStop(1, 'rgba(220,230,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(mx - 80, my - 80, 160, 160);
        ctx.globalAlpha = Math.min(1, night * 1.3) * (1 - dn.overcast * 0.6);
        ctx.fillStyle = '#f4f1de';
        ctx.beginPath();
        ctx.arc(mx, my, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(180,175,150,0.5)';
        for (const [cx, cy, cr] of [[-6, -4, 4], [5, 6, 3], [7, -6, 2.4]]) {
          ctx.beginPath();
          ctx.arc(mx + cx, my + cy, cr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    // brilhos de antenas e luzes
    if (g.glows.length) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      for (const gl of g.glows) {
        const r = gl.r * s;
        const grd = ctx.createRadialGradient(gl.x, gl.y, 0, gl.x, gl.y, r);
        grd.addColorStop(0, gl.color.replace('A', String(0.9 * gl.a)));
        grd.addColorStop(0.25, gl.color.replace('A', String(0.45 * gl.a)));
        grd.addColorStop(1, gl.color.replace('A', '0'));
        ctx.fillStyle = grd;
        ctx.fillRect(gl.x - r, gl.y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      g.glows.length = 0;
    }
    ctx.setTransform(s, 0, 0, s, 0, g.offY * s);
    this.weather.drawScreen(ctx, g, this.lastDt);
  }
}
