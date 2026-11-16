import Matter from 'matter-js';
import { FIXED_DT, GROUND_BOTTOM, GROUND_TOP, MIN_VIEW_W, VIEW_H, WORLD_W } from './config';
import { clamp, dist, pick, rand } from './util';
import { Physics } from './systems/physics';
import { Audio } from './systems/audio';
import { Input } from './systems/input';
import { Particles } from './systems/particles';
import { Camera } from './world/camera';
import { World } from './world/landscape';
import { Entity } from './entities/entity';
import { Robot, RobotConfig, randomConfig, Glow } from './entities/robot';
import { Box, BoxColor } from './entities/box';
import { Ball } from './entities/ball';
import type { Hud } from './ui/hud';
import { saveRoster } from './systems/storage';
import { buildScenery, Scenery } from './world/props';

/** Elementos fixos do cenário que participam da ordenação por profundidade. */
export interface Prop {
  sortKey(): number;
  draw(ctx: CanvasRenderingContext2D, g: Game): void;
  drawGround?(ctx: CanvasRenderingContext2D, g: Game): void;
  drawOverlay?(ctx: CanvasRenderingContext2D, g: Game): void;
  update?(dt: number, g: Game): void;
  hit?(wx: number, wy: number): boolean;
  onTap?(g: Game, wx: number, wy: number): void;
  minX: number;
  maxX: number;
}

type Handler = (data: any) => void;

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr = 1;
  cssScale = 1; // pixels CSS por unidade lógica
  cssW = 0;
  cssH = 0;
  offY = 0; // céu extra acima da área lógica (telas altas)
  physics = new Physics();
  audio = new Audio();
  camera = new Camera();
  particles = new Particles();
  world: World;
  scenery: Scenery;
  input: Input;
  hud: Hud | null = null;
  entities: Entity[] = [];
  props: Prop[] = [];
  selected: Robot | null = null;
  time = 0;
  night = 0;
  pointerWorld = { x: -999, y: -999 };
  glows: Glow[] = [];
  autonomous = false;
  paused = false;
  lockManual = false; // missão "só blocos"
  showHeading = false;
  drainMul = 1; // gasto de bateria (missões zeram)
  missionZone: { x: number; y: number; rx: number; ry: number } | null = null;
  private bus = new Map<string, Handler[]>();
  private acc = 0;
  private lastT = 0;
  private bodyMap = new Map<number, Entity>();
  private danceBeatT = 0;
  private danceBeatI = 0;
  private shake = { lastVx: 0, flips: 0, t: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.world = new World(this);
    this.scenery = buildScenery(this);
    this.input = new Input(this);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.physics.onCollision((a, b) => this.handleCollision(a, b));
    this.on('shaken', (e) => {
      if (e instanceof Robot) e.makeDizzy(this);
    });
  }

  // ---------- eventos ----------
  on(evt: string, fn: Handler) {
    if (!this.bus.has(evt)) this.bus.set(evt, []);
    this.bus.get(evt)!.push(fn);
    return () => {
      const arr = this.bus.get(evt)!;
      arr.splice(arr.indexOf(fn), 1);
    };
  }
  emit(evt: string, data?: unknown) {
    const arr = this.bus.get(evt);
    if (arr) for (const fn of [...arr]) fn(data);
  }

  // ---------- tela ----------
  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.cssScale = Math.min(h / VIEW_H, w / MIN_VIEW_W);
    this.camera.viewW = w / this.cssScale;
    this.offY = h / this.cssScale - VIEW_H;
    this.camera.clamp();
  }

  screenToWorld(cx: number, cy: number) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (cx - r.left) / this.cssScale + this.camera.x,
      y: (cy - r.top) / this.cssScale - this.offY,
    };
  }

  // ---------- entidades ----------
  get robots(): Robot[] {
    return this.entities.filter((e): e is Robot => e instanceof Robot);
  }

  add<T extends Entity>(e: T): T {
    this.entities.push(e);
    if (e.body) {
      this.physics.add(e.body);
      this.bodyMap.set(e.body.id, e);
    }
    e.lastX = e.x;
    e.lastY = e.y;
    return e;
  }

  remove(e: Entity) {
    e.dead = true;
  }

  purge() {
    if (!this.entities.some((e) => e.dead)) return;
    for (const e of this.entities) {
      if (!e.dead) continue;
      if (e.body) {
        this.physics.remove(e.body);
        this.bodyMap.delete(e.body.id);
      }
      if (e.carriedBy instanceof Robot) e.carriedBy.carrying = null;
      if (e instanceof Robot && e.carrying) {
        e.carrying.carriedBy = null;
        e.carrying = null;
      }
      if (this.selected === e) this.selected = null;
    }
    for (const e of this.entities) if (e.restingOn?.dead) e.restingOn = null;
    this.entities = this.entities.filter((e) => !e.dead);
  }

  addProp(p: Prop) {
    this.props.push(p);
    return p;
  }

  spawnPoint() {
    const cx = this.selected ? this.selected.x : this.camera.x + this.camera.viewW / 2;
    for (let i = 0; i < 30; i++) {
      const x = clamp(cx + rand(-260, 260), 40, WORLD_W - 40);
      const y = rand(GROUND_TOP + 30, GROUND_BOTTOM - 30);
      if (this.world.isWalkable(x, y, 30)) return { x, y };
    }
    return { x: clamp(cx, 40, WORLD_W - 40), y: GROUND_BOTTOM - 40 };
  }

  spawnRobot(cfg?: RobotConfig, x?: number, y?: number) {
    const p = x === undefined || y === undefined ? this.spawnPoint() : { x, y };
    const r = this.add(new Robot(p.x, p.y, cfg ?? randomConfig(this.robots.map((r) => r.name))));
    r.z = 120;
    if (r.isDog) {
      r.say(pick(['Au au!', 'Woof!', 'Cheguei! Au!']));
      this.audio.bark();
    } else r.say(pick(['Oi!', 'Olá!', 'Cheguei!', 'Bip bop!']));
    this.emit('robotAdded', r);
    return r;
  }

  spawnBox(color: BoxColor = 'madeira', x?: number, y?: number) {
    const p = x === undefined || y === undefined ? this.spawnPoint() : { x, y };
    const b = this.add(new Box(p.x, p.y, color));
    b.z = 160;
    return b;
  }

  spawnBall(x?: number, y?: number) {
    const p = x === undefined || y === undefined ? this.spawnPoint() : { x, y };
    const b = this.add(new Ball(p.x, p.y));
    b.z = 180;
    return b;
  }

  select(r: Robot | null) {
    if (r && r.remote) return;
    this.selected = r;
    if (r) {
      r.wake();
      this.audio.select();
      r.say(pick(['Oi!', 'Pronto!', 'Às ordens!', 'Bip!']), 1.4);
      this.camera.free = false;
    }
    this.emit('select', r);
  }

  cycleSelection() {
    const rs = this.robots.filter((r) => !r.remote);
    if (!rs.length) return;
    const i = this.selected ? rs.indexOf(this.selected) : -1;
    this.select(rs[(i + 1) % rs.length]);
  }

  /** Entidade mais à frente sob o ponteiro. */
  pickEntity(wx: number, wy: number): Entity | null {
    const sorted = [...this.entities].sort((a, b) => b.sortKey() - a.sortKey());
    for (const e of sorted) if (e.hitTest(wx, wy)) return e;
    return null;
  }

  canDrag(e: Entity) {
    if (!e.grabbable || e.carriedBy) return false;
    if (e instanceof Robot && e.remote) return false;
    if (this.lockManual) {
      this.hud?.toast('Nesta missão, só vale programar com blocos! 🧩');
      return false;
    }
    return true;
  }

  // ---------- arrastar ----------
  private dragTarget: { e: Entity; x: number; y: number } | null = null;

  startDrag(e: Entity) {
    if (e instanceof Robot) {
      e.stop();
      if (e.carrying) e.drop(this);
    }
    for (const o of this.entities) if (o.restingOn === e) o.restingOn = null;
    e.dragged = true;
    this.dragTarget = { e, x: e.x, y: e.y };
    this.shake = { lastVx: 0, flips: 0, t: 0 };
    this.audio.pickup();
    this.emit('dragStart', e);
  }

  dragTo(e: Entity, gx: number, gy: number) {
    if (!this.dragTarget || this.dragTarget.e !== e) return;
    // gx, gy: posição visual desejada dos "pés"
    const groundY = gy + e.z;
    const cy = clamp(groundY, GROUND_TOP + 6, GROUND_BOTTOM - 6);
    const cx = clamp(gx, 15, WORLD_W - 15);
    // detecta chacoalhão
    const vx = cx - this.dragTarget.x;
    if (Math.abs(vx) > 6) {
      if (Math.sign(vx) !== Math.sign(this.shake.lastVx) && this.shake.lastVx !== 0) this.shake.flips++;
      this.shake.lastVx = vx;
    }
    this.dragTarget.x = cx;
    this.dragTarget.y = cy;
    // acima do gramado: sobe mais
    const extra = Math.max(0, cy - groundY);
    e.z = Math.max(e.z, Math.min(260, 24 + extra * 0.9));
  }

  endDrag(e: Entity, vx: number, vy: number) {
    e.dragged = false;
    this.dragTarget = null;
    const sp = Math.hypot(vx, vy);
    const k = sp > 1400 ? 1400 / sp : 1;
    vx *= k;
    vy *= k;
    if (e.body) Matter.Body.setVelocity(e.body, { x: vx / 60, y: (vy * 0.35) / 60 });
    e.vz = Math.max(0, -vy * 0.7) + Math.min(260, Math.abs(vx) * 0.18);
    if (sp > 300) this.audio.beep(500);
    this.emit('dragEnd', e);
  }

  private driveDragged() {
    const d = this.dragTarget;
    if (!d || !d.e.body) return;
    const b = d.e.body;
    const dx = clamp((d.x - d.e.x) * 0.35, -40, 40);
    const dy = clamp((d.y - d.e.y) * 0.35, -40, 40);
    Matter.Body.setVelocity(b, { x: dx, y: dy });
    this.shake.t += FIXED_DT;
    if (this.shake.t > 1.2) {
      this.shake.t = 0;
      if (this.shake.flips >= 5) this.emit('shaken', d.e);
      this.shake.flips = 0;
    }
  }

  // ---------- comandos ----------
  tap(wx: number, wy: number, hit: Entity | null) {
    if (hit instanceof Robot && !hit.remote) {
      this.select(hit);
      return;
    }
    // elementos do cenário
    for (const p of this.props) {
      if (p.onTap && p.hit && p.hit(wx, wy)) {
        p.onTap(this, wx, wy);
        return;
      }
    }
    const r = this.selected;
    if (this.lockManual) {
      this.hud?.toast('Nesta missão, só vale programar com blocos! 🧩');
      return;
    }
    if (!r) return;
    r.wake();
    if (hit && hit.grabbable && !hit.carriedBy) {
      // ir até o objeto e pegá-lo (caixa/maçã) ou chutar (bola)
      r.goTo(hit.x - r.facing * 0, hit.y + 4, this, (ok) => {
        if (ok && hit.kind !== 'ball' && !hit.dead && dist(r.x, r.y, hit.x, hit.y) < 70) r.pickUp(hit, this);
      });
      this.emit('command', r);
      return;
    }
    if (wy >= GROUND_TOP - 20) {
      r.goTo(wx, wy, this);
      this.audio.beep(900);
      this.emit('command', r);
    }
  }

  nearestGrabbable(r: Robot, maxD = 70): Entity | null {
    let best: Entity | null = null;
    let bd = maxD;
    for (const e of this.entities) {
      if (e === r || e.kind === 'robot' || e.kind === 'ball' || e.kind === 'remote' || e.carriedBy || e.dragged || e.inWater) continue;
      // pega o topo da pilha
      if (this.entities.some((o) => o.restingOn === e)) continue;
      const d = dist(r.x, r.y, e.x, e.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Espaço / botão Pegar. */
  action(r: Robot | null = this.selected, fromBlocks = false) {
    if (!r) return false;
    if (this.lockManual && !fromBlocks) {
      this.hud?.toast('Nesta missão, só vale programar com blocos! 🧩');
      return false;
    }
    this.wake(r);
    if (r.carrying) {
      r.drop(this);
      return true;
    }
    const e = this.nearestGrabbable(r);
    if (e) return r.pickUp(e, this);
    if (!fromBlocks) {
      // sem nada ao alcance: chuta a bola se estiver colada, senão vai buscar o objeto mais perto
      const ball = this.nearestBall(r, 60);
      if (ball) return this.aimedKick(r, ball);
      const far = this.nearestGrabbable(r, 220);
      if (far) {
        r.goTo(far.x, far.y + 4, this, (ok) => {
          if (ok && !far.dead && !far.carriedBy && dist(r.x, r.y, far.x, far.y) < 70) r.pickUp(far, this);
        });
        this.emit('command', r);
        return true;
      }
    }
    r.say('Nada por perto...', 1.4);
    return false;
  }

  /** O que a ação principal faria agora (para destacar na tela e rotular o botão). */
  focusFor(r: Robot): { e: Entity; act: 'pegar' | 'chutar' } | null {
    if (r.carrying) return null;
    const e = this.nearestGrabbable(r);
    if (e) return { e, act: 'pegar' };
    const b = this.nearestBall(r, 60);
    if (b) return { e: b, act: 'chutar' };
    return null;
  }

  nearestBall(r: Robot, maxD = 60): Ball | null {
    let best: Ball | null = null;
    let bd = maxD;
    for (const e of this.entities) {
      if (!(e instanceof Ball) || e.carriedBy || e.dragged) continue;
      const d = dist(r.x, r.y, e.x, e.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** F / botão Chutar: chuta a bola na direção em que o robô olha, ou arremessa o que carrega. */
  shoot(r: Robot | null = this.selected) {
    if (!r) return false;
    if (this.lockManual) {
      this.hud?.toast('Nesta missão, só vale programar com blocos! 🧩');
      return false;
    }
    r.wake();
    if (r.carrying) {
      r.throwAhead(this);
      return true;
    }
    const ball = this.nearestBall(r, 75);
    if (ball) return this.aimedKick(r, ball);
    r.say('Cadê a bola?', 1.2);
    return false;
  }

  private aimedKick(r: Robot, ball: Ball) {
    // se estiver parado, mira na bola; andando, mantém a direção do movimento
    if (!r.moving) r.heading = Math.atan2(ball.y - r.y, ball.x - r.x);
    r.facing = Math.cos(r.heading) >= 0 ? 1 : -1;
    r.kickT = 0.3;
    this.kick(r, ball, 1.35, 0.85);
    return true;
  }

  /** Regar a planta mais próxima. */
  water(r: Robot | null = this.selected, fromBlocks = false): boolean {
    if (!r) return false;
    if (this.lockManual && !fromBlocks) return false;
    r.wake();
    if (r.carrying) {
      r.say('Mãos ocupadas!', 1.4);
      return false;
    }
    let best = null;
    let bd = 80;
    for (const p of this.scenery.plants) {
      const d = dist(r.x, r.y, p.x, p.y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) {
      r.say('Nenhuma planta perto...', 1.4);
      return false;
    }
    r.facing = best.x >= r.x ? 1 : -1;
    r.wateringT = 1.1;
    best.waterIt(this);
    this.audio.splash();
    r.say(best.grown ? 'Linda flor!' : 'Regando! 💧', 1.4);
    return true;
  }

  /** Chuta a bola mais próxima (usado pelos blocos). */
  kickNearest(r: Robot): boolean {
    const best = this.nearestBall(r, 60);
    if (!best) {
      r.say('Cadê a bola?', 1.4);
      return false;
    }
    r.heading = Math.atan2(best.y - r.y, best.x - r.x);
    r.facing = best.x >= r.x ? 1 : -1;
    r.kickT = 0.3;
    this.kick(r, best, 1.2);
    return true;
  }

  wake(r: Robot) {
    r.wake();
  }

  celebrate(r: Robot | null = this.selected) {
    r?.celebrate(this);
  }

  saveRoster() {
    saveRoster(this.robots.filter((r) => !r.remote).map((r) => r.cfg));
  }

  danceAll() {
    for (const r of this.robots) {
      if (r.remote) continue;
      r.dance = 5;
      r.stop();
      if (Math.random() < 0.6) r.say(pick(['Uhuu!', 'Dança!', '♪ ♫ ♪', 'Olha eu!']));
    }
    this.danceBeatT = 0;
    this.danceBeatI = 0;
  }

  /** Apoio para pilhas: a caixa mais alta logo abaixo. */
  supportFor(e: Entity): Entity | null {
    if (e.kind === 'robot') return null;
    let best: Entity | null = null;
    let bestTop = -1;
    for (const o of this.entities) {
      if (o === e || !o.canStackOn || o.carriedBy || o.dragged || o.inWater) continue;
      if (Math.abs(o.x - e.x) > 24 || Math.abs(o.y - e.y) > 14) continue;
      const top = o.z + o.height;
      if (top <= e.z + 8 && top > bestTop) {
        // evita ciclos
        let c: Entity | null = o;
        let loop = false;
        while (c) {
          if (c === e) {
            loop = true;
            break;
          }
          c = c.restingOn;
        }
        if (loop) continue;
        best = o;
        bestTop = top;
      }
    }
    return best;
  }

  planPath(_fx: number, _fy: number, tx: number, ty: number) {
    return this.world.planPath(_fx, _fy, tx, ty);
  }

  // ---------- colisões ----------
  private handleCollision(a: Matter.Body, b: Matter.Body) {
    const ea = this.bodyMap.get(a.id);
    const eb = this.bodyMap.get(b.id);
    if (!ea || !eb) return;
    const robot = ea instanceof Robot ? ea : eb instanceof Robot ? eb : null;
    const ball = ea instanceof Ball ? ea : eb instanceof Ball ? eb : null;
    if (robot && ball && !ball.airborne && (robot.moving || robot.dance > 0) && !robot.dragged) this.kick(robot, ball, 0.75, 0.7, true);
  }

  /** aim: 0 = direção do contato, 1 = direção em que o robô olha. */
  kick(robot: Robot, ball: Ball, power = 1, aim = 0.5, dribble = false) {
    if (!ball.body) return;
    let dx = ball.x - robot.x;
    let dy = ball.y - robot.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const hx = Math.cos(robot.heading);
    const hy = Math.sin(robot.heading);
    let nx = dx * (1 - aim) + hx * aim;
    let ny = dy * (1 - aim) + hy * aim;
    const nm = Math.hypot(nx, ny) || 1;
    nx /= nm;
    ny /= nm;
    const sp = (dribble ? 300 + rand(0, 80) : 520 + rand(0, 90)) * power;
    Matter.Body.setVelocity(ball.body, { x: (nx * sp) / 60, y: (ny * sp * 0.7) / 60 });
    ball.vz = dribble ? rand(40, 110) : rand(170, 260) * power;
    this.audio.kick();
    if (!dribble || Math.random() < 0.2) {
      if (Math.random() < 0.35) robot.say(pick(['Chutei!', 'Gol?', 'Toma!', 'Lá vai!']), 1.3);
    }
    this.emit('kick', { robot, ball });
  }

  // ---------- reiniciar ----------
  clearDynamic(keepRobots = false) {
    for (const e of this.entities) {
      if (keepRobots && (e instanceof Robot || e.kind === 'remote')) continue;
      if (e.kind === 'remote') continue;
      e.dead = true;
    }
    if (keepRobots) {
      for (const r of this.robots) if (r.carrying?.dead) r.carrying = null;
    }
    this.purge();
  }

  reset() {
    this.clearDynamic();
    this.emit('reset');
  }

  // ---------- loop ----------
  start() {
    this.lastT = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - this.lastT) / 1000);
      this.lastT = t;
      if (!this.paused) {
        this.acc += dt;
        let n = 0;
        while (this.acc >= FIXED_DT && n < 5) {
          this.update(FIXED_DT);
          this.acc -= FIXED_DT;
          n++;
        }
        if (n === 5) this.acc = 0;
      }
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  update(dt: number) {
    this.time += dt;
    this.world.update(dt);
    // controle manual
    const dir = this.input.moveDir();
    if (dir && this.selected && !this.lockManual) {
      this.selected.manualDir = dir;
      this.wake(this.selected);
    }
    // modo autônomo
    if (this.autonomous) for (const r of this.robots) if (r !== this.selected && !r.remote) this.wander(r, dt);
    // dança
    if (this.robots.some((r) => r.dance > 0)) {
      this.danceBeatT -= dt;
      if (this.danceBeatT <= 0) {
        this.danceBeatT = 0.24;
        this.audio.danceBeat(this.danceBeatI++);
      }
    }
    for (const e of this.entities) {
      e.lastX = e.x;
      e.lastY = e.y;
      if (e instanceof Robot) e.drive(dt, this);
    }
    this.driveDragged();
    for (const e of this.entities) e.updateBodyMode();
    this.physics.step(dt * 1000);
    for (const e of this.entities) e.syncFromBody();
    // pilhas acompanham a base
    for (const e of this.entities) {
      const base = e.restingOn;
      if (base && !e.dragged && !e.carriedBy) {
        const bx = base.x - base.lastX;
        const by = base.y - base.lastY;
        if (bx || by) e.setPos(e.x + bx, e.y + by);
      }
    }
    for (const e of this.entities) e.updateZ(dt, this);
    for (const e of this.entities) e.update(dt, this);
    for (const p of this.props) p.update?.(dt, this);
    this.particles.update(dt);
    this.emit('tick', dt);
    this.purge();
    this.camera.follow(this.selected ? this.selected.x : null, dt, this.selected?.moving ? this.selected.facing : 0);
  }

  private wander(r: Robot, dt: number) {
    if (r.dragged || r.dance > 0 || r.airborne || r.mood === 'dormindo') return;
    if (r.charging && r.battery < 98) return;
    r.wanderT -= dt;
    if (r.wanderT > 0 || r.target) return;
    r.wanderT = rand(2, 6);
    if (r.battery < 20) {
      const st = this.world.station;
      r.say('Vou recarregar!', 1.6);
      r.goTo(st.x + rand(-6, 6), st.y + rand(-3, 3), this);
      r.wanderT = 3;
      return;
    }
    if (r.carrying && Math.random() < 0.5) {
      r.drop(this);
      return;
    }
    if (!r.carrying && Math.random() < 0.25) {
      const e = this.nearestGrabbable(r, 260);
      if (e) {
        r.goTo(e.x, e.y + 4, this, (ok) => {
          if (ok && !e.dead && !e.carriedBy && dist(r.x, r.y, e.x, e.y) < 70) r.pickUp(e, this);
        });
        return;
      }
    }
    for (let i = 0; i < 10; i++) {
      const x = clamp(r.x + rand(-280, 280), 40, WORLD_W - 40);
      const y = rand(GROUND_TOP + 15, GROUND_BOTTOM - 15);
      if (this.world.isWalkable(x, y, 20)) {
        r.goTo(x, y, this);
        break;
      }
    }
    if (Math.random() < 0.2) r.say(pick(['Lá lá lá', 'Passeando...', 'Que dia lindo!', 'Bip bop', 'Hmm...']));
  }

  render() {
    const ctx = this.ctx;
    const s = this.cssScale * this.dpr;
    const cam = this.camera.x;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.world.drawBackground(ctx, s);
    // mundo
    ctx.setTransform(s, 0, 0, s, -cam * s, this.offY * s);
    const minX = cam - 120;
    const maxX = cam + this.camera.viewW + 120;
    this.world.drawGround(ctx);
    for (const p of this.props) if (p.drawGround && p.maxX >= minX && p.minX <= maxX) p.drawGround(ctx, this);
    // linha até o destino
    const sel = this.selected;
    if (sel && sel.target) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 7]);
      ctx.lineDashOffset = -this.time * 20;
      ctx.beginPath();
      ctx.moveTo(sel.x, sel.y);
      for (const wp of sel.path) ctx.lineTo(wp.x, wp.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const t = sel.target;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, 9, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // direção do robô (painel de blocos aberto)
    if (sel && this.showHeading) {
      const hx = Math.cos(sel.heading);
      const hy = Math.sin(sel.heading) * 0.75;
      const ax = sel.x + hx * 46;
      const ay = sel.y + hy * 46;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,214,60,0.95)';
      ctx.fillStyle = 'rgba(255,214,60,0.95)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sel.x + hx * 20, sel.y + hy * 20);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      const a = Math.atan2(hy, hx);
      ctx.beginPath();
      ctx.moveTo(ax + Math.cos(a) * 10, ay + Math.sin(a) * 10);
      ctx.lineTo(ax + Math.cos(a + 2.4) * 10, ay + Math.sin(a + 2.4) * 10);
      ctx.lineTo(ax + Math.cos(a - 2.4) * 10, ay + Math.sin(a - 2.4) * 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // ordenação por profundidade
    type D = { k: number; d: () => void };
    const list: D[] = [];
    for (const e of this.entities) {
      if (e.x < minX || e.x > maxX) continue;
      list.push({ k: e.sortKey(), d: () => e.draw(ctx, this) });
    }
    for (const p of this.props) {
      if (p.maxX < minX || p.minX > maxX) continue;
      list.push({ k: p.sortKey(), d: () => p.draw(ctx, this) });
    }
    list.sort((a, b) => a.k - b.k);
    for (const it of list) it.d();
    this.particles.draw(ctx, minX, maxX);
    this.world.drawAfterEntities(ctx, s);
    // sobreposições (nomes, balões)
    ctx.setTransform(s, 0, 0, s, -cam * s, this.offY * s);
    for (const p of this.props) if (p.drawOverlay && p.maxX >= minX && p.minX <= maxX) p.drawOverlay(ctx, this);
    for (const e of this.entities) if (e.x > minX && e.x < maxX) e.drawOverlay(ctx, this);
    if (sel && !sel.dragged && !this.lockManual) this.drawFocus(ctx, sel);
    this.emit('render', ctx);
  }

  /** Setinha pulsando sobre o objeto que Espaço vai pegar/chutar. */
  private drawFocus(ctx: CanvasRenderingContext2D, r: Robot) {
    const f = this.focusFor(r);
    if (!f) return;
    const e = f.e;
    const s = e.scale;
    const bob = Math.sin(this.time * 6) * 3;
    const x = e.x;
    const y = e.y - e.z - (e.height + 14) * s - bob;
    ctx.save();
    ctx.fillStyle = f.act === 'chutar' ? '#ffd23c' : '#ffffff';
    ctx.strokeStyle = 'rgba(20,30,40,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 10);
    ctx.lineTo(x + 8, y - 10);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (!document.body.classList.contains('is-touch')) {
      const label = f.act === 'chutar' ? 'Espaço/F: chutar' : 'Espaço: pegar';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(label).width + 12;
      ctx.fillStyle = 'rgba(20,30,40,0.7)';
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 32, w, 16, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x, y - 23.5);
    }
    ctx.restore();
  }
}
