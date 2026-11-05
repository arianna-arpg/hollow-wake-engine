import test from 'node:test';
import assert from 'node:assert/strict';
import {createGemResidence,packSkillGemPayload,packSupportGemPayload,packGrantState,
  bagGemItems,findBagGem,isGemItem,gemInitials,writeBackSupportGem} from '../dist/gem-residence.js';
import {createItemRestoration} from '../dist/item-restoration.js';

const gear=(extra={})=>({uid:20,baseId:'ring',ilvl:1,tier:1,rarity:'common',name:'Saved',baseRoll:0,implicitRolls:[],affixes:[],...extra});
function fixture(overrides={}){
  let uid=1;const calls=[],skills={spell:{id:'spell',name:'Spell'}},supports={cut:{id:'cut',name:'Cut'}};
  const itemPorts={base:id=>['ring','skill_gem','support_gem'].includes(id)?{category:'ring'}:undefined,
    affix:id=>id==='power'?{tiers:[{},{}]}:undefined,hasUnique:id=>id==='legend',hasVestige:id=>id==='stone',socketCap:()=>2,
    bumpUidFloor:seen=>{calls.push(['floor',seen]);uid=Math.max(uid,Math.floor(seen)+1);},
    resolveChoices:item=>{calls.push(['choices',item.uid]);return {group:{id:'repair',rolls:[.5]}};}};
  const restoration=createItemRestoration(itemPorts);
  const ports={skill:id=>{calls.push(['skill',id]);return skills[id];},support:id=>{calls.push(['support',id]);return supports[id];},
    hasOwnSupport:id=>Object.hasOwn(supports,id),hasForm:id=>id==='form',
    makeSkill:(def,level,sockets)=>{calls.push(['create',def.id,level,sockets]);return {def,level,sockets:Array(sockets).fill(null),hostField:'native'};},
    validTreeNodes:(def,ids,level,inst)=>{calls.push(['tree',def.id,[...ids],level,inst?.empowermentRank,inst?.sockets.map(s=>s?.def.id??null)]);return ids.filter(id=>id==='passive').slice(0,1+(inst?.empowermentRank??0));},
    nextUid:()=>uid++,rebuildItem:restoration.rebuildItem,bagWidth:()=>3,bagHeight:()=>2,itemGridSize:item=>item.size??{w:1,h:1},...overrides};
  return {rules:createGemResidence(ports),ports,itemPorts,restoration,calls,skills,supports,next:()=>uid};
}
const live=f=>({def:f.skills.spell,level:4,rarity:'legendary',empowermentRank:2,locked:true,granted:true,
  replenishmentPaused:true,attunedForm:'form',treeNodes:['passive','passive','passive'],
  sockets:[{def:f.supports.cut,level:3,locked:true,rolled:{choice:'kept'},gauge:99,forwarded:true},null],markPos:{x:5,y:7}});

test('pack owns persistent arrays and cuts, with one wrapper lock and no combat state',()=>{
  const f=fixture(),inst=live(f),payload=packSkillGemPayload(inst),grant=packGrantState(inst);
  assert.deepEqual(payload,{kind:'skill',skillId:'spell',level:4,rarity:'legendary',empowermentRank:2,replenishmentPaused:true,
    sockets:[{supportId:'cut',level:3,locked:true,rolled:{choice:'kept'}},null],granted:true,attunedForm:'form',treeNodes:['passive','passive','passive']});
  assert.notEqual(payload.sockets,inst.sockets);assert.notEqual(payload.sockets[0].rolled,inst.sockets[0].rolled);
  assert.notEqual(payload.treeNodes,inst.treeNodes);assert.notEqual(grant.sockets[0].rolled,inst.sockets[0].rolled);assert.notEqual(grant.treeNodes,inst.treeNodes);
  assert.deepEqual(Object.keys(grant),['sockets','treeNodes']);
  const support=packSupportGemPayload(inst.sockets[0]);assert.deepEqual(support,{kind:'support',supportId:'cut',level:3,rolled:{choice:'kept'}});
  assert.notEqual(support.rolled,inst.sockets[0].rolled);
  payload.sockets[0].rolled.choice='changed';payload.treeNodes.length=0;assert.equal(inst.sockets[0].rolled.choice,'kept');assert.equal(inst.treeNodes.length,3);
});

test('loose restoration validates trees with investment before replacing saved socket rows',()=>{
  const f=fixture(),item=f.rules.makeSkillGemItem(live(f));item.gem.sockets.push({supportId:'retired',level:8});
  const inst=f.rules.skillOfGemItem(item);assert.equal(inst.def,f.skills.spell);assert.equal(inst.sockets[0].def,f.supports.cut);
  assert.deepEqual(inst.sockets.slice(1),[null,null]);assert.equal(inst.locked,true);assert.equal(inst.hostField,'native');
  assert.equal(inst.granted,true);assert.equal(inst.attunedForm,'form');assert.equal(inst.replenishmentPaused,true);
  assert.equal(inst.treeNodes.length,3);assert.notEqual(inst.sockets[0].rolled,item.gem.sockets[0].rolled);
  assert.deepEqual(f.calls,[['skill','spell'],['create','spell',4,3],['tree','spell',['passive','passive','passive'],4,2,[null,null,null]],['support','cut'],['support','retired']]);
  item.gem.sockets=[];item.gem.attunedForm='retired';item.gem.replenishmentPaused=1;
  const empty=f.rules.skillOfGemItem(item);assert.deepEqual(empty.sockets,[]);assert.equal(empty.attunedForm,undefined);assert.equal(empty.replenishmentPaused,undefined);
  assert.deepEqual(f.calls.findLast(c=>c[0]==='create'),['create','spell',4,1]);
});

test('grant restoration has current capacity and ordinary tree budget, and detaches saved cuts',()=>{
  const f=fixture(),state=packGrantState(live(f)),inst={...live(f),sockets:[null]};
  f.rules.restoreGrantState(inst,state);assert.equal(inst.sockets.length,1);assert.deepEqual(inst.treeNodes,['passive']);
  assert.equal(inst.sockets[0].def,f.supports.cut);assert.notEqual(inst.sockets[0].rolled,state.sockets[0].rolled);
  assert.deepEqual(f.calls,[['support','cut'],['tree','spell',['passive','passive','passive'],4,undefined,undefined]]);
  f.rules.restoreGrantState(inst,{treeNodes:[]});assert.deepEqual(inst.sockets,[null]);assert.deepEqual(inst.treeNodes,['passive']);
  inst.sockets=[];f.rules.restoreGrantState(inst,state);assert.deepEqual(inst.sockets,[]);
});

test('wrappers use a shared explicit identity stream and reject an invalid allocated UID',()=>{
  const f=fixture(),inst=live(f),skill=f.rules.makeSkillGemItem(inst),support=f.rules.makeSupportGemItem(inst.sockets[0]);
  assert.deepEqual([skill.uid,support.uid],[1,2]);assert.equal(skill.name,'Spell II');assert.equal(skill.rarity,'unique');
  assert.equal(support.rarity,'common');assert.equal(skill.locked,true);assert.equal(support.locked,true);assert(!Object.hasOwn(skill.gem,'locked'));assert(!Object.hasOwn(skill,'x'));
  for(const id of [0,-1,1.25,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
    const bad=fixture({nextUid:()=>id});assert.throws(()=>bad.rules.makeSkillGemItem(live(bad)),/Gem item uid/);
    assert.throws(()=>bad.rules.makeSupportGemItem({def:bad.supports.cut,level:1}),/Gem item uid/);
  }
  const ordinary={def:f.skills.spell,level:1,sockets:[]};assert.deepEqual(packSkillGemPayload(ordinary),{kind:'skill',skillId:'spell',level:1,rarity:'common',sockets:[]});
  ordinary.rarity='rare';ordinary.empowermentRank=3;assert(!Object.hasOwn(packSkillGemPayload(ordinary),'empowermentRank'));
});

test('socket reads preserve unrelated stale cargo and reject inherited IDs and invalid indexes',()=>{
  const f=fixture(),item=f.rules.makeSkillGemItem(live(f));item.gem.attunedForm='retired';item.gem.treeNodes=['retired'];
  const before=structuredClone(item);const support=f.rules.bagSkillSupport(item,0);
  assert.equal(support.def,f.supports.cut);assert.notEqual(support.rolled,item.gem.sockets[0].rolled);support.rolled.choice='mutated';assert.deepEqual(item,before);
  for(const index of [-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER,1,2])assert.equal(f.rules.bagSkillSupport(item,index),null);
  for(const id of ['constructor','__proto__','retired']){item.gem.sockets=[{supportId:id,level:1}];assert.equal(f.rules.bagSkillSupport(item,0),null);}
  assert.equal(f.rules.bagSkillSupport(gear(),0),null);
});

test('support writeback replaces cargo and clears the lock without changing wrapper identity or placement',()=>{
  const f=fixture(),support=live(f).sockets[0],item=f.rules.makeSupportGemItem(support);item.x=2;item.y=1;
  const old=item.gem,inst=f.rules.supportOfGemItem(item);assert.equal(inst.def,f.supports.cut);assert.notEqual(inst.rolled,item.gem.rolled);
  delete inst.locked;inst.level=5;inst.def.name='New name';writeBackSupportGem(item,inst);
  assert.notEqual(item.gem,old);assert(!Object.hasOwn(item,'locked'));assert.equal(item.name,'New name');assert.deepEqual([item.uid,item.x,item.y],[1,2,1]);
  assert.notEqual(item.gem.rolled,inst.rolled);assert.equal(old.level,3);
  inst.locked=true;writeBackSupportGem(item,inst);assert.equal(item.locked,true);
  item.gem.supportId='retired';assert.equal(f.rules.supportOfGemItem(item),null);assert.equal(f.rules.skillOfGemItem(item),null);
});

test('common restoration filters and clamps borrowed affixes before UID reservation and unique repair',()=>{
  const f=fixture(),saved=gear({uniqueId:'legend',sockets:['stone','retired','stone'],affixes:[{id:'power',tier:9,rolls:[.4]},{id:'retired',tier:0,rolls:[]},{id:'power',tier:-2,rolls:[.6]}]});
  const result=f.restoration.rebuildItem(saved);assert.notEqual(result,saved);assert.notEqual(result.affixes,saved.affixes);
  assert.equal(result.affixes[0],saved.affixes[0]);assert.equal(result.affixes[1],saved.affixes[2]);assert.deepEqual(result.affixes.map(a=>a.tier),[1,0]);
  assert.equal(result.implicitRolls,saved.implicitRolls);assert.notEqual(result.sockets,saved.sockets);assert.deepEqual(result.sockets,['stone',null]);
  assert.deepEqual(f.calls,[['floor',20],['choices',20]]);assert.equal(f.next(),21);assert.deepEqual(result.uniqueChoices,{group:{id:'repair',rolls:[.5]}});
});

test('stale base/unique reject before identity, stale gem rejects after it, and live names normalize borrowed payloads',()=>{
  const f=fixture();assert.equal(f.rules.rebuildAnyItem(gear({baseId:'retired',uid:500})),null);
  assert.equal(f.rules.rebuildAnyItem(gear({uniqueId:'retired',uid:500})),null);assert.equal(f.next(),1);assert.deepEqual(f.calls,[]);
  const saved=gear({uid:40,baseId:'skill_gem',gem:{kind:'skill',skillId:'retired',level:1,rarity:'common',sockets:[]}});
  assert.equal(f.rules.rebuildAnyItem(saved),null);assert.equal(f.next(),41);assert.deepEqual(f.calls,[['floor',40],['skill','retired']]);
  saved.gem.skillId='spell';saved.gem.empowermentRank=1.5;saved.gem.attunedForm='retired';saved.gem.treeNodes=['retired'];f.skills.spell.name='New';
  const restored=f.rules.rebuildAnyItem(saved);assert.equal(restored.gem,saved.gem);assert(!Object.hasOwn(saved.gem,'empowermentRank'));assert.equal(restored.name,'New');
  assert.equal(restored.gem.attunedForm,'retired');assert.deepEqual(restored.gem.treeNodes,['retired']);
  saved.gem={kind:'support',supportId:'cut',level:3};f.supports.cut.name='New cut';assert.equal(f.rules.rebuildAnyItem(saved).name,'New cut');
  saved.gem.supportId='retired';assert.equal(f.rules.rebuildAnyItem(saved),null);
});

test('restoration keeps opaque memory/grant cargo, supplies legacy array defaults and removes empty sockets',()=>{
  const f=fixture(),saved=gear({mem:[{d:'quest',s:3}],grantState:{spell:{sockets:[]}},relicKey:'relic',questId:'quest',sockets:[],affixes:undefined,implicitRolls:undefined});
  const result=f.rules.rebuildAnyItem(saved);assert.equal(result.mem,saved.mem);assert.equal(result.grantState,saved.grantState);
  assert.deepEqual(result.affixes,[]);assert.deepEqual(result.implicitRolls,[]);assert(!Object.hasOwn(result,'sockets'));assert.equal(result.relicKey,'relic');assert.equal(result.questId,'quest');
});

test('a host callback failure retains prior writes and does not poison later restoration',()=>{
  const f=fixture(),saved=gear({affixes:[{id:'power',tier:8,rolls:[]}]});let fail=true;
  f.itemPorts.bumpUidFloor=()=>{if(fail)throw new Error('identity unavailable');};
  assert.throws(()=>f.restoration.rebuildItem(saved),/identity unavailable/);assert.equal(saved.affixes[0].tier,1);
  fail=false;assert.doesNotThrow(()=>f.restoration.rebuildItem(saved));
  const item=f.rules.makeSkillGemItem(live(f));let reads=0;
  f.ports.skill=()=>{if(++reads===2)throw new Error('definition changed');return f.skills.spell;};item.gem.empowermentRank=-1;
  assert.throws(()=>f.rules.rebuildAnyItem(item),/definition changed/);assert(!Object.hasOwn(item.gem,'empowermentRank'));
});

test('bag queries retain order/identity and legacy area semantics without normalizing layouts',()=>{
  const f=fixture(),a=f.rules.makeSkillGemItem(live(f)),b=f.rules.makeSkillGemItem(live(f)),ordinary=gear();
  assert.deepEqual(bagGemItems([ordinary,a,b]),[a,b]);assert.equal(bagGemItems([a])[0],a);assert.equal(findBagGem([a,b],'skill','spell'),a);
  assert.equal(findBagGem([a],'support','spell'),undefined);assert.equal(isGemItem({...ordinary,gem:null}),true);
  let reads=0;f.ports.bagWidth=()=>{reads++;return 2;};f.ports.bagHeight=()=>{reads++;return 2;};
  a.x=0;a.y=0;b.x=0;b.y=0;ordinary.x=1;
  assert.equal(f.rules.freeCellCount([a,b,ordinary]),2);assert.equal(reads,2);
  ordinary.y=1;ordinary.size={w:4,h:3};assert.equal(f.rules.freeCellCount([a,b,ordinary]),-10);
  assert.equal(gemInitials('one two three four'),'OTT');assert.equal(gemInitials('  Fire   Bolt '),'FB');
});

test('independent services share definitions without sharing IDs or saved cargo',()=>{
  const a=fixture(),b=fixture();b.skills.spell=a.skills.spell;b.supports.cut=a.supports.cut;
  const item=a.rules.makeSkillGemItem(live(a));assert.equal(item.uid,1);a.rules.makeSkillGemItem(live(a));
  const other=b.rules.makeSkillGemItem(live(b));assert.equal(other.uid,1);assert.equal(a.next(),3);assert.equal(b.next(),2);
  other.gem.sockets[0].rolled.choice='B';assert.equal(item.gem.sockets[0].rolled.choice,'kept');
  assert(Object.isFrozen(a.rules)&&Object.isFrozen(a.restoration));
});
