// Unaccepted original observations of borrowed cursor and temporary-instance ownership.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { bootSimEngine, makeSimWorld } from '../src/sim/arena';
import { seedGlobalRandom } from '../src/sim/rng';
import { makeSkillInstance, effectiveSkillLevel, type SkillInstance } from '../src/engine/skills';
import { SKILLS } from '../src/data/skills';
import { SUPPORTS } from '../src/data/supports';
bootSimEngine();
const restore = seedGlobalRandom(312001);
try {
  const world = makeSimWorld('warrior', 312001), aw: any = world, actor = world.player;
  const identities = new WeakMap<object, number>(); let next = 1;
  const id = (value: any) => {
    if (!value || typeof value !== 'object') return null;
    if (!identities.has(value)) identities.set(value, next++);
    return identities.get(value);
  };
  const wire = (value: any) => JSON.parse(JSON.stringify(value));
  const instance = (i: SkillInstance) => ({ ref: id(i), skill: i.def.id, def: id(i.def), level: i.level,
    effectiveLevel: effectiveSkillLevel(i), hostSkillId: i.hostSkillId, chainOf: i.chainOf,
    sockets: id(i.sockets), grafts: id(i.grafts), extraMods: i.extraMods, treeMods: i.comboTreeMods,
    stateRef: id(i.state), state: i.state, relocationHost: id(aw.relocationHosts.get(i)) });
  const host = makeSkillInstance(SKILLS.ruin, 1, 3), sameHost = makeSkillInstance(SKILLS.ruin, 1, 3);
  const otherHost = makeSkillInstance(SKILLS.life_flask, 1, 3);
  const chain = makeSkillInstance(SKILLS.trisect, 1, 3), sameChain = makeSkillInstance(SKILLS.trisect, 1, 3);
  const repeated = makeSkillInstance(SKILLS.one_two, 1, 3);
  const hosts = [host, sameHost, otherHost, chain, sameChain, repeated];
  const state = () => wire({ hosts: hosts.map(instance), minted: [...actor.metaInsts].map(([key, i]) => ({ key, ...instance(i) })) });
  const rows: any[] = [];
  function observe(name: string, call: () => unknown) {
    const before = state(), result: any = call();
    rows.push(wire({ name, before, returned: result && typeof result === 'object' ? { ref: id(result), ...(result.def ? { skill: result.def.id } : { cursor: result }) } : result ?? null, after: state() }));
    return result;
  }
  const first = observe('mint-first-art', () => aw.mintMetaInstance(actor, host, 'firebolt'));
  assert.equal(observe('mint-reuses-instance', () => aw.mintMetaInstance(actor, host, 'firebolt')), first);
  assert.equal(observe('mint-reuses-same-id-and-level-host', () => aw.mintMetaInstance(actor, sameHost, 'firebolt')), first);
  host.level = 2;
  const leveled = observe('mint-replaces-on-level-change', () => aw.mintMetaInstance(actor, host, 'firebolt'));
  assert.notEqual(leveled, first); assert.equal(leveled.level, 2);
  sameHost.level = 2;
  assert.equal(observe('mint-same-effective-level-reuses', () => aw.mintMetaInstance(actor, sameHost, 'firebolt')), leveled);
  observe('another-host-id-owns-another-art', () => aw.mintMetaInstance(actor, otherHost, 'firebolt'));
  sameHost.level = 3; sameHost.def = { ...sameHost.def, effects: [{ type: 'commandMinions' } as any] };
  const command = observe('command-meta-omits-host-scope', () => aw.mintMetaInstance(actor, sameHost, 'firebolt'));
  assert.equal(command.hostSkillId, undefined);
  const relocated = observe('relocation-first', () => aw.mintMetaInstance(actor, host, 'relocate_workshop'));
  assert.equal(observe('relocation-same-host-reuses', () => aw.mintMetaInstance(actor, host, 'relocate_workshop')), relocated);
  sameHost.level = host.level;
  const replacement = observe('relocation-equivalent-host-remints', () => aw.mintMetaInstance(actor, sameHost, 'relocate_workshop'));
  assert.notEqual(replacement, relocated); assert.equal(aw.relocationHosts.get(replacement), sameHost);
  const again = observe('relocation-original-host-remints-again', () => aw.mintMetaInstance(actor, host, 'relocate_workshop'));
  assert.notEqual(again, replacement); assert.equal(aw.relocationHosts.get(again), host);
  observe('combo-base-beat-is-null', () => world.comboStepOf(actor, chain, 0));
  observe('combo-negative-beat-is-null', () => world.comboStepOf(actor, chain, -1));
  observe('combo-past-end-is-null', () => world.comboStepOf(actor, chain, 3));
  assert.equal(observe('combo-repeated-beat-is-null', () => world.comboStepOf(actor, repeated, 1)), null);
  observe('combo-no-chain-is-null', () => world.comboStepOf(actor, host, 1));
  chain.bonusLevels = 1.9;
  const step = observe('combo-floors-bonus-levels', () => world.comboStepOf(actor, chain, 1));
  assert.equal(step.level, 2); assert.equal(step.hostSkillId, chain.def.id); assert.equal(step.chainOf, chain.def.id);
  assert.equal(step.sockets, chain.sockets); assert.equal(step.grafts, chain.grafts);
  assert.equal(observe('combo-reuses-same-step', () => world.comboStepOf(actor, chain, 1)), step);
  chain.sockets = [{ def: SUPPORTS.swift_hands, level: 1 }];
  chain.grafts = [{ def: SUPPORTS.swift_hands, level: 2 }];
  assert.equal(observe('combo-updates-borrowed-sockets-and-grafts', () => world.comboStepOf(actor, chain, 1)), step);
  assert.equal(step.sockets, chain.sockets); assert.equal(step.grafts, chain.grafts);
  chain.bonusLevels = 2.1;
  assert.notEqual(observe('combo-remints-new-base-level', () => world.comboStepOf(actor, chain, 1)), step);
  observe('combo-next-step-has-own-cache-key', () => world.comboStepOf(actor, chain, 2));
  assert.equal(observe('ordinary-cursor-is-instance-state', () => world.comboCursorOf(actor, chain)), chain.state);
  const ghost = world.createMonster('zombie', 1, 'player'); (ghost as any).construct = {}; ghost.skills = [];
  const borrowed = observe('construct-borrowed-cursor-is-private', () => world.comboCursorOf(ghost, chain));
  assert.notEqual(borrowed, chain.state); borrowed.comboIdx = 1; borrowed.comboAt = world.time;
  assert.equal(observe('construct-cursor-reuses-host-id', () => world.comboCursorOf(ghost, sameChain)), borrowed);
  const otherGhost = world.createMonster('zombie', 1, 'player'); (otherGhost as any).construct = {}; otherGhost.skills = [];
  assert.notEqual(observe('second-construct-owns-cursor', () => world.comboCursorOf(otherGhost, chain)), borrowed);
  const anotherWorld = makeSimWorld('warrior', 312002);
  assert.notEqual(observe('second-world-owns-cursor', () => anotherWorld.comboCursorOf(ghost, chain)), borrowed);
  ghost.skills = [chain];
  assert.equal(observe('construct-own-bar-uses-instance-state', () => world.comboCursorOf(ghost, chain)), chain.state);
  ghost.skills = [];
  assert.equal(observe('construct-borrowed-cursor-survives-own-bar', () => world.comboCursorOf(ghost, chain)), borrowed);
  const nonConstruct = world.createMonster('zombie', 1, 'player'); nonConstruct.skills = [];
  assert.equal(observe('nonconstruct-borrower-uses-instance-state', () => world.comboCursorOf(nonConstruct, chain)), chain.state);
  const result = { status: 'Investigation only; not an accepted baseline.',
    scope: 'Direct original temporary-instance and combo-cursor methods. Real actors/definitions, explicit host identity and level edits. No casts, rendering or device claim.', rows };
  fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ transitions: rows.length }));
} finally { restore(); }
