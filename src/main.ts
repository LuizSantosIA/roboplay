import './style.css';
import { Game } from './game';
import { Hud } from './ui/hud';
import { TouchControls } from './ui/touch';
import { setupWorldControls } from './ui/worldControls';
import { setupEditor } from './ui/editor';
import { BlocksPanel } from './ui/blocksPanel';
import { MissionsUi } from './ui/missions';
import { setupJuice } from './systems/juice';
import { dogsIntroduced, loadRoster, markDogsIntroduced } from './systems/storage';
import type { RobotConfig } from './entities/robot';
import { GROUND_BOTTOM, GROUND_TOP } from './config';

/** Os dois cachorros robôs que vêm de fábrica. */
const DOGS: RobotConfig[] = [
  { species: 'cachorro', name: 'Faro', color: '#f2b632', head: 'quadrada', antenna: 'bola', loco: 'pernas' },
  { species: 'cachorro', name: 'Biscoito', color: '#8a8f99', head: 'redonda', antenna: 'mola', loco: 'pernas' },
];

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
const hud = new Hud(game);
setupWorldControls(game, hud);
setupEditor(game, hud);
const blocks = new BlocksPanel(game, hud);
const missions = new MissionsUi(game, hud, blocks);
new TouchControls(game);
setupJuice(game);

function populate() {
  const mid = 560;
  let roster = loadRoster();
  // os dois cachorros entram uma vez, também para quem já tinha robôs salvos
  let changed = !roster;
  if (!dogsIntroduced()) {
    markDogsIntroduced();
    if (roster && !roster.some((c) => c.species === 'cachorro')) {
      roster = [...roster, ...DOGS.filter((d) => !roster!.some((c) => c.name === d.name)).map((d) => ({ ...d }))];
      changed = true;
    }
  }
  const spots = [[mid - 120, GROUND_TOP + 140], [mid + 60, GROUND_TOP + 90], [mid + 200, GROUND_TOP + 190], [mid - 250, GROUND_TOP + 60], [mid + 330, GROUND_TOP + 70], [mid - 60, GROUND_TOP + 230], [mid + 120, GROUND_TOP + 250], [mid - 190, GROUND_TOP + 200]];
  let r1 = null;
  const list: (RobotConfig | undefined)[] = roster ? roster.slice(0, 10) : [undefined, undefined, undefined, ...DOGS.map((d) => ({ ...d }))];
  for (let i = 0; i < list.length; i++) {
    const [x, y] = spots[i % spots.length];
    const r = game.spawnRobot(list[i], x + Math.floor(i / spots.length) * 40, y);
    r1 = r1 ?? r;
  }
  if (changed) game.saveRoster();
  game.spawnBox('madeira', mid - 40, GROUND_TOP + 200);
  game.spawnBox('madeira', mid + 130, GROUND_TOP + 60);
  game.spawnBox('madeira', mid + 300, GROUND_TOP + 120);
  game.spawnBall(mid + 10, GROUND_BOTTOM - 70);
  for (const e of game.entities) e.z = 0;
  game.selected = r1;
  game.camera.centerOn(mid);
}

game.on('reset', populate);
populate();
game.start();

const intro = document.getElementById('intro')!;
const closeIntro = () => {
  game.audio.unlock();
  intro.classList.add('hide');
  setTimeout(() => intro.remove(), 400);
};
document.getElementById('btn-play')!.addEventListener('click', () => {
  closeIntro();
  game.select(game.selected);
});
const btnMissions = document.getElementById('btn-missions')!;
btnMissions.hidden = false;
btnMissions.addEventListener('click', () => {
  closeIntro();
  missions.openList();
});

// depuração
(window as unknown as { roboplay: Game; blocks: BlocksPanel }).roboplay = game;
(window as unknown as { blocks: BlocksPanel }).blocks = blocks;
