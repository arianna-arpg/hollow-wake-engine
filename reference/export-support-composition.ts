import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';import {MONSTERS} from '../src/data/monsters';
import {makeSkillInstance,supportFitsInst,crewSkillsServed,supportFitsInstOrCrew,hostSockets,grantedTags,effectiveSkillLevel,instanceMods,instanceDelivery,instanceSummon,summonCrewOf,CREW_CFG,type SkillInstance,type SupportDef} from '../src/engine/skills';

bootSimEngine();
const skills=Object.values(SKILLS),supports=Object.values(SUPPORTS),rows:any[]=[];
const crew=(i:SkillInstance)=>{const d=instanceDelivery(i);return summonCrewOf(d.type==='summon'?d:instanceSummon(i),id=>MONSTERS[id],id=>SKILLS[id]);};
const view=(i:SkillInstance)=>({host:hostSockets(i).map(s=>s.def.id),tags:grantedTags(i),level:effectiveSkillLevel(i),mods:instanceMods(i)});
const enablers=supports.filter(s=>s.grantsTags?.length||s.id==='austerity'||s.id==='resonance');
for(const enabler of enablers){
  // Both a caster and a summon host: find them by actual structural eligibility.
  const ids=new Set([skills.find(d=>supportFitsInst(enabler,makeSkillInstance(d)))?.id,
    skills.find(d=>{const i=makeSkillInstance(d);return crew(i)!==null&&supportFitsInstOrCrew(enabler,i,crew(i));})?.id]);
  for(const id of ids){
    if(!id)continue;
    const inst=makeSkillInstance(SKILLS[id],5,4),c=crew(inst);
    for(const candidate of supports){
      if(candidate.id===enabler.id)continue;
      inst.sockets.fill(null);delete inst.grafts;
      const before=supportFitsInstOrCrew(candidate,inst,c);
      inst.sockets[0]={def:enabler,level:3};const after=supportFitsInstOrCrew(candidate,inst,crew(inst));
      if(before===after)continue;
      inst.sockets[2]={def:candidate,level:2};const ordered=view(inst);
      [inst.sockets[0],inst.sockets[2]]=[inst.sockets[2],inst.sockets[0]];const reversed=view(inst);
      inst.grafts=[inst.sockets[2]!];inst.sockets[2]=null;const graft=view(inst);
      rows.push({skill:id,enabler:enabler.id,candidate:candidate.id,before,after,ordered,reversed,graft});
    }
  }
}
const syntheticBase={...SKILLS.fireball,tags:['seed'],effects:[],baseDamage:undefined} as unknown as import('../src/engine/skills').SkillDef;
const s=(id:string,requiresTags:string[],grantsTags:string[]=[],excludeTags?:string[])=>({id,name:id,description:'investigation',color:'#ffffff',weight:1,requiresTags,grantsTags,excludeTags,mods:[]} as SupportDef);
const a=s('a',['seed'],['middle']),b=s('b',['middle'],['end']),c=s('c',['end']);
const synthetic:any[]=[];
for(const order of [[a,b,c],[c,b,a]]){const i=makeSkillInstance(syntheticBase,1,3);i.sockets=order.map(def=>({def,level:1}));synthetic.push({name:'transitive-'+order.map(s=>s.id).join(''),view:view(i)});}
const circular=makeSkillInstance(syntheticBase,1,2);circular.sockets=[{def:s('cycle-a',['b'],['a']),level:1},{def:s('cycle-b',['a'],['b']),level:1}];assert.equal(hostSockets(circular).length,0);synthetic.push({name:'unseeded-cycle',view:view(circular)});
// Preserve the source's one-time admission when later grants add an excluded
// tag. Do not infer a commutative exclusion rule from positive-tag fixpoint code.
const excluded=s('excluded',['seed'],[],['late']),late=s('late',['seed'],['late']);
for(const order of [[excluded,late],[late,excluded]]){const i=makeSkillInstance(syntheticBase,1,2);i.sockets=order.map(def=>({def,level:1}));synthetic.push({name:'exclusion-'+order.map(s=>s.id).join('-'),view:view(i)});}
const rolled={...s('rolled',['attack']),rollBase:{axes:[{id:'cut',rows:[{id:'default',weight:1,line:'Requires a missing mechanism',requiresMechanisms:['pour:absent']}]}]}} as SupportDef;
const summon=skills.find(d=>{const i=makeSkillInstance(d);const c=crew(i);return Array.isArray(c)&&c.some(d=>d.tags.includes('attack'));})!;
const inst=makeSkillInstance(summon),knownCrew=crew(inst);
const asymmetry={skill:summon.id,own:supportFitsInst(rolled,inst),crew:crewSkillsServed(rolled,inst,knownCrew),combined:supportFitsInstOrCrew(rolled,inst,knownCrew)};
const previous=CREW_CFG.boarding;const boarding:any[]=[];
try{for(const mode of ['gated','free'] as const){CREW_CFG.boarding=mode;const i=makeSkillInstance(summon);i.sockets[0]={def:SUPPORTS.splitting,level:3};boarding.push({mode,before:view(i)});i.sockets[1]={def:SUPPORTS.resonance,level:1};boarding.push({mode,key:view(i)});}}finally{CREW_CFG.boarding=previous;}
fs.writeFileSync(process.argv[2],JSON.stringify({scope:'investigation; composition and explicit legacy observations, not accepted extraction',enablers:enablers.map(s=>s.id),rows,synthetic,asymmetry:{...asymmetry,crew:Array.isArray(asymmetry.crew)?asymmetry.crew.map(d=>d.id):asymmetry.crew},boarding})+'\n',{flag:'wx'});
console.log(JSON.stringify({enablers:enablers.length,changedCombinations:rows.length,synthetic,rolledCrewAsymmetry:{own:asymmetry.own,crew:Array.isArray(asymmetry.crew)?asymmetry.crew.map(d=>d.id):asymmetry.crew,combined:asymmetry.combined}}));
