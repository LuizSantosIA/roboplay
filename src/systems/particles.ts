export type ParticleType = 'confete' | 'gota' | 'brilho' | 'bolha' | 'folha' | 'fumaca' | 'texto';

export interface Particle {
  type: ParticleType;
  x: number;
  y: number; // chão
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  color: string;
  size: number;
  rot: number;
  text?: string;
  gravity: number;
}

export class Particles {
  list: Particle[] = [];

  spawn(p: Partial<Particle> & { x: number; y: number }) {
    if (this.list.length > 900) return;
    this.list.push({
      type: 'confete',
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 1,
      max: p.life ?? 1,
      color: '#fff',
      size: 3,
      rot: Math.random() * 6,
      gravity: 600,
      ...p,
    } as Particle);
  }

  confetti(x: number, y: number, z: number, n = 30) {
    const cols = ['#ff5a5f', '#ffd23f', '#3ec7ff', '#7cff6b', '#c77dff', '#ffffff'];
    for (let i = 0; i < n; i++) {
      this.spawn({
        type: 'confete', x, y, z,
        vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 60, vz: 200 + Math.random() * 320,
        life: 1.6 + Math.random(), color: cols[i % cols.length], size: 3 + Math.random() * 3, gravity: 500,
      });
    }
  }

  splash(x: number, y: number, n = 16, color = 'rgba(190,225,255,0.9)') {
    for (let i = 0; i < n; i++) {
      this.spawn({
        type: 'gota', x, y, z: 2,
        vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 40, vz: 120 + Math.random() * 200,
        life: 0.7 + Math.random() * 0.3, color, size: 2 + Math.random() * 2, gravity: 900,
      });
    }
  }

  sparkle(x: number, y: number, z: number, color = '#fff6a8', n = 12) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn({
        type: 'brilho', x, y, z,
        vx: Math.cos(a) * 90, vy: Math.sin(a) * 20, vz: Math.sin(a) * 90 + 40,
        life: 0.7, color, size: 3, gravity: 0,
      });
    }
  }

  floatText(x: number, y: number, z: number, text: string, color = '#fff') {
    this.spawn({ type: 'texto', x, y, z, vz: 40, life: 1.6, color, size: 14, text, gravity: 0 });
  }

  update(dt: number) {
    for (const p of this.list) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vz -= p.gravity * dt;
      p.z += p.vz * dt;
      p.rot += dt * 6;
      if (p.type === 'confete') {
        p.vx *= 0.98;
        if (p.vz < -60) p.vz = -60;
      }
      if (p.z < 0) {
        p.z = 0;
        if (p.type === 'gota' || p.type === 'bolha') p.life = 0;
        p.vz = 0;
        p.vx *= 0.5;
      }
      if (p.type === 'bolha') p.vx = Math.sin(p.life * 10) * 10;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D, minX: number, maxX: number) {
    for (const p of this.list) {
      if (p.x < minX || p.x > maxX) continue;
      const a = Math.min(1, p.life / Math.min(0.4, p.max));
      ctx.globalAlpha = a;
      const sy = p.y - p.z;
      if (p.type === 'confete') {
        ctx.save();
        ctx.translate(p.x, sy);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 + Math.abs(Math.sin(p.rot)) * p.size / 2);
        ctx.restore();
      } else if (p.type === 'texto') {
        ctx.font = `bold ${p.size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.strokeText(p.text!, p.x, sy);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text!, p.x, sy);
      } else if (p.type === 'bolha') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, sy, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'fumaca') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, sy, p.size * (2 - a), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, sy, p.size * (p.type === 'brilho' ? a : 1), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
