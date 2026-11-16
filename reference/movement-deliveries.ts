import {writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';import {Actor} from '../src/engine/actor';
import {makeSkillInstance,type SkillDef} from '../src/engine/skills';import {STATUS_DEFS} from '../src/engine/status';import {CONJURE_CFG} from '../src/engine/flux';
const restore=seedGlobalRandom(0x4d3314),courses:unknown[]=[];
const recipes=[{name:'dash',d:{type:'dash',speed:200,distance:100}},
  {name:'dash-phase',d:{type:'dash',speed:200,distance:100,phase:true}},
  {name:'dash-decoy',d:{type:'dash',speed:200,distance:100,decoyDuration:3}},
  {name:'dash-trails',d:{type:'dash',speed:200,distance:100,trailVent:{bank:'mist',radius:20,duration:2,spacing:5},trailZone:{radius:12,duration:4}}},
  {name:'blink',d:{type:'blink',range:80}},{name:'behind',d:{type:'blink',range:80,behindTarget:true}},
  {name:'delayed',d:{type:'blink',range:80,behindTarget:true,delay:1}},
  {name:'dead-delayed',d:{type:'blink',range:80,delay:1}},
  {name:'leap',d:{type:'leap',range:80,radius:30,airTime:.7,telegraph:true}},
  {name:'leap-repeat',d:{type:'leap',range:80,radius:30,airTime:.7}},
  {name:'carom',d:{type:'carom',speed:300,duration:4}},{name:'carom-end',d:{type:'carom',speed:300,duration:4}}];
try{
  for(const recipe of recipes){
    const w=makeSimWorld('warrior',0x4d3314),a=new Actor('mover','ally',{x:800,y:600}),foe=new Actor('foe','enemy',{x:900,y:600});w.walk=null;w.meta.modeId='immortal';w.actors=[a,foe];a.facing=0;
    const stats={effectDuration:1.5,aoeRadius:2,moveTrail:0,cloudTrail:0};for(const [key,n]of Object.entries(stats))a.sheet.setBase(key,n);a.sheet.setBase('life',100);
    const skill=makeSkillInstance({id:'m3-'+recipe.name,name:recipe.name,description:'',color:'#fff',tags:['movement'],manaCost:0,useTime:0,cooldown:0,delivery:recipe.d as SkillDef['delivery'],effects:[]},1);a.skills=[skill];
    const statuses:unknown[]=[],apply=a.applyStatus,end=a.endStatus;
    a.applyStatus=function(...args:Parameters<typeof apply>){statuses.push(['apply',...args]);return apply.apply(this,args);};
    a.endStatus=function(...args:Parameters<typeof end>){statuses.push(['end',...args]);return end.apply(this,args);};
    const inspect=()=>JSON.parse(JSON.stringify({pos:a.pos,facing:a.facing,facingPrev:a.facingPrev,tier:a.tier,dash:a.dash,carom:a.caromRun,dashSkill:a.dashSkill?.def.id,caromSkill:a.caromSkill?.def.id,
      dashHits:a.dashHits?[...a.dashHits]:undefined,caromHits:a.caromHits?[...a.caromHits]:undefined,caromRung:a.caromRung?[...a.caromRung]:undefined,
      dashTrail:a.dashTrailSpec,dashVent:a.dashVentSpec,dashConjure:a.dashConjureSpec,untargetable:a.untargetable,useLock:a.useLock,
      leap:a.leap?{...a.leap,inst:a.leap.inst.def.id}:null,statuses,
      blinks:w.pendingBlinks.map(b=>({dest:b.dest,timer:b.timer,face:b.faceTarget===foe,inst:b.inst?.def.id,life:b.visual?.life})),
      decoys:w.actors.filter(b=>b.owner===a).map(b=>({name:b.name,team:b.team,source:b.sourceSkillId,skill:b.summonInst?.def.id,tier:b.tier,radius:b.radius,facing:b.facing,life:b.life,maxLife:b.maxLife(),lifespan:b.lifespan,taunt:b.taunt,construct:b.construct}))}));
    const initial=inspect(),target=recipe.d.behindTarget?{actor:foe,pos:{...foe.pos}}:undefined;
    try{
      assert(w.executeSkill(a,skill,{x:940,y:600},{noCooldown:true,noRepeat:recipe.name==='leap-repeat',keepFacing:true,speedMult:.5,dmgMult:3,targetInfo:target}));const after=inspect(),steps:unknown[]=[];
      if(recipe.d.delay){if(recipe.name==='dead-delayed')a.dead=true;for(const dt of[.5,.5]){(w as unknown as {updatePendingBlinks(dt:number):void}).updatePendingBlinks(dt);steps.push({dt,expected:inspect()});}}
      if(recipe.name==='carom-end'){w.endCarom(a);steps.push({end:true,expected:inspect()});}
      courses.push({name:recipe.name,delivery:recipe.d,stats,maximum:a.maxLife(),radius:a.radius,initial,after,steps,foe:{pos:foe.pos,radius:foe.radius,facing:foe.facing,tier:foe.tier},statusDurations:{phasing:STATUS_DEFS.phasing.duration,caroming:STATUS_DEFS.caroming.duration}});
    }finally{a.applyStatus=apply;a.endStatus=end;}
  }
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,cloud:CONJURE_CFG.statTrail,courses}));
}finally{restore();}
