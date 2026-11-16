import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance, type SkillDef} from '../src/engine/skills';
import {MONSTERS} from '../src/data/monsters';

// The complete original kill method is observed. Named controller calls below
// are explicit observation seams, so this qualifies death ordering/state, not
// the internals of every controller, general AI or campaign consequences.
const names = ['ordinary', 'silent', 'companion', 'silent-companion', 'undying',
  'construct-burst', 'construct-heal', 'shell-retirement', 'player', 'immortal', 'door', 'part-owner'];
const courses = [];
const plain = (value: unknown) => JSON.parse(JSON.stringify(value, (key, v) =>
  v instanceof Map ? [...v] : v instanceof Set ? [...v].map(a => a?.id ?? a) :
  ['owner', 'inst'].includes(key) && v ? v.id ?? v.def?.id : v));
for (const name of names) {
  const w = makeSimWorld('warrior', 444) as any, events: unknown[] = [];
  const owner = new Actor('Owner', 'player', {x: 0, y: 0}), victim = new Actor('Victim', 'enemy', {x: 20, y: 0}), sibling = new Actor('Sibling', 'player', {x: 0, y: 0});
  owner.id = 1; victim.id = 2; sibling.id = 3;
  for (const a of [owner, victim, sibling]) {a.sheet.setBase('life', 100); a.life = 40; a.noBounty = true;}
  victim.life = 0; victim.defId = 'm3-no-definition'; sibling.owner = owner;
  w.actors = [owner, victim, sibling]; w.corpses = []; w.seats = []; w.pendingRespawns = [];
  w.strikeReleaseBodies = new Map(); w.flashes = []; w.meta.modeId = 'immortal';
  const record = (kind: string, ...args: any[]) => events.push([kind, ...args.map(a => a?.id ?? a?.def?.id ?? a)]);
  w.guardArts = {clear: (a: Actor) => record('guard', a)};
  for (const kind of ['satellites', 'auroras', 'guardians', 'creepers']) w[kind] = {retire: (a: Actor) => record(kind, a)};
  w.companionBonds = {down: (a: Actor) => record('down', a)};
  w.clutchOnDeath = (a: Actor) => record('clutch', a, a.dead);
  w.rollOwnProcs = (a: Actor, event: string, context: {target: Actor}) => record(event, a, context.target);
  w.presenceMoment = (a: Actor, event: string) => record('presence', a, event);
  w.deactivateAura = (a: Actor, id: string) => {record('aura', a, id); a.activeAuras.delete(id);};
  w.dismissSummonToggle = (a: Actor, id: string) => {record('toggle', a, id); a.summonToggles.delete(id);};
  w.releaseContract = (a: Actor, respawn: boolean) => record('contract', a, respawn);
  w.tapCharges = (a: Actor, event: string) => record(event, a);
  w.throngOnKill = (a: Actor, by: Actor) => record('throngKill', a, by);
  w.onPlayerDown = (a: Actor, by: Actor) => record('player', a, by);
  w.setDoorState = (id: string, state: string) => record('door', id, state);
  w.onSquadDeath = () => {}; w.deedEnemy = () => false; w.text = () => {};
  w.showCompanionCue = () => {}; w.showRecoveryCue = () => {}; w.bumpDrives = () => {};
  w.resolveHit = (a: Actor, i: any, target: Actor, scale: number, depth: number, dt: unknown, secondary: boolean) => record('hit', a, i, target, scale, depth, dt, secondary);
  w.applyHeal = (a: Actor, i: any, target: Actor, effect: {amount: number}) => {record('heal', a, i, target, effect.amount); target.healBy(effect.amount);};
  w.explodeActor = (a: Actor, fraction: number) => record('explode', a, fraction);
  const definition = {id: 'm3-summon', name: 'Summon', description: '', color: '#fff', tags: ['spell'], manaCost: 0, useTime: 0, cooldown: 0, delivery: {type: 'summon', monsterId: 'zombie', count: 1, maxActive: 2}, effects: []} as SkillDef;
  const inst = makeSkillInstance(definition, 1);
  let silent = name.startsWith('silent');
  if (['silent', 'companion', 'silent-companion', 'undying', 'shell-retirement'].includes(name)) {
    victim.owner = owner; victim.team = 'player'; victim.summonInst = inst; victim.sourceSkillId = inst.def.id;
  }
  if (name.includes('companion')) victim.companion = true;
  if (name === 'undying') {victim.undyingTime = 2; victim.explodeOnDeath = .3; victim.deathHealFlat = 8;}
  if (name === 'construct-burst' || name === 'construct-heal') {
    victim.team = 'player'; victim.owner = owner; victim.summonInst = inst;
    victim.construct = {kind: 'totem', range: 100, timer: 0, ...(name === 'construct-burst' ? {deathBurst: {radius: 50, damageScale: 2}} : {healBurst: {cap: 20, ratio: 2, radius: 50}, stored: 50})};
    sibling.team = name === 'construct-burst' ? 'enemy' : 'player';
  }
  if (name === 'shell-retirement') {
    victim.summonShell = true; owner.summonShells = new Set([victim]); w.strikeReleaseBodies.set(owner, new Set([victim]));
    victim.activeAuras.set('ward', {} as any); victim.summonToggles.set('summon', {inst, reserved: 0});
  }
  if (name === 'player') {victim.team = 'player'; w.seats = [{id: 'p', actor: victim}]; w.seatByActor = new Map([[victim, w.seats[0]]]); victim.summonToggles.set('keep', {inst, reserved: 0});}
  if (name === 'immortal') {victim.defId = Object.keys(MONSTERS).find(id => MONSTERS[id].immortal)!; if (!victim.defId) throw Error('No immortal source content');}
  if (name === 'door') victim.doorId = 'gate';
  if (name === 'part-owner') {sibling.partLink = {} as any; victim.partActors = [sibling];}
  const state = () => plain({actors: w.actors.map((a: Actor) => ({id: a.id, dead: a.dead, downed: a.downed, life: a.life, companionReviveDwell: a.companionReviveDwell,
    casting: a.casting, aiCommand: a.aiCommand, undyingSpent: a.undyingSpent, explodeOnDeath: a.explodeOnDeath, lifespan: a.lifespan,
    construct: a.construct, partLink: a.partLink, partActors: a.partActors?.map(p => p.id), summonShells: a.summonShells,
    activeAuras: [...a.activeAuras.keys()], summonToggles: [...a.summonToggles.keys()]})),
    corpses: w.corpses, release: [...w.strikeReleaseBodies].map(([a, bodies]: any) => [a.id, [...bodies].map((b: Actor) => b.id)]), events});
  const initial = state(), steps = [];
  w.kill(victim, silent, owner); steps.push(state());
  w.kill(victim, silent, owner); steps.push(state());
  courses.push({name, silent, definition, initial, victimDef: victim.defId, steps});
}
writeFileSync(process.argv[2], JSON.stringify({originalOnly: true, explicitControllerSeams: true, courses}));
