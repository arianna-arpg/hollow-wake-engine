// Original-only character-build reference; this course imports no SDK runtime.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {forgeItem} from '../src/engine/itemgen';
import {slotsForCategory} from '../src/engine/items';
import {ITEM_BASES} from '../src/data/itembases';
import {RELIQUARY} from '../src/data/containers';
import {bankRelic} from '../src/engine/accountReliquary';
import {BAR_SLOTS,treeNodeRefusal} from '../src/engine/skills';

bootSimEngine();const restore=seedGlobalRandom(0x4113),rng=mulberry32(0x4113),rows:any[]=[];
const copy=(x:any)=>JSON.parse(JSON.stringify(x));
try{
 const w=makeSimWorld('magician',0x4113),p=w.player,m=w.meta,seat=w.localSeat;
 m.modeId='immortal';m.charId='durable-prototype';m.relicScope='durable-prototype';
 w.walk=null;w.actors=[p];m.knownSkills.clear();m.equipped={};m.items=[];m.containers={};p.skills=Array(BAR_SLOTS).fill(null);w.recalcSeat(seat);
 const skill=(s:any)=>s?{id:s.def.id,level:s.level,bonus:s.bonusLevels,sockets:s.sockets.map((r:any)=>r?{id:r.def.id,level:r.level}:null),
  tree:s.treeNodes,grafts:s.grafts?.map((r:any)=>({id:r.def.id,level:r.level})),host:s.grantedHostUid,source:s.grantedBy}:null;
 function record(label:string){
  w.recalcSeat(seat);
  const companion=(w as any).companionGrants.owners.get(p);
  rows.push(copy({label,observation:{bar:p.skills.map(skill),known:[...m.knownSkills].map(([id,s])=>[id,skill(s)]),
   grants:[...(seat.grantedInsts??[])].map(([id,s])=>[id,skill(s)]),companions:[...(companion??[])].map(([id,r]:any)=>[id,skill(r.inst)]),
   equipped:m.equipped,attrs:m.attrs,sources:p.sheet.sourceNames().map(id=>[id,p.sheet.getSourceMods(id)])}}));
 }
 for(const id of ['cindervigil','emberbrand','rimewake','mourning_bell','bell_of_the_breach','cinder_conductor','unquarried_idol']){
  m.equipped={};p.skills=Array(BAR_SLOTS).fill(null);w.recalcSeat(seat);
  const item=forgeItem({uniqueId:id,ilvl:40,quality:1,rng});assert(item);
  const slot=slotsForCategory(ITEM_BASES[item.baseId].category)[0];
  if(slot)m.equipped[slot.id]=item;
  else{assert.equal(id,'unquarried_idol');for(const rung of RELIQUARY.ladder)w.account.features.add(rung.feature);
   assert.equal(bankRelic(w.account,item,'durable-prototype'),item);item.x=0;item.y=0;w.account.reliquary.seated=[item.relicKey!];w.restoreAccountRelics(seat);}
  record('cold-'+id);
  if(id==='unquarried_idol'){
   w.account.reliquary.rank=7;record('private-canonical-companion-empowerment');
   w.account.reliquary.enabled=false;record('private-disabled-companion-declaration');assert(!(w as any).companionGrants.owners.get(p));
   w.account.reliquary.enabled=true;record('private-reenabled-companion-declaration');
  }
 }
 w.account.reliquary.seated=[];w.restoreAccountRelics(seat);m.equipped={};p.skills=Array(BAR_SLOTS).fill(null);w.recalcSeat(seat);
 const helmet=forgeItem({uniqueId:'cindervigil',ilvl:40,quality:1,rng})!,ring=forgeItem({uniqueId:'emberbrand',ilvl:40,quality:1,rng})!;
 assert(helmet&&ring);m.equipped={helmet,ring1:ring};w.recalcSeat(seat);const held=seat.grantedInsts!.get('firebolt')!;
 assert.equal(held.level,10);held.treeNodes=[];
 for(let n=0;n<2;n++){assert.equal(treeNodeRefusal(held,'flame_studies'),null);held.treeNodes.push('flame_studies');}
 assert(w.bindSkill(2,'firebolt'));w.recalcSeat(seat);record('cold-actual-invested-pair');
 delete m.equipped.ring1;record('private-same-host-lower-level');assert.equal(seat.grantedInsts!.get('firebolt'),held);assert.equal(held.level,5);assert.equal(held.treeNodes.length,2);
 const replacement=forgeItem({uniqueId:'cindervigil',ilvl:40,quality:1,rng})!;assert(replacement);replacement.grantState=copy(helmet.grantState);m.equipped.helmet=replacement;
 record('private-new-host-cold-restore');const second=seat.grantedInsts!.get('firebolt')!;assert.notEqual(second,held);assert.equal(second.treeNodes!.length,1);assert.equal(held.treeNodes.length,2);
 delete m.equipped.helmet;record('private-remove-grant-host');assert(!seat.grantedInsts);
 m.equipped.helmet=replacement;record('private-reequip-same-item-creates-new-grant');assert.notEqual(seat.grantedInsts!.get('firebolt'),second);
 assert.equal(rows.length,15);writeFileSync(process.argv[2],JSON.stringify({rows}),{flag:'wx'});
}finally{restore();}
