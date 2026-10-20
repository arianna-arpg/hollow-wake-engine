import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {ItemContent} from '../dist/item-rules.js';
import {createItemHost} from '../dist/item-host.js';
import {Random} from '../dist/random.js';
import {itemPack} from '../scripts/compile-item-content.mjs';
const json = value => JSON.parse(JSON.stringify(value));
const content = new ItemContent(itemPack());

test('host-owned RNG and identity reproduce the uninterrupted original item stream', () => {
  const stream=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-four/item-stream.json.gz',import.meta.url))));
  const random=new Random(stream.seed); let nextUid=stream.initialUid;
  const host=createItemHost(content,()=>nextUid++);
  for(const row of stream.rows) {
    assert.deepEqual(json(host[row.kind](row.options,()=>random.next())),row.expected);
    assert.equal(random.draws,row.draws); assert.equal(nextUid,row.nextUid);
  }
});

test('host content refresh changes values without replacing identity or random ownership', () => {
  const pack=itemPack(), random=new Random(700); let nextUid=100;
  const allocate=()=>nextUid++, rng=()=>random.next();
  const before=createItemHost(new ItemContent(pack),allocate);
  const first=before.forge({baseId:'ring_lapis',ilvl:21,quality:1},rng);
  const original=before.compile(first), state=random.snapshot();
  pack.bases.ring_lapis.implicits[0].range=pack.bases.ring_lapis.implicits[0].range.map(x=>x*2);
  pack.id='refreshed-test-content';
  const after=createItemHost(new ItemContent(pack),allocate);
  assert.deepEqual(before.compile(first),original);
  assert.notDeepEqual(after.compile(first),original);
  assert.deepEqual(random.snapshot(),state);
  assert.equal(after.forge({baseId:'ring_lapis',ilvl:21,quality:1},rng).uid,101);
  assert.equal(nextUid,102);
});

test('invalid commands do not call host ports and invalid ports fail explicitly', () => {
  let calls=0; const host=createItemHost(content,()=>{calls++;return 1;});
  const rng=()=>{calls++;return .5;};
  assert.throws(()=>host.roll({ilvl:NaN},rng)); assert.equal(calls,0);
  assert.throws(()=>host.roll({ilvl:1},()=>1),/random value/);
  assert.throws(()=>createItemHost(content,()=>NaN).forge({baseId:'ring_lapis',ilvl:1},rng),/Host item uid/);
  assert.throws(()=>host.roll({ilvl:1},()=>{host.roll({ilvl:1},rng);return .5;}),/Reentrant/);
  assert.ok(host.forge({baseId:'ring_lapis',ilvl:1},rng));
});
