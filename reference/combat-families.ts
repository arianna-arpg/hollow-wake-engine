// Whole original World frames in its existing quiet, flat sim arena. No SDK
// runtime, substituted combat methods or skipped random intervals participate.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {Actor, resetActorIdCounter} from '../src/engine/actor';
import {ATTRIBUTES} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {seedGlobalRandom} from '../src/sim/rng';

const seed = 1234, courses = [], restoreBoot = seedGlobalRandom(1234);
try {
  const types = new Set<string>();
  const defs = Object.values(SKILLS).filter(d => {
    const keys = ['delivery:' + d.delivery.type, 'mode:' + (d.castMode ?? 'cast'), ...d.effects.map(fx => 'effect:' + fx.type)];
    const fresh = keys.some(key => !types.has(key)); keys.forEach(key => types.add(key)); return fresh;
  });
  for (const def of defs) {
    const w = makeSimWorld('warrior', seed);
    resetActorIdCounter();
    const actor = new Actor('Hero', 'player', {x: 400, y: 400}); actor.kind = 'player';
    const enemy = new Actor('Target', 'enemy', {x: 440, y: 400});
    for (const a of [actor, enemy]) {
      a.sheet.setBase('life', 10000); a.sheet.setBase('mana', 10000); a.life = a.maxLife() * .4; a.mana = a.maxMana() * .4;
    }
    w.actors = [actor, enemy]; w.localSeat.actor = actor; w.time = 0;
    (w as any).indexSeats();
    w.meta.knownSkills.clear(); w.meta.attrs = Object.fromEntries(Object.keys(ATTRIBUTES).map(id => [id, 100])) as any;
    w.localSeat.lastActedAt = -999;
    const skill = makeSkillInstance(def, 1); actor.skills = [skill]; w.meta.knownSkills.set(def.id, skill);
    const view = w.viewRectFor(actor);
    const restore = seedGlobalRandom(seed), next = Math.random; let draws = 0;
    Math.random = () => {draws++; return next();};
    const inspect = () => ({time: w.time, draws,
      effects: w.actors.map(a => ({id:a.id, owner:a.owner?.id, radius:a.radius, kind:a.kind,
        ward:a.ward, absorb:a.absorb, absorbLayers:[...a.absorbLayers], poise:a.poise, endurance:a.endurance,
        reservedLife:a.reservedLife, reservedMana:a.reservedMana, ironWard:a.ironWard,
        buffs:[...a.buffs].map(([id,b])=>({id,remaining:b.remaining,stacks:b.stacks,mods:b.def.mods})),
        auras:[...a.activeAuras].map(([id,row])=>({id,remaining:row.remaining,radius:row.radius})),
        summons:[...a.summonToggles.keys()], gripping:a.gripping, heldBy:a.heldBy,
        runes:a.runes, mimicBank:a.mimicBank, stance:a.companionStance,
      })),
      actors: w.actors.map(a => ({id: a.id, name: a.name, defId: a.defId ?? null, team: a.team, pos: {...a.pos}, tier: a.tier,
        life: a.life, mana: a.mana, es: a.es, dead: a.dead, downed: a.downed, lifespan: a.lifespan ?? null,
        casting: a.casting ? {id: a.casting.inst.def.id, mode: a.casting.mode, elapsed: a.casting.elapsed, total: a.casting.total} : null,
        cooldowns: [...a.cooldowns], charges: [...a.charges], statuses: a.statuses.map(s => ({id: s.id, remaining: s.remaining, dps: s.dps, stacks: s.stacks}))})),
      projectiles: w.projectiles.map(p => ({skill: p.inst.def.id, pos: {...p.pos}, life: p.life})),
      zones: w.zones.map(z => ({skill: z.inst.def.id, pos: {...z.pos}, delay: z.delay, linger: z.linger, tick: z.tick, exploded: z.exploded})),
      corpses: w.corpses.map(c => ({pos: {...c.pos}, remaining: c.remaining})),
    });
    try {
      const accepted = w.useSkill(actor, skill, {...enemy.pos}, true);
      const steps = [inspect()];
      for (let i = 0; i < 30; i++) {if (i === 8 && actor.casting) actor.casting.held = false; w.update(.1); steps.push(inspect());}
      courses.push({id: def.id, delivery: def.delivery.type, effects: def.effects.map(fx => fx.type), mode: def.castMode ?? 'cast', resourceFraction: .4, releaseStep: 9, seed, view, accepted, steps});
    } finally {restore();}
  }
  assert.equal([...types].filter(key => key.startsWith('effect:')).length, 52);
  writeFileSync(process.argv[2], JSON.stringify({originalOnly: true, courses}));
} finally {restoreBoot();}
