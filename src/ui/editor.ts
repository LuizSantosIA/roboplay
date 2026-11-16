import type { Game } from '../game';
import type { Hud } from './hud';
import { escapeHtml } from './hud';
import { ROBOT_COLORS, Robot, RobotConfig, randomConfig } from '../entities/robot';

const HEADS: [RobotConfig['head'], string][] = [['quadrada', 'Quadrada'], ['redonda', 'Redonda'], ['tv', 'TV'], ['domo', 'Domo']];
const ANTENNAS: [RobotConfig['antenna'], string][] = [['bola', 'Bola'], ['dupla', 'Dupla'], ['raio', 'Raio'], ['mola', 'Mola']];
const LOCOS: [RobotConfig['loco'], string][] = [['pernas', 'Pernas'], ['rodas', 'Rodas']];
const SPECIES: [string, string][] = [['robo', '🤖 Robô'], ['cachorro', '🐶 Cachorro']];
/** No cachorro, a opção "cabeça" escolhe as orelhas. */
const DOG_EARS: Record<RobotConfig['head'], string> = { quadrada: 'Pontudas', redonda: 'Caídas', tv: 'Tela', domo: 'Redondas' };

/** Editor de personalização do robô. */
export function setupEditor(g: Game, hud: Hud) {
  hud.addButton('robo', { id: 'editar', icon: '🎨', label: 'Personalizar', title: 'Personalizar robô', onClick: () => open() });

  function open() {
    const target = g.selected;
    const cfg: RobotConfig = target ? { species: 'robo', ...target.cfg } : randomConfig(g.robots.map((r) => r.name));
    const preview = new Robot(0, 0, cfg);
    const opts = (name: string, list: [string, string][], cur: string) =>
      `<div class="seg" data-k="${name}">${list.map(([v, l]) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const p = hud.openPanel('editor', `
      <h2>${target ? 'Personalizar' : 'Criar personagem'}</h2>
      <div class="editor">
        <div class="editor-preview"><canvas width="220" height="240" aria-label="Prévia do robô"></canvas>
          <button class="btn-ghost btn-sm" id="ed-random">🎲 Sortear</button></div>
        <div class="editor-fields">
          <label class="field"><span>Nome</span><input id="ed-name" maxlength="14" value="${escapeHtml(cfg.name)}" autocomplete="off" /></label>
          <h3>Tipo</h3>${opts('species', SPECIES, cfg.species ?? 'robo')}
          <h3>Cor</h3>
          <div class="swatches">${ROBOT_COLORS.map((c) => `<button class="sw ${c === cfg.color ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}
            <label class="sw sw-custom" title="Outra cor"><input type="color" id="ed-color" value="${cfg.color}" aria-label="Escolher outra cor" /></label></div>
          <h3 id="ed-head-title">Cabeça</h3>${opts('head', HEADS, cfg.head)}
          <h3>Antena</h3>${opts('antenna', ANTENNAS, cfg.antenna)}
          <h3>Locomoção</h3>${opts('loco', LOCOS, cfg.loco)}
        </div>
      </div>
      <div class="editor-actions">
        ${target ? '<button class="btn-ghost btn-sm" id="ed-remove">🗑️ Remover</button>' : ''}
        <span style="flex:1"></span>
        <button class="btn-primary" id="ed-save">${target ? 'Salvar' : 'Criar robô'}</button>
      </div>`, 'wide');
    const canvas = p.querySelector('canvas')!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = 220 * dpr;
    canvas.height = 240 * dpr;
    let t0 = performance.now();
    let raf = 0;
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.35);
      const d = Math.hypot(dx, dy) || 1;
      preview.look.x = (dx / d) * 2.8;
      preview.look.y = (dy / d) * 2.4;
    });
    const draw = () => {
      if (!canvas.isConnected) return cancelAnimationFrame(raf);
      const time = (performance.now() - t0) / 1000;
      preview.blinkT -= 1 / 60;
      if (preview.blinkT <= 0) {
        preview.blink = 0.14;
        preview.blinkT = 2 + Math.random() * 3;
      }
      preview.blink = Math.max(0, preview.blink - 1 / 60);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, 220, 240);
      const gr = ctx.createLinearGradient(0, 0, 0, 240);
      gr.addColorStop(0, '#cfeaff');
      gr.addColorStop(0.72, '#e9f6ff');
      gr.addColorStop(0.72, '#8fcf62');
      gr.addColorStop(1, '#6fbf4f');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 220, 240);
      ctx.fillStyle = 'rgba(20,40,10,0.25)';
      ctx.beginPath();
      ctx.ellipse(110, 205, 46, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(110, 205);
      ctx.scale(1.9, 1.9);
      preview.drawBody(ctx, { time }, true);
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    draw();
    const sync = () => {
      p.querySelectorAll<HTMLElement>('.seg[data-k]').forEach((seg) => {
        const k = seg.dataset.k as 'head' | 'antenna' | 'loco' | 'species';
        const cur = k === 'species' ? cfg.species ?? 'robo' : cfg[k];
        seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === cur));
      });
      const dog = cfg.species === 'cachorro';
      p.querySelector('#ed-head-title')!.textContent = dog ? 'Orelhas' : 'Cabeça';
      p.querySelectorAll<HTMLButtonElement>('.seg[data-k="head"] button').forEach((b) => {
        const v = b.dataset.v as RobotConfig['head'];
        b.textContent = dog ? DOG_EARS[v] : HEADS.find(([h]) => h === v)![1];
      });
      p.querySelectorAll<HTMLButtonElement>('.sw[data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c === cfg.color));
      (p.querySelector('#ed-color') as HTMLInputElement).value = cfg.color;
      (p.querySelector('#ed-name') as HTMLInputElement).value = cfg.name;
      preview.cfg = { ...cfg };
    };
    p.querySelectorAll<HTMLElement>('.seg[data-k]').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest('button');
        if (!b) return;
        (cfg as unknown as Record<string, string>)[seg.dataset.k!] = b.dataset.v!;
        if (seg.dataset.k === 'species' && b.dataset.v === 'cachorro') g.audio.bark();
        else g.audio.beep(800);
        sync();
      });
    });
    p.querySelectorAll<HTMLButtonElement>('.sw[data-c]').forEach((b) =>
      b.addEventListener('click', () => {
        cfg.color = b.dataset.c!;
        g.audio.beep(900);
        sync();
      }),
    );
    p.querySelector('#ed-color')!.addEventListener('input', (e) => {
      cfg.color = (e.target as HTMLInputElement).value;
      sync();
    });
    p.querySelector('#ed-name')!.addEventListener('input', (e) => {
      cfg.name = (e.target as HTMLInputElement).value.slice(0, 14);
      preview.cfg = { ...cfg };
    });
    p.querySelector('#ed-random')!.addEventListener('click', () => {
      const n = randomConfig(g.robots.filter((r) => r !== target).map((r) => r.name), cfg.species ?? 'robo');
      Object.assign(cfg, n);
      t0 = performance.now();
      sync();
    });
    sync();
    p.querySelector('#ed-save')!.addEventListener('click', () => {
      cfg.name = cfg.name.trim() || (cfg.species === 'cachorro' ? 'Cão' : 'Robô');
      if (target && !target.dead) {
        target.cfg = { ...cfg };
        target.celebrate(g);
        g.select(target);
      } else {
        const r = g.spawnRobot({ ...cfg });
        g.select(r);
      }
      g.saveRoster();
      hud.closePanels();
      hud.toast(`${cfg.species === 'cachorro' ? 'Cachorro' : 'Robô'} salvo! 💾`);
    });
    p.querySelector('#ed-remove')?.addEventListener('click', () => {
      if (!target) return;
      if (g.robots.filter((r) => !r.remote).length <= 1) {
        hud.toast('Precisa ficar pelo menos um robô!');
        return;
      }
      g.remove(target);
      g.particles.sparkle(target.x, target.y, 50, '#ffffff', 16);
      setTimeout(() => g.saveRoster(), 50);
      hud.closePanels();
      hud.toast(`${target.name} foi descansar.`);
    });
  }
}
