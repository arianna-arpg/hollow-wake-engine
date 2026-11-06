import type {ModKind,ModLineDef,ItemRarity} from './item-types.js';
import {copySessionJSON,requireSession as need,sessionFields,sessionRecord,sessionInteger,sessionText} from './session-json.js';

export interface InspectionTerms {
  schemaVersion: 1; itemsId: string; grantPrefix: string; localSuffix: string;
  stats: Record<string,[string,boolean]>; grafts: Record<string,[string,number]>;
  conditions: Record<string,string>; gauges: Record<string,string>; defense: Record<string,string>;
  rarities: Record<ItemRarity,{label:string;color:string}>;
  vestiges: Record<string,{name:string;glyph:string;color:string}>;
  epitaphs: Record<string,{name:string;flavor?:string}>;
  procLimit: number; procs: Record<string,{name:string;text:string}>;
}

function records(input: unknown, check: (row: unknown)=>void) {
  sessionRecord(input);
  for (const [id,row] of Object.entries(input)) {sessionText(id); check(row);}
}
function textFields(row: unknown, keys: string[]) {
  sessionFields(row,keys);
  for (const key of keys) sessionText(row[key]);
}
export function readTerms(input: unknown, itemsId: string): InspectionTerms {
  const t=copySessionJSON(input);
  sessionFields(t,['schemaVersion','itemsId','grantPrefix','localSuffix','stats','grafts','conditions','gauges','defense','rarities','vestiges','epitaphs','procLimit','procs']);
  need(t.schemaVersion===1 && t.itemsId===itemsId,'inspection-content-mismatch');
  sessionText(t.grantPrefix); sessionText(t.localSuffix); sessionInteger(t.procLimit,0,64);
  records(t.stats,row=>{
    need(Array.isArray(row) && row.length===2 && typeof row[1]==='boolean','invalid-stat-label');
    sessionText(row[0]);
  });
  records(t.grafts,row=>{
    need(Array.isArray(row) && row.length===2,'invalid-graft-label');
    sessionText(row[0]); sessionInteger(row[1],1);
  });
  for(const dict of [t.conditions,t.gauges,t.defense]) records(dict,sessionText);
  sessionFields(t.rarities,['common','magic','rare','unique']);
  for(const rarity of ['common','magic','rare','unique']) textFields(t.rarities[rarity],['label','color']);
  records(t.vestiges,row=>textFields(row,['glyph','name','color']));
  records(t.epitaphs,row=>{
    sessionFields(row,['name','flavor']); sessionText(row.name);
    if(row.flavor!==undefined)sessionText(row.flavor);
  });
  records(t.procs,row=>textFields(row,['name','text']));
  return t as unknown as InspectionTerms;
}

export class InspectionFormat {
  constructor(readonly terms: InspectionTerms) {}
  label(stat: string): string {
    const literal=this.terms.stats[stat];
    if(literal)return literal[0];
    const match=/^slotgraft_([1-9]\d*)_(.+)$/.exec(stat);
    const graft=match && this.terms.grafts[match[2]];
    return match && graft && Number(match[1])<=graft[1]
      ? graft[0]+' Graft (Skill Slot '+match[1]+')' : stat;
  }
  value(stat: string,kind: ModKind,v: number): string {
    if(kind==='increased'||kind==='more'||this.terms.stats[stat]?.[1]){
      return (Math.abs(v)<0.01?Number((v*100).toPrecision(2)):Math.round(v*1000)/10)+'%';
    }
    const rounded=Math.abs(v)>=3?Math.round(v):Math.round(v*100)/100;
    return String(rounded===0 && v!==0?Number(v.toPrecision(2)):rounded);
  }
  line(line: ModLineDef,v: number): string {
    const label=this.label(line.stat), magnitude=this.value(line.stat,line.kind,Math.abs(v));
    let text: string;
    if(line.kind==='flat' && line.stat.startsWith(this.terms.grantPrefix)){
      const level=Math.max(1,Math.floor(v));
      return 'Grants Level '+level+' '+label.replace(/^Granted Skill: /,'')+', or +'+level+' levels to your equipped copy';
    }
    switch(line.kind){
      case 'flat': text=(v>=0?'+':'−')+magnitude+' '+label;break;
      case 'increased': text=magnitude+(v>=0?' increased ':' reduced ')+label;break;
      case 'more': text=magnitude+(v>=0?' more ':' less ')+label;break;
      case 'link': text='Gain '+this.value(line.stat,'more',v)+' of '+this.label(line.fromStat??'')+' as '+label;break;
      case 'override': text=label+': '+this.value(line.stat,'flat',v);break;
    }
    if(line.tags?.length)text+=' with '+line.tags.join(' ')+' skills';
    if(line.when)text+=' '+(this.terms.conditions[line.when]??line.when);
    if(line.gauge){
      const id=line.gauge;
      const gauge=id.startsWith('status:')?'per stack of '+id.slice(7)
        :id.startsWith('charge:')?'per '+id.slice(7)+' charge':(this.terms.gauges[id]??'per '+id);
      text+=line.gaugeAt===undefined?' '+gauge:' at '+line.gaugeAt+' '+gauge.replace(/^per /,'');
    }
    return line.local?text+this.terms.localSuffix:text;
  }
  spoken(text: string,line: ModLineDef,v: number): string {
    return text.replaceAll('{v%}',this.value(line.stat,'increased',v))
      .replaceAll('{v0}',String(Math.round(v))).replaceAll('{vf}',String(Math.floor(v)))
      .replaceAll('{v}',this.value(line.stat,line.kind,v));
  }
}
