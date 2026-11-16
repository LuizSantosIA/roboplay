import { WORLD_W } from '../config';
import { pick, rand } from '../util';
import type { Game, Prop } from '../game';
import type { Tree } from './trees';

/** Pássaro que pousa nas árvores e foge quando um robô chega perto. */
export class Bird implements Prop {
  x: number;
  y: number;
  z: number;
  vx = 0;
  vz = 0;
  state: 'pousado' | 'voando' = 'pousado';
  tree: Tree | null;
  slot: number;
  flyT = 0;
  flap = Math.random() * 6;
  facing = 1;
  color: string;
  chirpT = rand(3, 12);
  minX = 0;
  maxX = 0;

  constructor(tree: Tree, slot: number) {
    this.tree = tree;
    this.slot = slot;
    const p = tree.perchPoint(slot);
    this.x = p.x;
    this.y = tree.y;
    this.z = p.z;
    this.color = pick(['#e0533d', '#3d7be0', '#f2b632', '#5a5f66']);
    this.facing = Math.random() < 0.5 ? 1 : -1;
  }

  sortKey() {
    return this.state === 'pousado' && this.tree ? this.tree.y + 0.2 : 100000;
  }

  update(dt: number, g: Game) {
    this.minX = this.x - 20;
    this.maxX = this.x + 20;
    this.flap += dt * (this.state === 'voando' ? 22 : 2);
    if (this.state === 'pousado' && this.tree) {
      const t = this.tree;
      const near = g.entities.some((e) => (e.kind === 'robot' || e.kind === 'remote') && Math.abs(e.x - t.x) < 110 && Math.abs(e.y - t.y) < 90);
      const shaken = t.shakeT > 0;
      if (near || shaken) {
        this.state = 'voando';
        this.tree = null;
        this.flyT = rand(4, 9);
        this.facing = Math.random() < 0.5 ? 1 : -1;
        this.vx = this.facing * rand(140, 200);
        this.vz = rand(120, 200);
        g.audio.bird();
        return;
      }
      this.chirpT -= dt;
      if (this.chirpT <= 0) {
        this.chirpT = rand(6, 16);
        if (this.x > g.camera.x && this.x < g.camera.x + g.camera.viewW && !g.world.dayNight.isNight) g.audio.bird();
        if (Math.random() < 0.5) this.facing *= -1;
      }
      return;
    }
    // voando
    this.flyT -= dt;
    if (this.tree) {
      const p = this.tree.perchPoint(this.slot);
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 6) {
        this.state = 'pousado';
        this.x = p.x;
        this.z = p.z;
        this.y = this.tree.y;
        return;
      }
      const sp = Math.min(180, d * 2 + 40);
      this.vx = (dx / d) * sp;
      this.vz = (dz / d) * sp;
      this.facing = dx > 0 ? 1 : -1;
      // muda a profundidade suavemente
      this.y += (this.tree.y - this.y) * Math.min(1, dt * 1.5);
    } else {
      this.vz += (Math.sin(g.time * 2 + this.flap) * 20 + (220 - this.z) * 0.6 - this.vz) * dt;
      if (this.x < 40) this.vx = Math.abs(this.vx);
      if (this.x > WORLD_W - 40) this.vx = -Math.abs(this.vx);
      this.facing = this.vx > 0 ? 1 : -1;
      if (this.flyT <= 0) {
        // procura uma árvore calma
        const trees = g.world.trees.filter(
          (t) => !g.entities.some((e) => (e.kind === 'robot' || e.kind === 'remote') && Math.abs(e.x - t.x) < 160 && Math.abs(e.y - t.y) < 110),
        );
        if (trees.length) {
          trees.sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x));
          this.tree = pick(trees.slice(0, 3));
          this.slot = Math.floor(rand(0, 4));
        } else this.flyT = rand(2, 4);
      }
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const x = this.x;
    const y = this.y - this.z;
    const f = this.facing;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f, 1);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -4, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2a33a';
    ctx.beginPath();
    ctx.moveTo(9, -4.5);
    ctx.lineTo(13, -3.5);
    ctx.lineTo(9, -2.5);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(7, -5, 0.9, 0, Math.PI * 2);
    ctx.fill();
    // cauda
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(-6, -1);
    ctx.lineTo(-12, -4);
    ctx.lineTo(-11, 1);
    ctx.fill();
    // asa
    const w = this.state === 'voando' ? Math.sin(this.flap) * 9 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.moveTo(-3, -2);
    ctx.quadraticCurveTo(0, -2 - w * 1.2, 4, -2);
    ctx.quadraticCurveTo(0, 1, -3, -2);
    ctx.fill();
    if (this.state === 'pousado') {
      ctx.strokeStyle = '#6b4a2b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-1, 4);
      ctx.lineTo(-1, 7);
      ctx.moveTo(2, 4);
      ctx.lineTo(2, 7);
      ctx.stroke();
    }
    ctx.restore();
  }
}
