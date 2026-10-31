import assert from 'node:assert/strict';

/** Independent consequences in addition to byte-for-byte original replay. */
export function assertProcDeliveryObservations(data) {
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.courses, 328);
  assert.equal(data.rows.length, 328);
  const rows = new Map(data.rows.map(r => [r.name, r]));
  assert.equal(rows.size, 328);
  const step = (name, i = 0) => {
    const s = rows.get(name)?.steps[i];
    assert(s, 'Missing course/step: ' + name + '/' + i);
    return s;
  };
  const calls = (s, kind, phase = 'before') => s.events.filter(e => e.kind === kind && e.phase === phase);
  const actor = (s, id, phase = 'after') => {
    const a = s[phase].actors.find(a => a.id === id);
    assert(a, 'Missing actor ' + id);
    return a;
  };
  const hits = s => calls(s, 'resolveHit').map(e => e.args[2].$actor);
  const spawns = s => calls(s, 'spawnProjectile').map(e => e.args);
  const close = (a, b, label) => assert(Number.isFinite(a) && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)), label + ': ' + a + ' != ' + b);
  const undef = {$undefined: true};
  let throws = 0;
  for (const r of data.rows) {
    assert(r.steps.length > 0, r.name);
    for (const s of r.steps) {
      assert.equal(s.error, s.expectedError, r.name + '/' + s.name);
      if (s.expectedError) { assert(s.expectedError.startsWith('intentional:')); throws++; }
      assert(s.draws.every(n => Number.isFinite(n) && n >= 0 && n < 1), r.name);
      assert.equal(new Set(s.after.actorOrder).size, s.after.actorOrder.length, r.name);
      if (s.name === 'execute' && !s.error) {
        const entry = calls(s, 'executeProc')[0], tail = calls(s, 'fireProcRiders').at(-1);
        assert(tail, r.name + ' rider tail');
        assert.equal(tail.args[0].id, entry.args[0].id, r.name);
        assert.equal(tail.args[4], entry.args[4], r.name + ' original rider depth');
        assert.equal(s.events.at(-1).kind, 'executeProc');
        assert.equal(s.events.at(-2).kind, 'fireProcRiders');
      }
    }
  }
  assert.equal(throws, 28);
  assert.equal(data.authored.procs.length, 147);
  assert.equal(new Set(data.authored.procs.map(p => p.id)).size, 147);
  const types = new Set(data.authored.procs.map(p => p.effect.type));
  assert.equal(types.size, 21);
  for (const p of data.authored.procs) assert.equal(calls(step('authored-' + p.id), 'executeProc')[0].args[0].id, p.id);
  assert.equal(data.authored.riders.length, 1);
  types.add('birth');
  for (const type of types) for (const missing of ['instance', 'target']) {
    const s = step(type + '-missing-' + missing);
    assert(calls(s, 'fireProcRiders').length > 0, type + '/' + missing);
    if (['extraHit', 'collisionDamage', 'explosion', 'arc'].includes(type)) assert.equal(calls(s, 'resolveHit').length, 0, type + '/' + missing);
    if (missing === 'target' && type === 'summon') assert.equal(calls(s, 'createMonster').length, 0);
    if (missing === 'target' && type === 'displace') assert.equal(calls(s, 'pushActor').length, 0);
  }
  assert.equal(calls(step('power-skill-context'), 'actor-1-healBy')[0].args[0], 20);
  assert.equal(actor(step('power-skill-context'), 1).life, 520);
  const capped = step('gainCharge-capped');
  assert.deepEqual(actor(capped, 1).charges, actor(capped, 1, 'before').charges);
  assert.deepEqual(actor(capped, 1).procCuePulses, []);
  assert.equal(calls(capped, 'actor-1-gainCharge').length, 1);
  for (const type of ['gainCharge', 'buff', 'heal', 'ward']) {
    for (const cue of ['disabled', 'silent']) assert.deepEqual(actor(step(type + '-cue-' + cue), 1).procCuePulses, [], type + '/' + cue);
    const custom = actor(step(type + '-cue-custom'), 1).procCuePulses;
    assert(custom.length > 0, type + ' custom cue');
    assert(custom.every(p => p.color === '#123456'), type + ' custom color');
  }
  const stored = calls(step('buff-stored-cue-disabled'), 'actor-1-addBuff')[0].args[0];
  assert.equal(stored.storedCue, false);
  assert.deepEqual(actor(step('buff-stored-cue-disabled'), 1).procCuePulses, []);
  const duration = calls(step('buff-scaled-duration'), 'actor-1-addBuff')[0].args;
  assert.equal(duration[1], 2); assert.equal(duration[2], 3);
  assert.equal(actor(step('buff-scaled-duration'), 1).buffs.$map[0][1].remaining, duration[0].duration * 2);

  for (const gate of ['dead', 'untargetable', 'outside', 'other-story', 'invulnerable', 'absorbed']) assert.equal(actor(step('burst-' + gate), 2).life, 500, gate);
  assert(actor(step('burst-edge'), 2).life < 500);
  const invulnerable = step('burst-invulnerable');
  assert.equal(actor(invulnerable, 2).es, 0, 'mitigation still spends shield before invulnerability');
  assert.equal(actor(invulnerable, 2).ward, 0);
  assert(!calls(invulnerable, 'sweepDefenseEvents').some(e => e.args[0].$actor === 2));
  const shield = step('burst-shield-break');
  assert.equal(actor(shield, 2).es, 0); assert.equal(actor(shield, 2).esBroke, false);
  const broken = calls(shield, 'rollOwnProcs').find(e => e.args[0].$actor === 2 && e.args[1] === 'esBreak');
  assert(broken); assert.deepEqual(broken.args[2], {depth: 3});
  assert.equal(broken.state.actors.find(a => a.id === 2).esBroke, false, 'clear flag before observer');
  assert(shield.events.indexOf(broken) < shield.events.indexOf(calls(shield, 'sweepDefenseEvents')[0]));
  const lethal = step('burst-lethal');
  assert(actor(lethal, 2).dead); assert(actor(lethal, 2).life < 0);
  assert.deepEqual(calls(lethal, 'kill')[0].args, [{$actor: 2}]);
  assert(lethal.events.indexOf(calls(lethal, 'sweepDefenseEvents')[0]) < lethal.events.indexOf(calls(lethal, 'kill')[0]));
  assert.equal(actor(step('burst-live-roster-after-surface'), 3).life, 500);
  assert.equal(actor(step('burst-live-position'), 3).life, 500);
  const captured = step('burst-captured-level');
  assert.equal(actor(captured, 1).level, 30);
  assert.equal(actor(captured, 2).life, actor(captured, 3).life, 'one captured burst amount');
  assert(actor(captured, 2).life > 400, 'level mutation does not amplify current burst');
  assert.deepEqual(hits(step('explosion-target-story')), [2, 3], 'splash enumerates target story even when hit resolver declines it');
  for (const [name, ids] of [['tie', [4, 3]], ['reverse-tie', [3, 4]], ['no-repeat', [4, 3]], ['fractional-hops', [4, 3, 5]], ['zero-range', [3]], ['negative-hops', []], ['dead-next', [4]], ['live-origin', [4]]]) {
    const s = step('arc-' + name); assert.deepEqual(hits(s), ids, name);
    for (const e of calls(s, 'resolveHit')) assert.equal(e.args[4], 3, name + ' depth');
    assert.equal(s.after.flashes.length - s.before.flashes.length, ids.length * 3, name + ' arc beads');
  }
  for (const force of [-80, 0, 80]) {
    const args = calls(step('displace-force-' + force), 'pushActor')[0].args;
    assert.deepEqual(args[0], {$actor: 2}); assert.equal(args[2], Math.abs(force));
    close(args[1], force > 0 ? 0 : Math.PI, 'push bearing');
  }
  assert.equal(calls(step('summon-cap-at'), 'createMonster').length, 0);
  for (const cap of ['below', 'dead', 'other-owner', 'other-key', 'resolved-owner']) {
    const s = step('summon-cap-' + cap);
    assert.equal(calls(s, 'createMonster').length, 1, cap);
    assert(s.after.actorOrder.includes(100), cap + ' published actor');
    assert.equal(actor(s, 100).sourceSkillId, '__proc:forge_weapon');
    assert.equal(calls(s, 'conjurationLifeline').length, 1);
  }
  const owner = step('summon-cap-resolved-owner');
  assert.deepEqual(actor(owner, 100).owner, {$actor: 4}); assert.equal(actor(owner, 100).level, 9);
  assert.equal(actor(owner, 100).lifespan, 8);
  assert.deepEqual(calls(owner, 'conjurationLifeline')[0].args, [{$actor: 4}]);
  const crew = step('summon-forwarded-support');
  assert.equal(calls(crew, 'forwardSummonSockets')[0].args[0].sockets[0].def.id, 'crushing_impact');
  assert.equal(actor(crew, 100).skills.length, 2);
  for (const skill of actor(crew, 100).skills) {
    const gems = skill.sockets.filter(Boolean); assert.equal(gems.length, 1);
    assert.equal(gems[0].forwarded, true); assert.equal(gems[0].level, 3);
    assert.equal(gems[0].def.$ref, '$/actors/0/skills/0/sockets/0/def', 'original definition identity');
  }
  for (const at of ['target', 'self']) for (const relation of ['ordinary', 'owner', 'target-owner', 'missing']) {
    const args = calls(step('birth-' + at + '-' + relation), 'birthAt')[0].args;
    const hasOwner = relation === 'owner' || relation === 'target-owner';
    assert.deepEqual(args[0], {$actor: hasOwner ? 4 : 1}); assert.equal(args[1], null);
    const ownerSite = at === 'self' || relation === 'missing';
    assert.deepEqual(args[3], {x: ownerSite ? hasOwner ? 710 : 700 : relation === 'target-owner' ? 710 : 730, y: 700});
    assert.deepEqual(args[4], {host: relation !== 'missing' && (at === 'target' || relation === 'target-owner'), capKey: '__proc:__delivery_birth'});
  }
  assert.deepEqual(calls(step('remove-buff-duplicates'), 'actor-1-removeBuff').map(e => e.args[0]), ['__first', '__first', '__second']);
  assert.deepEqual(actor(step('cleanse-live-membership'), 1).statuses.map(s => s.id), ['chill']);
  assert(!actor(step('cleanse-unknown-definition'), 1).statuses.some(s => s.id === '__absent'));
  assert.equal(actor(step('nested-proc'), 1).ward, 13);
  assert.deepEqual(calls(step('nested-proc'), 'fireProcRiders').map(e => e.args[4]), [4, 2]);
  assert.equal(calls(step('live-rider-proc-record'), 'fireProcRiders')[0].args[0].color, '#fedcba');
  assert.equal(calls(step('earned-rider'), 'castProcPayload').length, 1);
  assert.equal(spawns(step('earned-rider'))[0][1].skill, 'spark_bolt');
  assert.equal(spawns(step('earned-rider'))[0][4].depth, 1);

  assert.equal(step('cast-unknown-skill').value, false); assert.equal(step('cast-unknown-skill').draws.length, 0);
  for (const spread of ['ring', 0, 60]) for (const n of [0, 1, 3]) {
    const s = step('cast-spread-' + spread + '-' + n), shots = spawns(s);
    assert.equal(s.value, n > 0); assert.equal(shots.length, n);
    assert.equal(s.draws.length, n > 0 ? 2 : 1, 'count then phase, even for a zero-width fan');
    for (let i = 0; i < shots.length; i++) {
      const angle = spread === 'ring' ? s.draws[1] * 2 * Math.PI + i / n * 2 * Math.PI : n === 1 ? 0 : (i / (n - 1) - .5) * spread * Math.PI / 180;
      close(shots[i][3], angle, 'spread'); assert.deepEqual(shots[i][4], {depth: 3, mult: .5});
    }
  }
  for (const site of ['target', 'self', 'aim', 'feet', 'caster-target']) {
    const s = step('cast-projectile-' + site), shots = spawns(s);
    assert.equal(shots.length, 2); assert.equal(s.value, true); assert.equal(s.draws.length, 2);
    assert.deepEqual(shots.map(a => a[1].$origin), ['payload-1', 'payload-2']);
    for (const a of shots) { assert.equal(a[1].procChainDepth, 3); assert.deepEqual(a[2], {x: site === 'target' ? 730 : 700, y: 700}); }
    if (site === 'aim') close(shots[0][3], Math.atan2(40, 100), 'aimed bearing');
    if (site === 'feet') assert.equal(shots[0][3], .4);
    if (site === 'self') assert.equal(shots[0][3], 0, 'self launch retains target bearing');
    for (const projectile of s.after.projectiles) {
      if (site === 'target' || site === 'caster-target') assert.deepEqual(projectile.hits.$map, [[site === 'target' ? 2 : 1, {$number: 'Infinity'}]]);
      else assert.deepEqual(projectile.hits.$map, []);
    }
    const centered = calls(step('cast-centered-' + site), 'executeSkill'); assert.equal(centered.length, 2);
    const origin = {x: site === 'target' ? 730 : site === 'aim' ? 800 : 700, y: site === 'aim' ? 740 : 700};
    for (const e of centered) {
      assert.deepEqual(e.args[2], origin);
      assert.deepEqual(e.args[3], {targetInfo: {pos: origin}, dmgMult: 1, noCooldown: true, noRepeat: true, noFollowUp: true, keepFacing: true});
    }
  }
  assert.equal(spawns(step('cast-fallback-level'))[0][1].level, 4);
  for (const [lane, origin, level] of [['bar', 'bar-firebolt', 1], ['granted', 'granted', 4], ['learned', 'learned', 7], ['missing', null, 1], ['unseated', null, 1]]) {
    const shots = spawns(step('cast-own-' + lane)); assert.equal(shots.length, 2);
    for (let i = 0; i < shots.length; i++) {
      assert.equal(shots[i][1].$origin, origin ?? 'payload-' + (i + 1));
      assert.equal(shots[i][1].level, level); assert.deepEqual(shots[i][1].procChainDepth, origin ? undef : 3);
      assert.equal(shots[i][4].mult, 0, 'zero multiplier retained');
    }
  }
  const held = spawns(step('cast-live-held-level'));
  assert.deepEqual(held.map(a => a[1].level), [4, 9]);
  assert.deepEqual(held.map(a => a[1].$origin), ['bar-firebolt', 'bar-firebolt']);
  assert.deepEqual(spawns(step('cast-captured-synthetic-level')).map(a => a[1].level), [1, 1]);
  assert.deepEqual(spawns(step('cast-captured-multiplier')).map(a => a[4].mult), [.5, .5]);
  assert.deepEqual(spawns(step('cast-live-target-position')).map(a => a[2].x), [730, 730]);
  assert.deepEqual(spawns(step('cast-shared-spawn-position')).map(a => a[2].x), [730, 740]);
  const flight = step('cast-real-flight', 1);
  assert.equal(actor(flight, 2).life, 500, 'anchored target cannot be hit by outward payload');
  assert(actor(flight, 3).life < 500, 'real projectile reaches the next target');
  assert.deepEqual(hits(flight), [3]);
  for (const e of calls(flight, 'resolveHit')) {
    assert.equal(e.args[4], 0, 'ordinary projectile entry starts at zero');
    assert.equal(e.args[1].procChainDepth, 3, 'synthetic identity carries causal depth into hit preparation');
  }
  for (const e of calls(flight, 'rollOwnProcs')) assert.equal(e.args[2].depth, 3);
  return {courses: data.courses, authoredProcs: 147, effectShapes: types.size, deliberateCallbackErrors: throws};
}
