import type { Game } from '../game';
import type { Entity } from '../entities/entity';

interface PointerState {
  id: number;
  sx: number;
  sy: number;
  lastSx: number;
  hit: Entity | null;
  mode: 'pending' | 'drag' | 'pan';
  ox: number;
  oy: number;
  history: { x: number; y: number; t: number }[];
}

/** Mouse, toque e teclado. */
export class Input {
  keys = new Set<string>();
  joy = { x: 0, y: 0, active: false };
  private p: PointerState | null = null;
  private g: Game;

  constructor(g: Game) {
    this.g = g;
    const c = g.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e, true));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private typing(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  private keyDown(e: KeyboardEvent) {
    if (this.typing(e)) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (e.repeat && k === ' ') return;
    this.keys.add(k);
    this.g.audio.unlock();
    if (k === ' ') this.g.action();
    else if (k === 'r') this.g.water();
    else if (k === 'tab') {
      e.preventDefault();
      this.g.cycleSelection();
    } else if (k === 'escape') this.g.hud?.closePanels();
  }

  /** Direção das setas/WASD ou do joystick virtual. */
  moveDir(): { x: number; y: number } | null {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('arrowleft') || k.has('a')) x -= 1;
    if (k.has('arrowright') || k.has('d')) x += 1;
    if (k.has('arrowup') || k.has('w')) y -= 1;
    if (k.has('arrowdown') || k.has('s')) y += 1;
    if (this.joy.active) {
      x += this.joy.x;
      y += this.joy.y;
    }
    const m = Math.hypot(x, y);
    if (m < 0.15) return null;
    if (m > 1) {
      x /= m;
      y /= m;
    }
    return { x, y };
  }

  private down(e: PointerEvent) {
    if (this.p) return;
    this.g.audio.unlock();
    const w = this.g.screenToWorld(e.clientX, e.clientY);
    this.g.pointerWorld = w;
    const hit = this.g.pickEntity(w.x, w.y);
    this.p = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      lastSx: e.clientX,
      hit,
      mode: 'pending',
      ox: hit ? hit.x - w.x : 0,
      oy: hit ? hit.y - hit.z - w.y : 0,
      history: [{ x: w.x, y: w.y, t: performance.now() }],
    };
    try {
      this.g.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  private move(e: PointerEvent) {
    const w = this.g.screenToWorld(e.clientX, e.clientY);
    if (e.pointerType === 'mouse' || this.p) this.g.pointerWorld = w;
    const p = this.p;
    if (!p || p.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
    if (p.mode === 'pending' && moved > 8) {
      if (p.hit && this.g.canDrag(p.hit)) {
        p.mode = 'drag';
        this.g.startDrag(p.hit);
      } else p.mode = 'pan';
    }
    if (p.mode === 'drag' && p.hit) {
      const now = performance.now();
      p.history.push({ x: w.x, y: w.y, t: now });
      while (p.history.length > 2 && now - p.history[0].t > 120) p.history.shift();
      this.g.dragTo(p.hit, w.x + p.ox, w.y + p.oy);
    } else if (p.mode === 'pan') {
      this.g.camera.pan((e.clientX - p.lastSx) / this.g.cssScale);
    }
    p.lastSx = e.clientX;
  }

  private up(e: PointerEvent, cancel = false) {
    const p = this.p;
    if (!p || p.id !== e.pointerId) return;
    this.p = null;
    const w = this.g.screenToWorld(e.clientX, e.clientY);
    if (p.mode === 'pending' && !cancel) this.g.tap(w.x, w.y, p.hit);
    else if (p.mode === 'drag' && p.hit) {
      const h = p.history;
      let vx = 0;
      let vy = 0;
      if (h.length >= 2) {
        const a = h[0];
        const b = h[h.length - 1];
        const dt = Math.max(0.016, (b.t - a.t) / 1000);
        if (performance.now() - b.t < 80) {
          vx = (b.x - a.x) / dt;
          vy = (b.y - a.y) / dt;
        }
      }
      this.g.endDrag(p.hit, vx, vy);
    }
  }
}
