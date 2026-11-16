import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {inAoe,zoneHoleSpares} from '../src/engine/world';
import {makeSkillInstance,instanceDelivery,instanceMods,skillContextTags,grantedTags,bandSwingGeo,type ProjectileDelivery} from '../src/engine/skills';
import {caromCapacity} from '../src/engine/payloadCues';
const restore=seedGlobalRandom(0x4d3312),courses:unknown[]=[];
const variants=[{name:'fan'},{name:'count-range',delivery:{count:[1,4]},stats:{projectileCountChance:1}},
  {name:'salvo',delivery:{fire:'salvo'}},{name:'cursor-salvo',delivery:{origin:'cursor',originRange:80,fire:'salvo'}},
  {name:'volley',delivery:{fire:'volley',volleySpacing:20}},{name:'ring',delivery:{ring:{}}},
  {name:'fixed-ring',delivery:{ring:{phaseJitter:false}}},{name:'aim-spread',delivery:{spreadByAim:{range:200,near:5,far:50}}},
  {name:'nova',delivery:{fire:'salvo',ring:{}},stats:{projNova:2}},
  {name:'precedence',delivery:{fire:'fan',ring:{}},stats:{fireSalvo:1,fireVolley:1}},
  {name:'anchors',delivery:{caroms:{anchors:2,window:4}}}];
try{
  for(const recipe of variants){
    const w=makeSimWorld('warrior',0x4d3312),a=new Actor('emitter','ally',{x:800,y:600});w.walk=null;w.meta.modeId='immortal';w.actors=[a];a.facing=.3;
    const d={type:'projectile',speed:250,radius:3,range:600,count:3,...recipe.delivery} as ProjectileDelivery;
    const skill=makeSkillInstance({id:'m3-'+recipe.name,name:recipe.name,description:'',color:'#fff',tags:['spell'],manaCost:0,useTime:0,cooldown:0,delivery:d,effects:[{type:'damage'}]},1);a.skills=[skill];
    for(const [key,n]of Object.entries(recipe.stats??{}))a.sheet.setBase(key,n);
    const tags=skillContextTags(skill,grantedTags(skill)),extra=instanceMods(skill),stats=Object.fromEntries(['projectileCount','projectileCountChance','castAtCursor','projNova','fireSalvo','fireVolley','volleySpacing','spreadAngle'].map(key=>[key,a.sheet.get(key,tags,extra)]));
    const random=mulberry32(23),draws:number[]=[],oldRandom=Math.random;Math.random=()=>{const value=random();draws.push(value);return value;};
    const original=w.spawnProjectile,emissions:unknown[]=[],steps:unknown[]=[];
    // Instrument the release seam while still executing the original moving
    // projectile factory. This qualifies release arrangement, not flight.
    w.spawnProjectile=function(...args:Parameters<typeof original>){
      const [caster,inst,at,direction,options]=args;
      const row={caster:caster.id,skill:inst.def.id,at:{...at},direction,options:JSON.parse(JSON.stringify(options)),before:draws.length,after:0};
      emissions.push(row);const result=original.apply(this,args);row.after=draws.length;return result;
    };
    try{
      for(let use=0;use<(recipe.name==='anchors'?2:1);use++){
        const aim={x:900+use*60,y:640},start=emissions.length,drawStart=draws.length;w.time=10+use;
        assert(w.executeSkill(a,skill,aim,{noRepeat:true,noCooldown:true,keepFacing:true,dmgMult:1.2}));
        steps.push({aim,time:w.time,drawStart,drawEnd:draws.length,emissions:emissions.slice(start),anchors:skill.state?.anchors?.map(p=>({...p})),anchorsAt:skill.state?.anchorsAt,
          salvos:w.pendingSalvos.map(s=>({aim:s.aim,origin:s.origin,shots:s.shots,timer:s.timer,interval:s.interval,mult:s.mult,flat:s.flat}))});
      }
      courses.push({name:recipe.name,casterId:a.id,skillId:skill.def.id,delivery:instanceDelivery(skill),speed:a.speedFactor(skill),capacity:caromCapacity(a,skill),stats,draws,steps});
    }finally{w.spawnProjectile=original;Math.random=oldRandom;}
  }
  const geometry:unknown[]=[];
  for(const shape of[0,1,2,3,4,5])for(const facing of[0,.4,2])for(const radius of[0,20])for(const bodyRadius of[-3,0,3])for(const point of[{x:0,y:0},{x:20,y:0},{x:21,y:1},{x:-10,y:10},{x:0,y:30}]){
    geometry.push({shape,facing,radius,bodyRadius,point,inside:inAoe({x:0,y:0},radius,shape,facing,point,bodyRadius),
      hole:zoneHoleSpares({pos:{x:0,y:0},radius,shape,facing,edge:.5},point,Math.abs(bodyRadius))});
  }
  const bands=[0,.4,Math.PI,4,Math.PI*2].map(arc=>({arc,expected:bandSwingGeo(100,arc)}));
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,courses,geometry,bands}));
}finally{restore();}
