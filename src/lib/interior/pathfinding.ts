/** Rectangle on the floor plan: centre (x, z), size (w, d). */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface NavGrid {
  cell: number;
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  blocked: Uint8Array;
}

/** Builds a walkability grid; obstacles are inflated so bodies keep clear of edges. */
export function buildNavGrid(width: number, depth: number, obstacles: Rect[], cell = 0.4, inflate = 0.3): NavGrid {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(depth / cell);
  const minX = -width / 2;
  const minZ = -depth / 2;
  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = minX + (c + 0.5) * cell;
      const z = minZ + (r + 0.5) * cell;
      // Keep a margin from the outer walls.
      if (x < minX + 0.5 || x > -minX - 0.5 || z < minZ + 0.5 || z > -minZ - 0.5) {
        blocked[r * cols + c] = 1;
        continue;
      }
      for (const o of obstacles) {
        if (Math.abs(x - o.x) < o.w / 2 + inflate && Math.abs(z - o.z) < o.d / 2 + inflate) {
          blocked[r * cols + c] = 1;
          break;
        }
      }
    }
  }
  return { cell, cols, rows, minX, minZ, blocked };
}

const toCell = (g: NavGrid, x: number, z: number) => [
  Math.min(g.cols - 1, Math.max(0, Math.floor((x - g.minX) / g.cell))),
  Math.min(g.rows - 1, Math.max(0, Math.floor((z - g.minZ) / g.cell))),
] as const;

const center = (g: NavGrid, c: number, r: number): [number, number] => [g.minX + (c + 0.5) * g.cell, g.minZ + (r + 0.5) * g.cell];

export function isWalkable(g: NavGrid, x: number, z: number) {
  const [c, r] = toCell(g, x, z);
  return g.blocked[r * g.cols + c] === 0;
}

/** Nearest walkable cell centre to a point (seats sit right next to desks). */
export function nearestWalkable(g: NavGrid, x: number, z: number): [number, number] | null {
  const [c0, r0] = toCell(g, x, z);
  for (let radius = 0; radius < Math.max(g.cols, g.rows); radius++) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || r < 0 || c >= g.cols || r >= g.rows || g.blocked[r * g.cols + c]) continue;
        const [cx, cz] = center(g, c, r);
        const d = (cx - x) ** 2 + (cz - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = [cx, cz];
        }
      }
    }
    if (best) return best;
  }
  return null;
}

function lineClear(g: NavGrid, a: [number, number], b: [number, number]) {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (g.cell / 2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!isWalkable(g, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
  }
  return true;
}

/** A* over the grid (8-way, no corner cutting) with line-of-sight smoothing. */
export function findPath(g: NavGrid, from: [number, number], to: [number, number]): [number, number][] | null {
  const start = nearestWalkable(g, from[0], from[1]);
  const goal = nearestWalkable(g, to[0], to[1]);
  if (!start || !goal) return null;
  const [sc, sr] = toCell(g, start[0], start[1]);
  const [gc, gr] = toCell(g, goal[0], goal[1]);
  const n = g.cols * g.rows;
  const gScore = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open: number[] = [];
  const f = new Float32Array(n).fill(Infinity);
  const h = (i: number) => Math.hypot((i % g.cols) - gc, Math.floor(i / g.cols) - gr);
  const s = sr * g.cols + sc;
  const goalI = gr * g.cols + gc;
  gScore[s] = 0;
  f[s] = h(s);
  open.push(s);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]!]! < f[open[bi]!]!) bi = i;
    const cur = open.splice(bi, 1)[0]!;
    if (cur === goalI) break;
    closed[cur] = 1;
    const cc = cur % g.cols;
    const cr = Math.floor(cur / g.cols);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
        const ni = nr * g.cols + nc;
        if (g.blocked[ni] || closed[ni]) continue;
        if (dc && dr && (g.blocked[cr * g.cols + nc] || g.blocked[nr * g.cols + cc])) continue;
        const tentative = gScore[cur]! + (dc && dr ? Math.SQRT2 : 1);
        if (tentative < gScore[ni]!) {
          came[ni] = cur;
          gScore[ni] = tentative;
          f[ni] = tentative + h(ni);
          if (!open.includes(ni)) open.push(ni);
        }
      }
    }
  }
  if (came[goalI] === -1 && goalI !== s) return null;
  const cells: [number, number][] = [];
  for (let i = goalI; i !== -1; i = came[i]!) cells.unshift(center(g, i % g.cols, Math.floor(i / g.cols)));
  // String pulling: keep only the points needed to stay clear of obstacles.
  const out: [number, number][] = [cells[0]!];
  let anchor = 0;
  for (let i = 2; i < cells.length; i++) {
    if (!lineClear(g, cells[anchor]!, cells[i]!)) {
      out.push(cells[i - 1]!);
      anchor = i - 1;
    }
  }
  if (cells.length > 1) out.push(cells[cells.length - 1]!);
  return out;
}
