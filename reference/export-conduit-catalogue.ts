import fs from 'node:fs';
import {bootSimEngine} from '../src/sim/arena';
import {CONDUIT_CFG,makeSkillInstance,hostSockets,instanceConduits,type ConduitSpec} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {PASSIVE_NODES} from '../src/data/passives';
import {CHOICE_GROUPS} from '../src/data/passiveChoices';

bootSimEngine();
type Row={source:'skill'|'support'|'tree'|'passive'|'choice'; id:string; owner?:string; pumps:ConduitSpec[]};
const entries:Row[]=[];
for(const skill of Object.values(SKILLS)){
  if(skill.conduits?.length)entries.push({source:'skill',id:skill.id,pumps:skill.conduits});
  const tree=skill.tree;
  if(!tree)continue;
  const nodes=[...(tree.branches??[]).flatMap(b=>b.rungs),...(tree.nodes??[]),...(tree.neutral?[tree.neutral]:[])];
  for(const node of nodes)if(node.conduits?.length)
    entries.push({source:'tree',owner:skill.id,id:node.id,pumps:node.conduits});
}
for(const s of Object.values(SUPPORTS))if(s.conduit)entries.push({source:'support',id:s.id,pumps:[s.conduit]});
for(const n of Object.values(PASSIVE_NODES))if(n.conduit)entries.push({source:'passive',id:n.id,pumps:[n.conduit]});
for(const g of Object.values(CHOICE_GROUPS))for(const o of g.options)
  if(o.conduit)entries.push({source:'choice',owner:g.id,id:o.id,pumps:[o.conduit]});
fs.writeFileSync(process.argv[2],JSON.stringify({version:1,rules:CONDUIT_CFG,entries})+'\n');
if(process.argv[3]){
  const cases=[];
  // Compare source-resolved order after real socket and graft admission. Include
  // a host without an innate pump, and repeated investments by occurrence.
  const ids=new Set([...entries.filter(e=>e.source==='skill').map(e=>e.id),
    ...entries.filter(e=>e.source==='tree').map(e=>e.owner!), 'fireball']);
  for(const id of ids)for(const s of Object.values(SUPPORTS).filter(s=>s.conduit))for(const tier of [0,1,2]){
    const inst=makeSkillInstance(SKILLS[id],4,2);
    inst.sockets[0]={def:s,level:2};
    if(tier>0)inst.grafts=[{def:s,level:3},{def:SUPPORTS.stoneblood_conduit,level:1}];
    const nodes=entries.filter(e=>e.source==='tree'&&e.owner===id).map(e=>e.id);
    inst.treeNodes=tier===2?[...nodes,...nodes]:tier===1?nodes:[];
    cases.push({skill:id,admitted:hostSockets(inst).map(slot=>slot.def.id),invested:inst.treeNodes,expected:instanceConduits(inst)});
  }
  fs.writeFileSync(process.argv[3],JSON.stringify(cases));
}
