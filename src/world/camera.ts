import { WORLD_W } from '../config';
import { clamp } from '../util';

/** Câmera horizontal: segue o robô selecionado ou fica livre (arrastando o fundo). */
export class Camera {
  x = 0;
  viewW = 1280;
  free = false;
  rightInset = 0; // área coberta por painel lateral (unidades lógicas)
  private freeT = 0;
  private lead = 0;

  /** dir: -1/0/1, direção em que o alvo anda (a câmera mostra mais à frente). */
  follow(targetX: number | null, dt: number, dir = 0) {
    this.lead += (dir * this.viewW * 0.14 - this.lead) * Math.min(1, dt * 1.2);
    if (this.free) {
      this.freeT -= dt;
      if (this.freeT <= 0 && targetX !== null) this.free = false;
    }
    if (!this.free && targetX !== null) {
      const want = targetX + this.lead - (this.viewW - this.rightInset) / 2;
      this.x += (want - this.x) * Math.min(1, dt * 3.2);
    }
    this.clamp();
  }

  pan(dx: number) {
    this.x -= dx;
    this.free = true;
    this.freeT = 4;
    this.clamp();
  }

  centerOn(x: number) {
    this.x = x - this.viewW / 2;
    this.free = false;
    this.clamp();
  }

  clamp() {
    this.x = clamp(this.x, 0, Math.max(0, WORLD_W - this.viewW));
  }
}
