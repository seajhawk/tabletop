// Grid + reverse multi-source BFS. Four-way movement; index = y * width + x.
export const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [0, -1], [-1, 0]];

/** Distance (in steps) from every open cell to the nearest exit; -1 where unreachable. */
export function computeDist(
  w: number, h: number, blocked: Uint8Array, exits: ReadonlyArray<readonly [number, number]>,
  out?: Int16Array, queue?: Int32Array,
): Int16Array {
  const n = w * h;
  const dist = out ?? new Int16Array(n);
  dist.fill(-1);
  const q = queue ?? new Int32Array(n);
  let head = 0, tail = 0;
  for (const [x, y] of exits) {
    const i = y * w + x;
    if (!blocked[i] && dist[i] < 0) { dist[i] = 0; q[tail++] = i; }
  }
  while (head < tail) {
    const i = q[head++];
    const x = i % w, y = (i / w) | 0;
    const d = dist[i] + 1;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (blocked[j] || dist[j] >= 0) continue;
      dist[j] = d;
      q[tail++] = j;
    }
  }
  return dist;
}

/**
 * Would blocking `cell` still leave every required cell (spawns and the next waypoint of each
 * live ground enemy) connected to an exit? `blocked` is restored before returning.
 */
export function placementKeepsRoutes(
  w: number, h: number, blocked: Uint8Array, cell: number,
  exits: ReadonlyArray<readonly [number, number]>, required: ReadonlyArray<number>,
): boolean {
  if (blocked[cell]) return false;
  blocked[cell] = 1;
  try {
    const dist = computeDist(w, h, blocked, exits);
    for (const c of required) if (dist[c] < 0) return false;
    return true;
  } finally {
    blocked[cell] = 0;
  }
}

/** Walk downhill on a distance field from a start cell; returns cell indices including start/exit. */
export function followRoute(w: number, h: number, dist: Int16Array, start: number): number[] {
  const route: number[] = [];
  if (dist[start] < 0) return route;
  let cur = start;
  route.push(cur);
  for (let guard = 0; guard < w * h && dist[cur] > 0; guard++) {
    const x = cur % w, y = (cur / w) | 0;
    let next = -1;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (dist[j] === dist[cur] - 1) { next = j; break; }
    }
    if (next < 0) break;
    cur = next;
    route.push(cur);
  }
  return route;
}
