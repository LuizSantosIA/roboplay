import type { Game } from '../game';
import type { Hud } from './hud';
import type { BlocksPanel } from './blocksPanel';
import { MISSIONS, MissionDef, MissionManager, MissionResult } from '../systems/missions';

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
};
const starsHtml = (n: number, max = 3) => Array.from({ length: max }, (_, i) => `<span class="star ${i < n ? 'on' : ''}">★</span>`).join('');

/** Lista de missões, barra da missão ativa e tela de resultado. */
export class MissionsUi {
  mm: MissionManager;
  bar: HTMLElement;
  constructor(public g: Game, public hud: Hud, public blocks: BlocksPanel) {
    this.mm = new MissionManager(g);
    hud.addButton('jogo', { id: 'missoes', icon: '🏆', label: 'Missões', title: 'Modo missões', onClick: () => this.openList() });
    this.bar = document.createElement('div');
    this.bar.className = 'mission-bar';
    hud.root.appendChild(this.bar);
    this.mm.onUpdate = () => this.updateBar();
    this.mm.onEnd = (r) => this.showResult(r);
    setInterval(() => this.updateBar(), 200);
  }

  openList() {
    const p = this.mm.progress;
    const total = this.mm.totalStars;
    const panel = this.hud.openPanel('missoes', `
      <h2>Missões</h2>
      <p class="mission-sub">Complete rápido para ganhar até 3 estrelas. Você tem <b>${total}</b> de ${MISSIONS.length * 3} ★</p>
      <div class="mission-list">
        ${MISSIONS.map((m) => {
          const pr = p[m.id];
          return `<button class="mission-card" data-id="${m.id}">
            <span class="mc-icon">${m.icon}</span>
            <span class="mc-body"><b>${m.title}</b><span>${m.desc}</span>
              <span class="mc-meta">⏱ ${fmt(m.time)}${m.onlyBlocks ? ' · 🧩 só blocos' : ''}${pr ? ` · recorde ${fmt(pr.best)}` : ''}</span></span>
            <span class="mc-stars">${starsHtml(pr?.stars ?? 0)}</span>
          </button>`;
        }).join('')}
      </div>
      ${this.mm.active ? '<button class="btn-ghost btn-sm" id="ms-sandbox">Voltar ao modo livre</button>' : '<p class="mission-sub">Você está no <b>modo livre</b> (sandbox).</p>'}`, 'wide');
    panel.querySelectorAll<HTMLButtonElement>('.mission-card').forEach((b) =>
      b.addEventListener('click', () => this.start(MISSIONS.find((m) => m.id === b.dataset.id)!)),
    );
    panel.querySelector('#ms-sandbox')?.addEventListener('click', () => {
      this.hud.closePanels();
      this.mm.quit();
    });
  }

  start(def: MissionDef) {
    this.mm.start(def);
    this.hud.toast(def.hint, 6);
    if (def.onlyBlocks) {
      this.blocks.program = [];
      this.blocks.active = 'root';
      this.blocks.render();
      this.blocks.toggle(true);
    }
  }

  updateBar() {
    const m = this.mm.active;
    this.bar.classList.toggle('show', !!m);
    if (!m) return;
    const left = Math.max(0, m.time - this.mm.elapsed);
    const urgent = left < 10;
    this.bar.innerHTML = `<span class="mb-icon">${m.icon}</span>
      <span class="mb-title">${m.title}</span>
      <span class="mb-prog">${this.mm.count}/${m.target}</span>
      <span class="mb-time ${urgent ? 'urgent' : ''}">⏱ ${fmt(left)}</span>
      <button class="mb-quit" title="Desistir">✕</button>`;
    this.bar.querySelector('.mb-quit')!.addEventListener('click', () => this.mm.quit());
  }

  showResult(r: MissionResult) {
    const idx = MISSIONS.indexOf(r.def);
    const next = MISSIONS[idx + 1];
    const p = this.hud.openPanel('resultado', `
      <div class="result">
        <div class="result-icon">${r.ok ? '🏆' : '⏰'}</div>
        <h2>${r.ok ? 'Missão cumprida!' : 'Tempo esgotado!'}</h2>
        <p>${r.def.title}${r.ok ? ` em ${fmt(r.time)}` : ''}</p>
        <div class="result-stars">${starsHtml(r.stars)}</div>
        ${r.record ? '<p class="result-rec">Novo recorde! 🎉</p>' : ''}
        <div class="result-actions">
          <button class="btn-ghost" id="rs-retry">↻ Tentar de novo</button>
          ${r.ok && next ? '<button class="btn-primary" id="rs-next">Próxima ➜</button>' : ''}
        </div>
        <button class="link-btn" id="rs-list">Ver todas as missões</button>
        <button class="link-btn" id="rs-free">Voltar ao modo livre</button>
      </div>`, 'small');
    p.querySelector('#rs-retry')!.addEventListener('click', () => this.start(r.def));
    p.querySelector('#rs-next')?.addEventListener('click', () => this.start(next));
    p.querySelector('#rs-list')!.addEventListener('click', () => this.openList());
    p.querySelector('#rs-free')!.addEventListener('click', () => {
      this.hud.closePanels();
      this.mm.quit();
    });
    // fechar o resultado sem escolher → volta ao modo livre
    const off = this.g.on('panelsClosed', () => {
      off();
      if (this.mm.active && this.mm.active === r.def && !p.isConnected) this.mm.quit();
    });
  }
}
