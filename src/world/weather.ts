import { GROUND_BOTTOM, GROUND_TOP, VIEW_H, WORLD_W } from '../config';
import { pick, rand, seeded } from '../util';
import type { Game } from '../game';

export type WeatherKind = 'limpo' | 'chuva' | 'neve';
export type WeatherMode = 'auto' | WeatherKind;

interface Puddle {
  x: number;
  y: number;
  rx: number;
  level: number; // 0..1
}

export class Weather {
  mode: WeatherMode = 'auto';
  current: WeatherKind = 'limpo';
  intensity = 0; // 0..1 (rampa suave)
  snowCover = 0;
  puddles: Puddle[] = [];
  private autoT = rand(50, 90);
  private drops: { x: number; y: number; v: number; l: number }[] = [];
  private flakes: { x: number; y: number; v: number; r: number; p: number }[] = [];
  private splashes: { x: number; y: number; t: number }[] = [];

  constructor() {
    const r = seeded(42);
    for (let i = 0; i < 22; i++) {
      this.puddles.push({
        x: 80 + r() * (WORLD_W - 160),
        y: GROUND_TOP + 30 + r() * (GROUND_BOTTOM - GROUND_TOP - 50),
        rx: 26 + r() * 30,
        level: 0,
      });
    }
    for (let i = 0; i < 260; i++) this.drops.push({ x: Math.random(), y: Math.random(), v: rand(0.9, 1.3), l: rand(10, 18) });
    for (let i = 0; i < 180; i++) this.flakes.push({ x: Math.random(), y: Math.random(), v: rand(0.5, 1), r: rand(1.2, 3), p: rand(0, 6) });
  }

  setMode(m: WeatherMode) {
    this.mode = m;
    if (m !== 'auto') this.current = m;
    else this.autoT = rand(40, 80);
  }

  /** Remove poças que caem dentro de áreas (lago, etc.). */
  filterPuddles(ok: (x: number, y: number) => boolean) {
    this.puddles = this.puddles.filter((p) => ok(p.x, p.y));
  }

  update(dt: number, g: Game) {
    if (this.mode === 'auto') {
      this.autoT -= dt;
      if (this.autoT <= 0) {
        const next: WeatherKind = this.current !== 'limpo' ? 'limpo' : pick(['chuva', 'chuva', 'neve'] as const);
        this.current = next;
        this.autoT = next === 'limpo' ? rand(60, 120) : rand(35, 60);
        g.hud?.toast(next === 'chuva' ? 'Começou a chover! 🌧️' : next === 'neve' ? 'Está nevando! ❄️' : 'O céu abriu ☀️');
      }
    }
    const want = this.current === 'limpo' ? 0 : 1;
    this.intensity += (want - this.intensity) * Math.min(1, dt * 0.5);
    if (this.current === 'limpo' && this.intensity < 0.02) this.intensity = 0;
    const rain = this.current === 'chuva' ? this.intensity : 0;
    const snow = this.current === 'neve' ? this.intensity : 0;
    for (const p of this.puddles) {
      if (rain > 0.3) p.level = Math.min(1, p.level + dt * 0.06 * rain);
      else p.level = Math.max(0, p.level - dt * (g.world.dayNight.isNight ? 0.008 : 0.02));
    }
    if (snow > 0.3) this.snowCover = Math.min(1, this.snowCover + dt * 0.035 * snow);
    else this.snowCover = Math.max(0, this.snowCover - dt * (rain > 0 ? 0.05 : 0.015));
    g.world.dayNight.overcast = this.intensity;
    g.audio.setRain(rain);
    for (const s of this.splashes) s.t += dt;
    this.splashes = this.splashes.filter((s) => s.t < 0.3);
    if (rain > 0.1) {
      const cam = g.camera;
      for (let i = 0; i < Math.floor(rain * 3); i++) {
        this.splashes.push({ x: cam.x + Math.random() * cam.viewW, y: GROUND_TOP + Math.random() * (GROUND_BOTTOM - GROUND_TOP + 20), t: 0 });
      }
    }
    // pisos escorregadios
    for (const e of g.entities) {
      let slip = this.snowCover * 0.35;
      for (const p of this.puddles) {
        if (p.level < 0.25) continue;
        const dx = (e.x - p.x) / (p.rx * p.level);
        const dy = (e.y - p.y) / (p.rx * 0.35 * p.level);
        if (dx * dx + dy * dy < 1) {
          slip = Math.max(slip, 0.92);
          break;
        }
      }
      e.slippery = slip;
    }
  }

  slipAt(x: number, y: number) {
    for (const p of this.puddles) {
      if (p.level < 0.25) continue;
      const dx = (x - p.x) / (p.rx * p.level);
      const dy = (y - p.y) / (p.rx * 0.35 * p.level);
      if (dx * dx + dy * dy < 1) return true;
    }
    return false;
  }

  drawGround(ctx: CanvasRenderingContext2D, g: Game, minX: number, maxX: number) {
    const [top] = g.world.dayNight.sky();
    for (const p of this.puddles) {
      if (p.level < 0.03 || p.x + p.rx < minX || p.x - p.rx > maxX) continue;
      const rx = p.rx * p.level;
      ctx.fillStyle = `rgba(${top[0] * 0.6 + 40 | 0},${top[1] * 0.6 + 60 | 0},${top[2] * 0.6 + 80 | 0},0.75)`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, rx * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x - rx * 0.15, p.y - rx * 0.08, rx * 0.5, rx * 0.12, 0, Math.PI, Math.PI * 1.8);
      ctx.stroke();
    }
    if (this.snowCover > 0.01) {
      const a = this.snowCover;
      ctx.fillStyle = `rgba(246,250,255,${0.85 * a})`;
      ctx.fillRect(minX, GROUND_TOP - 30, maxX - minX, VIEW_H - GROUND_TOP + 80);
      const r = seeded(3);
      ctx.fillStyle = `rgba(210,225,240,${0.6 * a})`;
      for (let i = 0; i < 120; i++) {
        const x = r() * WORLD_W;
        const y = GROUND_TOP + r() * (VIEW_H - GROUND_TOP);
        const w = 20 + r() * 50;
        if (x + w < minX || x - w > maxX) continue;
        ctx.beginPath();
        ctx.ellipse(x, y, w, w * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (this.splashes.length) {
      ctx.strokeStyle = 'rgba(220,235,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const s of this.splashes) {
        if (s.x < minX || s.x > maxX) continue;
        const k = s.t / 0.3;
        const rx = 2 + k * 6;
        ctx.moveTo(s.x + rx, s.y);
        ctx.ellipse(s.x, s.y, rx, 1 + k * 2, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
  }

  /** Partículas de chuva/neve em coordenadas de tela (lógicas). */
  drawScreen(ctx: CanvasRenderingContext2D, g: Game, dt: number) {
    const W = g.camera.viewW;
    const top = -g.offY;
    const H = VIEW_H + g.offY;
    const rain = this.current === 'chuva' ? this.intensity : 0;
    const snow = this.current === 'neve' ? this.intensity : 0;
    if (rain > 0.02) {
      ctx.strokeStyle = `rgba(200,220,255,${0.5 * rain})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      const n = Math.floor(this.drops.length * rain);
      for (let i = 0; i < n; i++) {
        const d = this.drops[i];
        d.y += (dt * 1.6 * d.v);
        d.x -= dt * 0.08;
        if (d.y > 1) {
          d.y -= 1;
          d.x = Math.random();
        }
        if (d.x < 0) d.x += 1;
        const x = d.x * W;
        const y = top + d.y * H;
        ctx.moveTo(x, y);
        ctx.lineTo(x - d.l * 0.25, y + d.l);
      }
      ctx.stroke();
    }
    if (snow > 0.02) {
      ctx.fillStyle = `rgba(255,255,255,${0.9 * snow})`;
      const n = Math.floor(this.flakes.length * snow);
      const camShift = g.camera.x * 0.0004;
      for (let i = 0; i < n; i++) {
        const f = this.flakes[i];
        f.y += dt * 0.12 * f.v;
        f.p += dt * 2;
        if (f.y > 1) {
          f.y -= 1;
          f.x = Math.random();
        }
        const x = (((f.x - camShift + Math.sin(f.p) * 0.01) % 1) + 1) % 1 * W;
        ctx.beginPath();
        ctx.arc(x, top + f.y * H, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
