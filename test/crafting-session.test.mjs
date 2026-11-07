import test from 'node:test';
import assert from 'node:assert/strict';
import {CraftingSession} from '../dist/crafting-session.js';
import {CraftingContent} from '../dist/crafting-content.js';
import {ItemContent,ItemRules} from '../dist/item-rules.js';
import {SkillProgression} from '../dist/skill-progression.js';
import {Random} from '../dist/random.js';
import {itemPack} from '../scripts/compile-item-content.mjs';
import {craftingPack} from '../scripts/compile-crafting-content.mjs';
import {skillProgressionPack} from '../scripts/compile-skill-progression.mjs';

const items=new ItemContent(itemPack()),crafting=new CraftingContent(craftingPack(items),items),skills=new SkillProgression(skillProgressionPack());
const definitions={crafting,skills,memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}};
const copy=value=>JSON.parse(JSON.stringify(value));
const access={salvage:true,oracle:true,bench:true,counter:true};
const skill=skills.pack.skills[0],support=skills.pack.supports[0];
function gear(uid=1,extra={}){return {...new ItemRules(items,7,uid).forge({baseId:'ring_lapis',ilvl:10,rarity:'common',quality:.5}),...extra};}
function gem(uid=1,kind='skill',extra={}){return {uid,baseId:kind+'_gem',ilvl:1,tier:1,name:'Saved gem',rarity:'common',baseRoll:0,implicitRolls:[],affixes:[],
  gem:kind==='skill'?{kind,skillId:skill.id,level:1,rarity:'common',sockets:[]}:{kind,supportId:support.id,level:1},...extra};}
function state(extra={}) {return {board:{w:8,h:8},items:[],equipped:{},overflow:[],essences:Object.fromEntries(crafting.pack.essences.map(e=>[e.id,10000])),
  account:{craftLore:Object.fromEntries(Object.values(items.pack.affixes).map(a=>[a.family,{rank:1,progress:0}])),ledger:{},features:[crafting.pack.craft.extraSlotFeature],progression:true},...extra};}
function open(input=state(),seed=123,id=1,sdk=new CraftingSession(definitions)) {
  const reply=sdk.command({op:'open',profile:id,seed,state:input});assert.equal(reply.ok,true,JSON.stringify(reply));return sdk;
}
function command(sdk,op,args={},profile=1){return copy(sdk.command({op,profile,...(['craft','socket','reroll','salvage','salvage-bulk','lock'].includes(op)?{access}:{}),...args}));}
function save(sdk,profile=1){const row=command(sdk,'save',{},profile);assert.equal(row.ok,true,JSON.stringify(row));return row.save;}
const firstOption=(sdk,uid=1)=>command(sdk,'options',{uid,offset:0,limit:128}).rows[0];

test('owned crafting admission detaches input and snapshots while sharing immutable content',()=>{
  const input=state({items:[gear(1,{x:0,y:0})]}),sdk=open(input),before=save(sdk);
  input.items[0].name='outside';input.account.craftLore={};input.essences.coarse=0;
  assert.deepEqual(save(sdk),before);before.state.items[0].name='snapshot edit';assert.notEqual(save(sdk).state.items[0].name,'snapshot edit');
  assert.deepEqual(before.content.slice(0,3),[items.id,crafting.pack.contentId,skills.pack.contentId]);
  const other=open(state(),3,2,sdk);assert.deepEqual(save(other,2).state.items,[]);assert.equal(command(sdk,'open',{seed:2,state:state()}).reason,'already-open');
});

test('versioned views detach state, preserve field order and survive close/reopen without token reuse',()=>{
  const input=state({items:[gear(1,{x:0,y:0})]}),sdk=open({account:input.account,...input});
  const first=sdk.snapshotView(1);assert.equal(first.ok,true);
  assert.deepEqual(copy(first.view),save(sdk));
  assert.equal(JSON.stringify(first.view),sdk.snapshotText(1).text);
  assert.equal(Object.isFrozen(first.view.state.account),false);
  const original=copy(first.view.state.account);
  first.view.state.items[0].name='outside';first.view.state.account.ledger.outside=99;
  assert.deepEqual(save(sdk).state.account,original);
  assert.notEqual(save(sdk).state.items[0].name,'outside');
  const retained=sdk.snapshotView(1,first.accountVersion);
  assert.equal(retained.view.state.account,null);
  assert.equal(retained.accountVersion,first.accountVersion);
  command(sdk,'lock',{uid:1,on:true});
  const locked=sdk.snapshotView(1,retained.accountVersion);
  assert.equal(locked.view.state.items[0].locked,true);
  assert.equal(locked.view.state.account,null);
  assert.deepEqual(copy({...locked.view,state:{...locked.view.state,account:original}}),save(sdk));
  assert.equal(JSON.stringify({...locked.view,state:{...locked.view.state,account:original}}),sdk.snapshotText(1).text);
  const other=open(state(),5,2,sdk).snapshotView(2,first.accountVersion);
  assert.notEqual(other.accountVersion,first.accountVersion);assert(other.view.state.account);
  const saved=save(sdk);
  command(sdk,'close');command(sdk,'restore',{save:saved});
  const reopened=sdk.snapshotView(1,first.accountVersion);
  assert.notEqual(reopened.accountVersion,first.accountVersion);
  assert.deepEqual(copy(reopened.view),saved);
  assert.deepEqual(copy(JSON.parse(sdk.snapshotText(1).text)),saved);
});

test('versioned views refresh changed lore, preserve tokens on refusals and reject invalid cursors',()=>{
  const sdk=open(state({items:[gear(1,{x:0,y:0})]}));
  const before=sdk.snapshotView(1);
  assert.equal(command(sdk,'salvage',{uid:1,lane:'invalid'}).ok,false);
  assert.equal(sdk.snapshotView(1,before.accountVersion).accountVersion,before.accountVersion);
  command(sdk,'salvage',{uid:1,lane:'break'});
  const after=sdk.snapshotView(1,before.accountVersion);
  assert.notEqual(after.accountVersion,before.accountVersion);assert(after.view.state.account);
  assert.deepEqual(copy(after.view),save(sdk));
  for(const value of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1,'1',null,{},[]]){
    assert.deepEqual(sdk.snapshotView(value),{ok:false,reason:'invalid-integer'});
    assert.deepEqual(sdk.snapshotView(1,value),{ok:false,reason:'invalid-integer'});
  }
  assert.deepEqual(sdk.snapshotView(0xffffffff),{ok:false,reason:'not-open'});
  assert(sdk.snapshotView(1,Number.MAX_SAFE_INTEGER).view.state.account);
});

test('craft and socket compose real rules, payments, slot capacity and equipped notifications',()=>{
  const helmet=new ItemRules(items,7,1).forge({baseId:'helmet_armor',ilvl:10,rarity:'common',sockets:0});
  const sdk=open(state({equipped:{ring:helmet}})),option=firstOption(sdk),before=save(sdk);
  let reply=command(sdk,'craft',{uid:1,affixId:option.id,score:.7});assert.equal(reply.ok,true);assert(reply.events.some(e=>e.kind==='recalculate'));
  let saved=save(sdk);assert.equal(saved.state.equipped.ring.affixes.length,1);assert.equal(saved.state.equipped.ring.affixes[0].crafted,true);
  assert.equal(before.state.essences[option.cost.essence]-saved.state.essences[option.cost.essence],option.cost.count);
  reply=command(sdk,'socket',{uid:1});assert.equal(reply.ok,true);saved=save(sdk);assert.equal(saved.state.equipped.ring.craftedSockets,1);
  const after=copy(saved);reply=command(sdk,'socket',{uid:1});assert(reply.events.some(e=>e.kind==='refused'));assert.deepEqual(save(sdk),after);
});

test('station refusal does not mutate; an unpaid native reroll still advances its owned random stream',()=>{
  const base=gear(1,{x:0,y:0}),def=Object.values(items.pack.affixes).find(a=>a.tiers.some(t=>!t.magicOnly&&t.ilvl<=10));
  base.affixes=[{id:def.id,tier:def.tiers.findIndex(t=>!t.magicOnly&&t.ilvl<=10),rolls:def.lines.map(()=>.5)}];
  const sdk=open(state({items:[base],essences:{}})),before=save(sdk);
  command(sdk,'reroll',{uid:1,index:0,score:.5,access:{...access,oracle:false}});assert.deepEqual(save(sdk),before);
  const rng=Random.restore(before.random);crafting.rules.rollRerolledAffix(def,base,()=>rng.next(),.5);
  const reply=command(sdk,'reroll',{uid:1,index:0,score:.5});assert(reply.events.some(e=>e.kind==='insufficient'));
  const after=save(sdk);assert.deepEqual(after.state,before.state);assert.deepEqual(after.random,rng.snapshot());assert(after.random.draws>before.random.draws);
});

test('skill salvage preserves every recovered support, cut and lock through full-bag overflow',()=>{
  const source=gem(10,'skill',{x:0,y:0});source.gem.sockets=[{supportId:support.id,level:1,locked:true,rolled:{cut:'choice'}},null,{supportId:support.id,level:1}];
  const sdk=open(state({board:{w:1,h:1},items:[source]})),before=save(sdk);
  const reply=command(sdk,'salvage',{uid:10,lane:'break'});assert.equal(reply.ok,true,JSON.stringify(reply));
  let after=save(sdk);assert.deepEqual(after.state.items.map(i=>i.uid),[11]);assert.deepEqual(after.state.overflow.map(i=>i.uid),[12]);
  assert.equal(after.state.items[0].locked,true);assert.deepEqual(after.state.items[0].gem.rolled,{cut:'choice'});assert.deepEqual(after.random,before.random);
  assert.deepEqual(reply.events.filter(e=>e.kind==='recovered').map(e=>e.destination),['bag','overflow']);
  assert.equal(command(sdk,'recover',{uid:12}).result.moved,false);
  command(sdk,'lock',{uid:11,on:false});command(sdk,'salvage',{uid:11,lane:'sell'});
  assert.equal(command(sdk,'recover',{uid:12}).result.moved,true);after=save(sdk);assert.deepEqual(after.state.overflow,[]);assert.equal(after.state.items[0].uid,12);
  const maskedSource=gem(1,'skill',{x:0,y:0});maskedSource.gem.sockets=Array.from({length:3},()=>({supportId:support.id,level:1}));
  const masked=open(state({board:{w:3,h:1,rows:['#.#']},items:[maskedSource]}));command(masked,'salvage',{uid:1});
  const recovered=save(masked);assert.deepEqual(recovered.state.items.map(i=>i.x),[0,2]);assert.equal(recovered.state.overflow.length,1);
});

test('overflow transfer has one owner and a detached reply; saved recoveries survive reload',()=>{
  const sdk=open(state({overflow:[gem(30,'support')]})),saved=save(sdk);
  assert.equal(sdk.command({op:'restore',profile:2,save:saved}).ok,true);
  const reply=command(sdk,'take-overflow',{uid:30},2);assert.equal(reply.result.item.uid,30);reply.result.item.name='outside';
  assert.deepEqual(save(sdk,2).state.overflow,[]);assert.equal(command(sdk,'take-overflow',{uid:30},2).result.moved,false);
  assert.equal(save(sdk).state.overflow.length,1);assert.equal(save(sdk,2).nextUid,31);
});

test('bulk gear salvage preserves protected cargo and account knowledge; granted skills yield no currency',()=>{
  const rows=[gear(1,{x:0,y:0}),gear(2,{x:1,y:0,locked:true}),gear(3,{x:2,y:0,questId:'quest'}),gear(4,{x:3,y:0,relicKey:'relic'}),gem(5,'support',{x:4,y:0})];
  const def=Object.values(items.pack.affixes).find(d=>d.tiers.some(t=>!t.magicOnly));
  rows[0].affixes=[{id:def.id,tier:def.tiers.findLastIndex(t=>!t.magicOnly),rolls:def.lines.map(()=>.5)}];
  const initial=state({items:rows});initial.account.craftLore={[def.family]:{rank:0,progress:crafting.pack.craft.stepsPerRank[0]-1}};
  const sdk=open(initial),reply=command(sdk,'salvage-bulk',{category:'item',lane:'break'});
  assert.equal(reply.ok,true);assert.deepEqual(save(sdk).state.items.map(i=>i.uid),[2,3,4,5]);assert(reply.events.some(e=>e.kind==='account-save'));
  assert.deepEqual(save(sdk).state.account.craftLore[def.family],{rank:1,progress:0});assert.equal(save(sdk).state.account.ledger[crafting.pack.ledgerCraftsUnlocked],1);
  const granted=gem(8,'skill',{x:0,y:0});granted.gem.granted=true;const other=open(state({items:[granted]})),before=save(other);
  command(other,'salvage-bulk',{category:'skill'});assert.equal(save(other).state.items.length,1);
  const single=command(other,'salvage',{uid:8});assert(single.events.some(e=>e.kind==='cue'&&e.cue.kind==='granted-broken'));
  assert.deepEqual(save(other).state.essences,before.state.essences);assert.equal(save(other).state.items.length,0);
});

test('memory pouches retain units, refuse breaking and sell using the explicit kind mapping',()=>{
  for(const [base,kind] of Object.entries(definitions.memoryKinds)){
    const memory={...gem(1),baseId:base,name:'Memory',mem:[{d:'source',s:42},{d:'source',s:7,g:{k:'support',id:support.id}}],x:0,y:0};delete memory.gem;
    const sdk=open(state({items:[memory]})),before=save(sdk);const refused=command(sdk,'salvage',{uid:1,lane:'break'});
    assert(refused.events.some(e=>e.kind==='cue'&&e.cue.kind==='memory-refused'));assert.deepEqual(save(sdk),before);
    const reply=command(sdk,'salvage',{uid:1,lane:'sell'}),gain=crafting.rules.sellMemoryYield(kind,2),after=save(sdk);
    assert.equal(after.state.essences[gain.essence]-before.state.essences[gain.essence],gain.count);assert.deepEqual(after.state.items,[]);
    assert(reply.events.some(e=>e.kind==='cue'&&e.cue.memory===kind&&e.cue.count===2));
  }
});

test('mint, craft, save and restore continue the same item IDs, random values and payments',()=>{
  const sdk=open(),first=command(sdk,'mint',{kind:'forge',options:{baseId:'ring_lapis',ilvl:10,rarity:'rare'}});assert.equal(first.ok,true,JSON.stringify(first));
  const snapshot=save(sdk);assert.equal(sdk.command({op:'restore',profile:2,save:snapshot}).ok,true);
  for(const op of [{op:'mint',kind:'roll',options:{baseId:'ring_lapis',ilvl:10,rarity:'rare'}},{op:'socket',uid:first.result.uid},
    {op:'mint',kind:'forge',options:{baseId:'ring_lapis',ilvl:10,rarity:'unique'}}]){
    const {op:name,...args}=op;assert.deepEqual(command(sdk,name,args),command(sdk,name,args,2));assert.deepEqual(save(sdk),save(sdk,2));
  }
});

test('invalid saves refuse without dropping cargo or reserving a profile handle',()=>{
  const sdk=open(state({items:[gear(1,{x:0,y:0}),gem(2,'skill',{x:1,y:0})]})),original=save(sdk);
  const changes=[s=>s.content[0]='other',s=>s.nextUid=1,s=>s.state.items[1].uid=1,s=>s.state.items[1].x=0,
    s=>s.state.items[0].baseId='missing',s=>s.state.items[1].gem.skillId='missing',s=>s.state.items[1].gem.treeNodes=['missing'],
    s=>s.state.items[1].gem.sockets=[{supportId:'missing',level:1}],s=>s.state.items[0].unknown=true,
    s=>s.state.items[0].affixes=[{id:'missing',tier:0,rolls:[]}],s=>s.state.essences.unknown=1,s=>s.state.account.craftLore.unknown={rank:1,progress:0},
    s=>s.state.items[0].implicitRolls=[],s=>s.state.items[1].gem.kind='other',s=>s.state.items[1].gem.empowermentRank=1,
    s=>s.random.state=2**32,s=>s.random.draws=-1,s=>s.state.board.rows=['#'],s=>s.state.items[0].y=undefined];
  for(const mutate of changes){const bad=copy(original);mutate(bad);assert.equal(sdk.command({op:'restore',profile:2,save:bad}).ok,false,mutate.toString());assert.deepEqual(save(sdk),original);}
  assert.equal(sdk.command({op:'restore',profile:2,save:original}).ok,true);
  const remapped=new CraftingSession({...definitions,memoryKinds:{rough_memory:'preformed',preformed_memory:'rough'}});
  assert.equal(remapped.command({op:'restore',profile:1,save:original}).reason,'content-mismatch');
  const reordered=new CraftingSession({...definitions,memoryKinds:{preformed_memory:'preformed',rough_memory:'rough'}});
  assert.equal(reordered.command({op:'restore',profile:1,save:original}).ok,true);
});

test('late arithmetic and UID failures roll back currency, custody and RNG',()=>{
  const source=gem(1,'skill',{x:0,y:0});source.gem.sockets=[{supportId:support.id,level:1}];
  const sdk=open(state({items:[source]})),initial=save(sdk);initial.nextUid=Number.MAX_SAFE_INTEGER;
  assert.equal(sdk.command({op:'restore',profile:2,save:initial}).ok,true);const before=save(sdk,2);
  assert.equal(command(sdk,'salvage',{uid:1},2).reason,'uid-exhausted');assert.deepEqual(save(sdk,2),before);
  const state2=state({items:[gem(5,'support',{x:0,y:0})]});state2.essences[crafting.pack.supportEssence]=Number.MAX_SAFE_INTEGER;
  const second=open(state2),snap=save(second);assert.equal(command(second,'salvage',{uid:5}).ok,false);assert.deepEqual(save(second),snap);
  const exhausting=save(sdk);exhausting.random.draws=Number.MAX_SAFE_INTEGER-1;
  assert.equal(sdk.command({op:'restore',profile:3,save:exhausting}).ok,true);const randomBefore=save(sdk,3);
  const minted=command(sdk,'mint',{kind:'forge',options:{baseId:'ring_lapis',ilvl:10,rarity:'rare'}},3);
  assert.equal(minted.reason,'random-exhausted');assert.deepEqual(save(sdk,3),randomBefore);
});

test('support recovery exceeding the save envelope rolls back the whole command',()=>{
  const source=gem(1,'skill',{x:0,y:0});source.gem.sockets=Array.from({length:1024},()=>({supportId:support.id,level:1,rolled:{cut:'x'.repeat(10)}}));
  const sdk=open(state({board:{w:1,h:1},items:[source]})),before=save(sdk);
  const reply=command(sdk,'salvage',{uid:1});assert.equal(reply.ok,false,JSON.stringify(reply));assert.match(reply.reason,/limit|invalid-array/);
  assert.deepEqual(save(sdk),before);
});

test('all minted unique items retain their exact saved choices and rolls under strict admission',()=>{
  const sdk=new CraftingSession(definitions),mint=new ItemRules(items,718);
  for(const def of Object.values(items.pack.uniques)){
    const item=mint.forge({baseId:def.baseId,uniqueId:def.id,ilvl:90});assert(item,def.id);
    const input=state({overflow:[item]});input.account.craftLore={};
    const reply=sdk.command({op:'open',profile:1,seed:7,state:input});assert.equal(reply.ok,true,def.id+':'+JSON.stringify(reply));
    assert.deepEqual(save(sdk).state.overflow[0],item);command(sdk,'close');
  }
});

test('bounded JSON refuses executable, hidden, sparse, cyclic and excessive input without getters',()=>{
  const sdk=open(),before=save(sdk);let reads=0;
  const getter={op:'save',profile:1};Object.defineProperty(getter,'extra',{enumerable:true,get(){reads++;return 1;}});
  const symbol={op:'save',profile:1,[Symbol('extra')]:1};const hidden={op:'save',profile:1};Object.defineProperty(hidden,'extra',{value:1});
  const hiddenKnown={op:'save'};Object.defineProperty(hiddenKnown,'profile',{value:1});
  const cycle={op:'save',profile:1};cycle.extra=cycle;
  for(const input of [getter,symbol,hidden,hiddenKnown,cycle,{op:'save',profile:1,extra:Array(3)},
    {op:'save',profile:1,extra:'x'.repeat(262145)},{op:'save',profile:1,extra:'\u0000'},{op:'save',profile:1,extra:'\ud800'},
    {op:'save',profile:1,extra:Infinity},{op:'save',profile:1,extra:new Date()},{op:'save',profile:1,extra:()=>1}]){
    assert.equal(sdk.command(input).ok,false);assert.deepEqual(save(sdk),before);
  }
  assert.equal(reads,0);
  assert.equal(sdk.command({op:'save',profile:1,extra:Array(32700).fill(Number.MAX_VALUE)}).reason,'json-byte-limit');
  assert.equal(sdk.command({op:'save',profile:1,extra:'x'.repeat(262145)}).reason,'json-limit');
});

test('limits, unknown commands and illegal field combinations cannot consume session state',()=>{
  const sdk=open(state(),9,0,new CraftingSession(definitions,1)),before=save(sdk,0);
  assert.equal(command(sdk,'open',{seed:1,state:state()},1).reason,'profile-limit');
  for(const [op,args] of [['crafted',{}],['socket',{uid:1,extra:1}],['craft',{uid:1,affixId:'x',score:NaN}],['reroll',{uid:1,index:-1,score:1}],
    ['salvage',{uid:1,lane:'other'}],['salvage-bulk',{category:'other'}],['lock',{uid:1,on:1}],['socket',{uid:1,access:{salvage:true}}]]){
    assert.equal(command(sdk,op,args,0).ok,false);assert.deepEqual(save(sdk,0),before);
  }
  assert.equal(command(sdk,'close',{},0).ok,true);assert.equal(command(sdk,'save',{},0).reason,'not-open');
  assert.equal(command(sdk,'open',{seed:1,state:state()},1).ok,true);
});
