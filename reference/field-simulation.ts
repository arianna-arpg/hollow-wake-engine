import {writeFileSync} from 'node:fs';import {makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';import {Actor} from '../src/engine/actor';
import {makeSkillInstance,type SkillDef} from '../src/engine/skills';import {LOS_CFG} from '../src/engine/los';import {PRESENCE_STYLE} from '../src/data/skillPresenceVisuals';import {MADDEN_CFG} from '../src/engine/world';
const restore=seedGlobalRandom(0x4d3321),courses:unknown[]=[];
const pulse={delay:.2,interval:.2,intervalStep:.5,dmgMult:2,dmgStep:.5,radiusMult:1,radiusStep:1,left:2,next:0,queue:[{delay:.3,dmgMult:3,radiusMult:2}]};
const recipes=[
  {name:'impact',patch:{linger:0},steps:[{dt:.1}]},
  {name:'pulse',patch:{pulse,linger:1.5,tickInterval:Infinity,tickTimer:Infinity},steps:[{dt:.1},{dt:.2},{dt:.7},{dt:.5}]},
  {name:'exposure',patch:{exploded:true,exposure:{after:.3,dwell:new Map()},domain:{enemyMods:[{stat:'damage',kind:'flat',value:3}]},domainKey:'domain:0',exposureDomain:true},steps:[{dt:.2},{dt:.2},{dt:.1},{dt:.1,away:true},{dt:.2}]},
  {name:'rearm',patch:{exploded:true,struck:new Set(),rearm:true},steps:[{dt:.2},{dt:.2},{dt:.2,away:true},{dt:.2,away:false}]},
  {name:'follow',patch:{exploded:true,follow:true,reserved:10},steps:[{dt:.2},{dt:.1,dead:true}]},
  {name:'envelope',patch:{exploded:true,sizeOver:{from:1,to:0,curve:'smooth'},radius0:50,rotate:1,endBurst:{damageScale:3}},steps:[{dt:.25},{dt:.25},{dt:.25},{dt:.25}]},
  {name:'pull',patch:{exploded:true,pull:100},steps:[{dt:.1},{dt:.1}]},
  {name:'staggered',patch:{armed:true,armSeq:0,delay:9999},storm:true,steps:[{dt:.2},{dt:.1,release:true},{dt:.2}]},
  {name:'pattern-cancel',patch:{attackPattern:true,reserved:10},steps:[{dt:.2,dead:true}]},
  {name:'scatter',patch:{linger:0},scatter:2,steps:[{dt:.1},{dt:.3},{dt:.2}]},
];
function plain(value:unknown):unknown{return JSON.parse(JSON.stringify(value,(k,v)=>['caster','anchor'].includes(k)?v?.id:['inst','emitInst'].includes(k)?v?.def.id:v instanceof Set?[...v].map(x=>typeof x==='object'?x.id:x):v instanceof Map?[...v]:typeof v==='number'&&!Number.isFinite(v)?String(v):v));}
try{for(const r of recipes){
  const w=makeSimWorld('warrior',0x4d3321),a=new Actor('caster','ally',{x:800,y:600});a.kind='player';w.walk=null;w.meta.modeId='immortal';w.actors=[a];w.zones=[];w.time=0;a.reservedMana=10;
  const i=makeSkillInstance({id:'m3-'+r.name,name:r.name,description:'',color:'#fff',tags:['spell'],manaCost:0,useTime:0,cooldown:0,
    delivery:r.storm?{type:'storm',count:1,interval:.2,areaRadius:50,hitRadius:50,castRange:100,awaitRelease:{order:'placed',interval:.1}}:{type:'ground',radius:50,castRange:100,occlusion:'free'},effects:[]} as SkillDef,1);a.skills=[i];
  if(r.storm)a.casting={mode:'channel',inst:i} as NonNullable<typeof a.casting>;a.sheet.setBase('aoeScatter',r.scatter??0);
  const victims=[{x:830,y:600,tier:0},{x:830,y:600,tier:1},{x:900,y:600,tier:0}].map(p=>{const b=new Actor('foe','enemy',p);b.radius=5;b.tier=p.tier;w.actors.push(b);return b;});
  const initial={pos:{x:800,y:600},radius:50,caster:a,inst:i,color:'#fff',delay:0,exploded:false,linger:1,linger0:1,tickInterval:.1,tickTimer:0,shape:0,facing:0,dmgMult:2,depth:0,...structuredClone(r.patch)};
  w.zones.push(initial);const init=plain(initial),hits:unknown[]=[],snapshots:unknown[]=[],draws:number[]=[],random=Math.random,hit=w.resolveHit;
  w.resolveHit=function(...args:Parameters<typeof hit>){const row={target:args[2].id,mult:args[3],depth:args[4],force:args[6],origin:args[9]?{...args[9]}:undefined,tier:args[10],before:draws.length,after:0};hits.push(row);const result=hit.apply(this,args);row.after=draws.length;return result;};
  Math.random=()=>{const n=random();draws.push(n);return n;};
  try{for(const step of r.steps){if(step.dead)a.dead=true;if(step.release)a.casting=undefined;if(step.away!==undefined)victims[0].pos={x:step.away?1100:830,y:600};
    w.time+=step.dt;w.updateZones(step.dt);snapshots.push(plain({time:w.time,zones:w.zones,hits:[...hits],reserved:a.reservedMana,victims:victims.map(v=>({pos:v.pos,domain:v.sheet.getSourceMods('domain:0')})),draws:draws.length}));
  }}finally{Math.random=random;w.resolveHit=hit;}
  courses.push({name:r.name,casterId:a.id,skill:i.def,initial:init,steps:r.steps,scatter:r.scatter??0,storm:!!r.storm,enemies:w.enemiesOf(a).map(b=>b.id),victims:victims.map((v,n)=>({id:v.id,tier:n===1?1:0,pos:{x:n===2?900:830,y:600},radius:5})),draws,snapshots});
}
writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,rules:{expireCueSeconds:PRESENCE_STYLE.expire,maddenEpsilon:MADDEN_CFG.epsilon,occludingDeliveries:LOS_CFG.zoneTickTypes},courses}));
}finally{restore();}
