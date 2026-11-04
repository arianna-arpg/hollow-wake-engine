import test from 'node:test';
import assert from 'node:assert/strict';

const {grantVocation, vocationRootId, vocationUnlockKey, vocationStepQuestId, vocationDiscoveryKey, vocationStepKey, createVocationQuests} =
  await import(process.env.HWE_VOCATIONS_MODULE ?? '../dist/vocations.js');

function grantRig() {
  const character={vocations:[],allocated:new Set()}, run={}, account={}, events=[];
  const cap={value:2}, authority={enabled:true}, definitions=new Map([['a',0],['b',1]]);
  const ports={
    definition(id){events.push('definition:'+id);return definitions.get(id);},
    character(seat){assert.equal(seat,0);events.push('character');return character;},
    maxPerCharacter(){events.push('cap');return cap.value;},
    runLedger(){events.push('run');return run;},
    accountWritesAllowed(){events.push('authority');return authority.enabled;},
    accountLedger(){events.push('account');return account;},
    markAccountDirty(){events.push('account-dirty');},
    recalculate(){events.push('recalculate');},
    markCharacterDirty(){events.push('character-dirty');},
    announceGrant(_seat,def){events.push('grant:'+def);},announceTree(){events.push('tree');}
  };
  return {character,run,account,events,cap,authority,ports,grant:id=>grantVocation(id,0,ports)};
}
test('zero-valued definition and seat preserve ordered grant, credit, notifications and account replacement',()=>{
  const g=grantRig(),key=vocationUnlockKey('a');g.run[key]=3;g.account[key]=8;
  assert.equal(g.grant('a'),true);assert.deepEqual(g.character.vocations,['a']);assert(g.character.allocated.has(vocationRootId('a')));
  assert.equal(g.run[key],4);assert.equal(g.account[key],1);
  assert.deepEqual(g.events,['definition:a','character','cap','run','authority','account','account-dirty','recalculate','character-dirty','grant:0','tree']);
});
test('unknown, repeated and capped grants stop before new ledger access',()=>{
  const g=grantRig();assert.equal(g.grant('unknown'),false);assert.deepEqual(g.events,['definition:unknown']);
  g.events.length=0;g.character.vocations.push('a');assert.equal(g.grant('a'),false);assert.deepEqual(g.events,['definition:a','character']);
  g.cap.value=1;g.events.length=0;assert.equal(g.grant('b'),false);assert.deepEqual(g.events,['definition:b','character','cap']);
  assert.deepEqual(g.run,{});assert.deepEqual(g.account,{});
});
test('sealed account authority is sampled after the run write and before account access',()=>{
  const g=grantRig(),key=vocationUnlockKey('a');g.account[key]=4;
  g.ports.accountWritesAllowed=()=>{assert.equal(g.run[key],1);assert.deepEqual(g.character.vocations,['a']);return false;};
  g.ports.accountLedger=g.ports.markAccountDirty=()=>{throw Error('Sealed account access');};
  assert(g.grant('a'));assert.deepEqual(g.account,{[key]:4});assert(g.character.allocated.has(vocationRootId('a')));
});
test('reentrant grant sees the first crest and credits before the outer grant resumes',()=>{
  const g=grantRig();let nested=false;
  g.ports.recalculate=()=>{g.events.push('recalculate');if(!nested){nested=true;assert.equal(g.grant('a'),false);assert(g.grant('b'));}};
  assert(g.grant('a'));assert.deepEqual(g.character.vocations,['a','b']);assert.deepEqual([...g.character.allocated],['voc_a_root','voc_b_root']);
  assert.deepEqual(g.events.filter(e=>e.startsWith('grant')||e==='tree'),['grant:1','tree','grant:0','tree']);
});
test('each failed callback leaves the preceding writes and subsequent attempts refuse the already granted vocation',()=>{
  const names=['runLedger','accountWritesAllowed','accountLedger','markAccountDirty','recalculate','markCharacterDirty','announceGrant','announceTree'];
  for(const [index,name] of names.entries()){
    const g=grantRig(),key=vocationUnlockKey('a');g.ports[name]=()=>{throw Error(name);};
    assert.throws(()=>g.grant('a'),new RegExp(name));assert.deepEqual(g.character.vocations,['a']);assert(g.character.allocated.has('voc_a_root'));
    assert.equal(g.run[key],index>0?1:undefined);assert.equal(g.account[key],index>2?1:undefined);
    assert.equal(g.grant('a'),false);
  }
});
test('a failed crest write keeps the character grant and skips all ledger and UI work',()=>{
  const g=grantRig();g.character.allocated={add(){throw Error('crest');}};
  assert.throws(()=>g.grant('a'),/crest/);assert.deepEqual(g.character.vocations,['a']);assert.deepEqual(g.run,{});assert.deepEqual(g.account,{});
  assert.equal(g.grant('a'),false);
});

const config=()=>({giver:'quartermaster',offerAtLevel:30,pointsPerStep:2,maxPerCharacter:1});
const chain=(secret)=>({id:'v',name:'Vanguard',classId:'warden',secret,quest:{steps:[
  {offerLabel:'One',zone:{id:'first'},xp:8,vocationPoints:0,requiresLedger:'deed'},
  {offerLabel:'Two',zone:{id:'last'},turnInPrompt:'Return here'},
]}});
const state=()=>({classId:'warden',vocations:[],runLedger:{},accountLedger:{campaign:1}});
const eligible=ledger=>(ledger.campaign??0)>=1;
test('generated steps retain order, zone identity, shared giver and explicit optional reward properties',()=>{
  const def=chain({site:{npc:'shrine'}}),cfg=config();def.quest.offerAtLevel=0;
  const [first,last]=createVocationQuests([def],cfg,eligible);
  assert.equal(first.id,vocationStepQuestId('v',1));assert.equal(first.next,last.id);assert(Object.hasOwn(last,'next'));assert.equal(last.next,undefined);
  assert.deepEqual(first.giver,['shrine','quartermaster']);assert.equal(first.giver,first.turnIn.giver);assert.notEqual(first.giver,last.giver);
  assert.equal(first.zone,def.quest.steps[0].zone);assert.equal(first.offerAtLevel,0);assert.equal(first.requiresLedger,'deed');assert(!Object.hasOwn(last,'requiresLedger'));
  assert.deepEqual(first.reward,{xp:8,gems:undefined,vocationPoints:0,grantVocation:undefined,ledger:{voc_v_step_1:1,quests_completed:1}});
  assert.deepEqual(last.reward,{xp:undefined,gems:undefined,vocationPoints:2,grantVocation:'v',ledger:{voc_v_step_2:1,quests_completed:1}});
  assert.equal(first.turnIn.prompt,'The deed is done — return to the quartermaster (Vanguard, step 1).');assert.equal(last.turnIn.prompt,'Return here');
});
test('ordinary offers require live account entitlement for foreign classes and run credit for the next step',()=>{
  const [first,last]=createVocationQuests([chain()],config(),eligible),s=state();
  assert(first.gate(s));assert(!last.gate(s));s.classId='other';assert(!first.gate(s));
  s.runLedger[vocationUnlockKey('v')]=1;assert(!first.gate(s));s.accountLedger[vocationUnlockKey('v')]=1;assert(first.gate(s));
  s.accountLedger[vocationStepKey('v',1)]=2;assert(!last.gate(s));s.runLedger[vocationStepKey('v',1)]=0.5;assert(!last.gate(s));
  s.runLedger[vocationStepKey('v',1)]=1;assert(last.gate(s));s.accountLedger.campaign=0;assert(!last.gate(s));
});
test('secret discovery, default class lock and post-unlock site pilgrimage read current ledgers',()=>{
  const def=chain({site:{npc:'shrine'}}),[first,last]=createVocationQuests([def],config(),eligible),s=state();
  s.accountLedger[vocationDiscoveryKey('v')]=1;assert(!first.gate(s));s.runLedger[vocationDiscoveryKey('v')]=1;assert(first.gate(s));
  s.classId='other';assert(!first.gate(s));def.secret.classLockedDiscovery=false;assert(first.gate(s));assert(!last.gate(s));
  s.runLedger[vocationStepKey('v',1)]=1;assert(last.gate(s));
  delete s.runLedger[vocationDiscoveryKey('v')];s.accountLedger[vocationUnlockKey('v')]=1;assert(last.gate(s));
  def.secret.unlockedOffer='site';assert(!last.gate(s));s.runLedger[vocationDiscoveryKey('v')]=1;assert(last.gate(s));
});
test('gate configuration is live while generated level and reward configuration are captured',()=>{
  const cfg=config(),def=chain(),[q]=createVocationQuests([def],cfg,eligible),s=state();s.vocations=['other'];
  assert(!q.gate(s));cfg.maxPerCharacter=2;cfg.offerAtLevel=99;assert(q.gate(s));assert.equal(q.offerAtLevel,30);
  s.vocations=['v'];assert(!q.gate(s));let reads=0;
  const [closed]=createVocationQuests([def],cfg,()=>false);
  assert(!closed.gate({get vocations(){reads++;throw Error('Premature character access');},accountLedger:{}}));assert.equal(reads,0);
});
