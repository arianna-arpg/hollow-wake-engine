import {decodeContentTable,CONTENT_TABLE_LIMITS,type ContentTable,type ContentTableNode} from './content-table.js';

/** Build-time compiler: intern exact ordered values without selecting out any
 * gameplay rows. Keep this optional entry out of the runtime loading path. */
export function encodeContentTable(value: unknown): ContentTable {
  const nodes: ContentTableNode[] = [], interned = new Map<string,number>(), active = new Set<object>(); let visited = 0;
  function visit(row: unknown, depth = 0): number {
    if (++visited > CONTENT_TABLE_LIMITS.expandedValues || depth > CONTENT_TABLE_LIMITS.depth) throw new Error('Content compiler traversal limit');
    let node: ContentTableNode;
    if (row === null || typeof row === 'boolean' || typeof row === 'string' || typeof row === 'number' && Number.isFinite(row)) node = Object.is(row,-0) ? [3] : [0,row];
    else {
      if (!row || typeof row !== 'object' || Object.getOwnPropertySymbols(row).length) throw new Error('Content compiler requires JSON data');
      if (active.has(row)) throw new Error('Content compiler refuses cycles'); active.add(row);
      if (Array.isArray(row)) {
        if (Object.getPrototypeOf(row) !== Array.prototype || Object.getOwnPropertyNames(row).length !== row.length + 1) throw new Error('Content compiler requires dense arrays');
        const refs: [1,...number[]] = [1];
        for (let index = 0; index < row.length; index++) {
          const d = Object.getOwnPropertyDescriptor(row,String(index));
          if (!d || !('value' in d) || !d.enumerable) throw new Error('Content compiler requires plain values');
          refs.push(visit(d.value,depth + 1));
        }
        node = refs;
      } else {
        if (![Object.prototype,null].includes(Object.getPrototypeOf(row))) throw new Error('Content compiler requires plain objects');
        const refs: [2,...number[]] = [2];
        for (const key of Object.getOwnPropertyNames(row)) {
          const d = Object.getOwnPropertyDescriptor(row,key)!;
          if (!('value' in d) || !d.enumerable) throw new Error('Content compiler requires plain values');
          refs.push(visit(key,depth + 1),visit(d.value,depth + 1));
        }
        node = refs;
      }
      active.delete(row);
    }
    const key = JSON.stringify(node), known = interned.get(key); if (known !== undefined) return known;
    if (nodes.length >= CONTENT_TABLE_LIMITS.nodes) throw new Error('Content compiler node limit');
    const index = nodes.length; nodes.push(node); interned.set(key,index); return index;
  }
  const root = visit(value), table: ContentTable = {schemaVersion:1,capability:'content-table/v1',root,nodes};
  decodeContentTable(table); return table;
}
