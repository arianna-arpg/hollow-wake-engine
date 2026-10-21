import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';
import {makeSkillInstance,instanceChargeCost,type SkillDef} from '../src/engine/skills';import {treeGraph} from '../src/engine/skilltree';
bootSimEngine();const wire=(v:unknown):any=>JSON.parse(JSON.stringify(v));
const rows:{id:string;cost:SkillDef['chargeCost']}[]=[{id:'none',cost:undefined}];
for(const def of Object.values(SKILLS)){
 if(def.chargeCost)rows.push({id:'skill:'+def.id,cost:def.chargeCost});
 const graph=treeGraph(def);if(graph)for(const id of graph.order){const i=makeSkillInstance(def,20,4);i.treeNodes=[id];const cost=instanceChargeCost(i);if(cost&&cost!==def.chargeCost)rows.push({id:'tree:'+def.id+':'+id,cost});}
}
for(const def of Object.values(SUPPORTS))if(def.chargeCost)rows.push({id:'support:'+def.id,cost:def.chargeCost});
const restore=seedGlobalRandom(223000),cases:any[]=[];
try{
 const w=makeSimWorld('swashbuckler',223000),a:any=w.player,aw:any=w;a.skills=[];
 a.sheet.setBase('mana',1000);a.fillResources();
 for(const row of rows)for(const have of [-.5,0,.5,1,4,5,8,20]){
  a.charges.clear();a.chargeState.clear();a.chargeModCount.clear();a.gainEvents=[];
  for(const name of a.sheet.sourceNames())if(name.startsWith('charge:'))a.sheet.removeSource(name);
  const inst=makeSkillInstance({...SKILLS.firebolt,manaCost:0,cooldown:0,useTime:0,chargeCost:row.cost},1,2);
  if(row.cost)a.charges.set(row.cost.charge,have);
  const ready=a.canUse(inst),payment=aw.consumeChargeCost(a,inst);
  assert(Number.isFinite(payment.mult)&&Number.isFinite(payment.consumed));
  cases.push(wire({id:row.id,cost:row.cost??null,have,ready,payment,after:{charges:[...a.charges],modCount:[...a.chargeModCount],sources:a.sheet.sourceNames().filter((s:string)=>s.startsWith('charge:'))}}));
 }
}finally{restore();}
fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Original charge-cost admission and World payment for all authored skill, support and selected tree costs; other cast gates controlled by an ordinary zero-cost skill',rows:wire(rows),cases})+'\n',{flag:'wx'});
console.log(JSON.stringify({authoredRows:rows.length-1,cases:cases.length}));
