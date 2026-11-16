import { GROUND_BOTTOM, GROUND_TOP, WORLD_W } from '../config';
import { clamp, dist } from '../util';
import { Robot } from '../entities/robot';
import { Box } from '../entities/box';
import type { Game } from '../game';

export type Cond = 'caixaPerto' | 'bolaPerto' | 'bateriaBaixa' | 'carregando' | 'noite' | 'plantaComSede';
export type Alvo = 'caixa' | 'bola' | 'maca' | 'recarga' | 'planta' | 'area' | 'gol';

export type Block =
  | { id: string; type: 'andar'; n: number }
  | { id: string; type: 'virar'; dir: 'esquerda' | 'direita' }
  | { id: string; type: 'ir'; alvo: Alvo }
  | { id: string; type: 'pegar' }
  | { id: string; type: 'soltar' }
  | { id: string; type: 'chutar' }
  | { id: string; type: 'regar' }
  | { id: string; type: 'dancar' }
  | { id: string; type: 'repetir'; n: number; body: Block[] }
  | { id: string; type: 'se'; cond: Cond; body: Block[]; else: Block[] }
  | { id: string; type: 'dizer'; text: string }
  | { id: string; type: 'esperar'; s: number };

export type BlockType = Block['type'];

let seq = 0;
export const bid = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

export function makeBlock(type: BlockType): Block {
  const id = bid();
  switch (type) {
    case 'andar': return { id, type, n: 3 };
    case 'virar': return { id, type, dir: 'direita' };
    case 'ir': return { id, type, alvo: 'caixa' };
    case 'repetir': return { id, type, n: 3, body: [] };
    case 'se': return { id, type, cond: 'caixaPerto', body: [], else: [] };
    case 'dizer': return { id, type, text: 'Olá!' };
    case 'esperar': return { id, type, s: 1 };
    default: return { id, type } as Block;
  }
}

export const COND_LABEL: Record<Cond, string> = {
  caixaPerto: 'tem caixa perto?',
  bolaPerto: 'tem bola perto?',
  bateriaBaixa: 'bateria baixa?',
  carregando: 'está carregando algo?',
  noite: 'é noite?',
  plantaComSede: 'planta com sede perto?',
};
export const ALVO_LABEL: Record<Alvo, string> = {
  caixa: 'caixa mais próxima',
  bola: 'bola',
  maca: 'maçã',
  recarga: 'estação de recarga',
  planta: 'planta com sede',
  area: 'área verde',
  gol: 'gol',
};

const STEP = 40;

interface Wait {
  block: Block;
  done: () => boolean;
}

/** Interpretador: um gerador que produz "esperas" para cada bloco. */
export class Runner {
  state: 'parado' | 'rodando' | 'pausado' = 'parado';
  current: string | null = null;
  robot: Robot | null = null;
  onChange: (() => void) | null = null;
  usedBlocks = false;
  private gen: Generator<Wait, void, void> | null = null;
  private wait: Wait | null = null;
  private stepMode = false;
  private g: Game;
  private ops = 0;

  constructor(g: Game) {
    this.g = g;
    g.on('tick', (dt: number) => this.tick(dt));
  }

  start(program: Block[], robot: Robot, step = false) {
    this.stop();
    this.robot = robot;
    this.ops = 0;
    this.gen = this.exec(program, robot);
    this.state = step ? 'pausado' : 'rodando';
    this.stepMode = step;
    this.usedBlocks = true;
    robot.wake();
    this.g.emit('programStart', robot);
    this.advance();
  }

  pause() {
    if (this.state === 'rodando') this.state = 'pausado';
    this.changed();
  }
  resume() {
    if (this.state === 'pausado') {
      this.stepMode = false;
      this.state = 'rodando';
      if (!this.wait) this.advance();
    }
    this.changed();
  }
  /** Executa um bloco e pausa. */
  step(program: Block[], robot: Robot | null) {
    if (this.state === 'parado') {
      if (!robot) return;
      this.start(program, robot, true);
      return;
    }
    this.stepMode = true;
    this.state = 'rodando';
    if (!this.wait) this.advance();
    this.changed();
  }
  stop() {
    if (this.robot && this.state !== 'parado') this.robot.stop();
    this.gen = null;
    this.wait = null;
    this.current = null;
    this.state = 'parado';
    this.changed();
  }

  private changed() {
    this.onChange?.();
  }

  private tick(_dt: number) {
    if (this.state !== 'rodando' || !this.wait) return;
    const r = this.robot;
    if (!r || r.dead) return this.stop();
    if (this.wait.done()) {
      this.wait = null;
      if (this.stepMode) {
        this.state = 'pausado';
        this.changed();
        return;
      }
      this.advance();
    }
  }

  private advance() {
    if (!this.gen) return;
    const n = this.gen.next();
    if (n.done) {
      this.current = null;
      this.state = 'parado';
      this.gen = null;
      this.robot?.say('Programa concluído!', 1.6);
      this.g.audio.good();
      this.g.emit('programEnd', this.robot);
      this.changed();
      return;
    }
    this.wait = n.value;
    this.current = n.value.block.id;
    this.changed();
  }

  private timer(s: number) {
    const end = this.g.time + s;
    return () => this.g.time >= end;
  }

  cond(c: Cond, r: Robot): boolean {
    const g = this.g;
    switch (c) {
      case 'caixaPerto':
        return g.entities.some((e) => e instanceof Box && !e.carriedBy && dist(e.x, e.y, r.x, r.y) < 120);
      case 'bolaPerto':
        return g.entities.some((e) => e.kind === 'ball' && dist(e.x, e.y, r.x, r.y) < 120);
      case 'bateriaBaixa':
        return r.battery < 25;
      case 'carregando':
        return !!r.carrying;
      case 'noite':
        return g.world.dayNight.isNight;
      case 'plantaComSede':
        return g.scenery.plants.some((p) => p.water < 0.3 && dist(p.x, p.y, r.x, r.y) < 160);
    }
  }

  private findTarget(alvo: Alvo, r: Robot): { x: number; y: number } | null {
    const g = this.g;
    const nearest = <T extends { x: number; y: number }>(list: T[]) => {
      let best: T | null = null;
      let bd = Infinity;
      for (const e of list) {
        const d = dist(e.x, e.y, r.x, r.y);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      return best;
    };
    switch (alvo) {
      case 'caixa':
        return nearest(g.entities.filter((e) => e instanceof Box && !e.carriedBy && !e.inWater && !g.entities.some((o) => o.restingOn === e)));
      case 'bola':
        return nearest(g.entities.filter((e) => e.kind === 'ball' && !e.carriedBy && !e.inWater));
      case 'maca':
        return nearest(g.entities.filter((e) => e.kind === 'apple' && !e.carriedBy && !e.inWater));
      case 'recarga':
        return { x: g.world.station.x, y: g.world.station.y };
      case 'planta': {
        const thirsty = g.scenery.plants.filter((p) => p.water < 0.5);
        const p = nearest(thirsty.length ? thirsty : g.scenery.plants);
        return p ? { x: p.x + (r.x < p.x ? -32 : 32), y: p.y + 14 } : null;
      }
      case 'area':
        return g.missionZone ? { x: g.missionZone.x, y: g.missionZone.y } : null;
      case 'gol':
        return { x: g.scenery.goal.x - 140, y: g.scenery.goal.y };
    }
  }

  private *exec(blocks: Block[], r: Robot): Generator<Wait, void, void> {
    const g = this.g;
    for (const b of blocks) {
      if (++this.ops > 2000) {
        r.say('Programa longo demais!', 2);
        return;
      }
      switch (b.type) {
        case 'andar': {
          const n = clamp(b.n, -20, 20);
          const tx = clamp(r.x + Math.cos(r.heading) * STEP * n, 20, WORLD_W - 20);
          const ty = clamp(r.y + Math.sin(r.heading) * STEP * n * 0.75, GROUND_TOP + 10, GROUND_BOTTOM - 10);
          let done = false;
          r.goTo(tx, ty, g, () => (done = true));
          const t = this.timer(Math.abs(n) * 0.8 + 3);
          yield { block: b, done: () => done || t() };
          break;
        }
        case 'virar': {
          // direções da tela: direita → frente (baixo) → esquerda → fundo (cima)
          const q = Math.round(r.heading / (Math.PI / 2));
          r.heading = (q + (b.dir === 'direita' ? 1 : -1)) * (Math.PI / 2);
          const c = Math.cos(r.heading);
          if (Math.abs(c) > 0.1) r.facing = c > 0 ? 1 : -1;
          g.audio.beep(650);
          yield { block: b, done: this.timer(0.35) };
          break;
        }
        case 'ir': {
          const t = this.findTarget(b.alvo, r);
          if (!t) {
            r.say(`Não achei ${ALVO_LABEL[b.alvo]}...`, 1.8);
            yield { block: b, done: this.timer(1) };
            break;
          }
          let done = false;
          r.goTo(t.x, t.y + 3, g, () => (done = true));
          const tt = this.timer(dist(r.x, r.y, t.x, t.y) / 40 + 4);
          yield { block: b, done: () => done || tt() };
          break;
        }
        case 'pegar':
          if (!r.carrying) g.action(r);
          yield { block: b, done: this.timer(0.45) };
          break;
        case 'soltar':
          if (r.carrying) r.drop(g);
          yield { block: b, done: this.timer(0.6) };
          break;
        case 'chutar':
          g.kickNearest(r);
          yield { block: b, done: this.timer(0.5) };
          break;
        case 'regar':
          g.water(r);
          yield { block: b, done: this.timer(1.1) };
          break;
        case 'dancar':
          r.dance = 2.5;
          yield { block: b, done: this.timer(2.5) };
          break;
        case 'dizer':
          r.say(b.text.slice(0, 40) || '...', 2);
          yield { block: b, done: this.timer(1.2) };
          break;
        case 'esperar':
          yield { block: b, done: this.timer(clamp(b.s, 0, 30)) };
          break;
        case 'repetir': {
          const n = clamp(Math.floor(b.n), 0, 50);
          for (let i = 0; i < n; i++) {
            yield { block: b, done: () => true };
            yield* this.exec(b.body, r);
          }
          break;
        }
        case 'se': {
          const ok = this.cond(b.cond, r);
          yield { block: b, done: this.timer(0.15) };
          yield* this.exec(ok ? b.body : b.else, r);
          break;
        }
      }
    }
  }
}

/** Utilidades de árvore. */
export function findBlock(list: Block[], id: string): { list: Block[]; index: number } | null {
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.id === id) return { list, index: i };
    if (b.type === 'repetir') {
      const r = findBlock(b.body, id);
      if (r) return r;
    }
    if (b.type === 'se') {
      const r = findBlock(b.body, id) ?? findBlock(b.else, id);
      if (r) return r;
    }
  }
  return null;
}

export function containsId(b: Block, id: string): boolean {
  if (b.id === id) return true;
  if (b.type === 'repetir') return b.body.some((c) => containsId(c, id));
  if (b.type === 'se') return b.body.some((c) => containsId(c, id)) || b.else.some((c) => containsId(c, id));
  return false;
}

export function countBlocks(list: Block[]): number {
  let n = 0;
  for (const b of list) {
    n++;
    if (b.type === 'repetir') n += countBlocks(b.body);
    if (b.type === 'se') n += countBlocks(b.body) + countBlocks(b.else);
  }
  return n;
}
