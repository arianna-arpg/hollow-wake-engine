
import test from 'node:test';
import assert from 'node:assert/strict';
import {UnlockContent} from '../dist/unlock-content.js';
import {RuneScript} from '../dist/rune-script.js';
import {validateUnlockPredicate,testUnlockPredicate} from '../dist/unlock-predicates.js';
import {ProgressionGateContent} from '../dist/progression-gate-content.js';
import {MemoryRewardContent} from '../dist/memory-reward-content.js';
import {unlockContentPack} from '../scripts/compile-unlock-content.mjs';
import {memoryRewardPack} from '../scripts/compile-memory-rewards.mjs';
import {progressionGatePack} from '../scripts/compile-progression-gates.mjs';
const source=unlockContentPack();
const gates=new ProgressionGateContent(progressionGatePack());
const memories=new MemoryRewardContent(memoryRewardPack());
const pack=()=>structuredClone(source),load=value=>new UnlockContent(value,{gates,memories});
const services={value:41,reliquaryCost(){return this.value;},reliquaryPower(){return this.value;},stashPageCost(){return this.value;},investReliquary(){return this.value;},investRelicStash(){return this.value;}};

test('content owns detached frozen definitions and stable indexed identities',()=>{
 const input=pack(),content=load(input),context=content.context(services),first=content.pack.catalog[0],id=first.id;
 input.catalog[0].cost+=1;input.classBundles[0].skillIds.pop();input.packages[0].label='Changed';
 assert.notEqual(content.pack.catalog[0].cost,input.catalog[0].cost);assert.equal(content.definition(id),first);
 assert.equal(context.unlock(id),first);assert.equal(context.packages(),context.packages());
 assert.equal(context.package(content.pack.packages[0].id),context.packages()[0]);
 assert.equal(context.memoryCatalog(),memories.catalogue());
 assert.throws(()=>{context.catalog[0].cost=0;},TypeError);
 assert.throws(()=>{context.packages()[0].unlock.test=()=>true;},TypeError);
 assert.throws(()=>{content.pack.classBundles[0].skillIds.push('x');},TypeError);
 assert.equal(content.definition('__proto__'),undefined);assert.equal(context.package('constructor'),undefined);
});

test('literal catalogue IDs use safe indexed lookup and dependency references',()=>{
 const input=pack(),row=input.catalog.find(r=>r.kind==='feature'&&!r.requiresUnlock);
 input.catalog.push({...row,id:'__proto__',payload:{flag:'literal'}});
 const content=load(input);assert.equal(content.definition('__proto__').payload.flag,'literal');
 assert.equal(Object.getPrototypeOf(content.pack.catalog),Array.prototype);
});

test('content rejects wrong dependencies, versions, missing records and unsupported fields',()=>{
 for(const edit of [
  p=>p.schemaVersion=2,p=>p.dependencies.gates='other',p=>p.dependencies.memories='other',p=>p.keys.classPrefix='',
  p=>p.unknown=1,p=>p.catalog=null,p=>p.catalog[0].unexpected=1,p=>p.catalog[0].payload.unexpected=1,
  p=>p.classes[0].name='Other',p=>p.starterSkills.push('missing'),p=>p.classBundles[0].skillIds.push('missing'),
  p=>p.classBundles[0].supportIds.push('missing'),p=>p.packages[0].tiers.push({id:'x',label:'X',cost:1,requirement:'X',predicate:{kind:'oops'}}),
 ]){
  const input=pack();edit(input);assert.throws(()=>load(input));
 }
});

test('catalogue prices, references, unique IDs and prerequisite cycles validate at load time',()=>{
 for(const edit of [
  p=>p.catalog[0].cost=-1,p=>p.catalog[0].cost=.5,p=>p.catalog[0].cost=Infinity,
  p=>p.catalog.push({...p.catalog[0]}),p=>p.catalog[0].requiresUnlock='missing',
  p=>p.catalog[0].requiresUnlock=p.catalog[0].id,
  p=>{p.catalog[0].requiresUnlock=p.catalog[1].id;p.catalog[1].requiresUnlock=p.catalog[0].id;},
  p=>p.catalog.find(r=>r.kind==='memory').payload.memoryUnlockId='missing',
  p=>p.catalog.find(r=>r.kind==='classtier').payload.classId='missing',
  p=>p.catalog[0].reqAnyOf=[{ledger:'x',level:2}],p=>p.catalog[0].reqAnyOf=[{unlock:'missing'}],
  p=>p.catalog[0].reqAnyOf=[{classLevel:{classId:'missing',level:2}}],
  p=>p.slotTiers[0].cost+=1,
 ]){const input=pack();edit(input);assert.throws(()=>load(input));}
});

test('shelves, pacing and growth bounds reject unusable authoring records',()=>{
 for(const edit of [
  p=>p.tabs.push({...p.tabs[0]}),p=>p.tabs.find(t=>t.owned).fallback=true,
  p=>p.tabs.find(t=>t.fallback).fallback=false,p=>p.tabs[0].kinds=['unknown'],
  p=>p.tabs[0].kinds.push('memory'),p=>delete p.kindLabels.memory,
  p=>p.classWeb.revealFrac=-1,p=>p.investConfig.baseRate=-1,
  p=>delete p.shelfConfig.stripMinShelves,p=>p.reliquaryConfig.costBase=1e300,
  p=>p.relicStash.maxPages=257,p=>p.relicStash.board.w=0,p=>p.commissionNeed=.5,
 ]){const input=pack();edit(input);assert.throws(()=>load(input));}
});

test('package ownership IDs and predicates cannot silently collide or run unknown code',()=>{
 for(const edit of [
  p=>p.packages.push({...p.packages[0]}),
  p=>{const rows=p.packages.filter(p=>p.tiers.length);rows[1].tiers[0].id=rows[0].tiers[0].id;},
  p=>p.packages.find(p=>p.tiers.length).tiers[0].id=p.packages[0].id,
  p=>p.packages[0].unlock.predicate={kind:'constant',value:true,code:'alert(1)'},
  p=>p.packages[0].unlock.predicate={kind:'counter',source:'ledger',key:'a',fallback:0,threshold:NaN,comparison:'>='},
  p=>p.packages[0].unlock.predicate={kind:'counter',source:'ledger',key:'a',fallback:0,threshold:1,comparison:'=='},
 ]){const input=pack();edit(input);assert.throws(()=>load(input));}
});

test('explicit relic services preserve their receiver and missing services fail immediately',()=>{
 const content=load(pack()),context=content.context(services);
 assert.equal(context.reliquaryCost({rank:0}),41);assert.equal(context.investRelicStash({},1),41);
 for(const name of ['reliquaryCost','reliquaryPower','stashPageCost','investReliquary','investRelicStash'])
  assert.throws(()=>content.context({...services,[name]:null}));
});

test('predicate data preserves strict thresholds, zero fallbacks and lazy ordered reads',()=>{
 const ledger=(key,comparison='>=',threshold=1)=>({kind:'counter',source:'ledger',key,comparison,threshold,fallback:0});
 const reads=[],input={account:{get level(){reads.push('level');return 2;}},ledger:new Proxy({a:1,b:0},{get(target,key){reads.push(key);return target[key];}})};
 const any={kind:'any',terms:[ledger('a'),ledger('b')]};validateUnlockPredicate(any);assert(testUnlockPredicate(any,input));assert.deepEqual(reads,['a']);
 reads.length=0;assert(!testUnlockPredicate({kind:'all',terms:[ledger('b'),ledger('a')]},input));assert.deepEqual(reads,['b']);
 assert.equal(testUnlockPredicate(ledger('b','>',0),input),false);
 assert.equal(testUnlockPredicate(ledger('missing','>=',0),input),true);
 assert.equal(testUnlockPredicate(ledger('missing','>',0),input),false);
 assert.equal(testUnlockPredicate({kind:'counter',source:'accountLevel',comparison:'>=',threshold:2},input),true);
 for(const value of [NaN,-Infinity])assert.equal(testUnlockPredicate(ledger('x'),{account:{level:0},ledger:{x:value}}),false);
});

test('predicate validation rejects malformed, empty and excessively deep programs',()=>{
 for(const row of [null,{},[],{kind:'constant',value:1},{kind:'counter',source:'other',comparison:'>=',threshold:1},
  {kind:'counter',source:'ledger',key:'',fallback:0,comparison:'>=',threshold:1},
  {kind:'any',terms:[]},{kind:'all',terms:[{kind:'constant',value:true}]}])assert.throws(()=>validateUnlockPredicate(row));
 let program={kind:'constant',value:true};for(let i=0;i<40;i++)program={kind:'any',terms:[program,{kind:'constant',value:false}]};
 assert.throws(()=>validateUnlockPredicate(program));
});

test('rune alphabets are detached, unambiguous and immutable',()=>{
 const alphabet=[{letter:'th',rune:'ᚦ',name:'th'},{letter:'a',rune:'ᚨ',name:'a'}],runes=new RuneScript(alphabet);
 alphabet[0].letter='other';assert.equal(runes.encipher('TH a!'),'ᚦ ᚨ!');assert.equal(runes.decipher('ᚦ ᚨ!'),'th a!');
 assert.equal(runes.runeOf('TH'),'ᚦ');assert.equal(runes.runeLetterOf('ᚦ'),'th');assert.equal(runes.runeLetterRow('TH').letter,'th');
 assert.throws(()=>{runes.alphabet[0].letter='x';},TypeError);
 for(const input of [[],[{letter:'A',rune:'ᚨ',name:'a'}],[{letter:'a',rune:'xx',name:'a'}],
  [{letter:'a',rune:'ᚨ',name:'a'},{letter:'b',rune:'ᚨ',name:'b'}]])assert.throws(()=>new RuneScript(input));
});

test('gradual reveal is deterministic, handles empty text and consumes no ambient randomness',()=>{
 const runes=new RuneScript(source.alphabet),text='The thing and the thunder.',random=Math.random;
 Math.random=()=>{throw new Error('Ambient RNG used');};
 try{
  assert.equal(runes.reveal(text,0),runes.encipher(text));assert.equal(runes.reveal(text,1),text);
  assert.equal(runes.reveal(text,.5),runes.reveal(text,.5));assert.notEqual(runes.reveal(text,.5),runes.encipher(text));
  assert.notEqual(runes.reveal(text,.999),text.toLowerCase());assert.equal(runes.reveal('',.5),'');
  assert.equal(runes.reveal('123🙂',.5),'123🙂');assert.equal(runes.reveal(text,NaN),runes.encipher(text));
 }finally{Math.random=random;}
});
