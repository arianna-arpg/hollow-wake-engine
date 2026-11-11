import assert from 'node:assert/strict';

const clean = value => JSON.parse(JSON.stringify(value));
export function challengeContracts({Challenges, ChallengeContent}) {
  const passed = [];
  const check = (name, run) => {run(); passed.push(name);};
  function rig(spec = {}, options = {}) {
    let serial = 0;
    const events = [], reads = {random: 0, bands: 0, constructs: 0};
    const make = (def, level = 1) => ({def, level, sockets: [], treeNodes: []});
    const definition = (id, tree = {build: spec}) => ({id, name: id, tags: ['attack'],
      tree, delivery: {type: 'projectile'}, effects: [{type: 'damage'}], cooldown: 8, useTime: 0});
    const body = (team = 'friend', pos = {x: 0, y: 0}) => {
      const buffs = new Map(), sources = new Map();
      return {id: ++serial, dead: false, team, tier: 0, pos: {...pos}, radius: 10,
        color: 'grey', shape: 'circle', passive: false, untargetable: false,
        invulnerable: false, noBounty: false, skills: [], statuses: [],
        cooldowns: new Map(), cooldownTotals: new Map(), buffs, sources,
        sheet: {get: id => id === 'aoeRadius' ? 1 : 0, setSource: (id, mods) => sources.set(id, mods)},
        removeBuff(id) {events.push(['removeBuff', id]); buffs.delete(id);},
        addBuff(effect) {events.push(['addBuff', effect.id]); buffs.set(effect.id, effect);},
        applyStatus(id, dps, duration, sourceName, data) {
          this.statuses.push({id, dps, remaining: duration, total: duration, stacks: 1, sourceName, ...data});
        }};
    };
    const content = new ChallengeContent({patch: (def, id) => def.tree?.[id]});
    const owner = body(), host = make(definition('challenge'));
    host.treeNodes = ['build']; owner.skills.push(host);
    const ports = {
      time: 0, actors: [owner], projectiles: [], pendingRepeats: [], pendingFuses: [], zones: [], flashes: [],
      spec: inst => content.spec(inst), random: () => {reads.random++; return options.random ?? 0.99;},
      tags: inst => new Set(inst.def.tags), modifiers: inst => inst.extraMods ?? [],
      modifier: (stat, kind, value) => ({stat, kind, value}),
      damageBands: () => {reads.bands++; return {total: {lo: 10, hi: 20}};},
      createSkill: make, deviceCall: definition('goad_device_call', undefined),
      allocate(name, team, pos) {const result = body(team, pos); result.name = name; return result;},
      text: (...args) => events.push(['text', ...args]),
      enemiesOf: actor => ports.actors.filter(a => !a.dead && a.team !== actor.team),
      clampPos: pos => ({...pos}),
      spawnProjectile(caster, inst, from, angle, opts) {
        const p = {caster, inst, pos: {...from}, anchor: {...from}, angle, opts, hits: new Map()};
        ports.projectiles.push(p); events.push(['projectile', p]);
      },
      spawnConstruct(caster, source, delivery, at, call) {
        reads.constructs++;
        if (options.refuseConstruct) return undefined;
        const result = body(caster.team, at);
        result.owner = caster; result.sourceSkillId = source.def.id;
        result.construct = {range: delivery.range, timer: 5}; result.skills = [call];
        ports.actors.push(result); events.push(['construct', result]); return result;
      },
      executeSkill: (...args) => events.push(['execute', ...args]),
      challengeBurst: (...args) => events.push(['burst', ...args]),
      challengeHit: (...args) => events.push(['hit', ...args]),
      retireOwnedZone(zone) {events.push(['retireZone', zone]); ports.zones.splice(ports.zones.indexOf(zone), 1);},
    };
    const controller = new Challenges(ports);
    const enemy = (pos = {x: 5, y: 0}) => {const a = body('enemy', pos); ports.actors.push(a); return a;};
    const prepare = (real = false) => controller.prepare(owner, host, real);
    const delivery = {range: 50, placeRange: 100};
    const plant = () => {const cast = prepare(); controller.toss(owner, cast, {x: 0, y: 0}, delivery, 2); controller.update(0.2); return ports.actors.find(a => a.construct);};
    return {owner, host, ports, controller, content, enemy, prepare, plant, body, make, definition, events, reads, delivery};
  }
  const device = {duration: 6, radius: 50, life: 20, thornsRatio: 0.5, interval: 1.5, range: 100};

  check('content gates, sorted precedence, duplicate reads and untouched investment', () => {
    const calls = [], nested = {power: 0.4};
    const content = new ChallengeContent({patch: (def, id) => {calls.push(id); return def.tree[id];}});
    const inst = {def: {tree: {a: {resetChance: 0.2, bleedingField: nested}, z: {resetChance: 0.8}}}, treeNodes: ['z', 'a', 'z', 'missing']};
    const before = [...inst.treeNodes], value = content.spec(inst);
    assert.equal(value.resetChance, 0.8); assert.equal(value.bleedingField, nested);
    assert.deepEqual(calls, ['a', 'missing', 'z', 'z']); assert.deepEqual(inst.treeNodes, before);
    assert.equal(content.spec({def: {}, treeNodes: ['z']}), undefined);
    assert.equal(content.spec({def: {tree: inst.def.tree}, treeNodes: []}), undefined);
    assert.equal(calls.length, 4);
  });
  check('content returns fresh roots, borrows nested rows and reads current patches', () => {
    const r = rig({device, deviceCap: 0});
    const a = r.content.spec(r.host), b = r.content.spec(r.host);
    assert.notEqual(a, b); assert.equal(a.device, device); a.deviceCap = 100;
    assert.equal(r.content.spec(r.host).deviceCap, 0);
    assert.deepEqual(clean(r.content.delivery(r.host)), {type: 'construct', kind: 'pylon', look: 'construct_totem',
      range: 50, duration: 6, maxActive: 0, life: 20, placeRange: 100, interval: 1.5, taunt: true, castSkillId: 'goad_device_call'});
    delete r.host.def.tree.build.deviceCap; assert.equal(r.content.delivery(r.host).maxActive, 1);
    delete r.host.def.tree.build.device; assert.equal(r.content.delivery(r.host), undefined);
  });
  check('plain skills retain identity without controller work', () => {
    const r = rig(); delete r.host.def.tree;
    assert.equal(r.prepare(), r.host); r.controller.completed(r.owner, r.host); r.controller.update(1);
    assert.equal(r.events.length, 0); assert.equal(r.reads.random, 0);
  });
  check('cast snapshots preserve required aliases and own investment arrays', () => {
    const r = rig(), support = {def: {id: 'support'}, level: 1};
    r.host.sockets = [support]; r.host.grafts = [support]; r.host.extraMods = [];
    const cast = r.prepare(); assert.notEqual(cast, r.host); assert.equal(cast.def, r.host.def);
    assert.equal(cast.challengeHost, r.host); assert.equal(cast.state, r.host.state);
    assert.equal(cast.extraMods, r.host.extraMods); assert.notEqual(cast.sockets, r.host.sockets);
    assert.notEqual(cast.grafts, r.host.grafts); assert.notEqual(cast.treeNodes, r.host.treeNodes);
    assert.equal(cast.sockets[0], support); assert.equal(cast.grafts[0], support);
    assert.equal(r.controller.prepare(r.owner, cast, true), cast);
    r.controller.clear(r.owner, r.host); assert.equal(r.controller.prepare(r.owner, cast, true), cast);
  });
  check('guaranteed reset short circuits RNG and observes absolute time', () => {
    const r = rig({resetChance: 0.1, guaranteedResetEvery: 10});
    const cast = r.prepare(); r.owner.cooldowns.set('challenge', 8); r.owner.cooldownTotals.set('challenge', 8);
    r.controller.completed(r.owner, cast); assert.equal(r.reads.random, 0);
    assert.equal(r.owner.cooldowns.size, 0); assert.equal(r.owner.cooldownTotals.size, 0); assert.equal(r.owner.buffs.size, 1);
    r.owner.cooldowns.set('challenge', 8); r.ports.time = 9; r.controller.completed(r.owner, cast);
    assert.equal(r.reads.random, 1); assert.equal(r.owner.cooldowns.get('challenge'), 8);
    r.ports.time = 10; r.controller.completed(r.owner, cast); assert.equal(r.reads.random, 1); assert.equal(r.owner.cooldowns.size, 0);
  });
  check('preview preserves readiness and paid preparation consumes it once', () => {
    const r = rig({resetChance: 1, bleedPop: 0.5}, {random: 0});
    r.controller.completed(r.owner, r.prepare()); const preview = r.prepare(false);
    assert.equal(r.owner.buffs.size, 1); const paid = r.prepare(true); assert.equal(r.owner.buffs.size, 0);
    const victim = r.enemy(); victim.statuses.push({id: 'bleed', dps: 10, stacks: 2, remaining: 3, total: 3});
    r.controller.beforeEffects(r.owner, preview, victim, 20, 0); assert(!r.events.some(e => e[0] === 'burst'));
    r.controller.beforeEffects(r.owner, paid, victim, 20, 0);
    assert.equal(r.events.find(e => e[0] === 'burst')[3], 30);
    assert.equal(victim.statuses.find(s => s.id === 'hemorrhage').dps, 9);
  });
  check('wound bursts exclude field exposure and clamp negative duration', () => {
    const r = rig({resetChance: 1, bleedPop: 1, bleedingImpaleMore: 0.5}, {random: 0});
    r.controller.completed(r.owner, r.prepare()); const cast = r.prepare(true), victim = r.enemy();
    const field = {id: 'bleed', dps: 500, stacks: 1, remaining: 0.05, total: 0.05, challengeField: 44};
    const impale = {id: 'impaled', dps: 0, stacks: 1, remaining: 1, total: 1, rupture: 12};
    victim.statuses.push(field, impale, {id: 'bleed', dps: 100, stacks: 2, remaining: -1, total: 1});
    r.controller.beforeEffects(r.owner, cast, victim, 10, 0);
    assert(victim.statuses.includes(field)); assert.equal(impale.rupture, 18);
    assert(!r.events.some(e => e[0] === 'burst')); assert.equal(victim.statuses.filter(s => s.id === 'bleed').length, 1);
  });
  check('secondary generations are bounded and share captured host ownership', () => {
    const r = rig({splinters: {count: 3, power: 0.5, spread: 30}}), target = r.enemy(), cast = r.prepare();
    r.controller.afterHit(r.owner, cast, target, 10, 0, 2);
    assert.equal(r.ports.projectiles.length, 3);
    for (const p of [...r.ports.projectiles]) {
      assert.equal(p.inst.challengeHost, r.host); assert.equal(p.opts.mult, 1);
      r.controller.afterHit(r.owner, p.inst, target, 10, 0, 1);
    }
    assert.equal(r.ports.projectiles.length, 3);
  });
  check('ballast deduplicates targets and evicts only the oldest owned orbit', () => {
    const r = rig({ballast: {duration: 4, radius: 20, power: 0.5, rehit: 0.3, cap: 1}}), cast = r.prepare();
    const a = r.enemy(), b = r.enemy({x: 15, y: 0});
    const foreign = {caster: b, inst: cast, orbitAnchorId: a.id, anchor: {}, hits: new Map()}; r.ports.projectiles.push(foreign);
    r.controller.afterHit(r.owner, cast, a, 10, 0, 2); const first = r.ports.projectiles[1];
    assert.equal(first.hits.get(a.id), Infinity);
    r.controller.afterHit(r.owner, cast, a, 10, 0, 2); assert.equal(r.ports.projectiles.length, 2);
    r.controller.afterHit(r.owner, cast, b, 10, 0, 2);
    assert(r.ports.projectiles.includes(foreign)); assert(!r.ports.projectiles.includes(first)); assert.equal(r.ports.projectiles.length, 2);
    const orbit = r.ports.projectiles[1], launches = r.events.filter(e => e[0] === 'projectile').length;
    r.controller.afterHit(r.owner, orbit.inst, a, 10, 0, 2); assert.equal(r.ports.projectiles.length, 2);
    assert.equal(r.events.filter(e => e[0] === 'projectile').length, launches); assert.equal(r.ports.projectiles[1], orbit);
  });
  check('toss delays birth and derives thorns from captured bands and power', () => {
    const r = rig({device}), cast = r.prepare();
    r.controller.toss(r.owner, cast, {x: 0, y: 0}, r.delivery, 2);
    r.controller.update(0.1); assert.equal(r.reads.constructs, 0);
    r.controller.update(0.1); assert.equal(r.reads.constructs, 1); assert.equal(r.reads.bands, 1);
    const body = r.ports.actors.find(a => a.construct);
    assert.equal(body.construct.range, 50); assert.equal(body.construct.timer, 0);
    assert.deepEqual(clean(body.sources.get('goad_thorns')), [{stat: 'thorns', kind: 'flat', value: 15}]);
    r.controller.update(1); assert.equal(r.reads.constructs, 1);
  });
  check('refused construction consumes the landing without damage reads or retries', () => {
    const r = rig({device}, {refuseConstruct: true}); r.plant(); r.controller.update(10);
    assert.equal(r.reads.constructs, 1); assert.equal(r.reads.bands, 0);
  });
  check('unseating before landing cancels birth', () => {
    const r = rig({device}); r.controller.toss(r.owner, r.prepare(), {x: 0, y: 0}, r.delivery, 2);
    r.owner.skills.length = 0; r.controller.update(1); assert.equal(r.reads.constructs, 0);
  });
  check('field exposure is transient and leaving preserves independent wounds', () => {
    const r = rig({device, bleedingField: {power: 0.2}}), victim = r.enemy();
    const independent = {id: 'bleed', dps: 3, stacks: 1, remaining: 10, total: 10}; victim.statuses.push(independent);
    const body = r.plant(), field = victim.statuses.find(s => s.challengeField === body.id);
    assert(field); assert.equal(field.dps, 6); assert.equal(field.remaining, 0.25); assert.equal(field.total, 0.25);
    victim.pos.x = 100; r.controller.update(0.1); assert.deepEqual(victim.statuses, [independent]);
  });
  check('field propagation excludes the original target and accumulates neighboring impales', () => {
    const r = rig({device, impaleField: {radius: 20, ratio: 0.2}}), a = r.enemy(), b = r.enemy({x: 8, y: 0});
    r.plant(); r.controller.afterHit(r.owner, r.host, a, 40, 0, 1); r.controller.afterHit(r.owner, r.host, a, 10, 0, 1);
    assert(!a.statuses.some(s => s.id === 'impaled')); assert.equal(b.statuses.find(s => s.id === 'impaled').rupture, 10);
    r.controller.afterHit(r.owner, r.host, a, 40, 1, 1); assert.equal(b.statuses.find(s => s.id === 'impaled').rupture, 10);
  });
  check('aftershocks retain placement and schedule finite echoes against the host clock', () => {
    const r = rig({device, aftershock: {chance: 1, delay: 0.5, radius: 10, power: 2},
      greaterShock: {chance: 1, radius: 20, power: 3, echoes: 2}}, {random: 0});
    const victim = r.enemy({x: 5, y: 0}), body = r.plant();
    victim.statuses.push({id: 'taunted', casterId: body.id, dps: 0, stacks: 1, remaining: 5, total: 5});
    r.controller.afterHit(body, body.skills[0], victim, 1, 0, 1); assert.equal(r.reads.random, 2);
    victim.pos.x = 20; r.ports.time = 0.49; r.controller.update(0); assert(!r.events.some(e => e[0] === 'execute'));
    r.ports.time = 0.5; r.controller.update(0); let calls = r.events.filter(e => e[0] === 'execute');
    assert.equal(calls.length, 1); assert.deepEqual(clean(calls[0][3]), {x: 5, y: 0}); assert.equal(calls[0][4].dmgMult, 3);
    r.ports.time = 0.75; r.controller.update(0); r.ports.time = 1; r.controller.update(0);
    calls = r.events.filter(e => e[0] === 'execute'); assert.equal(calls.length, 3); assert.equal(calls[2][4].dmgMult, 2);
    r.ports.time = 100; r.controller.update(0); assert.equal(r.events.filter(e => e[0] === 'execute').length, 3);
  });
  check('retirement cancels pending shocks and retires the pursuer body', () => {
    const r = rig({device, aftershock: {chance: 1, delay: 5, radius: 10, power: 2},
      creeper: {speed: 10, trailRadius: 4, trailDuration: 1, trailPower: 0.2, strikePower: 0.5, strikeInterval: 1}}, {random: 0});
    const victim = r.enemy(), body = r.plant(), creeper = r.ports.actors.find(a => a.sourceSkillId?.startsWith('__goad_creeper:'));
    assert(creeper); assert.equal(creeper.owner, r.owner); assert(creeper.untargetable && creeper.invulnerable && creeper.noBounty);
    victim.statuses.push({id: 'taunted', casterId: body.id, dps: 0, stacks: 1, remaining: 5, total: 5});
    r.controller.afterHit(body, body.skills[0], victim, 1, 0, 1); assert.equal(r.reads.random, 1);
    assert(r.events.some(e => e[0] === 'execute')); r.controller.clearAll(); assert(body.dead && creeper.dead);
    const count = r.events.filter(e => e[0] === 'execute').length; r.ports.time = 10; r.controller.update(1);
    assert.equal(r.events.filter(e => e[0] === 'execute').length, count);
  });
  check('retirement filters every carrier collection by both owner and exact host', () => {
    const r = rig(), cast = r.prepare(), other = r.enemy(), different = r.make(r.definition('other'));
    const owned = {caster: r.owner, inst: cast}, foreign = {caster: other, inst: cast}, unrelated = {caster: r.owner, inst: different};
    for (const key of ['projectiles', 'pendingRepeats', 'pendingFuses', 'zones']) r.ports[key] = [foreign, owned, unrelated];
    r.controller.clear(r.owner, {...r.host}); assert.equal(r.ports.projectiles.length, 3);
    r.controller.clear(r.owner, r.host);
    for (const key of ['projectiles', 'pendingRepeats', 'pendingFuses', 'zones']) assert.deepEqual(r.ports[key], [foreign, unrelated]);
    assert.equal(r.events.filter(e => e[0] === 'retireZone').length, 1);
    r.controller.clearAll(); assert.equal(r.events.filter(e => e[0] === 'retireZone').length, 1);
  });
  check('investment change retires former casts without reclassifying retained handles', () => {
    const r = rig({resetChance: 1}, {random: 0}), old = r.prepare();
    r.ports.projectiles.push({caster: r.owner, inst: old}); r.host.level++;
    const next = r.prepare(); assert.notEqual(old, next); assert.equal(r.ports.projectiles.length, 0);
    r.controller.completed(r.owner, old); assert.equal(r.reads.random, 0);
    assert.equal(r.controller.prepare(r.owner, old, false), old);
    r.controller.completed(r.owner, next); assert.equal(r.reads.random, 1);
  });
  check('synchronous callback failure preserves the original preceding writes', () => {
    const r = rig({resetChance: 1}, {random: 0}), cast = r.prepare();
    r.owner.cooldowns.set('challenge', 8); r.ports.text = () => {throw Error('host effect failed');};
    assert.throws(() => r.controller.completed(r.owner, cast), /host effect failed/);
    assert.equal(r.owner.cooldowns.size, 0); assert.equal(r.owner.buffs.size, 1);
    r.prepare(true); assert.equal(r.owner.buffs.size, 0);
  });
  check('equal logical IDs in separate simulations retain independent state and randomness', () => {
    const a = rig({resetChance: 0.5}, {random: 0}), b = rig({resetChance: 0.5}, {random: 1});
    assert.equal(a.owner.id, b.owner.id); a.controller.completed(a.owner, a.prepare()); b.controller.completed(b.owner, b.prepare());
    assert.equal(a.owner.buffs.size, 1); assert.equal(b.owner.buffs.size, 0);
    a.controller.clearAll(); assert.equal(b.reads.random, 1); assert.equal(b.owner.skills[0], b.host);
  });
  return {contracts: passed.length, names: passed};
}
