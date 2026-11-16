/** Obstáculos e planejamento de rota (grafo de visibilidade). */
export interface Obstacle {
  kind: 'ellipse' | 'rect';
  x: number;
  y: number;
  rx: number; // ellipse: raio x | rect: meia largura
  ry: number;
  active: boolean;
}

export const ROBOT_R = 18;

export function insideObstacle(o: Obstacle, x: number, y: number, m = 0) {
  if (!o.active) return false;
  if (o.kind === 'ellipse') {
    const dx = (x - o.x) / (o.rx + m);
    const dy = (y - o.y) / (o.ry + m);
    return dx * dx + dy * dy < 1;
  }
  return Math.abs(x - o.x) < o.rx + m && Math.abs(y - o.y) < o.ry + m;
}

function segHits(o: Obstacle, ax: number, ay: number, bx: number, by: number, m: number) {
  const n = Math.max(4, Math.ceil(Math.hypot(bx - ax, by - ay) / 8));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (insideObstacle(o, ax + (bx - ax) * t, ay + (by - ay) * t, m)) return true;
  }
  return false;
}

function nodesFor(o: Obstacle, m: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  if (o.kind === 'ellipse') {
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      pts.push({ x: o.x + Math.cos(a) * (o.rx + m), y: o.y + Math.sin(a) * (o.ry + m) });
    }
  } else {
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push({ x: o.x + sx * (o.rx + m), y: o.y + sy * (o.ry + m) });
  }
  return pts;
}

/** Ponto mais próximo fora dos obstáculos. */
export function pushOut(obs: Obstacle[], x: number, y: number, m: number) {
  for (const o of obs) {
    if (!insideObstacle(o, x, y, m)) continue;
    if (o.kind === 'ellipse') {
      const a = Math.atan2((y - o.y) / (o.ry + m), (x - o.x) / (o.rx + m));
      x = o.x + Math.cos(a) * (o.rx + m + 2);
      y = o.y + Math.sin(a) * (o.ry + m + 2);
    } else {
      const dx = x - o.x;
      const dy = y - o.y;
      const px = o.rx + m + 2 - Math.abs(dx);
      const py = o.ry + m + 2 - Math.abs(dy);
      if (px < py) x += Math.sign(dx || 1) * px;
      else y += Math.sign(dy || 1) * py;
    }
  }
  return { x, y };
}

export function planPath(
  obs: Obstacle[], fx: number, fy: number, tx: number, ty: number,
  bounds: { minY: number; maxY: number; maxX: number },
) {
  const active = obs.filter((o) => o.active);
  const m = ROBOT_R;
  const t = pushOut(active, tx, ty, m);
  tx = t.x;
  ty = t.y;
  const blocked = (ax: number, ay: number, bx: number, by: number) => active.some((o) => segHits(o, ax, ay, bx, by, m - 4));
  if (!blocked(fx, fy, tx, ty)) return [{ x: tx, y: ty }];
  const nodes: { x: number; y: number }[] = [{ x: fx, y: fy }, { x: tx, y: ty }];
  for (const o of active) {
    for (const p of nodesFor(o, m + 6)) {
      if (p.y < bounds.minY || p.y > bounds.maxY || p.x < 10 || p.x > bounds.maxX - 10) continue;
      if (active.some((q) => insideObstacle(q, p.x, p.y, m - 2))) continue;
      nodes.push(p);
    }
  }
  const n = nodes.length;
  const d = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  d[0] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0 || d[u] === Infinity) break;
    if (u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const w = Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y);
      if (d[u] + w >= d[v]) continue;
      if (blocked(nodes[u].x, nodes[u].y, nodes[v].x, nodes[v].y)) continue;
      d[v] = d[u] + w;
      prev[v] = u;
    }
  }
  if (prev[1] < 0) return [{ x: tx, y: ty }];
  const path: { x: number; y: number }[] = [];
  for (let c = 1; c > 0; c = prev[c]) path.unshift(nodes[c]);
  return path;
}
