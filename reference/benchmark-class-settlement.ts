import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CLASSES} from '../src/data/classes';
import {makeAccount} from '../src/meta/account';
import {settleClassUnlocks} from '../src/meta/unlocks';
const rows=[];
for(const name of ['all-owned','starter-only','mixed-pending']){
  const account=makeAccount();
  if(name!=='starter-only')for(const [i,c]of CLASSES.entries()){
    if(name==='all-owned'||(i%2===0)){account.unlockedClasses.add(c.id);if(name==='mixed-pending'&&i%4===0)account.pendingClassUnlocks.add(c.id);}
  }
  const state=()=>JSON.stringify([[...account.unlockedClasses],[...account.pendingClassUnlocks],account.invested,account.ledger]);
  const before=state();let outcomes=0;
  for(let i=0;i<10000;i++)outcomes+=settleClassUnlocks(account).length;
  const calls=65000,start=process.hrtime.bigint();
  for(let i=0;i<calls;i++)outcomes+=settleClassUnlocks(account).length;
  const elapsed=Number(process.hrtime.bigint()-start);
  assert.equal(outcomes,0);assert.equal(state(),before);rows.push({name,calls,nanoseconds:elapsed,state:before});
}
fs.writeFileSync(process.argv[2],JSON.stringify(rows)+'\n',{flag:'wx'});
