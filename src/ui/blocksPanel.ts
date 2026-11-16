import type { Game } from '../game';
import type { Hud } from './hud';
import { escapeHtml } from './hud';
import {
  ALVO_LABEL, Alvo, Block, BlockType, COND_LABEL, Cond, Runner, bid, containsId, countBlocks, findBlock, makeBlock,
} from '../systems/blocks';

interface PaletteItem {
  type: BlockType;
  label: string;
  cat: 'mov' | 'acao' | 'ctrl' | 'fala';
}

const PALETTE: PaletteItem[] = [
  { type: 'andar', label: 'andar N passos', cat: 'mov' },
  { type: 'virar', label: 'virar', cat: 'mov' },
  { type: 'ir', label: 'ir até...', cat: 'mov' },
  { type: 'pegar', label: 'pegar', cat: 'acao' },
  { type: 'soltar', label: 'soltar', cat: 'acao' },
  { type: 'chutar', label: 'chutar', cat: 'acao' },
  { type: 'regar', label: 'regar', cat: 'acao' },
  { type: 'dancar', label: 'dançar', cat: 'acao' },
  { type: 'repetir', label: 'repetir N vezes', cat: 'ctrl' },
  { type: 'se', label: 'se / senão', cat: 'ctrl' },
  { type: 'esperar', label: 'esperar N s', cat: 'ctrl' },
  { type: 'dizer', label: 'dizer', cat: 'fala' },
];
const CAT_OF: Record<BlockType, PaletteItem['cat']> = Object.fromEntries(PALETTE.map((p) => [p.type, p.cat])) as Record<BlockType, PaletteItem['cat']>;
const ICON: Record<BlockType, string> = {
  andar: '👣', virar: '↪️', ir: '🎯', pegar: '✋', soltar: '👐', chutar: '🦶', regar: '💧', dancar: '💃',
  repetir: '🔁', se: '❓', esperar: '⏱️', dizer: '💬',
};
const KEY = 'roboplay.programa';

const EXAMPLE = (): Block[] => [
  { id: bid(), type: 'dizer', text: 'Vou buscar uma caixa!' },
  { id: bid(), type: 'ir', alvo: 'caixa' },
  { id: bid(), type: 'pegar' },
  { id: bid(), type: 'repetir', n: 2, body: [{ id: bid(), type: 'virar', dir: 'direita' }] },
  { id: bid(), type: 'andar', n: 3 },
  { id: bid(), type: 'soltar' },
  { id: bid(), type: 'se', cond: 'bateriaBaixa', body: [{ id: bid(), type: 'ir', alvo: 'recarga' }], else: [{ id: bid(), type: 'dancar' }] },
];

/** Painel lateral de programação por blocos. */
export class BlocksPanel {
  g: Game;
  hud: Hud;
  runner: Runner;
  program: Block[];
  el: HTMLElement;
  progEl: HTMLElement;
  open = false;
  active = 'root';
  private dragData: string | null = null;

  constructor(g: Game, hud: Hud) {
    this.g = g;
    this.hud = hud;
    this.runner = new Runner(g);
    this.program = this.load();
    hud.addButton('robo', { id: 'programar', icon: '🧩', label: 'Programar', title: 'Programação por blocos', onClick: () => this.toggle() });
    this.el = document.createElement('aside');
    this.el.className = 'blocks';
    this.el.setAttribute('aria-label', 'Programação por blocos');
    this.el.innerHTML = `
      <div class="blocks-head">
        <div><h2>Programar</h2><div class="blocks-robot" id="bk-robot"></div></div>
        <button class="panel-close" id="bk-close" aria-label="Fechar">✕</button>
      </div>
      <div class="blocks-palette" id="bk-palette">
        ${PALETTE.map((p) => `<button class="pal cat-${p.cat}" draggable="true" data-type="${p.type}" title="Toque para adicionar ou arraste">${ICON[p.type]} ${p.label}</button>`).join('')}
      </div>
      <div class="blocks-prog" id="bk-prog"></div>
      <div class="blocks-ctrl">
        <button class="bctl play" id="bk-play" title="Executar / pausar">▶ Executar</button>
        <button class="bctl" id="bk-step" title="Passo a passo">⏭ Passo</button>
        <button class="bctl" id="bk-stop" title="Parar">⏹</button>
        <span style="flex:1"></span>
        <button class="bctl ghost" id="bk-example" title="Carregar exemplo">✨ Exemplo</button>
        <button class="bctl ghost" id="bk-clear" title="Limpar tudo">🗑️</button>
      </div>`;
    hud.root.appendChild(this.el);
    this.progEl = this.el.querySelector('#bk-prog')!;
    this.bind();
    this.render();
    this.runner.onChange = () => this.refreshRun();
    g.on('select', () => this.refreshHead());
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.el.classList.toggle('open', this.open);
    document.body.classList.toggle('blocks-open', this.open);
    this.hud.buttons.get('programar')?.classList.toggle('on', this.open);
    this.g.showHeading = this.open;
    const desktop = window.innerWidth > 760;
    this.g.camera.rightInset = this.open && desktop ? Math.min(380, window.innerWidth) / this.g.cssScale : 0;
    this.refreshHead();
  }

  private load(): Block[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) return p;
      }
    } catch {
      /* ignore */
    }
    return EXAMPLE();
  }
  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.program));
    } catch {
      /* ignore */
    }
  }

  private listOf(key: string): Block[] {
    if (key === 'root') return this.program;
    const [id, part] = key.split(':');
    const f = findBlock(this.program, id);
    if (!f) return this.program;
    const b = f.list[f.index];
    if (b.type === 'repetir') return b.body;
    if (b.type === 'se') return part === 'else' ? b.else : b.body;
    return this.program;
  }

  private insert(block: Block, key: string, beforeId?: string) {
    const list = this.listOf(key);
    let i = beforeId ? list.findIndex((b) => b.id === beforeId) : -1;
    if (i < 0) i = list.length;
    list.splice(i, 0, block);
    this.save();
    this.render();
  }

  private bind() {
    const pal = this.el.querySelector('#bk-palette')!;
    pal.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('.pal') as HTMLElement | null;
      if (!b) return;
      this.g.audio.beep(900);
      this.insert(makeBlock(b.dataset.type as BlockType), this.active);
      this.progEl.scrollTop = this.progEl.scrollHeight;
    });
    pal.addEventListener('dragstart', (e) => {
      const b = (e.target as HTMLElement).closest('.pal') as HTMLElement | null;
      if (!b) return;
      this.dragData = 'new:' + b.dataset.type;
      (e as DragEvent).dataTransfer?.setData('text/plain', this.dragData);
    });
    const prog = this.progEl;
    prog.addEventListener('dragstart', (e) => {
      const blk = (e.target as HTMLElement).closest('.blk') as HTMLElement | null;
      if (!blk) return;
      this.dragData = 'move:' + blk.dataset.id;
      (e as DragEvent).dataTransfer?.setData('text/plain', this.dragData);
      e.stopPropagation();
      requestAnimationFrame(() => blk.classList.add('dragging'));
    });
    prog.addEventListener('dragend', () => {
      prog.querySelectorAll('.dragging,.drop-hover').forEach((n) => n.classList.remove('dragging', 'drop-hover'));
    });
    prog.addEventListener('dragover', (e) => {
      const t = (e.target as HTMLElement).closest('.blk-drop, .blk') as HTMLElement | null;
      if (!t) return;
      e.preventDefault();
      prog.querySelectorAll('.drop-hover').forEach((n) => n.classList.remove('drop-hover'));
      t.classList.add('drop-hover');
    });
    prog.addEventListener('drop', (e) => {
      e.preventDefault();
      const data = (e as DragEvent).dataTransfer?.getData('text/plain') || this.dragData;
      this.dragData = null;
      if (!data) return;
      const t = (e.target as HTMLElement).closest('.blk-drop, .blk') as HTMLElement | null;
      let key = 'root';
      let before: string | undefined;
      if (t?.classList.contains('blk-drop')) key = t.dataset.list!;
      else if (t?.classList.contains('blk')) {
        key = t.dataset.parent!;
        before = t.dataset.id;
      }
      let block: Block;
      if (data.startsWith('new:')) block = makeBlock(data.slice(4) as BlockType);
      else {
        const id = data.slice(5);
        const f = findBlock(this.program, id);
        if (!f) return;
        block = f.list[f.index];
        if (before === id) return this.render();
        // não pode soltar dentro de si mesmo
        const targetOwner = key === 'root' ? null : key.split(':')[0];
        if (targetOwner && containsId(block, targetOwner)) return this.render();
        f.list.splice(f.index, 1);
      }
      this.g.audio.beep(800);
      this.insert(block, key, before);
    });
    prog.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const tool = el.closest('[data-act]') as HTMLElement | null;
      if (tool) {
        const id = tool.closest('.blk')!.getAttribute('data-id')!;
        const f = findBlock(this.program, id);
        if (!f) return;
        const act = tool.dataset.act;
        if (act === 'del') f.list.splice(f.index, 1);
        else if (act === 'up' && f.index > 0) [f.list[f.index - 1], f.list[f.index]] = [f.list[f.index], f.list[f.index - 1]];
        else if (act === 'down' && f.index < f.list.length - 1) [f.list[f.index + 1], f.list[f.index]] = [f.list[f.index], f.list[f.index + 1]];
        this.save();
        this.render();
        return;
      }
      const drop = el.closest('.blk-drop') as HTMLElement | null;
      if (drop) {
        this.active = drop.dataset.list!;
        this.render();
      }
    });
    prog.addEventListener('input', (e) => {
      const inp = e.target as HTMLInputElement | HTMLSelectElement;
      const blk = inp.closest('.blk') as HTMLElement | null;
      if (!blk) return;
      const f = findBlock(this.program, blk.dataset.id!);
      if (!f) return;
      const b = f.list[f.index] as unknown as Record<string, unknown>;
      const k = inp.dataset.k!;
      b[k] = inp.type === 'number' ? Number(inp.value) || 0 : inp.value;
      this.save();
    });
    this.el.querySelector('#bk-close')!.addEventListener('click', () => this.toggle(false));
    this.el.querySelector('#bk-play')!.addEventListener('click', () => {
      const r = this.runner;
      if (r.state === 'rodando') r.pause();
      else if (r.state === 'pausado') r.resume();
      else this.run();
    });
    this.el.querySelector('#bk-step')!.addEventListener('click', () => {
      const robot = this.g.selected;
      if (!robot && this.runner.state === 'parado') return this.hud.toast('Selecione um robô primeiro');
      this.runner.step(this.program, robot);
    });
    this.el.querySelector('#bk-stop')!.addEventListener('click', () => this.runner.stop());
    this.el.querySelector('#bk-example')!.addEventListener('click', () => {
      this.program = EXAMPLE();
      this.active = 'root';
      this.save();
      this.render();
    });
    this.el.querySelector('#bk-clear')!.addEventListener('click', () => {
      this.runner.stop();
      this.program = [];
      this.active = 'root';
      this.save();
      this.render();
    });
  }

  run() {
    const robot = this.g.selected;
    if (!robot) return this.hud.toast('Selecione um robô primeiro');
    if (!this.program.length) return this.hud.toast('Adicione blocos ao programa');
    this.runner.start(this.program, robot);
  }

  private blockHtml(b: Block, parent: string): string {
    const num = (k: string, v: number, min = 0, max = 50) => `<input type="number" data-k="${k}" value="${v}" min="${min}" max="${max}" aria-label="${k}" />`;
    const sel = (k: string, v: string, opts: Record<string, string>) =>
      `<select data-k="${k}" aria-label="${k}">${Object.entries(opts).map(([val, l]) => `<option value="${val}" ${val === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    let row = '';
    switch (b.type) {
      case 'andar': row = `andar ${num('n', b.n, -20, 20)} passos`; break;
      case 'virar': row = `virar à ${sel('dir', b.dir, { esquerda: 'esquerda ↺', direita: 'direita ↻' })}`; break;
      case 'ir': row = `ir até ${sel('alvo', b.alvo, ALVO_LABEL as Record<Alvo, string>)}`; break;
      case 'pegar': row = 'pegar'; break;
      case 'soltar': row = 'soltar'; break;
      case 'chutar': row = 'chutar a bola'; break;
      case 'regar': row = 'regar planta'; break;
      case 'dancar': row = 'dançar'; break;
      case 'esperar': row = `esperar ${num('s', b.s, 0, 30)} s`; break;
      case 'dizer': row = `dizer <input type="text" data-k="text" value="${escapeHtml(b.text)}" maxlength="40" aria-label="texto" />`; break;
      case 'repetir': row = `repetir ${num('n', b.n, 0, 50)} vezes`; break;
      case 'se': row = `se ${sel('cond', b.cond, COND_LABEL as Record<Cond, string>)}`; break;
    }
    const slot = (key: string, list: Block[], label?: string) => `
      ${label ? `<div class="blk-label">${label}</div>` : ''}
      <div class="blk-slot">${list.map((c) => this.blockHtml(c, key)).join('')}
        <div class="blk-drop ${this.active === key ? 'active' : ''}" data-list="${key}">${this.active === key ? '＋ novos blocos entram aqui' : '＋ solte aqui'}</div>
      </div>`;
    let inner = '';
    if (b.type === 'repetir') inner = slot(`${b.id}:body`, b.body);
    if (b.type === 'se') inner = slot(`${b.id}:body`, b.body) + slot(`${b.id}:else`, b.else, 'senão');
    return `<div class="blk cat-${CAT_OF[b.type]}" draggable="true" data-id="${b.id}" data-parent="${parent}">
      <div class="blk-row"><span class="blk-ic">${ICON[b.type]}</span><span class="blk-txt">${row}</span>
        <span class="blk-tools"><button data-act="up" aria-label="Mover para cima">▲</button><button data-act="down" aria-label="Mover para baixo">▼</button><button data-act="del" aria-label="Apagar bloco">✕</button></span></div>
      ${inner}</div>`;
  }

  render() {
    if (this.active !== 'root' && !findBlock(this.program, this.active.split(':')[0])) this.active = 'root';
    this.progEl.innerHTML = `<div class="blk-start">🚩 quando clicar em Executar</div>
      ${this.program.map((b) => this.blockHtml(b, 'root')).join('')}
      <div class="blk-drop root ${this.active === 'root' ? 'active' : ''}" data-list="root">${this.active === 'root' ? '＋ toque num bloco acima para adicionar aqui' : '＋ solte aqui'}</div>
      <div class="blk-count">${countBlocks(this.program)} blocos</div>`;
    this.refreshRun();
  }

  private refreshHead() {
    const r = this.g.selected;
    this.el.querySelector('#bk-robot')!.innerHTML = r ? `para <b style="color:${r.cfg.color}">${escapeHtml(r.name)}</b>` : 'selecione um robô';
  }

  private refreshRun() {
    const r = this.runner;
    this.progEl.querySelectorAll('.blk.running').forEach((n) => n.classList.remove('running'));
    if (r.current) {
      const el = this.progEl.querySelector(`.blk[data-id="${r.current}"]`);
      el?.classList.add('running');
      (el as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
    }
    const play = this.el.querySelector('#bk-play')!;
    play.textContent = r.state === 'rodando' ? '⏸ Pausar' : r.state === 'pausado' ? '▶ Continuar' : '▶ Executar';
    play.classList.toggle('on', r.state !== 'parado');
  }
}
