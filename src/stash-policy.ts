import { InventoryHost, type InventoryFootprint, type LiveInventoryBoard, type LiveInventoryItem } from './inventory-host.js';
import { finite, integer } from './validation.js';

export interface StashCell { page: number; x: number; y: number }
export interface StashState { pages: number; cells: Record<string, StashCell>; invested: number }
export interface StashDefinition<T> {
  id: string;
  board: LiveInventoryBoard;
  initialPages: number;
  maxPages: number;
  pageCostBase: number;
  /** Pure read port; authorization and persistence belong to the caller. */
  accepts(item: T): boolean;
}
export interface StashEntry<T> { key: string; item: T }
interface Placement extends LiveInventoryItem, InventoryFootprint { x: number; y: number }
const cellAt = (s: Partial<StashState>, key: string): StashCell | undefined => s.cells && Object.hasOwn(s.cells, key) ? s.cells[key] : undefined;
const copyCell = (c: StashCell): StashCell => ({ page: c.page, x: c.x, y: c.y });
function defineCell(s: StashState, key: string, c: StashCell): void {
  // Opaque storage keys, including __proto__, are data, never object setters.
  if (key === '__proto__') Object.defineProperty(s.cells, key, { value: c, enumerable: true, configurable: true, writable: true });
  else s.cells[key] = c;
}
const put = (s: StashState, key: string, c: StashCell): void => defineCell(s, key, copyCell(c));
const validCell = (s: StashState, c: StashCell | undefined): c is StashCell => !!c
  && Number.isSafeInteger(c.page) && c.page >= 0 && c.page < s.pages
  && Number.isSafeInteger(c.x) && Number.isSafeInteger(c.y);

/** Address plans over host-owned bodies. Geometry uses small placement records;
 * payloads are never cloned by fit, repair or planning. No input is mutated and
 * every returned plan owns its cell addresses. Ports must be pure/nonreentrant.
 */
export class StashPolicy<T extends LiveInventoryItem> {
  #grid = new InventoryHost<Placement>(p => p);
  #busy = false;
  constructor(private readonly sizeOf: (item: T) => InventoryFootprint) {
    if (typeof sizeOf !== 'function') throw new Error('Storage footprint port is required');
  }
  get scratchBytes(): number { return this.#grid.scratchBytes; }
  #definition(def: StashDefinition<T>): void {
    integer(def.initialPages, 1, 'Initial storage pages'); integer(def.maxPages, def.initialPages, 'Maximum storage pages');
    if (def.maxPages > 256) throw new Error('Storage exceeds 256 pages');
    finite(def.pageCostBase, 'Storage page cost');
    if (def.pageCostBase < 0 || def.pageCostBase * (def.maxPages - def.initialPages + 1) ** 2 > Number.MAX_SAFE_INTEGER) throw new Error('Storage page cost is out of range');
    if (typeof def.accepts !== 'function') throw new Error('Storage acceptance port is required');
    // Validate dimensions without sampling a live mask.
    this.#grid.footprintOpen({ w: def.board.w, h: def.board.h }, 0, 0, 1, 1);
  }
  #entries(entries: readonly StashEntry<T>[]): void {
    const keys = new Set<string>();
    for (const e of entries) {
      if (typeof e.key !== 'string' || !e.key || keys.has(e.key)) throw new Error('Storage keys must be nonempty and unique');
      keys.add(e.key);
    }
  }
  #state(def: StashDefinition<T>, state: StashState): void {
    integer(state.pages, def.initialPages, 'Storage pages');
    if (state.pages > def.maxPages) throw new Error('Storage pages exceed definition');
  }
  #run<R>(def: StashDefinition<T>, entries: readonly StashEntry<T>[], work: () => R): R {
    if (this.#busy) throw new Error('Reentrant storage operation');
    this.#busy = true;
    try { this.#definition(def); this.#entries(entries); return work(); }
    finally { this.#busy = false; }
  }
  #body(item: T, x = 0, y = 0): Placement {
    const s = this.sizeOf(item);
    return { uid: item.uid, x, y, w: s.w, h: s.h };
  }
  #page(entries: readonly StashEntry<T>[], state: StashState, page: number): Placement[] {
    const out: Placement[] = [];
    for (const e of entries) { const c = cellAt(state, e.key); if (c?.page === page) out.push(this.#body(e.item, c.x, c.y)); }
    return out;
  }
  empty(def: StashDefinition<T>): StashState {
    this.#definition(def); return { pages: def.initialPages, cells: {}, invested: 0 };
  }
  pageCost(def: StashDefinition<T>, state: StashState): number {
    this.#definition(def); this.#state(def, state);
    return def.pageCostBase * (state.pages - def.initialPages + 1) ** 2;
  }
  /** Explicit compatibility view: shallow payload copies with storage coordinates.
   * Internal planning never uses this potentially expensive presentation view. */
  page(entries: readonly StashEntry<T>[], state: StashState, page: number): (T & { x: number; y: number })[] {
    const out: (T & { x: number; y: number })[] = [];
    for (const e of entries) { const c = cellAt(state, e.key); if (c?.page === page) out.push({ ...e.item, x: c.x, y: c.y }); }
    return out;
  }
  overflow(entries: readonly StashEntry<T>[], state: StashState): StashEntry<T>[] {
    return entries.filter(e => !cellAt(state, e.key));
  }
  #firstFit(def: StashDefinition<T>, entries: readonly StashEntry<T>[], state: StashState, item: T): StashCell | undefined {
    if (!def.accepts(item)) return;
    const body = this.#body(item);
    for (let page = 0; page < state.pages; page++) {
      const cell = this.#grid.firstFit(this.#page(entries, state, page), body, def.board);
      if (cell) return { page, ...cell };
    }
  }
  firstFit(def: StashDefinition<T>, entries: readonly StashEntry<T>[], state: StashState, item: T): StashCell | undefined {
    return this.#run(def, entries, () => { this.#state(def, state); return this.#firstFit(def, entries, state, item); });
  }
  /** Preserve legal saved cells first, then repair in original entry/page order.
   * Unfitted or rejected bodies remain recovery entries, never silently deleted. */
  restore(def: StashDefinition<T>, entries: readonly StashEntry<T>[], value?: Partial<StashState>): StashState {
    return this.#run(def, entries, () => {
      const state = this.empty(def);
      if (Number.isInteger(value?.pages)) state.pages = Math.max(def.initialPages, Math.min(def.maxPages, value!.pages!));
      if (Number.isSafeInteger(value?.invested)) state.invested = Math.max(0, Math.min(this.pageCost(def, state) - 1, value!.invested!));
      // These operation-local views own no payloads and grow only with actual
      // retained entries. Avoid rescanning/copying all bodies per repaired item.
      const pages: Placement[][] = Array.from({ length: state.pages }, () => []);
      for (const e of entries) {
        const c = value && cellAt(value, e.key);
        if (validCell(state, c) && def.accepts(e.item)) {
          const p = this.#body(e.item, c.x, c.y);
          if (this.#grid.canPlace(pages[c.page], p, c.x, c.y, def.board)) { put(state, e.key, c); pages[c.page].push(p); }
        }
      }
      for (const e of entries) if (!cellAt(state, e.key) && def.accepts(e.item)) {
        const p = this.#body(e.item);
        for (let page = 0; page < state.pages; page++) {
          const cell = this.#grid.firstFit(pages[page], p, def.board);
          if (cell) { p.x = cell.x; p.y = cell.y; put(state, e.key, { page, ...cell }); pages[page].push(p); break; }
        }
      }
      return state;
    });
  }
  /** A complete address plan, or undefined. The caller owns the final transfer
   * of bodies, authorization and persistence. A refusal changes no owner. */
  plan(def: StashDefinition<T>, entries: readonly StashEntry<T>[], state: StashState,
    entry: StashEntry<T>, target?: StashCell, vacate?: string): StashState | undefined {
    return this.#run(def, entries, () => {
      this.#state(def, state);
      if (typeof entry.key !== 'string' || !entry.key) throw new Error('Storage key is required');
      if (!def.accepts(entry.item)) return;
      const next: StashState = { ...state, cells: {} };
      for (const [key, cell] of Object.entries(state.cells)) defineCell(next, key, { ...cell });
      const from = cellAt(state, vacate ?? entry.key);
      delete next.cells[entry.key]; if (vacate) delete next.cells[vacate];
      const existing = entries.some(e => e.key === entry.key || e.key === vacate);
      if (!existing && entries.some(e => !cellAt(next, e.key))) return;
      const rest = entries.filter(e => e.key !== entry.key && e.key !== vacate), incoming = this.#body(entry.item);
      if (!target) {
        if (from && this.#grid.canPlace(this.#page(rest, next, from.page), incoming, from.x, from.y, def.board)) target = from;
        else target = this.#firstFit(def, rest, next, entry.item);
      }
      if (!validCell(next, target)) return;
      const page = this.#page(rest, next, target.page), blockers = this.#grid.overlapping(page, incoming, target.x, target.y);
      if (blockers.length > 1) return;
      if (blockers.length) {
        const other = rest.find(e => e.item.uid === blockers[0].uid)!;
        if (!from || vacate) return;
        delete next.cells[other.key];
        if (!this.#grid.canPlace(this.#page(rest, next, target.page), incoming, target.x, target.y, def.board)) return;
        put(next, entry.key, target);
        if (!this.#grid.canPlace(this.#page([...rest, entry], next, from.page), this.#body(other.item), from.x, from.y, def.board)) return;
        put(next, other.key, from);
      } else {
        if (!this.#grid.canPlace(page, incoming, target.x, target.y, def.board)) return;
        put(next, entry.key, target);
      }
      return next;
    });
  }
}
