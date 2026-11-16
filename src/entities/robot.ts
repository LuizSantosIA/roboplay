import Matter from 'matter-js';
import { CAT, GROUND_BOTTOM, GROUND_TOP, WORLD_W } from '../config';
import { clamp, dist, pick, rand, roundRect, shade } from '../util';
import { Entity } from './entity';
import type { Game } from '../game';

export type HeadShape = 'quadrada' | 'redonda' | 'tv' | 'domo';
export type AntennaType = 'bola' | 'dupla' | 'raio' | 'mola';
export type Locomotion = 'pernas' | 'rodas';
export type Species = 'robo' | 'cachorro';

export interface RobotConfig {
  name: string;
  color: string;
  head: HeadShape;
  antenna: AntennaType;
  loco: Locomotion;
  /** Ausente = robô (configurações antigas). */
  species?: Species;
}

export const ROBOT_COLORS = ['#4f9cf0', '#f06a4f', '#43c27a', '#f2b632', '#a46cf0', '#f05fa6', '#3fc7c7', '#8a8f99'];
const NAMES = ['Bip', 'Zeca', 'Lumi', 'Tico', 'Nina', 'Bolota', 'Faísca', 'Pixel', 'Rex', 'Juju', 'Parafuso', 'Mel'];

const DOG_NAMES = ['Faro', 'Biscoito', 'Pipoca', 'Thor', 'Paçoca', 'Bidu', 'Luna', 'Fubá'];

export function randomConfig(used: string[] = [], species: Species = 'robo'): RobotConfig {
  const pool = species === 'cachorro' ? DOG_NAMES : NAMES;
  const free = pool.filter((n) => !used.includes(n));
  return {
    species,
    name: free.length ? pick(free) : `${species === 'cachorro' ? 'Cão' : 'Robô'} ${used.length + 1}`,
    color: pick(ROBOT_COLORS),
    head: pick(['quadrada', 'redonda', 'tv', 'domo'] as const),
    antenna: pick(['bola', 'dupla', 'raio', 'mola'] as const),
    loco: Math.random() < 0.75 ? 'pernas' : 'rodas',
  };
}

export interface Glow {
  x: number;
  y: number;
  r: number;
  a: number;
  color: string; // use 'A' no lugar do alfa
}

export type Mood = 'normal' | 'tonto' | 'dormindo' | 'feliz';

export class Robot extends Entity {
  kind = 'robot' as const;
  cfg: RobotConfig;
  speed = 130;
  facing = 1;
  heading = 0; // radianos; 0 = direita
  walkPhase = 0;
  moving = false;
  target: { x: number; y: number } | null = null;
  path: { x: number; y: number }[] = [];
  onArrive: ((ok: boolean) => void) | null = null;
  manualDir: { x: number; y: number } | null = null;
  carrying: Entity | null = null;
  speech: { text: string; t: number } | null = null;
  blinkT = rand(1, 4);
  blink = 0;
  antennaPhase = rand(0, 6);
  look = { x: 0, y: 0 };
  dance = 0;
  flying = false;
  stuckT = 0;
  prevX = 0;
  prevY = 0;
  wanderT = rand(1, 4);
  remote = false; // controlado pela rede
  glowSink: Glow[] | null = null;
  // personalidade
  mood: Mood = 'normal';
  moodT = 0;
  idleT = 0;
  battery = 100;
  wateringT = 0;
  charging = false;
  kickT = 0;
  private lowWarnT = 0;
  private zzzT = 0;
  private barkT = rand(6, 14);

  constructor(x: number, y: number, cfg: RobotConfig) {
    super();
    this.cfg = cfg;
    this.radius = 15;
    this.height = 100;
    this.bounce = 0.2;
    this.groundFriction = 0.3;
    this.groundMask = CAT.ROBOT | CAT.OBJ | CAT.WALL | CAT.LAKE | CAT.SOLID;
    this.body = Matter.Bodies.circle(x, y, 15, {
      inertia: Infinity,
      frictionAir: 0.3,
      friction: 0,
      restitution: 0.1,
      density: 0.01,
      label: 'robot',
      collisionFilter: { category: CAT.ROBOT, mask: this.groundMask },
    });
    this.setPos(x, y);
  }

  get name() {
    return this.cfg.name;
  }

  get isDog() {
    return this.cfg.species === 'cachorro';
  }

  /** Altura (em px, escala 1) onde fica o que ele carrega. */
  get carryZ() {
    return this.isDog ? 50 : 92;
  }

  /** Altura do topo da cabeça (escala 1), para balão e clique. */
  get topZ() {
    return this.isDog ? 74 : 104;
  }

  say(text: string, dur = 2.2) {
    if (this.isDog && !/^(Au|Woof|Zzz|Z$)/.test(text) && Math.random() < 0.4) text = pick(['Au! ', 'Au au! ', 'Woof! ']) + text;
    this.speech = { text, t: dur };
  }

  goTo(x: number, y: number, g: Game, onArrive?: (ok: boolean) => void) {
    x = clamp(x, 20, WORLD_W - 20);
    y = clamp(y, GROUND_TOP + 8, GROUND_BOTTOM - 8);
    const p = g.planPath(this.x, this.y, x, y);
    this.path = p;
    this.target = p.length ? p[p.length - 1] : null;
    this.stuckT = 0;
    if (this.onArrive) this.onArrive(false);
    this.onArrive = onArrive ?? null;
  }

  stop() {
    this.target = null;
    this.path = [];
    if (this.onArrive) {
      const cb = this.onArrive;
      this.onArrive = null;
      cb(false);
    }
  }

  /** Multiplicador de velocidade (bateria, humor...). */
  speedFactor(_g: Game) {
    let f = 1;
    if (this.battery <= 0) f = 0.25;
    else if (this.battery < 20) f = 0.55;
    if (this.mood === 'tonto') f *= 0.6;
    return f;
  }

  /** Fica tonto (chacoalhado). */
  makeDizzy(g: Game) {
    this.mood = 'tonto';
    this.moodT = 4;
    this.say('Tô tonto...', 2.4);
    g.audio.bad();
  }

  celebrate(g: Game) {
    if (this.mood === 'dormindo') this.wake();
    this.mood = 'feliz';
    this.moodT = 2.6;
    if (!this.airborne) this.vz = 330;
    g.particles.confetti(this.x, this.y, this.z + 100, 26);
    this.say(pick(this.isDog ? ['Au au au!', 'Auuuu!', 'Woof! Consegui!', 'Eba! Au!'] : ['Eba!', 'Consegui!', 'Uhuuu!', 'Viva!']), 2);
    if (this.isDog) g.audio.bark();
  }

  wake() {
    this.idleT = 0;
    if (this.mood === 'dormindo') {
      this.mood = 'normal';
      this.say(pick(['Hã? Acordei!', 'Bom dia!', 'Só um cochilo...']), 1.6);
    }
  }

  /** Chamado antes do passo de física: define a velocidade desejada. */
  drive(dt: number, g: Game) {
    if (!this.body || this.carriedBy) return;
    let vx = 0;
    let vy = 0;
    const spd = this.speed * this.speedFactor(g);
    const canWalk = !this.airborne && !this.dragged && this.dance <= 0;
    if (this.manualDir && canWalk) {
      if (this.target) this.stop();
      vx = this.manualDir.x * spd;
      vy = this.manualDir.y * spd * 0.75;
    } else if (this.path.length && canWalk) {
      const wp = this.path[0];
      const d = dist(this.x, this.y, wp.x, wp.y);
      if (d < 7) {
        this.path.shift();
        if (!this.path.length) {
          this.target = null;
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.(true);
        }
      } else {
        vx = ((wp.x - this.x) / d) * spd;
        vy = ((wp.y - this.y) / d) * spd;
        const moved = dist(this.x, this.y, this.prevX, this.prevY);
        if (moved < spd * dt * 0.2) this.stuckT += dt;
        else this.stuckT = Math.max(0, this.stuckT - dt);
        if (this.stuckT > 1.4) {
          this.stuckT = 0;
          this.say(pick(['Hmm, travei!', 'Não consigo passar!']));
          this.stop();
        }
      }
    }
    if (this.mood === 'tonto' && (vx || vy)) {
      const a = Math.sin(g.time * 7 + this.antennaPhase) * 0.9;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const nx = vx * c - vy * sn;
      vy = vx * sn + vy * c;
      vx = nx;
    }
    if (this.mood === 'dormindo' && (vx || vy)) this.wake();
    this.manualDir = null;
    this.prevX = this.x;
    this.prevY = this.y;
    const slip = this.slippery;
    if (vx || vy) {
      this.moving = true;
      if (Math.abs(vx) > 4) this.facing = vx > 0 ? 1 : -1;
      this.heading = Math.atan2(vy, vx);
    } else this.moving = false;
    if (canWalk) {
      if (slip > 0.5 && (vx || vy) && Math.random() < dt * 0.6 && !this.speech) this.say(pick(['Escorregaaa!', 'Opa, poça!', 'Uiii!']), 1.2);
      if (slip > 0.05) {
        // escorregando: mantém parte do embalo
        const cur = Matter.Body.getVelocity(this.body);
        const k = 0.04 + (1 - slip) * 0.5;
        Matter.Body.setVelocity(this.body, {
          x: cur.x + (vx / 60 - cur.x) * k,
          y: cur.y + (vy / 60 - cur.y) * k,
        });
      } else if (vx || vy || !this.dragged) {
        if (vx || vy) Matter.Body.setVelocity(this.body, { x: vx / 60, y: vy / 60 });
      }
    }
  }

  pickUp(e: Entity, g: Game) {
    if (this.carrying || e.carriedBy) return false;
    // solta o que estiver em cima do objeto
    for (const o of g.entities) if (o.restingOn === e) o.restingOn = null;
    this.carrying = e;
    e.carriedBy = this;
    e.restingOn = null;
    e.vz = 0;
    if (e.body) Matter.Body.setVelocity(e.body, { x: 0, y: 0 });
    g.audio.pickup();
    this.say(pick(['Peguei!', 'Essa é minha!', 'Upa!']));
    g.emit('pickup', { robot: this, entity: e });
    return true;
  }

  drop(g: Game, throwSpeed = 0) {
    const e = this.carrying;
    if (!e) return null;
    this.carrying = null;
    e.carriedBy = null;
    const fx = this.facing * 30;
    e.setPos(clamp(this.x + fx, 20, WORLD_W - 20), clamp(this.y + 4, GROUND_TOP + 8, GROUND_BOTTOM - 8));
    e.z = this.z + 70;
    e.vz = throwSpeed ? 260 : 0;
    if (e.body) Matter.Body.setVelocity(e.body, { x: (this.facing * throwSpeed) / 60, y: 0 });
    this.say(throwSpeed ? 'Lá vai!' : 'Pronto!');
    g.audio.drop();
    g.emit('drop', { robot: this, entity: e });
    return e;
  }

  /** Arremessa o que carrega na direção em que olha. */
  throwAhead(g: Game) {
    const e = this.carrying;
    if (!e) return;
    const hx = Math.cos(this.heading);
    const hy = Math.sin(this.heading);
    this.carrying = null;
    e.carriedBy = null;
    e.setPos(clamp(this.x + hx * 26, 20, WORLD_W - 20), clamp(this.y + hy * 14, GROUND_TOP + 8, GROUND_BOTTOM - 8));
    e.z = this.z + 80;
    e.vz = 300;
    const sp = 420;
    if (e.body) Matter.Body.setVelocity(e.body, { x: (hx * sp) / 60, y: (hy * sp * 0.6) / 60 });
    this.kickT = 0.3;
    this.say(pick(['Lá vai!', 'Pega!', 'Arremesso!']), 1.2);
    g.audio.drop();
    g.emit('drop', { robot: this, entity: e });
  }

  update(dt: number, g: Game) {
    this.height = this.isDog ? 64 : 100;
    // posição do objeto carregado
    if (this.carrying) {
      const c = this.carrying;
      c.setPos(this.x, this.y + 0.1);
      c.z = this.z + this.carryZ * this.scale;
      if (c.body) Matter.Body.setVelocity(c.body, { x: 0, y: 0 });
    }
    if (this.moving || (this.body && Math.hypot(this.body.velocity.x, this.body.velocity.y) > 0.6 && !this.airborne)) {
      const prev = this.walkPhase;
      this.walkPhase += dt * 11 * this.speedFactor(g);
      if (Math.floor(prev / Math.PI) !== Math.floor(this.walkPhase / Math.PI) && this.moving) g.audio.step(this);
    } else this.walkPhase *= 0.85;
    // piscar
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 0.14;
      this.blinkT = rand(2, 5);
    }
    this.blink = Math.max(0, this.blink - dt);
    // olhos seguem o cursor
    const p = g.pointerWorld;
    const hx = this.x;
    const hy = this.y - this.z - (this.isDog ? 52 : 75) * this.scale;
    const dx = p.x - hx;
    const dy = p.y - hy;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 120);
    this.look.x += ((dx / d) * 2.8 * k - this.look.x) * Math.min(1, dt * 10);
    this.look.y += ((dy / d) * 2.4 * k - this.look.y) * Math.min(1, dt * 10);
    if (this.speech) {
      this.speech.t -= dt;
      if (this.speech.t <= 0) this.speech = null;
    }
    if (this.dance > 0) this.dance -= dt;
    if (this.wateringT > 0) this.wateringT -= dt;
    if (this.kickT > 0) this.kickT -= dt;
    // bateria
    if (!this.remote) {
      let drain = 0.012;
      if (this.moving) drain += 0.45;
      if (this.carrying) drain += this.moving ? 0.3 : 0.08;
      if (this.dance > 0) drain += 0.3;
      if (!this.charging) this.battery = Math.max(0, this.battery - drain * g.drainMul * dt);
      if (this.battery < 20 && !this.charging) {
        this.lowWarnT -= dt;
        if (this.lowWarnT <= 0) {
          this.lowWarnT = 14;
          this.say(this.battery <= 0 ? 'Sem bateria... me leva pra recarga!' : 'Bateria baixa! Preciso recarregar.', 2.6);
        }
      }
    }
    // humor
    if (this.moodT > 0) {
      this.moodT -= dt;
      if (this.moodT <= 0 && (this.mood === 'tonto' || this.mood === 'feliz')) this.mood = 'normal';
    }
    const active = this.moving || this.dragged || this.dance > 0 || this.carriedBy || this.airborne || g.selected === this && g.input.moveDir();
    if (active) this.idleT = 0;
    else this.idleT += dt;
    if (this.mood === 'normal' && this.idleT > 25 && !this.remote) {
      this.mood = 'dormindo';
      this.say('Zzz...', 1.5);
    }
    if (this.mood === 'dormindo') {
      this.zzzT -= dt;
      if (this.zzzT <= 0) {
        this.zzzT = 1.1;
        g.particles.spawn({ type: 'texto', x: this.x + 14 * this.scale, y: this.y, z: this.z + 100 * this.scale, vx: 12, vz: 26, life: 2, color: '#ffffff', size: 13, text: 'Z', gravity: 0 });
      }
    }
    // latido de vez em quando
    if (this.isDog && !this.remote && this.mood === 'normal' && this.battery > 0) {
      this.barkT -= dt;
      if (this.barkT <= 0) {
        this.barkT = rand(12, 26);
        if (!this.speech) {
          this.say(pick(['Au au!', 'Au!', 'Woof!', 'Auuu!']), 1.3);
          g.audio.bark();
        }
      }
    }
    // voando
    if (this.z > 40 && !this.flying && !this.dragged) {
      this.flying = true;
      this.say('Uau, voando!', 1.6);
    }
  }

  onLand(impact: number, g: Game) {
    if (this.flying) {
      this.flying = false;
      if (impact > 350) this.say(pick(['Ufa!', 'Pousei!', 'De novo!']));
    }
    if (impact > 260) g.audio.thud(Math.min(1, impact / 1000));
  }

  hitTest(wx: number, wy: number) {
    const s = this.scale;
    const top = this.y - this.z - this.topZ * s;
    const bottom = this.y - this.z + 6 * s;
    return Math.abs(wx - this.x) < (this.isDog ? 36 : 24) * s && wy >= top && wy <= bottom;
  }

  // ---------- Desenho ----------

  eyesMood(): Mood {
    if (this.mood !== 'normal') return this.mood;
    if (this.battery <= 0) return 'dormindo';
    return 'normal';
  }

  draw(ctx: CanvasRenderingContext2D, g: Game) {
    const s = this.scale;
    const t = g.time;
    if (!this.carriedBy) this.drawShadow(ctx, this.isDog ? 34 : 23, this.isDog ? 8 : 7);
    if (g.selected === this) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -t * 18;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, (this.isDog ? 42 : 31) * s, 11 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(this.x, this.y - this.z);
    ctx.scale(s, s);
    this.drawBody(ctx, g);
    ctx.restore();
  }

  /** Desenha o robô com origem nos pés (escala 1). Usado também no editor. */
  drawBody(ctx: CanvasRenderingContext2D, g: { time: number; night?: number; glows?: Glow[] }, preview = false) {
    const t = g.time;
    this.glowSink = preview ? null : g.glows ?? null;
    if (this.isDog) return this.drawDog(ctx, g, preview);
    const c = this.cfg;
    const f = this.facing;
    const wheels = c.loco === 'rodas';
    const mood = preview ? 'normal' : this.eyesMood();
    const dancing = this.dance > 0;
    const sw = Math.sin(this.walkPhase);
    const bob = this.moving ? Math.abs(Math.cos(this.walkPhase)) * 2.2 : Math.sin(t * 2 + this.antennaPhase) * 0.6;
    const dark = shade(c.color, -0.3);
    const light = shade(c.color, 0.25);
    const legTop = wheels ? -12 : -24;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (dancing) ctx.rotate(Math.sin(t * 9) * 0.12);

    // --- locomoção ---
    if (wheels) {
      const rot = this.x / 10;
      for (const wx of [-11, 11]) {
        ctx.fillStyle = '#2d3238';
        ctx.beginPath();
        ctx.arc(wx, -9, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9aa3ad';
        ctx.beginPath();
        ctx.arc(wx, -9, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5c646d';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(wx + Math.cos(rot) * 7, -9 + Math.sin(rot) * 7);
        ctx.lineTo(wx - Math.cos(rot) * 7, -9 - Math.sin(rot) * 7);
        ctx.stroke();
      }
      ctx.fillStyle = dark;
      roundRect(ctx, -16, -16, 32, 6, 3);
      ctx.fill();
    } else {
      for (const side of [-1, 1]) {
        const ph = side === -1 ? sw : -sw;
        const lift = this.moving ? Math.max(0, ph) * 4 : 0;
        const fx = side * 8 + (this.moving ? ph * 5 * f : 0) + (dancing ? Math.sin(t * 9 + side) * 3 : 0);
        ctx.strokeStyle = '#5a636d';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(side * 8, legTop - bob);
        ctx.lineTo(fx, -4 - lift);
        ctx.stroke();
        ctx.fillStyle = '#3a4048';
        roundRect(ctx, fx - 6 + f * 1.5, -6 - lift, 12, 6, 3);
        ctx.fill();
      }
    }

    ctx.translate(0, -bob);

    // --- braços ---
    const armAngle = (side: number): number => {
      if (this.carrying) return Math.PI - 0.32;
      if (this.kickT > 0 && side === f) return Math.PI / 2 + 0.4;
      if (this.wateringT > 0 && side === f) return Math.PI / 2 - 0.15;
      if (dancing) return Math.PI / 2 + Math.sin(t * 9 + (side > 0 ? 0 : Math.PI)) * 1.1;
      if (mood === 'feliz') return Math.PI - 0.5 + Math.sin(t * 14) * 0.25;
      if (this.flying) return Math.PI / 2 + 0.6;
      const swing = this.moving ? Math.sin(this.walkPhase + (side > 0 ? 0 : Math.PI)) * 0.5 : Math.sin(t * 1.5) * 0.05;
      return 0.18 + swing * 0.6;
    };
    const bodyTop = legTop - 32;
    const drawArm = (side: number) => {
      const a = armAngle(side);
      const sx = side * 19;
      const sy = bodyTop + 7;
      const len = 22;
      const ex = sx + Math.sin(a) * len * side;
      const ey = sy + Math.cos(a) * len;
      ctx.strokeStyle = '#5a636d';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(ex, ey, 4.5, 0, Math.PI * 2);
      ctx.fill();
    };
    drawArm(-1);
    drawArm(1);
    if (this.wateringT > 0) {
      // regador
      const hx = f * 19 + f * 22;
      const hy = bodyTop + 7 + 3;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.scale(f, 1);
      ctx.rotate(0.35);
      ctx.fillStyle = '#3a9be0';
      roundRect(ctx, -6, -6, 14, 12, 3);
      ctx.fill();
      ctx.strokeStyle = '#3a9be0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(16, -6);
      ctx.stroke();
      ctx.fillStyle = 'rgba(140,200,255,0.9)';
      for (let i = 0; i < 3; i++) {
        const k = ((t * 3 + i / 3) % 1);
        ctx.beginPath();
        ctx.arc(17 + k * 4, -5 + k * 22, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // --- corpo ---
    ctx.fillStyle = c.color;
    roundRect(ctx, -19, bodyTop, 38, 32, 8);
    ctx.fill();
    ctx.fillStyle = light;
    roundRect(ctx, -16, bodyTop + 3, 32, 6, 3);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    roundRect(ctx, -19, bodyTop, 38, 32, 8);
    ctx.stroke();
    // painel
    ctx.fillStyle = 'rgba(20,30,40,0.55)';
    roundRect(ctx, -10, bodyTop + 12, 20, 13, 3);
    ctx.fill();
    this.drawPanel(ctx, -10, bodyTop + 12, t);

    // --- cabeça ---
    const headY = bodyTop - 4;
    ctx.save();
    ctx.translate(f * 1.2, 0);
    this.drawHead(ctx, headY, t, mood, light, dark, g.night ?? 0);
    ctx.restore();
  }

  /** Painel do peito (pode mostrar bateria). */
  drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    const b = this.battery / 100;
    const col = b < 0.2 ? '#ff5a4f' : b < 0.5 ? '#ffc94a' : '#7dffb0';
    if (b < 0.2 && Math.sin(t * 8) < 0 && !this.charging) return;
    ctx.fillStyle = col;
    const bars = Math.max(1, Math.ceil(b * 4));
    for (let i = 0; i < bars; i++) ctx.fillRect(x + 3 + i * 4, y + 3.5, 3, 6);
    if (this.charging) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('⚡', x + 10, y + 11);
    }
  }

  private drawHead(ctx: CanvasRenderingContext2D, y: number, t: number, mood: Mood, light: string, dark: string, night: number) {
    const c = this.cfg;
    const top = y - 30;
    ctx.fillStyle = c.color;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    let antennaBase = top;
    switch (c.head) {
      case 'redonda':
        ctx.beginPath();
        ctx.arc(0, y - 16, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        antennaBase = y - 33;
        break;
      case 'tv':
        roundRect(ctx, -22, top + 1, 44, 29, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = dark;
        roundRect(ctx, -26, y - 20, 4, 10, 2);
        ctx.fill();
        roundRect(ctx, 22, y - 20, 4, 10, 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(15,25,35,0.75)';
        roundRect(ctx, -17, top + 5, 34, 21, 4);
        ctx.fill();
        break;
      case 'domo':
        ctx.beginPath();
        ctx.moveTo(-19, y);
        ctx.lineTo(-19, y - 14);
        ctx.arc(0, y - 14, 19, Math.PI, 0);
        ctx.lineTo(19, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.ellipse(-7, y - 24, 6, 3.5, -0.5, 0, Math.PI * 2);
        ctx.fill();
        antennaBase = y - 33;
        break;
      default:
        roundRect(ctx, -18, top, 36, 30, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = light;
        roundRect(ctx, -14, top + 3, 12, 4, 2);
        ctx.fill();
    }
    this.drawAntenna(ctx, antennaBase, t, night);
    this.drawFace(ctx, y - 15, t, mood);
  }

  private drawAntenna(ctx: CanvasRenderingContext2D, base: number, t: number, night: number) {
    const c = this.cfg;
    const on = (t * 1.1 + this.antennaPhase) % 1.6 < 0.35;
    const bulb = on ? '#ff5a4f' : '#b8323a';
    const sway = Math.sin(t * 3 + this.antennaPhase) * (this.moving ? 3 : 1);
    ctx.strokeStyle = '#5a636d';
    ctx.lineWidth = 2;
    const tips: [number, number][] = [];
    if (c.antenna === 'dupla') {
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sd * 6, base);
        ctx.lineTo(sd * 12 + sway, base - 14);
        ctx.stroke();
        tips.push([sd * 12 + sway, base - 15]);
      }
    } else if (c.antenna === 'raio') {
      ctx.beginPath();
      ctx.moveTo(0, base);
      ctx.lineTo(4 + sway * 0.5, base - 6);
      ctx.lineTo(-3 + sway * 0.7, base - 10);
      ctx.lineTo(2 + sway, base - 16);
      ctx.stroke();
      tips.push([2 + sway, base - 17]);
    } else if (c.antenna === 'mola') {
      ctx.beginPath();
      ctx.moveTo(0, base);
      const bounce = Math.sin(t * 6 + this.antennaPhase) * 2;
      for (let i = 1; i <= 8; i++) {
        ctx.lineTo((i % 2 ? 4 : -4) + (sway * i) / 8, base - i * (2 + bounce * 0.1) - (i * bounce) / 16);
      }
      ctx.stroke();
      tips.push([sway, base - 18 - bounce / 2]);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, base);
      ctx.lineTo(sway, base - 13);
      ctx.stroke();
      tips.push([sway, base - 15]);
    }
    for (const [x, y] of tips) {
      if (night > 0.2 || on) {
        const glowA = Math.max(night * (on ? 1 : 0.55), on ? 0.35 : 0);
        const gr = ctx.createRadialGradient(x, y, 0, x, y, 14);
        gr.addColorStop(0, `rgba(255,120,100,${glowA})`);
        gr.addColorStop(1, 'rgba(255,120,100,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = night > 0.3 ? '#ff7a6a' : bulb;
      ctx.beginPath();
      ctx.arc(x, y, 3.6, 0, Math.PI * 2);
      ctx.fill();
      if (this.glowSink && night > 0.2) {
        const m = ctx.getTransform();
        this.glowSink.push({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, r: on ? 26 : 18, a: night * (on ? 1 : 0.6), color: 'rgba(255,110,90,A)' });
      }
    }
  }

  private drawFace(ctx: CanvasRenderingContext2D, cy: number, t: number, mood: Mood, noMouth = false) {
    const tv = this.cfg.head === 'tv';
    const ex = 7.5;
    const lx = this.look.x;
    const ly = this.look.y;
    ctx.lineCap = 'round';
    if (mood === 'tonto') {
      ctx.strokeStyle = tv ? '#9dffcf' : '#2a2f36';
      ctx.lineWidth = 1.6;
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        for (let a = 0; a < 12; a += 0.4) {
          const r = a * 0.42;
          const ang = a + t * 8 * sd;
          const px = sd * ex + Math.cos(ang) * r;
          const py = cy + Math.sin(ang) * r;
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    } else if (mood === 'dormindo' || this.blink > 0) {
      ctx.strokeStyle = tv ? '#9dffcf' : '#2a2f36';
      ctx.lineWidth = 2;
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sd * ex, cy - 1, 4, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }
    } else if (mood === 'feliz') {
      ctx.strokeStyle = tv ? '#9dffcf' : '#2a2f36';
      ctx.lineWidth = 2.4;
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sd * ex, cy + 2, 4, 1.15 * Math.PI, 1.85 * Math.PI);
        ctx.stroke();
      }
    } else if (tv) {
      ctx.fillStyle = '#9dffcf';
      for (const sd of [-1, 1]) {
        roundRect(ctx, sd * ex - 3 + lx, cy - 4 + ly, 6, 8, 2);
        ctx.fill();
      }
    } else {
      for (const sd of [-1, 1]) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(sd * ex, cy, 5.2, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1f252c';
        ctx.beginPath();
        ctx.arc(sd * ex + lx, cy + ly, 2.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(sd * ex + lx + 1, cy + ly - 1, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // boca
    if (!tv && !noMouth) {
      ctx.strokeStyle = '#2a2f36';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      if (mood === 'feliz' || this.dance > 0) ctx.arc(0, cy + 7, 4, 0.1 * Math.PI, 0.9 * Math.PI);
      else if (mood === 'tonto') {
        ctx.moveTo(-4, cy + 9);
        ctx.quadraticCurveTo(-2, cy + 7, 0, cy + 9);
        ctx.quadraticCurveTo(2, cy + 11, 4, cy + 9);
      } else if (mood === 'dormindo') ctx.arc(0, cy + 9, 1.8, 0, Math.PI * 2);
      else {
        ctx.moveTo(-3.5, cy + 8);
        ctx.quadraticCurveTo(0, cy + 10, 3.5, cy + 8);
      }
      ctx.stroke();
    }
  }

  /** Cachorro robô visto de lado, origem nos pés, desenhado virado para a direita e espelhado. */
  private drawDog(ctx: CanvasRenderingContext2D, g: { time: number; night?: number }, preview: boolean) {
    const t = g.time;
    const c = this.cfg;
    const f = this.facing;
    const wheels = c.loco === 'rodas';
    const mood = preview ? 'normal' : this.eyesMood();
    const dancing = this.dance > 0;
    const happy = mood === 'feliz' || dancing;
    const dark = shade(c.color, -0.3);
    const light = shade(c.color, 0.25);
    const bob = this.moving ? Math.abs(Math.cos(this.walkPhase)) * 1.8 : Math.sin(t * 2 + this.antennaPhase) * 0.5;
    const bodyY = wheels ? -34 : -40; // topo do tronco
    const bodyH = 19;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.scale(f, 1);
    if (dancing) ctx.rotate(Math.sin(t * 9) * 0.1);

    // --- patas / rodas ---
    if (wheels) {
      const rot = (this.x / 10) * f;
      for (const wx of [-15, 15]) {
        ctx.fillStyle = '#2d3238';
        ctx.beginPath();
        ctx.arc(wx, -9, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9aa3ad';
        ctx.beginPath();
        ctx.arc(wx, -9, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5c646d';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(wx + Math.cos(rot) * 7, -9 + Math.sin(rot) * 7);
        ctx.lineTo(wx - Math.cos(rot) * 7, -9 - Math.sin(rot) * 7);
        ctx.stroke();
      }
      ctx.fillStyle = dark;
      roundRect(ctx, -20, -19, 40, 6, 3);
      ctx.fill();
    } else {
      const sw = this.walkPhase;
      // [x do quadril, fase, longe?] — trote: diagonais juntas
      const legs: [number, number, boolean][] = [
        [-13, sw + Math.PI, true],
        [17, sw, true],
        [-16, sw, false],
        [14, sw + Math.PI, false],
      ];
      for (const [hx, phase, far] of legs) {
        const ph = Math.sin(phase);
        const lift = this.moving ? Math.max(0, ph) * 4 : 0;
        const fx = hx + (this.moving ? ph * 6 : 0) + (dancing ? Math.sin(t * 12 + hx) * 2 : 0);
        ctx.strokeStyle = far ? '#48505a' : '#5a636d';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(hx, bodyY + bodyH - 4 - bob);
        ctx.lineTo(fx, -4 - lift);
        ctx.stroke();
        ctx.fillStyle = far ? '#2c3138' : '#3a4048';
        roundRect(ctx, fx - 4.5, -6 - lift, 10, 6, 3);
        ctx.fill();
      }
    }

    ctx.translate(0, -bob);

    // --- rabo (abana mais quando feliz) ---
    const wagSpeed = mood === 'dormindo' ? 0 : happy ? 24 : this.moving ? 13 : 6;
    const wagAmp = mood === 'dormindo' ? 0 : happy ? 0.7 : 0.4;
    const wag = Math.sin(t * wagSpeed + this.antennaPhase) * wagAmp;
    const baseA = mood === 'dormindo' || this.battery <= 0 ? 2.6 : mood === 'tonto' ? 2.2 : -2.2;
    ctx.strokeStyle = '#5a636d';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    let tx = -21;
    let ty = bodyY + 5;
    ctx.moveTo(tx, ty);
    for (let i = 1; i <= 3; i++) {
      const a = baseA + wag * (i / 3) - 0.15 * i;
      tx += Math.cos(a) * 6;
      ty += Math.sin(a) * 6;
      ctx.lineTo(tx, ty);
    }
    ctx.stroke();
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(tx, ty, 3.6, 0, Math.PI * 2);
    ctx.fill();

    // --- tronco ---
    ctx.fillStyle = c.color;
    roundRect(ctx, -23, bodyY, 46, bodyH, 9);
    ctx.fill();
    ctx.fillStyle = light;
    roundRect(ctx, -18, bodyY + bodyH - 6, 34, 4, 2);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    roundRect(ctx, -23, bodyY, 46, bodyH, 9);
    ctx.stroke();
    // coleira
    ctx.fillStyle = '#e8473f';
    roundRect(ctx, 14, bodyY - 3, 6, bodyH - 2, 3);
    ctx.fill();
    ctx.fillStyle = '#ffd34a';
    ctx.beginPath();
    ctx.arc(18, bodyY + bodyH - 3, 2.6, 0, Math.PI * 2);
    ctx.fill();
    // painel (bateria) na lateral
    ctx.fillStyle = 'rgba(20,30,40,0.55)';
    roundRect(ctx, -12, bodyY + 2, 20, 11, 3);
    ctx.fill();
    ctx.save();
    ctx.translate(-12, bodyY + 1);
    ctx.scale(1, 0.85);
    this.drawPanel(ctx, 0, 0, t);
    ctx.restore();

    // --- cabeça ---
    const tilt = mood === 'tonto' ? Math.sin(t * 6) * 0.15 : happy ? Math.sin(t * 10) * 0.08 : 0;
    ctx.save();
    ctx.translate(25, bodyY - 7);
    ctx.rotate(tilt);
    this.drawDogHead(ctx, t, mood, light, dark, g.night ?? 0, happy);
    ctx.restore();
  }

  private drawDogHead(ctx: CanvasRenderingContext2D, t: number, mood: Mood, light: string, dark: string, night: number, happy: boolean) {
    const c = this.cfg;
    const ear = c.head;
    const flop = Math.sin(this.walkPhase) * (this.moving ? 0.25 : 0) + (happy ? Math.sin(t * 12) * 0.2 : 0);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    // pescoço
    ctx.fillStyle = dark;
    roundRect(ctx, -9, 2, 10, 12, 4);
    ctx.fill();
    // orelhas de trás
    ctx.fillStyle = dark;
    if (ear === 'quadrada' || ear === 'tv') {
      const h = ear === 'tv' ? 9 : 13;
      ctx.beginPath();
      ctx.moveTo(-10, -9);
      ctx.lineTo(-7 + flop * 4, -9 - h);
      ctx.lineTo(-1, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (ear === 'domo') {
      ctx.beginPath();
      ctx.arc(-8, -11, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // crânio
    ctx.fillStyle = c.color;
    if (ear === 'redonda') {
      ctx.beginPath();
      ctx.arc(0, -1, 12.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      roundRect(ctx, -12, -12, 24, 22, 7);
      ctx.fill();
      ctx.stroke();
    }
    // focinho
    ctx.fillStyle = light;
    roundRect(ctx, 6, -1, 15, 10, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1f252c';
    ctx.beginPath();
    ctx.ellipse(20, 1, 3.2, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // boca / língua
    ctx.strokeStyle = '#2a2f36';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(19, 7);
    ctx.quadraticCurveTo(14, 9.5, 9, 7);
    ctx.stroke();
    if ((happy || this.moving) && mood !== 'dormindo') {
      const lw = Math.sin(t * 16) * 0.8;
      ctx.fillStyle = '#ff7d9a';
      ctx.beginPath();
      ctx.ellipse(13, 10.5 + lw * 0.5, 2.8, 4 + lw, 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    // tela no rosto (orelhas "tela")
    if (ear === 'tv') {
      ctx.fillStyle = 'rgba(15,25,35,0.75)';
      roundRect(ctx, -8, -9, 16, 12, 3);
      ctx.fill();
    }
    // olhos (reaproveita o rosto do robô, sem boca)
    ctx.save();
    ctx.translate(1, 0);
    ctx.scale(0.62, 0.62);
    const lx = this.look.x;
    this.look.x = lx * this.facing;
    this.drawFace(ctx, -4, t, mood, true);
    this.look.x = lx;
    ctx.restore();
    // orelhas da frente
    ctx.fillStyle = dark;
    ctx.strokeStyle = dark;
    if (ear === 'quadrada' || ear === 'tv') {
      const h = ear === 'tv' ? 10 : 15;
      ctx.beginPath();
      ctx.moveTo(-6, -11);
      ctx.lineTo(-1 + flop * 5, -11 - h);
      ctx.lineTo(4, -11);
      ctx.closePath();
      ctx.fill();
    } else if (ear === 'redonda') {
      ctx.save();
      ctx.translate(-6, -8);
      ctx.rotate(0.35 + flop);
      ctx.beginPath();
      ctx.ellipse(-1, 8, 4.5, 9.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (ear === 'domo') {
      ctx.beginPath();
      ctx.arc(1, -12, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(1, -12, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // antena no alto da cabeça
    ctx.save();
    ctx.translate(-4, 0);
    ctx.scale(0.8, 0.8);
    this.drawAntenna(ctx, ear === 'redonda' ? -16 : -15, t, night);
    ctx.restore();
  }

  drawOverlay(ctx: CanvasRenderingContext2D, g: Game) {
    const s = this.scale;
    // nome
    ctx.font = `600 ${11}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const nw = ctx.measureText(this.name).width + 12;
    const ny = this.y + 16 * s;
    ctx.fillStyle = g.selected === this ? 'rgba(255,255,255,0.92)' : 'rgba(20,30,40,0.45)';
    roundRect(ctx, this.x - nw / 2, ny - 8, nw, 16, 8);
    ctx.fill();
    ctx.fillStyle = g.selected === this ? '#1d2a36' : '#fff';
    ctx.fillText(this.name, this.x, ny + 0.5);
    // balão de fala
    if (this.speech) {
      const text = this.speech.text;
      ctx.font = `600 13px system-ui, sans-serif`;
      const w = Math.min(220, ctx.measureText(text).width + 18);
      const h = 26;
      const bx = this.x - w / 2;
      const by = this.y - this.z - (this.topZ + 8) * s - h - (this.carrying ? 34 * s : 0);
      const a = Math.min(1, this.speech.t * 4);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(30,40,50,0.25)';
      ctx.lineWidth = 1;
      roundRect(ctx, bx, by, w, h, 10);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.x - 6, by + h - 0.5);
      ctx.lineTo(this.x, by + h + 7);
      ctx.lineTo(this.x + 6, by + h - 0.5);
      ctx.fill();
      ctx.fillStyle = '#1d2a36';
      ctx.fillText(text, this.x, by + h / 2 + 0.5, w - 10);
      ctx.globalAlpha = 1;
    }
  }
}
