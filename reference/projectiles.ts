import {writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom,mulberry32} from '../src/sim/rng';import {Actor} from '../src/engine/actor';
import {makeSkillInstance,type SkillDef,type ProjectileDelivery,SEQUEL_CFG} from '../src/engine/skills';import {FOURTH_WALL_CFG} from '../src/engine/fourthwall';import {SEG_CFG} from '../src/engine/segments';
const restore=seedGlobalRandom(0x4d3321),courses:unknown[]=[];
const recipes=[
  {name:'straight'},{name:'homing',delivery:{trajectory:{homing:2}}},{name:'guide',delivery:{trajectory:{guide:3}}},
  {name:'erratic',delivery:{trajectory:{erratic:.8}}},{name:'spiral',delivery:{trajectory:{spiral:1.4,erratic:.3,guide:1}}},
  {name:'orbit-spin-weave',delivery:{trajectory:{orbit:2,orbitRadius:30,spin:8,weave:2,amplitude:12}}},
  {name:'zigzag',delivery:{trajectory:{zigzag:{interval:.1,angleDeg:30,shed:1}}}},
  {name:'acceleration',delivery:{duration:.35,trajectory:{accel:-2}},stats:{projPulse:.4}},
  {name:'arc-to',delivery:{trajectory:{arcTo:4}},dest:{x:830,y:600}},
  {name:'patrol',delivery:{duration:.4,trajectory:{bounce:2,frameBounce:2}},patrol:[{x:800,y:600},{x:840,y:600},{x:840,y:630}]},
  {name:'return',delivery:{range:12,returns:'caster',catch:{charge:'blade',amount:1,max:4}},stats:{projReturn:2}},
  {name:'emitter',delivery:{duration:.4,emit:{skillId:'firebolt',interval:.1,inherit:.5}},stats:{projInherit:.5}},
  {name:'trail',delivery:{trail:{every:15,zone:{radius:20,duration:2,sizeOver:{from:.5,to:2},durationBySpeed:{ref:100,exp:2}}}}},
  {name:'fissure',delivery:{range:35,fissureTrail:{radius:12,linger:1,close:{delay:.2,damageScale:.6}}}},
  {name:'end-zone',delivery:{range:20,endZone:{radius:25,duration:2,seek:{speed:10},sizeOver:{from:.4,to:1.5}}}},
  {name:'aura-conversion',delivery:{aura:{radius:35,dps:4,damageType:'fire'}},stats:{convert_fire_cold:.5}},
  {name:'contact',foes:true},{name:'pierce',foes:true,delivery:{pierce:2}},
  {name:'chain',foes:true,stats:{chainCount:2}},{name:'fork',foes:true,delivery:{forks:1}},
  {name:'rehit',foes:true,delivery:{speed:0,rehit:.2}},{name:'recurve',foes:true,delivery:{trajectory:{recurve:{chance:1,decay:.5}}}},
  {name:'shatter',foes:true,delivery:{shatter:{skillId:'firebolt',count:2,spreadDeg:50}}},
  {name:'explosion',foes:true,delivery:{explode:{radius:45,damageScale:.5}}},
  {name:'selective-pierce',foes:true,delivery:{trajectory:{selectivePierce:true},pierce:2}},
  {name:'deflect-dome',dome:'deflect'},{name:'slow-dome',dome:'slow'},{name:'dissolve-dome',dome:'dissolve'},
];
function plain(value:unknown):unknown{return JSON.parse(JSON.stringify(value,(k,v)=>k==='caster'||k==='anchor'&&v?.id!==undefined?v?.id:k==='inst'||k==='emitInst'?v?.def.id:v instanceof Map?[...v]:v instanceof Set?[...v]:typeof v==='number'&&!Number.isFinite(v)?String(v):v));}
try{for(const r of recipes){
  const w=makeSimWorld('warrior',0x4d3321),a=new Actor('flight','ally',{x:800,y:600});w.walk=null;w.meta.modeId='immortal';w.actors=[a];w.projectiles=[];w.zones=[];w.time=0;a.aimPos={x:850,y:640};a.facing=0;
  const d={type:'projectile',speed:100,radius:6,range:500,...r.delivery} as ProjectileDelivery;
  const definition={id:'m3-'+r.name,name:r.name,description:'',color:'#fff',tags:['spell'],baseDamage:{physical:[2,4]},manaCost:0,useTime:0,cooldown:0,delivery:d,effects:[{type:'damage'}]} as SkillDef;
  const i=makeSkillInstance(definition,1);a.skills=[i];for(const [k,v]of Object.entries(r.stats??{}))a.sheet.setBase(k,v);
  if(r.foes)for(const x of[810,840,880]){const b=new Actor('foe','enemy',{x,y:600});b.sheet.setBase('life',100000);b.fillResources();w.actors.push(b);}
  if(r.dome){const dome=new Actor('dome','enemy',{x:815,y:600});dome.construct={kind:'dome',range:0,timer:0,domeRadius:80,domeMode:r.dome as 'deflect'|'slow'|'dissolve',domeSlow:.3};w.actors.push(dome);}
  const initial=w.actors.map(b=>({id:b.id,team:b.team,pos:{...b.pos},radius:b.radius,tier:b.tier,color:b.color,construct:b.construct,life:b.life,mana:b.mana,reservedMana:b.reservedMana,es:b.es,poise:b.poise}));
  const random=mulberry32(73),draws:number[]=[],old=Math.random,hits:unknown[]=[],resolve=w.resolveHit;Math.random=()=>{const v=random();draws.push(v);return v;};
  w.resolveHit=function(...args:Parameters<typeof resolve>){const row={args:args.map((arg,n)=>n===0||n===2?(arg as Actor).id:n===1?(arg as typeof i).def.id:plain(arg??null)),before:draws.length,after:0,hitFlashType:undefined as string|undefined};hits.push(row);const result=resolve.apply(this,args);row.after=draws.length;row.hitFlashType=args[2].hitFlashType;return result;};
  const steps:unknown[]=[];
  try{w.spawnProjectile(a,i,a.pos,0,{mult:1.5,flat:{fire:2},dest:r.dest,patrol:r.patrol});steps.push({dt:0,drawEnd:draws.length,projectiles:plain(w.projectiles),zones:plain(w.zones)});
    for(const dt of[.1,.1,.15,.1,.2]){w.time+=dt;w.updateProjectiles(dt);steps.push({dt,drawEnd:draws.length,projectiles:plain(w.projectiles),zones:plain(w.zones)});}
  }finally{Math.random=old;w.resolveHit=resolve;}
  assert(draws.every(v=>v>=0&&v<1));courses.push({name:r.name,definition,stats:r.stats??{},initial,dest:r.dest,patrol:r.patrol,draws,hits,steps});
}
writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,rules:{childDepthMax:2,auraTick:.3,shrapnelSkill:'shrapnel_shard',catchSpotLook:'construct_axe_catch',headSegment:SEG_CFG.HEAD,frameEdgePad:FOURTH_WALL_CFG.proj.edgePad,frameFlashPad:FOURTH_WALL_CFG.proj.flashPad,sequelMaxDepth:SEQUEL_CFG.maxDepth,elementColors:{}},courses}));
}finally{restore();}
