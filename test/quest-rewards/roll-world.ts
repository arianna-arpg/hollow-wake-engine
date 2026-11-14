import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {Rng} from '../src/core/rng';
import {GEM_DROP_CFG} from '../src/engine/loot';
import {MEMORY_CFG,MEMORY_KINDS,memoryKindOf} from '../src/engine/memories';
import {FLOAT_CFG} from '../src/world/bulletins';
import {SUPPORTS,SUPPORT_LIST} from '../src/data/supports';
import {SKILL_LIST} from '../src/data/skills';
import {FEATURE,STARTER_SKILLS} from '../src/meta/account';
import {compileMemoryRollPolicy} from 'candidate/memory-roll-policy';
import {prepareQuestMemories,type QuestMemoryFactory} from 'candidate/quest-memory-mint';
import {Random} from 'candidate/random';
bootSimEngine();const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value)),arm=process.argv[2],results:unknown[]=[];
type Scenario={count:number;skillShare?:number;preformedShare?:number;seed?:number;priorDraws?:number;floor?:'empty'|'skills'|'supports';fallback?:boolean;tier?:number;policy?:string};
const scenarios:Scenario[]=[];for(const count of [0,1,6])for(const skillShare of [0,1])for(const preformedShare of [0,.16,1])scenarios.push({count,skillShare,preformedShare});
for(const floor of ['empty','skills','supports'] as const)scenarios.push({count:6,floor});
for(const seed of [0,1,0xffffffff])scenarios.push({count:6,seed,priorDraws:5});
scenarios.push({count:6,fallback:true,skillShare:0},{count:64});
for(const tier of [0,1,2])scenarios.push({count:6,tier});
for(const policy of ['empty','all','level-gated','zero','tiny','floor-zero','carried-zero','tag-zero'])for(const skillShare of [0,1])scenarios.push({count:6,policy,skillShare});
const config={...GEM_DROP_CFG},skillDefs=SKILL_LIST.map(s=>({s,weight:s.dropWeight,min:s.minDropLevel})),supportDefs=SUPPORT_LIST.map(s=>({s,weight:s.weight}));
for(const[index,scenario]of scenarios.entries()){
 const w=makeSimWorld('warrior',74119);w.loadZone('lastlight');w.actors=[w.player];w.drops=[];w.texts=[];const host=w as any;
 Object.assign(GEM_DROP_CFG,config,{memoryShare:1},...(scenario.skillShare===undefined?[]:[{skillShare:scenario.skillShare}]),...(scenario.preformedShare===undefined?[]:[{preformedShare:scenario.preformedShare}]));
 if(scenario.floor){w.zone={...w.zone,tileset:'deepwood'};host.zoneGemFloor=()=>({skills:new Set(scenario.floor==='skills'?['cleave']:[]),supports:new Set(scenario.floor==='supports'?[Object.keys(SUPPORTS)[0]]:[])});}
 if(scenario.fallback){w.account.features.delete(FEATURE.UNLOCK_ALL_GEMS);w.account.unlockedSupports.clear();host.zoneGemFloor=()=>undefined;}
 if(scenario.policy){
  w.account.features.delete(FEATURE.UNLOCK_ALL_GEMS);w.account.unlockedSkills.clear();w.account.unlockedSupports.clear();host.zoneGemFloor=()=>undefined;
  if(scenario.policy!=='empty')w.account.features.add(FEATURE.UNLOCK_ALL_GEMS);
  if(scenario.policy==='level-gated')for(const s of SKILL_LIST)s.minDropLevel=1000000;
  if(scenario.policy==='zero'||scenario.policy==='tiny'){for(const s of SKILL_LIST)s.dropWeight=scenario.policy==='zero'?0:Number.MIN_VALUE;for(const s of SUPPORT_LIST)s.weight=scenario.policy==='zero'?0:Number.MIN_VALUE;}
  if(scenario.policy==='floor-zero'){GEM_DROP_CFG.floorMult=0;host.zoneGemFloor=()=>({skills:new Set(SKILL_LIST.map(s=>s.id)),supports:new Set(SUPPORT_LIST.map(s=>s.id))});}
  if(scenario.policy==='carried-zero'||scenario.policy==='tiny'){GEM_DROP_CFG.carriedMult=scenario.policy==='tiny'?.5:0;host.carriedGemIds=()=>({skills:new Set(SKILL_LIST.map(s=>s.id)),supports:new Set(SUPPORT_LIST.map(s=>s.id))});}
  if(scenario.policy==='tag-zero')GEM_DROP_CFG.tagWeights=Object.fromEntries([...SKILL_LIST.flatMap(s=>s.tags),...SUPPORT_LIST.flatMap(s=>s.dropTags??s.requiresTags??[])].map(t=>[t,0]));
 }
 if(scenario.tier!==undefined)host.spoilStory=scenario.tier;
 const seed=scenario.seed??0x773211+index,original=new Rng(seed),privateStream=new Random(seed);
 for(let i=0;i<(scenario.priorDraws??0);i++)assert.equal(original.next(),privateStream.next());
 const snapshot=privateStream.snapshot(),before=copy({drops:w.drops,texts:w.texts,items:w.meta.items,ledger:w.ledger,account:w.account}),at={...w.player.pos};let result,draws=0,retained:(()=>number)|undefined;
 const scope=<T>(random:()=>number,work:()=>T):T=>{const previous=Math.random;Math.random=random;try{return work();}finally{Math.random=previous;}};
 try{
  if(arm==='original'){
   scope(()=>{draws++;return original.next();},()=>{for(let i=0;i<scenario.count;i++)w.dropGemAt(at,undefined,true,'quest');});
   result={drops:w.drops.map(drop=>{assert.equal(drop.item.kind,'gear');const item=(drop.item as any).item;return{kind:'memory',memoryKind:memoryKindOf(item),units:copy(item.mem)};}),placements:w.drops.map(drop=>({worldKey:w.zone.id,pos:copy(drop.pos),at:copy(at),bob:drop.bob,tier:drop.tier})),presentations:copy(w.texts),draws,next:Array.from({length:12},()=>original.next())};
  }else{
   const factory:QuestMemoryFactory=({random})=>{retained=random;
    const owned=host.carriedGemIds(),plan=compileMemoryRollPolicy({
     skills:SKILL_LIST.map(s=>({id:s.id,tags:s.tags,weight:s.dropWeight??100,min:s.minDropLevel??0,noDrop:s.noDrop})),
     supports:SUPPORT_LIST.map(s=>({id:s.id,tags:s.dropTags??s.requiresTags??[],weight:s.weight,min:s.minDropLevel??0})),
     starters:new Set(STARTER_SKILLS),rules:GEM_DROP_CFG
    },{level:w.zone.level,all:w.account.features.has(FEATURE.UNLOCK_ALL_GEMS),skills:w.account.unlockedSkills,supports:w.account.unlockedSupports,carriedSkills:owned.skills,carriedSupports:owned.supports,floor:host.zoneGemFloor()});
    return{worldKey:w.zone.id,at,tier:host.spoilStory,services:{
    clamp:position=>w.clampPos(position,10,undefined,host.spoilClamp()),floor:()=>host.zoneGemFloor(),level:()=>w.zone.level,tileset:()=>w.zone.tileset,
    config:()=>({skillShare:GEM_DROP_CFG.skillShare,memoryShare:GEM_DROP_CFG.memoryShare,preformedShare:GEM_DROP_CFG.preformedShare,foundProvenance:MEMORY_CFG.foundProvenance}),
    rollSkill:()=>plan.skill(random),rollSupport:()=>plan.support(random),
    presentation:(origin,kind)=>({pos:{x:origin.x+(-10+random()*20),y:origin.y-16},text:MEMORY_KINDS[kind].name+'!',color:MEMORY_KINDS[kind].color,life:FLOAT_CFG.dropNameSec,maxLife:FLOAT_CFG.dropNameSec,size:14,kind:'drop'})
   }};};
   const prepared=prepareQuestMemories(snapshot,scenario.count,factory);assert.deepEqual(privateStream.snapshot(),snapshot,'Mint preparation changed caller stream');
   assert.deepEqual(copy({drops:w.drops,texts:w.texts,items:w.meta.items,ledger:w.ledger,account:w.account}),before,'Mint preparation changed live World state');
   if(retained)assert.throws(retained,/expired-quest-mint-stream/);else assert.equal(scenario.count,0);
   const continued=Random.restore(prepared.random);result={drops:prepared.drops,placements:prepared.placements,presentations:prepared.presentations,draws:prepared.random.draws-snapshot.draws,next:Array.from({length:12},()=>continued.next())};
  }
  results.push({scenario,...result});
 }finally{Object.assign(GEM_DROP_CFG,config);for(const {s,weight,min} of skillDefs){s.dropWeight=weight;s.minDropLevel=min;}for(const {s,weight} of supportDefs)s.weight=weight;}
}
console.log(JSON.stringify({arm,scenarios:results.length,results,worldItemIdsOwned:false,devicePerformanceQualified:false}));
