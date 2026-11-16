import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {MIMIC_CFG,skillMimicable,mimicCapture,mimicRefreshWatch,mimicSelect,mimicPowerMods} from '../src/engine/mimic';

const restore=seedGlobalRandom(0x4d3306),courses:unknown[]=[];
try{
  const w=makeSimWorld('warrior',0x4d3306),a=w.player,source=new Actor('teacher','enemy',{x:0,y:0});source.defId='skeleton_warrior';
  a.skills=[makeSkillInstance(SKILLS.mimicry,1)];a.sheet.setBase('mimicBank',-2);a.sheet.setBase('mimicWitness',1.5);
  const inspect=()=>JSON.parse(JSON.stringify({bank:a.mimicBank,selected:a.mimicSel,watch:a.mimicWatch,at:a.mimicWatchAt,witness:a.mimicWitnessR}));
  const initial=inspect();let time=1;
  for(const step of[
    {kind:'capture',skill:'firebolt',studied:false}, {kind:'capture',skill:'firebolt',studied:true},
    {kind:'capture',skill:'frostbolt',studied:true}, {kind:'capture',skill:'spark',studied:true},
    {kind:'capture',skill:'firebolt',studied:true}, {kind:'select',pick:-1}, {kind:'select',pick:'missing'},
    {kind:'press'}, {kind:'watch'}, {kind:'unslot'},
  ]){
    let result:unknown;
    w.time=time++;
    if(step.kind==='capture'){
      assert(SKILLS[step.skill!],step.skill);w.account.ledger['bestiary:skeleton_warrior']=step.studied?500:0;
      result=mimicCapture(w,a,source,SKILLS[step.skill!]);
    }else if(step.kind==='select')result=mimicSelect(a,w.time,step.pick!);
    else if(step.kind==='press'){result=w.executeSkill(a,makeSkillInstance(SKILLS.mimic_attune,1),a.pos,{noRepeat:true,noCooldown:true});}
    else {if(step.kind==='unslot')a.skills=[];mimicRefreshWatch(a,w.time);}
    courses.push({step,time:w.time,result:result===undefined?undefined:JSON.parse(JSON.stringify(result)),expected:inspect()});
  }
  const definitions=Object.values(SKILLS).map(def=>({input:{id:def.id,mimic:def.mimic,invokes:def.invokes?{}:undefined,throng:def.throng?{}:undefined,
    delivery:{type:def.delivery.type,...(def.delivery.type==='summon'&&def.delivery.grimoire?{grimoire:{}}:{})},mimicable:def.mimicable,tags:def.tags,effects:def.effects.map(f=>({type:f.type}))},expected:skillMimicable(def)}));
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,rules:MIMIC_CFG,initial,definitions,power:mimicPowerMods(undefined),courses}));
}finally{restore();}
