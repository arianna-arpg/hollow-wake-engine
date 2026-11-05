import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {root} from '../scripts/reference-utils.mjs';
import path from 'node:path';
import {readVocationFixture} from '../scripts/vocation-reference.mjs';
import {assertMemoryRepairs,assertUnlockRepairs} from '../scripts/assert-unlock-repairs.mjs';
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
const original=read('baseline/unlock-lifecycle/acceptance.json').fixtures;
const supplements=read('baseline/unlock-lifecycle/supplement-acceptance.json').fixtures;
const repaired=read('baseline/unlock-lifecycle/repairs/acceptance.json').fixtures;
const fixture=(name,definitions)=>JSON.parse(readVocationFixture(name,definitions));
test('accepted memory differences are restricted to independently asserted receipt and membership repairs',()=>{
 assert.deepEqual(assertMemoryRepairs(fixture('memory',original),fixture('memory',repaired)),{changedDraws:21,changedDrops:27});
});
test('accepted purchase differences preserve inputs and obey refusal, conservation and completion rules',()=>{
 assert.deepEqual(assertUnlockRepairs(fixture('transactions',original),fixture('transactions',repaired),fixture('repairEdges',supplements),fixture('edges',repaired)),
  {namedChanges:174,refusals:215,aliasReads:90,literalSteps:231,completionCorrections:4,supplementCases:12});
});
