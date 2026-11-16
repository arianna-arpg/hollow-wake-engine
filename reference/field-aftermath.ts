import {writeFileSync} from 'node:fs';import {makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom,mulberry32} from '../src/sim/rng';import {Actor} from '../src/engine/actor';
import {makeSkillInstance,skillContextTags,instanceMods,type SkillDef,type SupportDef} from '../src/engine/skills';
const restore=seedGlobalRandom(0x4d3322),courses:unknown[]=[];
const fissure={type:'ground',castRange:300,radius:12,fissure:{length:140,speed:100,step:20,close:{delay:.2,damageScale:.8}}};
const recipes=[
  {name:'pulse-cascade',method:'mintAftermath',sockets:[{pulse:{count:2,delay:.3,interval:.2,dmgMult:1.2}},{pulse:{count:2,delay:.1,interval:.1}},{cascade:{count:2,dir:'forward',step:30}},{cascade:{count:1,dir:'axis',step:35}}]},
  {name:'random-cascade',method:'mintAftermath',sockets:[{cascade:{count:3,dir:'random',step:30}}]},
  {name:'stat-pulse',method:'mintAftermath',stats:{pulseCount:2,aoeCascade:2,cascadeStep:.7}},
  {name:'cadence',method:'mintAftermath',sockets:[{pulse:{count:4,delay:.5,intervalStep:.8}},{cadence:{intervalStep:.5}}]},
  {name:'linger',method:'dropLingerField',stats:{lingerField:2,effectDuration:1.4,aoeRadius:1.5}},
  {name:'heal-linger',method:'dropLingerField',stats:{lingerField:1},sockets:[{healField:{amount:3}},{zoneEmit:{skillId:'firebolt',interval:.5}},{zoneSizeOver:{from:.5,to:2,curve:'smooth'}}]},
  {name:'trail',method:'mintTrailPatch',trail:{radius:25,duration:2.5,damageScale:.3,sizeOver:{from:.5,to:2,curve:'quadOut'}}},
  {name:'fissure',method:'layFissure',delivery:fissure},
  {name:'fissure-branches',method:'layFissure',delivery:{...fissure,lingerDuration:2},branches:2},
  {name:'fissure-orbit',method:'layFissure',delivery:fissure,sockets:[{fissurePath:{kind:'orbit'}}],fan:1},
  {name:'fissure-spiral',method:'layFissure',delivery:fissure,sockets:[{fissurePath:{kind:'spiral',turns:1.2}}]},
  {name:'fissure-serpent',method:'layFissure',delivery:fissure,sockets:[{fissurePath:{kind:'serpent',waveDeg:30}}]},
  {name:'fissure-textures',method:'layFissure',delivery:{...fissure,emit:{skillId:'firebolt',interval:.4}},sockets:[{fissureVolatile:{interval:.5,chance:.5,damageScale:.2}},{fissureAftershock:{damageScale:.6,rearm:.2}},{fissureRoulette:{interval:.5,chance:.2,window:.3,damageScale:2}},{fissureReclose:{times:2,chance:1,interval:.4,damageScale:.5}},{exposure:{after:.3}},{cadence:{intervalStep:.9}}]},
];
const plain=(value:unknown)=>JSON.parse(JSON.stringify(value,(key,v)=>key==='caster'?v.id:key==='inst'?v.def.id:v instanceof Map?[...v]:v instanceof Set?[...v]:typeof v==='number'&&!Number.isFinite(v)?String(v):v));
try{for(const r of recipes){const w=makeSimWorld('warrior',0x4d3322),a=new Actor('aftermath','ally',{x:800,y:600});w.walk=null;w.actors=[a];w.zones=[];w.time=4;a.facing=.3;
  const definition={id:'m3-'+r.name,name:r.name,description:'',color:'#fff',tags:['spell','aoe'],manaCost:0,useTime:0,cooldown:0,delivery:r.delivery??{type:'nova',radius:30},effects:[]} as SkillDef;
  const sockets=(r.sockets??[]).map((spec,k)=>({level:1,def:{id:'support-'+k,name:'Support',description:'',color:'#fff',mods:[],...spec} as SupportDef}));
  const i=makeSkillInstance(definition,1);i.sockets=sockets;for(const[k,v]of Object.entries(r.stats??{}))a.sheet.setBase(k,v);
  const tags=skillContextTags(i),extra=instanceMods(i),draws:number[]=[],rng=mulberry32(31),old=Math.random;Math.random=()=>{const v=rng();draws.push(v);return v;};
  const at={x:840,y:620};try{
    if(r.method==='mintAftermath')w.mintAftermath(a,i,at,30,0,.3,1.5,tags,extra,1,.2,.7);
    else if(r.method==='dropLingerField')w.dropLingerField(a,i,at,1.5);
    else if(r.method==='mintTrailPatch')w.mintTrailPatch(a,i,r.trail!,at,.3);
    else w.layFissure(a,i,at,.3,r.delivery as never,1.5,{fire:2},r.branches??0,r.fan??0);
  }finally{Math.random=old;}
  courses.push({name:r.name,method:r.method,definition,sockets,stats:r.stats??{},trail:r.trail,branches:r.branches??0,fan:r.fan??0,draws,casterId:a.id,zones:plain(w.zones)});
}writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,courses}));}finally{restore();}
