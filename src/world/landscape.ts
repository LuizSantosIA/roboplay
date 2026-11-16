import { GROUND_BOTTOM, GROUND_TOP, HORIZON, VIEW_H, WORLD_W } from '../config';
import type { Game } from '../game';

/** Paisagem (versão base: céu e gramado). */
export class World {
  g: Game;
  constructor(g: Game) {
    this.g = g;
  }
  update(_dt: number) {}

  drawBackground(ctx: CanvasRenderingContext2D, _s: number) {
    const h = this.g.canvas.height;
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#7cc4f2');
    gr.addColorStop(1, '#d7f0ff');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, this.g.canvas.width, h);
  }

  drawGround(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#6fbf4f';
    ctx.fillRect(-50, HORIZON, WORLD_W + 100, VIEW_H - HORIZON + 50);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(-50, GROUND_TOP, WORLD_W + 100, 2);
    void GROUND_BOTTOM;
  }

  drawAfterEntities(_ctx: CanvasRenderingContext2D, _s: number) {}

  isWalkable(_x: number, y: number, m = 0) {
    return y > GROUND_TOP + m && y < GROUND_BOTTOM - m;
  }

  planPath(_fx: number, _fy: number, tx: number, ty: number) {
    return [{ x: tx, y: ty }];
  }
}
