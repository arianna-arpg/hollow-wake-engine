
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileUnlockPredicate} from '../scripts/compile-unlock-predicates.mjs';
test('source compiler lowers reviewed predicates to data and retains grouping',()=>{
 assert.deepEqual(compileUnlockPredicate('ctx => (ctx.ledger.x ?? 0) >= 2 || ctx.account.level > 3'),{
  kind:'any',terms:[{kind:'counter',source:'ledger',key:'x',fallback:0,comparison:'>=',threshold:2},{kind:'counter',source:'accountLevel',comparison:'>',threshold:3}]});
 assert.deepEqual(compileUnlockPredicate('() => false'),{kind:'constant',value:false});
 assert.equal(compileUnlockPredicate('ctx => ctx.account.level >= -1 && (ctx.ledger.x ?? 0) > 0').kind,'all');
});
test('source compiler refuses unreviewed syntax without executing it',()=>{
 for(const source of ['ctx => fetch("x")','ctx => { return true; }','ctx => ctx.ledger.x > 1','ctx => (ctx.ledger["x"] ?? 0) >= 1',
  'ctx => ctx.account.level === 1','ctx => (ctx.account.level ?? 0) >= 1','ctx => ctx.account.credits >= 1','() => true; doSomething()',
  '(a,b) => true','ctx => (ctx.ledger.x ?? 0) >= Infinity','ctx => ctx.ledger.x = 1'])assert.throws(()=>compileUnlockPredicate(source),source);
});
