import {StatSheet, Random} from '@hollow-wake/engine';
import {createCombatOwner} from './combat-owner.mjs';
import {createCombatAdmission} from './combat-admission.mjs';
import {installCombatClock} from './combat-clock-services.mjs';
import {combatCharacter} from './combat-character.mjs';
export {createCombatGeometry} from './combat-space-geometry.mjs';

const point = at => {
  if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) throw new TypeError('Invalid combat point');
  return {x: at.x, y: at.y};
};
const positiveInteger = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Invalid ' + name);
  return value;
};

/** Candidate authored composition. Its package is withheld until composed
 * capability and installed-consumer qualification pass. Native bodies are
 * trusted encounter inputs; character investment enters through CharacterLive.
 * Handles belong to one session. Inspection never lends its mutable records. */
export function createCombatSession(content, host, options = {}) {
  if (content?.capability !== 'combat-content/v1') throw Error('Invalid combat content');
  const q = {...content.queries, ...content.hitQueries};
  const admission = createCombatAdmission(content, host);
  const owner = createCombatOwner(content, host, {...options, admit: admission.admit});
  const {w} = owner, clock = installCombatClock(owner, content);
  const handles = new WeakMap(), byId = new Map();
  const characters = new WeakMap(), boundCharacters = new WeakSet();
  let busy = false, faulted = false;
  if (host.environment !== undefined && typeof host.environment !== 'function') throw new TypeError('Invalid combat environment provider');
  if (host.environment) owner.environment = dt => {
    const facts = host.environment({seconds:dt, time:w.time, actors:w.actors.filter(a=>!a.dead).map(a=>({id:a.id,pos:{...a.pos},radius:a.radius,tier:a.tier,team:a.team}))});
    if (!Array.isArray(facts) || facts.length > 4096) throw new TypeError('Invalid environmental status facts');
    const pending = facts.map(row => {
      const actor = row && w.actorById(row.actor);
      if (!actor || actor.dead || !q.STATUS_DEFS[row.status] || !Number.isFinite(row.dps) || row.dps < 0
        || !Number.isFinite(row.magnitude) || row.magnitude < 0 || typeof row.source !== 'string' || row.source.length > 256)
        throw new TypeError('Invalid environmental status fact');
      return {actor,status:row.status,dps:row.dps,magnitude:row.magnitude,source:row.source};
    });
    for (const row of pending) row.actor.applyStatus(row.status,row.dps,row.magnitude,row.source);
  };
  function available() {
    if (faulted) throw Error('Combat session is quarantined after a callback failure');
    if (busy) throw Error('Combat session cannot reenter');
  }
  function operate(work) {
    available(); busy = true;
    try {return work();} catch (error) {faulted = true; throw error;} finally {busy = false;}
  }
  function body(handle) {
    available();
    const actor = handles.get(handle);
    if (!actor) throw Error('Foreign or invalid combat actor handle');
    return actor;
  }
  function handle(actor) {
    let result = byId.get(actor.id);
    if (!result) {result = Object.freeze({id: actor.id}); byId.set(actor.id, result); handles.set(result, actor);}
    return result;
  }
  function nextIdentity() {
    if (!Number.isSafeInteger(w.nextActorId) || w.nextActorId < 1 || w.nextActorId >= Number.MAX_SAFE_INTEGER) throw Error('Combat actor identity space exhausted');
    return w.nextActorId;
  }
  function skill(spec) {
    if (typeof spec === 'string') spec = {id: spec};
    const def = q.SKILLS[spec?.id]; if (!def) throw Error('Unknown combat skill');
    const inst = q.makeSkillInstance(def, positiveInteger(spec.level ?? 1, 'skill level'));
    if (spec.treeNodes) {
      if (!Array.isArray(spec.treeNodes) || spec.treeNodes.some(id => typeof id !== 'string' || !q.treeNodeOf(def, id))) throw Error('Unknown skill tree node');
      inst.treeNodes = [...spec.treeNodes];
    }
    if (spec.sockets) {
      if (!Array.isArray(spec.sockets) || spec.sockets.length > 32) throw Error('Invalid combat support slots');
      inst.sockets = spec.sockets.map(row => {
        if (row === null) return null;
        const def = q.SUPPORTS[row?.id]; if (!def) throw Error('Unknown combat support');
        return {def, level: positiveInteger(row.level ?? 1, 'support level'), ...(row.rolled ? {rolled: structuredClone(row.rolled)} : {})};
      });
    }
    return inst;
  }
  function inspectActor(actor) {
    return {id: actor.id, name: actor.name, defId: actor.defId ?? null, team: actor.team, pos: {...actor.pos}, tier: actor.tier,
      life: actor.life, mana: actor.mana, es: actor.es, dead: actor.dead, downed: actor.downed, lifespan: actor.lifespan ?? null,
      casting: actor.casting ? {id: actor.casting.inst.def.id, mode: actor.casting.mode, elapsed: actor.casting.elapsed, total: actor.casting.total} : null,
      cooldowns: [...actor.cooldowns], charges: [...actor.charges], statuses: actor.statuses.map(s => ({id: s.id, remaining: s.remaining, dps: s.dps, stacks: s.stacks}))};
  }
  const pose = a => ({id:a.id, pos:{...a.pos}, tier:a.tier, radius:a.radius, facing:a.facing, velocity:{...a.vel},
    moveAccumulator:a.moveAcc, strideDistance:a.strideDist, idleFor:a.idleFor, plantFor:a.plantFor});
  const api = {
    addMonster(id, config) {
      available();
      if (!Object.hasOwn(q.MONSTERS,id)) throw Error('Unknown combat monster');
      if (!config || !['player','enemy','ally'].includes(config.team)) throw Error('Invalid monster team');
      const at=point(config.position),level=positiveInteger(config.level??1,'monster level'),tier=config.layer??0;
      const fraction=config.resourceFraction??1;
      if(!Number.isFinite(fraction)||fraction<=0||fraction>1)throw Error('Invalid starting resource fraction');
      if (!Number.isSafeInteger(tier)||tier<0)throw Error('Invalid combat layer');
      nextIdentity();
      // The same body factory prepares the complete random kit in an isolated
      // owner. This includes probabilistic native grants, boon grafts and item
      // rolls. Admission never borrows or advances the live random stream.
      const preview=createCombatOwner(content,{space:{...host.space,tiers:()=>w.zone.tiers}},
        {...options,capacity:1,admit:admission.admit});
      const random=Random.restore(owner.rng.snapshot());preview.w.random=()=>random.next();
      preview.w.nextActorId=w.nextActorId;preview.w.nextItemId=w.nextItemId;preview.w.time=w.time;
      preview.w.seats=w.seats;preview.w.localSeat=w.localSeat;
      const candidate=preview.w.createMonster(id,level,config.team);
      const nativeWhy=admission.inspectActor(candidate);if(nativeWhy)throw Error('Combat admission: '+JSON.stringify(nativeWhy));
      for(const inst of candidate.skills)if(inst){const why=admission.inspect(candidate,inst);if(why)throw Error('Combat admission: '+JSON.stringify(why));}
      return operate(()=>{const actor=w.createMonster(id,level,config.team);actor.pos=at;actor.tier=tier;
        actor.life*=fraction;actor.mana*=fraction;
        w.actors.push(actor);w.actorGridRev++;return handle(actor);});
    },
    addActor(config) {
      available();
      if (!config || typeof config.name !== 'string' || !['player', 'enemy', 'ally'].includes(config.team)) throw Error('Invalid combat body');
      const at = point(config.position), level = positiveInteger(config.level ?? 1, 'actor level');
      const resourceFraction = config.resourceFraction ?? 1;
      if (!Number.isFinite(resourceFraction) || resourceFraction <= 0 || resourceFraction > 1) throw Error('Invalid starting resource fraction');
      if (!Number.isSafeInteger(config.layer ?? 0) || (config.layer ?? 0) < 0) throw Error('Invalid combat layer');
      // Build and inspect a detached candidate. Failed admission consumes no
      // identity, randomness, live resources or spatial query.
      const actor = new owner.shared.actors.Actor(nextIdentity(), config.name, config.team, at, new StatSheet(owner.shared.stats));
      actor.level = level; actor.tier = config.layer ?? 0;
      for (const flag of ['flying','levitates']) {
        if (config[flag] !== undefined && typeof config[flag] !== 'boolean') throw Error('Invalid native movement flag');
        if (config[flag] !== undefined) actor[flag] = config[flag];
      }
      actor.flyingBase = actor.flying;
      if (config.controlled) actor.kind = 'player';
      for (const [id, value] of Object.entries(config.stats ?? {})) {
        if (!Object.hasOwn(content.stats, id) || !Number.isFinite(value)) throw Error('Invalid combat statistic: ' + id);
        actor.sheet.setBase(id, value);
      }
      actor.skills = (config.skills ?? []).map(skill);
      const nativeWhy=admission.inspectActor(actor);if(nativeWhy)throw Error('Combat admission: '+JSON.stringify(nativeWhy));
      for (const inst of actor.skills) {
        const why = admission.inspect(actor, inst); if (why) throw Error('Combat admission: ' + JSON.stringify(why));
      }
      actor.fillResources();
      actor.life *= resourceFraction; actor.mana *= resourceFraction;
      const attrs = {...(config.attributes ?? {})};
      if (Object.entries(attrs).some(([id, value]) => !Object.hasOwn(q.ATTRIBUTES, id) || !Number.isFinite(value) || value < 0)) throw Error('Invalid combat attributes');
      return operate(() => {
        w.nextActorId++; w.actors.push(actor); w.actorGridRev++;
        if (config.controlled) {
          const seat = {id: 'actor:' + actor.id, actor, meta: {knownSkills: new Map(actor.skills.map(inst => [inst.def.id, inst])), stances: new Map(), attrs}, reviveDwellBy: new Map(), lastActedAt: -999};
          w.seats.push(seat); w.localSeat ??= seat;
        }
        return handle(actor);
      });
    },
    addCharacter(kit, character, config) {
      available();
      if (boundCharacters.has(character)) throw Error('Character already belongs to this combat session');
      if (!config || typeof config.name !== 'string') throw Error('Invalid character body');
      const at = point(config.position), tier = config.layer ?? 0;
      if (!Number.isSafeInteger(tier) || tier < 0) throw Error('Invalid combat layer');
      const actor = new owner.shared.actors.Actor(nextIdentity(), config.name, 'player', at, new StatSheet(owner.shared.stats));
      actor.kind = 'player'; actor.tier = tier; actor.skills = Array(8).fill(null);
      const seat = {id: 'actor:' + actor.id, actor, meta: {knownSkills: new Map(), stances: new Map()}, reviveDwellBy: new Map(), lastActedAt: -999};
      const binding = combatCharacter(owner, content, admission, kit, character, actor, seat);
      return operate(() => {
        w.nextActorId++; w.actors.push(actor); w.actorGridRev++; w.seats.push(seat); w.localSeat ??= seat;
        binding.initialize(); boundCharacters.add(character);
        const ref = handle(actor); characters.set(ref, binding); return ref;
      });
    },
    commitCharacter(ref, change) {
      const actor = body(ref), binding = characters.get(ref);
      if (!binding) throw Error('Actor has no character owner');
      const refusal = binding.check(change);
      if (refusal) return {accepted: false, refusal};
      return operate(() => {binding.commit(change); w.signal('character-changed', {actor: actor.id}); return {accepted: true};});
    },
    press(ref, skillId, aim) {
      const actor = body(ref), at = point(aim);
      const seat=w.seatOf(actor);
      const inst = actor.skills.find(s => s?.def.id === skillId) ?? seat?.meta.knownSkills.get(skillId) ?? seat?.grantedInsts?.get(skillId);
      if (!inst || actor.dead || actor.downed) return false;
      return operate(() => w.useSkill(actor, inst, at, true));
    },
    move(ref, direction, seconds) {
      const actor = body(ref), at = point(direction);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 1) throw new RangeError('Movement duration must be between zero and one second');
      if (actor.dead || actor.downed || seconds === 0) return;
      return operate(() => {
        const scale = w.timeflow.scaleFor(actor);
        if (scale > 0) {w.moveActor(actor, at.x, at.y, seconds * scale); w.actorGridRev++;}
      });
    },
    aim(ref, aim) {const actor = body(ref), at = point(aim); return operate(() => {
      actor.aimPos = at;
      if (actor.casting && ['channel','charge','guard','overcharge','concentration'].includes(actor.casting.mode)) actor.casting.aim = {...at};
    });},
    meta(ref, skillId, aim) {
      const actor=body(ref),at=point(aim),seat=w.seatOf(actor);
      const inst=actor.skills.find(s=>s?.def.id===skillId)??seat?.meta.knownSkills.get(skillId)??seat?.grantedInsts?.get(skillId);
      if(!inst||actor.dead||actor.downed)return false;
      const why=admission.inspect(actor,inst);
      if(why){w.signal('combat-refused',why);return false;}
      return operate(()=>w.useMetaSkill(actor,inst,at));
    },
    release(ref) {const actor = body(ref); return operate(() => {if (actor.casting) actor.casting.held = false;});},
    timingPress(ref) {const actor = body(ref); return operate(() => w.castPress(actor));},
    advance(dt) {
      available(); if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Combat duration must be finite and nonnegative');
      return operate(() => {
        clock.advance(dt);
        // A lookup cache must not keep retired NPCs alive after all external
        // handles have been dropped. A retained handle still owns its view.
        for(const [id,ref] of byId){const actor=handles.get(ref);if(actor.dead&&!actor.isPlayerKind())byId.delete(id);}
      });
    },
    actor(id) {available(); const actor = w.actorById(id); return actor ? handle(actor) : null;},
    controlled(ref) {const actor=body(ref),seat=w.seats.find(s=>s.actor===actor||s.home===actor);return seat?handle(seat.actor):null;},
    inspect(ref) {return inspectActor(body(ref));},
    pose(ref) {return pose(body(ref));},
    poses() {available();return w.actors.map(pose);},
    stat(ref, id) {const actor = body(ref); if (typeof id !== 'string' || !id.length || id.length > 256) throw Error('Invalid combat statistic'); return actor.sheet.get(id);},
    build(ref) {body(ref); const binding = characters.get(ref); if (!binding) throw Error('Actor has no character owner'); return binding.view();},
    effects() {
      available();
      return structuredClone(w.actors.map(a => ({id:a.id, owner:a.owner?.id, radius:a.radius, kind:a.kind,
        ward:a.ward, absorb:a.absorb, absorbLayers:[...a.absorbLayers], poise:a.poise, endurance:a.endurance,
        reservedLife:a.reservedLife, reservedMana:a.reservedMana, ironWard:a.ironWard,
        buffs:[...a.buffs].map(([id,b])=>({id,remaining:b.remaining,stacks:b.stacks,mods:b.def.mods})),
        auras:[...a.activeAuras].map(([id,row])=>({id,remaining:row.remaining,radius:row.radius})),
        summons:[...a.summonToggles.keys()], gripping:a.gripping, heldBy:a.heldBy,
        runes:a.runes, mimicBank:a.mimicBank, stance:a.companionStance,
      })));
    },
    procs() {available();return w.actors.map(a=>({id:a.id,ready:[...a.procReadyAt],fired:[...a.procFiredAt],attempted:[...a.procAttemptAt]}));},
    snapshot() {
      available();
      return {time: w.time, draws: owner.rng.draws, actors: w.actors.map(inspectActor),
        projectiles: w.projectiles.map(p => ({skill: p.inst.def.id, pos: {...p.pos}, life: p.life})),
        zones: w.zones.map(z => ({skill: z.inst.def.id, pos: {...z.pos}, delay: z.delay, linger: z.linger, tick: z.tick, exploded: z.exploded})),
        corpses: w.corpses.map(c => ({pos: {...c.pos}, remaining: c.remaining})),
      };
    },
    drainSignals() {available(); const rows = structuredClone(w.signals); w.signals = []; return rows;},
  };
  return Object.freeze(api);
}
