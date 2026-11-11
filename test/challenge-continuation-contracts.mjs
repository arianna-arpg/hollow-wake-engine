import assert from 'node:assert/strict';

export function challengeContinuationContracts({Challenges, copyChallengeState}, register = (_name, fn) => fn()) {
  let count = 0;
  const test = (name, fn) => {register(name, fn); count++;};
  const forbidden = new Proxy({}, {get(_target, key) {assert.fail('Copy invoked host port ' + String(key));}});
  const make = () => new Challenges(forbidden);
  function fixture() {
    const skill = id => ({def: {id}, sockets: [], treeNodes: [], level: 1, state: {}});
    const host = skill('goad'), primary = {...skill('goad'), challengeHost: host};
    const variant = {...primary}, secondary = {...primary}, retired = {...primary};
    const actor = id => ({id, skills: [], statuses: [], cooldowns: new Map(), cooldownTotals: new Map(), pos: {x: id, y: 0}, sheet: {}});
    const owner = actor(1), body = actor(2), pursuer = actor(3);
    owner.skills = [host, null]; body.owner = owner; pursuer.owner = owner;
    const spec = {resetChance: 0.2, guaranteedResetEvery: 10, bleedingField: {power: 0.4}};
    const state = {owner, host, spec, policy: 'captured-policy', primed: false, guaranteedAt: 12, retired: false};
    const oldState = {...state, primed: true, guaranteedAt: -Infinity, retired: true};
    const cast = {state, inst: primary, primed: true, generation: 0, orbitTargets: new Set([8, 9])};
    const childCast = {...cast, inst: secondary, generation: 2, orbitTargets: new Set()};
    const oldCast = {...cast, state: oldState, inst: retired, orbitTargets: new Set([7])};
    const at = {x: 20, y: 30}, delivery = {range: 50, placeRange: 100, extra: {value: 1}};
    const effigy = {body, cast, creeper: pursuer, center: at, radius: 50, average: 15, trailAt: 4.2, strikeAt: 6};
    const source = make(); source.used = true;
    source.states.set('1:goad', state);
    source.casts.set(primary, cast); source.casts.set(variant, cast);
    source.casts.set(secondary, childCast); source.casts.set(retired, oldCast);
    source.landings.push({cast, from: owner.pos, at, d: delivery, remaining: 0.1, duration: 0.2, power: 2});
    source.landings.push({...source.landings[0], power: 3});
    source.effigies.push(effigy);
    source.shocks.push({effigy, at, due: 7, greater: true, echoes: true});
    source.shocks.push({effigy, at: owner.pos, due: Infinity, greater: false, echoes: false});
    // The fixture's host graph is plain data; production hosts supply their own
    // actor/body copy services. Clone it once so every alias is explicit.
    const graph = {actors: [owner, body, pursuer], skills: [host, primary, variant, secondary, retired],
      spec, points: [owner.pos, at], delivery};
    const detached = structuredClone(graph);
    const actors = new Map(graph.actors.map((value, i) => [value, detached.actors[i]]));
    const skills = new Map(graph.skills.map((value, i) => [value, detached.skills[i]]));
    const points = new Map(graph.points.map((value, i) => [value, detached.points[i]]));
    const mapping = {actors, skills, point: value => {assert(points.has(value)); return points.get(value);},
      spec: value => {assert.equal(value, spec); return detached.spec;},
      delivery: value => {assert.equal(value, delivery); return detached.delivery;}};
    return {source, destination: make(), mapping, owner, body, pursuer, host, primary, variant,
      secondary, retired, state, oldState, cast, childCast, oldCast, effigy, spec, at, delivery};
  }
  const copied = f => {
    assert.equal(copyChallengeState(f.source, f.destination, f.mapping), f.destination);
    return f.destination;
  };
  test('state and captured cast identities detach while retaining aliases', () => {
    const f = fixture(), d = copied(f), cast = d.casts.get(f.mapping.skills.get(f.primary));
    assert.notEqual(cast, f.cast); assert.equal(cast, d.casts.get(f.mapping.skills.get(f.variant)));
    assert.equal(cast.inst, f.mapping.skills.get(f.primary)); assert.equal(d.states.get('1:goad'), cast.state);
    assert.notEqual(cast.state, f.state); assert.equal(cast.state.owner, f.mapping.actors.get(f.owner));
    assert.equal(cast.state.host, f.mapping.skills.get(f.host)); assert.equal(cast.state.policy, 'captured-policy');
    assert.equal(cast.primed, true); assert.equal(cast.state.primed, false); assert.equal(cast.state.retired, false);
  });
  test('absolute finite and infinite deadlines survive without rebasing', () => {
    const f = fixture(), d = copied(f);
    assert.equal(d.states.get('1:goad').guaranteedAt, 12);
    const retired = d.casts.get(f.mapping.skills.get(f.retired)); assert(retired, 'Retired cast was lost');
    assert.equal(retired.state.guaranteedAt, -Infinity); assert.equal(d.shocks.length, 2);
    assert.equal(d.shocks[0].due, 7); assert.equal(d.shocks[1].due, Infinity);
    assert.equal(d.effigies[0].trailAt, 4.2); assert.equal(d.effigies[0].strikeAt, 6);
  });
  test('externally retained retired casts stay separate from current investment', () => {
    const f = fixture(), d = copied(f), retired = f.mapping.skills.get(f.retired), cast = d.casts.get(retired);
    assert(cast.state.retired); assert.notEqual(cast.state, f.oldState); assert.notEqual(cast.state, d.states.get('1:goad'));
    assert.equal(d.prepare(f.mapping.actors.get(f.owner), retired, true), retired);
    assert.equal(d.states.size, 1); assert.deepEqual([...cast.orbitTargets], [7]);
  });
  test('secondary casts retain their generation and independent target ledger', () => {
    const f = fixture(), d = copied(f), primary = d.casts.get(f.mapping.skills.get(f.primary)), child = d.casts.get(f.mapping.skills.get(f.secondary));
    assert.equal(child.state, primary.state); assert.equal(child.generation, 2); assert.equal(child.primed, true);
    assert.deepEqual([...primary.orbitTargets], [8, 9]); assert.equal(child.orbitTargets.size, 0);
    primary.orbitTargets.add(30); assert(!f.cast.orbitTargets.has(30)); assert(!child.orbitTargets.has(30));
  });
  test('landings share copied delivery and captured cast with the active device', () => {
    const f = fixture(), d = copied(f), a = d.landings[0], b = d.landings[1], e = d.effigies[0];
    assert.notEqual(a, f.source.landings[0]); assert.equal(a.cast, e.cast); assert.equal(b.cast, a.cast);
    assert.equal(a.d, b.d); assert.notEqual(a.d, f.delivery); assert.equal(a.from, f.mapping.actors.get(f.owner).pos);
    assert.equal(a.at, e.center); assert.equal(b.at, a.at); assert.notEqual(a.at, f.at);
    assert.equal(a.remaining, 0.1); assert.equal(a.duration, 0.2); assert.equal(a.power, 2); assert.equal(b.power, 3);
    a.d.extra.value = 99; assert.equal(f.delivery.extra.value, 1);
  });
  test('pursuer body and every shock preserve the common device identity', () => {
    const f = fixture(), d = copied(f), e = d.effigies[0];
    assert.equal(e.body, f.mapping.actors.get(f.body)); assert.equal(e.creeper, f.mapping.actors.get(f.pursuer));
    assert.equal(e.radius, 50); assert.equal(e.average, 15); assert(d.shocks.every(s => s.effigy === e));
    assert.equal(d.shocks[0].at, e.center); assert.equal(d.shocks[0].greater, true); assert.equal(d.shocks[0].echoes, true);
    assert.equal(d.shocks[1].greater, false); assert.equal(d.shocks[1].echoes, false);
  });
  test('copied policy and points cannot mutate source state', () => {
    const f = fixture(), d = copied(f), state = d.states.get('1:goad');
    assert.notEqual(state.spec, f.spec); state.spec.bleedingField.power = 99; assert.equal(f.spec.bleedingField.power, 0.4);
    d.effigies[0].center.x = 99; assert.equal(f.at.x, 20);
  });
  test('interrupted retirement can retain a retired state in the active map', () => {
    const f = fixture(); f.state.retired = true; const d = copied(f), state = d.states.get('1:goad');
    assert(state.retired); assert.equal(d.casts.get(f.mapping.skills.get(f.primary)).state, state);
  });
  test('absent pursuer property stays absent', () => {
    const f = fixture(); delete f.effigy.creeper; assert(!Object.hasOwn(copied(f).effigies[0], 'creeper'));
  });
  test('explicit undefined pursuer property keeps its own slot', () => {
    const f = fixture(); f.effigy.creeper = undefined; const e = copied(f).effigies[0];
    assert(Object.hasOwn(e, 'creeper')); assert.equal(e.creeper, undefined);
  });
  const refuses = (edit, pattern) => {
    const f = fixture(); edit(f);
    const before = Object.fromEntries(['states', 'casts', 'landings', 'effigies', 'shocks', 'used'].map(k => [k, f.destination[k]]));
    assert.throws(() => copyChallengeState(f.source, f.destination, f.mapping), pattern);
    for (const [key, value] of Object.entries(before)) assert.equal(f.destination[key], value, key);
    assert.equal(f.cast.orbitTargets.size, 2); assert.equal(f.state.guaranteedAt, 12);
  };
  test('missing captured primary refuses before destination replacement', () => refuses(f => f.mapping.skills.delete(f.primary), /Missing challenge skill/));
  test('missing owner refuses before destination replacement', () => refuses(f => f.mapping.actors.delete(f.owner), /Missing challenge actor/));
  test('missing pursuer refuses before destination replacement', () => refuses(f => f.mapping.actors.delete(f.pursuer), /Missing challenge actor/));
  test('shared live skill identity refuses', () => refuses(f => f.mapping.skills.set(f.primary, f.primary), /detached skill/));
  test('collapsed skill identities refuse', () => refuses(f => f.mapping.skills.set(f.variant, f.mapping.skills.get(f.primary)), /detached skill/));
  test('shared actor identity refuses', () => refuses(f => f.mapping.actors.set(f.owner, f.owner), /detached actor/));
  test('wrong stable actor identity refuses', () => refuses(f => f.mapping.actors.get(f.owner).id = 90, /actor identity/));
  test('wrong skill definition refuses', () => refuses(f => f.mapping.skills.get(f.primary).def.id = 'wrong', /definition identity/));
  test('lost host provenance refuses', () => refuses(f => f.mapping.skills.get(f.primary).challengeHost = f.host, /payload provenance/));
  test('lost action bar identity refuses', () => refuses(f => f.mapping.actors.get(f.owner).skills[0] = f.mapping.skills.get(f.primary), /bar identity/));
  test('borrowed mutable actor collections refuse', () => refuses(f => f.mapping.actors.get(f.owner).cooldowns = f.owner.cooldowns, /mutable actor state/));
  test('borrowed policy refuses', () => refuses(f => f.mapping.spec = s => s, /detached policy/));
  test('borrowed point refuses', () => refuses(f => f.mapping.point = p => p, /detached point/));
  test('changed point coordinates refuse', () => refuses(f => f.mapping.point = p => ({...p, x: 100}), /point coordinates/));
  test('borrowed delivery refuses', () => refuses(f => f.mapping.delivery = d => d, /detached delivery/));
  test('late delivery callback failure leaves destination unchanged', () => refuses(f => f.mapping.delivery = () => {throw Error('diagnostic copy failure');}, /diagnostic copy failure/));
  test('self-copy refuses', () => {const f = fixture(); assert.throws(() => copyChallengeState(f.source, f.source, f.mapping), /fresh private controller/);});
  test('used empty destination refuses', () => refuses(f => {f.destination.used = true;}, /fresh private controller/));
  test('public preparation consumes destination admission even after clearAll', () => {
    const host = {def: {id: 'goad'}, level: 1, sockets: [], treeNodes: []};
    const owner = {id: 1, removeBuff() {}};
    const destination = new Challenges({spec: () => ({}), projectiles: [], pendingRepeats: [], pendingFuses: [], zones: []});
    const retained = destination.prepare(owner, host, false); destination.clearAll();
    assert.equal(destination.states.size, 0); assert.equal(destination.prepare(owner, retained, true), retained);
    assert.throws(() => copyChallengeState(make(), destination, {actors: new Map(), skills: new Map(),
      spec: structuredClone, point: structuredClone, delivery: structuredClone}), /fresh private controller/);
  });
  test('a completed import cannot be reused', () => {const f = fixture(); copied(f); assert.throws(() => copyChallengeState(f.source, f.destination, f.mapping), /fresh private controller/);});
  test('empty import consumes admission without invoking callbacks or host ports', () => {
    const source = make(), destination = make(), bad = () => assert.fail('Unexpected empty copy callback');
    const mapping = {actors: new Map(), skills: new Map(), spec: bad, point: bad, delivery: bad};
    copyChallengeState(source, destination, mapping); assert(destination.used);
    assert.throws(() => copyChallengeState(source, destination, mapping), /fresh private controller/);
  });
  return count;
}
