import assert from 'node:assert/strict';
import {create, dispatch} from '../session.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
export function workload(plan, input, verifiedRequests) {
  assert.equal(plan.id, 'embedded-host-costs/v1');
  const config = copy(verifiedRequests[0].config);
  config.resources = {mana: 1e9, life: 1e9};
  config.target.life = 1e12;
  const originalBatch = verifiedRequests.find(value => value.op === 'batch');
  const allocation = copy(originalBatch.commands.find(value => value.op === 'allocate'));
  const ring = copy(originalBatch.commands.find(value => value.op === 'forgeStore'));
  ring.id = 'benchmark-ring';
  const motifs = {
    combat: [{op: 'press'}, {op: 'applyDot', dps: 6}, {op: 'advance', dt: 0.25}, {op: 'hit'}],
    inventory: [{op: 'roll', ilvl: 21}, allocation, {op: 'refund', node: allocation.node},
      {op: 'move', id: ring.id, x: 0, y: 0}, {op: 'move', id: ring.id, x: 1, y: 1}]
  };
  const root = create(input);
  const call = request => {const result = dispatch(root, {version: 1, ...request}); assert.equal(result.ok, true); return copy(result);};
  const cases = [];
  for (const description of plan.workloads) {
    const motif = motifs[description.name]; assert(motif);
    assert.deepEqual(motif.map(command => command.op), description.motif);
    assert.equal(description.commands % motif.length, 0);
    const commands = Array.from({length: description.commands}, (_, index) => copy(motif[index % motif.length]));
    const setup = description.name === 'inventory' ? [ring] : [];
    let expectedFlat, expectedSnapshot;
    for (const batchSize of plan.batchSizes) {
      assert.equal(commands.length % batchSize, 0);
      const handle = call({op: 'create', config}).handle;
      if (setup.length) assert.equal(call({op: 'batch', handle, commands: setup}).results[0].inserted, true);
      const responses = [];
      for (let start = 0; start < commands.length; start += batchSize)
        responses.push(call({op: 'batch', handle, commands: commands.slice(start, start + batchSize)}));
      const flat = responses.flatMap(response => response.results), snapshot = call({op: 'snapshot', handle});
      assert(snapshot.snapshot.target.life > 0 && snapshot.snapshot.casting.resources.mana > 0, 'Workload must not degenerate into depleted targets/resources');
      if (description.name === 'inventory') for (let index = 0; index < flat.length; index += motif.length) {
        assert(flat[index]?.item, 'Real loot generation required');
        assert.equal(flat[index + 1].accepted, true); assert.equal(flat[index + 2].refusal, null);
        assert(flat[index + 2].points > 0);
        assert.equal(flat[index + 3], 'moved'); assert.equal(flat[index + 4], 'moved');
      }
      if (expectedFlat) {assert.deepEqual(flat, expectedFlat); assert.deepEqual(snapshot, expectedSnapshot);}
      else {expectedFlat = flat; expectedSnapshot = snapshot;}
      cases.push({name: description.name, batchSize, commands, setup,
        responseTexts: responses.map(value => JSON.stringify(value)), snapshotText: JSON.stringify(snapshot)});
      call({op: 'destroy', handle});
    }
  }
  const handle = call({op: 'create', config}).handle;
  const active = [{op: 'press'}, {op: 'applyDot', dps: 6}, {op: 'advance', dt: 0.1}];
  call({op: 'batch', handle, commands: active});
  const checkpoint = call({op: 'snapshot', handle});
  assert(checkpoint.snapshot.casting.active && checkpoint.snapshot.effect.active);
  const restored = call({op: 'restore', snapshot: checkpoint.snapshot}).handle;
  assert.deepEqual(call({op: 'snapshot', handle: restored}), checkpoint);
  call({op: 'destroy', handle: restored}); call({op: 'destroy', handle});
  return {schemaVersion: 1, plan, config, cases, checkpoint, active};
}
