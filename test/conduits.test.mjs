import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceConduits,validateConduitSpec} from '@hollow-wake/engine/resources/conduits';
import {ConduitCatalogue} from '@hollow-wake/engine/resources/conduits/catalogue';
import pack from '@hollow-wake/engine/content/conduits.json' with {type:'json'};

function setup() {
  const events=[];
  const body={life:60,mana:70,poise:50,es:25,ward:20,insight:10, skills:[],casting:null,
    activeAuras:new Set(),summonToggles:new Set(),wornConduits:[],
    sheet:{get(stat,tags,mods){events.push([stat,tags,mods]);return stat==='poiseOvercharge'?.25:1;}},
    maxLife:()=>100,lifeCeiling:()=>80,availableMaxMana:()=>75,maxEs:()=>60,maxPoise:()=>80,maxInsight:()=>30,
    healBy(n){events.push(['heal',n]);this.life+=n;},
    gainEs(n){this.es+=n;},gainPoise(n){this.poise+=n;},gainWard(n){this.ward+=n*2;},
    damagePoise(n,breaker){assert.equal(breaker,this);this.poise-=n;},
    onLifeSpent(n){events.push(['spent',n,this.life]);}};
  const readers={specs:s=>s.pumps,tags:s=>s.tags,modifiers:s=>s.mods};
  const pump=(from,to,extra={})=>({from,to,ratio:1,drainFlat:10,...extra});
  return {body,events,readers,pump};
}

test('an idle loadout never resolves support admission or queries the sheet',()=>{
  const {body,events}=setup();
  body.skills=Array(8).fill({def:{id:'stance'}});
  const fail=()=>assert.fail('resolved an idle skill');
  advanceConduits(body,.1,{specs:fail,tags:fail,modifiers:fail});
  assert.deepEqual(events,[]);
});
test('engaged hosts spend in slot order, then unscoped worn pumps use the live balances',()=>{
  const {body,events,readers,pump}=setup();
  const first={def:{id:'a'},tags:'first',mods:'A',pumps:[pump('mana','insight')]};
  const second={def:{id:'b'},tags:'second',mods:'B',pumps:[pump('insight','life',{drainFlat:30,floor:0})]};
  body.skills=[first,null,second];body.activeAuras.add('a');body.summonToggles.add('b');
  body.wornConduits=[pump('life','ward')];
  advanceConduits(body,1,readers);
  assert.deepEqual([body.mana,body.insight,body.life,body.ward],[60,0,70,40]);
  assert.deepEqual(events.filter(e=>e[0]==='conduitRate').map(e=>e.slice(1)),[['first','A'],['second','B'],[undefined,undefined]]);
  assert.deepEqual(events.filter(e=>['spent','heal'].includes(e[0])),[['heal',20],['spent',10,70]]);
});
test('a life-spend callback that lowers the guard commits the withdrawal before the live feed',()=>{
  const {body,readers,pump}=setup();
  const guard={mode:'guard',shield:15,maxShield:60,inst:{def:{id:'wall'}}};
  body.casting=guard;body.wornConduits=[pump('life','guard')];
  body.onLifeSpent=()=>{assert.equal(body.life,50);body.casting=null;};
  advanceConduits(body,1,readers);
  assert.equal(guard.shield,15);assert.equal(body.life,50);
});
test('a throwing withdrawal leaves earlier transfers and the observed spend in place',()=>{
  const {body,readers,pump}=setup();
  body.wornConduits=[pump('mana','insight'),pump('life','ward'),pump('es','insight')];
  body.onLifeSpent=()=>{throw new Error('interrupted');};
  assert.throws(()=>advanceConduits(body,1,readers),/interrupted/);
  assert.deepEqual([body.life,body.mana,body.insight,body.ward,body.es],[50,60,20,20,25]);
});
test('the drain and destination read their separate ceilings and exact half-point engagement edge',()=>{
  const {body,readers,pump}=setup();
  body.wornConduits=[pump('life','mana',{ratio:2,drainPct:.5})];
  body.mana=74.51;advanceConduits(body,1,readers);assert.equal(body.life,60);
  body.mana=74.5;advanceConduits(body,1,readers);assert.equal(body.life,59.75);assert.equal(body.mana,75);
  body.mana=0;body.life=10.25;body.wornConduits[0].floor=0;advanceConduits(body,10,readers);
  assert.equal(body.life,10);assert.equal(body.mana,.5);
});
test('actual poise yield, recovery gates and exponential ward draw determine the receiver',()=>{
  const {body,readers,pump}=setup();body.wornConduits=[pump('poise','es')];
  body.damagePoise=()=>{};advanceConduits(body,1,readers);assert.equal(body.es,25);
  body.wornConduits=[pump('ward','es',{drainFlat:0,drainPct:.25})];
  advanceConduits(body,1,readers);advanceConduits(body,1,readers);
  assert.equal(body.ward,11.25);assert.equal(body.es,33.75);
});
test('one actor can reenter a different actor without leaking its ports or resource owner',()=>{
  const left=setup(),right=setup();
  left.body.wornConduits=[left.pump('life','ward')];right.body.wornConduits=[right.pump('mana','es')];
  left.body.onLifeSpent=()=>advanceConduits(right.body,.5,right.readers);
  advanceConduits(left.body,1,left.readers);
  assert.deepEqual([left.body.life,left.body.ward,right.body.mana,right.body.es],[50,40,65,30]);
});
test('reject invalid frame clocks before any host read or mutation',()=>{
  const {body,events,pump,readers}=setup();body.wornConduits=[pump('life','mana')];
  for(const dt of [-1,NaN,Infinity])assert.throws(()=>advanceConduits(body,dt,readers),RangeError);
  assert.deepEqual(events,[]);assert.equal(body.life,60);
});
test('standalone authors and passive grants share the conduit schema',()=>{
  const spec={from:'ward',to:'es',drainPct:.5,ratio:1,floor:0};
  validateConduitSpec(Object.freeze(spec));
  for(const change of [{from:'bogus'},{to:'other'},{ratio:NaN},{drainPct:-.1},{floor:1.01},{extra:true}])
    assert.throws(()=>validateConduitSpec({...spec,...change}));
});

test('catalogue resolves admitted sockets and grafts before each invested tree occurrence',()=>{
  const catalogue=new ConduitCatalogue(pack);
  const support=catalogue.get('support','stoneblood_conduit')[0];
  const node=catalogue.get('tree','glacial_reservoir','ice_shield')[0];
  assert(support && node);
  assert.deepEqual(catalogue.forSkill('ice_shield',['unknown','stoneblood_conduit','stoneblood_conduit'],
    ['glacial_reservoir','glacial_reservoir']),[support,support,node,node]);
  assert.deepEqual(catalogue.forSkill('other',[],['glacial_reservoir']),[]);
  assert.strictEqual(catalogue.forSkill('stone_communion',[],[]),catalogue.get('skill','stone_communion'));
  assert.deepEqual(catalogue.get('skill','constructor'),[]);
});
test('catalogue detaches and freezes rows and configuration at load',()=>{
  const input=structuredClone(pack),catalogue=new ConduitCatalogue(input),first=input.entries[0];
  const pumps=catalogue.get(first.source,first.id,first.owner);
  const ratio=pumps[0].ratio;
  first.pumps[0].ratio=99;input.rules.floor=.99;
  assert.equal(pumps[0].ratio,ratio);assert.equal(catalogue.rules.floor,.15);
  assert.throws(()=>{pumps[0].ratio=7;},TypeError);
  assert.throws(()=>{pumps.pop();},TypeError);
});
test('catalogue rejects malformed scopes, duplicate source rows, and invalid thresholds',()=>{
  const entry={source:'tree',owner:'ice',id:'node',pumps:[{from:'mana',to:'guard',ratio:2}]};
  const make=(entries,rules=pack.rules)=>new ConduitCatalogue({version:1,rules,entries});
  for(const change of [{owner:undefined},{owner:'a\0b'},{source:'skill'},{id:''},{source:'bogus'},{pumps:[]},{other:1}])
    assert.throws(()=>make([{...entry,...change}]));
  assert.throws(()=>make([entry,entry]),/Duplicate/);
  assert.throws(()=>make([],{...pack.rules,lifeFloor:2}));
  assert.throws(()=>make([],{...pack.rules,minRoom:-1}));
  assert.throws(()=>make([{...entry,pumps:[Object.create({from:'life',to:'es',ratio:1})]}]));
});
