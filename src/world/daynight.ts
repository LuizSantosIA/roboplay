import { RGB, clamp, mix } from '../util';

const DAY_TOP: RGB = [92, 168, 238];
const DAY_BOT: RGB = [204, 234, 255];
const SET_TOP: RGB = [96, 108, 190];
const SET_BOT: RGB = [255, 158, 96];
const NIGHT_TOP: RGB = [8, 12, 36];
const NIGHT_BOT: RGB = [34, 44, 86];
const T_DAY: RGB = [255, 255, 255];
const T_SET: RGB = [255, 200, 168];
const T_NIGHT: RGB = [82, 94, 160];

/** Ciclo de dia e noite. t: 0 = meia-noite, 0.25 = 6h, 0.5 = meio-dia, 0.75 = 18h. */
export class DayNight {
  t = 0.33;
  duration = 360; // segundos por dia na velocidade normal
  speed = 1; // 0 = parado, 1 = normal, 12 = rápido
  overcast = 0; // 0..1 (chuva/neve)

  update(dt: number) {
    this.t = (this.t + (dt * this.speed) / this.duration) % 1;
  }

  get hour() {
    return this.t * 24;
  }
  get label() {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** Elevação do sol: -1 (meia-noite) a 1 (meio-dia). */
  get elevation() {
    return Math.sin((this.t - 0.25) * Math.PI * 2);
  }
  get night() {
    return clamp((0.08 - this.elevation) / 0.3, 0, 1);
  }
  get sunset() {
    const e = this.elevation;
    return Math.exp(-(((e - 0.02) / 0.2) ** 2));
  }
  get isNight() {
    return this.night > 0.6;
  }

  /** Cor de multiplicação aplicada ao mundo. */
  tint(): RGB {
    let c = mix(T_DAY, T_SET, this.sunset * (1 - this.night));
    c = mix(c, T_NIGHT, this.night);
    if (this.overcast) c = mix(c, [c[0] * 0.78, c[1] * 0.8, c[2] * 0.86], this.overcast);
    return c;
  }

  /** Cores finais desejadas do céu. */
  sky(): [RGB, RGB] {
    const s = this.sunset * (1 - this.night);
    let top = mix(DAY_TOP, SET_TOP, s);
    let bot = mix(DAY_BOT, SET_BOT, s);
    top = mix(top, NIGHT_TOP, this.night);
    bot = mix(bot, NIGHT_BOT, this.night);
    if (this.overcast) {
      const gray = (c: RGB): RGB => {
        const l = (c[0] + c[1] + c[2]) / 3;
        return [l * 0.82, l * 0.86, l * 0.92];
      };
      top = mix(top, gray(top), this.overcast * 0.8);
      bot = mix(bot, gray(bot), this.overcast * 0.8);
    }
    return [top, bot];
  }
}
