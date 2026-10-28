import assert from 'node:assert/strict';
import {Engine, CastRuntime, TimedDamage, Target, Inventory} from '../../dist/index.js';
import {ItemRules, ItemContent} from '../../dist/item-rules.js';
import {PassivePolicy} from '../../dist/passive-policy.js';

const copy = value => JSON.parse(JSON.stringify(value));

export function scenario(api, input, effect) {
  const root = api.create(input), requests = [], responses = [];
  const call = request => {
    const owned = copy({version: 1, ...request});
    requests.push(copy(owned));
    const response = copy(api.dispatch(root, owned));
    responses.push(response);
    if (owned.op === 'restore' && response.ok) {
      const points = owned.snapshot.character.passivePoints;
      owned.snapshot.character.passivePoints = 999;
      assert.equal(api.dispatch(root,{version:1,op:'snapshot',handle:response.handle}).snapshot.character.passivePoints,points);
    }
    return response;
  };
  const config = {
    seed: 42, itemSeed: 126,
    character: {classId: 'magician', passivePoints: 1, allocated: ['cross_int_pursuit'], equipped: {ring1: 'lapis-reference'}},
    skill: {id: 'ruin', level: 5, sockets: 2, treePoints: 1,
      supports: [{id: 'corrosion', level: 2}, {id: 'measured_blows', level: 1}], nodes: ['ruin_studies']},
    resources: {mana: 1000, life: 1000}, target: {life: 100000, mods: [{stat: 'chaosRes', kind: 'flat', value: 0.25}]},
    passive: {classId: 'magician', allocated: [], choices: {}, grafts: {}, vocations: [],
      passivePoints: 10, vocationPoints: 0, realmPoints: {}}, effect
  };
  const policy = new PassivePolicy(input.passives);
  config.passive.allocated.push(policy.start('magician'));
  const candidate = input.passives.adjacency[policy.start('magician')][0];
  const group = policy.group(policy.node(candidate));
  const allocate = {op: 'allocate', node: candidate, ...(group ? {option: group.options[0].id} : {})};
  const a = call({op: 'create', config}), b = call({op: 'create', config});
  assert.deepEqual(a, {ok: true, handle: 1}); assert.deepEqual(b, {ok: true, handle: 2});
  const initial = call({op: 'snapshot', handle: 1}).snapshot;
  assert.deepEqual(initial, call({op: 'snapshot', handle: 2}).snapshot);

  const commands = [
    {op: 'press'}, {op: 'applyDot', dps: 6}, {op: 'advance', dt: 0.1},
    {op: 'hit'}, {op: 'roll', ilvl: 21}, allocate,
    {op: 'forgeStore', id: 'ring', options: {baseId: 'ring_lapis', ilvl: 21, rarity: 'rare', quality: 1, affixes: [{id: 'attr_intelligence'}]}},
    {op: 'move', id: 'ring', x: 2, y: 2}
  ];
  const batch = call({op: 'batch', handle: 1, commands});
  assert.equal(batch.ok, true);
  assert.deepEqual(call({op: 'snapshot', handle: 2}).snapshot, initial, 'Independent session changed');
  const singles = commands.map(command => call({op: 'batch', handle: 2, commands: [command]}));
  assert.deepEqual(batch.results, singles.flatMap(result => {assert(result.ok); return result.results;}));
  const checkpoint = call({op: 'snapshot', handle: 1}).snapshot;
  assert.deepEqual(checkpoint, call({op: 'snapshot', handle: 2}).snapshot, 'Batching changed state');
  assert(checkpoint.casting.active && checkpoint.effect.active, 'Checkpoint must contain in-flight clocks');
  assert.equal(batch.results[5].accepted, true);
  assert.equal(batch.results[6].inserted, true);

  // Independent direct SDK orchestration checks the substantive first batch.
  const engine = new Engine(input.core, 42), hero = engine.character({classId:'magician',passivePoints:1}), skill = engine.skill(config.skill);
  hero.equip('lapis-reference','ring1'); hero.allocate('cross_int_pursuit');
  const target = engine.target(config.target), casting = new CastRuntime(config.resources), dot = new TimedDamage(effect);
  const rules = new ItemRules(new ItemContent(input.items), 126), passive = policy.create(config.passive), inventory = new Inventory({w:4,h:4});
  const direct = [casting.press(engine.castProfile(hero, skill)), dot.apply(6,1,1,'session-caster')];
  const cast = casting.advance(0.1), raw = dot.advance(0.1), damage = target.receiveDot(raw, effect.damageType);
  direct.push({cast, raw, damage, targetLife: target.life}, engine.resolveHit(hero, skill, target));
  const item = rules.roll({ilvl:21}); direct.push(item ? {item,mods:rules.compile(item)} : null);
  direct.push(passive.allocate(candidate, {ledger:{}}, allocate.option));
  const forged = rules.forge(commands[6].options);
  direct.push({item:forged,inserted:inventory.insert({id:'ring',w:1,h:1,data:forged})}, inventory.move('ring',2,2));
  assert.deepEqual(batch.results, copy(direct));
  assert.deepEqual(checkpoint.random, engine.randomSnapshot());
  assert.deepEqual(checkpoint.target, target.snapshot());
  assert.deepEqual(checkpoint.casting, casting.snapshot());
  assert.deepEqual(checkpoint.effect, dot.snapshot());
  assert.deepEqual(checkpoint.items, rules.snapshot());
  assert.deepEqual(checkpoint.inventory, inventory.snapshot());

  const continuation = [{op:'advance',dt:1},{op:'hit'},{op:'roll',ilvl:37},{op:'refund',node:candidate},
    {op:'applyDot',dps:9},{op:'advance',dt:0.25}];
  const continued = call({op:'batch',handle:1,commands:continuation}); assert(continued.ok);
  const c = call({op:'restore',snapshot:checkpoint}); assert.deepEqual(c,{ok:true,handle:3});
  assert.deepEqual(call({op:'batch',handle:3,commands:continuation}),continued);
  assert.deepEqual(call({op:'snapshot',handle:3}).snapshot,call({op:'snapshot',handle:1}).snapshot);

  const beforeInvalid = call({op:'snapshot',handle:1}).snapshot;
  assert.equal(call({op:'batch',handle:1,commands:[{op:'hit'},{op:'unsupported'}]}).error,'invalid-request');
  assert.equal(call({op:'batch',handle:1,commands:Array(65).fill({op:'hit'})}).error,'invalid-request');
  assert.equal(call({op:'batch',handle:1,commands:[{op:'advance',dt:-1}]}).error,'invalid-request');
  assert.deepEqual(call({op:'snapshot',handle:1}).snapshot,beforeInvalid);
  const malformed = copy(checkpoint); malformed.casting.active.total = -1;
  assert.equal(call({op:'restore',snapshot:malformed}).error,'invalid-request');
  const wrongContent = copy(checkpoint); wrongContent.content[0] = 'different-content';
  assert.equal(call({op:'restore',snapshot:wrongContent}).error,'invalid-request');
  assert.deepEqual(call({op:'snapshot',handle:2}).snapshot,checkpoint);
  const restoredAgain = call({op:'restore',snapshot:checkpoint}); assert.equal(restoredAgain.handle,4);
  // Once admitted, caller changes to a snapshot cannot alter owned restored state.
  const detached = copy(checkpoint), isolated = api.dispatch(root,{version:1,op:'snapshot',handle:4});
  isolated.snapshot.character.passivePoints = 999;
  assert.deepEqual(api.dispatch(root,{version:1,op:'snapshot',handle:4}).snapshot,detached);

  const dimensional = call({op:'create',config}); assert.equal(dimensional.handle,5);
  const largeBase = Object.values(input.items.bases).find(base => base.w>1 && base.h>1 && base.w<=4 && base.h<=4);
  assert(largeBase);
  const large = call({op:'batch',handle:5,commands:[{op:'forgeStore',id:'large',options:{baseId:largeBase.id,ilvl:21,rarity:'common',quality:0,affixes:[]}}]});
  assert(large.ok && large.results[0].inserted);
  const geometry = call({op:'snapshot',handle:5}).snapshot;
  assert.equal(geometry.inventory.items[0].w,largeBase.w);
  assert.equal(geometry.inventory.items[0].h,largeBase.h);
  call({op:'batch',handle:5,commands:[{op:'move',id:'large',x:3,y:3}]});
  assert.deepEqual(call({op:'snapshot',handle:5}).snapshot,geometry,'Out-of-bounds move changed inventory');

  const partial = call({op:'batch',handle:2,commands:[{op:'hit'},{op:'equip',item:'missing-item',slot:'ring1'},{op:'roll',ilvl:21}]});
  assert.equal(partial.error,'execution-failed'); assert.equal(partial.completed,1);
  const independent = new Engine(input.core); independent.restoreRandom(checkpoint.random);
  assert.deepEqual(partial.results[0], independent.resolveHit(independent.character(checkpoint.character), independent.skill(checkpoint.skill), Target.restore(independent.content,checkpoint.target)));
  assert.equal(call({op:'snapshot',handle:2}).error,'poisoned-session');
  assert.equal(call({op:'batch',handle:2,commands:[]}).error,'poisoned-session');
  assert.equal(call({op:'destroy',handle:2}).ok,true);
  assert.equal(call({op:'batch',handle:2,commands:[]}).error,'stale-handle');
  assert.equal(call({op:'destroy',handle:2}).error,'stale-handle');

  const live = [1,3,4,5];
  while(live.length<8){const created=call({op:'create',config});assert(created.ok&&created.handle>4);live.push(created.handle);}
  assert.equal(call({op:'create',config}).error,'capacity');
  assert.equal(call({op:'destroy',handle:1}).ok,true);
  assert.equal(call({op:'snapshot',handle:1}).error,'stale-handle');
  const replacement=call({op:'create',config});assert.equal(replacement.handle,10);
  assert.equal(call({op:'snapshot',handle:0}).error,'invalid-request');
  assert.equal(call({op:'snapshot',handle:1.5}).error,'invalid-request');
  assert.equal(call({op:'snapshot',handle:10,extra:true}).error,'invalid-request');
  for(const handle of [...live.filter(handle=>handle!==1),replacement.handle])assert(call({op:'destroy',handle}).ok);
  return {requests,responses,checks:{batchEqualsSerial:true,isolatedSessions:true,inFlightRestore:true,
    directSdkBatchMatches:true,protocolRejectionAtomic:true,staleHandlesRejected:true,
    partialFailurePoisons:true,capacityBounded:true,detachedSnapshots:true,authoredFootprints:true}};
}
