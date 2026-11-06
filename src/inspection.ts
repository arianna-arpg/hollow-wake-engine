import {ItemContent} from './item-rules.js';
import {itemOperations} from './item-core.js';
import {validateItem} from './item-validation.js';
import {copySessionJSON,SessionInputError,requireSession as need,sessionArray,sessionRecord,sessionText} from './session-json.js';
import {InspectionFormat,readTerms} from './inspection-format.js';
import type {ItemInstance,AffixDef,ModLineDef,RangedLineDef} from './item-types.js';
import type {Modifier} from './types.js';
export type {InspectionTerms} from './inspection-format.js';
export {SessionInputError as InspectionInputError} from './session-json.js';

export interface ItemDescription {
  title: string; color: string; baseLine: string; reqLine: string;
  defense: {text:string;augmented:boolean}[]; implicit: string[];
  affix: {text:string;tag:string}[]; unique: string[]; flavor?: string;
  sockets?: {name:string;glyph:string;color:string;line:string}[];
  epitaph?: {name:string;lines:string[];flavor?:string};
}
export interface ModCompareRow {
  text: string; kind: 'delta'|'same'|'gain'|'loss'; delta?: number; deltaText?: string;
}
function tierTag(def: AffixDef,index: number) {
  if(def.tiers.every(t=>t.magicOnly))return 'M'+(index+1);
  if(def.tiers[index].magicOnly)return 'EX';
  let rank=0;
  for(let i=0;i<=index;i++)if(!def.tiers[i].magicOnly)rank++;
  return 'T'+rank;
}
function fold(mods: Modifier[]) {
  const out=new Map<string,{line:ModLineDef;value:number}>();
  for(const m of mods){
    need(Number.isFinite(m.value),'invalid-item-value');
    const key=JSON.stringify([m.stat,m.kind,m.fromStat,m.gauge,m.gaugeAt,m.when,[...(m.tags??[])].sort()]);
    const existing=out.get(key);
    if(!existing)out.set(key,{line:m,value:m.value});
    else if(m.kind==='more')existing.value=(1+existing.value)*(1+m.value)-1;
    else if(m.kind==='override')existing.value=m.value;
    else existing.value+=m.value;
    if(existing)need(Number.isFinite(existing.value),'invalid-item-value');
  }
  return out;
}

/** Read-only projection for inventory screens. Construct once per content pack.
 * Each call returns a detached result and takes no actor, RNG or identity port. */
export class ItemInspector {
  readonly #content: ItemContent;
  readonly #format: InspectionFormat;
  readonly #ops: ReturnType<typeof itemOperations>;
  constructor(content: ItemContent, terms: unknown) {
    need(content instanceof ItemContent,'invalid-item-content');
    this.#content=content;
    this.#format=new InspectionFormat(readTerms(terms,content.id));
    this.#ops=itemOperations(content.pack,()=>{throw new Error('Cannot mint during inspection');});
  }
  #item(input: unknown): ItemInstance {
    const value=copySessionJSON(input);
    sessionRecord(value); sessionText(value.name); sessionText(value.baseId);
    sessionArray(value.affixes,128); sessionArray(value.implicitRolls,1024);
    if(value.sockets!==undefined)sessionArray(value.sockets,128);
    if(value.uniqueRolls!==undefined)sessionArray(value.uniqueRolls,1024);
    if(value.uniqueChoices!==undefined)sessionRecord(value.uniqueChoices);
    if(value.uniqueId!==undefined)sessionText(value.uniqueId);
    for(const id of (value.sockets??[]) as unknown[])if(id!==null)sessionText(id);
    for(const a of value.affixes){
      sessionRecord(a); sessionText(a.id); sessionArray(a.rolls,1024);
      for(const flag of [a.crafted,a.locked])need(flag===undefined||typeof flag==='boolean','invalid-affix-marker');
    }
    const item=value as unknown as ItemInstance;
    try{validateItem(item,this.#content.pack);}catch{throw new SessionInputError('invalid-item');}
    return item;
  }
  inspect(input: unknown) {
    const item=this.#item(input), pack=this.#content.pack, base=pack.bases[item.baseId];
    const f=this.#format, terms=f.terms,ops=this.#ops;
    const ownStats=ops.foldOwnStats(base,item);
    const modifiers=ops.compileItemMods(item,ownStats).map(m=>{
      need(Number.isFinite(m.value),'invalid-item-value');
      const out: Modifier={stat:m.stat,kind:m.kind,value:m.value};
      if(m.tags)out.tags=[...m.tags];
      if(m.when!==undefined)out.when=m.when;
      if(m.fromStat!==undefined)out.fromStat=m.fromStat;
      if(m.gauge!==undefined)out.gauge=m.gauge;
      if(m.gaugeAt!==undefined)out.gaugeAt=m.gaugeAt;
      return out;
    });
    const breaks=pack.config.tierBreaks;
    const requiredLevel=base.category==='relic'?1:(breaks[Math.min(item.tier,breaks.length)-1]??1);
    const description: ItemDescription={
      title:item.name,color:terms.rarities[item.rarity].color,
      baseLine:ops.tieredBaseName(base,item.tier)+' · '+base.category+' · Tier '+item.tier+' · ilvl '+item.ilvl,
      reqLine:'Requires Level '+requiredLevel,
      defense:ownStats.map(s=>({text:(terms.defense[s.stat]??f.label(s.stat))+' '+f.value(s.stat,'flat',s.value),augmented:s.augmented})),
      implicit:[],affix:[],unique:[],
    };
    if(item.superior!==undefined)description.implicit.push('Superior (+'+Math.round(ops.baseBonusFor(item)*100)+'% base)');
    // One tag per affix line, including shared rolls. The core supplies all
    // rolled values in display order, including historical unique choices.
    const tags: string[]=[];
    for(const affix of item.affixes){
      const def=pack.affixes[affix.id];
      const tag=(affix.crafted?'CRAFT':tierTag(def,affix.tier))+(affix.locked?' 🔒':'');
      for(let i=0;i<def.lines.length;i++)tags.push(tag);
    }
    const implicitCount=base.implicits?.length??0;
    let row=0;
    ops.eachItemLine(base,item,(line,v)=>{
      need(Number.isFinite(v),'invalid-item-value');
      const text=(line as Partial<RangedLineDef>).text;
      if(row<implicitCount)description.implicit.push(text?text.replace('{v}',String(v)):f.line(line,v));
      else if(row-implicitCount<tags.length)description.affix.push({text:f.line(line,v),tag:tags[row-implicitCount]});
      else description.unique.push(text?f.spoken(text,line,v):f.line(line,v));
      row++;
    });
    if(item.uniqueId){
      const u=pack.uniques[item.uniqueId];
      if(u.flavor!==undefined)description.flavor=u.flavor;
      if(u.maxPerContainer!==undefined && Number.isFinite(u.maxPerContainer)){
        const limit=Math.max(0,Math.floor(u.maxPerContainer));
        description.unique.push('Limited to '+limit+' equipped '+(limit===1?'copy.':'copies.'));
      }
    }
    if(item.sockets){
      description.sockets=item.sockets.map(id=>{
        if(!id)return {glyph:'◇',color:'#5a5668',name:'Empty socket',line:'Empty — inlay a vestige'};
        const def=pack.vestiges[id],display=terms.vestiges[id];
        const effects=def.effects[base.category]??def.effects.default??[];
        return {glyph:display?.glyph??'?',color:display?.color??'#888',name:display?.name??id,line:effects.map(m=>f.line(m,m.value)).join(' · ')};
      });
      const epitaph=ops.epitaphFor(item.rarity,base.category,item.sockets);
      if(epitaph){
        const display=terms.epitaphs[epitaph.id];
        description.epitaph={...(display??{name:epitaph.id}),lines:epitaph.effects.map(m=>f.line(m,m.value))};
      }
    }
    const procReferences: {name:string;text:string}[]=[];
    const seen=new Set<string>();
    for(const m of modifiers){
      if(procReferences.length>=terms.procLimit)break;
      if(m.kind!=='flat'||m.value<=0||!m.stat.startsWith('proc_'))continue;
      const id=m.stat.slice(5),proc=terms.procs[id];
      if(proc&&!seen.has(id)){seen.add(id);procReferences.push({...proc});}
    }
    return {description,ownStats,modifiers,requiredLevel,procReferences};
  }
  compare(candidate: unknown,worn: unknown): ModCompareRow[] {
    const next=fold(this.#ops.compileItemMods(this.#item(candidate)));
    const current=fold(this.#ops.compileItemMods(this.#item(worn)));
    const rows: Record<ModCompareRow['kind'],ModCompareRow[]>={delta:[],same:[],gain:[],loss:[]};
    for(const [key,{line,value}] of next){
      const before=current.get(key),text=this.#format.line(line,value);
      if(!before){rows.gain.push({kind:'gain',text});continue;}
      const delta=value-before.value;
      need(Number.isFinite(delta),'invalid-item-value');
      if(Math.abs(delta)<=1e-9)rows.same.push({kind:'same',text});
      else rows.delta.push({kind:'delta',text,delta,deltaText:(delta>0?'+':'−')+this.#format.value(line.stat,line.kind,Math.abs(delta))});
    }
    for(const [key,{line,value}] of current)if(!next.has(key))rows.loss.push({kind:'loss',text:this.#format.line(line,value)});
    return [...rows.delta,...rows.same,...rows.gain,...rows.loss];
  }
}
