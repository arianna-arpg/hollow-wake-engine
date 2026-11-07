import {copy,freeze,finite} from './validation.js';
import {validateModifier} from './stat-rules.js';
import type {Modifier} from './types.js';
import {matchEpitaph} from './vestige-rules.js';
export interface VestigeDefinition {id:string;name:string;letter:string;glyph:string;color:string;weight:number;effects:Record<string,Modifier[]>}
export interface EpitaphDefinition {id:string;name:string;flavor:string;sequence:string[];categories:string[];effects:Modifier[]}
export interface VestigePack {version:1;vestiges:VestigeDefinition[];epitaphs:EpitaphDefinition[]}
function text(value:string){if(typeof value!=='string'||!value.trim())throw new Error('Invalid vestige text');}
function identity(id:string){text(id);if(['constructor','prototype','__proto__'].includes(id))throw new Error('Reserved vestige identity');}
function lines(rows:Modifier[]){
  if(!Array.isArray(rows))throw new Error('Invalid vestige modifiers');
  for(const row of rows){
    if(!Object.keys(row).every(k=>['stat','kind','value','tags','when'].includes(k)))throw new Error('Unsupported vestige modifier');
    text(row.stat);validateModifier(row);
    if(row.tags!==undefined){if(!Array.isArray(row.tags))throw new Error('Invalid vestige tags');row.tags.forEach(text);}
    if(row.when!==undefined)text(row.when);
  }
}
/** A detached, shareable catalogue for hosts without Hollow Wake's existing item registry. */
export class VestigeCatalogue {
  readonly pack:VestigePack;
  readonly #stones=new Map<string,VestigeDefinition>();
  constructor(input:VestigePack){
    const data=copy(input);
    if(data.version!==1||!Array.isArray(data.vestiges)||!Array.isArray(data.epitaphs))throw new Error('Invalid vestige catalogue');
    for(const row of data.vestiges){
      identity(row.id);[row.name,row.letter,row.glyph,row.color].forEach(text);
      if(this.#stones.has(row.id)||finite(row.weight,'Vestige weight')<0)throw new Error('Invalid vestige definition');
      if(!row.effects||typeof row.effects!=='object'||Array.isArray(row.effects))throw new Error('Invalid vestige effects');
      Object.setPrototypeOf(row.effects,null);
      for(const [category,mods] of Object.entries(row.effects)){identity(category);lines(mods);}
      this.#stones.set(row.id,row);
    }
    const words=new Set<string>();
    for(const word of data.epitaphs){
      identity(word.id);text(word.name);text(word.flavor);
      if(words.has(word.id)||!Array.isArray(word.sequence)||!word.sequence.length||
        !word.sequence.every(id=>this.#stones.has(id))||!Array.isArray(word.categories)||!word.categories.length)throw new Error('Invalid epitaph');
      word.categories.forEach(identity);lines(word.effects);words.add(word.id);
    }
    this.pack=freeze(data);Object.freeze(this);
  }
  vestige(id:string){return this.#stones.get(id);}
  word(rarity:string,category:string,sockets:readonly (string|null)[]){return matchEpitaph(this.pack.epitaphs,rarity,category,sockets);}
  modifiers(rarity:string,category:string,sockets:readonly (string|null)[]):readonly Modifier[]{
    const result:Modifier[]=[];
    for(const id of sockets){
      const row=id?this.vestige(id):undefined;
      for(const line of row?.effects[category]??row?.effects.default??[])result.push(line);
    }
    for(const line of this.word(rarity,category,sockets)?.effects??[])result.push(line);
    return result;
  }
}
