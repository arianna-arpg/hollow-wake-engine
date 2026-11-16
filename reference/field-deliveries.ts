import {writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';import {Actor} from '../src/engine/actor';
import {makeSkillInstance,instanceMods,skillContextTags,grantedTags,instancePulsePlan,instanceCascadePlan,instanceSizeOver,socketSpec,type SkillDef,CONSTRUCT_FORWARD_CFG} from '../src/engine/skills';
import {CONJURE_CFG} from '../src/engine/flux';
const restore=seedGlobalRandom(0x4d3319),courses:unknown[]=[];
const ground={type:'ground',radius:40,castRange:200,occlusion:'free'},storm={type:'storm',count:3,interval:.5,areaRadius:80,hitRadius:20,castRange:200,occlusion:'free'};
const recipes=[
  {name:'ground',delivery:{...ground,lingerDuration:3,pull:2,pullRadius:90,follow:true,seek:{speed:10},leaveTerrain:{kind:'ice',radius:40,duration:2}}},
  {name:'line',delivery:{...ground,line:{segments:4,spacing:35},lingerDuration:2,hitOnce:true,rearmOnExit:true}},
  {name:'square-line',delivery:{...ground,line:{segments:4,spacing:35},shape:'square',delay:.4}},
  {name:'triangle-line',delivery:{...ground,line:{segments:5,spacing:35},shape:'triangle'}},
  {name:'pulse',delivery:{...ground,pulse:{delay:.4,count:3,interval:.3,intervalStep:.5,dmgMult:2,dmgStep:.7,radiusMult:1.2,radiusStep:.8}}},
  {name:'sweep',delivery:{...ground,sweep:{arcDeg:180,converge:true},lingerDuration:2,hitOnce:true,exposure:1,exposureDomain:true,domain:{allyMods:[]},emit:{skillId:'firebolt',interval:.5},marker:{cap:2}}},
  {name:'cascade',delivery:{...ground,cascade:{count:4,dir:'axis',step:40,scaleStep:.8,dmgStep:.6,interval:.2,intervalStep:.5},sizeOver:{from:.5,to:2,curve:'smooth'},lingerDuration:2}},
  {name:'cascade-random',delivery:{...ground,cascade:{count:4,dir:'random',step:40,interval:0},pulse:{delay:.5,count:2}}},
  {name:'cascade-extra',delivery:{...ground,delay:.4},stats:{aoeCascade:2,cascadeStep:1.5}},
  {name:'hex',delivery:{...ground,shape:'crescent',arcDeg:60},curse:true,stats:{hedonism:1,hexBlast:2}},
  {name:'exclusive',delivery:{...ground,exclusive:true,lingerDuration:3},casts:2},
  {name:'marker',delivery:{...ground,marker:{cap:2},delay:3},casts:3},
  {name:'storm',delivery:storm},
  {name:'storm-instant',delivery:{...storm,count:[2,4],interval:0,telegraph:.2,sky:true,lob:{arc:.4}}},
  {name:'storm-enemies',delivery:{...storm,atEnemies:true,scatter:10,fx:'blast'}},
  {name:'storm-armed',delivery:{...storm,awaitRelease:{order:'placed',interval:.1}},armed:true},
];
function snapshot(value:unknown):unknown{return JSON.parse(JSON.stringify(value,(key,v)=>key==='caster'||key==='anchor'?v?.id:key==='inst'||key==='emitInst'?v?.def.id:v instanceof Set?[...v]:v instanceof Map?[...v]:typeof v==='number'&&!Number.isFinite(v)?String(v):v));}
try{for(const r of recipes){
  const w=makeSimWorld('warrior',0x4d3319),a=new Actor('fields','ally',{x:800,y:600});w.walk=null;w.meta.modeId='immortal';w.actors=[a];w.zones=[];w.time=7;a.facing=0;
  const i=makeSkillInstance({id:'m3-'+r.name,name:r.name,description:'',color:'#fff',tags:['spell',...(r.curse?['curse']:[])],manaCost:0,useTime:0,cooldown:0,delivery:r.delivery as SkillDef['delivery'],effects:[]},1);a.skills=[i];
  const defined={aoeRadius:1,aoeArc:1,effectDuration:1,cascadeStep:1,...r.stats};for(const [key,v]of Object.entries(defined))a.sheet.setBase(key,v);
  const tags=skillContextTags(i,grantedTags(i)),extra=instanceMods(i),stats=Object.fromEntries(['effectDuration','stormCount','stormImmediate','pulseCount','aoeSpin','aoeCascade','cascadeStep','hedonism','hexBlast','fissureCount','fissureBranches'].map(k=>[k,a.sheet.get(k,tags,extra)]));
  const bodies=[{x:830,y:600},{x:845,y:620},{x:805,y:600},{x:1200,y:600}].map(pos=>{const b=new Actor('foe','enemy',pos);w.actors.push(b);return b;});
  if(r.armed)a.casting={mode:'channel',inst:i} as NonNullable<typeof a.casting>;
  const aim={x:830,y:600},draws:number[]=[],random=Math.random,expired:unknown[]=[],expire=w.expireZone;
  w.expireZone=function(z){expired.push(snapshot(z));return expire.call(this,z);};Math.random=()=>{const v=random();draws.push(v);return v;};
  try{for(let n=0;n<(r.casts??1);n++)assert(w.executeSkill(a,i,aim,{noRepeat:true,noCooldown:true,keepFacing:true,dmgMult:2}));}
  finally{Math.random=random;w.expireZone=expire;}
  courses.push({name:r.name,casterId:a.id,delivery:r.delivery,aim,casts:r.casts??1,armed:r.armed,tags:[...tags],stats,aoeScale:a.sheet.get('aoeRadius',tags,extra),arcScale:a.sheet.get('aoeArc',tags,extra),
    pulse:instancePulsePlan(i),cascade:instanceCascadePlan(i,'axis'),size:instanceSizeOver(i),cadence:socketSpec(i,'cadence'),bodies:bodies.map(b=>({id:b.id,pos:b.pos})),draws,
    zones:snapshot(w.zones),expired});
}
writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,rules:{conjure:{lineStep:CONJURE_CFG.lineStep,lineMaxHops:CONJURE_CFG.lineMaxHops},forwarding:CONSTRUCT_FORWARD_CFG},courses}));
}finally{restore();}
