import { roundRect } from '../util';
import { Robot } from '../entities/robot';
import type { Game, Prop } from '../game';

/** Estação de recarga: robô parado em cima recarrega a bateria. */
export class ChargingStation implements Prop {
  x: number;
  y: number;
  r = 34;
  minX: number;
  maxX: number;
  private sndT = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.minX = x - 60;
    this.maxX = x + 60;
  }

  contains(px: number, py: number) {
    const dx = (px - this.x) / this.r;
    const dy = (py - this.y) / (this.r * 0.42);
    return dx * dx + dy * dy < 1;
  }

  sortKey() {
    return this.y - 30;
  }

  update(dt: number, g: Game) {
    this.sndT -= dt;
    for (const r of g.robots) {
      const on = !r.remote && !r.airborne && this.contains(r.x, r.y);
      if (on && r.battery < 100) {
        if (!r.charging) {
          r.say('Carregando... ⚡', 1.6);
          g.audio.charge();
        }
        r.charging = true;
        r.battery = Math.min(100, r.battery + 14 * dt);
        if (Math.random() < dt * 6) g.particles.sparkle(r.x, r.y, 20 + Math.random() * 60, '#9dffcf', 2);
        if (r.battery >= 100) {
          r.say('100%! Energia total!', 2);
          g.audio.good();
          g.emit('charged', r);
        }
      } else if (r.charging) {
        r.charging = false;
      }
    }
  }

  drawGround(ctx: CanvasRenderingContext2D, g: Game) {
    const pulse = 0.5 + 0.5 * Math.sin(g.time * 3);
    ctx.fillStyle = '#3d4650';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 3, this.r + 4, this.r * 0.42 + 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#56616c';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.r, this.r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(110,255,180,${0.5 + pulse * 0.5})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.r - 6, this.r * 0.42 - 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(110,255,180,${0.6 + pulse * 0.4})`;
    ctx.beginPath();
    ctx.moveTo(this.x + 3, this.y - 9);
    ctx.lineTo(this.x - 7, this.y + 1);
    ctx.lineTo(this.x, this.y + 1);
    ctx.lineTo(this.x - 3, this.y + 9);
    ctx.lineTo(this.x + 7, this.y - 1);
    ctx.lineTo(this.x, this.y - 1);
    ctx.closePath();
    ctx.fill();
  }

  draw(ctx: CanvasRenderingContext2D, g: Game) {
    // poste com placa
    const px = this.x - this.r - 8;
    const py = this.y - 8;
    ctx.fillStyle = '#4a545e';
    ctx.fillRect(px - 3, py - 74, 6, 74);
    ctx.fillStyle = '#2f3740';
    roundRect(ctx, px - 16, py - 100, 32, 30, 6);
    ctx.fill();
    const on = Math.sin(g.time * 4) > 0;
    ctx.fillStyle = on ? '#6effb4' : '#3fa874';
    ctx.font = 'bold 18px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', px, py - 85);
    if (g.night > 0.2) {
      const m = ctx.getTransform();
      g.glows.push({ x: m.a * px + m.c * (py - 85) + m.e, y: m.b * px + m.d * (py - 85) + m.f, r: 50, a: g.night, color: 'rgba(110,255,180,A)' });
    }
  }

  drawOverlay(ctx: CanvasRenderingContext2D, g: Game) {
    if (!g.robots.some((r) => r.battery < 30 && !r.remote)) return;
    ctx.font = '700 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(20,30,40,0.6)';
    roundRect(ctx, this.x - 34, this.y + 22, 68, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#9dffcf';
    ctx.fillText('Recarga', this.x, this.y + 30.5);
  }
}

export function isRobot(e: unknown): e is Robot {
  return e instanceof Robot;
}
