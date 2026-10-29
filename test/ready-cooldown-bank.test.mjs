import test from 'node:test';
import assert from 'node:assert/strict';
import {refundReadyCooldown as refund,consumeReadyCooldownBank as consume,publishReadyCooldownBank as publish} from '../dist/ready-cooldown-bank.js';

const skill={def:{id:'command'}};
const policy={enabled:()=>true,price:()=>8,maxExtra:()=>4};
const setup=(clock=4,credit=0)=>{
  const actor={cooldowns:new Map(clock===null?[]:[['command',clock]]),cooldownTotals:new Map([['command',8]])};
  return {actor,bank:{owner:actor,host:skill,bank:credit}};
};
function view(bank,ports=policy){let result='unpublished';publish(bank,ports,{clear:()=>{result=undefined;},publish:(_actor,hits,progress)=>{result={hits,progress};}});return result;}

test('running refunds preserve denominator and do not bank overshoot',()=>{
  const {actor,bank}=setup();refund(actor,skill,bank,1,policy);assert.equal(actor.cooldowns.get('command'),3);
  refund(actor,skill,bank,20,policy);assert.equal(actor.cooldowns.size,0);assert.equal(bank.bank,0);assert.equal(actor.cooldownTotals.get('command'),8);
});
test('ready refunds bank up to the current price cap',()=>{
  const {actor,bank}=setup(null,31);refund(actor,skill,bank,4,policy);assert.equal(bank.bank,32);assert.equal(actor.cooldowns.size,0);
});
test('disabled banking does not query price or capacity',()=>{
  const {actor,bank}=setup(null,7);refund(actor,skill,bank,4,{enabled:()=>false,price:()=>{throw Error('price');},maxExtra:()=>{throw Error('limit');}});assert.equal(bank.bank,7);
});
test('running refunds skip the readiness policy entirely',()=>{
  const {actor,bank}=setup();refund(actor,skill,bank,1,{...policy,enabled:()=>{throw Error('policy');}});assert.equal(bank.bank,0);
});
test('bank price can reduce existing credit when the cap changes',()=>{
  const {actor,bank}=setup(null,25);refund(actor,skill,bank,1,{...policy,price:()=>4});assert.equal(bank.bank,16);
});
test('clock writes precede price and bank writes',()=>{
  const {actor,bank}=setup(0,2);assert.throws(()=>refund(actor,skill,bank,1,{...policy,price:()=>{throw Error('price');}}),/price/);
  assert.equal(actor.cooldowns.size,0);assert.equal(bank.bank,2);
});
test('failed bank commit preserves deletion and does not replace the old credit',()=>{
  const {actor,bank}=setup(0,2);Object.defineProperty(bank,'bank',{get:()=>2,set(){throw Error('bank');}});
  assert.throws(()=>refund(actor,skill,bank,1,policy),/bank/);assert.equal(actor.cooldowns.size,0);assert.equal(bank.bank,2);
});
test('nested ready refunds compose through live credit',()=>{
  const {actor,bank}=setup(null);const del=actor.cooldowns.delete.bind(actor.cooldowns);let nested=false;
  actor.cooldowns.delete=id=>{const result=del(id);if(!nested){nested=true;refund(actor,skill,bank,1,policy);}return result;};
  refund(actor,skill,bank,2,policy);assert.equal(bank.bank,3);
});
test('refund keeps the original remaining value but writes through a replaced store and id',()=>{
  const {actor,bank}=setup(),s={def:{id:'command'}};
  actor.cooldowns.get=()=>{actor.cooldowns=new Map();s.def.id='new';return 4;};
  refund(actor,s,bank,1,policy);assert.deepEqual([...actor.cooldowns],[['new',3]]);
});
test('finite signed diagnostic refunds keep original arithmetic',()=>{
  const a=setup();refund(a.actor,skill,a.bank,-2,policy);assert.equal(a.actor.cooldowns.get('command'),6);
  const b=setup(null,3);refund(b.actor,skill,b.bank,-2,policy);assert.equal(b.bank.bank,1);
});
test('commands consume only whole units and preserve fractional credit',()=>{
  const {actor,bank}=setup(null,17);assert.equal(consume(actor,skill,bank,false,policy),2);assert.equal(bank.bank,1);
});
test('extra-use cap does not discard surplus credit',()=>{
  const {actor,bank}=setup(null,40);assert.equal(consume(actor,skill,bank,false,policy),4);assert.equal(bank.bank,8);
});
test('recall reads price but skips policy, credit and writes',()=>{
  let reads=0;const bank={get bank(){throw Error('bank');}};
  assert.equal(consume({},skill,bank,true,{price:()=>{reads++;return 8;},enabled:()=>{throw Error('enabled');},maxExtra:()=>{throw Error('limit');}}),0);assert.equal(reads,1);
});
test('disabled ordinary command retains nonnegative credit',()=>{
  const {actor,bank}=setup(null,17);assert.equal(consume(actor,skill,bank,false,{...policy,enabled:()=>false}),0);assert.equal(bank.bank,17);
});
test('zero-price commands retain the 0.1 second unit floor',()=>{
  const {actor,bank}=setup(null,0.35);assert.equal(consume(actor,skill,bank,false,{...policy,price:()=>0}),3);assert(Math.abs(bank.bank-0.05)<1e-12);
});
test('command rereads credit for its commit',()=>{
  let reads=0,stored;const bank={get bank(){return ++reads===1?17:25;},set bank(n){stored=n;}};
  assert.equal(consume({},skill,bank,false,policy),2);assert.equal(stored,9);
});
test('failed command commit propagates without a result',()=>{
  const bank={get bank(){return 17;},set bank(_n){throw Error('commit');}};
  assert.throws(()=>consume({},skill,bank,false,policy),/commit/);
});
test('projection shows fractional next-use credit and caps a full bank',()=>{
  assert.deepEqual(view(setup(null,4).bank),{hits:1,progress:0.5});
  assert.deepEqual(view(setup(null,40).bank),{hits:5,progress:1});
});
test('disabled projection clears without reading price or credit',()=>{
  const bank={owner:{},host:skill,get bank(){throw Error('credit');}};
  assert.equal(view(bank,{enabled:()=>false,price:()=>{throw Error('price');},maxExtra:()=>{throw Error('limit');}}),undefined);
});
test('projection floor matches command floor',()=>{
  assert.deepEqual(view(setup(null,0.25).bank,{...policy,price:()=>0}),{hits:3,progress:0.5});
});
test('partial projection reads credit again but full projection does not',()=>{
  let reads=0;const bank={owner:{},host:skill,get bank(){return ++reads===1?4:8;}};
  assert.deepEqual(view(bank),{hits:1,progress:0});assert.equal(reads,2);
  reads=0;const full={owner:{},host:skill,get bank(){reads++;return 40;}};assert.deepEqual(view(full),{hits:5,progress:1});assert.equal(reads,1);
});
test('publication target is resolved before progress reads and after price',()=>{
  const first={},second={},third={};let reads=0,target;const bank={owner:first,host:skill,get bank(){if(++reads===2)this.owner=third;return 4;}};
  publish(bank,{...policy,price:()=>{bank.owner=second;return 8;}},{clear:()=>{},publish:actor=>{target=actor;}});assert.equal(target,second);assert.equal(bank.owner,third);
});
test('publication failure preserves earlier gameplay commits',()=>{
  const {actor,bank}=setup(null);refund(actor,skill,bank,2,policy);
  assert.throws(()=>publish(bank,policy,{clear:()=>{},publish:()=>{throw Error('paint');}}),/paint/);assert.equal(bank.bank,2);
});
test('shared policy retains no cross-actor state',()=>{
  const a=setup(null),b=setup(null);refund(a.actor,skill,a.bank,17,policy);assert.equal(consume(a.actor,skill,a.bank,false,policy),2);assert.equal(b.bank.bank,0);
  refund(b.actor,skill,b.bank,2,policy);assert.equal(a.bank.bank,1);assert.equal(b.bank.bank,2);
});
