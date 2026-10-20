import { copy, freeze, integer } from './validation.js';

export type InventoryData = null | boolean | number | string | InventoryData[] | { [key: string]: InventoryData };
export interface InventoryBoard { w: number; h: number; /** Row-major '#' open / '.' closed cells. */ rows?: string[] }
export interface InventoryItem { id: string; w: number; h: number; data: InventoryData }
export interface InventoryEntry extends InventoryItem { x: number; y: number }
export interface InventorySnapshot { version: 1; board: InventoryBoard; items: InventoryEntry[] }
export type InventoryMove = 'moved' | 'swapped' | 'blocked' | 'missing';

function dimensions(w: number, h: number): void {
  integer(w, 1, 'Width'); integer(h, 1, 'Height');
  if (w > 256 || h > 256 || w * h > 4096) throw new Error('Inventory exceeds 4096 cells or 256 cells per axis');
}
function json(value: InventoryData, depth = 0, ancestors = new Set<object>()): void {
  if (depth > 64) throw new Error('Inventory payload exceeds 64 levels');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') throw new Error('Inventory payload must be JSON data');
  if (ancestors.has(value)) throw new Error('Inventory payload contains a cycle');
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Inventory payload must be plain data');
  if (Object.getOwnPropertySymbols(value).length) throw new Error('Inventory payload contains symbols');
  ancestors.add(value);
  if (Array.isArray(value)) {
    if (Object.getOwnPropertyNames(value).length !== value.length + 1) throw new Error('Inventory arrays must be dense and contain only indexes');
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new Error('Inventory arrays must contain plain values');
      json(descriptor.value, depth + 1, ancestors);
    }
  }
  else for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!('value' in descriptor) || !descriptor.enumerable) throw new Error('Inventory payload contains accessors or hidden properties');
    json(descriptor.value, depth + 1, ancestors);
  }
  ancestors.delete(value);
}

/** Owns one grid, item identities, copied payloads and an integer occupancy index.
 * No host callbacks run inside a transaction. Invalid input throws; legal but
 * unavailable placements return false/blocked without changing state.
 */
export class Inventory {
  #board: InventoryBoard;
  #cells: Int32Array;
  #entries: (InventoryEntry | null)[] = [null];
  #ids = new Map<string, number>();
  #free: number[] = [];
  constructor(board: InventoryBoard) {
    dimensions(board.w, board.h);
    if (board.rows && (board.rows.length !== board.h || board.rows.some(row => typeof row !== 'string' || row.length !== board.w || /[^#.]/.test(row)))) {
      throw new Error('Inventory mask must match board dimensions and contain only # or .');
    }
    this.#board = copy(board);
    this.#cells = new Int32Array(board.w * board.h);
    if (board.rows) for (let y = 0; y < board.h; y++) for (let x = 0; x < board.w; x++) {
      if (board.rows[y][x] === '.') this.#cells[y * board.w + x] = -1;
    }
  }
  get size(): number { return this.#ids.size; }
  get board(): InventoryBoard { return copy(this.#board); }
  has(id: string): boolean { return this.#ids.has(id); }
  get(id: string): InventoryEntry | undefined {
    const handle = this.#ids.get(id);
    return handle === undefined ? undefined : copy(this.#entries[handle]!);
  }
  at(x: number, y: number): string | undefined {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new Error('Cell coordinates must be integers');
    if (x < 0 || y < 0 || x >= this.#board.w || y >= this.#board.h) return undefined;
    const handle = this.#cells[y * this.#board.w + x];
    return handle > 0 ? this.#entries[handle]!.id : undefined;
  }
  #bounds(x: number, y: number, w: number, h: number): boolean {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new Error('Cell coordinates must be integers');
    return x >= 0 && y >= 0 && x + w <= this.#board.w && y + h <= this.#board.h;
  }
  #fits(x: number, y: number, w: number, h: number, ignore = 0, ignoreOther = 0): boolean {
    if (!this.#bounds(x, y, w, h)) return false;
    for (let dy = y; dy < y + h; dy++) for (let dx = x; dx < x + w; dx++) {
      const cell = this.#cells[dy * this.#board.w + dx];
      if (cell !== 0 && cell !== ignore && cell !== ignoreOther) return false;
    }
    return true;
  }
  #paint(item: InventoryEntry, handle: number): void {
    for (let y = item.y; y < item.y + item.h; y++) for (let x = item.x; x < item.x + item.w; x++) this.#cells[y * this.#board.w + x] = handle;
  }
  canPlace(id: string, x: number, y: number): boolean {
    const handle = this.#ids.get(id);
    if (handle === undefined) return false;
    const item = this.#entries[handle]!;
    return this.#fits(x, y, item.w, item.h, handle);
  }
  /** Add a new identity; absent coordinates choose the first row-major hole. */
  insert(item: InventoryItem, x?: number, y?: number): boolean {
    return this.#insert(item, x, y);
  }
  #insert(item: InventoryItem, x?: number, y?: number): boolean {
    if (typeof item.id !== 'string' || !item.id.length || item.id.length > 256) throw new Error('Item identity must contain 1..256 characters');
    dimensions(item.w, item.h);
    if (this.#ids.has(item.id)) return false;
    if ((x === undefined) !== (y === undefined)) throw new Error('Both coordinates are required');
    if (x === undefined) {
      let found = false;
      for (let row = 0; row <= this.#board.h - item.h && !found; row++) for (let col = 0; col <= this.#board.w - item.w; col++) {
        if (this.#fits(col, row, item.w, item.h)) { x = col; y = row; found = true; break; }
      }
      if (!found) return false;
    } else if (!this.#fits(x, y!, item.w, item.h)) return false;
    json(item.data);
    // All validation/copying precedes writes, including ownership transfer.
    const entry: InventoryEntry = { id: item.id, w: item.w, h: item.h, data: freeze(copy(item.data)), x: x!, y: y! };
    const handle = this.#free.pop() ?? this.#entries.length;
    this.#entries[handle] = entry; this.#ids.set(item.id, handle); this.#paint(entry, handle);
    return true;
  }
  /** Re-place; optional single-blocker exchange into the vacated origin. */
  move(id: string, x: number, y: number, swap = true): InventoryMove {
    const handle = this.#ids.get(id);
    if (handle === undefined) return 'missing';
    const item = this.#entries[handle]!;
    if (this.#fits(x, y, item.w, item.h, handle)) {
      this.#paint(item, 0); item.x = x; item.y = y; this.#paint(item, handle); return 'moved';
    }
    if (!swap || !this.#bounds(x, y, item.w, item.h)) return 'blocked';
    let blocker = 0;
    for (let dy = y; dy < y + item.h; dy++) for (let dx = x; dx < x + item.w; dx++) {
      const cell = this.#cells[dy * this.#board.w + dx];
      if (cell === -1 || (cell !== 0 && cell !== handle && blocker !== 0 && cell !== blocker)) return 'blocked';
      if (cell > 0 && cell !== handle) blocker = cell;
    }
    if (blocker === 0) return 'blocked';
    const other = this.#entries[blocker]!;
    if (!this.#fits(item.x, item.y, other.w, other.h, handle, blocker)) return 'blocked';
    if (item.x < x + item.w && x < item.x + other.w && item.y < y + item.h && y < item.y + other.h) return 'blocked';
    this.#paint(item, 0); this.#paint(other, 0);
    other.x = item.x; other.y = item.y; item.x = x; item.y = y;
    this.#paint(item, handle); this.#paint(other, blocker); return 'swapped';
  }
  #delete(id: string, handle: number): void {
    this.#paint(this.#entries[handle]!, 0); this.#entries[handle] = null;
    this.#ids.delete(id); this.#free.push(handle);
  }
  remove(id: string): InventoryItem | undefined {
    const handle = this.#ids.get(id);
    if (handle === undefined) return undefined;
    const { x: _x, y: _y, ...item } = copy(this.#entries[handle]!);
    this.#delete(id, handle); return item;
  }
  /** Atomic synchronous transfer. Policy (trade/quest/locked/equipment) is host-owned. */
  transferTo(destination: Inventory, id: string, x?: number, y?: number): boolean {
    if (destination === this) throw new Error('Use move for the same inventory');
    const handle = this.#ids.get(id);
    if (handle === undefined) return false;
    if (!destination.#insert(this.#entries[handle]!, x, y)) return false;
    this.#delete(id, handle); return true;
  }
  /** Resize/unlock a board only if all existing placements remain valid. */
  reconfigure(board: InventoryBoard): boolean {
    const next = new Inventory(board);
    for (const handle of this.#ids.values()) {
      const item = this.#entries[handle]!;
      if (!next.#insert(item, item.x, item.y)) return false;
    }
    this.#board = next.#board; this.#cells = next.#cells;
    this.#entries = next.#entries; this.#ids = next.#ids; this.#free = next.#free;
    return true;
  }
  snapshot(): InventorySnapshot {
    return { version: 1, board: this.board, items: [...this.#ids.values()].map(handle => copy(this.#entries[handle]!)) };
  }
  static restore(snapshot: InventorySnapshot): Inventory {
    if (snapshot.version !== 1 || !Array.isArray(snapshot.items)) throw new Error('Unsupported inventory snapshot');
    const inventory = new Inventory(snapshot.board);
    if (snapshot.items.length > snapshot.board.w * snapshot.board.h) throw new Error('Too many inventory entries');
    for (const item of snapshot.items) {
      if (item.x === undefined || item.y === undefined || !inventory.insert(item, item.x, item.y)) throw new Error(`Invalid inventory placement: ${item.id}`);
    }
    return inventory;
  }
}
