import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {inspectCombatOwner} from '../scripts/combat-owner-closure.mjs';

test('owner inventory follows bindings, catches missing services and ignores shadowed wedge variables',()=>{
 const parent=fs.realpathSync('.artifacts'),work=fs.mkdtempSync(path.join(parent,'closure-test-owned-'));
 try{
  fs.mkdirSync(path.join(work,'adapters/embedded'),{recursive:true});
  fs.writeFileSync(path.join(work,'adapters/embedded/combat-fixture.mjs'),`
    function install(w){const owner=w;owner.cast();const $combatOwner=owner;$combatOwner.missing();
      for(const w of [])w.body.sheet.get('speed');[].find(w=>w.members.includes(1));
      class Frames{stopWedge(w){w.members.includes(1);}update(){this.w.clock();}}
    }
  `);
  const owner={cast(){},clock(){}};
  assert.deepEqual(inspectCombatOwner(work,owner).map(r=>r.call),['missing']);
  owner.missing=()=>{};assert.deepEqual(inspectCombatOwner(work,owner),[]);
  delete owner.cast;assert.deepEqual(inspectCombatOwner(work,owner).map(r=>r.call),['cast']);
 }finally{assert.equal(path.dirname(fs.realpathSync(work)),parent);fs.rmSync(work,{recursive:true,maxRetries:3});}
});
