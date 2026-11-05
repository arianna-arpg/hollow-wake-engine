import test from 'node:test';
import assert from 'node:assert/strict';
import {createClassAccess,createGemPools,restoreClassAccess,restoreKitPicks,restoreGemPools,serializeClassAccess,serializeGemPools} from '../dist/class-account.js';
import {isSelectableClassSkill,reconcileClassRewards} from '../dist/class-rewards.js';
import {trimMercenaryAllocations,normalizedMercenarySkill,createMercenaryIdentity,restoreMercenaryCompany} from '../dist/mercenary-identity.js';
import {CharacterContinuityContent} from '../dist/character-continuity-content.js';

test('fresh accounts own distinct sets and retain starter insertion order',()=>{
  const seeds=['first','second','first'],a=createClassAccess(seeds),b=createClassAccess(seeds);
  a.unlockedClasses.add('later');assert.deepEqual([...b.unlockedClasses],['first','second']);
  assert.equal(a.pendingClassUnlocks.size,0);assert.equal(a.unlockedClassTiers.size,0);assert.notEqual(a.unlockedClasses,b.unlockedClasses);
  const gems=createGemPools(['seed'],['support']);gems.unlockedSkills.add('drop');assert.deepEqual([...gems.explicitSkillUnlocks],['seed']);assert.deepEqual([...gems.unlockedSupports],['support']);
});
test('restored pending classes must be known owned nonstarters, while retired discoveries survive',()=>{
  const input={unlockedClasses:['new','retired'],pendingClassUnlocks:['seed','new','retired','other',3,'new'],unlockedClassTiers:['legacy',1,'legacy']};
  const state=restoreClassAccess(input,['seed'],[{id:'new'},{id:'other'}]);
  assert.deepEqual([...state.unlockedClasses],['seed','new','retired']);assert.deepEqual([...state.pendingClassUnlocks],['new']);assert.deepEqual([...state.unlockedClassTiers],['legacy']);
  assert.deepEqual([...restoreClassAccess({},['seed'],[]).unlockedClasses],['seed']);
});
test('old kit maps are detached, filtered to string picks and safe for property-like IDs',()=>{
  const input=JSON.parse('{"a":{"base":"new","bad":7},"array":["x",3],"bad":false,"__proto__":{"__proto__":"skill"}}');
  const picks=restoreKitPicks(input);assert.equal(Object.getPrototypeOf(picks),Object.prototype);assert.notEqual(picks.a,input.a);assert.notEqual(picks.array,input.array);
  assert.deepEqual(picks.a,{base:'new'});assert.deepEqual(picks.array,{0:'x'});assert(!Object.hasOwn(picks,'bad'));assert.equal(Object.getPrototypeOf(picks.__proto__),Object.prototype);assert.equal(picks.__proto__.__proto__,'skill');
  assert.deepEqual(restoreKitPicks(null),{});assert.deepEqual(restoreKitPicks(18),{});
});
test('explicit skills and drop pools remain separate across a save round trip',()=>{
  const state=restoreGemPools({unlockedSkills:['drop'],explicitSkillUnlocks:['award'],unlockedSupports:['old']},['seed'],['start-support']);
  assert.deepEqual([...state.unlockedSkills],['seed','drop']);assert.deepEqual([...state.explicitSkillUnlocks],['seed','award']);
  const saved=serializeGemPools(state);assert.deepEqual(saved.unlockedSupports,['start-support','old']);
  saved.unlockedSkills.push('serialized-only');assert(!state.unlockedSkills.has('serialized-only'));
});
test('class serialization accepts ordered iterables and borrows the kit dictionary explicitly',()=>{
  const kit={a:{base:'alt'}},saved=serializeClassAccess({unlockedClasses:['a','b'],pendingClassUnlocks:new Set(['b']),unlockedClassTiers:['rung'],kitPicks:kit});
  assert.deepEqual(saved.unlockedClasses,['a','b']);assert.equal(saved.kitPicks,kit);
  assert.throws(()=>restoreClassAccess({pendingClassUnlocks:'bad'},[],[]),TypeError);
  assert.throws(()=>restoreGemPools({unlockedSkills:5},[],[]),TypeError);
});
function account(){return {unlockedClasses:new Set(),pendingClassUnlocks:new Set(),unlockedSkills:new Set(),explicitSkillUnlocks:new Set(),unlockedSupports:new Set(),invested:{}};}
test('deliberate selection distinguishes pending, independent grants and shared active owners',()=>{
  const a=account(),rows=[{classId:'a',skillIds:['skill']},{classId:'b',skillIds:['skill']}];
  assert(!isSelectableClassSkill(a,'skill',[],rows));a.unlockedSkills.add('skill');a.unlockedClasses.add('a');a.pendingClassUnlocks.add('a');
  assert(!isSelectableClassSkill(a,'skill',[],rows));a.unlockedClasses.add('b');assert(isSelectableClassSkill(a,'skill',[],rows));
  a.unlockedClasses.delete('b');a.explicitSkillUnlocks.add('skill');assert(isSelectableClassSkill(a,'skill',[],rows));
  a.explicitSkillUnlocks.clear();assert(isSelectableClassSkill(a,'skill',['skill'],rows));
});
test('selection observes a live catalogue update and preserves independent old grants',()=>{
  const a=account(),rows=[{classId:'a',skillIds:['skill']}];a.unlockedSkills.add('skill');a.unlockedClasses.add('a');a.pendingClassUnlocks.add('a');
  assert(!isSelectableClassSkill(a,'skill',[],rows));rows.push({classId:'b',skillIds:['skill']});a.unlockedClasses.add('b');assert(isSelectableClassSkill(a,'skill',[],rows));
  a.unlockedSkills.add('old');assert(isSelectableClassSkill(a,'old',[],rows));
});
test('legacy investments transfer exactly once and bundles keep drop pools current',()=>{
  const a=account();a.unlockedClasses.add('new');a.invested={oldSkill:4.8,oldSupport:3,negative:-3,destination:2,unrelated:9};
  const entries=[{id:'oldSkill',kind:'skill'},{id:'oldSupport',kind:'support'},{id:'negative',kind:'skill'},{id:'unrelated',kind:'feature'}],bundles=[{classId:'new',skillIds:['skill'],supportIds:['support']}];
  const held=(a,r)=>Math.max(0,Math.floor(a.invested[r.id]??0));
  reconcileClassRewards(a,bundles,false,entries,'destination',held);
  assert.deepEqual(a.invested,{destination:9,unrelated:9});assert(a.unlockedSkills.has('skill')&&a.unlockedSupports.has('support'));
  reconcileClassRewards(a,bundles,false,entries,'destination',held);assert.deepEqual(a.invested,{destination:9,unrelated:9});
});
test('migration preserves old investments when the legacy mode or destination policy requires it',()=>{
  const a=account();a.invested.old=3;
  const rows=[{id:'old',kind:'skill'}],read=()=>assert.fail('Unexpected investment read');
  reconcileClassRewards(a,[],true,rows,'new',read);reconcileClassRewards(a,[],false,rows,undefined,read);assert.equal(a.invested.old,3);
});
test('interrupted investment migration can resume without duplicating earlier transfers',()=>{
  const a=account();a.invested={first:3,second:4};const rows=[{id:'first',kind:'skill'},{id:'second',kind:'support'}];
  assert.throws(()=>reconcileClassRewards(a,[],false,rows,'new',(a,r)=>{if(r.id==='second')throw Error('interrupted');return a.invested[r.id]??0;}),/interrupted/);
  assert.deepEqual(a.invested,{new:3,second:4});reconcileClassRewards(a,[],false,rows,'new',(a,r)=>a.invested[r.id]??0);assert.deepEqual(a.invested,{new:7});
});
test('investment destinations can be literal object-property names',()=>{
  const a=account();a.invested.old=4;reconcileClassRewards(a,[],false,[{id:'old',kind:'skill'}],'__proto__',(a,r)=>a.invested[r.id]??0);
  assert.equal(Object.getPrototypeOf(a.invested),Object.prototype);assert.deepEqual(JSON.parse(JSON.stringify(a.invested)),JSON.parse('{"__proto__":4}'));
});
test('mercenary allocation keeps roots free and traverses selected branches in breadth-first order',()=>{
  const graph={root:['left','right'],left:['leaf'],right:['next'],'voc_path_root':['v']};
  const snapshot={classId:'a',allocated:['root','left','right','leaf','next','voc_path_root','v','orphan'],vocations:['path']};
  const read=id=>graph[id],start=()=> 'root';
  assert.deepEqual([...trimMercenaryAllocations(snapshot,0,start,read)],['root','voc_path_root']);
  assert.deepEqual([...trimMercenaryAllocations(snapshot,3,start,read)],['root','voc_path_root','left','right','v']);
  assert(!trimMercenaryAllocations(snapshot,99,start,read).has('orphan'));assert.equal(snapshot.allocated.length,8);
});
test('mercenary trimming reads the saved allocation before the class-root query',()=>{
  const order=[],allocated={*[Symbol.iterator](){order.push('allocation');yield 'root';}};
  const snapshot={classId:'a',allocated,get vocations(){order.push('vocations');return [];}};
  assert.deepEqual([...trimMercenaryAllocations(snapshot,1,()=>{order.push('root');return 'root';},()=>[])],['root']);assert.deepEqual(order,['allocation','root','vocations']);
});
test('gem rescaling and mercenary identity preserve bounds, zero handles and owned records',()=>{
  assert.equal(normalizedMercenarySkill(3,4,4/7),2);assert.equal(normalizedMercenarySkill(20,4,4/7),4);assert.equal(normalizedMercenarySkill(0,4,.5),1);
  const def={name:'Blade',id:'a'},snapshot={bar:[0,null],baseAttrs:{might:2}},value=createMercenaryIdentity(def,snapshot);
  assert.equal(value.classDef,def);assert.deepEqual(value.opening,[0,null]);assert.notEqual(value.opening,snapshot.bar);assert.notEqual(value.baseAttrs,snapshot.baseAttrs);assert.notEqual(value.attrs,value.baseAttrs);
});
test('explicit company lists override legacy single contracts, and invalid members are skipped',()=>{
  const one={snapshot:{id:1}},two={snapshot:{id:2}},seen=[];
  restoreMercenaryCompany({mercenary:one},m=>seen.push(m));assert.deepEqual(seen,[one]);
  seen.length=0;restoreMercenaryCompany({mercenary:one,mercenaries:[]},m=>seen.push(m));assert.deepEqual(seen,[]);
  restoreMercenaryCompany({mercenary:one,mercenaries:[null,{},two,undefined]},m=>seen.push(m));assert.deepEqual(seen,[two]);
});
function pack(){return {schemaVersion:1,capability:'character-continuity/v1',contentId:'test',classes:['a'],starterClasses:['a'],starterSkills:['skill'],starterSupports:['support'],rewards:[{classId:'a',skillIds:['skill']}],legacy:{enabled:false,target:'discovery',rows:[]},
  mercenary:{anchor:'charLevel',trackLevel:true,respectGearLevelReq:true,gemLevel:{divisor:5,offset:1,minimum:1},passiveBudget:{starting:0,perLevel:1}}};}
test('continuity content owns immutable definitions and evaluates original level policies',()=>{
  const raw=pack(),content=new CharacterContinuityContent(raw);raw.rewards[0].skillIds.push('later');assert.deepEqual(content.pack.rewards[0].skillIds,['skill']);assert(Object.isFrozen(content.pack.mercenary.gemLevel));
  assert.equal(content.gemLevelCap(1),2);assert.equal(content.gemLevelCap(28),7);assert.equal(content.passiveBudget(12),11);
  assert.throws(()=>content.gemLevelCap(.5));assert.throws(()=>content.passiveBudget(0));
});
test('malformed or contradictory character content is rejected at load time',()=>{
  for(const mutate of [p=>p.classes.push('a'),p=>p.starterClasses.push('unknown'),p=>p.rewards.push(p.rewards[0]),p=>p.rewards[0].skillIds.push('skill'),p=>p.mercenary.gemLevel.divisor=0,p=>p.mercenary.passiveBudget.perLevel=-1,p=>p.legacy.enabled='yes',p=>p.legacy.rows.push({id:'old',kind:'feature'}),p=>p.legacy.rows.push({id:'discovery',kind:'skill'}),p=>p.legacy.rows.push({id:'old',kind:'skill'},{id:'old',kind:'support'})]){
    const data=pack();mutate(data);assert.throws(()=>new CharacterContinuityContent(data));
  }
});
