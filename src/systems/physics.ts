import Matter from 'matter-js';
import { CAT, GROUND_BOTTOM, GROUND_TOP, WORLD_W } from '../config';

const { Engine, Bodies, Composite, Body, Events } = Matter;

export type CollisionHandler = (a: Matter.Body, b: Matter.Body, pair: Matter.Pair) => void;

/**
 * Física no plano do chão (visto de cima, gravidade zero) usando Matter.js.
 * A altura (eixo z: pulos, arremessos, pilhas) é simulada à parte em cada entidade.
 */
export class Physics {
  engine: Matter.Engine;
  private handlers: CollisionHandler[] = [];

  constructor() {
    this.engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } });
    this.engine.positionIterations = 8;
    this.engine.velocityIterations = 6;
    this.addBounds();
    Events.on(this.engine, 'collisionStart', (ev) => {
      for (const p of ev.pairs) for (const h of this.handlers) h(p.bodyA, p.bodyB, p);
    });
  }

  onCollision(h: CollisionHandler) {
    this.handlers.push(h);
  }

  private addBounds() {
    const t = 200;
    const opts = (): Matter.IChamferableBodyDefinition => ({
      isStatic: true,
      label: 'wall',
      collisionFilter: { category: CAT.WALL, mask: 0xffff },
      restitution: 0.4,
    });
    const midY = (GROUND_TOP + GROUND_BOTTOM) / 2;
    const h = GROUND_BOTTOM - GROUND_TOP;
    Composite.add(this.engine.world, [
      Bodies.rectangle(WORLD_W / 2, GROUND_TOP - t / 2, WORLD_W + 2 * t, t, opts()),
      Bodies.rectangle(WORLD_W / 2, GROUND_BOTTOM + t / 2, WORLD_W + 2 * t, t, opts()),
      Bodies.rectangle(-t / 2, midY, t, h + 2 * t, opts()),
      Bodies.rectangle(WORLD_W + t / 2, midY, t, h + 2 * t, opts()),
    ]);
  }

  add(body: Matter.Body) {
    Composite.add(this.engine.world, body);
  }
  remove(body: Matter.Body) {
    Composite.remove(this.engine.world, body);
  }

  step(dtMs: number) {
    Engine.update(this.engine, dtMs);
  }

  static setVel(body: Matter.Body, vxPerSec: number, vyPerSec: number) {
    Body.setVelocity(body, { x: vxPerSec / 60, y: vyPerSec / 60 });
  }
  static velPerSec(body: Matter.Body) {
    return { x: body.velocity.x * 60, y: body.velocity.y * 60 };
  }
}

export { Matter };
