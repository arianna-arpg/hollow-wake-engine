// Original World observations. The SDK flag only refreshes the installed
// authoring bridge; it never supplies an expected result or a replacement rule.
import assert from 'node:assert/strict';
import {makeSimWorld} from '../src/sim/arena';
import {PASSIVE_NODES} from '../src/data/passives';
import {CHOICE_GROUPS,registerChoiceGroup} from '../src/data/passiveChoices';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {makeSkillInstance,BAR_SLOTS} from '../src/engine/skills';
import {equipmentSkillObserver} from '__EQUIPMENT_OBSERVER__';

const observation=equipmentSkillObserver(),w=observation.track(makeSimWorld('magician',17891)),m=w.meta,p=w.player;
const refresh:()=>void=process.argv.includes('--sdk')
  ? (await import(new URL('../src/engine/passiveGrantAdapter.ts',import.meta.url).href)).refreshSdkPassiveGrants:()=>{};
assert(SUPPORTS.multistrike&&SUPPORTS.splitting&&SKILLS.cleave&&SKILLS.ruin);
const cleave=makeSkillInstance(SKILLS.cleave,5,1),ruin=makeSkillInstance(SKILLS.ruin,5,1);
m.knownSkills=new Map([['cleave',cleave],['ruin',ruin]]);p.skills=[cleave,ruin,...Array(BAR_SLOTS-2).fill(null)];
m.allocated=new Set();m.choices={};m.grafts={};m.equipped={};
const id='sdk_equipment_graft_node',group='sdk_equipment_graft_choice';assert(!PASSIVE_NODES[id]&&!CHOICE_GROUPS[group]);
const ids=(inst:typeof cleave)=>inst.grafts?.map(g=>[g.def.id,g.level])??[];
let failed=0;
function check(name:string,expectedCleave:unknown,expectedRuin:unknown=[]){
  refresh();w.recalcPlayer();
  const actual=[ids(cleave),ids(ruin)],expected=[expectedCleave,expectedRuin];
  const okay=JSON.stringify(actual)===JSON.stringify(expected);if(!okay)failed++;
  observation.check(name,okay,JSON.stringify({actual,expected}));
}
try{
  check('initial',[]);
  PASSIVE_NODES[id]={id,name:'Equipment graft probe',description:'Original rebuild course',kind:'small',x:0,y:0,links:[],graft:{support:'multistrike',level:3}};
  m.allocated.add(id);m.grafts[id]='cleave';check('allocated direct graft',[['multistrike',3]]);
  check('repeated rebuild does not duplicate',[['multistrike',3]]);
  cleave.sockets[0]={def:SUPPORTS.multistrike,level:2};check('passive preserves authoring precedence over sockets',[['multistrike',3]]);
  cleave.sockets[0]=null;
  m.grafts[id]='ruin';check('binding moves the derived lane',[],[['multistrike',3]]);
  m.grafts[id]=null;check('null binding is dormant',[]);
  m.grafts[id]='retired-skill';check('retired target is dormant',[]);
  m.grafts[id]='cleave';PASSIVE_NODES[id].graft={support:'retired-support',level:7};check('retired support is dormant',[]);
  PASSIVE_NODES[id].graft={support:'multistrike',level:4};check('live authoring refresh changes level',[['multistrike',4]]);
  const deal={id:group,name:'Equipment graft choices',options:[{id:'echo',name:'Echo',description:'Choice graft',graft:{support:'splitting',level:2}}]};
  registerChoiceGroup(deal);PASSIVE_NODES[id].choice={group};m.choices[id]=['echo'];m.grafts[id+':echo']='cleave';
  check('direct and chosen sources keep their order',[['multistrike',4],['splitting',2]]);
  m.choices[id]=[];check('removing a choice retires its graft',[['multistrike',4]]);
  m.allocated.delete(id);check('unallocated source cannot inject',[]);
  m.allocated.add(id);m.choices[id]=['echo'];m.knownSkills.delete('cleave');
  // Departing instances are no longer wielded: rebuild does not erase their
  // committed payload. The known target is absent so nothing is reinjected.
  check('missing learned owner is not rederived',[]);
  m.knownSkills.set('cleave',cleave);check('restored learned owner rederives',[['multistrike',4],['splitting',2]]);
  delete PASSIVE_NODES[id];check('retired node removes derived state',[]);
  observation.finish(process.argv[2],failed);
}finally{delete PASSIVE_NODES[id];delete CHOICE_GROUPS[group];refresh();}
