// Independent original-only observation of every class's initial learned build
// and its level-18 durable rebuild. Never import SDK code into this course.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {CLASSES} from '../src/data/classes';
bootSimEngine();const restore=seedGlobalRandom(0x5113),rows:any[]=[];
try{
 const skill=(s:any)=>s?{id:s.def.id,level:s.level,bonus:s.bonusLevels,sockets:s.sockets.map((r:any)=>r?{id:r.def.id,level:r.level}:null),
  tree:s.treeNodes,grafts:s.grafts?.map((r:any)=>({id:r.def.id,level:r.level})),host:s.grantedHostUid,source:s.grantedBy}:null;
 for(const def of CLASSES){
  const world=makeSimWorld(def.id,0x5113),actor=world.player,meta=world.meta;
  meta.equipped={};meta.items=[];meta.containers={};world.walk=null;world.actors=[actor];world.recalcSeat(world.localSeat);
  const known=new Map(meta.knownSkills);
  for(const level of [1,18]){
   actor.level=level;world.recalcSeat(world.localSeat);
   for(const[id,inst]of known)assert.equal(meta.knownSkills.get(id),inst,'Rebuild must retain the original learned instance');
   const companions=(world as any).companionGrants.owners.get(actor);
   rows.push(JSON.parse(JSON.stringify({label:def.id+'-'+level,observation:{bar:actor.skills.map(skill),known:[...meta.knownSkills].map(([id,s])=>[id,skill(s)]),
    grants:[...(world.localSeat.grantedInsts??[])].map(([id,s])=>[id,skill(s)]),companions:[...(companions??[])].map(([id,r]:any)=>[id,skill(r.inst)]),
    equipped:meta.equipped,attrs:meta.attrs,sources:actor.sheet.sourceNames().map(id=>[id,actor.sheet.getSourceMods(id)])}})));
  }
 }
 writeFileSync(process.argv[2],JSON.stringify({rows}),{flag:'wx'});
}finally{restore();}
