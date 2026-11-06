import fs from 'node:fs';
import {bootSimEngine} from '../src/sim/arena';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {MONSTERS} from '../src/data/monsters';
import {makeSkillInstance,instanceDelivery,instanceSummon,summonCrewOf,supportFitsInstOrCrew} from '../src/engine/skills';

bootSimEngine();
const monsters=Object.fromEntries(Object.entries(MONSTERS).map(([id,m])=>[id,{skills:m.skills,
  ...(m.grants?{grants:m.grants.filter(g=>g.skill).map(g=>({skill:g.skill}))}:{})}]));
const supports=Object.values(SUPPORTS),skills=Object.values(SKILLS),courses=[];
const alternate=(def:typeof supports[number])=>def.rollBase?Object.fromEntries(def.rollBase.axes.map(a=>[a.id,a.rows[a.rows.length-1].id])):undefined;
for(const [i,def] of skills.entries()){
  const inst=makeSkillInstance(def,10,4);inst.rarity='rare';
  const nodes=def.tree?.nodes??[];
  if(nodes.length)inst.treeNodes=[(nodes.find(n=>n.over)??nodes[0]).id];
  const first=supports[i%supports.length],second=supports[(i*31+7)%supports.length];
  inst.sockets[0]={def:first,level:2,rolled:alternate(first)};inst.sockets[2]={def:second,level:3,rolled:alternate(second)};
  const d=instanceDelivery(inst),crew=summonCrewOf(d.type==='summon'?d:instanceSummon(inst),id=>MONSTERS[id],id=>SKILLS[id]);
  const verdicts=supports.map(s=>supportFitsInstOrCrew(s,inst,crew,alternate(s))?'1':'0').join('');
  courses.push({skillId:def.id,seated:[first.id,second.id],treeNodes:inst.treeNodes??[],verdicts});
}
fs.writeFileSync(process.argv[2],JSON.stringify({monsters,courses}));
