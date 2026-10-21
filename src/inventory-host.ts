import { integer } from './validation.js';

export interface LiveInventoryItem { uid: string | number; x?: number; y?: number }
export interface InventoryFootprint { w: number; h: number }
/** Explicit synchronous read port; open/size must be pure during an operation. */
export interface LiveInventoryBoard extends InventoryFootprint { open?: (x: number, y: number) => boolean }

function dimensions(w: number, h: number): void {
  integer(w, 1, 'Inventory width'); integer(h, 1, 'Inventory height');
  if (w > 256 || h > 256 || w * h > 4096) throw new Error('Inventory exceeds 4096 cells or 256 cells per axis');
}
function coordinates(x: number, y: number): void {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new Error('Inventory coordinates must be safe integers');
}
function overlap(x: number, y: number, w: number, h: number, ox: number, oy: number, ow: number, oh: number): boolean {
  return ox < x + w && x < ox + ow && oy < y + h && y < oy + oh;
}
function placed(item: LiveInventoryItem): item is LiveInventoryItem & { x: number; y: number } { return item.x !== undefined && item.y !== undefined; }

/** Live item records remain host-owned. No payload copies, retained bag, cached
 * placements or global board source. All host reads precede mutation. Port code
 * must not mutate/reenter this host; an occupancy buffer is reused only inside
 * first-fit operations. Strict owned inventory/save loading is a separate API.
 */
export class InventoryHost<T extends LiveInventoryItem> {
  #occupied = new Uint8Array(0);
  #finding = false;
  constructor(private readonly sizeOf: (item: T) => InventoryFootprint) {
    if (typeof sizeOf !== 'function') throw new Error('Inventory footprint port is required');
  }
  get scratchBytes(): number { return this.#occupied.byteLength; }
  #size(item: T): InventoryFootprint { const size = this.sizeOf(item); dimensions(size.w, size.h); return size; }
  #open(board: LiveInventoryBoard, x: number, y: number, w: number, h: number): boolean {
    if (x < 0 || y < 0 || x + w > board.w || y + h > board.h) return false;
    if (board.open) for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (!board.open(x + dx, y + dy)) return false;
    return true;
  }
  footprintOpen(board: LiveInventoryBoard, x: number, y: number, w: number, h: number): boolean {
    dimensions(board.w, board.h); dimensions(w, h); coordinates(x, y);
    return this.#open(board, x, y, w, h);
  }
  itemAt(bag: readonly T[], x: number, y: number): T | undefined {
    coordinates(x, y);
    for (const item of bag) if (placed(item)) {
      const s = this.#size(item);
      if (overlap(x, y, 1, 1, item.x, item.y, s.w, s.h)) return item;
    }
    return undefined;
  }
  overlapping(bag: readonly T[], item: T, x: number, y: number): T[] {
    coordinates(x, y); const s = this.#size(item), out: T[] = [];
    for (const other of bag) if (other.uid !== item.uid && placed(other)) {
      const os = this.#size(other);
      if (overlap(x, y, s.w, s.h, other.x, other.y, os.w, os.h)) out.push(other);
    }
    return out;
  }
  #fits(bag: readonly T[], item: T, x: number, y: number, s: InventoryFootprint, board: LiveInventoryBoard, ignore?: T): boolean {
    if (!this.#open(board, x, y, s.w, s.h)) return false;
    for (const other of bag) if (other.uid !== item.uid && other.uid !== ignore?.uid && placed(other)) {
      const os = this.#size(other);
      if (overlap(x, y, s.w, s.h, other.x, other.y, os.w, os.h)) return false;
    }
    return true;
  }
  canPlace(bag: readonly T[], item: T, x: number, y: number, board: LiveInventoryBoard): boolean {
    dimensions(board.w, board.h); coordinates(x, y);
    return this.#fits(bag, item, x, y, this.#size(item), board);
  }
  swapBlocker(bag: readonly T[], item: T, x: number, y: number, board: LiveInventoryBoard): T | null {
    dimensions(board.w, board.h); coordinates(x, y); const s = this.#size(item);
    if (!placed(item) || !this.#open(board, x, y, s.w, s.h)) return null;
    let blocker: T | null = null;
    for (const other of bag) if (other.uid !== item.uid && placed(other)) {
      const os = this.#size(other);
      if (overlap(x, y, s.w, s.h, other.x, other.y, os.w, os.h)) {
        if (blocker) return null;
        blocker = other;
      }
    }
    if (!blocker) return null;
    const bs = this.#size(blocker);
    if (!this.#fits(bag, blocker, item.x, item.y, bs, board, item)) return null;
    // Both final footprints must fit simultaneously, including unequal sizes.
    return overlap(x, y, s.w, s.h, item.x, item.y, bs.w, bs.h) ? null : blocker;
  }
  place(bag: T[], item: T, x: number, y: number, board: LiveInventoryBoard): boolean {
    if (!this.canPlace(bag, item, x, y, board)) return false;
    item.x = x; item.y = y;
    if (!bag.some(other => other.uid === item.uid)) bag.push(item);
    return true;
  }
  /** One freshly built grid per operation. External edits are observed on every call. */
  firstFit(bag: readonly T[], item: T, board: LiveInventoryBoard): { x: number; y: number } | null {
    if (this.#finding) throw new Error('Reentrant inventory first-fit');
    this.#finding = true;
    try {
      dimensions(board.w, board.h); const s = this.#size(item);
      if (s.w > board.w || s.h > board.h) return null;
      if (!bag.length && !board.open) return { x: 0, y: 0 };
      const cells = board.w * board.h;
      if (this.#occupied.length < cells) this.#occupied = new Uint8Array(cells);
      const occupied = this.#occupied; occupied.fill(0, 0, cells);
      if (board.open) for (let y = 0; y < board.h; y++) for (let x = 0; x < board.w; x++) if (!board.open(x, y)) occupied[y * board.w + x] = 1;
      for (const other of bag) if (other.uid !== item.uid && placed(other)) {
        coordinates(other.x, other.y); const os = this.#size(other);
        // Retuned boards can leave old pieces outside their new bounds.
        const right = Math.min(board.w, other.x + os.w), bottom = Math.min(board.h, other.y + os.h);
        for (let y = Math.max(0, other.y); y < bottom; y++) for (let x = Math.max(0, other.x); x < right; x++) occupied[y * board.w + x] = 1;
      }
      for (let y = 0; y <= board.h - s.h; y++) for (let x = 0; x <= board.w - s.w; x++) {
        let free = true;
        for (let dy = 0; dy < s.h && free; dy++) for (let dx = 0; dx < s.w; dx++) if (occupied[(y + dy) * board.w + x + dx]) { free = false; break; }
        if (free) return { x, y };
      }
      return null;
    } finally { this.#finding = false; }
  }
  autoPlace(bag: T[], item: T, board: LiveInventoryBoard): boolean {
    const cell = this.firstFit(bag, item, board);
    if (!cell) return false;
    item.x = cell.x; item.y = cell.y;
    if (!bag.some(other => other.uid === item.uid)) bag.push(item);
    return true;
  }
  remove(bag: T[], uid: string | number): T | undefined {
    const at = bag.findIndex(item => item.uid === uid);
    if (at < 0) return undefined;
    const [item] = bag.splice(at, 1); delete item.x; delete item.y; return item;
  }
}
