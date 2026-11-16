import {CombatDeath} from '../dist/combat-death.js';

export function deathHost() {
  const actors = [], seats = [], events = [];
  const event = (name, ...values) => events.push([name, ...values.map(v => v?.id ?? v)]);
  const make = (id, team = 'enemy') => {
    const actor = {id, name: 'Body', team, pos: {x: 0, y: 0}, radius: 10, tier: 0, level: 1,
      facing: 0, color: '#fff', life: 0, dead: false, downed: false, companion: false,
      companionReviveDwell: 1, noBounty: true, undyingTime: 0, undyingSpent: false,
      explodeOnDeath: 0, deathHealPct: 0, deathHealFlat: 0, lifespan: 0,
      untargetable: false, invulnerable: false, casting: {inst: {}}, aiCommand: {kind: 'move'},
      activeAuras: new Map(), summonToggles: new Map(),
      sheet: {get: () => 1}, maxLife: () => 100,
      isMinion() {return !!this.owner;},
      healBy(n) {const before = this.life; this.life = Math.min(100, this.life + n); return this.life - before;},
    };
    actors.push(actor); return actor;
  };
  const state = {corpses: [], strikeReleaseBodies: new Map()};
  const bursts = {damage: (...v) => event('burst', ...v), explode: (...v) => event('explode', ...v),
    resolve: a => a.deathBurst ?? (a.explodeOnDeath ? {mode: 'implode', damageFrac: a.explodeOnDeath} : null),
    spawn: (...v) => event('coalesce', ...v)};
  const p = {
    actors: () => actors, seats: () => seats, random: () => .5,
    immortal: () => false, leavesRemains: () => true,
    breakDoor: id => event('door', id), eject: (s, reason) => event('eject', s.id, reason),
    breakPart: a => event('part', a), releaseGarrison: a => event('garrison', a),
    tags: () => new Set(), modifiers: () => [], bashSpec: () => undefined,
    bash: (...v) => event('bash', ...v), enemies: a => actors.filter(b => b.team !== a.team && !b.dead),
    hit: (...v) => event('hit', ...v), heal: (a, i, b, effect) => {event('heal', a, i, b, effect); b.healBy(effect.amount);},
    statuses: {capturePropagation: () => [], detonateDeathStatuses: a => event('rupture', a), propagateDeathStatuses: a => event('propagate', a)},
    bonds: {down: a => event('bond-down', a)}, clutch: {onDeath: a => event('clutch', a, a.dead)},
    minionDeath: (...v) => event('minionDeath', ...v), guard: {clear: a => event('guard', a)},
    carried: ['satellites', 'auroras', 'guardians', 'creepers'].map(id => ({retire: a => event(id, a)})),
    hiveDeath: a => event('hive', a), throngMinimum: (...v) => event('minimum', ...v), throngKill: a => event('throngKill', a),
    retireAura: (a, id) => {event('retireAura', a, id); a.activeAuras.delete(id);},
    deathActions: (...v) => event('actions', ...v), playerDown: (...v) => event('playerDown', ...v),
    createMonster: (id, level, team, owner) => {
      const a = make(actors.length + 10, team); actors.pop(); Object.assign(a, {defId: id, level, owner}); return a;
    },
    minionsOfSkill: (a, id) => actors.filter(b => b.owner === a && b.sourceSkillId === id && !b.dead),
    lifeline: () => 42, clamp: p => ({...p}), emerge: a => event('emerge', a), hatch: a => event('hatch', a),
    releaseContract: (...v) => event('release', ...v),
    dismissToggle: (a, id) => {event('dismiss', a, id); a.summonToggles.delete(id);},
    tapCharges: (...v) => event('charge', ...v), presence: (...v) => event('presence', ...v),
    cue: (...v) => event('cue', ...v), flash: (...v) => event('flash', ...v), text: (...v) => event('text', ...v),
  };
  const runtime = new CombatDeath(state, {corpseDuration: 6, corpseMax: 2}, bursts, p);
  return {actors, seats, events, make, state, bursts, p, runtime};
}
