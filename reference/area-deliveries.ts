import {writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';import {Actor} from '../src/engine/actor';
import {makeSkillInstance,type SkillDef} from '../src/engine/skills';
const restore=seedGlobalRandom(0x4d3313),courses:unknown[]=[];
const recipes=[{name:'melee',delivery:{type:'melee',range:70,arcDeg:90}},
  {name:'band',delivery:{type:'melee',range:70,arcDeg:90,shape:'band'}},
  {name:'reverb',delivery:{type:'melee',range:20,arcDeg:30},stats:{meleeReverb:2}},
  {name:'sweep',delivery:{type:'melee',range:70,arcDeg:90},stats:{meleeSweep:1}},
  {name:'cone',delivery:{type:'cone',range:100,arcDeg:60,occlusion:'free'}},
  {name:'triangle',delivery:{type:'cone',range:100,arcDeg:60,occlusion:'free'},stats:{aoeShape:2}},
  {name:'cone-edge',delivery:{type:'cone',range:100,arcDeg:90,edgeOnly:.6,occlusion:'free'}},
  {name:'nova',delivery:{type:'nova',radius:100,occlusion:'free'}},
  {name:'nova-all',delivery:{type:'nova',radius:100,affects:'all',spareCaster:true,occlusion:'free'}},
  {name:'nova-limit',delivery:{type:'nova',radius:100,maxTargets:1,requiresStatus:['slow'],occlusion:'free'}},
  {name:'nova-edge',delivery:{type:'nova',radius:100,edgeOnly:.6,occlusion:'free'}},
  {name:'consume',delivery:{type:'detonateProjectile',radius:60,consumeBonus:3}}];
try{
  for(const recipe of recipes){
    const w=makeSimWorld('warrior',0x4d3313),a=new Actor('area','ally',{x:800,y:600});w.walk=null;w.meta.modeId='immortal';w.zones=[];w.actors=[a];a.facing=0;
    const skill=makeSkillInstance({id:'m3-'+recipe.name,name:recipe.name,description:'',color:'#fff',tags:['spell'],manaCost:0,useTime:0,cooldown:0,delivery:recipe.delivery as SkillDef['delivery'],effects:[]},1);a.skills=[skill];
    const base={meleeReach:1,swingArc:1,aoeRadius:1,sweepSpeed:1,sweepRange:1,effectDuration:1};
    for(const [key,n]of Object.entries({...base,...recipe.stats}))a.sheet.setBase(key,n);
    const traits=[{x:10,y:0},{x:80,y:0,slow:true},{x:60,y:60},{x:-10,y:0},{x:101,y:0},{x:40,y:0,tier:1},{x:20,y:0,ally:true}];
    const bodies=traits.map((t,n)=>{const b=new Actor('body-'+n,t.ally?'ally':'enemy',{x:800+t.x,y:600+t.y});b.radius=5;b.tier=t.tier??0;
      if(t.slow)b.applyStatus('slow',0,1,'reference');w.actors.push(b);return b;});
    const stats=Object.fromEntries(['aoeShape','meleeReach','sweepSpeed','sweepRange','effectDuration','meleeReverb','meleeSweep'].map(key=>[key,a.sheet.get(key)]));
    if(recipe.name==='band')delete stats.aoeShape;
    const hit=w.resolveHit,drop=w.dropLingerField,hits:unknown[]=[],fields:unknown[]=[];
    w.resolveHit=function(...args:Parameters<typeof hit>){hits.push({target:args[2].id,mult:args[3],depth:args[4],flat:args[5]});return hit.apply(this,args);};
    w.dropLingerField=function(...args:Parameters<typeof drop>){fields.push({...args[2]});return drop.apply(this,args);};
    if(recipe.name==='consume')w.projectiles.push({caster:a,inst:skill,pos:{x:820,y:600}} as typeof w.projectiles[number]);
    const enemies=w.enemiesOf(a).map(b=>b.id),aim={x:820,y:600};
    try{
      assert(w.executeSkill(a,skill,aim,{noRepeat:true,noCooldown:true,keepFacing:true,dmgMult:2}));
      courses.push({name:recipe.name,delivery:recipe.delivery,caster:{id:a.id,radius:a.radius},bodies:bodies.map(b=>({id:b.id,pos:b.pos,radius:b.radius,tier:b.tier,team:b.team,statuses:b.statuses.map(s=>({id:s.id}))})),
        stats,enemies,aim,hits,fields,projectiles:w.projectiles.length,zones:w.zones.map(z=>({pos:z.pos,radius:z.radius,linger:z.linger,shape:z.shape,facing:z.facing,drift:z.drift,arcRad:z.arcRad,struck:[...z.struck??[]]}))});
    }finally{w.resolveHit=hit;w.dropLingerField=drop;}
  }
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,courses}));
}finally{restore();}
