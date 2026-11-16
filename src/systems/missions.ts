import Matter from 'matter-js';
import { GROUND_BOTTOM, GROUND_TOP } from '../config';
import { Robot } from '../entities/robot';
import { Entity } from '../entities/entity';
import type { Game, Prop } from '../game';
import { loadProgress, saveProgress, MissionProgress } from './storage';
import type { Target } from '../world/props';

export interface MissionCtx {
  start: Record<string, number>;
  set: Set<unknown>;
}

export interface MissionDef {
  id: string;
  icon: string;
  title: string;
  desc: string;
  hint: string;
  time: number;
  target: number;
  onlyBlocks?: boolean;
  setup(g: Game, c: MissionCtx, r: Robot): void;
  progress(g: Game, c: MissionCtx): number;
}

/** Área verde de entrega. */
export class MissionZone implements Prop {
  minX: number;
  maxX: number;
  constructor(public x: number, public y: number, public rx = 70, public ry = 30) {
    this.minX = x - rx - 20;
    this.maxX = x + rx + 20;
  }
  contains(e: Entity) {
    const dx = (e.x - this.x) / this.rx;
    const dy = (e.y - this.y) / this.ry;
    return dx * dx + dy * dy < 1 && !e.carriedBy && !e.dragged;
  }
  sortKey() {
    return this.y - 200;
  }
  drawGround(ctx: CanvasRenderingContext2D, g: Game) {
    ctx.fillStyle = 'rgba(60,220,110,0.35)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.rx, this.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2fdc6e';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 7]);
    ctx.lineDashOffset = -g.time * 16;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  draw(ctx: CanvasRenderingContext2D, g: Game) {
    // bandeirinha
    const fx = this.x + this.rx - 8;
    const fy = this.y - 6;
    ctx.fillStyle = '#5a636d';
    ctx.fillRect(fx - 1.5, fy - 60, 3, 60);
    const w = Math.sin(g.time * 6) * 3;
    ctx.fillStyle = '#2fdc6e';
    ctx.beginPath();
    ctx.moveTo(fx + 1.5, fy - 60);
    ctx.quadraticCurveTo(fx + 14, fy - 56 + w, fx + 26, fy - 52);
    ctx.lineTo(fx + 1.5, fy - 42);
    ctx.fill();
  }
}

const placeRobot = (g: Game, r: Robot, x: number, y: number) => {
  r.stop();
  if (r.carrying) {
    r.carrying.carriedBy = null;
    r.carrying = null;
  }
  r.setPos(x, y);
  r.z = 0;
  r.vz = 0;
  r.heading = 0;
  r.facing = 1;
  if (r.body) Matter.Body.setVelocity(r.body, { x: 0, y: 0 });
  r.battery = 100;
  r.mood = 'normal';
  r.idleT = 0;
  g.camera.centerOn(x + 150);
};

const zone = (g: Game, x: number, y: number, rx = 70, ry = 30) => {
  const z = new MissionZone(x, y, rx, ry);
  g.addProp(z);
  g.missionZone = z;
  return z;
};

const inZone = (g: Game, kind: string) => {
  const z = g.missionZone as MissionZone | null;
  if (!z) return 0;
  return g.entities.filter((e) => e.kind === kind && z.contains(e)).length;
};

export const MISSIONS: MissionDef[] = [
  {
    id: 'entrega', icon: '📦', title: 'Entrega expressa', time: 30, target: 3,
    desc: 'Leve as 3 caixas para a área verde em 30 segundos.',
    hint: 'Chegue perto de uma caixa e aperte Espaço (ou o botão Pegar). Na área verde, aperte de novo para soltar.',
    setup(g, _c, r) {
      placeRobot(g, r, 660, 590);
      zone(g, 960, 600);
      g.spawnBox('madeira', 560, 520).z = 0;
      g.spawnBox('madeira', 740, 660).z = 0;
      g.spawnBox('madeira', 600, 640).z = 0;
    },
    progress: (g) => inZone(g, 'box'),
  },
  {
    id: 'gols', icon: '⚽', title: 'Artilheiro', time: 60, target: 3,
    desc: 'Faça 3 gols em 60 segundos.',
    hint: 'Ande até a bola na direção do gol para chutar. A bola volta ao meio depois de cada gol.',
    setup(g, c, r) {
      const gl = g.scenery.goal;
      placeRobot(g, r, gl.x - 360, gl.y);
      g.spawnBall(gl.x - 260, gl.y).z = 0;
      c.start.goals = gl.goals;
    },
    progress: (g, c) => g.scenery.goal.goals - c.start.goals,
  },
  {
    id: 'alvos', icon: '🎯', title: 'Tiro ao alvo', time: 45, target: 3,
    desc: 'Derrube os 3 alvos em 45 segundos.',
    hint: 'Arraste uma caixa ou a bola e solte em movimento na direção de um alvo. Chutar a bola também vale!',
    setup(g, c, r) {
      const t = g.scenery.targets;
      placeRobot(g, r, t[1].x - 40, GROUND_BOTTOM - 70);
      for (const tg of t) {
        tg.downT = 0;
        tg.down = 0;
      }
      g.spawnBox('madeira', t[0].x - 30, GROUND_BOTTOM - 40).z = 0;
      g.spawnBox('madeira', t[2].x + 10, GROUND_BOTTOM - 60).z = 0;
      g.spawnBall(t[1].x + 20, GROUND_BOTTOM - 110).z = 0;
      c.set = new Set();
    },
    progress: (_g, c) => c.set.size,
  },
  {
    id: 'colheita', icon: '🍎', title: 'Colheita', time: 60, target: 3,
    desc: 'Derrube 3 maçãs e leve todas para a área verde em 60 segundos.',
    hint: 'Clique na macieira para derrubar uma maçã. Pegue com Espaço e solte na área verde.',
    setup(g, _c, r) {
      const tree = g.world.trees.find((t) => t.type === 'macieira' && t.x > 1000)!;
      tree.apples = tree.maxApples;
      placeRobot(g, r, tree.x - 40, tree.y + 70);
      zone(g, tree.x - 220, GROUND_BOTTOM - 70);
    },
    progress: (g) => inZone(g, 'apple'),
  },
  {
    id: 'fabrica', icon: '🏭', title: 'Fábrica em ordem', time: 150, target: 10,
    desc: 'Separe 10 caixas por cor em 150 segundos.',
    hint: 'Leve cada caixa colorida até a área da mesma cor (vermelha ●, azul ■, amarela ▲). Cor errada é devolvida!',
    setup(g, c, r) {
      const f = g.scenery.factory;
      f.on = true;
      f.interval = 3.5;
      f.spawnT = 0.5;
      placeRobot(g, r, f.x - 420, GROUND_BOTTOM - 120);
      g.camera.centerOn(f.x - 300);
      for (const col of ['vermelha', 'azul', 'amarela'] as const) {
        const b = g.spawnBox(col, f.x - 520 + Math.random() * 300, GROUND_TOP + 110 + Math.random() * 60);
        b.z = 0;
      }
      c.start.sorted = f.sorted;
    },
    progress: (g, c) => g.scenery.factory.sorted - c.start.sorted,
  },
  {
    id: 'jardim', icon: '🌱', title: 'Jardineiro', time: 90, target: 5,
    desc: 'Regue todas as 5 plantas antes do anoitecer.',
    hint: 'Pare perto de uma planta e aperte R (ou o botão 💧). Plantas com sede mostram uma gotinha.',
    setup(g, c, r) {
      const dn = g.world.dayNight;
      dn.t = 0.635;
      // anoitece (≈18h20) em 90 s
      dn.speed = ((0.765 - dn.t) * dn.duration) / 90;
      g.world.weather.setMode('limpo');
      g.world.weather.intensity = 0;
      for (const p of g.scenery.plants) {
        p.water = 0;
        p.growth = Math.min(p.growth, 1);
      }
      placeRobot(g, r, 300, 600);
      c.set = new Set();
    },
    progress: (_g, c) => c.set.size,
  },
  {
    id: 'blocos', icon: '🧩', title: 'Programador', time: 120, target: 1, onlyBlocks: true,
    desc: 'Leve a caixa até a área verde usando apenas blocos de programação.',
    hint: 'Monte: ir até caixa mais próxima → pegar → ir até área verde → soltar. Depois clique em Executar.',
    setup(g, _c, r) {
      placeRobot(g, r, 660, 600);
      g.spawnBox('madeira', 820, 560).z = 0;
      zone(g, 1060, 640);
    },
    progress: (g) => inZone(g, 'box'),
  },
];

export interface MissionResult {
  def: MissionDef;
  ok: boolean;
  stars: number;
  time: number;
  record: boolean;
}

/** Gerencia o modo missões. */
export class MissionManager {
  g: Game;
  active: MissionDef | null = null;
  ctx: MissionCtx = { start: {}, set: new Set() };
  elapsed = 0;
  count = 0;
  progress: MissionProgress = loadProgress();
  onUpdate: (() => void) | null = null;
  onEnd: ((r: MissionResult) => void) | null = null;
  private unsub: (() => void)[] = [];
  private prevSpeed = 1;
  private prevAuto = false;
  private ending = false;

  constructor(g: Game) {
    this.g = g;
    g.on('tick', (dt: number) => this.tick(dt));
  }

  get totalStars() {
    return Object.values(this.progress).reduce((a, p) => a + p.stars, 0);
  }

  start(def: MissionDef) {
    const g = this.g;
    this.cleanup();
    g.hud?.closePanels();
    this.ending = false;
    // mundo limpo, só com o robô do jogador
    let r = g.selected && !g.selected.remote ? g.selected : g.robots.find((x) => !x.remote) ?? null;
    if (!r) r = g.spawnRobot();
    g.clearDynamic(true);
    for (const o of g.robots) if (o !== r && !o.remote) o.dead = true;
    g.purge();
    g.selected = r;
    this.prevSpeed = g.world.dayNight.speed;
    this.prevAuto = g.autonomous;
    g.autonomous = false;
    this.ctx = { start: {}, set: new Set() };
    this.active = def;
    this.elapsed = 0;
    this.count = 0;
    def.setup(g, this.ctx, r);
    g.lockManual = !!def.onlyBlocks;
    // eventos que alimentam conjuntos
    this.unsub.push(g.on('target', (t: Target) => this.ctx.set.add(t)));
    this.unsub.push(g.on('watered', (p: unknown) => this.ctx.set.add(p)));
    g.emit('missionStart', def);
    g.audio.good();
    this.onUpdate?.();
  }

  private cleanup() {
    for (const u of this.unsub) u();
    this.unsub = [];
    const g = this.g;
    if (g.missionZone) {
      g.props = g.props.filter((p) => p !== (g.missionZone as unknown as Prop));
      g.missionZone = null;
    }
    g.lockManual = false;
  }

  /** Sai do modo missão e volta ao sandbox. */
  quit() {
    if (!this.active) return;
    this.active = null;
    this.cleanup();
    const g = this.g;
    g.world.dayNight.speed = this.prevSpeed;
    g.autonomous = this.prevAuto;
    g.reset();
    this.onUpdate?.();
  }

  private tick(dt: number) {
    const def = this.active;
    if (!def || this.ending) return;
    this.elapsed += dt;
    this.count = Math.min(def.target, def.progress(this.g, this.ctx));
    if (this.count >= def.target) this.finish(true);
    else if (this.elapsed >= def.time) this.finish(false);
  }

  private finish(ok: boolean) {
    const def = this.active!;
    this.ending = true;
    const g = this.g;
    const left = 1 - this.elapsed / def.time;
    const stars = ok ? (left >= 0.5 ? 3 : left >= 0.2 ? 2 : 1) : 0;
    let record = false;
    if (ok) {
      const prev = this.progress[def.id];
      if (!prev || stars > prev.stars || this.elapsed < prev.best) record = true;
      this.progress[def.id] = { stars: Math.max(stars, prev?.stars ?? 0), best: Math.min(this.elapsed, prev?.best ?? Infinity) };
      saveProgress(this.progress);
      g.audio.fanfare();
      if (g.selected) g.selected.celebrate(g);
      g.particles.confetti(g.selected?.x ?? g.camera.x + 400, g.selected?.y ?? 600, 140, 80);
    } else {
      g.audio.bad();
      g.selected?.say('Ah, não deu tempo...', 2);
    }
    g.lockManual = false;
    g.world.dayNight.speed = this.prevSpeed;
    const res: MissionResult = { def, ok, stars, time: this.elapsed, record };
    setTimeout(() => this.onEnd?.(res), ok ? 1200 : 600);
    this.onUpdate?.();
  }
}
