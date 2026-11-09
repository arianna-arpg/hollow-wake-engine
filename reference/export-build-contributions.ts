// Original-only observations of complete rebuilds. No SDK rules produce these
// expectations; this course changes real authored build inputs between rebuilds.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {CLASSES} from '../src/data/classes';
import {PASSIVE_NODES} from '../src/data/passives';
import {CHOICE_GROUPS} from '../src/data/passiveChoices';
import {RELIQUARY} from '../src/data/containers';
import {rollItem} from '../src/engine/itemgen';
import type {World} from '../src/engine/world';

bootSimEngine();
const rows:unknown[]=[];
function observe(w:World,label:string){
 w.recalcSeat(w.localSeat);
 const p=w.player,m=w.meta;
 rows.push({label,classId:m.classDef.id,base:m.baseAttrs,allocated:[...m.allocated],choices:m.choices,attributes:m.attrs,
  sources:p.sheet.sourceNames().map(id=>[id,p.sheet.getSourceMods(id)]),
  reads:Object.fromEntries(['life','mana','damage','armor','accuracy','castSpeed','skillgrant_firebolt'].map(id=>[id,p.sheet.get(id)])),
  conduits:p.wornConduits??[],grafts:w.localSeat.wornGrafts?.map(r=>({...r,def:r.def.id}))??[],
  grants:w.localSeat.grantedSkills?.map(r=>({id:r.def.id,level:r.level,source:r.source,host:r.hostUid,slot:r.slot}))??[],
  bar:p.skills.map(s=>s?{id:s.def.id,level:s.level,bonus:s.bonusLevels,grafts:s.grafts?.map(g=>[g.def.id,g.level])}:null),
  relicPower:m.relicEmpowerment,enabled:m.relicEnabled,suppressed:p.relicEffectsSuppressed,
 });
 // Detach each observation before later live changes.
 rows[rows.length-1]=JSON.parse(JSON.stringify(rows.at(-1)));
}
for(const [index,def] of CLASSES.entries()){
 const restore=seedGlobalRandom(0x4900+index);
 try{
  const w=makeSimWorld(def.id,0x4900+index);w.meta.equipped={};w.meta.containers={};
  observe(w,def.id+':initial');
  w.player.level=23;w.meta.baseAttrs={...w.meta.baseAttrs,strength:(w.meta.baseAttrs.strength??0)+7};
  observe(w,def.id+':grown');
 }finally{restore();}
}
const restore=seedGlobalRandom(0x5011);
try{
 const w=makeSimWorld('magician',0x5011),m=w.meta,p=w.player;
 m.items=[];m.equipped={};m.containers={};m.allocated.clear();m.choices={};m.grafts={};
 observe(w,'empty-build');
 const nodes=Object.values(PASSIVE_NODES);
 for(const key of ['attributes','conduit'] as const){
  const node=nodes.find(n=>n[key]);assert(node,key+' authored node');m.allocated.add(node.id);
  if(node.graft)m.grafts[node.id]='ruin';
 }
 const choice=nodes.find(n=>n.choice&&CHOICE_GROUPS[n.choice.group]?.options.some(o=>o.attributesPct));assert(choice?.choice);
 const option=CHOICE_GROUPS[choice.choice.group].options.find(o=>o.attributesPct)!;
 m.allocated.add(choice.id);m.choices[choice.id]=[option.id,'retired-option'];m.allocated.add('retired-node');
 observe(w,'authored-passives-and-choice');
 const helm=rollItem({ilvl:20,uniqueId:'cindervigil'})!;assert(helm);m.equipped.helmet=helm;
 observe(w,'worn-grant');
 const make=(uniqueId:string,x:number,y:number)=>{const item=rollItem({ilvl:30,uniqueId})!;assert(item);item.x=x;item.y=y;return item;};
 const bead=make('hermits_bead',1,1),lodestone=make('lodestone',1,2),crown=make('reliquary_crown',2,0);
 const held=[bead,lodestone,crown];m.containers.reliquary=held;
 for(const rung of RELIQUARY.ladder)w.account.features.delete(rung.feature);
 observe(w,'unowned-container');
 w.account.features.add(RELIQUARY.ladder[0].feature);observe(w,'first-cell-only');
 for(const rung of RELIQUARY.ladder)w.account.features.add(rung.feature);
 observe(w,'full-board-neighbourhood');
 w.account.reliquary.rank=4;observe(w,'empowered-neighbourhood');
 bead.x=0;bead.y=4;observe(w,'move-changes-neighbourhood');
 const overlap=make('hermits_bead',0,4),outside=make('sunderstone',20,20);held.push(overlap,outside);
 observe(w,'overlap-and-outside-excluded');
 w.account.reliquary.enabled=false;observe(w,'disabled-clears-contribution');
 w.account.reliquary.enabled=true;p.relicEffectsSuppressed=true;observe(w,'suppressed-clears-contribution');
 p.relicEffectsSuppressed=false;observe(w,'restored-contribution');
 delete m.equipped.helmet;m.containers.reliquary=[];m.allocated.clear();m.choices={};
 observe(w,'removed-sources');
}finally{restore();}
writeFileSync(process.argv[2],JSON.stringify({scope:'original-class-passive-gear-container-rebuild/v1',classes:CLASSES.length,rows}),{flag:'wx'});
