// Original-only lifetime and scheduling observations. No replacement controller
// or private-copy implementation participates in producing these observations.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine, makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance} from '../src/engine/skills';
import {challengeDelivery} from '../src/engine/challengeSpec';
import {SKILLS} from '../src/data/skills';

bootSimEngine();
const restore = seedGlobalRandom(0x7737), observations: unknown[] = [];
const record = (name: string, value: unknown) => observations.push({name, value});
function setup(nodes: string[]) {
  const world = makeSimWorld('tamer', 0x7737), owner = world.player;
  const host = makeSkillInstance(SKILLS.goad, 20);
  host.treeNodes = nodes; owner.skills = [host];
  const target = new Actor('Challenge target', 'enemy', {x: owner.pos.x + 20, y: owner.pos.y});
  target.tier = owner.tier; target.life = 100000;
  world.actors = [owner, target]; world.walk = null; world.time = 2;
  return {world, owner, host, target, controller: world.challenges, owned: world.challenges as any};
}
try {
  {
    const {world, owner, host, target, controller, owned} = setup([
      'barbed_challenge', 'ready_challenge', 'cheap_challenge', 'swift_challenge',
      'deep_barb', 'patient_barb', 'feeding_barb',
    ]);
    const first = controller.prepare(owner, host, false), firstCast = owned.casts.get(first), state = firstCast.state;
    assert.equal(state.guaranteedAt, -Infinity); assert.equal(first.state, host.state);
    assert.equal(first.challengeHost, host); assert.equal(state.owner, owner); assert.equal(state.host, host);
    record('fresh-cast-has-no-reset-deadline', {deadline: '-Infinity', primed: firstCast.primed,
      hostStateShared: true, capturedHost: true, generation: firstCast.generation});
    controller.completed(owner, first);
    assert.equal(state.guaranteedAt, world.time + state.spec.guaranteedResetEvery);
    const preview = controller.prepare(owner, host, false), paid = controller.prepare(owner, host, true);
    const previewCast = owned.casts.get(preview), paidCast = owned.casts.get(paid);
    assert.equal(previewCast.state, state); assert.equal(paidCast.state, state);
    assert(!previewCast.primed && paidCast.primed && !state.primed);
    record('readiness-is-captured-per-cast-with-one-shared-deadline', {time: world.time,
      deadline: state.guaranteedAt, previewPrimed: false, paidPrimed: true, sharedState: true});
    controller.afterHit(owner, paid, target, 10, 0, 1);
    const carriers = [...world.projectiles], secondary = carriers.map(p => owned.casts.get(p.inst));
    assert(carriers.length > 1); assert(secondary.every(c => c && c.state === state));
    assert(paidCast.orbitTargets.has(target.id));
    assert(secondary.every(c => c.orbitTargets !== paidCast.orbitTargets));
    record('secondary-generations-share-state-and-own-target-ledgers', {
      generations: secondary.map(c => c.generation), primaryTargets: paidCast.orbitTargets.size,
      secondaryTargets: secondary.map(c => c.orbitTargets.size), sharedState: true,
      infiniteOrbitHit: carriers.filter(p => p.orbitAnchorId !== undefined).every(p => p.hits.get(target.id) === Infinity),
    });
    controller.clear(owner, host);
    assert(state.retired); assert.equal(owned.states.size, 0); assert.equal(world.projectiles.length, 0);
    assert.equal(controller.prepare(owner, paid, true), paid); assert.equal(owned.casts.get(paid), paidCast);
    const retained = secondary[0].inst;
    assert.equal(controller.prepare(owner, retained, true), retained);
    record('retired-external-casts-remain-recognized', {activeStates: 0, carriers: 0,
      primaryIdentity: true, secondaryIdentity: true, oldDeadline: state.guaranteedAt, oldTargets: paidCast.orbitTargets.size});
    const next = controller.prepare(owner, host, false), nextState = owned.casts.get(next).state;
    assert.notEqual(nextState, state); assert.equal(nextState.guaranteedAt, -Infinity);
    controller.completed(owner, paid); assert.equal(nextState.primed, false);
    record('same-host-reinvestment-does-not-revive-retired-casts', {
      newState: true, oldRetired: state.retired, newPrimed: nextState.primed, newDeadline: '-Infinity'});
    const remove = owner.removeBuff;
    owner.removeBuff = () => {throw Error('diagnostic retirement failure');};
    try {assert.throws(() => controller.clear(owner, host), /diagnostic retirement failure/);}
    finally {owner.removeBuff = remove;}
    assert(nextState.retired); assert.equal(owned.states.get(`${owner.id}:${host.def.id}`), nextState);
    assert.equal(controller.prepare(owner, next, true), next);
    record('interrupted-retirement-keeps-a-retired-state-in-the-active-map', {
      stateCount: owned.states.size, retired: nextState.retired, recognizedCast: true});
    controller.clearAll(); assert.equal(owned.states.size, 0);
    record('retirement-retry-cleans-state-without-forgetting-casts', {
      stateCount: 0, originalCast: owned.casts.get(paid) === paidCast, retryCast: owned.casts.has(next)});
  }
  {
    const {world, owner, host, target, controller, owned} = setup([
      'pack_challenge', 'seeking_challenge', 'large_challenge', 'piercing_challenge',
    ]);
    const cast = controller.prepare(owner, host, true), captured = owned.casts.get(cast);
    const delivery = challengeDelivery(host)!; assert(delivery);
    controller.toss(owner, cast, target.pos, delivery, 2);
    controller.toss(owner, cast, target.pos, delivery, 3);
    assert.equal(owned.landings.length, 2);
    assert(owned.landings.every((l: any) => l.cast === captured && l.d === delivery));
    assert.notEqual(owned.landings[0].at, owned.landings[1].at);
    controller.update(0.05);
    record('in-flight-landings-share-cast-and-delivery-but-own-points', {
      remaining: owned.landings.map((l: any) => l.remaining), duration: owned.landings[0].duration,
      powers: owned.landings.map((l: any) => l.power), sharedCast: true, sharedDelivery: true, distinctPoints: true});
    // Finish just the first landing; the second is still an observable pending
    // operation. A copied controller must preserve their common cast identity.
    owned.landings[1].remaining += 1;
    world.time = 3; controller.update(0.2);
    assert.equal(owned.effigies.length, 1); assert.equal(owned.landings.length, 1);
    const effigy = owned.effigies[0]; assert(effigy.creeper);
    assert.equal(effigy.cast, captured); assert.equal(owned.landings[0].cast, captured);
    assert.equal(effigy.creeper.owner, owner); assert.notEqual(effigy.center, effigy.creeper.pos);
    record('active-device-and-flight-share-the-captured-cast', {remaining: owned.landings[0].remaining,
      radius: effigy.radius, average: effigy.average, trailAt: effigy.trailAt, strikeAt: effigy.strikeAt,
      sharedCast: true, pursuerOwner: true, independentCenter: true});
    target.applyStatus('taunted', 0, 2, 'Diagnostic device call', {casterId: effigy.body.id});
    const call = effigy.body.construct?.castInst; assert.equal(call?.def.id, 'goad_device_call');
    const random = Math.random; Math.random = () => 0;
    try {controller.afterHit(effigy.body, call, target, 1, 0, 1);}
    finally {Math.random = random;}
    assert.equal(owned.shocks.length, 1);
    const shock = owned.shocks[0]; assert.equal(shock.effigy, effigy); assert(shock.greater && shock.echoes);
    record('greater-shock-retains-device-and-absolute-deadline', {
      time: world.time, due: shock.due, greater: true, echoes: true, effigyIdentity: true});
    const executed: string[] = [], execute = world.executeSkill.bind(world);
    world.executeSkill = (...args: Parameters<typeof world.executeSkill>) => {
      executed.push(args[1].def.name); return execute(...args);
    };
    world.time = shock.due - 0.001; controller.update(0);
    assert(!executed.includes('Aftershock')); assert(owned.shocks.includes(shock));
    record('shock-does-not-execute-before-its-deadline', {queued: owned.shocks.length, executed: 0});
    world.time = shock.due; controller.update(0);
    assert.equal(executed.filter(n => n === 'Aftershock').length, 1);
    assert(!owned.shocks.includes(shock)); assert.equal(owned.shocks.length, captured.state.spec.greaterShock.echoes);
    assert(owned.shocks.every((s: any) => s.effigy === effigy && !s.greater && !s.echoes));
    record('greater-shock-becomes-finite-echoes-on-the-same-device', {
      due: owned.shocks.map((s: any) => s.due), greater: false, echoes: false, sharedEffigy: true, executions: 1});
    controller.clearAll();
    assert.equal(owned.landings.length, 0); assert.equal(owned.effigies.length, 0); assert.equal(owned.shocks.length, 0);
    assert(effigy.body.dead && effigy.creeper.dead && captured.state.retired);
    record('retirement-cancels-flight-device-pursuer-and-echoes', {
      landings: 0, effigies: 0, shocks: 0, bodyDead: true, pursuerDead: true, retainedCast: owned.casts.get(cast) === captured});
  }
  writeFileSync(process.argv[2], JSON.stringify({scope: 'original-challenge-continuation/v1',
    notes: 'Controller lifetime, shared ownership, interrupted retirement and absolute device scheduling; no general World copy or durable publication.',
    observations}, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({scope: 'original-challenge-continuation/v1', observations: observations.length}));
} finally {restore();}
