import type { Game } from '../game';

export interface ButtonDef {
  id: string;
  icon: string;
  label: string;
  title?: string;
  toggle?: boolean;
  onClick: (btn: HTMLButtonElement) => void;
}

const HELP_HTML = `
<h2>Como brincar</h2>
<div class="help-grid">
  <div><b>Clique</b> num robô</div><div>Seleciona (anel tracejado)</div>
  <div><b>Clique</b> no gramado</div><div>O robô selecionado anda até lá</div>
  <div><b>Setas / WASD</b></div><div>Move o robô selecionado</div>
  <div><b>Espaço</b></div><div>Pega ou solta a caixa (ou maçã) mais próxima</div>
  <div><b>R</b></div><div>Rega a planta mais próxima</div>
  <div><b>Tab</b></div><div>Troca de robô</div>
  <div><b>Arrastar</b></div><div>Leva robôs, caixas e bolas. Solte em movimento para arremessar!</div>
  <div><b>Arrastar o fundo</b></div><div>Move a câmera pelo mundo</div>
  <div><b>Chacoalhar</b></div><div>Deixa o robô tonto 😵</div>
  <div><b>Celular</b></div><div>Joystick à esquerda e botão Pegar à direita</div>
</div>
<p class="help-tip">Dica: clique numa macieira para derrubar uma maçã, empilhe caixas soltando uma sobre a outra e leve o robô até a estação de recarga quando a bateria acabar.</p>
`;

/** Barra de ferramentas, painéis e avisos. */
export class Hud {
  g: Game;
  root: HTMLElement;
  bar: HTMLElement;
  groups = new Map<string, HTMLElement>();
  buttons = new Map<string, HTMLButtonElement>();
  status: HTMLElement;
  toastEl: HTMLElement;
  private toastT = 0;
  panels: HTMLElement[] = [];

  constructor(g: Game) {
    this.g = g;
    g.hud = this;
    this.root = document.getElementById('hud')!;
    this.bar = document.createElement('div');
    this.bar.className = 'toolbar';
    this.root.appendChild(this.bar);
    this.status = document.createElement('div');
    this.status.className = 'status';
    this.root.appendChild(this.status);
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.root.appendChild(this.toastEl);

    this.addButton('criar', { id: 'robo', icon: '🤖', label: 'Robô', title: 'Adicionar robô', onClick: () => {
      g.select(g.spawnRobot());
      g.saveRoster();
    } });
    this.addButton('criar', { id: 'caixa', icon: '📦', label: 'Caixa', title: 'Adicionar caixa', onClick: () => g.spawnBox() });
    this.addButton('criar', { id: 'bola', icon: '⚽', label: 'Bola', title: 'Adicionar bola', onClick: () => g.spawnBall() });
    this.addButton('acoes', {
      id: 'auto', icon: '🚶', label: 'Autônomo', title: 'Robôs não selecionados passeiam sozinhos', toggle: true,
      onClick: (b) => {
        g.autonomous = !g.autonomous;
        b.classList.toggle('on', g.autonomous);
        this.toast(g.autonomous ? 'Modo autônomo ligado' : 'Modo autônomo desligado');
      },
    });
    this.addButton('acoes', { id: 'dancar', icon: '💃', label: 'Dançar', title: 'Todos dançam', onClick: () => g.danceAll() });
    this.addButton('acoes', { id: 'reiniciar', icon: '🔄', label: 'Reiniciar', title: 'Reiniciar o cenário', onClick: () => g.reset() });
    this.addButton('sistema', { id: 'ajuda', icon: '❓', label: 'Ajuda', title: 'Controles', onClick: () => this.openHelp() });
    this.addButton('sistema', {
      id: 'som', icon: g.audio.muted ? '🔇' : '🔊', label: 'Som', title: 'Ligar/desligar som',
      onClick: (b) => {
        g.audio.unlock();
        g.audio.setMuted(!g.audio.muted);
        b.querySelector('.ic')!.textContent = g.audio.muted ? '🔇' : '🔊';
      },
    });

    g.on('select', () => this.updateStatus());
    setInterval(() => this.updateStatus(), 250);
    this.updateStatus();
  }

  group(name: string) {
    let el = this.groups.get(name);
    if (!el) {
      el = document.createElement('div');
      el.className = 'tgroup';
      el.dataset.group = name;
      const order = ['criar', 'acoes', 'mundo', 'robo', 'jogo', 'sistema'];
      const idx = order.indexOf(name);
      const after = [...this.groups.entries()]
        .filter(([n]) => order.indexOf(n) > idx)
        .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))[0];
      if (after) this.bar.insertBefore(el, after[1]);
      else this.bar.appendChild(el);
      this.groups.set(name, el);
    }
    return el;
  }

  addButton(group: string, def: ButtonDef) {
    const b = document.createElement('button');
    b.className = 'tbtn';
    b.title = def.title ?? def.label;
    b.setAttribute('aria-label', def.title ?? def.label);
    b.innerHTML = `<span class="ic">${def.icon}</span><span class="lb">${def.label}</span>`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.g.audio.unlock();
      def.onClick(b);
      b.blur();
    });
    this.group(group).appendChild(b);
    this.buttons.set(def.id, b);
    return b;
  }

  toast(text: string, dur = 2.2) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => this.toastEl.classList.remove('show'), dur * 1000);
  }

  /** Conteúdo extra do status (bateria etc.). */
  statusExtra: (() => string)[] = [
    () => {
      const r = this.g.selected!;
      const b = Math.round(r.battery);
      const col = b < 20 ? '#e0483e' : b < 50 ? '#e0a020' : '#2fb46b';
      return `<span class="battery" style="color:${col}" title="Bateria"><i><b style="width:${Math.max(2, b * 0.28)}px;background:${col}"></b></i>${b}%${r.charging ? ' ⚡' : ''}</span>`;
    },
    () => {
      const m = this.g.selected!.mood;
      const t = m === 'tonto' ? '😵 tonto' : m === 'dormindo' ? '😴 dormindo' : m === 'feliz' ? '🥳 feliz' : '';
      return t ? `<span class="mood-tag">${t}</span>` : '';
    },
  ];

  updateStatus() {
    const r = this.g.selected;
    if (!r) {
      this.status.innerHTML = `<span class="hint">Clique num robô para selecionar</span>`;
      return;
    }
    const extra = this.statusExtra.map((f) => f()).join('');
    this.status.innerHTML = `<span class="dot" style="background:${r.cfg.color}"></span><b>${escapeHtml(r.name)}</b>${extra}`;
  }

  /** Abre um painel modal. */
  openPanel(id: string, html: string, cls = '') {
    this.closePanels();
    const wrap = document.createElement('div');
    wrap.className = 'panel-wrap';
    wrap.innerHTML = `<div class="panel ${cls}" role="dialog" aria-modal="true" id="panel-${id}"><button class="panel-close" aria-label="Fechar">✕</button>${html}</div>`;
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target === wrap) this.closePanels();
    });
    wrap.querySelector('.panel-close')!.addEventListener('click', () => this.closePanels());
    this.root.appendChild(wrap);
    this.panels.push(wrap);
    return wrap.querySelector('.panel') as HTMLElement;
  }

  closePanels() {
    for (const p of this.panels) p.remove();
    this.panels = [];
    this.g.emit('panelsClosed');
  }

  openHelp() {
    this.openPanel('ajuda', HELP_HTML, 'help');
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
