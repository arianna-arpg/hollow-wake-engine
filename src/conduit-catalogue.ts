import {type ConduitSpec,validateConduitSpec} from './conduit-content.js';
import type {ConduitRules} from './conduits.js';
import {finite} from './validation.js';

export type ConduitSource = 'skill'|'support'|'tree'|'passive'|'choice';
export interface ConduitEntry {
  source: ConduitSource; id: string; owner?: string; pumps: readonly ConduitSpec[];
}
export interface ConduitPack {
  version: 1;
  rules: ConduitRules;
  entries: readonly ConduitEntry[];
}
const empty: readonly ConduitSpec[] = Object.freeze([]);
const sources = new Set<ConduitSource>(['skill','support','tree','passive','choice']);
function fields(value: object, allowed: readonly string[]): void {
  for(const key of Object.keys(value))if(!allowed.includes(key))throw new Error('Unknown conduit catalogue field: '+key);
}
function identity(value: string): void {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('Invalid conduit identity');
}
/** Owns detached, immutable source rows. Resolve a loadout again when its admitted
 * supports, passive grafts, or invested node occurrences change. */
export class ConduitCatalogue {
  readonly rules: Readonly<ConduitRules>;
  readonly #rows = new Map<string,readonly ConduitSpec[]>();
  constructor(pack: ConduitPack) {
    fields(pack,['version','rules','entries']);
    if (pack.version !== 1 || !Array.isArray(pack.entries)) throw new Error('Unsupported conduit catalogue');
    fields(pack.rules,['floor','lifeFloor','minRoom']);
    const {floor,lifeFloor,minRoom}=pack.rules;
    for (const fraction of [floor,lifeFloor]) {
      if (finite(fraction,'Conduit reserve')<0 || fraction>1) throw new Error('Invalid conduit reserve');
    }
    if (finite(minRoom,'Conduit room threshold')<0) throw new Error('Negative conduit room threshold');
    this.rules=Object.freeze({floor,lifeFloor,minRoom});
    for (const entry of pack.entries as readonly ConduitEntry[]) {
      fields(entry,['source','id','owner','pumps']);
      if (!sources.has(entry.source) || !Array.isArray(entry.pumps) || !entry.pumps.length) throw new Error('Invalid conduit entry');
      identity(entry.id);
      if (entry.source==='tree' || entry.source==='choice') identity(entry.owner!);
      else if (entry.owner!==undefined) throw new Error('Unexpected conduit owner');
      const key=this.#key(entry.source,entry.id,entry.owner);
      if (this.#rows.has(key)) throw new Error('Duplicate conduit entry');
      const pumps=entry.pumps.map(spec=>{
        const owned={...spec};
        validateConduitSpec(owned);
        return Object.freeze(owned);
      });
      this.#rows.set(key,Object.freeze(pumps));
    }
  }
  #key(source:ConduitSource,id:string,owner=''):string {return source+'\0'+owner+'\0'+id;}
  get(source:ConduitSource,id:string,owner?:string):readonly ConduitSpec[] {
    if(id.includes('\0') || owner?.includes('\0'))return empty;
    return this.#rows.get(this.#key(source,id,owner))??empty;
  }
  forSkill(skillId:string,admittedSupportIds:readonly string[],investedNodes:readonly string[]):readonly ConduitSpec[] {
    const innate=this.get('skill',skillId);
    if(!admittedSupportIds.length&&!investedNodes.length)return innate;
    const result=[...innate];
    for(const id of admittedSupportIds)for(const pump of this.get('support',id))result.push(pump);
    for(const id of investedNodes)for(const pump of this.get('tree',id,skillId))result.push(pump);
    return result.length?Object.freeze(result):empty;
  }
}
