import Matter from 'matter-js';
import { CAT, GRAVITY_Z, depthScale } from '../config';
import { newId } from '../util';
import type { Game } from '../game';

export type EntityKind = 'robot' | 'box' | 'ball' | 'apple' | 'remote';

/** Base de tudo que existe no gramado: posição no chão (x, y) + altura (z). */
export abstract class Entity {
  id = newId();
  abstract kind: EntityKind;
  x = 0;
  y = 0;
  z = 0;
  vz = 0;
  lastX = 0;
  lastY = 0;
  body: Matter.Body | null = null;
  radius = 14;
  height = 30; // altura visual (usada para empilhar)
  grabbable = true;
  dead = false;
  dragged = false;
  carriedBy: Entity | null = null;
  restingOn: Entity | null = null;
  canStackOn = false; // outros objetos podem ficar em cima
  bounce = 0.3;
  groundFriction = 0.15;
  airFriction = 0.004;
  groundMask = 0xffff;
  inWater = false;
  slippery = 0; // 0..1 (poças/neve)
  private wasAirborne = false;

  get airborne() {
    return this.z > 6;
  }
  get scale() {
    return depthScale(this.y);
  }

  setPos(x: number, y: number) {
    this.x = x;
    this.y = y;
    if (this.body) Matter.Body.setPosition(this.body, { x, y });
  }

  syncFromBody() {
    if (this.body) {
      this.x = this.body.position.x;
      this.y = this.body.position.y;
    }
  }

  /** Atualiza colisões e atrito conforme está no ar ou no chão. */
  updateBodyMode() {
    if (!this.body) return;
    const air = this.airborne || this.carriedBy !== null;
    if (air !== this.wasAirborne) {
      this.body.collisionFilter.mask = air ? (this.carriedBy ? 0 : CAT.WALL) : this.groundMask;
      this.wasAirborne = air;
    }
    const f = air ? this.airFriction : this.groundFriction * (1 - this.slippery * 0.85);
    this.body.frictionAir = f;
  }

  /** Simulação do eixo vertical: queda, quique e pilhas. */
  updateZ(dt: number, g: Game) {
    if (this.carriedBy) return;
    if (this.dragged) {
      this.z += (24 - this.z) * Math.min(1, dt * 12);
      this.vz = 0;
      this.restingOn = null;
      return;
    }
    const sup = g.supportFor(this);
    const support = sup ? sup.z + sup.height : 0;
    if (this.z > support + 0.5 || this.vz > 0) {
      this.vz -= GRAVITY_Z * dt;
      this.z += this.vz * dt;
      this.restingOn = null;
      if (this.z <= support) {
        this.z = support;
        const impact = -this.vz;
        if (impact > 240 && this.bounce > 0) this.vz = impact * this.bounce;
        else this.vz = 0;
        if (sup) this.restingOn = sup;
        this.onLand(impact, g);
      }
    } else {
      this.z = support;
      this.vz = 0;
      this.restingOn = sup;
    }
  }

  onLand(_impact: number, _g: Game) {}

  /** Teste de clique em coordenadas do mundo. */
  hitTest(wx: number, wy: number): boolean {
    const s = this.scale;
    const w = (this.radius + 6) * s;
    const top = this.y - this.z - (this.height + 6) * s;
    const bottom = this.y - this.z + 6 * s;
    return wx >= this.x - w && wx <= this.x + w && wy >= top && wy <= bottom;
  }

  drawShadow(ctx: CanvasRenderingContext2D, rx: number, ry: number, groundZ = 0) {
    const h = Math.max(0, this.z - groundZ);
    const k = Math.max(0.35, 1 - h / 260);
    const s = this.scale;
    ctx.fillStyle = `rgba(20,30,10,${0.25 * k})`;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y - groundZ, rx * s * k, ry * s * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  update(_dt: number, _g: Game) {}
  abstract draw(ctx: CanvasRenderingContext2D, g: Game): void;
  drawOverlay(_ctx: CanvasRenderingContext2D, _g: Game) {}
  /** Chave de ordenação por profundidade. */
  sortKey() {
    return this.y + (this.carriedBy ? 0.5 : 0) + this.z * 0.0005;
  }
}
