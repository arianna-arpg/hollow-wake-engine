// One common walk grid, independent district builders, then shared connections.
// No builder knows a particular landmark or program id.
import { registerGenPin } from './genPins';
import { Rng } from '../core/rng';
import { vec, dist, type Vec2 } from '../core/math';
import { compileLocale, localeProgram, localeSeed, type LocalePlan } from '../world/locales';
import { GridWalkField } from '../world/gridWalk';
import { registerLayout, type GenCtx } from './levelgen';
import type { LocaleFragment } from '../world/localeFragments';

export interface LocaleReport {
  program: string; variant: string;
  districts: { id: string; builder: string; center: Vec2; choice?: string; fragment?: string }[];
  connections: { from: string; to: string; role: string; points: Vec2[] }[];
  crossings: Vec2[];
}
export interface DistrictBuild {
  grid: GridWalkField; rng: Rng; center: Vec2;
  w: number; h: number; params: Record<string, number>; region?: string;
  fragment?: LocaleFragment;
}
export type DistrictBuilder = (ctx: DistrictBuild) => void;
const BUILDERS: Record<string, DistrictBuilder> = {};
export function registerDistrictBuilder(id: string, builder: DistrictBuilder): void { BUILDERS[id] = builder; }
export const hasDistrictBuilder = (id: string): boolean => !!BUILDERS[id];

registerDistrictBuilder('fragment', ({ grid, center: c, w, h, fragment }) => {
  if (!fragment) throw new Error('fragment district requires baked terrain');
  const left = c.x - w / 2, top = c.y - h / 2;
  const rows = fragment.cells.length, cols = fragment.cells[0].length;
  // Sample onto the common lattice once. Painting scaled cells as overlapping
  // rectangles can erase narrow authored doorways at fractional boundaries.
  for (let y = Math.ceil((top - 15) / 30) * 30 + 15; y < top + h; y += 30) {
    for (let x = Math.ceil((left - 15) / 30) * 30 + 15; x < left + w; x += 30) {
      const region = fragment.cells[Math.min(rows - 1, Math.floor((y - top) / h * rows))][Math.min(cols - 1, Math.floor((x - left) / w * cols))];
      grid.fillRegion(x - 14, y - 14, x + 14, y + 14, region);
    }
  }
});

registerDistrictBuilder('terraces', ({ grid, center: c, w, h, params }) => {
  const shelves = Math.round(Math.max(3, Math.min(7, params.shelves ?? 4)));
  const step = h / shelves, half = Math.max(60, step * 0.32);
  for (let i = 0; i < shelves; i++) {
    const y = c.y - h / 2 + step * (i + 0.5);
    grid.fillRect(c.x - w * 0.44, y - half, c.x + w * 0.44, y + half);
    if (i) for (const sign of [-1, 1]) grid.carveCorridor(c.x + sign * w * 0.3, y - step, c.x + sign * w * 0.3, y, 65);
  }
  grid.carveCorridor(c.x, c.y - h * 0.4, c.x, c.y + h * 0.4, 60);
});

registerDistrictBuilder('open', ({ grid, rng, center: c, w, h, params }) => {
  // Elliptical core with overlapping lobes: an irregular open district.
  for (let y = c.y - h / 2; y <= c.y + h / 2; y += grid.cell) {
    for (let x = c.x - w / 2; x <= c.x + w / 2; x += grid.cell) {
      if (((x - c.x) / (w * 0.43)) ** 2 + ((y - c.y) / (h * 0.43)) ** 2 <= 1) grid.fillRect(x, y, x + grid.cell, y + grid.cell);
    }
  }
  const lobes = Math.max(2, Math.min(12, params.lobes ?? 6));
  for (let i = 0; i < lobes; i++) {
    const a = i / lobes * Math.PI * 2 + rng.range(-0.2, 0.2);
    grid.fillDisc(c.x + Math.cos(a) * w * 0.27, c.y + Math.sin(a) * h * 0.27,
      Math.min(w, h) * rng.range(0.15, 0.23), 'ground');
  }
});
registerDistrictBuilder('court', ({ grid, center: c, w, h, params }) => {
  grid.fillRect(c.x - w / 2, c.y - h / 2, c.x + w / 2, c.y + h / 2);
  // Parallel hall partitions open onto a central court; shared connections
  // later cut their actual approaches through the compound's perimeter.
  const hall = Math.max(90, Math.min(w * 0.3, params.hall ?? 150));
  for (const s of [-1, 1]) {
    const x = c.x + s * w * 0.24;
    grid.fillRect(x - 30, c.y - h * 0.43, x + 30, c.y + h * 0.43, false);
    grid.fillRect(x - 45, c.y - hall / 2, x + 45, c.y + hall / 2);
  }
});
registerDistrictBuilder('cavern', ({ grid, rng, center: c, w, h, params }) => {
  const chambers = Math.max(3, Math.min(9, params.chambers ?? 5));
  let prev = c;
  grid.fillDisc(c.x, c.y, Math.min(w, h) * 0.24, 'ground');
  for (let i = 0; i < chambers; i++) {
    const a = rng.range(0, Math.PI * 2);
    const next = vec(c.x + Math.cos(a) * w * 0.28, c.y + Math.sin(a) * h * 0.28);
    grid.fillDisc(next.x, next.y, Math.min(w, h) * rng.range(0.15, 0.22), 'ground');
    grid.carveCorridor(prev.x, prev.y, next.x, next.y, 60);
    prev = next;
  }
});
registerDistrictBuilder('arches', ctx => {
  BUILDERS.cavern(ctx);
  const { grid, center: c, w, h, params } = ctx;
  // Parallel stone ribs with two passages each: flankable rock landforms,
  // shared with any future program that wants a broken natural arcade.
  const passage = Math.max(100, Math.min(w * 0.24, params.passage ?? 130));
  for (const y of [c.y - h * 0.18, c.y + h * 0.18]) {
    grid.fillRect(c.x - w * 0.36, y - 40, c.x + w * 0.36, y + 40, false);
    for (const x of [c.x - w * 0.19, c.x + w * 0.19]) {
      grid.fillRect(x - passage / 2, y - 85, x + passage / 2, y + 85);
    }
  }
});

// A material-neutral basin: its bank and optional island are walkable;
// shared links cut the approaches after the water is laid.
registerDistrictBuilder('basin', ({ grid, center: c, w, h, params, region }) => {
  const bank = Math.max(0.06, Math.min(0.3, params.bank ?? 0.14));
  const island = Math.max(0, Math.min(0.3, params.island ?? 0));
  for (let y = c.y - h / 2; y <= c.y + h / 2; y += grid.cell) {
    for (let x = c.x - w / 2; x <= c.x + w / 2; x += grid.cell) {
      const r = Math.hypot((x - c.x) / (w / 2), (y - c.y) / (h / 2));
      if (r <= 1) grid.fillRegion(x, y, x + grid.cell, y + grid.cell,
        r < 1 - bank && r > island ? region ?? 'water' : 'ground');
    }
  }
  grid.fillDisc(c.x, c.y, Math.max(70, Math.min(w, h) * island / 2), 'ground');
});

function pointDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
function generateLocale(ctx: GenCtx, plan: LocalePlan, riverSides?: string[]): void {
  const grid = new GridWalkField(ctx.arena.w, ctx.arena.h, 30);
  ctx.walk = grid; ctx.gridEnsured = true;
  if (plan.terrain) grid.fillRegion(0, 0, ctx.arena.w, ctx.arena.h, plan.terrain.background);
  const report: LocaleReport = { program: plan.program, variant: plan.id, districts: [], connections: [], crossings: [] };
  const centers = new Map<string, Vec2>();
  const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const d of plan.districts) {
    const c = vec(d.at[0] * ctx.arena.w, d.at[1] * ctx.arena.h);
    const w = d.size[0] * ctx.arena.w, h = d.size[1] * ctx.arena.h;
    const builder = BUILDERS[d.builder];
    if (!builder) throw new Error(`locale ${plan.program}/${d.id}: unknown district builder ${d.builder}`);
    builder({ grid, center: c, w, h, params: d.params ?? {}, region: d.region, fragment: d.fragment, rng: new Rng(localeSeed(`${plan.seed}/${d.id}`)) });
    centers.set(d.id, c); rects.set(d.id, { x: c.x - w / 2, y: c.y - h / 2, w, h });
    report.districts.push({ id: d.id, builder: d.builder, center: c,
      ...(d.choice ? { choice: d.choice } : {}), ...(d.fragment ? { fragment: d.fragment.id } : {}) });
  }
  if (plan.river) {
    const { width, bend, region } = plan.river;
    const sides = riverSides?.length === 2 && riverSides[0] !== riverSides[1] && riverSides.every(s => ['n', 's', 'e', 'w'].includes(s)) ? riverSides : ['w', 'e'];
    const sidePoint = (s: string): Vec2 => s === 'n' ? vec(ctx.arena.w / 2, 0) : s === 's' ? vec(ctx.arena.w / 2, ctx.arena.h)
      : s === 'e' ? vec(ctx.arena.w, ctx.arena.h / 2) : vec(0, ctx.arena.h / 2);
    const a = sidePoint(sides[0]), b = sidePoint(sides[1]);
    const length = dist(a, b), normal = vec(-(b.y - a.y) / length, (b.x - a.x) / length);
    const steps = Math.ceil(length / 20);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, wave = Math.sin(t * Math.PI * 2) * bend * Math.min(ctx.arena.w, ctx.arena.h);
      const x = a.x + (b.x - a.x) * t + normal.x * wave, y = a.y + (b.y - a.y) * t + normal.y * wave;
      grid.fillDisc(x, y, width / 2 + 65, 'ground'); // banks connect the surrounding land
    }
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, wave = Math.sin(t * Math.PI * 2) * bend * Math.min(ctx.arena.w, ctx.arena.h);
      grid.fillDisc(a.x + (b.x - a.x) * t + normal.x * wave, a.y + (b.y - a.y) * t + normal.y * wave, width / 2, region);
    }
  }
  const crossingCells = new Set<string>();
  const routes: { a: Vec2; b: Vec2; width: number }[] = [];
  const connect = (points: Vec2[], width: number): void => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i]; routes.push({ a, b, width });
      // Paint the full corridor cell by cell, preserving water outside its
      // footprint and classifying the cells that actually form a crossing.
      const minX = Math.max(15, Math.floor((Math.min(a.x, b.x) - width / 2) / 30) * 30 + 15);
      const minY = Math.max(15, Math.floor((Math.min(a.y, b.y) - width / 2) / 30) * 30 + 15);
      for (let y = minY; y < Math.min(ctx.arena.h, Math.max(a.y, b.y) + width / 2); y += 30) {
        for (let x = minX; x < Math.min(ctx.arena.w, Math.max(a.x, b.x) + width / 2); x += 30) {
          if (pointDistance(vec(x, y), a, b) > width / 2) continue;
          const old = grid.regionAt(x, y), crossing = plan.river && (old === plan.river.region || old === plan.river.crossing);
          grid.fillRegion(x - 14, y - 14, x + 14, y + 14, crossing ? plan.river!.crossing : 'ground');
          const key = `${x}/${y}`;
          if (crossing && !crossingCells.has(key)) { crossingCells.add(key); report.crossings.push(vec(x, y)); }
        }
      }
    }
  };
  const socket = (id: string, port?: string, toward?: Vec2): Vec2 => {
    const d = plan.districts.find(d => d.id === id)!;
    const c = centers.get(id)!;
    const toWorld = (p: [number, number]) => vec(c.x + (p[0] - 0.5) * d.size[0] * ctx.arena.w, c.y + (p[1] - 0.5) * d.size[1] * ctx.arena.h);
    if (port && d.ports?.[port]) return toWorld(d.ports[port]);
    if (d.fragment && toward) return Object.values(d.ports ?? d.fragment.ports).map(toWorld).sort((a, b) => dist(a, toward) - dist(b, toward))[0] ?? c;
    return c;
  };
  for (const link of plan.links) {
    const via = (link.via ?? []).map(p => vec(p[0] * ctx.arena.w, p[1] * ctx.arena.h));
    const points = [socket(link.from, link.fromPort, via[0] ?? centers.get(link.to)), ...via,
      socket(link.to, link.toPort, via[via.length - 1] ?? centers.get(link.from))];
    connect(points, link.width);
    report.connections.push({ from: link.from, to: link.to, role: link.role, points });
  }
  // External portals always attach to the closest district; entry attaches
  // to the authored approach. The interior plan is independent of discovery order.
  const externalCenters = plan.districts.filter(d => d.external !== false).map(d => centers.get(d.id)!);
  const entryCenter = plan.portalMode === 'nearest' ? [...externalCenters].sort((a, b) => dist(a, ctx.entry) - dist(b, ctx.entry))[0] : centers.get(plan.entrance)!;
  const approach = (p: Vec2, fallback: Vec2): void => {
    const sides = [{ side: 'n' as const, d: p.y }, { side: 's' as const, d: ctx.arena.h - p.y },
      { side: 'w' as const, d: p.x }, { side: 'e' as const, d: ctx.arena.w - p.x }];
    const row = plan.approaches?.[sides.sort((a, b) => a.d - b.d)[0].side];
    const via = (row?.via ?? []).map(v => vec(v[0] * ctx.arena.w, v[1] * ctx.arena.h));
    const id = row?.district ?? [...centers].find(([, c]) => c === fallback)![0];
    connect([p, ...via, socket(id, undefined, via[via.length - 1] ?? p)], 150);
  };
  approach(ctx.entry, entryCenter);
  for (const exit of ctx.exits) {
    const closest = [...externalCenters].sort((a, b) => dist(a, exit) - dist(b, exit))[0];
    approach(exit, closest);
  }
  ctx.pois.push(...centers.values());
  ctx.bossSeat = centers.get(plan.goal);
  for (const d of plan.districts) {
    const rng = new Rng(localeSeed(`${plan.seed}/${d.id}/dress`)), r = rects.get(d.id)!;
    const center = centers.get(d.id)!;
    if (d.cave && !ctx.lite) {
      grid.fillDisc(center.x, center.y, 75, 'ground');
      ctx.doodads.push({ pos: { ...center }, kind: 'cave_entrance', radius: 24 });
      ctx.caveSeeds.push(localeSeed(`${plan.seed}/${d.id}/cave`));
    }
    if (ctx.lite || d.fragment) continue; // authored narrow passages keep their clearance
    for (const row of d.dress ?? []) {
      const count = rng.int(...row.count);
      for (let i = 0; i < count; i++) for (let attempt = 0; attempt < 16; attempt++) {
        const p = vec(rng.range(r.x, r.x + r.w), rng.range(r.y, r.y + r.h)), radius = rng.range(...row.radius);
        if (![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([x, y]) => grid.regionAt(p.x + x * (radius + 15), p.y + y * (radius + 15)) === 'ground')) continue;
        if ([ctx.entry, ...ctx.exits, ...centers.values()].some(c => dist(c, p) < radius + 125)) continue;
        if (routes.some(line => pointDistance(p, line.a, line.b) < radius + line.width / 2 + 20)) continue;
        if (ctx.doodads.some(o => dist(o.pos, p) < radius + o.radius + 15)) continue;
        ctx.doodads.push({ kind: row.kind, pos: p, radius, rot: rng.range(0, Math.PI * 2) });
        break;
      }
    }
  }
  for (const p of centers.values()) if (!grid.reachable(ctx.entry, p)) throw new Error(`locale ${plan.program}: disconnected required district`);
  if (plan.terrain?.rim) {
    const { side, width, region } = plan.terrain.rim;
    const w = ctx.arena.w, h = ctx.arena.h;
    grid.fillRegion(side === 'e' ? w - width : 0, side === 's' ? h - width : 0, side === 'w' ? width : w, side === 'n' ? width : h, region);
  }
  ctx.localeReport = report;
}

// The registry pin keeps the regular reference census aware of the engine's consumer.
export const LOCALE_LAYOUT = registerGenPin('layout', 'districts', 'Atlas destinations compose independent districts');
registerLayout(LOCALE_LAYOUT, (ctx, def) => {
  const program = localeProgram(typeof def.layoutParams?.locale === 'string' ? def.layoutParams.locale : undefined);
  const plan = def.locale ?? (program ? compileLocale(program, def.seed ?? 1, typeof def.layoutParams?.localeVariant === 'string' ? def.layoutParams.localeVariant : undefined) : undefined);
  if (!plan) throw new Error('district layout requires a registered locale program');
  if (plan.underTier) def.layoutParams = { ...def.layoutParams, underTier: plan.underTier };
  generateLocale(ctx, plan, def.layoutParams?.riverSides as string[] | undefined);
  if (def.complex?.bountyPassageBoard && !ctx.lite) {
    const pos = ctx.localeReport!.districts.find(d => d.id === plan.entrance)!.center;
    ctx.doodads.push({ kind: 'bounty_board', pos: { ...pos }, radius: 28 });
  }
});
