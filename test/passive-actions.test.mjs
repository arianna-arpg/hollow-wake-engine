import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {PassiveActions} from '../dist/passive-actions.js';
import {runOriginalPassiveActions,verifyPassiveActionOrdering} from './passive-actions/contracts.mjs';

test('passive actions preserve all 9,699 frozen original commands and effect ordering',()=>{
  const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-eight/passives.json.gz',import.meta.url))));
  assert.equal(runOriginalPassiveActions(PassiveActions,fixture),9699);
});
test('passive effects preserve refusal priority, no-op silence, captured summons, skill snapshots and exception recovery',()=>{
  assert.equal(verifyPassiveActionOrdering(PassiveActions),7);
});
