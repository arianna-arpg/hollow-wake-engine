import fs from 'node:fs';
import {bootSimEngine} from '../src/sim/arena';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {MONSTERS} from '../src/data/monsters';
import {
  makeSkillInstance, supportFitsTags, supportFitsInst, crewSkillsServed,
  summonCrewOf, instanceDelivery, instanceSummon, hostSockets, grantedTags,
  effectiveSkillLevel, instanceInnateMods, instanceMods, supportGlobalMods,
  supportRidesMinions, minionSeatBoundFields, SUPPORT_MECHANISMS, mechanismHolds,
  type SkillInstance, type SupportInstance,
} from '../src/engine/skills';
import {canonicalVein, resolveVein, veinMechanisms, veinMods} from '../src/engine/supportbase';

// Investigation capture only. No accepted fixture is overwritten and no SDK
// implementation participates in these original-game observations.
bootSimEngine();
const skills=Object.values(SKILLS), supports=Object.values(SUPPORTS);
const crew=(inst:SkillInstance)=>{
  const d=instanceDelivery(inst);
  return summonCrewOf(d.type==='summon'?d:instanceSummon(inst),id=>MONSTERS[id],id=>SKILLS[id]);
};
const view=(inst:SkillInstance)=>({
  host:hostSockets(inst).map(s=>({id:s.def.id,level:s.level,scale:s.forwardScale??null})),
  granted:grantedTags(inst),level:effectiveSkillLevel(inst),
  innate:instanceInnateMods(inst),mods:instanceMods(inst),
  globals:inst.sockets.filter((s):s is SupportInstance=>!!s).map(s=>({id:s.def.id,mods:supportGlobalMods(s)})),
});
const firstOwn=new Map<string,string>(),firstCrew=new Map<string,string>();
const matrix:string[]=[], counts={pairs:0,tags:0,own:0,crew:0,crewOnly:0};
for(const def of skills){
  const inst=makeSkillInstance(def,1,4),c=crew(inst);let row='';
  for(const sup of supports){
    const tag=supportFitsTags(sup,def.tags),own=supportFitsInst(sup,inst),served=crewSkillsServed(sup,inst,c);
    const boards=served!==null;row+=(Number(tag)+2*Number(own)+4*Number(boards)).toString();
    counts.pairs++;counts.tags+=Number(tag);counts.own+=Number(own);counts.crew+=Number(boards);counts.crewOnly+=Number(boards&&!own);
    if(own&&!firstOwn.has(sup.id))firstOwn.set(sup.id,def.id);
    if(boards&&!firstCrew.has(sup.id))firstCrew.set(sup.id,def.id);
  }
  matrix.push(row);
}
const cases:any[]=[];
for(const sup of supports){
  const id=firstOwn.get(sup.id)??firstCrew.get(sup.id);
  if(!id)continue;
  const cuts=sup.rollBase?[undefined,canonicalVein(sup.rollBase),...sup.rollBase.axes.flatMap(axis=>axis.rows.map(row=>({...canonicalVein(sup.rollBase!),[axis.id]:row.id})))]:[undefined];
  for(const [cutIndex,rolled] of cuts.entries())for(const level of [1,5]){
    const inst=makeSkillInstance(SKILLS[id],20,4);inst.bonusLevels=2.8;
    const socket:SupportInstance={def:sup,level,rolled};inst.sockets[2]=socket;
    const full=view(inst);socket.forwardScale=.7;const forwarded=view(inst);
    inst.sockets[2]=null;inst.grafts=[socket];const grafted=view(inst);
    cases.push({support:sup.id,skill:id,level,cutIndex,rolled:rolled??null,full,forwarded,grafted,
      cut:sup.rollBase?{rows:resolveVein(sup.rollBase,rolled),mechanisms:veinMechanisms(sup.rollBase,rolled),mods:veinMods(sup.rollBase,rolled)}:null});
  }
}
const result={scope:'investigation; bare-host exhaustive compatibility and single-support resolver states, not full socket actions or execution',
  skills:skills.map(s=>s.id),supports:supports.map(s=>s.id),matrix,counts,cases,
  mechanisms:Object.keys(SUPPORT_MECHANISMS),requirements:[...new Set(supports.flatMap(s=>s.requiresMechanisms??[]))].sort(),
  seatBound:supports.map(s=>({id:s.id,fields:minionSeatBoundFields(s),rides:supportRidesMinions(s)})),
  noBareHost:supports.filter(s=>!firstOwn.has(s.id)&&!firstCrew.has(s.id)).map(s=>s.id),
  unknownMechanism:mechanismHolds('unregistered-investigation-mechanism',makeSkillInstance(skills[0])),
};
fs.writeFileSync(process.argv[2],JSON.stringify(result)+'\n',{flag:'wx'});
console.log(JSON.stringify({...counts,skills:skills.length,supports:supports.length,resolverCases:cases.length,mechanisms:result.mechanisms,requirements:result.requirements,noBareHost:result.noBareHost}));
