// Original-only observer for the separately versioned November 17 revision.
import fs from 'node:fs';
import path from 'node:path';
import {bootSimEngine} from '../src/sim/arena';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {PASSIVE_NODES} from '../src/data/passives';
import {CHOICE_GROUPS} from '../src/data/passiveChoices';
import {VOCATIONS} from '../src/data/vocations';
import {CLASSES} from '../src/data/classes';
import {COMBO_RULES} from '../src/data/combos';
import {PROCS} from '../src/data/procs';
import {STAT_DEFS} from '../src/engine/stats';
import {SHEET_FAMILY_SEATS,statBlurbOf,statDetailOf} from '../src/data/sheet';
import {modTriggerReferences,procReference,PROC_REFERENCE_CFG} from '../src/engine/procReference';
import {makeSkillGem,skillContextTags,supportFitsInst} from '../src/engine/skills';
import {treeGraph} from '../src/engine/skilltree';

bootSimEngine();

const compact=(d:any)=>({name:d.name??d.label??d.id,description:d.description??d.blurb??''});
const card=(d:any,mods=d.mods??[])=>({...compact(d),references:modTriggerReferences(mods)});
const cards={
 skills:Object.fromEntries(Object.entries(SKILLS).map(([id,d])=>[id,card(d)])),
 supports:Object.fromEntries(Object.entries(SUPPORTS).map(([id,d])=>[id,card(d)])),
 passives:Object.fromEntries(Object.entries(PASSIVE_NODES).map(([id,d])=>[id,card(d)])),
 choices:Object.fromEntries(Object.entries(CHOICE_GROUPS).flatMap(([id,g])=>g.options.map(o=>[id+'/'+o.id,card(o)]))),
 classes:Object.fromEntries(CLASSES.map(d=>[d.id,card(d)])),
 vocations:Object.fromEntries(Object.entries(VOCATIONS).map(([id,d])=>[id,card(d)])),
};
const trees=Object.fromEntries(Object.entries(SKILLS).filter(([,d])=>d.tree).map(([id,d])=>[id,Object.fromEntries([...treeGraph(d)!.nodes].map(([nodeId,{node:n}])=>[nodeId,card(n,[...(n.mods??[]),...(n.graft?SUPPORTS[n.graft.support]?.mods??[]:[])])]))]));
const stats=Object.fromEntries(Object.entries(STAT_DEFS).map(([id,d])=>[id,{name:d.label,description:statBlurbOf(id)??'',
 detail:id.startsWith('combo_')?COMBO_RULES[id.slice(6)]?.detail??null:id.startsWith('proc_')?(PROCS[id.slice(5)]?procReference(PROCS[id.slice(5)]):null):statDetailOf(id),base:d.base,percent:!!d.percent}]));
const refs=Object.fromEntries([...Object.keys(PROCS).map(id=>'proc_'+id),...Object.keys(COMBO_RULES).map(id=>'combo_'+id)].flatMap(stat=>{
 const refs=modTriggerReferences([{stat,kind:'flat',value:1}]);return refs.length?[[stat,refs[0]]]:[];
}));
const inspection={schemaVersion:1,capability:'inventory-inspection/v1',cards,trees,stats,families:SHEET_FAMILY_SEATS,refs,limits:PROC_REFERENCE_CFG};
fs.writeFileSync(path.join(process.argv[2],'inspection.json'),JSON.stringify(inspection)+'\n',{flag:'wx'});
const node=SKILLS.decoy.tree!.nodes[5],decoy=makeSkillGem(SKILLS.decoy,20,'legendary');decoy.treeNodes=[node.id];
const decoyResult={node:node.id,tags:[...skillContextTags(decoy)],supports:Object.fromEntries(Object.entries(SUPPORTS).map(([id,d])=>[id,supportFitsInst(d,decoy)]))};
const triggerInputs=[[],[{stat:'combo_drumbeat',kind:'flat',value:1}],Object.keys(refs).map(stat=>({stat,kind:'flat',value:1})),
 ...Object.keys(refs).map(stat=>[{stat,kind:'flat',value:1},{stat,kind:'flat',value:2},{stat,kind:'increased',value:1},{stat,kind:'flat',value:0}])];
const expected={originalOnly:true,decoy:decoyResult,triggers:triggerInputs.map(mods=>({mods,result:modTriggerReferences(mods as any)}))};
fs.writeFileSync(path.join(process.argv[2],'observations.json'),JSON.stringify(expected)+'\n',{flag:'wx'});
