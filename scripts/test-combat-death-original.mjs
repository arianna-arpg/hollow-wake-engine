import fs from 'node:fs'; import assert from 'node:assert/strict'; import {gunzipSync} from 'node:zlib';
import {deathHost} from '../test/combat-death-host.mjs'; import {sha256} from './reference-utils.mjs';
const probe = process.argv.includes('--probe');
const archive = fs.readFileSync(probe ? '.artifacts/m3-combat-death-probe.json.gz' : 'baseline/combat-death/observations.json.gz');
const bytes = gunzipSync(archive), fixture = JSON.parse(bytes); assert(fixture.originalOnly && fixture.explicitControllerSeams);
if (!probe) {const a = JSON.parse(fs.readFileSync('baseline/combat-death/acceptance.json')); assert.equal(sha256(archive), a.compressedSha256); assert.equal(sha256(bytes), a.sha256);}
const plain = value => JSON.parse(JSON.stringify(value, (key, v) => v instanceof Map ? [...v] :
  v instanceof Set ? [...v].map(a => a?.id ?? a) : ['owner', 'inst'].includes(key) && v ? v.id ?? v.def?.id : v));
for (const c of fixture.courses) {
  const h = deathHost(), owner = h.make(1, 'player'), victim = h.make(2), sibling = h.make(3, 'player');
  const actors = [owner, victim, sibling], record = (kind, ...args) => h.events.push([kind, ...args.map(a => a?.id ?? a?.def?.id ?? a)]);
  for (const [index, a] of actors.entries()) {
    const initial = c.initial.actors[index]; Object.assign(a, initial);
    a.radius = 14; a.pos = {x: index === 1 ? 20 : 0, y: 0};
    a.activeAuras = new Map(initial.activeAuras.map(id => [id, {}])); a.summonToggles = new Map(initial.summonToggles.map(id => [id, {}]));
    a.summonShells = initial.summonShells ? new Set(initial.summonShells.map(id => actors.find(b => b.id === id))) : undefined;
    a.partActors = initial.partActors?.map(id => actors.find(b => b.id === id));
  }
  sibling.owner = owner; victim.defId = c.victimDef;
  const skill = {def: c.definition};
  if (['silent', 'companion', 'silent-companion', 'undying', 'shell-retirement', 'construct-burst', 'construct-heal'].includes(c.name)) {
    victim.owner = owner; victim.team = 'player'; victim.summonInst = skill; victim.sourceSkillId = skill.def.id;
  }
  if (c.name.includes('companion')) victim.companion = true;
  if (c.name === 'undying') {victim.undyingTime = 2; victim.deathHealFlat = 8;}
  if (c.name === 'construct-burst') sibling.team = 'enemy';
  if (c.name === 'shell-retirement') victim.summonShell = true;
  if (c.name === 'player') {victim.team = 'player'; h.seats.push({id: 'p', actor: victim});}
  if (c.name === 'door') victim.doorId = 'gate';
  for (const [id, bodies] of c.initial.release) h.state.strikeReleaseBodies.set(actors.find(a => a.id === id), new Set(bodies.map(id => actors.find(a => a.id === id))));
  Object.assign(h.p, {immortal: () => c.name === 'immortal', cue() {}, flash() {}, text() {},
    breakDoor: id => record('door', id, 'broken'), bonds: {down: a => record('down', a)},
    statuses: {capturePropagation: () => [], detonateDeathStatuses() {}, propagateDeathStatuses() {}},
    retireAura: (a, id) => {record('aura', a, id); a.activeAuras.delete(id);},
    dismissToggle: (a, id) => {record('toggle', a, id); a.summonToggles.delete(id);},
    releaseContract: (a, yes) => record('contract', a, yes), tapCharges: (a, event) => record(event, a),
    throngKill: (a, by) => record('throngKill', a, by), playerDown: (a, by) => record('player', a, by),
    hit: (...args) => record('hit', ...args),
    heal: (a, i, b, effect) => {record('heal', a, i, b, effect.amount); b.healBy(effect.amount);},
  });
  const state = () => plain({actors: h.actors.map(a => ({id: a.id, dead: a.dead, downed: a.downed, life: a.life, companionReviveDwell: a.companionReviveDwell,
    casting: a.casting, aiCommand: a.aiCommand, undyingSpent: a.undyingSpent, explodeOnDeath: a.explodeOnDeath, lifespan: a.lifespan,
    construct: a.construct, partLink: a.partLink, partActors: a.partActors?.map(p => p.id), summonShells: a.summonShells,
    activeAuras: [...a.activeAuras.keys()], summonToggles: [...a.summonToggles.keys()]})),
    corpses: h.state.corpses, release: [...h.state.strikeReleaseBodies].map(([a, bodies]) => [a.id, [...bodies].map(b => b.id)]), events: h.events});
  // Explicit absence is part of the observer input, not a post-state repair.
  for (let i = 0; i < actors.length; i++) if (!Object.hasOwn(c.initial.actors[i], 'aiCommand')) actors[i].aiCommand = undefined;
  assert.deepEqual(state(), c.initial, c.name + ': initial');
  for (const [index, expected] of c.steps.entries()) {h.runtime.kill(victim, c.silent, owner); assert.deepEqual(state(), expected, c.name + ': ' + index);}
}
console.log({passed: true, originalCombatDeathCourses: fixture.courses.length, transitions: fixture.courses.length * 2,
  explicitControllerSeams: true, fullCombatPipelineQualified: false});
