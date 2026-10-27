import test from 'node:test';import assert from 'node:assert/strict';
import {compileProcHealingEffect} from '../dist/life-recovery-content.js';
import {readLifeRecoveryExpectations} from '../scripts/check-life-recovery-contract.mjs';

test('all five loaded proc-heal definitions compile to detached immutable content',()=>{
  const rows=readLifeRecoveryExpectations().fixtures.get('heal-procs').value.rows;
  const defs=new Map(rows.map(row=>[row.input.proc.id,row.input.proc.effect]));assert.equal(defs.size,5);
  for(const input of defs.values()){
    const compiled=compileProcHealingEffect(input);assert.deepEqual(compiled,input);
    assert.notEqual(compiled,input);assert(Object.isFrozen(compiled));
  }
});
test('strict proc schema rejects skill fields, malformed numbers and foreign objects',()=>{
  for(const input of [null,[],new Date(),{},{type:'restore'},
    {type:'heal',amount:3},{type:'heal',chain:2},{type:'heal',excludeCaster:true},
    {type:'heal',flat:NaN},{type:'heal',pctMax:Infinity},{type:'heal',flat:'1'},
    {type:'heal',[Symbol('extra')]:1},Object.create({type:'heal'})])assert.throws(()=>compileProcHealingEffect(input));
});
test('compiler does not invoke getters and refuses hidden data',()=>{
  let calls=0;assert.throws(()=>compileProcHealingEffect({type:'heal',get flat(){calls++;return 1;}}));assert.equal(calls,0);
  assert.throws(()=>compileProcHealingEffect(Object.defineProperty({type:'heal'},'flat',{value:1})));
});
test('owned data omits undefined options, preserves finite signed values and detaches',()=>{
  assert.deepEqual(compileProcHealingEffect({type:'heal',flat:undefined,pctMax:undefined}),{type:'heal'});
  const input=Object.assign(Object.create(null),{type:'heal',flat:-3,pctMax:-0}),value=compileProcHealingEffect(input);
  input.flat=100;assert.equal(value.flat,-3);assert(Object.is(value.pctMax,-0));
  assert.throws(()=>{value.flat=4;});
});
