import {writeFileSync} from 'node:fs';import {makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';import {Actor} from '../src/engine/actor';
import {makeSkillInstance,type BuffEffect} from '../src/engine/skills';
const restore=seedGlobalRandom(0x4d3315),courses:unknown[]=[];
try{
  for(const name of['fuse','live-power','dead-caster','persist']){
    const w=makeSimWorld('warrior',0x4d3315),a=new Actor('pending','ally',{x:800,y:600});w.walk=null;w.actors=[a];w.meta.modeId='immortal';w.time=10;
    a.sheet.setBase('effectDuration',1.5);a.sheet.setBase('fuseDelay',1.2);a.sheet.setBase('fusePower',2);
    const effects:BuffEffect[]=[{type:'buff',id:'first',duration:4,maxStacks:10,powerScaled:true,mods:[{stat:'damage',kind:'increased',value:2}]},
      {type:'buff',id:'second',duration:3,powerScaled:true,mods:[{stat:'damage',kind:'increased',value:1}]}];
    const skill=makeSkillInstance({id:'m3-'+name,name,description:'',color:'#fff',tags:['spell'],manaCost:0,useTime:0,cooldown:0,delivery:{type:'self'},effects,
      ...(name==='persist'?{}:{fuse:{delay:1}})},1);a.skills=[skill];
    const inspect=()=>JSON.parse(JSON.stringify({buffs:[...a.buffs],events:a.gainEvents,fuses:w.pendingFuses.map(row=>({...row,caster:'caster',inst:'skill'})),
      persists:w.pendingPersists.map(row=>({...row,caster:'caster',inst:'skill'}))}));
    if(name==='persist')w.pendingPersists.push({caster:a,inst:skill,remaining:2,total:2,timer:0,interval:.4,fade:.25,powerMult:2});
    else w.executeSkill(a,skill,{...a.pos},{noRepeat:true,noCooldown:true,dmgMult:.5});
    const after=inspect(),steps:unknown[]=[];
    for(const dt of[.5,.7,.8]){
      w.time+=dt;if(name==='live-power')a.sheet.setBase('fusePower',3);if(name==='dead-caster')a.dead=true;
      (w as unknown as {updatePendingPersists(dt:number):void}).updatePendingPersists(dt);
      steps.push({dt,time:w.time,power:a.sheet.get('fusePower'),dead:a.dead,expected:inspect()});
    }
    courses.push({name,effects,after,steps});
  }
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,courses}));
}finally{restore();}
