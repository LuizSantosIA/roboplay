import type { Game } from '../game';

/**
 * "Sensação" do jogo (skill game-feel): tremida de tela por trauma, clarão rápido
 * e explosões de partículas, disparados pelos eventos que o jogo já emite.
 * Só visual: não mexe na física nem na lógica.
 */
type Tier = 'pequeno' | 'medio' | 'grande';

const TIERS: Record<Tier, { trauma: number; burst: number; flash: number }> = {
  pequeno: { trauma: 0.15, burst: 6, flash: 0 },
  medio: { trauma: 0.4, burst: 14, flash: 0 },
  grande: { trauma: 0.85, burst: 30, flash: 0.35 },
};

const MAX_OFFSET = 10; // px
const MAX_ROLL = 0.012; // rad
const DECAY = 1.4; // trauma por segundo

export function setupJuice(g: Game) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = g.canvas;
  const flashEl = document.createElement('div');
  flashEl.className = 'juice-flash';
  document.body.appendChild(flashEl);

  let trauma = 0;
  let t = 0;
  let last = performance.now();
  let lastFlash = 0;

  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (trauma > 0) {
      trauma = Math.max(0, trauma - DECAY * dt);
      t += dt * 30;
      const k = trauma * trauma; // leve quase não mexe, forte dá o soco
      const x = MAX_OFFSET * k * (0.6 * Math.sin(t * 1.7) + 0.4 * Math.sin(t * 3.9));
      const y = MAX_OFFSET * 0.7 * k * (0.6 * Math.sin(t * 2.3) + 0.4 * Math.sin(t * 4.7));
      const r = MAX_ROLL * k * Math.sin(t * 1.1);
      // escala leve para não revelar a borda da tela durante a tremida
      canvas.style.transform = trauma > 0 ? `translate(${x}px, ${y}px) rotate(${r}rad) scale(1.03)` : '';
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  function feedback(tier: Tier, x: number, y: number, z = 20, color = '#fff6a8') {
    const c = TIERS[tier];
    if (!reduced.matches) trauma = Math.min(1, trauma + c.trauma);
    burst(x, y, z, c.burst, color);
    // clarão só em momentos grandes, no máximo 1 por segundo (bem abaixo do limite de 3/s)
    const now = performance.now();
    if (c.flash && !reduced.matches && now - lastFlash > 1000) {
      lastFlash = now;
      flashEl.style.opacity = String(c.flash);
      requestAnimationFrame(() => requestAnimationFrame(() => (flashEl.style.opacity = '0')));
    }
  }

  /** Anel de faíscas que se espalha rápido e desacelera (ease-out pelo atrito). */
  function burst(x: number, y: number, z: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const sp = 120 + Math.random() * 140;
      g.particles.spawn({
        type: 'brilho', x, y, z,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.3, vz: 60 + Math.random() * 160,
        life: 0.45 + Math.random() * 0.25, color, size: 2.5 + Math.random() * 2, gravity: 420,
      });
    }
  }

  g.on('goal', () => {
    const gl = g.scenery.goal;
    feedback('grande', gl.x, gl.y, 60, '#ffd23f');
  });
  g.on('basket', (d: { entity: { x: number; y: number; z: number } }) => feedback('medio', d.entity.x, d.entity.y, d.entity.z + 10, '#ff9a4a'));
  g.on('target', (tg: { x: number; y: number }) => feedback('medio', tg.x, tg.y, 40, '#ffd23f'));
  g.on('robotSplash', (e: { x: number; y: number }) => feedback('medio', e.x, e.y, 4, 'rgba(190,225,255,0.95)'));
  g.on('kick', (d: { ball: { x: number; y: number; z: number } }) => feedback('pequeno', d.ball.x, d.ball.y, d.ball.z + 6, '#ffffff'));
  g.on('sorted', () => {
    if (!reduced.matches) trauma = Math.min(1, trauma + TIERS.pequeno.trauma);
  });
  g.on('plantGrown', (p: { x: number; y: number }) => feedback('pequeno', p.x, p.y, 30, '#ffb3d1'));
}
