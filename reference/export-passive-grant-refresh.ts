import fs from 'node:fs';
import path from 'node:path';
import { makeSimWorld } from '../src/sim/arena';
import { PASSIVE_NODES } from '../src/data/passives';
import { CHOICE_GROUPS, registerChoiceGroup } from '../src/data/passiveChoices';
import { mod } from '../src/engine/stats';
import { makeSkillInstance, hostSockets } from '../src/engine/skills';
import { SKILLS } from '../src/data/skills';
const w=makeSimWorld('magician',9331),m=w.meta,p=w.player;
const refresh:()=>void=process.argv.includes('--sdk')
  ? (await import(new URL('../src/engine/passiveGrantAdapter.ts',import.meta.url).href)).refreshSdkPassiveGrants : ()=>{};
const skill=makeSkillInstance(SKILLS.cleave,1,0);m.knownSkills=new Map([['cleave',skill]]);p.skills=[skill];
const rows:any[]=[];
function observe(phase:string) {
  refresh();w.recalcPlayer();
  rows.push({phase,attributes:{...m.attrs},passives:p.sheet.getSourceMods('passives'),life:p.sheet.get('life'),
    authoredKey:p.sheet.get('sdk_authored_key'),conduits:p.wornConduits??[],supports:hostSockets(skill).map(s=>({id:s.def.id,level:s.level}))});
}
observe('initial');
const id='sdk_live_grant',group='sdk_live_deal';
if(PASSIVE_NODES[id]||CHOICE_GROUPS[group])throw new Error('Refresh probe identity collision');
try {
  PASSIVE_NODES[id]={id,name:'Live',description:'Live source',kind:'small',x:0,y:0,links:[],attributes:{strength:3},mods:[mod('life','flat',5)]};
  m.allocated.add(id);observe('created');
  PASSIVE_NODES[id].mods=[mod('life','flat',23),mod('sdk_authored_key','flat',7)];observe('retuned-and-custom-key');
  const liveDeal={id:group,name:'Live group',options:[{id:'x',name:'Choice',description:'Choice source',attributesPct:{strength:.5},graft:{support:'added_fire',level:3}}]};
  registerChoiceGroup(liveDeal);
  PASSIVE_NODES[id].choice={group};m.choices[id]=['x'];m.grafts[id+':x']='cleave';observe('choice-and-graft');
  liveDeal.options[0].attributesPct={strength:1};observe('retuned-choice');
  PASSIVE_NODES[id].conduit={from:'mana',to:'life',ratio:2,drainFlat:3};observe('conduit');
  PASSIVE_NODES[id].choice={group:'retired-group'};observe('retired-choice-group');
  delete PASSIVE_NODES[id];observe('retired-node');
} finally {delete PASSIVE_NODES[id];delete CHOICE_GROUPS[group];refresh();}
fs.mkdirSync(process.argv[2],{recursive:true});
fs.writeFileSync(path.join(process.argv[2],'passive-grant-refresh.json'),JSON.stringify({schemaVersion:1,rows})+'\n');
console.log(`Observed ${rows.length} live grant-content revisions.`);
