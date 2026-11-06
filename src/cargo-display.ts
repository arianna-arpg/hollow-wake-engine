import {copySessionJSON,requireSession as need,sessionFields,sessionInteger,sessionRecord,sessionText} from './session-json.js';
import type {RoughMemoryUnit} from './item-types.js';

export interface CargoDisplayConfig {
  schemaVersion:1; skillContentId:string; craftingContentId:string;
  kinds:Record<string,{base:string;name:string;color:string;facets:boolean}>;
  attributes:Record<string,string>; sources:Record<string,string>; found:string;
  maxGroups:number; confirmFrom:number; pinned:string;
}
export type CargoTable='skills'|'supports'|'monsters';
export interface CargoReference {table:CargoTable; id:string; page:number}
export type CargoReader=(reference:CargoReference)=>unknown;
export interface CargoRange {offset:number;length:number;sha256:string}
export type CargoPageLoader=(index:number,range:Readonly<CargoRange>)=>string;
export interface SkillFace {description:string; tags:string[]; requirements?:Record<string,number>}
export interface SupportFace {color:string;description:string;axes?:{id:string;rows:{id:string;line:string}[]}[]}

export function cargoReference(table:CargoTable,id:string):CargoReference {
  // Hash Unicode scalar values so native, web and tool-side readers agree.
  // The 32-page scheme is part of display format v1.
  let page=0;
  for(const character of id)page=(31*page+character.codePointAt(0)!)&31;
  return {table,id,page};
}
/** The host owns the bytes and I/O. A trusted loader returns UTF-8 decoded
 * JSON for the exact range; sha256 is provided for integrity verification.
 * The working set is bounded to 1–4 pages. Failed reads leave the cache intact. */
export class CargoAtlas {
  readonly config:unknown;
  readonly #ranges:CargoRange[];
  readonly #load:CargoPageLoader;
  readonly #capacity:number;
  readonly #recent=new Map<number,Record<string,Record<string,unknown>>>();
  #last=-1;
  #page:Record<string,Record<string,unknown>>|null=null;
  constructor(manifest:unknown,load:CargoPageLoader,maxPages=4){
    sessionInteger(maxPages,1,4);this.#capacity=maxPages;
    const m=copySessionJSON(manifest);sessionFields(m,['format','config','bytes','sha256','pages']);
    need(m.format==='cargo-display-pages/v1'&&typeof load==='function','invalid-cargo-atlas');
    need(typeof m.sha256==='string'&&/^[0-9a-f]{64}$/.test(m.sha256),'invalid-content-digest');
    sessionInteger(m.bytes,1,32*32768);need(Array.isArray(m.pages)&&m.pages.length===32,'invalid-page-count');
    let offset=0;
    this.#ranges=m.pages.map(row=>{
      sessionFields(row,['offset','length','sha256']);sessionInteger(row.length,1,32768);
      need(row.offset===offset&&typeof row.sha256==='string'&&/^[0-9a-f]{64}$/.test(row.sha256),'invalid-page-range');
      const range=Object.freeze({offset,length:row.length,sha256:row.sha256});offset+=row.length;return range;
    });
    need(offset===m.bytes,'invalid-atlas-length');this.config=m.config;this.#load=load;
  }
  readonly read:CargoReader=({table,id,page})=>{
    need(['skills','supports','monsters'].includes(table)&&page===cargoReference(table,id).page,'invalid-page-reference');
    if(page!==this.#last){
      let rows=this.#recent.get(page);
      if(rows)this.#recent.delete(page);
      else{
        rows=this.#fetch(page);
        if(this.#recent.size===this.#capacity)this.#recent.delete(this.#recent.keys().next().value!);
      }
      this.#recent.set(page,rows);
      this.#page=rows;this.#last=page;
    }
    const rows=this.#page![table];
    // Decoded rows belong to the cache. The public reader returns a detached
    // projection, also guarding prototype keys in retired/custom content.
    return Object.hasOwn(rows,id)?copySessionJSON(rows[id]):null;
  };
  #fetch(page:number):Record<string,Record<string,unknown>> {
    const range=this.#ranges[page],text=this.#load(page,range);
    need(typeof text==='string'&&text.length<=range.length,'invalid-display-page');
    let parsed:unknown;
    try{parsed=JSON.parse(text);}catch{need(false,'invalid-display-json');}
    sessionFields(parsed,['skills','supports','monsters']);
    for(const k of ['skills','supports','monsters'] as const){
      const table=parsed[k];sessionRecord(table);
      for(const key of Object.keys(table))need(cargoReference(k,key).page===page,'wrong-display-page');
    }
    return parsed as Record<string,Record<string,unknown>>;
  }
}
function displayText(value:unknown):asserts value is string {
  need(typeof value==='string'&&value.length<=16384,'invalid-display-text');
}
export function readDisplayConfig(input:unknown,skills:string,crafting:string):CargoDisplayConfig {
  const value=copySessionJSON(input);
  sessionFields(value,['schemaVersion','skillContentId','craftingContentId','kinds','attributes','sources','found','maxGroups','confirmFrom','pinned']);
  need(value.schemaVersion===1 && value.skillContentId===skills && value.craftingContentId===crafting,'cargo-content-mismatch');
  sessionInteger(value.maxGroups,1,32);sessionInteger(value.confirmFrom,1);sessionText(value.pinned);sessionText(value.found);
  for(const field of [value.attributes,value.sources]){
    sessionRecord(field);
    for(const [id,label] of Object.entries(field)){sessionText(id);sessionText(label);}
  }
  need(Object.hasOwn(value.sources as object,value.found),'missing-provenance-fallback');
  sessionRecord(value.kinds);
  const bases=new Set<string>();
  for(const [id,k] of Object.entries(value.kinds)){
    sessionText(id);sessionFields(k,['base','name','color','facets']);sessionText(k.base);sessionText(k.name);sessionText(k.color);
    need(typeof k.facets==='boolean'&&!bases.has(k.base),'invalid-pouch-kind');bases.add(k.base);
  }
  return value as unknown as CargoDisplayConfig;
}
export function skillFace(read:CargoReader,id:string):SkillFace|null {
  const raw=read(cargoReference('skills',id));if(raw===null)return null;
  const row=copySessionJSON(raw);sessionFields(row,['description','tags','requirements']);
  displayText(row.description);need(Array.isArray(row.tags)&&row.tags.length<=128,'invalid-skill-tags');row.tags.forEach(sessionText);
  if(row.requirements!==undefined){
    sessionRecord(row.requirements);
    for(const [key,n] of Object.entries(row.requirements)){sessionText(key);sessionInteger(n);}
  }
  return row as unknown as SkillFace;
}
export function supportFace(read:CargoReader,id:string):SupportFace|null {
  const raw=read(cargoReference('supports',id));if(raw===null)return null;
  const row=copySessionJSON(raw);sessionFields(row,['color','description','axes']);sessionText(row.color);displayText(row.description);
  if(row.axes!==undefined){
    need(Array.isArray(row.axes)&&row.axes.length<=128,'invalid-cut-axes');
    const seen=new Set<string>();
    for(const axis of row.axes){
      sessionFields(axis,['id','rows']);sessionText(axis.id);
      need(!seen.has(axis.id)&&Array.isArray(axis.rows)&&axis.rows.length<=256,'invalid-cut-axis');seen.add(axis.id);
      const ids=new Set<string>();
      for(const r of axis.rows){sessionFields(r,['id','line']);sessionText(r.id);displayText(r.line);need(!ids.has(r.id),'duplicate-cut-row');ids.add(r.id);}
    }
  }
  return row as unknown as SupportFace;
}
export function provenance(id:string,config:CargoDisplayConfig,read:CargoReader):string {
  const name=read(cargoReference('monsters',id));
  if(name!==null){sessionText(name);return name;}
  if(Object.hasOwn(config.sources,id))return config.sources[id];
  if(id.startsWith('[')){
    let address:unknown;
    try{address=JSON.parse(id);}catch{/* Unrecognized durable address. */}
    if(Array.isArray(address)&&address.length===2&&typeof address[0]==='string'&&address[1]==='cache'&&config.sources.chest)return config.sources.chest;
  }
  return config.sources[config.found];
}
export function pouchGroupKey(unit:RoughMemoryUnit):string {
  return unit.g?unit.d+'|'+unit.g.k+':'+unit.g.id:unit.d;
}
/** Count every distinct FIFO address, retaining bodies only for visible rows. */
export function pouchGroups(units:readonly RoughMemoryUnit[],limit:number) {
  const rows:{key:string;unit:RoughMemoryUnit;count:number}[]=[];
  const seen=new Map<string,number>();
  for(const unit of units){
    const key=pouchGroupKey(unit);
    const previous=seen.get(key);
    if(previous!==undefined){if(previous<rows.length)rows[previous].count++;continue;}
    const index=seen.size;seen.set(key,index);
    if(index<limit)rows.push({key,unit,count:1});
  }
  return {rows,hidden:seen.size-rows.length};
}
