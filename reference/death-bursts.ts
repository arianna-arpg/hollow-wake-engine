import {writeFileSync} from 'node:fs';
import {World} from '../src/engine/world';
import {Actor} from '../src/engine/actor';
import {DAMAGE_COLOR, STAT_DEFS} from '../src/engine/stats';
import type {DeathBurstDef} from '../src/data/monsters';

const recipes = [
  {name: 'implode', config: {mode: 'implode', damageFrac: .2}},
  {name: 'duration', stats: {effectDuration: 2}, config: {mode: 'implode', damageFrac: .2}},
  {name: 'orb', config: {mode: 'orb', damageFrac: .2, orbSpeed: 999}},
  {name: 'contact-body', config: {mode: 'orb', damageFrac: .2, detonateOnContact: true}},
  {name: 'contact-wall', wall: true, config: {mode: 'orb', damageFrac: .2, detonateOnContact: true}},
  {name: 'no-live-seat', downed: true, config: {mode: 'orb', damageFrac: .2}},
  {name: 'other-tier', tier: 1, config: {mode: 'implode', damageFrac: .2}},
  {name: 'immunity', immune: true, config: {mode: 'implode', damageFrac: .2}},
  {name: 'resistance', targetStats: {fireRes: .5}, config: {mode: 'implode', damageFrac: .2}},
  {name: 'shield', shield: 15, config: {mode: 'implode', damageFrac: .2}},
  {name: 'source-conversion', direct: true, stats: {convert_fire_cold: 1, damage: 1.5}, config: {mode: 'implode', damageFrac: .2}},
  {name: 'lethal', targetLife: 1, config: {mode: 'implode', damageFrac: .2}},
] as const;
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
const body = (a: Actor) => ({id: a.id, team: a.team, pos: {...a.pos}, radius: a.radius, tier: a.tier,
  life: a.life, mana: a.mana, es: a.es, ward: a.ward, absorb: a.absorb, esDelay: a.esDelay,
  esBroke: a.esBroke, hitFlash: a.hitFlash, hitFlashType: a.hitFlashType, dead: a.dead,
  downed: a.downed, invulnerable: a.invulnerable, poise: a.poise, poiseBroken: a.poiseBroken,
  insight: a.insight, endurance: a.endurance, evadeEntropy: a.evadeEntropy, evadeWindow: a.evadeWindow});
const courses = [], savedRandom = Math.random;
let draws = 0; Math.random = () => {draws++; return .5;};
try {
  for (const recipe of recipes) {
    const r = recipe as typeof recipe & {stats?: Record<string, number>; targetStats?: Record<string, number>; wall?: boolean; downed?: boolean; tier?: number; immune?: boolean; shield?: number; direct?: boolean; targetLife?: number};
    const w = Object.create(World.prototype) as any, events: unknown[] = [], rays: unknown[] = [];
    const source = new Actor('Source', 'enemy', {x: 0, y: 0}), target = new Actor('Target', 'player', {x: 25, y: 0});
    source.id = 1; target.id = 2;
    for (const a of [source, target]) {a.sheet.setBase('life', 100); a.sheet.setBase('poise', 0); a.life = 100; a.poise = 0;}
    for (const [k, v] of Object.entries(r.stats ?? {})) source.sheet.setBase(k as any, v);
    for (const [k, v] of Object.entries(r.targetStats ?? {})) target.sheet.setBase(k as any, v);
    target.life = r.targetLife ?? 100; target.es = r.shield ?? 0;
    target.downed = !!r.downed; target.tier = r.tier ?? 0; target.invulnerable = !!r.immune;
    w.actors = [source, target]; w.seats = [{id: 'p', actor: target}]; w.deathBursts = []; w.flashes = [];
    w.recordIndirectDamage = () => {}; w.strikeSurfaces = () => {};
    w.hostileTo = (a: Actor, b: Actor) => a.team !== b.team;
    w.showCombatOutcome = (a: Actor, kind: string, at: unknown) => events.push(['outcome', a.id, kind, plain(at)]);
    w.text = (at: unknown, text: string, color: string, size: number) => events.push(['text', plain(at), text, color, size]);
    w.kill = (a: Actor, silent: boolean, by?: Actor) => {events.push(['kill', a.id, silent, by?.id]); a.dead = true;};
    w.clampPos = (at: {x: number; y: number}, radius: number, from?: unknown) => {
      rays.push([plain(at), radius, from ? plain(from) : null]); return r.wall ? {x: Math.min(5, at.x), y: at.y} : {...at};
    };
    const initial = plain([body(source), body(target)]); draws = 0;
    const state = () => plain({pending: w.deathBursts, actors: w.actors.map(body), events, rays, flashes: w.flashes, draws});
    if (r.direct) w.explodeActor(source, r.config.damageFrac);
    else w.spawnDeathBurst(source, r.config as DeathBurstDef);
    const steps = [{dt: 0, state: state()}];
    for (const dt of [.2, .6, .15, .2, .8, 1, 2]) {w.updateDeathBursts(dt); steps.push({dt, state: state()});}
    courses.push({name: r.name, recipe: r, initial, steps});
  }
  writeFileSync(process.argv[2], JSON.stringify({originalOnly: true, rules: {baseMoveSpeed: STAT_DEFS.moveSpeed.base, colors: DAMAGE_COLOR}, courses}));
} finally {Math.random = savedRandom;}
