import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryRewardContent} from '../dist/memory-reward-content.js';
import {
 buildMemoryCatalog,memoryCatalog,memoryUnlockCandidates,grantMemoryUnlock,awakenMemoryFromDrop,
 memoryProgressionOpen,memorySecondaryOpen,memoryCommissionReady,memoryAccessView,
} from '../dist/memory-rewards.js';

function pack(){
 return {schemaVersion:1,capability:'memory-rewards/v1',contentId:'test-memory',
  keys:{unlockAllFeature:'all',milestonePrefix:'stage_',awakeningStage:2,gemDropPrefix:'drop:'},
  config:{debugCodexBypassesSecondary:true,weighting:'uniform',excluded:[],weightOverrides:{},
   secondary:{mechanics:{tree:true,commission:true,prestige:true},kinds:['skill'],legendaryFinds:true,vault:true}},
  definitions:[{id:'discover',tier:'discovery',label:'Discover',description:'One memory',cost:3,weights:{skill:1,support:0}},
   {id:'awaken',tier:'secondary',label:'Awaken',description:'One awakening',cost:9,weights:{skill:1,support:0}}],
  skills:[{id:'a',name:'A',dropWeight:10},{id:'b',name:'B',dropWeight:20},{id:'hidden',name:'Hidden',noDrop:true},{id:'zero',name:'Zero',dropWeight:0}],
  supports:[{id:'s',name:'S',weight:5}],
 };
}
function account(){
 return {features:new Set(),ledger:{},unlockedSkills:new Set(),unlockedSupports:new Set(),
  explicitSkillUnlocks:new Set(),memorySecondary:new Set(),memoryReceipts:{}};
}
function state(value){
 return JSON.stringify({...value,features:[...value.features],unlockedSkills:[...value.unlockedSkills],
  unlockedSupports:[...value.unlockedSupports],explicitSkillUnlocks:[...value.explicitSkillUnlocks],memorySecondary:[...value.memorySecondary]});
}
test('raw catalogue construction preserves order, defaults and drop eligibility',()=>{
 const skills=[{id:'default',name:'Default'},{id:'hidden',name:'Hidden',noDrop:true},
  ...[-1,0,NaN,Infinity].map((dropWeight,index)=>({id:'skill-'+index,name:'Skill '+index,dropWeight}))];
 const supports=[-1,0,NaN,Infinity,5].map((weight,index)=>({id:'support-'+index,name:'Support '+index,weight}));
 assert.deepEqual(buildMemoryCatalog(skills,supports),[
  {kind:'skill',id:'default',name:'Default',weight:100},
  {kind:'skill',id:'skill-3',name:'Skill 3',weight:Infinity},
  {kind:'support',id:'support-3',name:'Support 3',weight:Infinity},
  {kind:'support',id:'support-4',name:'Support 4',weight:5},
 ]);
 assert.deepEqual(buildMemoryCatalog(skills,supports,['skill:default','support:support-4']).map(row=>row.id),['skill-3','support-3']);
});
test('content owns immutable definitions and cached catalogue rows',()=>{
 const input=pack(),content=new MemoryRewardContent(input);
 input.skills[0].name='Edited';input.config.secondary.vault=false;input.definitions[0].weights.skill=100;
 assert.equal(content.catalogue(),content.catalogue());
 assert.equal(content.catalogue()[0].name,'A');assert.equal(content.config.secondary.vault,true);
 assert.equal(content.definition('discover').weights.skill,1);
 assert(Object.isFrozen(content.catalogue()[0]));assert(Object.isFrozen(content.pack.skills));
 const rows=memoryCatalog(content);rows[0].name='Caller edit';rows.pop();
 assert.equal(memoryCatalog(content)[0].name,'A');assert.equal(memoryCatalog(content).length,3);
 assert.equal(content.definition('constructor'),undefined);assert.equal(content.canAwakenSkill('__proto__'),false);
});
test('content validates identity, configuration and finite arithmetic',()=>{
 const edits=[
  value=>value.skills.push({...value.skills[0]}),
  value=>value.supports[0].weight=Infinity,
  value=>value.definitions[0].cost=.5,
  value=>value.config.secondary.kinds.push('other'),
  value=>value.config.secondary.mechanics.tree=1,
  value=>value.config.weightOverrides['skill:a']=NaN,
  value=>value.keys.awakeningStage=-1,
  value=>value.definitions[0].weights.skill=1e308,
 ];
 for(const edit of edits){const value=pack();edit(value);assert.throws(()=>new MemoryRewardContent(value));}
 const value=pack();value.skills[0].id='__proto__';value.definitions[0].id='constructor';
 const content=new MemoryRewardContent(value);
 assert(content.canAwakenSkill('__proto__'));assert.equal(content.definition('constructor').id,'constructor');
});
test('weighted interval boundaries and explicit random consumption',()=>{
 const content=new MemoryRewardContent(pack()),definition=content.definition('discover');
 for(const [roll,id]of [[0,'a'],[.5-Number.EPSILON,'a'],[.5,'b'],[1-Number.EPSILON,'b']]){
  const value=account();let draws=0;
  const receipt=grantMemoryUnlock(value,definition,()=>{draws++;return roll;},content);
  assert.equal(draws,1);assert.equal(receipt.id,id);assert(value.explicitSkillUnlocks.has(id));
 }
 for(const roll of [-1,1,NaN,Infinity]){
  const value=account(),before=state(value);let draws=0;
  assert.equal(grantMemoryUnlock(value,definition,()=>{draws++;return roll;},content),null);
  assert.equal(draws,1);assert.equal(state(value),before);
 }
});
test('empty, excluded and overflowing pools consume no randomness',()=>{
 const content=new MemoryRewardContent(pack()),value=account();
 const empty={...content.definition('discover'),weights:{skill:0,support:0}};
 const overflowing={...empty,weights:{skill:1e308,support:1e308}};
 for(const definition of [empty,overflowing]){
  const before=state(value);let draws=0;
  assert.equal(grantMemoryUnlock(value,definition,()=>{draws++;return 0;},content),null);
  assert.equal(draws,0);assert.equal(state(value),before);
 }
 const input=pack();input.config.excluded=['skill:a','skill:b','support:s'];
 const excluded=new MemoryRewardContent(input);
 assert.deepEqual(memoryCatalog(excluded),[]);
});
test('property-like receipt keys survive serialization and retain a normal prototype',()=>{
 const content=new MemoryRewardContent(pack());
 for(const id of ['__proto__','constructor','toString']){
  const value=account(),definition={...content.definition('discover'),id};
  const first=grantMemoryUnlock(value,definition,()=>0,content);
  assert(Object.hasOwn(value.memoryReceipts,id));assert.equal(Object.getPrototypeOf(value.memoryReceipts),Object.prototype);
  const saved=JSON.parse(JSON.stringify(value.memoryReceipts));
  assert.equal(saved[id].sequence,1);assert.equal(value.memoryReceipts[id],first);
  value.memoryReceipts=saved;
  assert.equal(grantMemoryUnlock(value,definition,()=>0,content).sequence,2);
 }
});
test('invalid and exhausted receipt sequences refuse before mutation or random consumption',()=>{
 const content=new MemoryRewardContent(pack()),definition=content.definition('discover');
 for(const sequence of [-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER]){
  const value=account();value.memoryReceipts.discover={sequence,id:'a',kind:'skill',tier:'discovery'};
  const before=state(value);let draws=0;
  assert.equal(grantMemoryUnlock(value,definition,()=>{draws++;return 0;},content),null);
  assert.equal(draws,0);assert.equal(state(value),before);
 }
 const value=account();value.memoryReceipts.discover={sequence:Number.MAX_SAFE_INTEGER-1,id:'a',kind:'skill',tier:'discovery'};
 assert.equal(grantMemoryUnlock(value,definition,()=>0,content).sequence,Number.MAX_SAFE_INTEGER);
 assert.equal(grantMemoryUnlock(value,definition,()=>{throw new Error('unexpected draw');},content),null);
});
test('receipt counters use own properties with inherited and null-prototype records',()=>{
 const content=new MemoryRewardContent(pack()),definition=content.definition('discover');
 const inherited={discover:{sequence:99,id:'a',kind:'skill',tier:'discovery'}};
 const value=account();value.memoryReceipts=Object.create(inherited);
 assert.equal(grantMemoryUnlock(value,definition,()=>0,content).sequence,1);
 assert.equal(inherited.discover.sequence,99);assert.equal(Object.getPrototypeOf(value.memoryReceipts),inherited);
 const empty=account();empty.memoryReceipts=Object.create(null);
 const literal={...definition,id:'__proto__'};
 assert.equal(grantMemoryUnlock(empty,literal,()=>0,content).sequence,1);
 assert.equal(Object.getPrototypeOf(empty.memoryReceipts),null);
 assert.equal(JSON.parse(JSON.stringify(empty.memoryReceipts)).__proto__.sequence,1);
});
test('nested draws and random-source mutations preserve the captured pool',()=>{
 const content=new MemoryRewardContent(pack()),definition=content.definition('discover');
 const nested=account();
 const outer=grantMemoryUnlock(nested,definition,()=>{
  assert.equal(grantMemoryUnlock(nested,definition,()=>0,content).sequence,1);
  return 0;
 },content);
 assert.equal(outer.sequence,2);assert.equal(outer.id,'a');
 const changed=account();
 assert.equal(grantMemoryUnlock(changed,definition,()=>{
  changed.unlockedSkills.add('a');changed.unlockedSkills.add('b');return 0;
 },content).id,'a');
 const invalid=account();
 assert.equal(grantMemoryUnlock(invalid,definition,()=>{
  invalid.memoryReceipts.discover={sequence:NaN,id:'b',kind:'skill',tier:'discovery'};return 0;
 },content),null);
 assert.equal(invalid.unlockedSkills.size,0);
 const throwing=account(),before=state(throwing),error=new Error('source failed');
 assert.throws(()=>grantMemoryUnlock(throwing,definition,()=>{throw error;},content),value=>value===error);
 assert.equal(state(throwing),before);
});
test('legendary awakening requires an actual eligible skill and retains dormant receipts',()=>{
 const content=new MemoryRewardContent(pack()),value=account();
 for(const id of ['__proto__','constructor','toString','unknown','hidden']){
  assert.equal(awakenMemoryFromDrop(value,id,'legendary',content),false);
 }
 assert.equal(awakenMemoryFromDrop(value,'a','rare',content),false);
 assert.equal(awakenMemoryFromDrop(value,'a','legendary',content),true);
 assert.equal(awakenMemoryFromDrop(value,'a','legendary',content),false);
 assert.equal(value.explicitSkillUnlocks.size,0);
 assert.equal(memoryProgressionOpen(value,content),false);
 assert.equal(memorySecondaryOpen(value,'skill','a','tree',content),false);
 value.ledger.stage_2=1;
 assert.equal(memorySecondaryOpen(value,'skill','a','tree',content),true);
 assert.equal(memoryCommissionReady(value,'skill','a',3,content),true);
 assert.equal(memoryCommissionReady(value,'support','s',3,content),false);
 value.unlockedSupports.add('s');value.ledger['drop:s']=3;
 assert.equal(memoryCommissionReady(value,'support','s',3,content),true);
 assert.equal(memoryCommissionReady(value,'support','s',4,content),false);
});
test('access views retain unknown saved skill IDs and distinction between unrestricted and empty',()=>{
 const content=new MemoryRewardContent(pack()),value=account();
 assert.deepEqual(memoryAccessView(value,content),{progression:false,tree:[],commission:[],prestige:[]});
 value.memorySecondary.add('skill:retired');value.memorySecondary.add('support:other');value.ledger.stage_2=1;
 assert.deepEqual(memoryAccessView(value,content),{progression:true,tree:['retired'],commission:['retired'],prestige:['retired']});
 value.features.add('all');
 assert.deepEqual(memoryAccessView(value,content),{progression:true,tree:null,commission:null,prestige:null});
});
test('content instances isolate policies and share no account state',()=>{
 const one=pack(),two=pack();two.config.excluded=['skill:a'];two.keys.awakeningStage=0;
 const a=new MemoryRewardContent(one),b=new MemoryRewardContent(two);
 assert.equal(memoryProgressionOpen(account(),a),false);assert.equal(memoryProgressionOpen(account(),b),true);
 assert.equal(memoryUnlockCandidates(account(),a.definition('discover'),a)[0].id,'a');
 assert.equal(memoryUnlockCandidates(account(),b.definition('discover'),b)[0].id,'b');
});
