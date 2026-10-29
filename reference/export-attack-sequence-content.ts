import fs from 'node:fs';
import assert from 'node:assert/strict';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {makeSkillInstance} from '../src/engine/skills';
import {attackSequenceOf,attackSequenceDelivery,attackSequencePayload,attackSequenceSweepInstances,attackSequenceStatuses,attackSequenceErrors} from '../src/engine/attackSequenceSpec';
void makeSimWorld;
const rows:unknown[]=[],restore=seedGlobalRandom(812);
try{
  const courses=[[],['readied_cleave'],['deep_notches','barbed_edge'],['unbound_cleave'],['unbound_cleave','long_edge'],
    ['unbound_cleave','wide_front'],['unbound_cleave','driving_front'],['unbound_cleave','heavy_wave'],
    ['unbound_cleave','heavy_wave','razor_horizon'],['unbound_cleave','heavy_wave','tempered_wave'],
    ['unbound_cleave','heavy_wave','razor_horizon','tempered_wave'],['tempered_wave','razor_horizon','heavy_wave','unbound_cleave']];
  for(const nodes of courses){
    const host=makeSkillInstance(SKILLS.cleave,20,3);host.treeNodes=[...nodes];host.procChainDepth=2;host.state={trigDepth:4};host.bonusLevels=2;
    const support={def:SUPPORTS.brutality,level:2};host.sockets[0]=support;host.grafts=[support];
    const spec=attackSequenceOf(host),payload=attackSequencePayload(host,{type:'projectile',speed:10,range:50,radius:2}),sweeps=attackSequenceSweepInstances(host);
    const view=(inst:typeof host)=>({id:inst.def.id,level:inst.level,bonusLevels:inst.bonusLevels,tags:inst.def.tags,delivery:inst.def.delivery,
      sequence:inst.def.attackSequence??null,trigger:inst.def.trigger??null,tree:inst.def.tree??null,innateMods:inst.def.innateMods,
      leveling:inst.def.leveling,thresholds:inst.def.thresholds??null,cooldown:inst.def.cooldown,manaCost:inst.def.manaCost,useTime:inst.def.useTime,
      effects:inst.def.effects,followUp:inst.def.followUp??null,castCycle:inst.def.castCycle??null,
      role:inst.sequenceRole,depth:inst.procChainDepth,hostIdentity:inst.sequenceHost===host,socketIdentity:inst.sockets[0]===support,
      freshSockets:inst.sockets!==host.sockets,graftIdentity:inst.grafts?.[0]===support,freshGrafts:inst.grafts!==host.grafts});
    rows.push({nodes,hostNodes:host.treeNodes,spec,delivery:attackSequenceDelivery(host)??null,statuses:attackSequenceStatuses(host),
      errors:spec?attackSequenceErrors(spec):[],payload:view(payload),payloadSequence:attackSequenceOf(payload)??null,
      payloadStatuses:attackSequenceStatuses(payload),sweeps:sweeps.map(view)});
  }
}finally{restore();}
assert.equal(rows.length,12);fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,rows},null,2)+'\n');
console.log('Attack sequence content: 12 observed original projections');
