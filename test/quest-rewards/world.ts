import {ownedVocationWorld} from 'candidate/vocation-world';
import {prepareQuestMemoryWorldPublication} from 'candidate/memory-world-publication';
import type {QuestMemoryFactory,PreparedQuestMemories} from 'candidate/quest-memory-mint';
import {Random} from 'candidate/random';
import {vocationQuestDefs} from '../src/quests/vocations';
import {questDoneKey,FEATURE,STARTER_SKILLS} from '../src/meta/account';
import {SKILL_LIST} from '../src/data/skills';
import {SUPPORT_LIST} from '../src/data/supports';
import {MemoryRollCatalogue} from 'candidate/memory-roll-catalogue';
import assert from 'node:assert/strict';
import {seedGlobalRandom} from '../src/sim/rng';
import {GEM_DROP_CFG} from '../src/engine/loot';
import {MEMORY_CFG,MEMORY_KINDS} from '../src/engine/memories';
import {FLOAT_CFG} from '../src/world/bulletins';
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const scope=<T>(draw:()=>number,work:()=>T):T=>{const before=Math.random;Math.random=draw;try{return work();}finally{Math.random=before;}};

/** Pinned-source fixture only. Both arms receive an explicit reward stream;
 * the original drop method runs unchanged inside that stream. Other original
 * World randomness stays separate. This qualifies the owned-stream adapter,
 * not migration parity with the former process-wide random interleaving. */
export function durableMintedVocationWorld(rows:unknown,id:string,enabled=true,prior?:string,seed=0x773211){
 // Scene-entry floaters predate the quest; seed those inputs too so their
 // positions are reproducible without removing them from the comparison.
 const startup=new Random(0x771122),f=scope(()=>startup.next(),()=>ownedVocationWorld({id,enabled,prior})),{w}=f,host=w as any,quest=vocationQuestDefs().find(q=>q.reward.grantVocation===id)!;
 const entry={questId:quest.id,zoneId:w.zone.id,fieldDone:true};w.activeQuests.push(entry);const mintRandom=new Random(seed),initialMint=mintRandom.snapshot();
 const snapshot=()=>copy({...f.snapshot(),drops:w.drops,orbs:w.orbs,completed:[...w.completedQuests],active:w.activeQuests});
 const trace:unknown[]=[];
 for(const name of ['grantXp','notice'] as const){const original=host[name];host[name]=function(...args:unknown[]){trace.push({name,phase:'before',state:snapshot()});const value=original.apply(this,args);trace.push({name,phase:'after',state:snapshot()});return value;};}
 const originalDrop=w.dropGemAt.bind(w);
 const installDrop=(publish:()=>void)=>{w.dropGemAt=()=>{trace.push({name:'dropGemAt',phase:'before',state:snapshot()});publish();trace.push({name:'dropGemAt',phase:'after',state:snapshot()});};};
 installDrop(()=>scope(()=>mintRandom.next(),()=>originalDrop(w.player.pos,undefined,true,'quest')));
 // Test-only source comparison: the production loader consumes only the compact
 // pack, while this fixture independently checks every accepted source row.
 const raw=rows as {skills:unknown;supports:unknown;starters:unknown};
 assert.deepEqual(raw.skills,SKILL_LIST.map(s=>({id:s.id,tags:s.tags,weight:s.dropWeight??100,min:s.minDropLevel??0,...(s.noDrop?{noDrop:true}:{})})));
 assert.deepEqual(raw.supports,SUPPORT_LIST.map(s=>({id:s.id,tags:s.dropTags??s.requiresTags??[],weight:s.weight,min:s.minDropLevel??0})));
 assert.deepEqual(raw.starters,STARTER_SKILLS);
 const catalogue=new MemoryRollCatalogue(rows);
 const factory:QuestMemoryFactory=({random})=>{
  const owned=host.carriedGemIds(),plan=catalogue.prepare(GEM_DROP_CFG,{level:w.zone.level,all:w.account.features.has(FEATURE.UNLOCK_ALL_GEMS),skills:w.account.unlockedSkills,supports:w.account.unlockedSupports,carriedSkills:owned.skills,carriedSupports:owned.supports,floor:host.zoneGemFloor()});
  return{worldKey:w.zone.id,at:{...w.player.pos},tier:host.spoilStory,services:{
  clamp:position=>w.clampPos(position,10,undefined,host.spoilClamp()),floor:()=>host.zoneGemFloor(),level:()=>w.zone.level,tileset:()=>w.zone.tileset,
  config:()=>({skillShare:GEM_DROP_CFG.skillShare,memoryShare:GEM_DROP_CFG.memoryShare,preformedShare:GEM_DROP_CFG.preformedShare,foundProvenance:MEMORY_CFG.foundProvenance}),
  rollSkill:()=>plan.skill(random),rollSupport:()=>plan.support(random),
  presentation:(at,kind)=>({pos:{x:at.x+(-10+random()*20),y:at.y-16},text:MEMORY_KINDS[kind].name+'!',color:MEMORY_KINDS[kind].color,life:FLOAT_CFG.dropNameSec,maxLife:FLOAT_CFG.dropNameSec,size:14,kind:'drop'})
 }};};
 const prepareMemories=(plan:Pick<PreparedQuestMemories,'drops'|'placements'|'presentations'>)=>plan.drops.map((drop,i)=>prepareQuestMemoryWorldPublication(w,{drops:[drop],placements:[plan.placements[i]],presentations:[plan.presentations[i]]}));
 const phase=()=>{const restore=seedGlobalRandom(0x923311);try{host.onQuestZoneCleared(entry);}finally{restore();}};
 const observed=()=>{const o=f.observed() as {events:{name:string}[];trace:{name:string}[];final:unknown};return copy({vocation:{...o,events:o.events.filter(e=>e.name!=='text'),trace:o.trace.filter(e=>e.name!=='text')},trace,final:snapshot(),texts:w.texts,notices:w.notices});};
 return{...f,quest,entry,questKey:questDoneKey,snapshot,trace,phase,observed,factory,initialMint,mintState:()=>mintRandom.snapshot(),prepareMemories,installDrop};
}
