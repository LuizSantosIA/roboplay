import type { RobotConfig } from '../entities/robot';

const KEY_ROSTER = 'roboplay.robos';
const KEY_PROGRESS = 'roboplay.missoes';
const KEY_DOGS = 'roboplay.caes';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* armazenamento indisponível */
  }
}

export function loadRoster(): RobotConfig[] | null {
  const r = read<RobotConfig[] | null>(KEY_ROSTER, null);
  return Array.isArray(r) && r.length ? r : null;
}
export function saveRoster(list: RobotConfig[]) {
  write(KEY_ROSTER, list);
}

/** Os cachorros já foram adicionados uma vez a este navegador? */
export function dogsIntroduced(): boolean {
  return read<boolean>(KEY_DOGS, false);
}
export function markDogsIntroduced() {
  write(KEY_DOGS, true);
}

export interface MissionProgress {
  [id: string]: { stars: number; best: number };
}
export function loadProgress(): MissionProgress {
  return read<MissionProgress>(KEY_PROGRESS, {});
}
export function saveProgress(p: MissionProgress) {
  write(KEY_PROGRESS, p);
}
