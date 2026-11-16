import './style.css';
import { Game } from './game';
import { Hud } from './ui/hud';
import { TouchControls } from './ui/touch';
import { setupWorldControls } from './ui/worldControls';
import { setupEditor } from './ui/editor';
import { loadRoster } from './systems/storage';
import { GROUND_BOTTOM, GROUND_TOP } from './config';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
const hud = new Hud(game);
setupWorldControls(game, hud);
setupEditor(game, hud);
new TouchControls(game);

function populate() {
  const mid = 560;
  const roster = loadRoster();
  const spots = [[mid - 120, GROUND_TOP + 140], [mid + 60, GROUND_TOP + 90], [mid + 200, GROUND_TOP + 190], [mid - 250, GROUND_TOP + 60], [mid + 330, GROUND_TOP + 70], [mid - 60, GROUND_TOP + 230]];
  let r1 = null;
  const n = roster ? Math.min(roster.length, 8) : 3;
  for (let i = 0; i < n; i++) {
    const [x, y] = spots[i % spots.length];
    const r = game.spawnRobot(roster ? roster[i] : undefined, x + Math.floor(i / spots.length) * 40, y);
    r1 = r1 ?? r;
  }
  if (!roster) game.saveRoster();
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
document.getElementById('btn-play')!.addEventListener('click', () => {
  game.audio.unlock();
  intro.classList.add('hide');
  setTimeout(() => intro.remove(), 400);
  game.select(game.selected);
});

// depuração
(window as unknown as { roboplay: Game }).roboplay = game;
