import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CLASS_BUNDLES,UNLOCK_CATALOG,reconcileClassBundleGems,isSkillUnlockedForSelection} from '../src/meta/unlocks';
import {makeAccount,isSkillUnlockedForDrop,isSupportUnlockedForDrop,FEATURE} from '../src/meta/account';
import {MEMORY_UNLOCKS,MEMORY_UNLOCK_CFG} from '../src/data/memoryUnlocks';
import {questRewardChoices} from '../src/engine/questRewardChoices';
import {revengeQuestDefs} from '../src/quests/revenge';
import {bootSimEngine} from '../src/sim/arena';

bootSimEngine();
const bundles=CLASS_BUNDLES,skills=[...new Set(bundles.flatMap(b=>b.skillIds)),'__retired'];
const supports=[...new Set(bundles.flatMap(b=>b.supportIds??[])),'__retired'];
const quest=revengeQuestDefs().find(q=>q.reward.skillChoice)!;assert(quest);
const legacyRows=UNLOCK_CATALOG.filter(u=>u.kind==='skill'||u.kind==='support');
const discovery=MEMORY_UNLOCKS.find(r=>r.tier==='discovery')!;assert(discovery&&legacyRows.length>0);
const results=[],migrations=[];
const selections=(a:ReturnType<typeof makeAccount>)=>({
  selectable:skills.filter(id=>isSkillUnlockedForSelection(a,id)),
  skillDrops:skills.filter(id=>isSkillUnlockedForDrop(a,id)),
  supportDrops:supports.filter(id=>isSupportUnlockedForDrop(a,id)),
  oracle:questRewardChoices(a,quest).map(row=>[row.id,row.skillId,row.name,row.baseId])
});
for(const b of bundles){
 for(const scenario of ['unknown','pending','activated','pending-explicit','pending-shared','all-drops']) {
  const a=makeAccount();
  if(scenario!=='unknown')a.unlockedClasses.add(b.classId);
  if(scenario.startsWith('pending'))a.pendingClassUnlocks.add(b.classId);
  if(scenario==='pending-explicit')for(const id of b.skillIds)a.explicitSkillUnlocks.add(id);
  if(scenario==='pending-shared')for(const other of bundles){
    if(other!==b&&other.skillIds.some(id=>b.skillIds.includes(id)))a.unlockedClasses.add(other.classId);
  }
  if(scenario==='all-drops')a.features.add(FEATURE.UNLOCK_ALL_GEMS);
  const before=selections(a);reconcileClassBundleGems(a);const after=selections(a);reconcileClassBundleGems(a);
  assert.deepEqual(selections(a),after);
  results.push({id:b.classId,scenario,before,after});
 }
}
const baseMode=MEMORY_UNLOCK_CFG.legacyGemBundles;
try{
 for(const enabled of [false,true])for(const held of [-1,0,3.75,174]){
  MEMORY_UNLOCK_CFG.legacyGemBundles=enabled;
  const a=makeAccount();a.invested[discovery.id]=2;
  for(const row of legacyRows)a.invested[row.id]=held;
  a.invested['__retired']=11;a.unlockedSkills.add('__retired_skill');a.unlockedSupports.add('__retired_support');
  const sample=()=>({invested:{...a.invested},skills:[...a.unlockedSkills],supports:[...a.unlockedSupports]});
  const before=sample();reconcileClassBundleGems(a);const once=sample();reconcileClassBundleGems(a);const twice=sample();
  assert.deepEqual(twice,once);migrations.push({enabled,held,before,once});
 }
}finally{MEMORY_UNLOCK_CFG.legacyGemBundles=baseMode;}
// The pinned catalogue uses distinct bundle skills. Exercise the supported
// shared-owner rule by lending one real skill to a second authored class for
// this observation only, then restore the exact original collection.
const first=bundles[0],second=bundles.find(b=>b!==first&&!b.skillIds.includes(first.skillIds[0]))!;
const skill=first.skillIds[0],length=second.skillIds.length,shared=[];
try{
  second.skillIds.push(skill);
  for(const firstActive of [false,true])for(const secondActive of [false,true]){
    const a=makeAccount();
    for(const [b,active]of [[first,firstActive],[second,secondActive]] as const){
      a.unlockedClasses.add(b.classId);if(!active)a.pendingClassUnlocks.add(b.classId);
    }
    reconcileClassBundleGems(a);
    shared.push({firstActive,secondActive,first:first.classId,second:second.classId,skill,
      selectable:isSkillUnlockedForSelection(a,skill),offered:questRewardChoices(a,quest).some(choice=>choice.skillId===skill)});
  }
}finally{second.skillIds.length=length;}
fs.writeFileSync(process.argv[2],JSON.stringify({skills,supports,quest:quest.id,results,migrations,shared})+'\n',{flag:'wx'});
