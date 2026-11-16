import {writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
import {makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';import {Actor} from '../src/engine/actor';
import {makeSkillInstance,instanceMods,instanceInnateMods,skillContextTags,CONSTRUCT_KIND_AIMS,type ConstructDelivery,type SkillDef} from '../src/engine/skills';
import {CONSTRUCT_LOOKS} from '../src/data/looks';import {DEFENSE_CFG} from '../src/engine/defense';import {STAT_DEFS,STAT_TRADES} from '../src/engine/stats';
const restore=seedGlobalRandom(0x4d3320),courses:unknown[]=[],base={type:'construct',kind:'totem',range:200,duration:4,maxActive:2};
const recipes=[{name:'totem',d:base},{name:'self-payload',d:base,self:true},{name:'charged',d:{...base,kind:'sentry',interval:1},scale:3},
  {name:'embed',d:{...base,kind:'embed',embed:{runOver:'collect',collect:{amount:1,charge:'fury'},icd:.5},invulnerable:true}},
  {name:'dome',d:{...base,kind:'dome',domeMode:'slow',domeSlow:.2,domeRadius:90},stats:{domeDeflects:1}},
  {name:'tree',d:{...base,kind:'tree',healBurst:{ratio:.1,cap:200,radius:60}}},
  {name:'gate',d:{...base,kind:'gate'},count:2},
  {name:'aura',d:{...base,kind:'pylon',aura:{radius:80,allyMods:[{stat:'life',kind:'flat',value:4}]}}},
  {name:'capacity',d:{...base,maxActive:1},count:2},
  {name:'pod',d:{...base,kind:'pod',hatch:{skillId:'firebolt',onBreak:'hatch'},breakable:{ownerMult:3},deathBurst:{radius:30,fraction:.1},follows:true,castOnStruck:true,taunt:true}},
];
const sources={attributes:[{stat:'damage',kind:'increased',value:.2}],class:[{stat:'life',kind:'flat',value:10}],passives:[{stat:'mana',kind:'flat',value:5}]};
function snapshot(a:Actor){return{pos:a.pos,radius:a.radius,tier:a.tier,level:a.level,sourceSkillId:a.sourceSkillId,shape:a.shape,color:a.color,look:a.look,aims:a.aims,taunt:a.taunt,
  untargetable:a.untargetable,invulnerable:a.invulnerable,lifespan:a.lifespan,explodeOnDeath:a.explodeOnDeath,gateLink:a.gateLink,dead:a.dead,
  construct:{...a.construct,castInst:a.construct?.castInst?.def.id},life:a.life,mana:a.mana,
  sources:Object.fromEntries(['inherited','parentSkill','owner','constructCastRate'].map(s=>[s,a.sheet.getSourceMods(s)])),
  auras:[...a.activeAuras].map(([key,aura])=>[key,{...aura,inst:aura.inst.def.id,affected:[...aura.affected],remaining:String(aura.remaining)}])};}
try{for(const r of recipes){
  const w=makeSimWorld('warrior',0x4d3320),a=new Actor('owner','ally',{x:800,y:600});w.walk=null;w.meta.modeId='immortal';w.actors=[a];a.tier=2;a.level=7;
  const def={id:'m3-'+r.name,name:r.name,description:'',color:'#fff',tags:['spell','construct'],innateMods:[{stat:'damage',kind:'increased',value:.4}],manaCost:0,useTime:0,cooldown:0,delivery:r.d,effects:[]} as SkillDef;
  const i=makeSkillInstance(def,1),payload=r.self?i:makeSkillInstance({...def,id:'m3-payload',innateMods:[]},1);a.skills=[i];
  const stats={minionDamage:1.2,minionLife:1.5,constructCastRate:2,effectDuration:1.5,aoeRadius:1.2,...r.stats};for(const [key,v]of Object.entries(stats))a.sheet.setBase(key,v);
  for(const [key,mods]of Object.entries(sources))a.sheet.setSource(key,mods as Parameters<typeof a.sheet.setSource>[1]);
  const born:Actor[]=[];for(let n=0;n<(r.count??1);n++){const b=w.spawnConstruct(a,i,r.d as ConstructDelivery,{x:1000,y:600},payload,undefined,r.scale??1);assert(b);born.push(b);}
  courses.push({name:r.name,stats,delivery:r.d,scale:r.scale??1,self:!!r.self,tags:[...skillContextTags(i)],extra:instanceMods(i),innate:instanceInnateMods(i),
    casterId:a.id,ids:born.map(b=>b.id),expected:born.map(snapshot)});
}
writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,definitions:STAT_DEFS,trades:STAT_TRADES,sources,rules:{looks:CONSTRUCT_LOOKS,aims:CONSTRUCT_KIND_AIMS,weight:DEFENSE_CFG.weight},courses}));
}finally{restore();}
