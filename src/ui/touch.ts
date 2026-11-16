import type { Game } from '../game';

/** Joystick virtual e botões de ação para celular/tablet. */
export class TouchControls {
  constructor(g: Game) {
    const root = document.getElementById('hud')!;
    const wrap = document.createElement('div');
    wrap.className = 'touch';
    wrap.innerHTML = `
      <div class="joy" aria-label="Joystick"><div class="joy-knob"></div></div>
      <div class="touch-btns">
        <button class="tact water" aria-label="Regar">💧</button>
        <button class="tact kick" aria-label="Chutar ou arremessar">⚽</button>
        <button class="tact grab" aria-label="Pegar ou soltar">Pegar</button>
      </div>`;
    root.appendChild(wrap);
    const joy = wrap.querySelector('.joy') as HTMLElement;
    const knob = wrap.querySelector('.joy-knob') as HTMLElement;
    let id: number | null = null;
    const R = 46;
    const setKnob = (x: number, y: number) => {
      knob.style.transform = `translate(${x}px, ${y}px)`;
    };
    const handle = (e: PointerEvent) => {
      const r = joy.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const m = Math.hypot(dx, dy);
      if (m > R) {
        dx = (dx / m) * R;
        dy = (dy / m) * R;
      }
      setKnob(dx, dy);
      g.input.joy.x = dx / R;
      g.input.joy.y = dy / R;
    };
    joy.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      g.audio.unlock();
      id = e.pointerId;
      try {
        joy.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      g.input.joy.active = true;
      handle(e);
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) handle(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      g.input.joy.active = false;
      g.input.joy.x = 0;
      g.input.joy.y = 0;
      setKnob(0, 0);
    };
    joy.addEventListener('pointerup', end);
    joy.addEventListener('pointercancel', end);
    wrap.querySelector('.grab')!.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      g.audio.unlock();
      if (!g.selected) g.cycleSelection();
      g.action();
    });
    wrap.querySelector('.kick')!.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      g.audio.unlock();
      if (!g.selected) g.cycleSelection();
      g.shoot();
    });
    // rótulos conforme o contexto
    const grab = wrap.querySelector('.grab') as HTMLElement;
    const kick = wrap.querySelector('.kick') as HTMLElement;
    let lastGrab = '';
    let lastKick = '';
    setInterval(() => {
      const r = g.selected;
      const f = r ? g.focusFor(r) : null;
      const gl = r?.carrying ? 'Soltar' : f?.act === 'chutar' ? 'Chutar' : 'Pegar';
      const kl = r?.carrying ? '🤾' : '⚽';
      if (gl !== lastGrab) grab.textContent = lastGrab = gl;
      if (kl !== lastKick) kick.textContent = lastKick = kl;
      grab.classList.toggle('ready', !!f || !!r?.carrying);
    }, 150);
    wrap.querySelector('.water')!.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      g.water();
    });
    const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (isTouch) document.body.classList.add('is-touch');
    window.addEventListener('touchstart', () => document.body.classList.add('is-touch'), { once: true, passive: true });
  }
}
