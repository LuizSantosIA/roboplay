import type { Game } from '../game';
import type { Hud } from './hud';
import type { WeatherMode } from '../world/weather';

const WEATHER: { id: WeatherMode; icon: string; label: string }[] = [
  { id: 'auto', icon: '🎲', label: 'Automático' },
  { id: 'limpo', icon: '☀️', label: 'Limpo' },
  { id: 'chuva', icon: '🌧️', label: 'Chuva' },
  { id: 'neve', icon: '❄️', label: 'Neve' },
];

/** Botões de horário e clima. */
export function setupWorldControls(g: Game, hud: Hud) {
  const dn = g.world.dayNight;
  const timeBtn = hud.addButton('mundo', {
    id: 'horario', icon: '🕗', label: dn.label, title: 'Horário: acelerar ou fixar',
    onClick: () => openTimePanel(),
  });
  const wBtn = hud.addButton('mundo', {
    id: 'clima', icon: '🎲', label: 'Clima', title: 'Clima: automático, limpo, chuva ou neve',
    onClick: () => {
      const w = g.world.weather;
      const i = WEATHER.findIndex((x) => x.id === w.mode);
      const next = WEATHER[(i + 1) % WEATHER.length];
      w.setMode(next.id);
      wBtn.querySelector('.ic')!.textContent = next.icon;
      hud.toast(`Clima: ${next.label}`);
    },
  });
  const clockIcon = () => (dn.isNight ? '🌙' : dn.sunset > 0.5 ? '🌅' : '☀️');
  setInterval(() => {
    timeBtn.querySelector('.lb')!.textContent = dn.speed === 0 ? `${dn.label} ⏸` : dn.speed > 1 ? `${dn.label} ⏩` : dn.label;
    timeBtn.querySelector('.ic')!.textContent = clockIcon();
  }, 500);

  function openTimePanel() {
    const p = hud.openPanel('horario', `
      <h2>Horário</h2>
      <div class="time-row"><span class="time-big" id="tp-label">${dn.label}</span></div>
      <input type="range" id="tp-slider" min="0" max="1440" step="5" value="${Math.round(dn.t * 1440)}" aria-label="Hora do dia" />
      <div class="time-marks"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span></div>
      <h3>Velocidade</h3>
      <div class="seg" id="tp-speed">
        <button data-s="0">⏸ Fixo</button><button data-s="1">▶ Normal</button><button data-s="12">⏩ Rápido</button>
      </div>
      <h3>Atalhos</h3>
      <div class="seg" id="tp-presets">
        <button data-t="0.27">🌄 Amanhecer</button><button data-t="0.5">☀️ Meio-dia</button><button data-t="0.745">🌅 Pôr do sol</button><button data-t="0.95">🌙 Noite</button>
      </div>`, 'small');
    const label = p.querySelector('#tp-label')!;
    const slider = p.querySelector('#tp-slider') as HTMLInputElement;
    const refresh = () => {
      label.textContent = dn.label;
      p.querySelectorAll<HTMLButtonElement>('#tp-speed button').forEach((b) => b.classList.toggle('on', Number(b.dataset.s) === dn.speed));
    };
    slider.addEventListener('input', () => {
      dn.t = Number(slider.value) / 1440;
      refresh();
    });
    p.querySelectorAll<HTMLButtonElement>('#tp-speed button').forEach((b) =>
      b.addEventListener('click', () => {
        dn.speed = Number(b.dataset.s);
        refresh();
      }),
    );
    p.querySelectorAll<HTMLButtonElement>('#tp-presets button').forEach((b) =>
      b.addEventListener('click', () => {
        dn.t = Number(b.dataset.t);
        slider.value = String(Math.round(dn.t * 1440));
        refresh();
      }),
    );
    const iv = setInterval(() => {
      if (!p.isConnected) return clearInterval(iv);
      label.textContent = dn.label;
      if (document.activeElement !== slider) slider.value = String(Math.round(dn.t * 1440));
    }, 250);
    refresh();
  }
}
