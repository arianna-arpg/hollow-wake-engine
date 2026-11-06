import fs from 'node:fs';
import path from 'node:path';
import {bootSimEngine} from '../src/sim/arena';
import {ITEM_BASES} from '../src/data/itembases';
import {ITEM_AFFIXES} from '../src/data/itemaffixes';
import {UNIQUES} from '../src/data/uniques';
import {VESTIGES,EPITAPH_LIST} from '../src/data/vestiges';
import {PROCS} from '../src/data/procs';
import {STAT_DEFS,CONDITION_IDS} from '../src/engine/stats';
import {DERIVED_GAUGES} from '../src/engine/gauges';
import {ITEM_RARITIES,ITEM_CFG,DEFENSE_LABEL_BY_STAT,statLabel,formatModLine} from '../src/engine/items';
import {SKILLGRANT_PREFIX} from '../src/engine/skills';
import {describeItem,compareItemMods,itemLevelReq,compileItemMods,foldOwnStats} from '../src/engine/itemgen';
import {itemProcReferences,procReference,PROC_REFERENCE_CFG} from '../src/engine/procReference';
bootSimEngine();
const [out,itemsId]=process.argv.slice(2);
const cases=JSON.parse(fs.readFileSync(path.join(out,'inputs.json'),'utf8'));
const ids=new Set<string>(Object.keys(DEFENSE_LABEL_BY_STAT));
function visit(v:any){
  if(!v || typeof v!=='object')return;
  if(typeof v.stat==='string')ids.add(v.stat);
  if(typeof v.fromStat==='string')ids.add(v.fromStat);
  for(const child of Object.values(v))visit(child);
}
for(const table of [ITEM_BASES,ITEM_AFFIXES,UNIQUES,VESTIGES,EPITAPH_LIST])visit(table);
const probe={stat:'inspection_probe',kind:'flat' as const};
const prefix=formatModLine(probe,1)+' ';
const conditions=Object.fromEntries(CONDITION_IDS.map(when=>{
  const line=formatModLine({...probe,when},1);
  if(!line.startsWith(prefix))throw Error(when);
  return [when,line.slice(prefix.length)];
}));
const clip=(s:string,n:number)=>[...s].length>n?[...s].slice(0,n-1).join('')+'…':s;
const terms={schemaVersion:1,itemsId,grantPrefix:SKILLGRANT_PREFIX,localSuffix:ITEM_CFG.localLineSuffix,
  stats:Object.fromEntries([...ids].sort().map(id=>[id,[statLabel(id),!!STAT_DEFS[id]?.percent]])),
  conditions,gauges:Object.fromEntries(Object.entries(DERIVED_GAUGES).map(([id,g])=>[id,g.label])),
  defense:DEFENSE_LABEL_BY_STAT,rarities:ITEM_RARITIES,
  vestiges:Object.fromEntries(Object.entries(VESTIGES).map(([id,v])=>[id,{name:v.name,glyph:v.glyph,color:v.color}])),
  epitaphs:Object.fromEntries(EPITAPH_LIST.map(e=>[e.id,{name:e.name,flavor:e.flavor}])),
  procLimit:PROC_REFERENCE_CFG.maxEntries,
  procs:Object.fromEntries(Object.entries(PROCS).flatMap(([id,p])=>{
    const text=procReference(p);
    return text?[[id,{name:clip(p.name,PROC_REFERENCE_CFG.maxNameCharacters),text:clip(text,PROC_REFERENCE_CFG.maxCharacters)}]]:[];
  }))};
fs.writeFileSync(path.join(out,'terms.json'),JSON.stringify(terms)+'\n');
const fd=fs.openSync(path.join(out,'original.jsonl'),'wx');
try{
  for(let i=0;i<cases.length;i++){
    const {label,item}=cases[i],worn=cases[(i+cases.length-1)%cases.length].item;
    const observation={description:describeItem(item),ownStats:foldOwnStats(ITEM_BASES[item.baseId],item),
      modifiers:compileItemMods(item),requiredLevel:itemLevelReq(item),procReferences:itemProcReferences(item)};
    fs.writeSync(fd,JSON.stringify({label,observation,comparison:compareItemMods(item,worn)})+'\n');
  }
}finally{fs.closeSync(fd);}
