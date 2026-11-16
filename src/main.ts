import './style.css';
import { Game } from './game';
import { Hud } from './ui/hud';
import { TouchControls } from './ui/touch';
import { GROUND_BOTTOM, GROUND_TOP } from './config';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
new Hud(game);
new TouchControls(game);

function populate() {
  const mid = 520;
  const r1 = game.spawnRobot(undefined, mid - 120, GROUND_TOP + 140);
  game.spawnRobot(undefined, mid + 60, GROUND_TOP + 90);
  game.spawnRobot(undefined, mid + 200, GROUND_TOP + 190);
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
