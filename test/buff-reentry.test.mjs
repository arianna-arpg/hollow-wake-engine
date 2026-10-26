import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const moduleUrl = process.env.HOLLOW_WAKE_BUFF_MODULE ?? new URL('../dist/buffs.js', import.meta.url).href;
const {BuffRuntime, BUFF_LIMITS} = await import(moduleUrl);
const definition = duration => ({type: 'buff', id: 'test', duration, mods: []});
const makeOwner = () => ({buffs: new Map(), gainEvents: []});

test('nested expiry rejects every active ancestor and permits an owner after its call returns', () => {
  const owners = Array.from({length: 3}, makeOwner), removed = [];
  const runtime = new BuffRuntime({publish() {}, release() {}, removeSource(owner) {
    removed.push(owners.indexOf(owner));
    for (let i = 0; i <= owners.indexOf(owner); i++) {
      assert.throws(() => runtime.advance(owners[i], 0), /already active/);
    }
    const next = owners[owners.indexOf(owner) + 1];
    if (next) runtime.advance(next, 1);
    assert.throws(() => runtime.advance(owner, 0), /already active/);
    if (owner === owners[0]) {
      runtime.grant(owners[1], definition(4));
      assert.doesNotThrow(() => runtime.advance(owners[1], 1), 'The unwound owner must be allowed while the outer call is active');
      assert.equal(owners[1].buffs.get('test').remaining, 3);
    }
  }});
  for (const owner of owners) runtime.grant(owner, definition(1));
  runtime.advance(owners[0], 1);
  assert.deepEqual(removed, [0, 1, 2]);
  for (const owner of owners) assert.doesNotThrow(() => runtime.advance(owner, 0));
});

for (const caught of [false, true]) test('nested expiry restores guards after a callback failure: caught=' + caught, () => {
  const outer = makeOwner(), inner = makeOwner(); let active = true;
  const runtime = new BuffRuntime({publish() {}, release() {}, removeSource(owner) {
    if (!active) return;
    if (owner === inner) throw Error('nested sink failure');
    if (!caught) runtime.advance(inner, 1);
    else {
      assert.throws(() => runtime.advance(inner, 1), /nested sink failure/);
      assert.throws(() => runtime.advance(outer, 0), /already active/);
      assert.doesNotThrow(() => runtime.advance(inner, 0));
    }
  }});
  for (const owner of [outer, inner]) runtime.grant(owner, definition(1));
  if (caught) assert.doesNotThrow(() => runtime.advance(outer, 1));
  else assert.throws(() => runtime.advance(outer, 1), /nested sink failure/);
  active = false;
  for (const owner of [outer, inner]) {
    assert.equal(owner.buffs.size, 0);
    runtime.grant(owner, definition(1)); runtime.advance(owner, 1);
    assert.equal(owner.buffs.size, 0);
  }
});

test('different-owner expiry callbacks respect the exact nesting bound and recover', () => {
  const owners = Array.from({length: BUFF_LIMITS.nesting + 1}, makeOwner); let follow = true, removed = 0;
  const runtime = new BuffRuntime({publish() {}, release() {}, removeSource(owner) {
    removed++;
    if (follow) runtime.advance(owners[owners.indexOf(owner) + 1], 1);
  }});
  for (const owner of owners) runtime.grant(owner, definition(1));
  assert.throws(() => runtime.advance(owners[0], 1), /nesting limit/);
  assert.equal(removed, BUFF_LIMITS.nesting);
  assert(owners.slice(0, -1).every(owner => owner.buffs.size === 0));
  assert.equal(owners.at(-1).buffs.get('test').remaining, 1);
  follow = false;
  for (const owner of owners) {
    runtime.grant(owner, definition(1)); runtime.advance(owner, 1);
    assert.equal(owner.buffs.size, 0);
  }
});

test('a live runtime releases owner references after ordinary, nested and failed expiry', () => {
  const program = `
    import assert from 'node:assert/strict';
    const {BuffRuntime} = await import(process.argv[1]);
    const definition = duration => ({type:'buff', id:'test', duration, mods:[]});
    const runtime = new BuffRuntime({publish(){}, release(){}, removeSource(owner){
      if (owner.fail) throw Error('sink');
      if (owner.next) {
        if (owner.catchFailure) assert.throws(() => runtime.advance(owner.next, 1), /sink/);
        else runtime.advance(owner.next, 1);
      }
    }});
    function exercise() {
      const owners = Array.from({length:12}, () => ({buffs:new Map(), gainEvents:[]}));
      for (const owner of owners) runtime.grant(owner, definition(1));
      runtime.advance(owners[0], .25);
      runtime.advance(owners[1], 1);
      owners[2].next=owners[3]; owners[3].next=owners[4]; runtime.advance(owners[2],1);
      owners[5].next=owners[6]; owners[6].fail=true;
      assert.throws(() => runtime.advance(owners[5],1), /sink/);
      owners[7].next=owners[8]; owners[7].catchFailure=true; owners[8].fail=true;
      runtime.advance(owners[7],1);
      owners[9].next=owners[10]; owners[10].next=owners[11]; owners[11].fail=true;
      assert.throws(() => runtime.advance(owners[9],1), /sink/);
      return owners.map(owner => new WeakRef(owner));
    }
    const witnesses = exercise();
    await new Promise(resolve => setImmediate(resolve)); global.gc(); global.gc();
    assert(witnesses.every(ref => ref.deref() === undefined), 'Runtime retained an owner');
    const fresh = {buffs:new Map(), gainEvents:[]};
    runtime.grant(fresh, definition(1)); runtime.advance(fresh,1); assert.equal(fresh.buffs.size,0);
  `;
  const run = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', program, moduleUrl], {encoding: 'utf8', timeout: 15_000});
  assert.ifError(run.error); assert.equal(run.status, 0, run.stdout + run.stderr);
});
