import {writeFileSync} from 'node:fs';
import {World} from '../src/engine/world';import {Actor} from '../src/engine/actor';import {makeSkillInstance,type SkillDef} from '../src/engine/skills';import {MONSTERS} from '../src/data/monsters';
import {CLUTCH_CFG,ORPHAN_FRENZY,type BirthEffect} from '../src/engine/clutch';import {PRESENCE_BANDS,presenceMul,presenceTable,type PresenceEntry} from '../src/engine/presence';
const courses:unknown[]=[],ids=Object.keys(MONSTERS),monster=ids.find(id=>id!=='clutch_egg')!;
const recipes=[
  {name:'enemy',fx:{count:[3,3],duration:2,tag:'kin'}},{name:'full-bounty',fx:{bounty:'full'}},
  {name:'enemy-cap',fx:{count:[4,4],cap:1}},{name:'zero',fx:{count:[0,0]}},{name:'missing',fx:{monsterId:'missing',count:[2,2]}},
  {name:'weighted',fx:{count:[3,3],pool:[{id:monster,weight:2,presence:{from:1}},{id:'missing',weight:2,presence:{from:9}}]}},
  {name:'player-bare',team:'player',fx:{count:[3,3],cap:2,duration:2}},{name:'player-owned',team:'player',keeper:true,fx:{count:[3,3],cap:1,duration:2}},
  {name:'egg',fx:{count:[2,2],incubate:{sec:1}}},{name:'missing-vessel',fx:{incubate:{sec:1,vessel:'missing'}}},
  ...(['die','wither','frenzy','rout'] as const).map(orphan=>({name:'orphan-'+orphan,fx:{count:[2,2],orphan},death:true})),
];
function plain(value:unknown){return JSON.parse(JSON.stringify(value));}
for(const r of recipes){
  // The original birth/lifetime methods run against an explicit body-provider
  // seam. Body assembly and the global death pipeline are not qualified here.
  const w=Object.create(World.prototype) as World;w.actors=[];w.time=0;w.flashes=[];(w as any).clutchScan=0;
  const events:unknown[]=[],draws:number[]=[];let next=0;
  const create=(id:string,level:number,team:any,owner?:Actor)=>{const a=new Actor(id,team,{x:0,y:0});a.owner=owner;a.id=++next;a.defId=id;a.level=level;a.radius=5;a.tier=2;a.color='red';a.sheet.setBase('effectDuration',2);
    a.addBuff=(...args)=>{events.push(['buff',a.id,plain(args)]);};a.applyStatus=(...args)=>{events.push(['status',a.id,plain(args)]);};return a;};
  w.createMonster=(id,level,team,owner)=>{events.push(['create',id,level,team,owner?.id??null]);return create(id,level,team??'enemy',owner);};
  w.findFreeSpot=(at)=>({...at});(w as any).conjurationLifeline=(owner:Actor)=>owner.id;
  (w as any).emergeBody=(body:Actor,options:unknown)=>events.push(['emerge',body.id,plain(options)]);
  w.kill=(body,silent)=>{events.push(['kill',body.id,silent]);body.dead=true;(w as any).clutchOnDeath(body);};
  const caster=create(monster,3,(r as any).team??'enemy');caster.faction='hive';caster.pos={x:20,y:30};w.actors.push(caster);
  if((r as any).keeper){const keeper=create(monster,8,'player');caster.owner=keeper;w.actors.push(keeper);}
  const fx={type:'birth',monsterId:monster,...r.fx} as BirthEffect,old=Math.random;Math.random=()=>{draws.push(.37);return .37;};
  const state=()=>({actors:w.actors.map(a=>({id:a.id,defId:a.defId,level:a.level,team:a.team,owner:a.owner?.id,pos:a.pos,bornOf:a.bornOf,faction:a.faction,tag:a.tag,noBounty:a.noBounty,lifelineId:a.lifelineId,sourceSkillId:a.sourceSkillId,lifespan:a.lifespan,dead:a.dead,orphanFate:a.orphanFate,clutchLive:a.clutchLive,eggHatch:a.eggHatch})),events:plain(events),draws:draws.length,flashes:plain(w.flashes)});
  const steps:unknown[]=[];
  try{const born=w.birthAt(caster,null,fx,{x:42.7,y:10.2},{host:true,capKey:'proc'});steps.push({op:'birth',born:born.map(a=>a.id),state:state()});
    if((r as any).death){w.kill(caster,true);steps.push({op:'death',state:state()});}
    if(fx.incubate){for(const dt of [.1,.1,.15,1]){w.time+=dt;(w as any).updateClutch(dt);steps.push({op:'advance',dt,time:w.time,state:state()});}}
  }finally{Math.random=old;}
  courses.push({name:r.name,fx,team:(r as any).team??'enemy',keeper:!!(r as any).keeper,steps});
}
const envelopes=[undefined,{},'early','mid','elite','late',{from:5,to:12,fadeIn:3,fadeOut:4},{stops:[[1,2],[4,.5],[10,3]],mul:2},{mul:-1}];
const weights:unknown[]=[];for(const spec of envelopes)for(const level of[-1,0,1,3,4,6,9,12,18,30,50])weights.push({spec,level,mult:presenceMul(spec as any,level)});
const table:PresenceEntry[]=[{id:'a',weight:2,presence:'mid'},{id:'b',weight:5,presence:{from:20}}];const tables=[1,6,20,45].map(level=>({level,table:presenceTable(table,level,id=>id==='a'?{mul:.5}:undefined)}));
writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,bodyFactoryQualified:false,fullDeathQualified:false,monster,rules:{...CLUTCH_CFG,frenzy:ORPHAN_FRENZY},bands:PRESENCE_BANDS,weights,tables,table,courses}));
