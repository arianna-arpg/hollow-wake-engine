import {writeFileSync} from 'node:fs';import {makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';import {Actor} from '../src/engine/actor';
import {makeSkillInstance,type SkillDef,type TargetingSpec} from '../src/engine/skills';import {MONSTERS} from '../src/data/monsters';import {CORPSE_CFG} from '../src/engine/world';
const restore=seedGlobalRandom(0x4d3323),courses:unknown[]=[],beast=Object.values(MONSTERS).find(d=>d.tags?.includes('beast'))!.id;
const recipes=[
  {name:'cursor-enemy',target:'enemy',aim:{x:850,y:600}},
  {name:'auto-enemy',target:'enemy',aim:{x:1500,y:600}},
  {name:'status',target:'enemy',required:'poison',aim:{x:820,y:600}},
  {name:'taxonomy',target:'enemy',taxonomy:true,aim:{x:820,y:600}},
  {name:'ally-cursor',target:'ally',heal:true,aim:{x:830,y:600}},
  {name:'ally-triage',target:'ally',heal:true,aim:{x:1500,y:600}},
  {name:'own-minion',target:'minion',aim:{x:1500,y:600}},
  {name:'corpse-single',target:'corpse',aim:{x:840,y:600}},
  {name:'corpse-batch',target:'corpse',plural:true,aim:{x:840,y:600},stats:{corpseBatch:2}},
  {name:'corpse-minion',target:'corpse',empty:true,aim:{x:840,y:600},stats:{targetMinionFallback:1}},
  {name:'corpse-none',target:'corpse',empty:true,aim:{x:840,y:600}},
  {name:'grimoire',target:'corpse',empty:true,form:true,aim:{x:1500,y:600}},
  {name:'self-fallback',target:'enemy',required:'missing',fallback:'self',aim:{x:840,y:600}},
  {name:'aim-fallback',target:'enemy',required:'missing',fallback:'aim',aim:{x:840,y:600}},
];
try{for(const r of recipes){const w=makeSimWorld('warrior',0x4d3323),a=new Actor('caster','ally',{x:800,y:600});w.walk=null;w.actors=[a];w.corpses=[];
  const def={id:'m3-'+r.name,name:r.name,description:'',color:'#fff',tags:['spell'],manaCost:0,useTime:0,cooldown:0,
    delivery:r.form?{type:'summon',grimoire:true}:{type:'target'},targeting:{target:r.target,castRange:120,searchRadius:15,plural:r.plural,requiresStatus:r.required,requiresMonsterTags:r.taxonomy?['beast']:undefined,fallback:r.fallback} as TargetingSpec,
    effects:r.heal?[{type:'heal',amount:10}]:[]} as SkillDef;
  const i=makeSkillInstance(def,1);if(r.form)i.attunedForm=beast;for(const[k,v]of Object.entries(r.stats??{}))a.sheet.setBase(k,v);
  for(const [index,x]of[820,850,880,830,870].entries()){const b=new Actor('body',index<3?'enemy':'ally',{x,y:600});b.sheet.setBase('life',100);b.fillResources();if(index===1)b.applyStatus('poison',1,1,'fixture');if(index===2)b.defId=beast;if(index===3)b.life=70;if(index===4){b.life=10;b.owner=a;b.defId=beast;}w.actors.push(b);}
  if(!r.empty)for(const [index,x]of[840,830,850,841,1000].entries())w.corpses.push({pos:{x,y:600},defId:beast,level:1,maxLife:100,remaining:5,tier:index===3?1:0});
  const found=w.resolveTargeting(a,i,r.aim),expected=found?{pos:found.pos,actor:found.actor?.id,corpse:found.corpse?w.corpses.indexOf(found.corpse):undefined,corpses:found.corpses?.map(c=>w.corpses.indexOf(c)),self:found.self}:null;
  courses.push({name:r.name,definition:def,attunedForm:i.attunedForm,stats:r.stats??{},aim:r.aim,corpses:w.corpses,
    actors:w.actors.map(b=>({id:b.id,team:b.team,pos:b.pos,radius:b.radius,tier:b.tier,level:b.level,life:b.life,maxLife:b.maxLife(),owner:b.owner?.id,defId:b.defId,statuses:b.statuses.map(s=>({id:s.id})),monsterTags:b.defId?MONSTERS[b.defId]?.tags:undefined})),expected});
}writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,corpseDuration:CORPSE_CFG.duration,courses}));}finally{restore();}
