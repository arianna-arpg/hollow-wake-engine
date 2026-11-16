/** A controller may borrow a stable list or follow its simulation owner's
 * replacement list. Reading the owner preserves reentrant retirement order. */
export type LiveList<T> = T[] | (() => T[]);
export function readList<T>(list: LiveList<T>): T[] {
  return typeof list === 'function' ? list() : list;
}
