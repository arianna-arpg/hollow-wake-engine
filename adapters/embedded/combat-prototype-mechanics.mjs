// Mechanically extracted from the separately pinned prototype parity revision.
// All mutable controllers and randomness belong to one combat owner.
function castSequence(w,q,library) {
const instanceDelivery = q.instanceDelivery;
const mod = q.mod;
function empoweredSkill(inst, power, size, effects = []) {
  const d = instanceDelivery(inst);
  const delivery = d.type === "projectile" ? { ...d, radius: d.radius * size } : d.type === "storm" ? { ...d, hitRadius: d.hitRadius * size } : d;
  return { ...inst, def: {
    ...inst.def,
    delivery,
    castSequence: void 0,
    effects: [...inst.def.effects, ...effects],
    innateMods: [...inst.def.innateMods ?? [], mod("damage", "more", power - 1)]
  } };
}
function castSequenceInstance(actor, inst, realUse) {
  const spec = inst.def.castSequence;
  if (!spec || !realUse) return inst;
  const count = (actor.castSequences.get(inst) ?? 0) + 1;
  actor.castSequences.set(inst, count % spec.every);
  return count % spec.every === 0 ? empoweredSkill(inst, spec.power, spec.size, spec.effects) : inst;
}

return {empoweredSkill,castSequenceInstance};
}

function strikeTiming(w,q,library) {
const instanceStrikeTimings = q.instanceStrikeTimings;
const STRIKE_TIMING_CFG = {
  perfect: { start: 0.72, bonus: 0.7 },
  timed: { markerMin: 0.3, markerMax: 0.85, tolerance: 0.08, bonus: 1.2 }
};
function strikeTimingsOf(cs) {
  if (cs.mode !== "perfect" && cs.mode !== "timed" && cs.mode !== "overcharge") return [];
  if (cs.strikeTimings) return cs.strikeTimings;
  if (cs.inst.sockets) return instanceStrikeTimings(cs.inst);
  return cs.mode === "overcharge" ? [] : [
    { kind: cs.mode, source: { kind: "skill", id: cs.inst.def.id } }
  ];
}
function rollStrikeMarker(timings, random = (() => w.random())) {
  const cfg = STRIKE_TIMING_CFG.timed;
  return timings.some((t) => t.kind === "timed") ? cfg.markerMin + random() * (cfg.markerMax - cfg.markerMin) : void 0;
}
function resolveStrikeTiming(timings, fraction, marker) {
  const successes = timings.filter((t) => t.kind === "perfect" ? fraction >= STRIKE_TIMING_CFG.perfect.start : marker !== void 0 && Math.abs(fraction - marker) <= STRIKE_TIMING_CFG.timed.tolerance);
  return { successes, multiplier: successes.reduce((mult, t) => mult * (1 + (t.bonus ?? STRIKE_TIMING_CFG[t.kind].bonus)), 1) };
}

return {STRIKE_TIMING_CFG,strikeTimingsOf,rollStrikeMarker,resolveStrikeTiming};
}

function groundDevices(w,q,library) {
const pointSegDist = q.pointSegDist;
function deviceTriggerErrors(spec) {
  const issues = [];
  for (const key of ["armTime", "radius"]) {
    const n = spec[key];
    if (n !== void 0 && (!Number.isFinite(n) || n < 0)) issues.push(`${key} must be finite and nonnegative`);
  }
  if (spec.groundOnly !== void 0 && typeof spec.groundOnly !== "boolean") issues.push("groundOnly must be boolean");
  return issues;
}
const DEVICE_CFG = {
  armTime: { trap: 0.5, mine: 0 },
  detonation: { lead: 0.05, stagger: 0.08 }
};
function groundDeviceState(spec, payload, range = 0) {
  const armTime = Math.max(0, spec.armTime ?? DEVICE_CFG.armTime[spec.kind]);
  return {
    kind: spec.kind,
    castInst: payload,
    range: Math.max(0, spec.radius ?? range),
    timer: armTime,
    armingDuration: armTime,
    deviceTrigger: { groundOnly: spec.groundOnly ?? true }
  };
}
function deviceContactEligible(device, prey, airborne) {
  return !device.dead && !prey.dead && !prey.downed && !prey.untargetable && !prey.construct && device.tier === prey.tier && (!(device.construct?.deviceTrigger?.groundOnly ?? true) || !airborne);
}
class DeviceContacts {
  watching = false;
  nextSegment = 0;
  placedAfter = /* @__PURE__ */ new WeakMap();
  paths = /* @__PURE__ */ new Map();
  watch(device) {
    this.watching = true;
    this.placedAfter.set(device, this.nextSegment);
  }
  record(actor, from, to, tier, airborne) {
    if (!this.watching || actor.construct || actor.dead || actor.tier !== tier || from.x === to.x && from.y === to.y) return;
    let path = this.paths.get(actor);
    if (!path) this.paths.set(actor, path = []);
    path.push({ from: { ...from }, to: { ...to }, tier, airborne, sequence: this.nextSegment++ });
  }
  crosses(device, prey) {
    const radius = Math.max(0, device.construct?.range ?? 0) + prey.radius;
    return this.paths.get(prey)?.some((s) => s.sequence >= (this.placedAfter.get(device) ?? 0) && s.tier === device.tier && (!(device.construct?.deviceTrigger?.groundOnly ?? true) || !s.airborne) && pointSegDist(device.pos.x, device.pos.y, s.from.x, s.from.y, s.to.x, s.to.y) <= radius) ?? false;
  }
  finish(active) {
    this.paths.clear();
    this.watching = active;
  }
}

return {deviceTriggerErrors,DEVICE_CFG,groundDeviceState,deviceContactEligible,DeviceContacts};
}

function buffSource(w,q,library) {

function buffWithSource(buff, inst) {
  if (!inst) return buff;
  let source = inst;
  const seen = /* @__PURE__ */ new Set();
  while (!seen.has(source)) {
    seen.add(source);
    const host = source.followUpHost ?? source.invocationHost ?? source.challengeHost ?? source.guardArtsHost ?? source.sequenceHost;
    if (!host || seen.has(host)) break;
    source = host;
  }
  const { id, name, color, icon, tags } = source.def;
  return { ...buff, sourceSkill: { id, name, color, icon, tags: [...tags] } };
}

return {buffWithSource};
}

function projectileArts(w,q,library) {
const angleDiff = q.angleDiff;
const angleTo = q.angleTo;
const dist = q.dist;
const instanceDelivery = q.instanceDelivery;
const instanceMods = q.instanceMods;
const skillContextTags = q.skillContextTags;
const PROJECTILE_ART_LIMITS = q.PROJECTILE_ART_LIMITS;
const projectileArtsLiveLimit = q.projectileArtsLiveLimit;
const projectileArtsCount = q.projectileArtsCount;
const projectileArtsOf = q.projectileArtsOf;
const ailmentWoundBasis = (...args) => w.damage.ailmentWoundBasis(...args);
const STATUS_DEFS = q.STATUS_DEFS;
const sameStory = q.sameStory;
const SATELLITE_CFG = q.SATELLITE_CFG;
class ProjectileArts {
  constructor(w, hit, payBank) {
    this.w = w;
    this.hit = hit;
    this.payBank = payBank;
  }
  states = /* @__PURE__ */ new Set();
  serial = 0;
  state(owner, host) {
    let state = [...this.states].find((s) => s.owner === owner && s.host === host);
    if (!state) {
      state = { owner, host, bonus: 0, pillarAt: 0, retired: false, markKey: `projectile-focus:${++this.serial}` };
      this.states.add(state);
    }
    return state;
  }
  prepare(owner, host, realUse) {
    if (host.projectileRole) return host;
    const spec = projectileArtsOf(host);
    if (!spec) return host;
    const state = this.state(owner, host);
    const cast = { state, spec, bonus: state.bonus, childrenLeft: spec.cascade?.budget ?? 0 };
    if (realUse && spec.ailmentRamp) state.bonus = Math.min(spec.ailmentRamp.max, state.bonus + spec.ailmentRamp.perCast);
    return {
      ...host,
      def: { ...host.def, delivery: instanceDelivery(host), tags: [...skillContextTags(host)] },
      sockets: [...host.sockets],
      grafts: host.grafts && [...host.grafts],
      treeNodes: [...host.treeNodes ?? []],
      projectileHost: host,
      projectileRole: "primary",
      projectileSpec: spec,
      projectileCast: cast
    };
  }
  count(owner, inst) {
    return projectileArtsCount(owner, inst);
  }
  limit(inst) {
    return projectileArtsLiveLimit(inst);
  }
  configure(p) {
    const spec = projectileArtsOf(p.inst), orbit = spec?.orbit;
    if (!orbit || p.parryDamage) return;
    const tags = skillContextTags(p.inst), extra = instanceMods(p.inst);
    const radius = p.caster.radius + orbit.radius * (spec.satellite ? p.caster.sheet.get("satelliteOrbit", tags, extra) : 1);
    const turn = orbit.turnSpeed * p.caster.sheet.get("orbitPower", tags, extra, 1) * (spec.satellite ? p.caster.sheet.get("satelliteSpeed", tags, extra) : 1);
    p.orbit = 1;
    p.pierce = Infinity;
    p.orbRadius = p.orbitR0 = radius;
    p.skillVisualId = orbit.visual;
    const stagger = (p.angle / (Math.PI * 2) % 1 + 1) % 1;
    p.projectileOrbit = {
      turn,
      radius,
      phase: p.angle,
      offset: { x: 0, y: 0 },
      heading: p.dir,
      emitAt: (spec.emit?.interval ?? Infinity) * (1 + stagger),
      novaAt: (spec.nova?.interval ?? Infinity) * (1 + stagger),
      team: p.caster.team,
      path: []
    };
    p.pos = { x: p.caster.pos.x + Math.cos(p.angle) * radius, y: p.caster.pos.y + Math.sin(p.angle) * radius };
    p.anchor = { ...p.caster.pos };
    const cap = projectileArtsLiveLimit(p.inst);
    const siblings = this.w.projectiles.filter((q) => q !== p && q.caster === p.caster && q.inst.projectileHost === p.inst.projectileHost && q.projectileOrbit && !q.dissolved);
    for (const old of siblings.slice(0, Math.max(0, siblings.length + 1 - cap))) old.dissolved = true;
  }
  valid(p) {
    const cast = p.inst.projectileCast;
    if (cast?.state.retired) return false;
    if (!p.projectileOrbit) return true;
    return !p.caster.dead && !p.caster.downed && !p.caster.untargetable && sameStory(p, p.caster) && p.caster.team === p.projectileOrbit.team;
  }
  nearest(p, at, radius) {
    let best, distance = radius;
    for (const enemy of this.w.enemiesOf(p.caster, p.tier ?? 0)) {
      const d = dist(at, enemy.pos);
      if (d > distance || !this.w.lineOfFire(at, enemy.pos, p.tier)) continue;
      if (d === distance && best && best.id < enemy.id) continue;
      best = enemy;
      distance = d;
    }
    return best;
  }
  move(p, dt) {
    const orbit = p.projectileOrbit;
    if (!orbit) return void 0;
    const spec = projectileArtsOf(p.inst);
    if (!spec) return void 0;
    const oldAngle = p.angle, oldOffset = { ...orbit.offset }, oldAnchor = { ...p.anchor };
    const growth = Math.log1p(spec.orbitGrowth ?? 0);
    const before = p.age - dt, cap = PROJECTILE_ART_LIMITS.maxOrbitSpeed;
    const integral = (t) => {
      if (!growth) return Math.min(cap, orbit.turn) * t;
      const atCap = orbit.turn > 0 ? Math.max(0, Math.log(cap / orbit.turn) / growth) : Infinity;
      const ramp = Math.min(t, atCap);
      return orbit.turn / growth * Math.expm1(growth * ramp) + Math.max(0, t - atCap) * cap;
    };
    const phaseAt = (t) => oldAngle + integral(before + dt * t) - integral(before);
    p.angle = phaseAt(1);
    const home = {
      x: p.caster.pos.x + Math.cos(p.angle) * orbit.radius,
      y: p.caster.pos.y + Math.sin(p.angle) * orbit.radius
    };
    const roam = spec.wander;
    if (roam) {
      const prey = this.nearest(p, home, roam.leash);
      const desired = prey ? { x: prey.pos.x - home.x, y: prey.pos.y - home.y } : { x: 0, y: 0 };
      const delta = angleDiff(orbit.heading, angleTo(orbit.offset, desired));
      orbit.heading += Math.max(-roam.turnSpeed * dt, Math.min(roam.turnSpeed * dt, delta));
      orbit.heading += Math.sin(p.age * 7 + orbit.phase * 3) * roam.jitter * dt;
      const step = Math.min(roam.speed * dt, dist(orbit.offset, desired));
      orbit.offset.x += Math.cos(orbit.heading) * step;
      orbit.offset.y += Math.sin(orbit.heading) * step;
      const length = Math.hypot(orbit.offset.x, orbit.offset.y);
      if (length > roam.leash) {
        orbit.offset.x *= roam.leash / length;
        orbit.offset.y *= roam.leash / length;
      }
    }
    const final = { x: home.x + orbit.offset.x, y: home.y + orbit.offset.y };
    const travel = Math.abs(p.angle - oldAngle) * orbit.radius + dist(oldAnchor, p.caster.pos) + dist(oldOffset, orbit.offset);
    orbit.path = [];
    orbit.hitAt = void 0;
    if (dist(oldAnchor, p.caster.pos) > SATELLITE_CFG.maxSweepDistance) orbit.path.push(final);
    else {
      const count = Math.min(SATELLITE_CFG.maxSweepSteps, Math.max(1, Math.ceil(travel / SATELLITE_CFG.sweepSpacing)));
      for (let i = 0; i <= count; i++) {
        const t = i / count, angle = phaseAt(t);
        orbit.path.push({
          x: oldAnchor.x + (p.caster.pos.x - oldAnchor.x) * t + Math.cos(angle) * orbit.radius + oldOffset.x + (orbit.offset.x - oldOffset.x) * t,
          y: oldAnchor.y + (p.caster.pos.y - oldAnchor.y) * t + Math.sin(angle) * orbit.radius + oldOffset.y + (orbit.offset.y - oldOffset.y) * t
        });
      }
    }
    p.anchor = { ...p.caster.pos };
    return final;
  }
  touches(p, x, y, radius) {
    const orbit = p.projectileOrbit;
    if (!orbit) return false;
    for (const point of orbit.path) {
      if (Math.hypot(point.x - x, point.y - y) > p.radius + radius) continue;
      if (!this.w.lineOfFire(p.caster.pos, point, p.tier) || !this.w.lineOfFire(point, { x, y }, p.tier)) continue;
      orbit.hitAt = point;
      return true;
    }
    return false;
  }
  impact(p) {
    return p.projectileOrbit?.hitAt ?? p.pos;
  }
  payload(inst, delivery) {
    return {
      ...inst,
      def: { ...inst.def, delivery },
      projectileRole: "payload",
      projectileContact: void 0,
      procChainDepth: Math.max(1, inst.procChainDepth ?? 0)
    };
  }
  burst(p, radius, power, fx) {
    const inst = this.payload(p.inst, { type: "nova", radius });
    radius *= p.caster.sheet.get("aoeRadius", skillContextTags(inst), instanceMods(inst));
    this.w.flashes.push({
      pos: { ...p.pos },
      radius,
      color: p.color,
      life: 0.35,
      maxLife: 0.35,
      fx,
      recoveryCueTier: p.tier
    });
    for (const enemy of this.w.enemiesOf(p.caster, p.tier ?? 0)) {
      if (dist(p.pos, enemy.pos) - enemy.radius > radius || !this.w.lineOfFire(p.pos, enemy.pos, p.tier)) continue;
      this.hit(p.caster, inst, enemy, p.mult * power, p.pos, p.tier ?? 0);
    }
  }
  standard(p, radius) {
    const host = p.inst.projectileHost ?? p.inst;
    const base = host.def.delivery;
    return this.payload(p.inst, { ...base, ...radius === void 0 ? {} : { radius } });
  }
  tick(p) {
    const orbit = p.projectileOrbit;
    if (!orbit) return;
    const spec = projectileArtsOf(p.inst);
    if (!spec || !this.w.lineOfFire(p.caster.pos, p.pos, p.tier)) return;
    if (spec.emit && p.age >= orbit.emitAt) {
      orbit.emitAt += spec.emit.interval;
      const enemy = this.nearest(p, p.pos, spec.emit.range);
      if (enemy) this.w.spawnProjectile(
        p.caster,
        this.standard(p, spec.emit.radius),
        { ...p.pos },
        angleTo(p.pos, enemy.pos),
        { tier: p.tier, mult: p.mult * spec.emit.power, depth: p.depth + 1 }
      );
    }
    if (spec.nova && p.age >= orbit.novaAt) {
      orbit.novaAt += spec.nova.interval;
      this.burst(p, spec.nova.radius, spec.nova.power, spec.nova.fx);
    }
  }
  expire(p) {
    if (!p.projectileOrbit) return;
    const spec = projectileArtsOf(p.inst);
    if (!spec || p.dissolved || !p.projectileOrbit || !this.valid(p) || p.maxAge === void 0 || p.age < p.maxAge || !this.w.lineOfFire(p.caster.pos, p.pos, p.tier)) return;
    if (spec.expireBurst) this.burst(p, spec.expireBurst.radius, spec.expireBurst.power, spec.expireBurst.fx);
    if (spec.release) this.w.spawnProjectile(
      p.caster,
      this.standard(p),
      { ...p.pos },
      angleTo(p.caster.pos, p.pos),
      { tier: p.tier, mult: p.mult, depth: p.depth + 1 }
    );
  }
  bounce(p) {
    const flight = p.inst.projectileSpec?.flight;
    if (flight) p.mult *= 1 + flight.bounceMore;
  }
  contact(p) {
    if (!p.inst.projectileCast) return p.inst;
    return { ...p.inst, projectileContact: { direction: p.dir, depth: p.depth, hits: [...p.hits.keys()], power: p.mult } };
  }
  chance(inst, id) {
    return inst.projectileCast?.spec.ailmentRamp?.status === id ? inst.projectileCast.bonus : 0;
  }
  basis(caster, inst, target, packet, dealt, id) {
    const spec = inst.projectileCast?.spec.whiteHeat ?? projectileArtsOf(inst)?.whiteHeat;
    if (spec?.status !== id || dealt <= 0) return dealt;
    const extra = instanceMods(inst);
    const ordinary = ailmentWoundBasis(target, packet.amounts, caster, packet.tags, extra);
    const neutral = ailmentWoundBasis(target, packet.amounts, caster, packet.tags, extra, spec.element);
    return ordinary > 0 ? dealt * neutral / ordinary : dealt;
  }
  applied(inst, target, id, before) {
    const cast = inst.projectileCast;
    if (!cast || cast.state.retired) return;
    const after = target.statuses.find((s) => s.id === id && !s.sourceKey && !s.challengeField);
    if (!after || after === before?.status && after.dps === before.dps && after.remaining === before.remaining) return;
    if (cast.spec.ailmentRamp?.status === id) cast.state.bonus = 0;
    const white = cast.spec.whiteHeat;
    if (white?.status === id) after.visual = white.visual;
  }
  /** Runs before this hit applies fresh ailments: an unignited victim cannot
   * trigger an "already ignited" reward from the very same blow. */
  landed(caster, inst, target, dealt, depth, mult) {
    const cast = inst.projectileCast;
    if (!cast || cast.state.retired || depth > 0 || dealt <= 0) return;
    const spec = projectileArtsOf(inst);
    if (!spec) return;
    const state = cast.state, tags = skillContextTags(inst), extra = instanceMods(inst);
    const area = caster.sheet.get("aoeRadius", tags, extra);
    if (spec.pillar && target.statuses.some((s) => s.id === spec.pillar.status && s.remaining > 0) && this.w.time >= state.pillarAt) {
      const s = spec.pillar;
      state.pillarAt = this.w.time + s.cooldown;
      const payload = this.payload(inst, {
        type: "ground",
        radius: s.radius,
        castRange: 0,
        lingerDuration: s.duration,
        tickInterval: s.interval
      });
      this.w.zones.push({
        pos: { ...target.pos },
        tier: target.tier,
        radius: s.radius * area,
        caster,
        inst: payload,
        color: inst.def.color,
        delay: 0,
        exploded: true,
        linger: s.duration * caster.sheet.get("effectDuration", tags, extra),
        tickInterval: s.interval,
        tickTimer: 0,
        shape: 0,
        facing: 0,
        dmgMult: s.power * mult,
        depth: 1,
        skillVisualId: s.visual,
        fieldCue: { form: s.fx }
      });
    }
    if (spec.rupture) {
      const s = spec.rupture, wounds = target.statuses.filter((x) => x.id === s.status && x.remaining > 0 && x.dps > 0);
      const paid = wounds.reduce((n, wound) => n + wound.dps * wound.stacks * wound.remaining * s.fraction, 0);
      if (paid > 0) {
        for (const wound of wounds) wound.dps *= 1 - s.fraction;
        const radius = s.radius * area, type = STATUS_DEFS[s.status]?.dotType;
        this.w.flashes.push({
          pos: { ...target.pos },
          radius,
          color: inst.def.color,
          life: 0.25,
          maxLife: 0.25,
          recoveryCueTier: target.tier,
          fx: s.fx
        });
        for (const enemy of this.w.enemiesOf(caster, target.tier)) {
          if (dist(target.pos, enemy.pos) - enemy.radius > radius || !this.w.lineOfFire(target.pos, enemy.pos, target.tier)) continue;
          this.payBank(caster, enemy, paid, type);
          if (enemy.life <= 0 && !enemy.dead && enemy !== target) this.w.kill(enemy, false, caster);
        }
      }
    }
    if (spec.attract && !target.dead && target.life > 0) {
      const current = state.focus?.target;
      const stronger = !current || current.dead || target.maxLife() > current.maxLife() || target.maxLife() === current.maxLife() && target.id < current.id;
      if (stronger || current === target) {
        if (current && current !== target) this.unmark(state);
        state.focus = { target, inst, left: spec.attract.duration * caster.sheet.get("effectDuration", tags, extra), timer: 0 };
        target.applyStatus(spec.attract.mark, 0, state.focus.left / STATUS_DEFS[spec.attract.mark].duration, caster.name, { casterId: caster.id, sourceKey: state.markKey });
      }
    }
    const split = spec.cascade, contact = inst.projectileContact;
    if (split && contact && contact.depth < split.maxDepth && cast.childrenLeft > 0) {
      for (let n = 0; n < split.count && cast.childrenLeft > 0; n++) {
        cast.childrenLeft--;
        const dir = contact.direction + (split.count === 1 ? 0 : n / (split.count - 1) - 0.5) * split.spreadDeg * Math.PI / 180;
        const at = {
          x: target.pos.x + Math.cos(contact.direction) * (target.radius + 2),
          y: target.pos.y + Math.sin(contact.direction) * (target.radius + 2)
        };
        const child = { ...inst, projectileContact: void 0 };
        this.w.spawnProjectile(caster, child, at, dir, { tier: target.tier, depth: contact.depth + 1, mult: contact.power * split.power });
        const shot = this.w.projectiles[this.w.projectiles.length - 1];
        for (const id of contact.hits) shot.hits.set(id, Infinity);
        shot.hits.set(target.id, Infinity);
      }
    }
  }
  update(dt) {
    for (const state of this.states) {
      if (state.owner.dead || !this.w.actors.includes(state.owner)) {
        if (projectileArtsOf(state.host)?.orbit) this.clear(state.owner, state.host);
        else {
          this.unmark(state);
          this.states.delete(state);
        }
        continue;
      }
      const focus = state.focus, spec = focus && projectileArtsOf(focus.inst)?.attract;
      if (!focus || !spec) continue;
      const delta = dt * this.w.timeflow.actorScale(state.owner);
      focus.left -= delta;
      focus.timer -= delta;
      if (focus.left <= 0 || focus.target.dead || !sameStory(state.owner, focus.target) || !this.w.enemiesOf(state.owner).includes(focus.target)) {
        this.unmark(state);
        state.focus = void 0;
        continue;
      }
      if (focus.timer > 0) continue;
      focus.timer = spec.interval;
      const radius = spec.radius * state.owner.sheet.get("aoeRadius", skillContextTags(focus.inst), instanceMods(focus.inst));
      let slots = spec.maxWounds - focus.target.statuses.filter((s) => s.gathered).length;
      for (const enemy of this.w.enemiesOf(state.owner, focus.target.tier)) {
        if (enemy === focus.target || dist(enemy.pos, focus.target.pos) > radius || !this.w.lineOfFire(enemy.pos, focus.target.pos, focus.target.tier)) continue;
        for (const wound of [...enemy.statuses]) {
          if (slots <= 0 || wound.id !== spec.status || wound.gathered || wound.remaining <= 0 || wound.dps <= 0) continue;
          if (focus.target.sheet.get("debuffImmunity") > 0) continue;
          const i = enemy.statuses.indexOf(wound);
          if (i < 0) continue;
          enemy.statuses.splice(i, 1);
          focus.target.statuses.push({ ...wound, gathered: true, sourceKey: `gathered:${++this.serial}` });
          if (!enemy.statuses.some((s) => s.id === wound.id)) enemy.sheet.removeSource("status:" + wound.id);
          slots--;
          this.w.flashes.push({
            pos: { ...enemy.pos },
            radius: dist(enemy.pos, focus.target.pos),
            facing: angleTo(enemy.pos, focus.target.pos),
            color: wound.visual ? "#fff2d0" : "#ff7a2a",
            fx: spec.fx,
            recoveryCueTier: enemy.tier,
            life: 0.25,
            maxLife: 0.25
          });
        }
      }
    }
  }
  unmark(state) {
    const target = state.focus?.target;
    if (target) target.statuses = target.statuses.filter((s) => s.sourceKey !== state.markKey);
  }
  clear(owner, host) {
    for (const state of this.states) if (state.owner === owner && state.host === host) {
      state.retired = true;
      this.unmark(state);
      this.states.delete(state);
    }
  }
  clearAll() {
    for (const s of [...this.states]) this.clear(s.owner, s.host);
  }
}

return {ProjectileArts};
}

function summonArts(w,q,library) {
const dist = q.dist;
const mod = q.mod;
const instanceDelivery = q.instanceDelivery;
const instanceEffects = q.instanceEffects;
const instanceTargeting = q.instanceTargeting;
const instanceMods = q.instanceMods;
const makeSkillInstance = q.makeSkillInstance;
const skillContextTags = q.skillContextTags;
const summonSchoolSkill = q.summonSchoolSkill;
const empoweredSkill = library.empoweredSkill;
const summonArtIds = q.summonArtIds;
const SKILLS = q.SKILLS;
function summonArtsOf(inst) {
  if (!inst || inst.def.delivery.type !== "summon") return;
  const d = instanceDelivery(inst);
  return d.type === "summon" ? d.arts : void 0;
}
function echoableSpell(inst, spec) {
  const tags = skillContextTags(inst), delivery = instanceDelivery(inst), target = instanceTargeting(inst);
  return spec.requireTags.every((t) => tags.has(t)) && !spec.excludeTags.some((t) => tags.has(t)) && spec.deliveries.includes(delivery.type) && (!target || spec.targets.includes(target.target)) && instanceEffects(inst).some((f) => f.type === "damage") && !inst.summonArtCast;
}
class SummonArts {
  constructor(world, spawn, forward, activate, retire) {
    this.world = world;
    this.spawn = spawn;
    this.forward = forward;
    this.activate = activate;
    this.retire = retire;
  }
  members(owner, host) {
    return this.world.actors.filter((a) => !a.dead && a.owner === owner && a.summonInst === host);
  }
  body(owner, host) {
    return this.members(owner, host).find((a) => !a.summonArtAnchor);
  }
  contract(owner, host) {
    let c = owner.summonArtContracts.get(host);
    if (!c) {
      c = { recovery: 0, souls: [] };
      owner.summonArtContracts.set(host, c);
    }
    return c;
  }
  canSpawn(owner, host, d) {
    return !d.arts?.single || !(owner.remoteSummonArts?.[host.def.id]?.held || this.members(owner, host).length);
  }
  choose(owner, host, d) {
    if (!d.arts?.balanceSchools || !d.pool?.length) return;
    const bodies = this.members(owner, host);
    const contract = this.contract(owner, host), pool = [...d.pool].sort((a, b) => a.id.localeCompare(b.id));
    const last = pool.findIndex((row) => row.id === contract.lastSchool);
    let selected = pool[0], least = Infinity;
    for (let offset = 1; offset <= pool.length; offset++) {
      const row = pool[(last + offset) % pool.length], count = bodies.filter((m) => m.defId === row.id).length;
      if (count < least) {
        selected = row;
        least = count;
      }
    }
    contract.lastSchool = selected.id;
    return selected.id;
  }
  init(body, host) {
    const a = summonArtsOf(host);
    if (!a || !body.owner) return;
    this.contract(body.owner, host);
    const kit = summonArtIds(instanceDelivery(host), body.defId).filter((id) => !body.skills.some((s) => s?.def.id === id)).flatMap((id) => SKILLS[id] ? [makeSkillInstance(summonSchoolSkill(instanceDelivery(host), body.defId, SKILLS[id]), host.level + (host.bonusLevels ?? 0))] : []);
    this.forward(host, kit);
    body.summonArtState = {
      kit,
      relayReady: 0,
      echoReady: 0,
      flareReady: 0,
      siphonCredit: (a.siphon?.perSecond ?? 0) * body.maxLife()
    };
    const rite = a.rite ? this.skill(body, a.rite) : void 0;
    if (rite && a.riteRecovery) rite.extraMods = [...rite.extraMods ?? [], mod("cooldownRecovery", "increased", a.riteRecovery)];
    if (a.capacityPower) {
      const d = instanceDelivery(host), p = a.capacityPower;
      const slots = body.owner.sheet.get("minionMaxCount", skillContextTags(host), instanceMods(host), d.maxActive);
      const power = Math.min(p.maximum, Math.max(0, slots - p.base) * p.perSlot);
      body.sheet.setSource("summonArts:capacity", [mod("damage", "more", power)]);
    }
  }
  resync(host) {
    for (const b of this.world.actors) if (!b.dead && b.summonInst === host && b.summonArtState) {
      for (const s of b.summonArtState.kit) s.sockets = s.sockets.filter((x) => !x?.forwarded);
      this.forward(host, b.summonArtState.kit);
    }
  }
  crew(host, crew) {
    const echo = summonArtsOf(host)?.echo;
    if (!echo || crew === "unknowable") return crew;
    const owner = this.world.actors.find((a) => a.skills.includes(host));
    const echoes = owner?.skills.filter((s) => !!s && echoableSpell(s, echo)).map((s) => ({
      ...s.def,
      tags: [...skillContextTags(s)],
      delivery: instanceDelivery(s),
      effects: instanceEffects(s),
      targeting: instanceTargeting(s)
    })) ?? [];
    return [...crew ?? [], ...echoes];
  }
  presentation(owner) {
    if (!owner.summonArtContracts.size) return;
    const rows = {};
    for (const [host, contract] of owner.summonArtContracts) {
      const a = summonArtsOf(host);
      if (!a?.command) continue;
      const body = this.body(owner, host), held = !!body || !!contract.anchor && !contract.anchor.dead;
      if (held) rows[host.def.id] = { command: body ? a.command : void 0, ready: !!body && this.commandReady(owner, host), held };
    }
    return Object.keys(rows).length ? rows : void 0;
  }
  commandView(owner, host) {
    const a = summonArtsOf(host);
    if (!a?.command || !this.body(owner, host) && owner.remoteSummonArts?.[host.def.id]?.command !== a.command || !SKILLS[a.command]) return;
    const command = makeSkillInstance(SKILLS[a.command], host.level + (host.bonusLevels ?? 0));
    command.summonCommandHost = host;
    command.hostSkillId = host.def.id;
    return command;
  }
  commandReady(owner, host) {
    const remote = owner.remoteSummonArts?.[host.def.id];
    if (remote) return remote.ready;
    const body = this.body(owner, host), a = summonArtsOf(host);
    const rite = body && a?.rite ? this.skill(body, a.rite) : void 0;
    return !!body && !!a?.rite && !!rite && !body.isStunned() && !body.downed && !body.tagsForbidden(rite) && (body.cooldowns.get(a.rite) ?? 0) <= 0 && body.casting?.inst.def.id !== a.rite;
  }
  skill(body, id) {
    return body.skills.find((s) => s?.def.id === id) ?? body.summonArtState?.kit.find((s) => s.def.id === id);
  }
  payload(body, id, at, role, power = 1, delay = 0) {
    const base = this.skill(body, id);
    if (!base) return;
    let inst = empoweredSkill(base, power, 1);
    const d = instanceDelivery(inst);
    if (delay && d.type === "ground") inst = { ...inst, def: { ...inst.def, delivery: { ...d, delay } } };
    inst.summonArtCast = { role };
    this.world.executeSkill(body, inst, at, { noRepeat: true, componentUse: true, noCooldown: true, noFollowUp: true });
    return inst;
  }
  prepare(body, inst, real) {
    if (!real || !body.summonArtState || inst.summonArtCast && inst.summonArtCast.role !== "native") return inst;
    const a = summonArtsOf(body.summonInst);
    let power = 1;
    if (a?.rite === inst.def.id && inst.summonArtCast?.commanded && body.owner && body.summonInst) {
      const c = this.contract(body.owner, body.summonInst);
      power += c.souls.length * (a.reconstruction?.soulPower ?? 0);
      c.souls = [];
    }
    const captured = power === 1 ? { ...inst } : empoweredSkill(inst, power, 1);
    captured.summonArtCast = { role: "native", origin: inst.def.id, power };
    return captured;
  }
  completed(caster, inst, aim) {
    const commandHost = inst.summonCommandHost;
    if (commandHost) {
      const b = this.body(caster, commandHost), a2 = summonArtsOf(commandHost);
      if (b && a2?.rite && this.commandReady(caster, commandHost)) {
        const rite = this.skill(b, a2.rite);
        if (rite) {
          b.casting = null;
          b.useLock = 0;
          this.world.useSkill(b, { ...rite, summonArtCast: { role: "native", commanded: true } }, aim);
        }
      }
      return;
    }
    const host = caster.summonInst, a = summonArtsOf(host), state = caster.summonArtState;
    if (a?.rite === inst.def.id && state && inst.summonArtCast?.role === "native") {
      if (a.detonation && state.ritual) this.payload(caster, a.detonation, state.ritual.pos, "rupture");
      this.clearFields(caster, "ritual");
      const zone = this.world.zones.find((z) => z.caster === caster && z.inst === inst);
      if (!zone) return;
      const at = zone.pos, d = instanceDelivery(inst);
      const delay = d.type === "ground" ? d.delay ?? 0 : 0;
      const power = inst.summonArtCast.power ?? 1;
      let duration = 0, radius = zone.radius;
      for (const id of [a.field, a.frost, a.blizzard]) {
        if (!id) continue;
        const payload = this.payload(caster, id, at, "field", power, delay);
        if (!payload) continue;
        payload.summonArtCast.field = "ritual";
        for (const z of this.world.zones) if (z.inst === payload) {
          duration = Math.max(duration, z.linger + z.delay);
          radius = Math.max(radius, z.radius);
        }
      }
      state.ritual = duration > 0 ? { pos: { ...at }, radius, remaining: duration, readyAt: this.world.time + delay, power } : void 0;
      this.syncCommand(caster);
    }
    if (inst.summonArtCast || caster.owner || !caster.summonArtContracts.size) return;
    for (const lich of this.world.actors) {
      const art = summonArtsOf(lich.summonInst), s = lich.summonArtState;
      if (lich.dead || lich.owner !== caster || !art?.echo || !s || s.echoReady > 0 || lich.isStunned() || lich.tagsForbidden(inst) || !echoableSpell(inst, art.echo)) continue;
      const copy = {
        ...inst,
        state: void 0,
        sockets: [...inst.sockets],
        grafts: inst.grafts ? [...inst.grafts] : void 0,
        summonArtCast: { role: "echo" },
        summonCommandHost: void 0,
        projectileHost: void 0,
        projectileRole: void 0,
        projectileSpec: void 0,
        projectileCast: void 0,
        projectileContact: void 0,
        sequenceHost: void 0,
        sequenceRole: void 0,
        challengeHost: void 0,
        followUpHost: void 0,
        invocationHost: void 0,
        guardArtsHost: void 0
      };
      this.forward(lich.summonInst, [copy]);
      const source = inst.projectileHost ?? inst.sequenceHost ?? inst.challengeHost ?? inst.followUpHost ?? inst.invocationHost ?? inst.guardArtsHost ?? caster.skills.find((skill) => skill?.def.id === inst.def.id) ?? inst;
      const copies = s.echoes ??= /* @__PURE__ */ new Map();
      let echo = copies.get(source);
      const powered = empoweredSkill(copy, art.echo.power, 1);
      if (!echo) {
        echo = powered;
        copies.set(source, echo);
      } else {
        const runtime = echo.state;
        Object.assign(echo, powered);
        echo.state = runtime;
      }
      const targetInfo = instanceTargeting(echo) ? this.world.resolveTargeting(lich, echo, aim) : void 0;
      if (targetInfo === null) continue;
      s.echoReady = art.echo.cooldown;
      this.world.executeSkill(
        lich,
        echo,
        aim,
        { targetInfo, noRepeat: true, componentUse: true, noCooldown: true, noFollowUp: true }
      );
    }
  }
  syncCommand(body) {
    const a = summonArtsOf(body.summonInst), owner = body.owner;
    if (!owner || !a?.command || !a.rite) return;
    const left = body.cooldowns.get(a.rite) ?? 0;
    if (left > 0) {
      owner.cooldowns.set(a.command, left);
      owner.cooldownTotals.set(a.command, body.cooldownTotals.get(a.rite) ?? left);
    } else owner.cooldowns.delete(a.command);
  }
  signature(body, skillId) {
    const a = summonArtsOf(body.summonInst);
    return !!a?.lessons && !!body.summonArtState && a.schools?.find((s) => s.monster === body.defId)?.signature === skillId;
  }
  statusSource(body, inst) {
    const origin = inst.summonArtCast?.origin;
    return inst.summonArtCast?.role === "native" && origin && this.signature(body, origin) ? { skillId: origin, sourceKey: "summonArt:" + body.id + ":" + origin } : {};
  }
  hit(body, inst, target, damage) {
    if (!body.summonArtState || !inst.summonArtCast) return;
    const host = body.summonInst, a = summonArtsOf(host), s = body.summonArtState, use = inst.summonArtCast;
    if (damage <= 0 || !host || !body.owner || !a || !s || !use || use.role !== "native") return;
    const origin = use.origin ?? inst.def.id;
    if (this.signature(body, origin)) {
      this.siphon(body, damage);
      const school = a.schools?.find((x) => x.monster === body.defId);
      if (a.traces && school && !use.traced) {
        use.traced = true;
        this.clearFields(body, "script");
        const field = this.payload(body, school.trace, target.pos, "field");
        if (field) field.summonArtCast.field = "script";
      }
    }
    if (origin !== body.skills[0]?.def.id) return;
    if (a.flare && s.ritual && s.ritual.readyAt <= this.world.time && s.flareReady <= 0 && dist(target.pos, s.ritual.pos) <= s.ritual.radius + target.radius) {
      s.flareReady = a.flareCooldown ?? 0.5;
      this.payload(body, a.flare, target.pos, "flare", s.ritual.power);
    }
    if (!a.relay || use.replied || target.dead || target.life <= 0) return;
    use.replied = true;
    const recipient = this.members(body.owner, host).filter((m) => m !== body && !m.summonArtAnchor && m.summonArtState && m.summonArtState.relayReady <= 0 && !m.isStunned() && !m.downed && m.skills[0] && !m.tagsForbidden(m.skills[0]) && dist(m.pos, body.pos) <= a.relay.range && m.tier === body.tier).sort((x, y) => dist(x.pos, body.pos) - dist(y.pos, body.pos) || x.id - y.id)[0];
    if (!recipient) return;
    recipient.summonArtState.relayReady = a.relay.cooldown;
    this.payload(recipient, recipient.skills[0].def.id, target.pos, "relay", a.relay.power);
    const from = a.schools?.find((x) => x.monster === body.defId), to = a.schools?.find((x) => x.monster === recipient.defId);
    if (from?.id === to?.id && a.concordance) {
      for (const m of [body, recipient]) m.absorbLayers.set("summonArts:concordance", {
        amount: m.maxLife() * a.concordance.fraction,
        remaining: a.concordance.duration,
        source: inst,
        ended: () => {
        }
      });
    } else if (from && to && a.discordance) {
      const base = this.skill(body, a.discordance);
      if (base) {
        const burst = {
          ...base,
          def: {
            ...base.def,
            tags: ["spell", "aoe", from.id, to.id],
            baseDamage: { [from.id]: Object.values(base.def.baseDamage ?? {})[0], [to.id]: Object.values(base.def.baseDamage ?? {})[0] }
          },
          sockets: [],
          summonArtCast: { role: "relay" }
        };
        this.forward(host, [burst]);
        this.world.executeSkill(body, burst, target.pos, { noRepeat: true, componentUse: true, noCooldown: true, noFollowUp: true });
      }
    }
  }
  siphon(body, damage) {
    const a = summonArtsOf(body.summonInst), s = body.summonArtState;
    if (!a?.siphon || !s || body.dead || !body.owner || !body.summonInst || damage <= 0) return;
    const ally = this.members(body.owner, body.summonInst).filter((m) => m.summonArtState && !m.summonArtAnchor && dist(m.pos, body.pos) <= a.siphon.range && m.tier === body.tier && m.life < m.maxLife()).sort((x, y) => x.life / x.maxLife() - y.life / y.maxLife() || x.id - y.id)[0];
    if (!ally) return;
    const amount = Math.min(s.siphonCredit, damage * a.siphon.ratio);
    if (amount > 0) s.siphonCredit = Math.max(0, s.siphonCredit - ally.healBy(amount));
  }
  death(body, silent, expired) {
    if (silent || expired) return;
    const owner = body.owner;
    if (!owner || owner.dead) return;
    for (const [host2, c2] of owner.summonArtContracts) {
      const a2 = summonArtsOf(host2), r2 = a2?.reconstruction;
      if (!r2 || body.summonInst === host2 || body.summonArtAnchor || body.construct) continue;
      const center = this.body(owner, host2) ?? c2.anchor;
      if (center && !center.dead && dist(center.pos, body.pos) <= r2.soulRange && center.tier === body.tier) {
        c2.souls = [...c2.souls, r2.soulDuration].slice(-r2.soulCap);
      }
    }
    const host = body.summonInst, a = summonArtsOf(host), r = a?.reconstruction;
    if (!host || !r || body.summonArtAnchor) return;
    const c = this.contract(owner, host);
    if (c.recovery > 0 || c.anchor || !owner.skills.includes(host)) return;
    c.recovery = r.recovery;
    c.rebuilding = Math.max(0, r.delay - c.souls.length * r.soulRecovery);
    c.souls = [];
    const anchor = this.world.createMonster(r.monster, body.level, body.team, owner);
    anchor.summonArtAnchor = true;
    anchor.summonInst = host;
    anchor.sourceSkillId = host.def.id;
    anchor.noBounty = true;
    anchor.pos = { ...body.pos };
    anchor.tier = body.tier;
    anchor.sheet.setSource("summonArts:anchor", [mod("life", "override", body.maxLife() * r.life)]);
    anchor.fillResources();
    anchor.skills = body.skills.filter((s) => s?.def.delivery.type === "aura");
    this.world.actors.push(anchor);
    for (const aura of anchor.skills) if (aura) this.activate(anchor, aura);
    c.anchor = anchor;
  }
  clearFields(body, kind) {
    this.world.zones = this.world.zones.filter((z) => !(z.caster === body && z.inst.summonArtCast?.field === kind));
  }
  update(dt) {
    for (const owner of [...this.world.actors]) {
      for (const [host, c] of [...owner.summonArtContracts]) {
        if (owner.dead || owner.downed || !owner.skills.includes(host) || !summonArtsOf(host)) {
          this.clear(owner, host);
          continue;
        }
        c.recovery = Math.max(0, c.recovery - dt);
        c.souls = c.souls.map((t) => t - dt).filter((t) => t > 0);
        if (c.anchor?.dead) {
          c.anchor = void 0;
          c.rebuilding = void 0;
        }
        if (c.anchor && c.rebuilding !== void 0) {
          c.rebuilding -= dt;
          if (c.rebuilding <= 0) {
            const at = { ...c.anchor.pos };
            this.world.kill(c.anchor, true);
            c.anchor = void 0;
            c.rebuilding = void 0;
            this.spawn(owner, host, at);
          }
        }
      }
      const s = owner.summonArtState, a = summonArtsOf(owner.summonInst);
      if (!s || !a || owner.dead) continue;
      s.relayReady = Math.max(0, s.relayReady - dt);
      s.echoReady = Math.max(0, s.echoReady - dt);
      s.flareReady = Math.max(0, s.flareReady - dt);
      if (a.siphon) s.siphonCredit = Math.min(
        owner.maxLife() * a.siphon.perSecond,
        s.siphonCredit + dt * owner.maxLife() * a.siphon.perSecond
      );
      if (s.ritual && (s.ritual.remaining -= dt) <= 0) s.ritual = void 0;
      this.syncCommand(owner);
    }
  }
  /** Mobile minions keep their identity and recovery when crossing zones; sites stay behind. */
  leaveZone() {
    for (const actor of this.world.actors) {
      if (actor.summonArtState) actor.summonArtState.ritual = void 0;
      for (const c of actor.summonArtContracts.values()) if (c.anchor) {
        if (!c.anchor.dead) this.world.kill(c.anchor, true);
        c.anchor = void 0;
        c.rebuilding = void 0;
      }
    }
  }
  clear(owner, host) {
    if (owner && host) for (const body of this.world.actors) {
      const copies = body.owner === owner ? body.summonArtState?.echoes : void 0, echo = copies?.get(host);
      if (echo) {
        copies.delete(host);
        this.retire(body, echo);
      }
    }
    for (const keeper of this.world.actors) {
      if (owner && keeper !== owner) continue;
      for (const [inst, c] of [...keeper.summonArtContracts]) {
        if (host && host !== inst) continue;
        keeper.summonArtContracts.delete(inst);
        if (c.anchor && !c.anchor.dead) this.world.kill(c.anchor, true);
        for (const m of this.members(keeper, inst)) {
          this.clearFields(m, "ritual");
          this.clearFields(m, "script");
          m.summonArtState = void 0;
          m.absorbLayers.delete("summonArts:concordance");
          this.world.kill(m, true);
        }
        const command = summonArtsOf(inst)?.command;
        if (command) {
          keeper.cooldowns.delete(command);
          keeper.cooldownTotals.delete(command);
        }
      }
    }
  }
}

return {summonArtsOf,echoableSpell,SummonArts};
}

function cohortArts(w,q,library) {
const inAoe = (...args) => w.inAoe(...args);
const angleDiff = q.angleDiff;
const angleTo = q.angleTo;
const dist = q.dist;
const mod = q.mod;
const applyHit = (...args) => w.damage.applyHit(...args);
const perceiveTarget = q.perceiveTarget;
const normalizeBrain = q.normalizeBrain;
const instanceDelivery = q.instanceDelivery;
const instanceMods = q.instanceMods;
const makeSkillInstance = q.makeSkillInstance;
const skillContextTags = q.skillContextTags;
const summonSchoolSkill = q.summonSchoolSkill;
const cohortSkillIds = q.cohortSkillIds;
const SKILLS = q.SKILLS;
const STATUS_DEFS = q.STATUS_DEFS;
function cohortOf(host) {
  if (!host || host.def.delivery.type !== "summon") return;
  const d = instanceDelivery(host);
  const c = d.type === "summon" ? d.cohort : void 0;
  return c?.primary && c.order ? c : void 0;
}
class CohortArts {
  constructor(w, forward, activate, heir) {
    this.w = w;
    this.forward = forward;
    this.activate = activate;
    this.heir = heir;
  }
  serial = 0;
  bodies = /* @__PURE__ */ new Set();
  protected = /* @__PURE__ */ new Set();
  orders = /* @__PURE__ */ new Map();
  healing = /* @__PURE__ */ new Map();
  members(owner, host) {
    return [...this.bodies].filter((b) => !b.dead && b.owner === owner && b.summonInst === host);
  }
  order(owner, host) {
    let rows = this.orders.get(owner);
    if (!rows) {
      rows = /* @__PURE__ */ new Map();
      this.orders.set(owner, rows);
    }
    let o = rows.get(host);
    if (!o) {
      o = { until: 0, ready: 0, markKey: "cohort:" + owner.id + ":" + ++this.serial };
      rows.set(host, o);
    }
    return o;
  }
  visible(a, b) {
    return a.tier === b.tier && perceiveTarget(a, b, this.w, normalizeBrain(a.brain ?? {}).base);
  }
  skill(a, id) {
    return a.skills.find((s) => s?.def.id === id) ?? a.cohortState?.kit.find((s) => s.def.id === id);
  }
  ready(a, s) {
    return !!s && !a.dead && !a.downed && !a.isStunned() && !a.tagsForbidden(s) && (a.cooldowns.get(s.def.id) ?? 0) <= 0;
  }
  init(a, host) {
    const c = cohortOf(host);
    if (!c || !a.owner) return;
    const d = instanceDelivery(host);
    const kit = cohortSkillIds(d).filter((id) => !a.skills.some((s) => s?.def.id === id)).flatMap((id) => SKILLS[id] ? [makeSkillInstance(summonSchoolSkill(d, a.defId, SKILLS[id]), host.level + (host.bonusLevels ?? 0))] : []);
    this.forward(host, kit);
    a.cohortState = {
      kit,
      primaryUses: 0,
      reprisalReady: 0,
      interceptCredit: a.maxLife() * (c.intercept?.budget ?? 0),
      reliefBank: 0,
      reliefAt: 0,
      contactAt: 0,
      pairReady: 0,
      flankTime: 0,
      flankReady: 0,
      retreatUntil: 0
    };
    this.bodies.add(a);
    if (c.reprisal) a.sheet.setSource("cohort:inherit", [mod("thorns", "flat", a.owner.sheet.get("thorns") * c.reprisal.inheritThorns)]);
    for (const s of kit) if (s.def.delivery.type === "aura") this.activate(a, s);
    if (a.summonOffspring && c.legacy) a.spectralVeil = { color: c.legacy.color, alpha: c.legacy.alpha };
    this.armProtection();
  }
  resync(host) {
    for (const a of this.bodies) if (!a.dead && a.summonInst === host && a.cohortState) {
      for (const s of a.cohortState.kit) s.sockets = s.sockets.filter((x) => !x?.forwarded);
      this.forward(host, a.cohortState.kit);
      for (const skill of a.cohortState.kit) if (skill.def.delivery.type === "aura") this.activate(a, skill);
    }
  }
  /** Resolve before windup/payment, so the replacement has its own actual supports and cast time. */
  view(a, inst) {
    const c = cohortOf(a.summonInst), s = a.cohortState;
    if (!c || !s || inst.cohortCast || inst.def.id !== c.primary) return inst;
    const rend = c.cadence && (s.primaryUses + 1) % c.cadence.every === 0 ? this.skill(a, c.cadence.skill) : void 0;
    return rend ?? inst;
  }
  prepare(a, inst, real) {
    const c = cohortOf(a.summonInst);
    if (!c || !a.cohortState || !real || inst.cohortCast) return inst;
    if (inst.def.id !== c.primary && inst.def.id !== c.cadence?.skill) return { ...inst, cohortCast: { role: "utility", origin: inst.def.id } };
    a.cohortState.primaryUses++;
    return { ...inst, cohortCast: { role: inst.def.id === c.primary ? "primary" : "rending", origin: c.primary } };
  }
  payload(a, id, aim, role, extra) {
    const base = this.skill(a, id);
    if (!this.ready(a, base)) return;
    const inst = { ...base, ...extra, cohortCast: { role, origin: id } };
    this.w.executeSkill(a, inst, aim, { noRepeat: true, componentUse: true, noCooldown: true, noFollowUp: true });
    return inst;
  }
  command(owner, host, aim) {
    const c = cohortOf(host);
    if (!c) return;
    const o = this.order(owner, host), members = this.members(owner, host), now = this.w.time;
    const reach = Math.min(c.order.range, dist(owner.pos, aim)), dir = angleTo(owner.pos, aim);
    o.point = { x: owner.pos.x + Math.cos(dir) * reach, y: owner.pos.y + Math.sin(dir) * reach };
    o.until = now + c.order.duration;
    const target = [...this.w.enemiesOf(owner)].filter((b) => this.visible(owner, b) && dist(b.pos, aim) <= b.radius + 30).sort((a, b) => dist(a.pos, aim) - dist(b.pos, aim) || a.id - b.id)[0];
    o.target = target?.id;
    if (target && c.mark) {
      const base = SKILLS[c.mark.skill];
      if (base) {
        const inst = makeSkillInstance(base, host.level + (host.bonusLevels ?? 0));
        inst.cohortCast = { role: "utility", origin: base.id, statusKey: o.markKey };
        this.forward(host, [inst]);
        const info = this.w.resolveTargeting(owner, inst, target.pos);
        if (info) {
          const old = owner.cohortMarks.get(host);
          if (old) this.removeMark(old.target, owner, host);
          owner.cohortMarks.delete(host);
          inst.extraMods = [...inst.extraMods ?? [], mod("effectDuration", "more", c.mark.duration / (STATUS_DEFS[c.mark.status]?.duration ?? c.mark.duration) - 1)];
          this.w.executeSkill(owner, inst, target.pos, { targetInfo: info, noRepeat: true, componentUse: true, noCooldown: true, noFollowUp: true });
          const status = target.statuses.find((st) => st.id === c.mark.status && st.sourceKey === inst.cohortCast.statusKey);
          if (status) owner.cohortMarks.set(host, { target, status, remaining: status.remaining, power: c.mark.more * (status.power ?? 1), inst });
        }
      }
    }
    if (c.banner && now >= o.ready && members.length) {
      o.direction = dir;
      o.gatherUntil = now + c.banner.gatherTime;
      o.slots = /* @__PURE__ */ new Map();
      const center = { x: owner.pos.x + Math.cos(dir) * c.banner.standoff, y: owner.pos.y + Math.sin(dir) * c.banner.standoff };
      members.sort((a, b) => a.id - b.id).forEach((a, i) => {
        const offset = (i - (members.length - 1) / 2) * c.banner.spacing;
        o.slots.set(a.id, { x: center.x - Math.sin(dir) * offset, y: center.y + Math.cos(dir) * offset });
      });
    }
  }
  completed(a, inst, aim) {
    if (!a.owner && inst.hostSkillId) {
      const host = a.skills.find((s) => s?.def.id === inst.hostSkillId);
      if (host && cohortOf(host)?.order.skill === inst.def.id) {
        this.command(a, host, aim);
        return;
      }
    }
    const c = cohortOf(a.summonInst);
    if (!c || !a.cohortState) return;
    if (c.banner && inst.def.id === c.challenge) this.payload(a, c.banner.skill, a.pos, "utility");
    if (inst.cohortCast?.role === "charge") a.cohortState.charging = true;
  }
  power(a, inst, target) {
    if (inst.cohortCast?.role !== "rending" || !a.owner || !a.summonInst) return 1;
    const spent = inst.cohortCast.warrant;
    if (spent) return spent.target === target.id ? 1 + spent.power : 1;
    const m = a.owner.cohortMarks.get(a.summonInst);
    return m?.target === target && target.statuses.includes(m.status) ? 1 + m.power : 1;
  }
  landed(a, inst, target, damage) {
    if (damage <= 0 || !a.owner || !a.summonInst || !a.cohortState) return;
    const c = cohortOf(a.summonInst);
    if (!c) return;
    if (inst.cohortCast?.role === "rending" && !inst.cohortCast.warrant) {
      const m = a.owner.cohortMarks.get(a.summonInst);
      if (m?.target === target && target.statuses.includes(m.status)) {
        inst.cohortCast.warrant = { target: target.id, power: m.power };
        this.removeMark(target, a.owner, a.summonInst);
        a.owner.cohortMarks.delete(a.summonInst);
      }
    }
    if (c.pairs && c.approach?.lunge === inst.def.id && !inst.cohortCast?.paired && !target.dead) {
      const use = inst.cohortCast ?? (inst.cohortCast = { role: "utility", origin: inst.def.id });
      use.paired = true;
      const partner = this.w.actorById(a.cohortState.partner ?? -1), s = partner?.cohortState;
      if (partner && s && !partner.dead && a.cohortState.pairReady <= this.w.time && s.pairReady <= this.w.time && this.visible(partner, target) && dist(partner.pos, a.pos) <= c.pairs.range) {
        a.cohortState.pairReady = s.pairReady = this.w.time + c.pairs.cooldown;
        s.pending = { at: this.w.time + c.pairs.delay, target: target.id, until: this.w.time + c.pairs.timeout };
      }
    }
  }
  block(a, attacker) {
    const c = cohortOf(a.summonInst), s = a.cohortState;
    if (c?.reprisal && s && this.w.time >= s.reprisalReady && !a.dead) {
      const skill = this.skill(a, c.reprisal.skill);
      const recovery = skill ? a.sheet.get("cooldownRecovery", skillContextTags(skill), instanceMods(skill)) : 1;
      s.reprisalReady = this.w.time + c.reprisal.cooldown / Math.max(0.01, recovery);
      s.reprisalTarget = attacker.id;
    }
  }
  armProtection() {
    const teams = new Set([...this.bodies].filter((b) => !b.dead && cohortOf(b.summonInst)?.intercept).map((b) => b.team));
    const living = new Set(teams.size ? this.w.actors.filter((a) => !a.dead && teams.has(a.team)) : []);
    for (const a of this.protected) if (!living.has(a)) {
      a.lifeDamageInterceptors?.delete("cohort");
      this.protected.delete(a);
    }
    for (const a of living) if (!this.protected.has(a)) {
      a.lifeDamageInterceptors ??= /* @__PURE__ */ new Map();
      a.lifeDamageInterceptors.set("cohort", (amount, event) => this.intercept(a, amount, event));
      this.protected.add(a);
    }
  }
  intercept(victim, amount, event) {
    if (!event || event.packet.redirected || amount <= 0 || victim.dead) return amount;
    const candidates = [...this.bodies].filter((a) => {
      const c2 = cohortOf(a.summonInst);
      return a !== victim && !a.dead && !a.downed && !a.isStunned() && a.team === victim.team && a.tier === victim.tier && c2?.intercept && a.cohortState.interceptCredit > 0 && dist(a.pos, victim.pos) <= c2.intercept.range && this.w.lineOfSight(a.pos, victim.pos, a.tier, victim.tier);
    }).sort((a, b) => {
      const direction = cohortOf(a.summonInst).intercept.select === "lowestLifeFraction" ? 1 : -1;
      return direction * (a.life / a.maxLife() - b.life / b.maxLife()) || a.id - b.id;
    });
    const body = candidates[0];
    if (!body) return amount;
    const c = cohortOf(body.summonInst), s = body.cohortState, spec = c.intercept;
    const share = Math.min(amount * spec.fraction, s.interceptCredit);
    if (share <= 0) return amount;
    s.interceptCredit -= share;
    const raw = Object.values(event.packet.amounts).reduce((n, v) => n + (v ?? 0), 0);
    const packet = { ...event.packet, redirected: true, amounts: Object.fromEntries(Object.entries(event.packet.amounts).map(([t, n]) => [t, (n ?? 0) / Math.max(1e-3, raw) * share])) };
    const result = applyHit(event.attacker, body, packet);
    if (result.blocked) this.block(body, event.attacker);
    if (c.relief) s.reliefBank = Math.min(body.maxLife() * c.relief.bank, s.reliefBank + share * c.relief.ratio);
    this.w.flashes.push({ pos: { ...body.pos }, radius: body.radius + 9, color: "#a7c4d3", life: 0.18, maxLife: 0.18 });
    if (body.life <= 0 && !body.dead) this.w.kill(body, false, event.attacker);
    return amount - share;
  }
  heal(a, inst, target, requested) {
    const budget = inst.cohortHeal;
    if (!budget || !a.owner) return requested;
    let rows = this.healing.get(a.owner);
    if (!rows) {
      rows = /* @__PURE__ */ new Map();
      this.healing.set(a.owner, rows);
    }
    let row = rows.get(target.id);
    if (!row || this.w.time - row.at >= 1) {
      row = { at: this.w.time, used: 0 };
      rows.set(target.id, row);
    }
    const taken = target.sheet.get("healTaken"), ceiling = Math.min(target.lifeCeiling(), target.lifeSealAt ?? Infinity);
    if (taken <= 0 || ceiling <= target.life) return 0;
    const scale = requested / Math.max(1e-5, budget.base);
    const allowed = Math.max(0, Math.min(requested, budget.remaining * scale, (ceiling - target.life) / taken, (target.maxLife() * budget.cap - row.used) / taken));
    row.used += allowed * taken;
    budget.remaining -= allowed / Math.max(1e-5, scale);
    return allowed;
  }
  /** Called after normal perception/taunt/order resolution, never with hidden target knowledge. */
  act(a, target, dt, move) {
    const s = a.cohortState, c = cohortOf(a.summonInst), owner = a.owner, host = a.summonInst;
    if (!s || !c || !owner || !host) return false;
    if (a.casting || a.dash || a.isStunned() || a.downed) return true;
    const o = this.order(owner, host);
    const compelled = target && a.statuses.some((st) => st.id === "taunted" && st.casterId === target.id);
    if (!compelled && s.pending && s.pending.at <= this.w.time && s.pending.until > this.w.time) return true;
    if (!compelled && o.gatherUntil !== void 0 && o.slots?.has(a.id)) {
      move(o.slots.get(a.id));
      return true;
    }
    if (!compelled && o.target !== void 0 && o.until > this.w.time) {
      const marked = this.w.actorById(o.target);
      if (marked && this.visible(a, marked)) target = marked;
    }
    if (!compelled && c.order.mode === "rally" && o.point && o.until > this.w.time && dist(owner.pos, o.point) <= c.order.range * 1.5 && (!target || dist(target.pos, o.point) > c.order.guardRadius)) {
      move(o.point);
      return true;
    }
    if (!target && o.point && o.until > this.w.time) {
      move(o.point);
      return true;
    }
    if (!target) return false;
    if (!compelled && o.until <= this.w.time && dist(owner.pos, target.pos) > c.order.range) return false;
    if (!this.visible(a, target)) return false;
    const d = dist(a.pos, target.pos), toward = angleTo(a.pos, target.pos), rear = Math.abs(angleDiff(target.facing, angleTo(target.pos, a.pos)));
    a.facing += Math.max(-a.turnSpeed * dt, Math.min(a.turnSpeed * dt, angleDiff(a.facing, toward)));
    const assassin = c.assassin;
    if (assassin) {
      if (s.flankTime >= assassin.patience) {
        s.flankTime = 0;
        s.flankReady = this.w.time + assassin.repositionEvery;
      }
      const cloak = this.skill(a, assassin.cloak);
      if (a.life / a.maxLife() < assassin.retreatAt && this.ready(a, cloak) && a.canUse(cloak)) {
        if (this.w.useSkill(a, cloak, a.pos)) s.retreatUntil = this.w.time + assassin.retreatTime;
      }
      if (s.retreatUntil > this.w.time && a.life / a.maxLife() < assassin.recoveryAt) {
        const away = angleTo(target.pos, a.pos), escape = { x: a.pos.x + Math.cos(away) * assassin.retreatDistance, y: a.pos.y + Math.sin(away) * assassin.retreatDistance };
        move(dist(owner.pos, target.pos) > d + assassin.retreatDistance ? owner.pos : escape);
        return true;
      }
      const backstab = this.skill(a, assassin.backstab);
      if (rear >= assassin.rearAngle && d <= assassin.reach && this.ready(a, backstab) && a.canUse(backstab)) {
        if (this.w.useSkill(a, backstab, target.pos)) {
          s.flankTime = 0;
          s.flankReady = this.w.time + assassin.repositionEvery;
          return true;
        }
      }
      if (rear < assassin.rearAngle && d < assassin.flankRange && this.w.time >= s.flankReady && s.flankTime < assassin.patience) {
        const flank = { x: target.pos.x - Math.cos(target.facing) * assassin.flank, y: target.pos.y - Math.sin(target.facing) * assassin.flank };
        if (this.w.lineOfSight(flank, target.pos, a.tier, target.tier)) {
          if (this.ready(a, cloak) && a.canUse(cloak)) this.w.useSkill(a, cloak, a.pos);
          s.flankTime += dt;
          move(flank);
          return true;
        }
      }
    }
    const approach = c.approach;
    if (approach && d > approach.minRange) {
      const lunge = this.skill(a, approach.lunge);
      if (d <= approach.range && this.ready(a, lunge) && a.canUse(lunge) && this.w.useSkill(a, lunge, target.pos)) return true;
      const ranged = this.skill(a, approach.ranged);
      if (d <= approach.range && this.ready(a, ranged) && a.canUse(ranged)) this.w.useSkill(a, ranged, target.pos);
    }
    for (const sk of a.skills) if (sk && sk.def.id !== c.primary && this.ready(a, sk) && a.canUse(sk)) {
      const hint = sk.def.ai;
      const range = (hint?.range ?? 0) * (hint?.rangeStat ? a.sheet.get(hint.rangeStat, skillContextTags(sk), instanceMods(sk)) : 1);
      if (d <= range && this.w.useSkill(a, sk, target.pos)) return true;
    }
    const primary = this.skill(a, c.primary), pd = primary ? instanceDelivery(this.view(a, primary)) : void 0;
    const reach = primary && pd?.type === "melee" ? (a.radius + pd.range) * a.sheet.get("meleeReach", skillContextTags(primary), instanceMods(primary)) : a.radius;
    if (d <= reach + target.radius * 0.5) {
      if (primary && a.canUse(this.view(a, primary)) && this.w.useSkill(a, primary, target.pos)) {
        s.flankTime = 0;
        return true;
      }
      return true;
    }
    move(target.pos);
    return true;
  }
  update(dt) {
    for (const a of [...this.bodies]) {
      if (a.dead || !a.owner || a.owner.dead || !a.summonInst || !cohortOf(a.summonInst)) {
        this.bodies.delete(a);
        continue;
      }
      const c = cohortOf(a.summonInst), s = a.cohortState;
      if (c.intercept) s.interceptCredit = Math.min(a.maxLife() * c.intercept.budget, s.interceptCredit + dt * a.maxLife() * c.intercept.budget / c.intercept.recovery);
      const siblings = this.members(a.owner, a.summonInst).sort((x, y) => x.id - y.id);
      if (c.pairs) {
        const i = siblings.indexOf(a);
        s.partner = siblings[i % 2 ? i - 1 : i + 1]?.id;
      }
      if (c.links) {
        const n = Math.min(c.links.neighbors, siblings.filter((b) => b !== a && b.tier === a.tier && dist(b.pos, a.pos) <= c.links.radius && this.w.lineOfSight(a.pos, b.pos, a.tier, b.tier)).length);
        a.sheet.setSource("cohort:links", [mod("blockChance", "flat", n * c.links.block), mod("poise", "increased", n * c.links.poise)]);
        const skill = this.skill(a, c.links.contact);
        if (this.ready(a, skill) && this.w.time >= s.contactAt) {
          const d = instanceDelivery(skill), tags = skillContextTags(skill), mods = instanceMods(skill);
          if (d.type === "nova") {
            const radius = d.radius * a.sheet.get("aoeRadius", tags, mods), shape = a.sheet.get("aoeShape", tags, mods);
            if (this.w.lite.liveCount) this.w.litePromoteNearest(a.pos, { within: radius * 2, max: c.links.promote, opposing: a.team, story: a.tier });
            if (this.w.enemiesOf(a).some((e) => !e.dead && !e.untargetable && e.tier === a.tier && inAoe(a.pos, radius, shape, a.facing, e.pos, e.radius) && this.w.lineOfSight(a.pos, e.pos, a.tier, e.tier))) {
              s.contactAt = this.w.time + c.links.interval;
              this.payload(a, c.links.contact, a.pos, "contact");
            }
          }
        }
      }
      if (s.reprisalTarget !== void 0 && !a.casting && !a.dash && c.reprisal) {
        const target = this.w.actorById(s.reprisalTarget), base = this.skill(a, c.reprisal.skill);
        if (target && this.visible(a, target) && dist(a.pos, target.pos) <= c.reprisal.range && this.ready(a, base)) {
          a.facing = angleTo(a.pos, target.pos);
          this.payload(a, c.reprisal.skill, target.pos, "reprisal", { extraMods: [...base.extraMods ?? [], mod("addedPhysical", "flat", a.sheet.get("thorns") * c.reprisal.thorns)] });
          s.reprisalTarget = void 0;
        } else if (!target || target.dead) s.reprisalTarget = void 0;
      }
      if (s.pending && c.pairs) {
        const target = this.w.actorById(s.pending.target), skill = this.skill(a, c.pairs.skill);
        const taunter = a.statuses.find((st) => st.id === "taunted" && st.casterId !== target?.id)?.casterId;
        if (this.w.time >= s.pending.until || !target || !this.visible(a, target) || taunter !== void 0) s.pending = void 0;
        else if (s.pending.at <= this.w.time && !a.casting && !a.dash && this.ready(a, skill) && a.canUse(skill)) {
          if (this.w.useSkill(a, { ...skill, cohortCast: { role: "pincer", origin: skill.def.id, paired: true } }, target.pos)) s.pending = void 0;
        }
      }
      if (s.charging && !a.dash && c.banner) {
        s.charging = false;
        this.payload(a, c.banner.skill, a.pos, "utility");
      }
      if (c.relief && s.reliefBank > 0 && this.w.time >= s.reliefAt) {
        s.reliefAt = this.w.time + c.relief.interval;
        const base = this.skill(a, c.relief.pulse);
        if (this.ready(a, base)) {
          const bank = s.reliefBank;
          s.reliefBank = 0;
          this.payload(a, c.relief.pulse, a.pos, "utility", { def: { ...base.def, effects: [{ type: "heal", amount: bank }] }, cohortHeal: { remaining: bank, base: bank, cap: c.relief.recipientCap } });
        }
      }
    }
    if (this.bodies.size || this.protected.size) this.armProtection();
    for (const [owner, rows] of this.orders) for (const [host, o] of rows) {
      if (owner.dead || !owner.skills.includes(host)) {
        this.clear(owner, host);
        continue;
      }
      const c = cohortOf(host), members = this.members(owner, host);
      if (!c) continue;
      if (o.gatherUntil !== void 0) {
        const ready = members.filter((a) => o.slots?.has(a.id));
        const gathered = ready.length > 0 && ready.every((a) => {
          const sk = this.skill(a, c.banner.charge);
          return !a.casting && !a.dash && this.ready(a, sk) && a.canUse(sk) && dist(a.pos, o.slots.get(a.id)) <= c.banner.gatherRadius;
        });
        if (gathered || this.w.time >= o.gatherUntil) {
          if (gathered && o.direction !== void 0 && c.banner) {
            o.ready = this.w.time + Math.max(...ready.map((a) => {
              const sk = this.skill(a, c.banner.charge);
              return c.banner.cooldown / Math.max(0.01, sk ? a.sheet.get("cooldownRecovery", skillContextTags(sk), instanceMods(sk)) : 1);
            }));
            for (const a of ready) {
              const sk = this.skill(a, c.banner.charge);
              if (!this.ready(a, sk) || !a.canUse(sk)) continue;
              const aim = { x: a.pos.x + Math.cos(o.direction) * c.order.range, y: a.pos.y + Math.sin(o.direction) * c.order.range };
              a.facing = o.direction;
              this.w.useSkill(a, { ...sk, cohortCast: { role: "charge", origin: sk.def.id } }, aim);
            }
          }
          o.gatherUntil = void 0;
          o.slots = void 0;
        }
      }
      const m = owner.cohortMarks.get(host);
      if (m) m.remaining = m.status.remaining;
      if (m && (m.target.dead || !m.target.statuses.includes(m.status))) {
        this.removeMark(m.target, owner, host);
        owner.cohortMarks.delete(host);
      }
    }
    for (const [owner, rows] of this.healing) {
      for (const [id, row] of rows) if (this.w.time - row.at > 1) rows.delete(id);
      if (owner.dead || !rows.size) this.healing.delete(owner);
    }
  }
  death(a, silent, expired) {
    const c = cohortOf(a.summonInst);
    if (silent || expired || a.summonOffspring || !a.owner || a.owner.dead || !c?.legacy) return;
    const heir = this.heir(a, c.legacy);
    if (heir) heir.spectralVeil = { color: c.legacy.color, alpha: c.legacy.alpha };
  }
  removeMark(target, owner, host) {
    const mark = owner.cohortMarks.get(host);
    if (mark) target.statuses = target.statuses.filter((s) => s !== mark.status);
  }
  leaveZone() {
    for (const [owner, rows] of this.orders) for (const [host, o] of rows) {
      o.point = void 0;
      o.target = void 0;
      o.slots = void 0;
      o.gatherUntil = void 0;
      const m = owner.cohortMarks.get(host);
      if (m) this.removeMark(m.target, owner, host);
      owner.cohortMarks.delete(host);
    }
    for (const a of this.bodies) if (a.cohortState) {
      a.cohortState.pending = void 0;
      a.cohortState.contactAt = 0;
    }
  }
  clear(owner, host) {
    this.orders.get(owner)?.delete(host);
    const m = owner.cohortMarks.get(host);
    if (m) this.removeMark(m.target, owner, host);
    owner.cohortMarks.delete(host);
    for (const a of [...this.bodies]) if (a.owner === owner && a.summonInst === host) {
      this.bodies.delete(a);
      a.cohortState = void 0;
      if (!a.dead) this.w.kill(a, true);
    }
    this.armProtection();
  }
}

return {cohortOf,CohortArts};
}

function frameArts(w,q,library) {
const faceAlongTravel = q.faceAlongTravel;
const inAoe = (...args) => w.inAoe(...args);
const angleTo = q.angleTo;
const dist = q.dist;
const applyHit = (...args) => w.damage.applyHit(...args);
const instanceDelivery = q.instanceDelivery;
const instanceMods = q.instanceMods;
const skillContextTags = q.skillContextTags;
const makeSkillInstance = q.makeSkillInstance;
const skillCooldownSeconds = q.skillCooldownSeconds;
const frameSkillIds = q.frameSkillIds;
const mod = q.mod;
const skillAbsorbAmount = q.skillAbsorbAmount;
const SKILLS = q.SKILLS;
const MONSTERS = q.MONSTERS;
function frameOf(host) {
  if (!host)
    return;
  const d = instanceDelivery(host);
  return d.type === "summon" && d.frame?.primary ? d.frame : void 0;
}
class FrameArts {
  constructor(w, forward, offspring, dismiss, retireField) {
    this.w = w;
    this.forward = forward;
    this.offspring = offspring;
    this.dismiss = dismiss;
    this.retireField = retireField;
  }
  bodies = /* @__PURE__ */ new Set();
  faces = /* @__PURE__ */ new WeakMap();
  wedges = [];
  refuges = [];
  protected = /* @__PURE__ */ new Set();
  warcalls = /* @__PURE__ */ new Map();
  members(owner, host) {
    return [...this.bodies].filter((a) => !a.dead && a.owner === owner && a.summonInst === host && !a.summonOffspring);
  }
  skill(a, id) {
    return a.skills.find((s) => s?.def.id === id) ?? a.frameState?.kit.find((s) => s.def.id === id);
  }
  radius(a, s) {
    const d = instanceDelivery(s);
    return ("radius" in d ? d.radius : 0) * a.sheet.get("aoeRadius", skillContextTags(s), instanceMods(s));
  }
  within(a, s, t, origin = a.pos, facing = a.facing) {
    return t.tier === a.tier && inAoe(origin, this.radius(a, s), a.sheet.get("aoeShape", skillContextTags(s), instanceMods(s)), facing, t.pos, t.radius) && this.w.lineOfSight(origin, t.pos, a.tier, t.tier);
  }
  cooldown(a, s, n = s.def.cooldown) {
    return skillCooldownSeconds(a, s, n) / Math.max(0.01, a.sheet.get("cooldownRecovery"));
  }
  commandLeft(a) {
    return Math.max(this.w.time, ...this.members(a.owner, a.summonInst).map((b) => b.frameState.commandReady));
  }
  duration(a, s, n) {
    return n * a.sheet.get("effectDuration", skillContextTags(s), instanceMods(s));
  }
  mass(a) {
    return a.sheet.get("bodyMass") * Math.pow(a.radius / (MONSTERS[a.defId ?? ""]?.radius ?? a.radius), 2);
  }
  init(a, host) {
    const f = frameOf(host);
    if (!f || !a.owner || a.summonOffspring)
      return;
    const kit = frameSkillIds(instanceDelivery(host)).filter((id) => !a.skills.some((s) => s?.def.id === id)).flatMap((id) => SKILLS[id] ? [makeSkillInstance(SKILLS[id], host.level + (host.bonusLevels ?? 0))] : []);
    this.forward(host, kit);
    a.frameState = { kit, uses: 0, slams: 0, last: { ...a.pos }, travel: 0, contactAt: 0, faultAt: 0, retaliateAt: 0, commandReady: 0, strain: 0, channelTotal: 0, channelRecipients: /* @__PURE__ */ new Map(), tauntAt: 0 };
    this.bodies.add(a);
    (a.hitObservers ??= /* @__PURE__ */ new Map()).set("frame", (source, p, r) => this.hurt(a, source, p, r));
    const command = f.charge?.command ?? f.crush?.command;
    if (command)
      a.frameState.commandReady = Math.max(this.commandLeft(a), this.w.time + (a.owner.cooldowns.get(command) ?? 0) / Math.max(0.01, a.owner.sheet.get("cooldownRecovery")));
    this.refreshBody(a, f, true);
  }
  refreshBody(a, f, initial = false) {
    const s = a.frameState;
    if (f.spines) {
      const thorns = f.spines.flat + a.owner.sheet.get("thorns") * f.spines.inherit;
      if (s.inheritedThorns !== thorns) {
        a.sheet.setSource("frame:spines", [mod("thorns", "flat", thorns)]);
        s.inheritedThorns = thorns;
      }
    }
    if (f.consolidation) {
      const slots = a.owner.summonToggles.get(a.summonInst.def.id)?.slots ?? 1;
      if (s.reservedSlots === slots)
        return;
      const old = a.maxLife(), fraction = a.life / Math.max(1, old), extra = Math.max(0, slots - 1);
      s.reservedSlots = slots;
      a.sheet.setSource("frame:consolidation", [mod("life", "more", extra * f.consolidation.lifePerSlot), mod("damage", "more", extra * f.consolidation.damagePerSlot)]);
      a.life = a.maxLife() * (initial ? 1 : fraction);
      if (a.shellGuard) {
        const ratio = a.maxLife() / old;
        a.shellGuard.max *= ratio;
        a.shellGuard.pool *= ratio;
        a.shellGuard.regenRate *= ratio;
      }
    }
  }
  resync(host) {
    const face = this.faces.get(host);
    if (face) {
      face.sockets = face.sockets.filter((s) => !s?.forwarded);
      this.forward(host, [face]);
    }
    for (const a of this.bodies)
      if (!a.dead && a.summonInst === host && a.frameState) {
        for (const s of a.frameState.kit)
          s.sockets = s.sockets.filter((g) => !g?.forwarded);
        this.forward(host, a.frameState.kit);
      }
  }
  view(owner, host) {
    const f = frameOf(host);
    if (!f?.repair || !owner.summonToggles.has(host.def.id) && !this.members(owner, host).length && owner.remoteFrames?.[host.def.id]?.skill !== f.repair.skill)
      return;
    let inst = this.faces.get(host);
    if (!inst) {
      inst = makeSkillInstance(SKILLS[f.repair.skill], host.level + (host.bonusLevels ?? 0));
      inst.frameHost = host;
      inst.hostSkillId = host.def.id;
      this.forward(host, [inst]);
      this.faces.set(host, inst);
    }
    return inst;
  }
  ready(owner, host) {
    return this.members(owner, host).some((a) => !a.frameState?.terminal) || !!owner.remoteFrames?.[host.def.id]?.ready;
  }
  presentation(owner) {
    const out = {};
    for (const host of owner.skills) {
      if (!host)
        continue;
      const view = this.view(owner, host);
      if (view)
        out[host.def.id] = { skill: view.def.id, ready: this.ready(owner, host) };
    }
    return Object.keys(out).length ? out : void 0;
  }
  /** Resolve real action state once for both local rendering and co-op snapshots. */
  bodyPresentation(a) {
    if (a.dead || a.downed) return;
    if (a.remoteFrameBody) return a.remoteFrameBody;
    if (!a.frameState && !a.frameCharging) return;
    const s = a.frameState, f = frameOf(a.summonInst);
    if (s?.terminal && f?.visual) return {
      style: f.visual,
      mode: "terminal",
      strength: Math.max(0, Math.min(1, 1 - (s.terminal.end - this.w.time) / Math.max(0.01, f.reliquary?.duration ?? 1)))
    };
    if (a.frameCharging) {
      const wedge = this.wedges.find((w) => w.members.includes(a));
      const style = frameOf(wedge?.host)?.visual;
      if (style) return { style, mode: "charge" };
    }
    if (!s || !f?.visual) return;
    if (s.order?.strike) return { style: f.visual, mode: "crush" };
    if (f.repair && a.owner && a.owner.casting?.inst.frameHost === a.summonInst)
      return {
        style: f.visual,
        mode: f.sanctuary ? "transfusion" : "repair",
        from: { ...a.owner.pos },
        strength: Math.max(0, Math.min(1, s.strain * (f.sanctuary?.escalation ?? 0)))
      };
  }
  isActive(a) {
    return !!a.frameState && !a.dead;
  }
  payload(a, id, aim, power = 1, paid = 0, origin, exclude, independent = false) {
    const base = this.skill(a, id);
    if (!base)
      return;
    const f = frameOf(a.summonInst);
    if (f?.spines && id === f.protect?.sweep)
      paid += a.sheet.get("thorns") * f.spines.sweepThorns;
    const inst = { ...base, frameExclusions: exclude ? new Set(exclude) : void 0, frameReceipts: exclude instanceof Set ? exclude : void 0, frameCast: independent ? void 0 : { origin: id, auxiliary: true, paid }, extraMods: [...base.extraMods ?? [], mod("damage", "more", power - 1), ...paid ? [mod("addedPhysical", "flat", paid)] : []] };
    const old = a.pos, facing = a.facing;
    const selfAim = dist(origin ?? a.pos, aim) < 1e-8;
    if (origin)
      a.pos = { ...origin };
    try {
      this.w.executeSkill(a, inst, aim, { noRepeat: !independent, noCooldown: true, componentUse: true, noFollowUp: true, keepFacing: selfAim });
    } finally {
      a.pos = old;
      a.facing = facing;
    }
    return inst;
  }
  prepare(a, inst, real) {
    if (!real || inst.frameCast)
      return inst;
    const war = this.warcalls.get(a);
    let out = inst;
    if (war && !war.spent && war.until > this.w.time && inst.def.effects.some((e) => e.type === "damage")) {
      war.spent = true;
      out = { ...out };
      out.extraMods = [...out.extraMods ?? [], mod("damage", "more", war.power)];
    }
    const f = frameOf(a.summonInst), s = a.frameState;
    if (!f || !s)
      return out;
    out = { ...out, frameCast: { origin: inst.def.id } };
    if (f.spines && inst.def.id === f.protect?.sweep)
      out.extraMods = [...out.extraMods ?? [], mod("addedPhysical", "flat", a.sheet.get("thorns") * f.spines.sweepThorns)];
    if (f.sacrifice && skillContextTags(inst).has("attack")) {
      const paid = applyHit(a, a, { amounts: { physical: a.maxLife() * f.sacrifice.fraction }, tags: /* @__PURE__ */ new Set(["physical"]), crit: false, resourceHit: true, sourceName: inst.def.name }).total;
      out.frameCast.paid = paid * f.sacrifice.damagePerLife;
      out.extraMods = [...out.extraMods ?? [], mod("addedPhysical", "flat", out.frameCast.paid)];
    }
    return out;
  }
  completed(a, inst, aim) {
    if (inst.frameHost) {
      this.repairPulse(a, inst);
      return;
    }
    if (inst.hostSkillId && !inst.frameCast) {
      const host = a.skills.find((s2) => s2?.def.id === inst.hostSkillId);
      if (host && frameOf(host)) {
        this.command(a, host, inst, aim);
        return;
      }
    }
    const f = frameOf(a.summonInst), s = a.frameState, c = inst.frameCast;
    if (!f || !s || !c || c.auxiliary || c.completed)
      return;
    c.completed = true;
    if (inst.def.id === f.slam || inst.def.id === f.crush?.strike) {
      s.slams++;
      if (f.arsenal)
        this.payload(a, f.arsenal.nova, aim, 1, c.paid ?? 0);
      if (inst.def.id === f.slam && f.crush && a.owner) {
        const ready = Math.max(this.w.time, this.commandLeft(a) - f.crush.reduction);
        for (const b of this.members(a.owner, a.summonInst))
          b.frameState.commandReady = ready;
        this.syncCommand(a);
      }
      const normalFault = f.crush?.normalFault && inst.def.id === f.slam && this.w.time >= s.faultAt;
      if (f.crush && (inst.def.id === f.crush.strike || normalFault)) {
        if (normalFault) s.faultAt = this.w.time + this.cooldown(a, this.skill(a, f.crush.fault));
        const dir = angleTo(a.pos, aim);
        for (let i = 1; i <= f.crush.faultSteps; i++) {
          const p = { x: a.pos.x + Math.cos(dir) * i * f.crush.faultSpacing, y: a.pos.y + Math.sin(dir) * i * f.crush.faultSpacing };
          this.payload(a, f.crush.fault, p, 1, c.paid ?? 0);
        }
      }
    }
    if (a.life <= 0 && !a.dead)
      this.w.kill(a, false, a);
  }
  landed(a, inst, target, damage) {
    const f = frameOf(a.summonInst), s = a.frameState, c = inst.frameCast;
    if (!f || !s || !c || c.auxiliary || c.hit || damage <= 0)
      return;
    c.hit = true;
    if (inst.def.id === f.primary && f.arsenal && ++s.uses % f.arsenal.every === 0)
      this.payload(a, f.arsenal.barrage, target.pos, 1, c.paid ?? 0);
    if (f.commander && (inst.def.id === f.slam || inst.def.id === f.crush?.strike)) {
      const art = this.payload(a, f.commander.skill, a.pos);
      if (!art)
        return;
      for (const ally of this.w.actors)
        if (!ally.dead && ally.team === a.team && this.within(a, art, ally)) {
          if ((this.warcalls.get(ally)?.ready ?? 0) > this.w.time)
            continue;
          this.warcalls.set(ally, { body: a, host: a.summonInst, power: f.commander.power, until: this.w.time + this.duration(a, art, f.commander.duration), ready: this.w.time + this.cooldown(a, art), spent: false });
        }
    }
  }
  hurt(a, attacker, packet, result) {
    const f = frameOf(a.summonInst), s = a.frameState;
    if (!f || !s || a.dead || result.evaded || result.immune || !Object.values(packet.amounts).some((n) => !!n) || packet.resourceHit && !result.total)
      return;
    if (f.legion && !a.summonOffspring && (!s.shed || s.shed.dead || !this.w.actors.includes(s.shed)) && (() => w.random())() < f.legion.chance)
      s.shed = this.offspring(a, 1)[0];
    if (f.spines && attacker !== a && !packet.resourceHit && this.w.time >= s.retaliateAt && !s.terminal) {
      s.retaliation = attacker;
      s.retaliateAt = this.w.time + this.cooldown(a, this.skill(a, f.spines.skill));
    }
  }
  absorbed(a, attacker, amount) {
    this.hurt(a, attacker, { amounts: { physical: amount }, tags: /* @__PURE__ */ new Set(), crit: false, sourceName: "Shell absorption" }, { total: amount, crit: false, evaded: false, immune: false, blocked: true });
  }
  syncCommand(a) {
    const f = frameOf(a.summonInst), id = f?.charge?.command ?? f?.crush?.command;
    if (!id || !a.owner || !a.frameState)
      return;
    const left = Math.max(0, this.commandLeft(a) - this.w.time);
    if (left)
      a.owner.cooldowns.set(id, left * a.owner.sheet.get("cooldownRecovery"));
    else
      a.owner.cooldowns.delete(id);
  }
  command(owner, host, inst, aim) {
    const f = frameOf(host);
    if (!f)
      return;
    const members = this.members(owner, host).filter((a) => !a.frameState?.terminal), body = members[0];
    if (!body)
      return;
    if (inst.def.id === f.charge?.command) {
      if (this.commandLeft(body) > this.w.time)
        return;
      const ready = this.w.time + this.cooldown(owner, inst);
      for (const member of members) member.frameState.commandReady = ready;
      this.syncCommand(body);
      this.startWedge(body, host, aim);
      return;
    }
    if (inst.def.id === f.crush?.command) {
      if (this.commandLeft(body) > this.w.time)
        return;
      for (const a of members) {
        const s = a.frameState;
        s.commandReady = this.w.time + this.cooldown(owner, inst);
        const n = Math.min(f.crush.range, dist(a.pos, aim)), dir = angleTo(a.pos, aim);
        s.order = { aim: { x: a.pos.x + Math.cos(dir) * n, y: a.pos.y + Math.sin(dir) * n }, end: this.w.time + f.crush.duration, pace: f.crush.pace, strike: f.crush.strike };
        this.syncCommand(a);
      }
    } else if (inst.def.id === f.protect?.command) {
      for (const a of members) {
        if (a.summonShell) {
          const sweep = this.skill(a, f.protect.sweep);
          if (sweep)
            this.w.useSkill(a, sweep, aim);
          continue;
        }
        const n = Math.min(f.protect.range, dist(owner.pos, aim)), dir = angleTo(owner.pos, aim);
        a.frameState.post = { aim: { x: owner.pos.x + Math.cos(dir) * n, y: owner.pos.y + Math.sin(dir) * n }, until: this.w.time + f.protect.duration };
      }
    }
  }
  startWedge(body, host, aim) {
    const f = frameOf(host), c = f.charge, owner = body.owner;
    const members = this.w.actors.filter((a) => !a.dead && !a.downed && a.owner === owner && !a.summonShell && !a.frameCharging && a.tier === body.tier && dist(a.pos, body.pos) <= c.gatherRange && (a === body || a.skills.some((s) => s && skillContextTags(s).has("melee"))) && this.w.lineOfSight(body.pos, a.pos, body.tier, a.tier));
    const n = Math.min(c.range, dist(body.pos, aim)), dir = angleTo(body.pos, aim);
    const wedge = { body, host, members, aim: { x: body.pos.x + Math.cos(dir) * n, y: body.pos.y + Math.sin(dir) * n }, pos: { ...body.pos }, end: this.w.time + c.duration, hit: /* @__PURE__ */ new Set(), wave: !!body.summonShell };
    for (const a of members) {
      a.frameCharging = true;
      a.casting = null;
    }
    this.wedges.push(wedge);
  }
  stopWedge(w) {
    for (const a of w.members)
      a.frameCharging = false;
    this.wedges = this.wedges.filter((x) => x !== w);
  }
  act(a, target, move) {
    const post = a.frameState?.post, c = frameOf(a.summonInst)?.protect;
    if (!post || !c || post.until <= this.w.time || a.summonShell || target && a.statuses.some((s) => s.id === "taunted" && s.casterId === target.id))
      return false;
    if (!target || dist(target.pos, post.aim) > c.guardRadius) {
      if (!a.casting && dist(a.pos, post.aim) > 12)
        move(post.aim);
      return true;
    }
    return false;
  }
  move(a, point, dt, pace, heading) {
    a.casting = null;
    const dx = point.x - a.pos.x, dy = point.y - a.pos.y;
    faceAlongTravel(
      a,
      heading === void 0 ? dx : Math.cos(heading),
      heading === void 0 ? dy : Math.sin(heading)
    );
    this.w.moveActor(a, dx, dy, dt * pace);
  }
  repairPulse(owner, inst) {
    const host = inst.frameHost, f = frameOf(host);
    if (!f?.repair)
      return;
    const bodies = this.members(owner, host).filter((a) => !a.frameState?.terminal);
    if (!bodies.length) {
      owner.casting = null;
      return;
    }
    const interval = inst.def.channel?.interval ?? 0.25;
    for (const a of bodies) {
      const s = a.frameState;
      if (this.w.time >= s.tauntAt) {
        s.tauntAt = this.w.time + this.cooldown(a, this.skill(a, f.repair.taunt));
        this.payload(a, f.repair.taunt, a.pos);
      }
      if (!f.sanctuary) {
        const skill = this.skill(a, f.repair.pulse);
        const raw = a.maxLife() * f.repair.fraction * interval;
        if (a.shellGuard) {
          a.shellGuard.pool = Math.min(a.shellGuard.max, a.shellGuard.pool + a.shellGuard.max * f.repair.fraction * interval * a.sheet.get("healPower", skillContextTags(skill), instanceMods(skill)));
          if (a.shellGuard.pool >= a.shellGuard.max * (a.shellGuard.reformFraction ?? 0.4))
            a.shellGuard.broken = false;
          this.healingPulse(a, skill, raw, raw, false);
        } else
          this.healingPulse(a, skill, raw, raw, false);
      } else {
        const c = f.sanctuary, skill = this.skill(a, c.heal);
        const allies = this.w.actors.filter((t) => t !== a && !t.dead && !t.downed && !t.untargetable && !t.construct && t.team === a.team && t.tier === a.tier && t.life < t.maxLife() && t.sheet.get("healTaken") > 0 && this.within(a, skill, t));
        const need = allies.reduce((v, t) => v + (t.maxLife() - t.life) / t.sheet.get("healTaken"), 0);
        if (!need)
          continue;
        const efficiency = c.efficiency * a.sheet.get("healPower", skillContextTags(skill), instanceMods(skill));
        const price = Math.min(a.life, a.maxLife() * c.cost * (1 + s.strain * c.escalation) * interval, need / Math.max(1e-3, efficiency));
        if (price <= 0)
          continue;
        const pulse = this.healingPulse(a, skill, price * c.efficiency, price * c.efficiency, true);
        const consumed = (price * c.efficiency - pulse.frameHeal.remaining) / c.efficiency;
        if (consumed > 0) {
          s.strain += interval;
          applyHit(a, a, { resourceHit: true, amounts: { physical: consumed }, tags: /* @__PURE__ */ new Set(["physical"]), crit: false, sourceName: inst.def.name });
        }
        if (a.life <= 0) {
          owner.casting = null;
          this.w.kill(a, false, a);
        }
      }
    }
  }
  healingPulse(a, base, amount, budget, excludeCaster) {
    const inst = {
      ...base,
      frameCast: { origin: base.def.id, auxiliary: true },
      frameHeal: { remaining: budget },
      def: { ...base.def, effects: [{ type: "heal", amount, excludeCaster }] }
    };
    this.w.executeSkill(a, inst, a.pos, { noRepeat: true, componentUse: true, noCooldown: true, noFollowUp: true, keepFacing: true });
    return inst;
  }
  heal(a, inst, target, raw) {
    if (!inst.frameHeal)
      return raw;
    const taken = target.sheet.get("healTaken") * a.sheet.get("healPower", skillContextTags(inst), instanceMods(inst));
    if (taken <= 0 || !this.w.lineOfSight(a.pos, target.pos, a.tier, target.tier))
      return 0;
    const n = Math.min(raw, inst.frameHeal.remaining, Math.max(0, target.maxLife() - target.life) / taken);
    inst.frameHeal.remaining -= n;
    return n;
  }
  healed(a, inst, target, amount) {
    if (!inst.frameHeal || !a.frameState || !this.bodies.has(a) || a.owner?.casting?.inst.frameHost !== a.summonInst || amount <= 0)
      return;
    a.frameState.channelTotal += amount;
    a.frameState.channelRecipients.set(target, (a.frameState.channelRecipients.get(target) ?? 0) + amount);
  }
  release(owner, inst) {
    const host = inst.frameHost;
    if (!host)
      return;
    const f = frameOf(host);
    for (const a of this.members(owner, host)) {
      const s = a.frameState, c = f?.sanctuary;
      if (c && s.channelTotal > 0) {
        const ward = this.payload(a, c.ward, a.pos);
        if (ward)
          for (const [t, healed] of s.channelRecipients) {
            if (t.dead || !this.within(a, ward, t))
              continue;
            const key = "frame:ward:" + owner.id + ":" + host.def.id, amount = skillAbsorbAmount(a, ward, Math.min(healed * c.wardRatio, t.maxLife() * c.wardCap));
            if (amount > (t.absorbLayers.get(key)?.amount ?? 0))
              t.absorbLayers.set(key, { amount, remaining: this.duration(a, ward, c.wardDuration), source: ward, ended: () => {
              } });
          }
      }
      s.channelTotal = 0;
      s.channelRecipients.clear();
    }
  }
  deferDeath(a, silent, killer) {
    const f = frameOf(a.summonInst), s = a.frameState;
    if (!f?.reliquary || !s || s.terminalSpent || silent || a.summonOffspring)
      return false;
    if (s.terminal)
      return true;
    const c = f.reliquary, origin = { ...a.pos }, skill = this.payload(a, c.field, origin);
    if (!skill)
      return false;
    const foe = [...this.w.enemiesOf(a)].filter((e) => !e.dead && e.tier === a.tier && dist(e.pos, a.pos) <= c.search && this.w.lineOfSight(a.pos, e.pos, a.tier, e.tier)).sort((x, y) => (MONSTERS[y.defId ?? ""]?.boss ? 3 : y.rarity === "rare" ? 2 : 1) - (MONSTERS[x.defId ?? ""]?.boss ? 3 : x.rarity === "rare" ? 2 : 1) || dist(x.pos, a.pos) - dist(y.pos, a.pos) || x.id - y.id)[0];
    this.refuges.push({ body: a, host: a.summonInst, skill, pos: origin, tier: a.tier, left: this.duration(a, skill, c.fieldDuration), pool: skillAbsorbAmount(a, skill, a.maxLife() * c.pool), radius: this.radius(a, skill), shape: a.sheet.get("aoeShape", skillContextTags(skill), instanceMods(skill)), facing: a.facing });
    s.terminal = { target: foe, aim: { ...foe?.pos ?? origin }, end: this.w.time + c.duration, killer, invulnerable: a.invulnerable };
    s.order = void 0;
    a.life = 1;
    a.invulnerable = true;
    a.casting = null;
    this.armRefuges();
    return true;
  }
  recovery(a) {
    const f = frameOf(a.summonInst);
    return f?.sacrifice ? Math.max(f.sacrifice.minRecovery, 1 - (a.frameState?.slams ?? 0) * f.sacrifice.recoveryPerSlam) : 1;
  }
  death(a, silent, expire) {
    const f = frameOf(a.summonInst);
    if (f?.legion && !silent && !expire && !a.summonOffspring)
      this.offspring(a, f.legion.deathCount);
    a.hitObservers?.delete("frame");
    this.bodies.delete(a);
  }
  armRefuges() {
    const living = new Set(this.refuges.length ? this.w.actors.filter((a) => !a.dead) : []);
    for (const a of this.protected)
      if (!living.has(a)) {
        a.lifeDamageInterceptors?.delete("frame:refuge");
        this.protected.delete(a);
      }
    for (const a of living)
      if (!this.protected.has(a)) {
        (a.lifeDamageInterceptors ??= /* @__PURE__ */ new Map()).set("frame:refuge", (amount, event) => {
          if (!event || event.packet.resourceHit)
            return amount;
          for (const r of this.refuges) {
            if (r.body.team !== a.team || r.tier !== a.tier || !inAoe(r.pos, r.radius, r.shape, r.facing, a.pos, a.radius) || !this.w.lineOfSight(r.pos, a.pos, r.tier, a.tier))
              continue;
            const used = Math.min(amount, r.pool);
            r.pool -= used;
            amount -= used;
            if (!amount)
              break;
          }
          return amount;
        });
        this.protected.add(a);
      }
  }
  update(dt) {
    for (const a of [...this.bodies]) {
      const s = a.frameState, f = frameOf(a.summonInst);
      if (!f || a.dead || !this.w.actors.includes(a)) {
        a.hitObservers?.delete("frame");
        this.bodies.delete(a);
        continue;
      }
      if (s.resetMotion) {
        s.last = { ...a.pos };
        s.travel = 0;
        s.resetMotion = false;
      }
      this.refreshBody(a, f);
      if (f.sanctuary)
        a.life = Math.min(a.maxLife(), a.life + a.maxLife() * f.sanctuary.regen * dt);
      const channel = a.owner?.casting?.inst.frameHost === a.summonInst;
      if (!channel) {
        s.strain = Math.max(0, s.strain - (f.sanctuary?.strainDecay ?? 1) * dt);
        s.channelTotal = 0;
        s.channelRecipients.clear();
      }
      if (s.terminal) {
        if (s.terminal.target && !s.terminal.target.dead && s.terminal.target.tier === a.tier && this.w.lineOfSight(a.pos, s.terminal.target.pos, a.tier, a.tier))
          s.terminal.aim = { ...s.terminal.target.pos };
        this.move(a, s.terminal.aim, dt, f.reliquary.pace);
        if (dist(a.pos, s.terminal.aim) < a.radius + 25 || this.w.time >= s.terminal.end) {
          this.payload(a, f.reliquary.explosion, a.pos);
          const killer = s.terminal.killer;
          a.invulnerable = s.terminal.invulnerable;
          s.terminal = void 0;
          s.terminalSpent = true;
          a.life = 0;
          this.w.kill(a, false, killer);
        }
        continue;
      }
      const crushMoving = !!s.order?.strike;
      if (s.order && !a.summonShell) {
        const o = s.order;
        this.move(a, o.aim, dt, o.pace);
        if (dist(a.pos, o.aim) < a.radius + 35 || this.w.time >= o.end) {
          s.order = void 0;
          if (o.strike) {
            const skill = this.skill(a, o.strike);
            if (skill) {
              a.useLock = 0;
              this.w.useSkill(a, skill, o.aim);
            }
          }
        }
      }
      const moved = dist(a.pos, s.last);
      s.travel += moved;
      if (f.siege && moved > 0 && this.w.time >= s.contactAt && s.travel >= f.siege.minimumMove && !a.summonShell) {
        s.contactAt = this.w.time + this.cooldown(a, this.skill(a, f.siege.skill));
        this.payload(a, f.siege.skill, a.pos, crushMoving ? f.crush?.contactPower ?? 1 : 1, 0, void 0, void 0, true);
        s.travel = 0;
      }
      s.last = { ...a.pos };
      if (s.retaliation) {
        const target = s.retaliation;
        s.retaliation = void 0;
        if (!target.dead && f.spines && !a.shellGuard?.broken)
          this.payload(a, f.spines.skill, target.pos, 1, a.sheet.get("thorns") * f.spines.thorns);
      }
      this.syncCommand(a);
    }
    for (const w of [...this.wedges]) {
      const c = frameOf(w.host)?.charge;
      if (!c || w.body.dead || w.body.owner?.dead || this.w.time >= w.end) {
        this.stopWedge(w);
        continue;
      }
      const remaining = dist(w.pos, w.aim), dir = remaining > 1e-8 ? angleTo(w.pos, w.aim) : w.body.facing, travel = Math.min(remaining, w.body.sheet.get("moveSpeed") * c.pace * dt);
      if (w.wave) {
        const next = { x: w.pos.x + Math.cos(dir) * travel, y: w.pos.y + Math.sin(dir) * travel };
        if (!this.w.lineOfSight(w.pos, next, w.body.tier, w.body.tier)) {
          this.stopWedge(w);
          continue;
        }
        w.pos = next;
      } else {
        this.move(w.body, w.aim, dt, c.pace, dir);
        w.pos = { ...w.body.pos };
      }
      let index = 0;
      for (const a of w.members)
        if (a !== w.body && !a.dead) {
          const row = 1 + Math.floor(index / 2), side = index % 2 ? 1 : -1;
          index++;
          this.move(a, { x: w.pos.x - Math.cos(dir) * row * c.spacing - Math.sin(dir) * side * row * c.spacing, y: w.pos.y - Math.sin(dir) * row * c.spacing + Math.cos(dir) * side * row * c.spacing }, dt, c.pace, dir);
        }
      const mass = this.mass(w.body) + w.members.filter((a) => a !== w.body && !a.dead).reduce((n, a) => n + this.mass(a), 0);
      const id = w.wave ? c.wave : c.rush, skill = this.skill(w.body, id);
      const forward = { x: w.pos.x + Math.cos(dir), y: w.pos.y + Math.sin(dir) };
      if ([...this.w.enemiesOf(w.body)].some((e) => !w.hit.has(e.id) && this.within(w.body, skill, e, w.pos, dir))) {
        this.payload(w.body, id, forward, 1 + mass * c.perMass, 0, w.pos, w.hit);
      }
      this.w.flashes.push({ pos: { ...w.pos }, radius: this.radius(w.body, skill), color: skill.def.color, fx: c.fx, life: 0.08, maxLife: 0.08, arc: { facing: dir, arcRad: Math.PI * 0.8 } });
      if (dist(w.pos, w.aim) < 15) {
        this.stopWedge(w);
        const f = frameOf(w.host);
        if (f?.protect)
          this.payload(w.body, f.protect.sweep, forward, 1, 0, w.pos);
      }
    }
    const expired = [];
    this.refuges = this.refuges.filter((r) => {
      r.left -= dt;
      const keep = r.left > 0 && r.pool > 0 && !r.body.owner?.dead && !!r.body.owner?.skills.includes(r.host);
      if (!keep)
        expired.push(r);
      return keep;
    });
    for (const r of expired)
      this.retireField(r.body, r.skill);
    this.armRefuges();
    for (const [a, b] of this.warcalls)
      if (a.dead || this.w.time > Math.max(b.until, b.ready))
        this.warcalls.delete(a);
  }
  leaveZone() {
    const carried = [...this.bodies].filter((a) => !a.dead).map((a) => ({ a, observer: a.hitObservers?.get("frame") }));
    this.clear();
    for (const { a, observer } of carried) {
      const s = a.frameState;
      s.order = void 0;
      s.post = void 0;
      s.retaliation = void 0;
      s.resetMotion = true;
      s.channelTotal = 0;
      s.channelRecipients.clear();
      if (s.terminal) {
        a.invulnerable = s.terminal.invulnerable;
        s.terminal = void 0;
        s.terminalSpent = true;
        this.w.kill(a, true);
        continue;
      }
      this.bodies.add(a);
      if (observer)
        (a.hitObservers ??= /* @__PURE__ */ new Map()).set("frame", observer);
    }
  }
  clear(owner, host) {
    for (const a of this.w.actors)
      if (a.casting?.inst.frameHost && (!owner || a === owner) && (!host || a.casting.inst.frameHost === host))
        a.casting = null;
    const matches = (a) => !owner || a.owner === owner && (!host || a.summonInst === host);
    for (const w of [...this.wedges])
      if (matches(w.body))
        this.stopWedge(w);
    const retired = this.refuges.filter((r) => matches(r.body));
    this.refuges = this.refuges.filter((r) => !matches(r.body));
    for (const r of retired)
      this.retireField(r.body, r.skill);
    for (const [a, b] of this.warcalls)
      if (matches(b.body))
        this.warcalls.delete(a);
    for (const a of [...this.bodies])
      if (matches(a)) {
        a.hitObservers?.delete("frame");
        this.bodies.delete(a);
      }
    for (const a of this.w.actors)
      for (const key of a.absorbLayers.keys())
        if (key.startsWith("frame:ward:") && (!owner || key === "frame:ward:" + owner.id + ":" + host?.def.id || !host && key.startsWith("frame:ward:" + owner.id + ":")))
          a.absorbLayers.delete(key);
    if (host)
      this.faces.delete(host);
    this.armRefuges();
  }
  bindCommand(host, inst) {
    const f = frameOf(host);
    if (!f || ![f.charge?.command, f.crush?.command, f.protect?.command].includes(inst.def.id))
      return;
    inst.sockets = inst.sockets.filter((s) => !s?.forwarded);
    this.forward(host, [inst]);
  }
  dismissFrame(owner, host) {
    this.dismiss(owner, host);
  }
}

return {frameOf,FrameArts};
}

function channelFormation(w,q,library) {
const mod = q.mod;
const instanceDelivery = q.instanceDelivery;
const instanceMods = q.instanceMods;
const skillContextTags = q.skillContextTags;
const summonCapacity = q.summonCapacity;
const empoweredSkill = library.empoweredSkill;
class ChannelFormations {
  constructor(world, spawn, fire) {
    this.world = world;
    this.spawn = spawn;
    this.fire = fire;
  }
  formations = /* @__PURE__ */ new Map();
  position(f, slot) {
    const d = instanceDelivery(f.inst);
    if (d.type !== "summon" || !d.channelFormation) return { ...f.owner.pos };
    const lateral = (slot % 2 ? 1 : -1) * (1 + Math.floor(slot / 2)) * d.channelFormation.spacing;
    return {
      x: f.owner.pos.x - Math.sin(f.owner.facing) * lateral,
      y: f.owner.pos.y + Math.cos(f.owner.facing) * lateral
    };
  }
  aim(f, body) {
    const d = instanceDelivery(f.inst);
    const reach = d.type === "summon" ? d.channelFormation?.reach ?? 470 : 470;
    const distance = Math.max(60, Math.min(reach, Math.hypot(f.cast.aim.x - f.owner.pos.x, f.cast.aim.y - f.owner.pos.y)));
    return {
      x: body.pos.x + Math.cos(f.owner.facing) * distance,
      y: body.pos.y + Math.sin(f.owner.facing) * distance
    };
  }
  pulse(owner, inst) {
    const d = instanceDelivery(inst), cast = owner.casting;
    if (d.type !== "summon" || !d.channelFormation || cast?.inst !== inst || cast.mode !== "channel") return;
    let f = this.formations.get(owner);
    if (f && f.cast !== cast) {
      this.retire(f);
      f = void 0;
    }
    if (!f) {
      f = { owner, inst, cast, members: [] };
      this.formations.set(owner, f);
    }
    f.members = f.members.filter((m) => !m.actor.dead);
    const cap = summonCapacity(owner, inst, d);
    const count = Math.max(1, Math.round(d.count + owner.sheet.get("summonCount", skillContextTags(inst), instanceMods(inst))));
    for (let n = 0; n < count && f.members.length < cap; n++) {
      let slot = 0;
      while (f.members.some((m) => m.slot === slot)) slot++;
      const body = this.spawn(owner, inst, this.position(f, slot));
      if (!body) break;
      body.channelFormation = true;
      body.facing = owner.facing;
      if (d.channelFormation.emerge) this.world.emergeBody(body, { spec: d.channelFormation.emerge });
      f.members.push({ actor: body, slot });
      if (d.channelFormation.attackSpeedMore) body.sheet.setSource("channelFormation", [mod("attackSpeed", "more", d.channelFormation.attackSpeedMore)]);
      const primary = body.skills[0];
      if (d.channelFormation.fireOnArrival && primary && !body.tagsForbidden(primary)) {
        this.fire(body, primary, this.aim(f, body), true);
        body.useLock = Math.max(body.useLock, body.skillUseTime(primary));
      }
    }
  }
  release(owner, cast) {
    const f = this.formations.get(owner);
    if (!f || f.cast !== cast) return;
    const d = instanceDelivery(f.inst);
    const living = f.members.filter((m) => !m.actor.dead);
    if (!owner.dead && !owner.downed && !owner.isStunned() && d.type === "summon" && d.channelFormationRelease && living.length >= summonCapacity(owner, f.inst, d)) {
      for (const { actor } of living) {
        const primary = actor.skills[0];
        if (!primary || actor.isStunned() || actor.tagsForbidden(primary)) continue;
        const spec = d.channelFormationRelease;
        actor.casting = null;
        actor.facing = owner.facing;
        this.fire(actor, empoweredSkill(primary, spec.power, spec.size), this.aim(f, actor));
      }
    }
    this.retire(f);
  }
  retire(f) {
    this.formations.delete(f.owner);
    for (const { actor } of f.members) if (!actor.dead) {
      actor.casting = null;
      this.world.kill(actor, true);
    }
  }
  clear(owner, inst) {
    for (const f of [...this.formations.values()]) if ((!owner || f.owner === owner) && (!inst || f.inst === inst)) this.retire(f);
  }
  update() {
    for (const f of [...this.formations.values()]) {
      const owner = f.owner;
      if (owner.dead || owner.downed || owner.isStunned() || owner.casting !== f.cast || !owner.skills.includes(f.inst) || !this.world.actors.includes(owner)) {
        this.retire(f);
        continue;
      }
      if (!f.cast.held) continue;
      for (const { actor, slot } of f.members) {
        if (actor.dead) continue;
        actor.tier = owner.tier;
        actor.facing = owner.facing;
        actor.pos = this.world.clampPos(this.position(f, slot), actor.radius, void 0, { mover: actor });
        const aim = this.aim(f, actor);
        if (actor.casting) {
          actor.casting.aim = aim;
          continue;
        }
        if (!actor.canAct()) continue;
        const kit = actor.skills.filter((s) => !!s).sort((a, b) => b.def.cooldown - a.def.cooldown);
        for (const skill of kit) if (this.world.useSkill(actor, skill, aim)) break;
      }
    }
  }
}

return {ChannelFormations};
}

function summonPacts(w,q,library) {
const instanceDelivery = q.instanceDelivery;
const instanceMods = q.instanceMods;
const makeSkillInstance = q.makeSkillInstance;
const skillContextTags = q.skillContextTags;
const SUMMON_PACTS = q.SUMMON_PACTS;
const SUMMON_PACT_SUPPORT_GRANTS = q.SUMMON_PACT_SUPPORT_GRANTS;
const SKILLS = q.SKILLS;
const MONSTERS = q.MONSTERS;
const sameStory = q.sameStory;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const roll = (a, b) => a + (() => w.random())() * (b - a);
const ids = SUMMON_PACTS.map((p) => p.id);
function deriveSummonPactSupports(owner, inst) {
  const d = instanceDelivery(inst);
  if (d.type !== "summon") {
    inst.nativeCrewFactions = void 0;
    return;
  }
  const tags = skillContextTags(inst), extra = instanceMods(inst);
  const grants = SUMMON_PACT_SUPPORT_GRANTS.filter((g) => owner.sheet.get(g.stat, tags, extra) > 0);
  const factions = [...new Set(grants.flatMap((g) => g.factions))];
  const forms = d.monsterId ? [d.monsterId] : d.pool?.map((p) => p.id) ?? [];
  inst.nativeCrewFactions = factions.length && (d.fromCorpse || forms.some((id) => factions.includes(MONSTERS[id]?.faction ?? ""))) ? factions : void 0;
}
class SummonPacts {
  constructor(world, spawn) {
    this.world = world;
    this.spawn = spawn;
  }
  states = /* @__PURE__ */ new Map();
  cues = /* @__PURE__ */ new Map();
  clear() {
    for (const cue of this.cues.values()) cue.life = 0;
    this.cues.clear();
    this.states.clear();
    for (const body of [...this.world.actors]) if (!body.dead && body.summonPactReward) this.world.kill(body, true);
  }
  state(owner, def) {
    let byId = this.states.get(owner);
    if (!byId) this.states.set(owner, byId = /* @__PURE__ */ new Map());
    let state = byId.get(def.id);
    if (!state) {
      const interval = def.kind === "assembly" ? roll(...def.interval) : 0;
      state = {
        owner,
        def,
        bank: 0,
        bag: [],
        parts: [],
        graves: [],
        next: this.world.time + interval,
        echoAt: -Infinity,
        inst: makeSkillInstance(SKILLS[def.reward.skill], 1, 0)
      };
      byId.set(def.id, state);
    }
    return state;
  }
  enabled(owner, def) {
    return !owner.dead && !owner.downed && !owner.summonPactReward && owner.sheet.get(def.stat) > 0;
  }
  reward(state, pos, learned, parts = []) {
    const { owner, def } = state;
    if (!this.enabled(owner, def)) return null;
    const alive = this.world.actors.filter((a) => !a.dead && a.owner === owner && a.summonPactReward === def.id);
    if (alive.length >= def.reward.maxActive) return null;
    const inst = learned ?? state.inst;
    const base = instanceDelivery(inst);
    if (base.type !== "summon") return null;
    const form = def.reward.forms?.find((f) => owner.sheet.get(f.stat) > 0);
    const delivery = {
      ...base,
      persistent: void 0,
      replenish: void 0,
      poolGroup: void 0,
      exclusiveGroup: void 0,
      decay: void 0,
      shell: void 0,
      strikeRelease: void 0,
      crewOnDeath: void 0,
      duration: def.reward.duration,
      crewMods: [...base.crewMods ?? [], ...parts.flatMap((p) => p.mods)],
      crewSkills: [.../* @__PURE__ */ new Set([...base.crewSkills ?? [], ...form?.crewSkills ?? [], ...parts.flatMap((p) => p.skills ?? [])])],
      crewAuras: [...base.crewAuras ?? [], ...form?.crewAuras ?? []]
    };
    if (form) {
      delivery.monsterId = form.monster;
      delivery.pool = void 0;
      if (form.replaceSkills && form.crewSkills?.length) delivery.crewRules = [{
        monsterIds: [form.monster],
        replace: (MONSTERS[form.monster]?.skills ?? []).map((from) => ({ from, to: form.crewSkills[0] }))
      }];
    }
    const body = this.spawn(owner, inst, {
      pact: def.id,
      delivery,
      monsterId: form?.monster,
      pos: { ...pos },
      noReplace: true,
      offspring: { maxActive: def.reward.maxActive, size: 1, life: 1, damage: 1 }
    });
    if (body && parts.length) {
      body.summonPactParts = parts.map((p) => p.id);
      body.name = inst.def.name;
    }
    return body;
  }
  /** One final death receipt, after Undying Loyalty and downed interception.
   * Silent replacement/dismissal is excluded; natural expiry is an explicit cause. */
  death(body, cause) {
    const owner = body.owner;
    if (!owner || body.construct || body.summonPactReward || cause === "dismiss" || !body.isMinion()) return;
    const temporary = body.summonPactTemporary ?? (body.lifespan > 0 || !!body.decay || cause === "expire" && !body.undyingSpent);
    cause = body.summonPactDeathCause ?? cause;
    for (const def of SUMMON_PACTS) {
      if (def.kind !== "deathBank" && def.kind !== "graveyard" || !this.enabled(owner, def)) continue;
      if (cause === "expire" && !def.expiry) continue;
      if (def.kind === "deathBank" && def.temporaryOnly && !temporary) continue;
      const state = this.state(owner, def);
      if (def.kind === "deathBank") {
        state.bank = Math.min(def.threshold, state.bank + 1);
        if (state.bank >= def.threshold && this.reward(state, owner.pos)) state.bank -= def.threshold;
      } else {
        if (!sameStory(owner, body) || distance(owner.pos, body.pos) > def.ownerRadius) continue;
        const nearest = state.graves.filter((g) => g.until > this.world.time && g.tier === body.tier && distance(g.pos, body.pos) <= def.radius).sort((a, b) => distance(a.pos, body.pos) - distance(b.pos, body.pos))[0];
        if (nearest?.activeAt !== void 0) continue;
        let grave = nearest;
        if (!grave) {
          if (state.graves.filter((g) => g.until > this.world.time).length >= def.maxSites) continue;
          grave = { pos: { ...body.pos }, tier: body.tier, count: 0, until: this.world.time + def.gatherDuration, next: 0 };
          state.graves.push(grave);
        }
        grave.count++;
        if (grave.count >= def.threshold) {
          grave.activeAt = this.world.time;
          grave.until = this.world.time + def.activeDuration;
          grave.next = this.world.time;
        }
      }
    }
  }
  summoned(body) {
    const owner = body.owner, source = body.summonInst;
    if (!owner || !source || body.summonPactReward || owner.summonPactReward) return;
    for (const def of SUMMON_PACTS) {
      if (def.kind !== "echo" || !this.enabled(owner, def)) continue;
      const state = this.state(owner, def);
      if (this.world.time < state.echoAt) continue;
      const seat = this.world.seatOf(owner);
      const learned = seat ? [...seat.meta.knownSkills.values()] : owner.skills.filter((s) => !!s);
      const pool = learned.filter((inst) => {
        if (inst.def.id === source.def.id || inst.def.hivecall || inst.def.throng || this.world.castReqRefusal(owner, inst)) return false;
        const d = instanceDelivery(inst);
        return d.type === "summon" && !d.fromCorpse && !d.channelFormation && !d.shell && !!(d.monsterId || d.pool?.length);
      }).sort((a, b) => a.def.id.localeCompare(b.def.id));
      if (!pool.length) continue;
      state.echoAt = this.world.time + def.cooldown;
      this.reward(state, body.pos, pool[Math.floor((() => w.random())() * pool.length)]);
    }
  }
  /** Reconcile immediately on allocation/refund as well as on world ticks. */
  reconcile(owner) {
    const byId = this.states.get(owner);
    if (!byId) return;
    for (const [id, state] of byId) if (!this.enabled(owner, state.def) || !this.world.actors.includes(owner)) {
      for (const key of [state, ...state.parts, ...state.graves]) this.dropCue(key);
      for (const body of [...this.world.actors]) if (!body.dead && body.owner === owner && body.summonPactReward === id) this.world.kill(body, true);
      byId.delete(id);
    }
    if (!byId.size) this.states.delete(owner);
  }
  update(dt) {
    for (const owner of this.states.keys()) this.reconcile(owner);
    for (const owner of this.world.actors) {
      if (owner.dead || owner.downed || owner.construct || owner.summonPactReward) continue;
      for (const id of owner.sheet.armedFamily("summonPact_", ids)) {
        const def = SUMMON_PACTS.find((p) => p.id === id);
        if (this.enabled(owner, def)) this.state(owner, def);
      }
    }
    for (const [owner, states] of this.states) {
      if (!this.world.actors.includes(owner)) {
        this.states.delete(owner);
        continue;
      }
      for (const state of states.values()) {
        const def = state.def;
        if (def.kind === "deathBank") {
          if (state.bank >= def.threshold && this.reward(state, owner.pos)) state.bank -= def.threshold;
          this.paint(state, owner.pos, owner.tier, 27, def.color, { kind: "bank", fill: state.bank / def.threshold, count: def.threshold }, dt);
        } else if (def.kind === "graveyard") this.updateGraves(state, def, dt);
        else if (def.kind === "assembly") this.updateAssembly(state, def, dt);
      }
    }
  }
  updateGraves(state, def, dt) {
    const now = this.world.time;
    for (let i = state.graves.length - 1; i >= 0; i--) {
      const g = state.graves[i];
      if (now >= g.until) {
        this.dropCue(g);
        state.graves.splice(i, 1);
        this.world.flashes.push({ pos: { ...g.pos }, radius: def.radius, color: def.color, life: 0.6, maxLife: 0.6, fx: "summon_pact_dust", recoveryCueTier: g.tier });
        continue;
      }
      if (g.activeAt !== void 0 && now >= g.next && g.tier === state.owner.tier) {
        this.reward(state, g.pos);
        g.next = now + def.interval;
      }
      this.paint(g, g.pos, g.tier, def.radius, def.color, {
        kind: "graveyard",
        count: g.count,
        fill: g.activeAt === void 0 ? g.count / def.threshold : (g.until - now) / def.activeDuration,
        active: g.activeAt !== void 0
      }, dt);
    }
  }
  updateAssembly(state, def, dt) {
    const { owner } = state, now = this.world.time;
    if (this.world.zone.objective.kind === "safe") {
      state.next = now + def.interval[0];
      return;
    }
    for (let i = state.parts.length - 1; i >= 0; i--) {
      const p = state.parts[i];
      const take = state.bag.length < def.required && p.tier === owner.tier && distance(p.pos, owner.pos) <= def.pickupRadius && this.world.lineOfSight(owner.pos, p.pos, owner.tier, p.tier);
      if (take || now >= p.until) {
        if (take) state.bag.push(p.part);
        this.dropCue(p);
        state.parts.splice(i, 1);
        continue;
      }
      this.paint(p, p.pos, p.tier, 12, p.part.color, { kind: "part", fill: 1, count: 1, shape: p.part.shape }, dt);
    }
    if (state.bag.length === def.required && this.reward(state, owner.pos, void 0, state.bag)) state.bag = [];
    if (now >= state.next) {
      state.next = now + roll(...def.interval);
      if (state.parts.length < def.maxParts) {
        for (let tries = 0; tries < 8; tries++) {
          const a = roll(0, Math.PI * 2), r = roll(...def.scatter);
          const pos = this.world.clampPos({ x: owner.pos.x + Math.cos(a) * r, y: owner.pos.y + Math.sin(a) * r }, 12, void 0, { mover: owner });
          if (distance(owner.pos, pos) < def.scatter[0] || !this.world.lineOfSight(owner.pos, pos, owner.tier, owner.tier)) continue;
          if (state.parts.some((p) => p.tier === owner.tier && distance(p.pos, pos) < def.pickupRadius * 2)) continue;
          state.parts.push({ pos, tier: owner.tier, part: def.parts[Math.floor((() => w.random())() * def.parts.length)], until: now + def.partDuration });
          break;
        }
      }
    }
    this.paint(state, owner.pos, owner.tier, 38, def.color, {
      kind: "assembly",
      fill: state.bag.length / def.required,
      count: def.required,
      parts: state.bag.map((p) => ({ shape: p.shape, color: p.color }))
    }, dt);
  }
  paint(key, pos, tier, radius, color, cue, dt) {
    let flash = this.cues.get(key);
    if (!flash) {
      flash = { pos: { ...pos }, radius, color, life: 1, maxLife: 1, fx: "summon_pact", recoveryCueTier: tier, summonPactCue: cue };
      this.cues.set(key, flash);
      this.world.flashes.push(flash);
    }
    flash.pos = { ...pos };
    flash.recoveryCueTier = tier;
    flash.summonPactCue = cue;
    flash.life = flash.maxLife = Math.max(0.25, dt * 2);
  }
  dropCue(key) {
    const f = this.cues.get(key);
    if (f) f.life = 0;
    this.cues.delete(key);
  }
  /** Inspection only; callers cannot mutate simulation state through this view. */
  view(owner) {
    return [...this.states.get(owner)?.values() ?? []].map((s) => ({
      id: s.def.id,
      bank: s.bank,
      bag: s.bag.map((p) => p.id),
      parts: s.parts.map((p) => ({ pos: { ...p.pos }, tier: p.tier, id: p.part.id })),
      graves: s.graves.map((g) => ({ ...g, pos: { ...g.pos } }))
    }));
  }
}

return {deriveSummonPactSupports,SummonPacts};
}

function minionTransmutation(w,q,library) {
const MINION_TRANSMUTATIONS = q.MINION_TRANSMUTATIONS;
const minionBodyTags = q.minionBodyTags;
function transmutationOf(owner, bodyId) {
  return transmutationSource(owner, bodyId)?.def;
}
function transmutationSource(owner, bodyId) {
  if (!bodyId) return void 0;
  const tags = minionBodyTags(bodyId);
  const seen = /* @__PURE__ */ new Set();
  for (let keeper = owner; keeper && !seen.has(keeper); keeper = keeper.owner) {
    seen.add(keeper);
    const def = MINION_TRANSMUTATIONS.find((d) => tags.includes(`minion:${d.family}`) && keeper.sheet.get(d.stat) > 0);
    if (def) return { def, keeper };
  }
}
function refreshTransmutation(body, owner) {
  const source = transmutationSource(owner, body.defId), d = source?.def, old = body.transmutation;
  if (!d) {
    if (!old) return false;
    for (const key of old.sources) body.sheet.removeSource(key);
    Object.assign(body, old.original);
    body.transmutation = void 0;
    return true;
  }
  owner = source.keeper;
  const eligible = (m) => (d.personalStats.includes(m.stat) || d.personalPrefixes?.some((prefix) => m.stat.startsWith(prefix))) && !m.tags?.some((t) => t === "minion" || t.startsWith("minion:")) && (!m.when || owner.sheet.hasCondition(m.when)) && (!m.gauge || m.gaugeAt === void 0 || owner.sheet.gauge(m.gauge) >= m.gaugeAt);
  const copy = (m) => ({
    ...m,
    when: void 0,
    gauge: void 0,
    gaugeAt: void 0,
    value: m.value * (!m.gauge ? 1 : m.gaugeAt !== void 0 ? +(owner.sheet.gauge(m.gauge) >= m.gaugeAt) : owner.sheet.gauge(m.gauge)),
    tags: m.tags && [...m.tags]
  });
  const rows = owner.sheet.sourceNames().filter((s) => !s.startsWith("transmute:") && !(s.startsWith("buff:") && body.sheet.getSourceMods(s))).map((source2) => ({
    source: `transmute:${d.id}:${source2}`,
    mods: (owner.sheet.getSourceMods(source2) ?? []).filter(eligible).map(copy)
  })).filter((r) => r.mods.length);
  const fingerprint = JSON.stringify(rows);
  if (old?.id === d.id && old.fingerprint === fingerprint) return false;
  const original = old?.original ?? { name: body.name, look: body.look, color: body.color, material: body.material, faction: body.faction };
  for (const key of old?.sources ?? []) body.sheet.removeSource(key);
  for (const row of rows) body.sheet.setSource(row.source, row.mods);
  body.transmutation = { id: d.id, original, sources: rows.map((r) => r.source), fingerprint };
  body.name = `${d.namePrefix} ${original.name}`;
  body.color = d.color;
  body.faction = d.faction;
  body.material = d.material;
  body.look = body.skills.some((s) => s?.def.tags.includes("spell")) ? d.looks.caster : body.skills.some((s) => s?.def.tags.includes("projectile")) ? d.looks.ranged : d.looks.melee;
  return true;
}

return {transmutationOf,refreshTransmutation};
}

function battleDoctrines(w,q,library) {
const makeSkillInstance = q.makeSkillInstance;
const mod = q.mod;
const BATTLE_DOCTRINES = q.BATTLE_DOCTRINES;
const SKILLS = q.SKILLS;
const sameStory = q.sameStory;
const refreshTransmutation = library.refreshTransmutation;
const transmutationOf = library.transmutationOf;
const applyMinionPlyBonus = q.applyMinionPlyBonus;
const resolveMinionInheritance = q.resolveMinionInheritance;
function issueCommand(actor, cmd) {
  actor.throngCarried = false;
  actor.aiCommand = cmd;
  actor.aiTargetId = void 0;
  actor.threat.clear();
  actor.wanderDir = void 0;
}

const buffWithSource = library.buffWithSource;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const IDS = BATTLE_DOCTRINES.map((d) => d.id);
class BattleDoctrines {
  constructor(w) {
    this.w = w;
  }
  states = /* @__PURE__ */ new Map();
  issued = /* @__PURE__ */ new WeakMap();
  refreshAt = 0;
  clear() {
    for (const [a, states] of this.states) for (const [id, state] of states) this.cancel(a, id, state);
    this.states.clear();
    this.refreshAt = 0;
  }
  signature(a, d) {
    return [d.stat, ...d.forms.flatMap((f) => f.stat ? [f.stat] : []), ...(d.traits ?? []).map((t) => t.stat)].map((s) => a.sheet.get(s)).join(",");
  }
  cancel(a, id, state) {
    const d = BATTLE_DOCTRINES.find((d2) => d2.id === id);
    const buffs = [`doctrine:${id}:${a.id}`, ...(d.traits ?? []).map((t) => `doctrine:${t.stat}:${a.id}`)];
    for (const b of this.w.actors) for (const key of buffs) b.removeBuff(key);
    for (const [b, cmd] of state.commands) if (b.aiCommand === cmd) b.aiCommand = void 0;
    this.w.pendingRepeats = this.w.pendingRepeats.filter((r) => {
      const source = this.issued.get(r.inst);
      return source?.owner !== a || source.doctrine !== id;
    });
  }
  enabled(a, d) {
    return !a.dead && !a.downed && a.sheet.get(d.stat) > 0;
  }
  state(a, d) {
    let states = this.states.get(a);
    if (!states) this.states.set(a, states = /* @__PURE__ */ new Map());
    let state = states.get(d.id);
    if (!state) states.set(d.id, state = { bank: 0, next: 0, signature: this.signature(a, d), partners: /* @__PURE__ */ new Map(), commands: /* @__PURE__ */ new Map() });
    return state;
  }
  subjects(a, d) {
    return this.w.actors.filter((b) => b.owner === a && !b.dead && !b.downed && !b.construct && !b.companionDormant && sameStory(a, b) && distance(a.pos, b.pos) <= d.radius && (d.subjects === "companions" ? !!b.companion : b.isMinion()));
  }
  form(a, d) {
    return d.forms.find((f) => f.stat && a.sheet.get(f.stat) > 0) ?? d.forms[0];
  }
  growths(a, d) {
    return d.growth ? this.w.doctrineGrowths(a, d.growth.kind).filter((g) => sameStory(a, g.d) && distance(a.pos, g.d.pos) <= d.radius && g.maxTtl - g.ttl >= d.growth.maturity && !g.d.gone).slice(0, d.growth.maximum) : [];
  }
  refusal(a, inst) {
    if (!inst.def.doctrine) return;
    const d = BATTLE_DOCTRINES.find((d2) => d2.id === inst.def.doctrine);
    if (!d || !this.enabled(a, d)) return "This doctrine is not granted.";
    if (d.meter && this.state(a, d).bank < d.meter.minimum) return d.meter.emptyReason ?? "This ability needs more stored power.";
    if (d.growth && !this.growths(a, d).length) return "No mature owned growths in reach.";
    if (d.subjects && !this.subjects(a, d).length) return "No available allies in reach.";
  }
  add(a, d) {
    if (!d.meter || !this.enabled(a, d)) return;
    const s = this.state(a, d);
    if (this.w.time < s.next) return;
    s.next = this.w.time + d.meter.interval;
    s.bank = Math.min(d.meter.max, s.bank + 1);
    for (const t of d.traits ?? []) if (t.refund && a.sheet.get(t.stat) > 0) a.cooldowns.set(d.skill, Math.max(0, (a.cooldowns.get(d.skill) ?? 0) - t.refund));
  }
  hit(a, inst, target, poiseBreak) {
    if (this.issued.has(inst) || inst.def.doctrine || target.team === a.team) return;
    const owner = a.owner ?? a;
    for (const id of owner.sheet.armedFamily("doctrine_", IDS)) {
      const d = BATTLE_DOCTRINES.find((d2) => d2.id === id);
      if (!this.enabled(owner, d) || !d.meter) continue;
      if (a === owner && poiseBreak && d.meter.events.includes("poiseBreak") && inst.def.tags.includes("melee")) this.add(owner, d);
      if (!d.meter.events.includes("cooperate") || a !== owner && !this.subjects(owner, d).includes(a)) continue;
      const state = this.state(owner, d), previous = state.partners.get(target);
      if (previous && previous.actor !== a && this.w.time - previous.at <= d.meter.window) this.add(owner, d);
      state.partners.set(target, { actor: a, at: this.w.time });
    }
  }
  death(victim, killer) {
    if (!killer || victim.team === killer.team || victim.noBounty) return;
    for (const d of BATTLE_DOCTRINES) if (d.meter?.events.includes("kill") && this.enabled(killer, d) && sameStory(victim, killer) && distance(victim.pos, killer.pos) < d.radius) this.add(killer, d);
  }
  release(a, host, id, at, power, delay = 0) {
    const def = SKILLS[id];
    if (!def) return;
    const inst = makeSkillInstance(def, Math.max(1, a.level), 0);
    inst.hostSkillId = host.def.id;
    inst.sockets = [...host.sockets];
    inst.grafts = host.grafts && [...host.grafts];
    this.issued.set(inst, { owner: a, doctrine: host.def.doctrine });
    if (delay) this.w.pendingRepeats.push({ caster: a, inst, aim: { ...at }, n: 1, k: 0, timer: delay, interval: delay, dmgMult: power, aoeMult: 1, scaleStep: 0, retarget: false });
    else this.w.executeSkill(a, inst, at, { noRepeat: true, noCooldown: true, dmgMult: power });
  }
  cast(a, inst, aim) {
    if (!inst.def.doctrine || this.issued.has(inst) || this.refusal(a, inst)) return;
    const d = BATTLE_DOCTRINES.find((d2) => d2.id === inst.def.doctrine), state = this.state(a, d), f = this.form(a, d);
    const bank = state.bank;
    state.bank = 0;
    const traits = (d.traits ?? []).filter((t) => a.sheet.get(t.stat) > 0);
    const growths = this.growths(a, d), bodies = d.subjects ? this.subjects(a, d) : [a];
    if (d.subjects && traits.some((t) => t.includeOwner)) bodies.push(a);
    const strength = 1 + bank * (d.meter?.powerPerCharge ?? 0);
    const destination = this.w.clampPos(distance(a.pos, aim) <= d.radius ? aim : {
      x: a.pos.x + (aim.x - a.pos.x) * d.radius / distance(a.pos, aim),
      y: a.pos.y + (aim.y - a.pos.y) * d.radius / distance(a.pos, aim)
    }, 16, void 0, { mover: a });
    const point = (i, count) => {
      const angle = f.formation === "wedge" ? Math.atan2(destination.y - a.pos.y, destination.x - a.pos.x) + (i % 2 ? 1 : -1) * 2.2 : i / Math.max(1, count) * Math.PI * 2;
      const radius = (d.spacing ?? 70) * (f.formation === "wedge" ? 1 + Math.floor(i / 2) : f.formation === "scatter" ? 2.5 : 1.5);
      return { x: destination.x + Math.cos(angle) * radius, y: destination.y + Math.sin(angle) * radius };
    };
    for (const [i, b] of bodies.entries()) {
      if (d.subjects && b !== a) {
        const command = { kind: f.order ?? "assault", pos: this.w.clampPos(point(i, bodies.length), b.radius, void 0, { mover: b }), until: this.w.time + d.duration, issuerId: a.id };
        issueCommand(b, command);
        state.commands.set(b, command);
      }
      const mods = [...f.mods ?? [], ...bank && d.subjects ? [mod("damage", "more", strength - 1)] : []];
      let heal = f.healPct ?? 0;
      for (const t of traits) {
        if (t.spendPly) {
          if (b.plies <= 0) continue;
          b.plies--;
        }
        mods.push(...t.mods ?? []);
        heal += t.healPct ?? 0;
        if (t.answer && d.subjects) {
          const attack = b.skills.find((s) => s?.def.tags.includes("attack") && !s.def.doctrine);
          if (attack) this.w.useSkill(b, attack, aim);
        }
      }
      if (mods.length) b.addBuff(buffWithSource({ type: "buff", id: `doctrine:${d.id}:${a.id}`, label: d.name, duration: d.duration * (f.scaleDuration ? strength : 1), mods }, inst));
      if (heal) b.healBy(b.maxLife() * heal * (d.growth ? growths.length : 1));
    }
    const origins = d.growth ? growths.map((g) => ({ ...g.d.pos })) : [aim];
    if (d.growth) for (const [i, g] of growths.entries()) {
      if (f.relocate) {
        g.d.pos = this.w.clampPos(point(i, growths.length), g.d.radius, void 0, { mover: a });
      } else {
        g.ttl = 0;
        g.d.gone = true;
      }
    }
    if (d.growth) this.w.markDoodadsChanged();
    if (f.payload) for (const origin of origins) {
      this.release(a, inst, f.payload, origin, strength);
      for (const t of traits) if (t.repeat) this.release(a, inst, f.payload, origin, strength * t.repeat.power, t.repeat.delay);
    }
    this.w.flashes.push({
      pos: { ...destination },
      radius: d.subjects ? (d.spacing ?? 40) * 3 : 90,
      color: d.color,
      life: 0.7,
      maxLife: 0.7,
      fx: "battle_doctrine",
      recoveryCueTier: a.tier,
      doctrineCue: { kind: d.growth ? "harvest" : "order", count: d.subjects ? bodies.length : growths.length, max: 1, formation: f.formation }
    });
  }
  reconcile(owner) {
    for (const [a, states] of this.states) {
      if (owner && owner !== a) continue;
      for (const [id, state] of states) {
        const d = BATTLE_DOCTRINES.find((d2) => d2.id === id);
        if (!this.enabled(a, d) || !this.w.actors.includes(a) || state.signature !== this.signature(a, d)) {
          this.cancel(a, id, state);
          states.delete(id);
          continue;
        }
        for (const [target, p] of state.partners) if (target.dead || this.w.time - p.at > (d.meter?.window ?? 0)) state.partners.delete(target);
        for (const [b, command] of state.commands) if (b.dead || b.aiCommand !== command || command.until < this.w.time) state.commands.delete(b);
      }
      if (!states.size) this.states.delete(a);
    }
    for (const b of this.w.actors) if (!b.dead && b.owner && b.isMinion() && !b.construct && (b.transmutation || transmutationOf(b.owner, b.defId))) {
      if (refreshTransmutation(b, b.owner)) {
        if (b.summonInst) {
          const inheritance = resolveMinionInheritance(b.owner, b.summonInst, b.defId);
          b.sheet.setSource("owner", inheritance.ownerMods);
          b.guardMode = inheritance.guard;
          applyMinionPlyBonus(b, inheritance.plyBonus);
          this.w.resyncMinionSupports(b.summonInst);
        }
        b.life = Math.min(b.life, b.maxLife());
      }
    }
  }
  update() {
    if (this.w.time < this.refreshAt) return;
    this.refreshAt = this.w.time + 0.25;
    this.reconcile();
    for (const a of this.w.actors) {
      if (a.dead || a.downed) continue;
      for (const id of a.sheet.armedFamily("doctrine_", IDS)) {
        const d = BATTLE_DOCTRINES.find((d2) => d2.id === id);
        const state = this.state(a, d);
        if (d.meter) this.w.flashes.push({
          pos: { ...a.pos },
          radius: 31,
          color: d.color,
          life: 0.3,
          maxLife: 0.3,
          fx: "battle_doctrine",
          recoveryCueTier: a.tier,
          doctrineCue: { kind: "meter", count: state.bank, max: d.meter.max }
        });
        for (const t of d.traits ?? []) if (t.shelter && a.sheet.get(t.stat) > 0) {
          const anchors = d.growth ? this.w.doctrineGrowths(a, d.growth.kind).filter((g) => !g.d.gone).map((g) => g.d) : this.subjects(a, d);
          for (const ally of [a, ...this.w.actors.filter((b) => b.owner === a && !b.dead && !b.downed)]) if (anchors.some((p) => sameStory(p, ally) && distance(p.pos, ally.pos) <= t.shelter.radius))
            ally.addBuff({
              type: "buff",
              id: `doctrine:${t.stat}:${a.id}`,
              label: d.name,
              duration: 0.35,
              mods: t.shelter.mods,
              sourceSkill: { id: d.skill, name: d.name, color: d.color, tags: [...SKILLS[d.skill].tags] }
            });
        }
      }
    }
  }
  view(a) {
    return [...this.states.get(a)?.entries() ?? []].map(([id, s]) => ({ id, bank: s.bank }));
  }
}

return {BattleDoctrines};
}

function controllers(w,q,library){
const FrameArts=library.FrameArts;
const frameOf=library.frameOf;
const CohortArts=library.CohortArts;
const SummonArts=library.SummonArts;
const DeviceContacts=library.DeviceContacts;
const deviceContactEligible=library.deviceContactEligible;
const BattleDoctrines=library.BattleDoctrines;
const SummonPacts=library.SummonPacts;
const skillBurstVoice=q.skillBurstVoice;
const skillStrikeVoice=q.skillStrikeVoice;
const skillMovementVoice=q.skillMovementVoice;
const skillPresenceVoice=q.skillPresenceVoice;
const cosmeticSkillPaint=(_owner,actor,id)=>w.host.presentation?.cosmetic?.(actor.id,id)??{};
const ChannelFormations=library.ChannelFormations;
const angleTo=q.angleTo;
const chance=value=>w.random()<value;
const clamp=q.clamp;
const dist=q.dist;
const rand=(a,b)=>a+w.random()*(b-a);
const vec=q.vec;
const mod=q.mod;
const STATUS_DEFS=q.STATUS_DEFS;
const ProjectileArts=library.ProjectileArts;
const applyDot=(...args)=>w.damage.applyDot(...args);
const mitigateTyped=(...args)=>w.damage.mitigateTyped(...args);
const skillDamageBands=(...args)=>w.damage.skillDamageBands(...args);
const crewBoardingOpen=q.crewBoardingOpen;
const effectiveSkillLevel=q.effectiveSkillLevel;
const grantedTags=q.grantedTags;
const hostSockets=q.hostSockets;
const instanceCascadePlan=q.instanceCascadePlan;
const instanceChargeCost=q.instanceChargeCost;
const instanceSideFeast=q.instanceSideFeast;
const instanceDelivery=q.instanceDelivery;
const instanceMetas=q.instanceMetas;
const instanceMods=q.instanceMods;
const instancePulsePlan=q.instancePulsePlan;
const instanceSizeOver=q.instanceSizeOver;
const instanceSummon=q.instanceSummon;
const makeSkillInstance=q.makeSkillInstance;
const resolveSizeOver=q.resolveSizeOver;
const socketSpec=q.socketSpec;
const instanceChannel=q.instanceChannel;
const skillContextTags=q.skillContextTags;
const summonCrewOf=q.summonCrewOf;
const supportFitsInst=q.supportFitsInst;
const supportRidesMinions=q.supportRidesMinions;
const SKILLS=q.SKILLS;
const MONSTERS=q.MONSTERS;
const SUPPORT_POWER_TARGET=q.SUPPORT_POWER_TARGET;
const TERRAFORM_LIST=q.TERRAFORM_LIST;
const terraformFxStat=q.terraformFxStat;
const terraformStat=q.terraformStat;
const sameStory=q.sameStory;
const LOS_CFG=q.LOS_CFG;
const SIM_TAP={get current(){return w.observers;}};
function flattenPulseQueue(appended, cadence) {
  const queue = [];
  for (const g of appended) {
    const gStep = cadence ?? g.intervalStep ?? 1;
    let gDelay = g.delay;
    let gDmg = g.dmgMult ?? 1;
    let gRad = g.radiusMult ?? 1;
    for (let k = 0; k < Math.max(1, g.count ?? 1); k++) {
      queue.push({ delay: Math.max(0.05, gDelay), dmgMult: gDmg, radiusMult: gRad });
      gDelay = Math.max(0.05, (g.interval ?? g.delay) * Math.pow(gStep, k));
      gDmg *= g.dmgStep ?? 1;
      gRad *= g.radiusStep ?? 1;
    }
  }
  return queue;
}
w.projectileArts = new ProjectileArts(
  w,
  (caster, inst, target, power, origin, tier) => w.resolveHit(caster, inst, target, power, 1, void 0, false, false, void 0, origin, tier),
  (source, target, amount, type) => {
    const before = target.life;
    applyDot(target, amount, type);
    w.recordIndirectDamage(target, source, before);
  }
);
w.cohortArts = new CohortArts(
  w,
  (host, kit) => w.forwardSummonSockets(host, kit),
  (body, inst) => {
    if (inst.def.delivery.type === "aura") {
      w.deactivateAura(body, inst.def.id);
      w.activateAura(body, inst, inst.def.delivery, body.sheet.get("aoeRadius", skillContextTags(inst), instanceMods(inst)));
    }
  },
  (body, spec) => {
    if (!body.owner || !body.summonInst) return null;
    const d = instanceDelivery(body.summonInst);
    if (d.type !== "summon") return null;
    return w.spawnMinion(body.owner, body.summonInst, {
      pos: { ...body.pos },
      tier: body.tier,
      monsterId: body.defId,
      delivery: { ...d, duration: spec.duration, crewOnDeath: void 0 },
      noReplace: true,
      offspring: { maxActive: spec.cap, size: 1, life: spec.life, damage: spec.damage }
    });
  }
);
w.frameArts = new FrameArts(
  w,
  (host, kit) => w.forwardSummonSockets(host, kit),
  (body, count) => {
    const host = body.summonInst, f = frameOf(host), spec = f?.legion;
    if (!host || !body.owner || !spec || body.summonOffspring) return [];
    const d = instanceDelivery(host);
    if (d.type !== "summon") return [];
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = w.spawnMinion(body.owner, host, {
        pos: { x: body.pos.x + Math.cos(i * Math.PI) * body.radius, y: body.pos.y + Math.sin(i * Math.PI) * body.radius },
        tier: body.tier,
        monsterId: spec.monster,
        delivery: { ...d, frame: void 0, shell: void 0, persistent: void 0, poolGroup: void 0, exclusiveGroup: void 0, crewOnDeath: void 0, duration: spec.duration },
        offspring: { maxActive: spec.cap, size: spec.size, life: spec.life, damage: spec.damage }
      });
      if (a) out.push(a);
    }
    return out;
  },
  (owner, host) => w.dismissSummonToggle(owner, host.def.id),
  (body, inst) => w.clearTreeFields(body, inst)
);
w.summonArts = new SummonArts(
  w,
  (owner, inst, pos) => w.spawnMinion(owner, inst, { pos, noReplace: true }),
  (host, skills) => w.forwardSummonSockets(host, skills),
  (body, inst) => {
    if (inst.def.delivery.type === "aura") w.activateAura(
      body,
      inst,
      inst.def.delivery,
      body.sheet.get("aoeRadius", skillContextTags(inst), instanceMods(inst))
    );
  },
  (body, inst) => w.clearTreeFields(body, inst)
);
w.channelFormations = new ChannelFormations(
  w,
  (owner, inst, pos) => w.spawnMinion(owner, inst, { pos, noReplace: true }),
  (body, inst, aim, arrival) => {
    w.executeSkill(body, inst, aim, { noRepeat: true, componentUse: arrival, noCooldown: true, keepFacing: true });
  }
);
w.battleDoctrines = new BattleDoctrines(w);
w.summonPacts = new SummonPacts(w, (owner, inst, opts) => w.spawnMinion(owner, inst, opts));
w.deviceContacts = new DeviceContacts();
w.losMemo = /* @__PURE__ */ new Map();
w.relocationHosts = /* @__PURE__ */ new WeakMap();
Object.assign(w, {
  forwardSummonSockets(summonInst, skills, opts) {
    if (!summonInst)
      return;
    const summonHost = summonInst.def.delivery.type === "summon" || !!instanceSummon(summonInst);
    if (summonHost && !crewBoardingOpen(summonInst, opts?.faction))
      return;
    const carried = summonInst.grafts?.length ? [...summonInst.sockets, ...summonInst.grafts] : summonInst.sockets;
    let grew = true;
    while (grew) {
      grew = false;
      for (const socket of carried) {
        if (!socket || !supportRidesMinions(socket.def))
          continue;
        for (const sk of skills) {
          if (!sk || sk.sockets.some((x) => x?.def.id === socket.def.id))
            continue;
          if (!supportFitsInst(socket.def, sk, socket.rolled))
            continue;
          sk.sockets.push({
            def: socket.def,
            level: socket.level,
            forwarded: true,
            ...socket.rolled ? { rolled: { ...socket.rolled } } : {},
            ...opts?.scale !== void 0 && opts.scale !== 1 ? { forwardScale: opts.scale } : {}
          });
          grew = true;
        }
      }
    }
  },
  resyncMinionSupports(inst) {
    w.frameArts.resync(inst);
    w.summonArts.resync(inst);
    w.cohortArts.resync(inst);
    for (const a of w.actors) {
      if (a.dead || a.construct || a.summonInst !== inst)
        continue;
      for (const sk of a.skills) {
        if (!sk)
          continue;
        for (let i = sk.sockets.length - 1; i >= 0; i--) {
          if (sk.sockets[i]?.forwarded)
            sk.sockets.splice(i, 1);
        }
      }
      w.forwardSummonSockets(inst, a.skills, { faction: a.faction });
      const d = instanceDelivery(inst);
      if (d.type === "summon")
        for (const id of d.crewAuras ?? []) {
          const sk = a.skills.find((s) => s?.def.id === id);
          if (!sk || sk.def.delivery.type !== "aura")
            continue;
          w.deactivateAura(a, id);
          w.activateAura(a, sk, sk.def.delivery, a.sheet.get("aoeRadius", skillContextTags(sk), instanceMods(sk)));
        }
    }
  },
  summonCrewSkills(inst) {
    const resolved = instanceDelivery(inst);
    const d = resolved.type === "summon" ? resolved : instanceSummon(inst);
    return w.summonArts.crew(inst, summonCrewOf(d, (id) => MONSTERS[id], (id) => SKILLS[id]));
  },
  clearTreeFields(caster, inst) {
    w.guardArts.clear(caster, inst);
    w.frameArts.clear(caster, inst);
    w.summonArts.clear(caster, inst);
    w.cohortArts.clear(caster, inst);
    w.channelFormations.clear(caster, inst);
    w.attackSequences.clear(caster, inst);
    w.projectileArts.clear(caster, inst);
    w.challenges.clear(caster, inst);
    const ownsTreePayload = (candidate) => candidate === inst || candidate.invocationHost === inst || candidate.followUpHost === inst || candidate.challengeHost === inst || candidate.guardArtsHost === inst || candidate.projectileHost === inst;
    w.pendingFollowUps = w.pendingFollowUps.filter((p) => p.caster !== caster || !ownsTreePayload(p.inst));
    caster.primedPours = caster.primedPours.filter((p) => p.skillId !== inst.def.id);
    caster.clearTreeChargeClocks(inst);
    if (inst.def.invokes)
      caster.runes = [];
    if (caster.activeAuras.get(inst.def.id)?.inst === inst)
      w.deactivateAura(caster, inst.def.id, true);
    w.clearTreeConstructs(caster, inst);
    caster.castCycles.delete(inst.def.id);
    for (const [key, step] of caster.metaInsts)
      if (step.chainOf === inst.def.id) {
        w.clearTreeFields(caster, step);
        caster.metaInsts.delete(key);
      }
    w.retireTreeBuffs(caster, inst);
    w.pendingFuses = w.pendingFuses.filter((f) => f.caster !== caster || !ownsTreePayload(f.inst));
    w.pendingBlinks = w.pendingBlinks.filter((b) => {
      const keep = b.actor !== caster || !b.inst || !ownsTreePayload(b.inst);
      if (!keep && b.visual)
        b.visual.life = 0;
      return keep;
    });
    w.pendingRepeats = w.pendingRepeats.filter((r) => r.caster !== caster || !ownsTreePayload(r.inst));
    w.pendingSalvos = w.pendingSalvos.filter((r) => r.caster !== caster || !ownsTreePayload(r.inst));
    w.pendingSteps = w.pendingSteps.filter((r) => r.caster !== caster || !ownsTreePayload(r.inst));
    w.projectiles = w.projectiles.filter((p) => p.caster !== caster || !ownsTreePayload(p.inst) && w.recallTreeSpears.get(p.inst) !== inst);
    for (const p of w.projectiles)
      if (p.caster === caster && p.suffuse?.inst === inst)
        delete p.suffuse;
    if (caster.casting?.inst === inst)
      caster.casting = null;
    if (caster.shellGuard?.fromAura === inst.def.id)
      caster.shellGuard = void 0;
    for (let i = w.zones.length - 1; i >= 0; i--) {
      const z = w.zones[i];
      if (z.caster !== caster || !ownsTreePayload(z.inst))
        continue;
      w.expireZone(z);
      w.zones.splice(i, 1);
    }
  },
  clearSummonReleaseFields(owner, inst) {
    w.frameArts.clear(owner, inst);
    const d = instanceDelivery(inst);
    if (d.type !== "summon" || !d.strikeRelease && !d.arts && !d.cohort && !d.frame)
      return;
    const payloads = [
      ...w.projectiles,
      ...w.zones,
      ...w.pendingRepeats,
      ...w.pendingFuses,
      ...w.pendingSalvos,
      ...w.pendingSteps,
      ...w.pendingFollowUps
    ];
    const bodies = /* @__PURE__ */ new Set([...w.actors, ...payloads.map((p) => p.caster)]);
    for (const body of bodies)
      if (body.owner === owner && body.summonInst === inst) {
        const skills = /* @__PURE__ */ new Set([
          ...body.skills.filter((s) => !!s),
          ...payloads.filter((p) => p.caster === body).map((p) => p.inst)
        ]);
        for (const skill of skills)
          w.clearTreeFields(body, skill);
      }
  },
  movementLocked(a) {
    if (a.statuses.some((s) => s.remaining > 0 && STATUS_DEFS[s.id]?.immobilize))
      return true;
    if (a.magicPack && a.sheet.getSourceMods("magicPack:beamChannel"))
      return true;
    if (a.magicPack && a.sheet.getSourceMods("magicPack:eventChannel"))
      return true;
    if (a.dash || a.leap || a.caromRun || a.isStunned() || a.dead || a.anchored || a.passive && !a.driven && !(a.defId && MONSTERS[a.defId]?.brain?.behavior?.haunt))
      return true;
    for (const au of a.activeAuras.values()) {
      const ad = au.inst.def.delivery;
      if (ad.type === "aura" && ad.moveFactor === 0)
        return true;
    }
    if (a.casting) {
      if (a.casting.mode === "channel") {
        return (a.casting.gather ?? instanceChannel(a.casting.inst))?.move === "immobile" && w.channelMobility(a, a.casting.inst) <= 0;
      }
      if (a.casting.mode === "guard")
        return false;
      return w.castMoveFactor(a, a.casting.inst) <= 0;
    }
    return false;
  },
  tryShellBlock(victim, threatPos, packet, attacker) {
    if (w.tryShellPool(victim, threatPos, packet, victim.shellGuard))
      return true;
    for (const body of victim.summonShells ?? []) {
      if (body.dead || !w.actors.includes(body)) {
        victim.summonShells?.delete(body);
        continue;
      }
      if (!body.summonShell || body.owner !== victim || body.dead || body.downed || victim.dead || victim.downed)
        continue;
      if (!body.summonInst || !victim.skills.includes(body.summonInst))
        continue;
      const before = body.shellGuard?.pool ?? 0;
      const blocked = w.tryShellPool(victim, threatPos, packet, body.shellGuard);
      if (attacker && (body.shellGuard?.pool ?? 0) < before) {
        w.applyThorns(body, attacker);
        w.frameArts.absorbed(body, attacker, before - (body.shellGuard?.pool ?? 0));
      }
      if (blocked)
        return true;
    }
    return false;
  },
  mintMetaInstance(caster, host, skillId) {
    const key = host.def.id + ":" + skillId;
    let inst = caster.metaInsts.get(key);
    const relocateConstruct = SKILLS[skillId].effects.some((fx) => fx.type === "relocateConstruct");
    if (!inst || inst.level !== effectiveSkillLevel(host) || relocateConstruct && w.relocationHosts.get(inst) !== host) {
      inst = makeSkillInstance(SKILLS[skillId], effectiveSkillLevel(host));
      inst.hostSkillId = host.def.effects.some((e) => e.type === "commandMinions") ? void 0 : host.def.id;
      caster.metaInsts.set(key, inst);
      if (relocateConstruct)
        w.relocationHosts.set(inst, host);
    }
    w.frameArts.bindCommand(host, inst);
    return inst;
  },
  autonomousMetas(caster, reserved) {
    const seen = new Set(caster.skills.flatMap((s) => s ? [s.def.id] : []));
    const commands = [];
    for (const host of caster.skills) {
      if (!host || reserved?.has(host.def.id) || caster.aiSkillBans?.has(host.def.id))
        continue;
      for (const meta of instanceMetas(host)) {
        if (!SKILLS[meta.skillId]?.ai?.autonomousMeta || seen.has(meta.skillId))
          continue;
        seen.add(meta.skillId);
        commands.push(w.mintMetaInstance(caster, host, meta.skillId));
      }
    }
    return commands;
  },
  deviceCommandUseful(caster, inst) {
    const spec = inst.def.ai?.deployed;
    if (!spec)
      return true;
    const devices = w.actors.filter((c) => c.owner === caster && !c.dead && c.construct?.kind === spec.kind && !(c.construct.timer > 0) && c.construct.detonationLeft === void 0 && !!c.construct.castInst);
    if (devices.length < (spec.minCount ?? 1))
      return false;
    const targets = /* @__PURE__ */ new Set();
    for (const c of devices) {
      const payload = c.construct.castInst, delivery = instanceDelivery(payload);
      const base = spec.radius ?? (delivery.type === "nova" || delivery.type === "ground" ? delivery.radius : payload.def.ai?.range ?? 0);
      const radius = base * c.sheet.get("aoeRadius", skillContextTags(payload), instanceMods(payload));
      for (const prey of w.enemiesOf(c)) {
        if (!prey.construct && sameStory(c, prey) && dist(c.pos, prey.pos) - prey.radius <= radius && w.lineOfFire(c.pos, prey.pos, c.tier))
          targets.add(prey.id);
      }
    }
    return targets.size >= (spec.minTargets ?? 1);
  },
  losCached(a, b) {
    const stride = 2 ** 26;
    if (a.id >= stride || b.id >= stride)
      return w.lineOfSight(a.pos, b.pos, a.tier, b.tier);
    const key = a.id * stride + b.id;
    const hit = w.losMemo.get(key);
    if (hit && hit.until > w.time && hit.fromTier === a.tier && hit.toTier === b.tier)
      return hit.ok;
    const ok = w.lineOfSight(a.pos, b.pos, a.tier, b.tier);
    if (w.losMemo.size > 4096) {
      let drop = w.losMemo.size - 3072;
      for (const k of w.losMemo.keys()) {
        w.losMemo.delete(k);
        if (--drop <= 0)
          break;
      }
    }
    const j = LOS_CFG.memoJitter;
    const legacyKey = a.id * 1e6 + b.id;
    const ttl = j > 0 ? LOS_CFG.memoTtl * (1 - j / 2 + j * ((Math.imul(legacyKey, 2654435761) >>> 16) / 65536)) : LOS_CFG.memoTtl;
    w.losMemo.set(key, { ok, until: w.time + ttl, fromTier: a.tier, toTier: b.tier });
    return ok;
  },
  echoCeiling(caster, inst) {
    const { total } = skillDamageBands(caster, inst);
    const worth = caster.sheet.get("damage", skillContextTags(inst, ["physical"]), instanceMods(inst)) * (inst.def.addedEffectiveness ?? 1);
    if (worth <= 0)
      return 0;
    const held = caster.buffs.get("echoing_might")?.def.mods?.find((m) => m.stat === "addedPhysical")?.value ?? 0;
    const own = Math.max(0, (total.lo + total.hi) / 2 - held * worth);
    return (SUPPORT_POWER_TARGET.high - 1) * own / worth;
  },
  consumeChargeCost(caster, inst) {
    const cc = instanceChargeCost(inst);
    if (!cc)
      return { mult: 1, consumed: 0 };
    const pay = (cost) => {
      const have = caster.charges.get(cost.charge) ?? 0;
      const consumed = cost.amount === "all" ? have : Math.min(have, cost.amount);
      caster.spendCharge(cost.charge, consumed);
      return { mult: cost.damagePerCharge && consumed > 0 ? 1 + cost.damagePerCharge * consumed : 1, consumed };
    };
    const paid = pay(cc);
    const feast = instanceSideFeast(inst);
    return feast ? { mult: paid.mult * pay(feast).mult, consumed: paid.consumed } : paid;
  },
  mintAftermath(caster, inst, at, radius, shape, facing, useMult, tags, extra, arcRad, edgeFrac, walkFacing, tier = caster.tier) {
    const burstDelivery = instanceDelivery(inst);
    const burstVoice = burstDelivery.type === "nova" ? burstDelivery.fx ?? skillBurstVoice(inst.def.id) : burstDelivery.type === "melee" ? burstDelivery.fx ?? skillStrikeVoice(inst.def.id) : burstDelivery.type === "cone" ? skillStrikeVoice(inst.def.id) : burstDelivery.type === "leap" ? skillMovementVoice(inst.def.id, "impact") : burstDelivery.type === "storm" ? skillPresenceVoice(inst.def.id, "pulse") ?? burstDelivery.fx : void 0;
    const cadence = socketSpec(inst, "cadence")?.intervalStep;
    const pPlan = instancePulsePlan(inst);
    const pSpec = pPlan.native;
    const pulseN = Math.max(0, (pSpec ? pSpec.count ?? 1 : 0) + Math.round(caster.sheet.get("pulseCount", tags, extra)));
    const pDelay = pSpec?.delay ?? 1;
    const pInterval = pSpec?.interval ?? pDelay;
    const pStep = cadence ?? pSpec?.intervalStep ?? 1;
    const pQueue = flattenPulseQueue(pPlan.appended, cadence);
    let pulseSpan = 0;
    if (pulseN > 0) {
      pulseSpan = pDelay + 0.1;
      let gap = pInterval;
      for (let k = 1; k < pulseN; k++) {
        pulseSpan += gap;
        gap = Math.max(0.05, gap * pStep);
      }
      for (const q of pQueue)
        pulseSpan += q.delay;
    }
    const pulseFor = (extraDelay) => pulseN > 0 ? {
      delay: pDelay,
      interval: pInterval,
      intervalStep: pStep,
      dmgMult: pSpec?.dmgMult ?? 1,
      dmgStep: pSpec?.dmgStep ?? 1,
      radiusMult: pSpec?.radiusMult ?? 1,
      radiusStep: pSpec?.radiusStep ?? 1,
      left: pulseN,
      next: w.time + extraDelay + pDelay,
      queue: pQueue.length ? [...pQueue] : void 0
    } : void 0;
    if (pulseN > 0) {
      w.zones.push({
        tier,
        pos: vec(at.x, at.y),
        radius,
        caster,
        inst,
        color: inst.def.color,
        delay: 0,
        exploded: true,
        linger: pulseSpan,
        linger0: pulseSpan,
        tickInterval: Infinity,
        tickTimer: Infinity,
        shape,
        facing,
        arcRad,
        edgeFrac,
        fx: burstVoice,
        dmgMult: useMult,
        depth: 0,
        pulse: pulseFor(0)
      });
    }
    const plan = instanceCascadePlan(inst, "forward");
    const nativeCount = (plan.native?.count ?? 0) + Math.round(caster.sheet.get("aoeCascade", tags, extra));
    const stepScale = caster.sheet.get("cascadeStep", tags, extra);
    const walkF = walkFacing ?? facing;
    const walkPoints = (spec, count, from) => {
      const pts = [];
      if (count <= 0)
        return pts;
      const dir = spec?.dir ?? "forward";
      const stepLen = (spec?.step ?? radius * 1.4) * stepScale;
      const beatStep = cadence ?? spec?.intervalStep ?? 1;
      let beatAt = 0;
      let beatGap = spec?.interval ?? 0;
      for (let k = 1; k <= count; k++) {
        beatAt += beatGap;
        beatGap = Math.max(0.02, beatGap * beatStep);
        if (dir === "random") {
          const ra = rand(0, Math.PI * 2);
          const rd = stepLen * rand(0.5, 1.5);
          pts.push({ x: from.x + Math.cos(ra) * rd, y: from.y + Math.sin(ra) * rd, beatAt, k });
        } else {
          const sign = dir === "backward" ? -1 : dir === "axis" ? k % 2 === 1 ? 1 : -1 : 1;
          const reach = dir === "axis" ? Math.ceil(k / 2) * stepLen : k * stepLen;
          pts.push({
            x: from.x + Math.cos(walkF) * reach * sign,
            y: from.y + Math.sin(walkF) * reach * sign,
            beatAt,
            k
          });
        }
      }
      return pts;
    };
    const mintMarch = (from, baseMult, delayBase) => {
      const spec = plan.native;
      const scaleStep = spec?.scaleStep ?? 1;
      const dmgStep = spec?.dmgStep ?? 0.75;
      for (const p of walkPoints(spec, nativeCount, from)) {
        w.zones.push({
          tier,
          pos: vec(p.x, p.y),
          radius: radius * Math.pow(scaleStep, p.k),
          caster,
          inst,
          color: inst.def.color,
          delay: delayBase + p.beatAt,
          exploded: false,
          linger: 0,
          linger0: 0,
          tickInterval: Infinity,
          tickTimer: 0,
          shape,
          facing,
          arcRad,
          edgeFrac,
          fx: burstVoice,
          dmgMult: baseMult * Math.pow(dmgStep, p.k),
          depth: 0
        });
      }
    };
    mintMarch(at, useMult, 0.12);
    for (const r of plan.recasts) {
      const rDmgStep = r.dmgStep ?? 0.75;
      const rScaleStep = r.scaleStep ?? 1;
      for (const p of walkPoints(r, r.count, at)) {
        const mult = useMult * Math.pow(rDmgStep, p.k);
        const delayBase = 0.12 + p.beatAt;
        const quakes = pulseN > 0;
        w.zones.push({
          tier,
          pos: vec(p.x, p.y),
          radius: radius * Math.pow(rScaleStep, p.k),
          caster,
          inst,
          color: inst.def.color,
          delay: delayBase,
          exploded: false,
          linger: quakes ? pulseSpan : 0,
          linger0: quakes ? pulseSpan : 0,
          tickInterval: Infinity,
          tickTimer: quakes ? Infinity : 0,
          shape,
          facing,
          arcRad,
          edgeFrac,
          fx: burstVoice,
          dmgMult: mult,
          depth: 0,
          pulse: pulseFor(delayBase)
        });
        mintMarch(vec(p.x, p.y), mult, delayBase);
      }
    }
  },
  dropLingerField(caster, inst, at, useMult = 1) {
    const tags = skillContextTags(inst, grantedTags(inst));
    const extra = instanceMods(inst);
    const fieldSecs = caster.sheet.get("lingerField", tags, extra);
    const healField = socketSpec(inst, "healField");
    if (fieldSecs <= 0 && !healField)
      return;
    const zoneEmit = socketSpec(inst, "zoneEmit");
    const sizeOver = resolveSizeOver(instanceSizeOver(inst));
    const grow = socketSpec(inst, "zoneGrow");
    const rotate = caster.sheet.get("aoeSpin", tags, extra, 0);
    const pend = hostSockets(inst).find((s) => s.def.pendulum)?.def.pendulum;
    const radius = 80 * caster.sheet.get("aoeRadius", tags, extra);
    const linger = Math.max(fieldSecs, healField ? 4 : 0) * caster.sheet.get("effectDuration", tags, extra);
    w.zones.push({
      tier: caster.tier,
      pos: vec(at.x, at.y),
      radius,
      caster,
      inst,
      color: healField ? "#8ae0a8" : inst.def.color,
      delay: 0,
      exploded: true,
      linger,
      tickInterval: 0.5,
      tickTimer: 0.5,
      shape: caster.sheet.get("aoeShape", tags, extra),
      facing: caster.facing,
      healTick: healField?.amount,
      dmgMult: healField ? 0 : 0.4 * useMult,
      depth: 1,
      forceDamage: !healField,
      emit: zoneEmit ? { skillId: zoneEmit.skillId, interval: zoneEmit.interval, at: zoneEmit.at } : void 0,
      madden: w.maddenBankOf(inst),
      sizeOver,
      radius0: sizeOver ? radius : void 0,
      linger0: sizeOver ? linger : void 0,
      grow,
      rotate: rotate !== 0 ? rotate : void 0,
      pendulum: pend ? { arc: pend.arcDeg * Math.PI / 180, period: pend.period, base: caster.facing } : void 0
    });
  },
  layFissure(caster, inst, from, ang, d, useMult, flatBonus, branches, fan = 0, tier = caster.tier) {
    const fz = d.fissure;
    const tags = skillContextTags(inst, grantedTags(inst));
    const extra = instanceMods(inst);
    const aoeScale = caster.sheet.get("aoeRadius", tags, extra);
    const durScale = caster.sheet.get("effectDuration", tags, extra);
    const step = fz.step ?? d.radius * 1.1;
    const n = Math.min(28, Math.max(2, Math.ceil(fz.length / step)));
    const warp = socketSpec(inst, "fissurePath");
    const pts = [];
    if (warp?.kind === "orbit") {
      const R = Math.max(56, dist(caster.pos, from)) + fan * step * 2.2;
      const cx = caster.pos.x, cy = caster.pos.y;
      for (let i = 0; i < n; i++) {
        const th = ang + step * (i + 0.5) / R;
        pts.push({ x: cx + Math.cos(th) * R, y: cy + Math.sin(th) * R, ang: th + Math.PI / 2 });
      }
    } else if (warp?.kind === "spiral") {
      const turns = warp.turns ?? 1.6;
      const rMax = Math.max(40, fz.length / (Math.PI * turns));
      const r0 = Math.max(14, step * 0.6);
      const grow = (rMax - r0) / (Math.PI * 2 * turns);
      let th = ang, r = r0;
      for (let i = 0; i < n; i++) {
        pts.push({ x: from.x + Math.cos(th) * r, y: from.y + Math.sin(th) * r, ang: th + Math.PI / 2 });
        const dth = step / Math.max(16, r);
        th += dth;
        r = Math.min(rMax, r + grow * dth);
      }
    } else if (warp?.kind === "serpent") {
      const amp = (warp.waveDeg ?? 38) * Math.PI / 180;
      let px = from.x, py = from.y;
      for (let i = 0; i < n; i++) {
        const h = ang + Math.sin(i * 0.85) * amp;
        px += Math.cos(h) * step;
        py += Math.sin(h) * step;
        pts.push({ x: px, y: py, ang: h });
      }
    } else {
      for (let i = 0; i < n; i++) {
        pts.push({
          x: from.x + Math.cos(ang) * step * (i + 0.5),
          y: from.y + Math.sin(ang) * step * (i + 0.5),
          ang
        });
      }
    }
    const volatile = socketSpec(inst, "fissureVolatile");
    const aftershock = socketSpec(inst, "fissureAftershock");
    const roulette = socketSpec(inst, "fissureRoulette");
    const segLinger = (secs) => volatile || aftershock || roulette ? Math.max(secs, 5) : secs;
    const ownFizLinger = (d.lingerDuration ?? 0) > 0;
    const fizSizeOver = resolveSizeOver(instanceSizeOver(inst));
    const maddenBank = w.maddenBankOf(inst);
    const lay = (px, py, segAng, delay, mult, linger) => {
      const half = step / 2;
      w.zones.push({
        tier,
        pos: w.clampPos(vec(px, py), 10, void 0, { tier }),
        radius: d.radius * aoeScale * (fizSizeOver?.from ?? 1),
        seg: {
          ax: px - Math.cos(segAng) * half,
          ay: py - Math.sin(segAng) * half,
          bx: px + Math.cos(segAng) * half,
          by: py + Math.sin(segAng) * half
        },
        caster,
        inst,
        color: inst.def.color,
        delay,
        exploded: false,
        linger,
        tickInterval: ownFizLinger ? d.tickInterval ?? 0.5 : Infinity,
        tickTimer: ownFizLinger ? 0 : Infinity,
        linger0: linger,
        sizeOver: fizSizeOver,
        radius0: fizSizeOver ? d.radius * aoeScale : void 0,
        shape: 0,
        facing: segAng,
        dmgMult: mult,
        depth: 1,
        emit: linger > 0 ? d.emit : void 0,
        emitStep: linger > 0 ? socketSpec(inst, "cadence")?.intervalStep ?? d.emit?.intervalStep : void 0,
        exposure: (() => {
          const after = socketSpec(inst, "exposure")?.after ?? d.exposure;
          return after && linger > 0 ? { after, dwell: /* @__PURE__ */ new Map() } : void 0;
        })(),
        madden: linger > 0 ? maddenBank : void 0,
        volatile: linger > 0 && volatile ? { ...volatile, next: w.time + delay + volatile.interval } : void 0,
        aftershock: linger > 0 && aftershock ? { ...aftershock, readyAt: w.time + delay } : void 0,
        roulette: linger > 0 && roulette ? { ...roulette, next: w.time + delay + roulette.interval, armedUntil: 0 } : void 0,
        flatBonus
      });
    };
    for (let i = 0; i < n; i++) {
      const pt = pts[i];
      const delay = (d.delay ?? 0.1) + step * i / fz.speed;
      lay(pt.x, pt.y, pt.ang, delay, useMult, segLinger(d.lingerDuration ?? 0) * durScale);
      if (branches > 0 && i > 0 && i % Math.max(1, Math.floor(n / (branches + 1))) === 0) {
        const side = Math.floor(i / Math.max(1, Math.floor(n / (branches + 1)))) % 2 === 0 ? 1 : -1;
        const bAng = pt.ang + side * (fz.branchDeg ?? 42) * Math.PI / 180;
        const bn = Math.max(2, Math.floor(n / 2));
        for (let k = 0; k < bn; k++) {
          lay(pt.x + Math.cos(bAng) * step * (k + 0.5), pt.y + Math.sin(bAng) * step * (k + 0.5), bAng, delay + step * k / fz.speed, useMult * 0.75, segLinger((d.lingerDuration ?? 0) * 0.7) * durScale);
        }
      }
    }
    const reclose = socketSpec(inst, "fissureReclose");
    const closeSpec = fz.close ?? (reclose ? { delay: reclose.interval, damageScale: reclose.damageScale } : void 0);
    if (closeSpec) {
      let passes = 1;
      if (reclose) {
        for (let k = 0; k < reclose.times && chance(reclose.chance); k++)
          passes++;
      }
      const openDone = (d.delay ?? 0.1) + step * n / fz.speed;
      const zipDur = step * n / (fz.speed * 1.4);
      for (let pass = 0; pass < passes; pass++) {
        const start = openDone + closeSpec.delay + pass * (zipDur + (reclose?.interval ?? 0.8));
        const scale = pass === 0 ? closeSpec.damageScale : reclose.damageScale;
        for (let i = 0; i < n; i++) {
          const pt = pts[i];
          lay(pt.x, pt.y, pt.ang, start + step * (n - 1 - i) / (fz.speed * 1.4), useMult * scale, 0);
        }
      }
    }
  },
  moveBlast(caster, inst, at, phase = "arrive") {
    const tags = skillContextTags(inst, grantedTags(inst));
    const extra = instanceMods(inst);
    const scale = caster.sheet.get("moveExplode", tags, extra) + (phase === "depart" ? caster.sheet.get("departSplash", tags, extra) : 0);
    if (scale <= 0)
      return;
    const radius = 85 * caster.sheet.get("aoeRadius", tags, extra);
    for (const e of w.enemiesOf(caster)) {
      if (!sameStory(caster, e))
        continue;
      if (dist(at, e.pos) - e.radius > radius)
        continue;
      w.resolveHit(caster, inst, e, scale, 1, void 0, true);
    }
    w.flashes.push({
      pos: vec(at.x, at.y),
      radius,
      color: cosmeticSkillPaint(w, caster, inst.def.id).color ?? inst.def.color,
      life: 0.3,
      maxLife: 0.3,
      fx: skillMovementVoice(inst.def.id, "impact"),
      facing: caster.facing,
      recoveryCueTier: caster.tier
    });
    w.frontSplash(caster, inst, at, radius);
    w.strikeSurfaces(caster, at, radius);
  },
  mintTrailPatch(a, inst, spec, at, facing, linger) {
    const dso = resolveSizeOver(spec.sizeOver);
    const hold = linger ?? spec.duration;
    w.zones.push({
      pos: vec(at.x, at.y),
      radius: spec.radius * (dso?.from ?? 1),
      tier: a.tier,
      caster: a,
      inst,
      color: inst.def.color,
      delay: 0,
      exploded: true,
      linger: hold,
      linger0: hold,
      tickInterval: spec.tickInterval ?? 0.4,
      tickTimer: 0.2,
      shape: 0,
      facing,
      dmgMult: spec.damageScale ?? 0.5,
      depth: 1,
      sizeOver: dso,
      radius0: dso ? spec.radius : void 0
    });
  },
  statTrailSpec(mt) {
    return { radius: 32, duration: 2.2, tickInterval: 0.4, damageScale: mt };
  },
  clampGroundTarget(caster, aim, d, inst) {
    const from = caster.pos;
    const dd = dist(from, aim);
    let at;
    if (dd <= d.castRange)
      at = vec(aim.x, aim.y);
    else {
      const ang = angleTo(from, aim);
      at = vec(from.x + Math.cos(ang) * d.castRange, from.y + Math.sin(ang) * d.castRange);
    }
    if (w.skillOcclusion(caster, inst) === "blocked") {
      const clipped = w.clipShot(from, at, caster.tier);
      if (clipped.x !== at.x || clipped.y !== at.y) {
        SIM_TAP.current?.onOccluded?.("place");
        at = clipped;
      }
    }
    return at;
  },
  enemiesOf(actor, sourceTier = actor.tier ?? 0) {
    return w.actors.filter((a) => (w.hostileTo(actor, a, sourceTier) || a.construct?.breakable !== void 0 && a.owner === actor && ((a.tier ?? 0) === sourceTier || w.zone.tiers?.rimDuels)) && !a.dead && !a.untargetable && !a.downed);
  },
  healAlliesInArea(caster, inst, accepts, mult = 1, quiet = false, once, tier = caster.tier) {
    const fxs = inst.def.effects.filter((fx) => fx.type === "heal" || fx.type === "cleanse");
    if (!fxs.length)
      return;
    for (const a of w.actors) {
      if (a.dead || a.downed || a.untargetable || a.construct || a.team !== caster.team || a.tier !== tier)
        continue;
      if (once?.has(a.id))
        continue;
      if (!accepts(a))
        continue;
      let touched = false;
      for (const fx of fxs) {
        if (fx.type === "heal" && fx.excludeCaster && a === caster)
          continue;
        touched = true;
        if (fx.type === "heal")
          w.applyHealChained(caster, inst, a, fx, mult, quiet);
        else
          w.cleanseActor(a, fx.count ?? 2);
      }
      if (touched)
        once?.add(a.id);
    }
  },
  spawnAftershocks(caster, inst, at, radius, shape, depth = 0, tier = caster.tier) {
    if (depth > 0)
      return;
    const tags = skillContextTags(inst);
    const extra = instanceMods(inst);
    const scatter = Math.round(caster.sheet.get("aoeScatter", tags, extra));
    for (let i = 0; i < scatter; i++) {
      const ang = rand(0, Math.PI * 2);
      const r = rand(radius * 0.4, radius * 1.1);
      w.zones.push({
        tier,
        pos: w.clampPos(vec(at.x + Math.cos(ang) * r, at.y + Math.sin(ang) * r), 10, void 0, { tier }),
        radius: radius * 0.5,
        caster,
        inst,
        color: inst.def.color,
        delay: 0.3 + i * 0.12,
        exploded: false,
        linger: 0,
        tickInterval: 0.5,
        tickTimer: 0,
        shape,
        facing: ang,
        dmgMult: 0.5,
        depth: 1
      });
    }
  },
  releaseStruckSummons(caster, inst, touches, struck, direction = caster.facing) {
    const receptive = w.strikeReleaseBodies.get(caster);
    if (!receptive?.size)
      return;
    const tags = skillContextTags(inst);
    for (const body of [...receptive]) {
      if (body.dead || !w.actors.includes(body)) {
        receptive.delete(body);
        continue;
      }
      if (body.owner !== caster || body.team !== caster.team || body.dead || body.downed || body.summonReform || body.untargetable || body.summonOffspring || body.summonInst?.companionGrant || !sameStory(caster, body) || !body.summonInst || struck?.has(body.id) || !touches(body))
        continue;
      const d = instanceDelivery(body.summonInst);
      const release = d.type === "summon" ? d.strikeRelease : void 0;
      if (!release || !release.tags.every((tag) => tags.has(tag)))
        continue;
      const payload = body.skills.find((skill) => skill?.def.id === release.skill);
      if (!payload || payload.def.delivery.type !== "projectile")
        continue;
      struck?.add(body.id);
      const duration = Math.max(0.1, release.reformTime * caster.sheet.get("minionRespawnTime", skillContextTags(body.summonInst), instanceMods(body.summonInst)));
      body.summonReform = { remaining: duration, duration, invulnerable: body.invulnerable, untargetable: body.untargetable };
      body.invulnerable = true;
      body.untargetable = true;
      body.casting = null;
      body.sheet.setSource("summon:reform", [mod("moveSpeed", "more", -1)]);
      body.facing = direction;
      w.executeSkill(body, payload, vec(body.pos.x + Math.cos(direction) * 800, body.pos.y + Math.sin(direction) * 800), { keepFacing: true, noCooldown: true, noRepeat: true, componentUse: true });
    }
  },
  updateTerraforms(dt) {
    if (w.transientDoodads.length) {
      let expired = false;
      for (const t of w.transientDoodads) {
        t.ttl -= dt;
        t.d.wilt = clamp(1 - t.ttl / t.maxTtl, 0, 1);
        if (t.ttl <= 0)
          expired = true;
      }
      if (expired) {
        const dead = new Set(w.transientDoodads.filter((t) => t.ttl <= 0).map((t) => t.d));
        w.transientDoodads = w.transientDoodads.filter((t) => t.ttl > 0);
        w.combatGrowthDoodads = w.combatGrowthDoodads.filter((d) => !dead.has(d));
      }
    }
    for (const a of w.actors) {
      if (a.dead)
        continue;
      for (const def of TERRAFORM_LIST) {
        const rate = a.sheet.get(terraformStat(def.id));
        if (rate <= 0)
          continue;
        const cds = a.terraformCd ?? (a.terraformCd = {});
        cds[def.id] = (cds[def.id] ?? def.interval * 0.4) - dt * rate;
        if (cds[def.id] > 0)
          continue;
        cds[def.id] = def.interval;
        const mine = w.transientDoodads.filter((t) => t.owner === a && t.kind === def.id);
        if (mine.length >= def.maxAlive) {
          const oldest = mine.reduce((m, t) => t.ttl < m.ttl ? t : m);
          oldest.ttl = Math.min(oldest.ttl, 0.8);
        }
        const ang = rand(0, Math.PI * 2);
        const r = rand(def.radius[0], def.radius[1]);
        const at = w.findFreeSpot(vec(a.pos.x + Math.cos(ang) * r, a.pos.y + Math.sin(ang) * r), def.size[1]);
        const d = {
          pos: at,
          radius: rand(def.size[0], def.size[1]),
          kind: def.doodadKind,
          rot: rand(0, Math.PI * 2),
          wilt: 0,
          tier: a.tier
        };
        if (def.effect && a.sheet.get(terraformFxStat(def.id)) > 0) {
          d.effect = {
            id: def.effect.id,
            target: "owner",
            ownerId: a.id,
            interval: def.effect.interval,
            radius: def.effect.radius,
            chance: def.effect.chance,
            power: def.effect.base + def.effect.perLevel * Math.max(0, a.level - 1)
          };
        }
        w.combatGrowthDoodads.push(d);
        const life = rand(def.ttl[0], def.ttl[1]);
        w.transientDoodads.push({ d, ttl: life, maxTtl: life, owner: a, kind: def.id });
      }
    }
  },
  doctrineGrowths(owner, kind) {
    return w.transientDoodads.filter((t) => t.owner === owner && t.kind === kind && t.ttl > 0);
  },
  updateDoodadEffects(dt) {
    for (const d of w.combatGrowthDoodads) {
      const eff = d.effect;
      if (!eff)
        continue;
      if (d.felled)
        continue;
      eff.cd = (eff.cd ?? 0) - dt;
      if (eff.cd > 0)
        continue;
      eff.cd = eff.interval;
      w.doodadEffects[eff.id]?.(d, eff);
    }
  },
  isEffectTarget(x, eff, d) {
    if (x.dead || x.downed || x.passive || x.construct)
      return false;
    if (!sameStory(x, d))
      return false;
    if (eff.target === "owner") {
      const owner = w.actors.find((a) => a.id === eff.ownerId && !a.dead);
      if (!owner)
        return false;
      return owner.team === "player" ? x.team === "enemy" : x.team === "player" && x.kind !== "minion" && x.kind !== "mercenary";
    }
    if (eff.target === "ally")
      return !!eff.faction && x.faction === eff.faction;
    if (x.team === "player")
      return x.kind !== "minion" && x.kind !== "mercenary";
    return x.team === "enemy" && (eff.faction === void 0 || x.faction !== eff.faction);
  },
  nearestInReach(pos, radius, accept) {
    let best = null, bd = Infinity;
    for (const x of w.actors) {
      if (!accept(x))
        continue;
      const dd = dist(x.pos, pos) - x.radius;
      if (dd > radius)
        continue;
      if (dd < bd) {
        bd = dd;
        best = x;
      }
    }
    return best;
  },
  effectGrowthLash(d, eff) {
    const victim = w.nearestInReach(d.pos, eff.radius, (x) => w.isEffectTarget(x, eff, d));
    if (!victim)
      return;
    if (!chance(eff.chance))
      return;
    const taken = mitigateTyped(victim, { physical: eff.power });
    if (taken <= 0 || victim.invulnerable)
      return;
    victim.life -= taken;
    victim.hitFlash = 0.15;
    victim.hitFlashType = "physical";
    w.damageText(victim, taken, "#6ac860", 12);
    w.flashes.push({ pos: vec(d.pos.x, d.pos.y), radius: eff.radius * 0.7, color: "#6ac860", life: 0.22, maxLife: 0.22 });
    if (victim.life <= 0 && !victim.dead)
      w.kill(victim);
  },
  chargesThroughSeat(minion, seat) {
    if (!minion.owner || !(minion.dash || minion.frameCharging || minion.frameState?.order))
      return false;
    if (minion.team !== seat.team || !w.seatOf(seat))
      return false;
    minion.keeperYieldUntil = w.time + 0.5;
    return true;
  },
  updateGroundDevice(c, dt) {
    const st = c.construct;
    switch (st.kind) {
      case "trap": {
        const wasArming = st.timer > 0;
        st.timer = Math.max(0, st.timer - dt);
        if (st.timer > 0)
          break;
        const prey = w.enemiesOf(c).find((e) => deviceContactEligible(c, e, e.flying || !!e.leap || w.levitating(e)) && (dist(c.pos, e.pos) - e.radius <= st.range || !wasArming && w.deviceContacts.crosses(c, e)));
        if (prey && st.castInst) {
          c.useLock = 0;
          c.mana = c.maxMana();
          w.executeSkill(c, st.castInst, prey.pos, { keepFacing: true });
          w.kill(c, true);
        }
        break;
      }
      case "mine":
        st.timer = Math.max(0, st.timer - dt);
        break;
      default:
        return false;
    }
    return true;
  }
});

return {};
}

function deliveries(w,q,library){
for(const name of ["activateAura","addTether","affordedDest","applyHealChained","applyRestore","associateTreeBuff","bankRune","birthAt","burstDamage","castChrono","clampGroundTarget","clampPos","cleanseActor","clipShot","conjureCloud","conjureGrantsFor","consumeAmmunition","consumeRemnants","consumeStealth","corpseSpawn","critMendMult","dismissExclusiveSummons","dropLingerField","echoToClones","endCarom","enemiesOf","executeSkill","expireZone","failNote","forwardSummonSockets","frontSplash","grantAbsorb","healAlliesInArea","kill","layFissure","lineOfFire","lineOfSight","litePromoteNearest","maddenBankOf","minionsOfGroup","minionsOfSkill","mintAftermath","mintTrailPatch","moveBlast","movementMoment","notice","plantKindle","plantVent","presenceMoment","queueFollowUps","recordCast","releaseStruckSummons","removeCorpse","resolveHit","resolveTargeting","ringAfflictions","rollOwnProcs","showSelfRelease","showSkillArrival","skillOcclusion","spawnAftershocks","spawnConstruct","spawnEchoRiders","spawnMinion","spawnProjectile","spoilStoryAt","stampSkillCooldown","startRestoreStream","statTrailSpec","strikeSurfaces","teleportActor","text","triggerAmbush","tryTame","ultimateFlash"])if(typeof w[name]!=='function')throw Error('Missing prototype delivery service: '+name);
const SECONDARY_LOOKS=q.SECONDARY_LOOKS;
const DEVICE_CFG=library.DEVICE_CFG;
const markBodyAction=q.markBodyAction;
const skillBurstVoice=q.skillBurstVoice;
const skillBeamVoice=q.skillBeamVoice;
const skillStrikeVoice=q.skillStrikeVoice;
const skillMovementVoice=q.skillMovementVoice;
const skillRiteVoice=q.skillRiteVoice;
const skillSelfVoice=q.skillSelfVoice;
const skillPresenceVoice=q.skillPresenceVoice;
const feedingCueFlash=q.feedingCueFlash;
const summonReservationUnit=q.summonReservationUnit;
const summonCapacity=q.summonCapacity;
const summonContractSlots=q.summonContractSlots;
const cosmeticSkillPaint=(_owner,actor,id)=>w.host.presentation?.cosmetic?.(actor.id,id)??{};
const COSMETIC_CFG=q.COSMETIC_CFG;
const castSequenceInstance=library.castSequenceInstance;
const challengeOf=q.challengeOf;
const instanceCastCycle=q.instanceCastCycle;
const skillAbsorbAmount=q.skillAbsorbAmount;
const instanceEffects=q.instanceEffects;
const angleDiff=q.angleDiff;
const angleTo=q.angleTo;
const chance=value=>w.random()<value;
const dist=q.dist;
const pick=values=>values[Math.floor(w.random()*values.length)];
const rand=(a,b)=>a+w.random()*(b-a);
const vec=q.vec;
const replenishingDelivery=q.replenishingDelivery;
const STATUS_DEFS=q.STATUS_DEFS;
const Actor=function(name,team,pos){return w.allocateActor(name,team,pos);};
const nearestBody=q.nearestBody;
const noteBodyHit=q.noteBodyHit;
const DEFENSE_CFG=q.DEFENSE_CFG;
const effectiveSkillLevel=q.effectiveSkillLevel;
const grantedTags=q.grantedTags;
const grimoireForm=q.grimoireForm;
const hostSockets=q.hostSockets;
const instanceAim=q.instanceAim;
const instanceCascadePlan=q.instanceCascadePlan;
const instanceChargeCost=q.instanceChargeCost;
const instanceChargeGain=q.instanceChargeGain;
const instanceDelivery=q.instanceDelivery;
const instanceEchoes=q.instanceEchoes;
const instanceMods=q.instanceMods;
const instancePulsePlan=q.instancePulsePlan;
const instanceSelfStack=q.instanceSelfStack;
const instanceSizeOver=q.instanceSizeOver;
const instanceBirth=q.instanceBirth;
const instanceSummon=q.instanceSummon;
const instanceTargeting=q.instanceTargeting;
const instanceTethers=q.instanceTethers;
const instanceTurret=q.instanceTurret;
const instanceUseCharges=q.instanceUseCharges;
const instanceVariance=q.instanceVariance;
const instanceCurseField=q.instanceCurseField;
const makeSkillInstance=q.makeSkillInstance;
const resolveSizeOver=q.resolveSizeOver;
const rollCount=(spec,bonus)=>spec===undefined?Math.max(0,1+bonus):typeof spec==='number'?Math.max(0,spec+bonus):Math.max(0,spec[0]+bonus+Math.floor(w.random()*(spec[1]-spec[0]+1)));
const socketSpec=q.socketSpec;
const CONSTRUCT_FORWARD_CFG=q.CONSTRUCT_FORWARD_CFG;
const UNLEASH_CFG=q.UNLEASH_CFG;
const AOE_SHAPE=q.AOE_SHAPE;
const bandSwingGeo=q.bandSwingGeo;
const skillContextTags=q.skillContextTags;
const placeAt=q.placeAt;
const SKILLS=q.SKILLS;
const MONSTERS=q.MONSTERS;
const resolveInvocation=q.resolveInvocation;
const RUNE_INFO=q.RUNE_INFO;
const instanceInvocation=q.instanceInvocation;
const makeInvocationPayload=q.makeInvocationPayload;
const mimicCapture=(_owner,actor,source,definition)=>w.mimic.capture(actor,source,definition,w.time);
const mimicRefreshWatch=q.mimicRefreshWatch;
const ELEMENTAL_TYPES=q.ELEMENTAL_TYPES;
const caromCapacity=q.caromCapacity;
const payloadTransition=q.payloadTransition;
const noteProcCue=q.noteProcCue;
const buffWithSource=library.buffWithSource;
const combatCueFlash=q.combatCueFlash;
const CONJURE_CFG=q.CONJURE_CFG;
const $combatOwner = w;
const inAoe = (...a) => w.inAoe(...a), inAoeBody = (...a) => w.inAoeBody(...a), statusReqs = (...a) => w.statusReqs(...a);
const CORPSE_CFG = {
  /** Seconds a fresh corpse stays raisable/detonable. */
  duration: 6,
  /** World cap — the oldest remnant fades first. */
  max: 40,
  /** Producer mints (Exhume's spawnCorpse effect): scatter around the mark,
   *  and the stand-in body's life when no real death backs the corpse. */
  mint: { spread: 42, life: 30, lifePerLevel: 8 },
  /** Multi-corpse feasts (TargetingSpec.plural × the corpseBatch stat). */
  batch: { aoePerExtra: 0.12, durationPerExtra: 0.15, projectilesPerExtra: 1 }
};
function flattenPulseQueue(appended, cadence) {
  const queue = [];
  for (const g of appended) {
    const gStep = cadence ?? g.intervalStep ?? 1;
    let gDelay = g.delay;
    let gDmg = g.dmgMult ?? 1;
    let gRad = g.radiusMult ?? 1;
    for (let k = 0; k < Math.max(1, g.count ?? 1); k++) {
      queue.push({ delay: Math.max(0.05, gDelay), dmgMult: gDmg, radiusMult: gRad });
      gDelay = Math.max(0.05, (g.interval ?? g.delay) * Math.pow(gStep, k));
      gDmg *= g.dmgStep ?? 1;
      gRad *= g.radiusStep ?? 1;
    }
  }
  return queue;
}
function preparePrototype(caster, inst, aim, opts = {}) {
  const effectTier = opts.tier ?? caster.tier;
  if (replenishingDelivery(inst))
    return { completed: false };
  inst = $combatOwner.challenges.prepare(caster, inst, !opts.noRepeat && !opts.noCooldown && !opts.fromFuse);
  inst = castSequenceInstance(caster, inst, !opts.noRepeat && !opts.noCooldown && !opts.fromFuse);
  inst = $combatOwner.attackSequences.prepare(caster, inst, aim, opts.dmgMult ?? 1);
  inst = $combatOwner.projectileArts.prepare(caster, inst, !opts.noRepeat && !opts.noCooldown && !opts.fromFuse);
  inst = $combatOwner.cohortArts.prepare(caster, inst, !opts.noRepeat && !opts.noCooldown && !opts.fromFuse);
  inst = $combatOwner.summonArts.prepare(caster, inst, !opts.noRepeat && !opts.noCooldown && !opts.fromFuse);
  inst = $combatOwner.frameArts.prepare(caster, inst, !opts.noRepeat && !opts.fromFuse);
  const def = inst.def;
  const cosmeticPaint = cosmeticSkillPaint($combatOwner, caster, def.id);
  const cosmeticColor = cosmeticPaint.color ?? def.color;
  const extra = instanceMods(inst);
  w.observers.cast?.(caster, inst, !!opts.noRepeat);
  if (def.selfCleanse && !opts.noRepeat) {
    $combatOwner.ringAfflictions(caster, def.selfCleanse.stacksPortion);
  }
  const tags = skillContextTags(inst, grantedTags(inst));
  let useMult = opts.dmgMult ?? 1;
  const gPow = def.gauge ? inst.state?.gaugePower ?? 1 : 1;
  let targetInfo = opts.targetInfo ?? null;
  if ($combatOwner.lite.liveCount && def.delivery.type === "melee" && def.effects.some((f) => f.type === "grabSeize")) {
    const reach = caster.radius + (def.delivery.range ?? 60) + 24;
    let anyClose = false;
    for (const e of $combatOwner.enemiesOf(caster, effectTier)) {
      if (dist(caster.pos, e.pos) - e.radius <= reach) {
        anyClose = true;
        break;
      }
    }
    if (!anyClose) {
      $combatOwner.litePromoteNearest(caster.pos, { within: reach, max: 1, opposing: caster.team, rank: aim, story: effectTier });
    }
  }
  if (def.empower && !opts.noRepeat) {
    const w2 = DEFENSE_CFG.empower.weights;
    let power = 0;
    for (const e of $combatOwner.enemiesOf(caster, effectTier)) {
      if (e.dead || e.untargetable)
        continue;
      if (dist(caster.pos, e.pos) > def.empower.radius)
        continue;
      power += e.defId && MONSTERS[e.defId]?.boss ? w2.boss : e.rarity === "crowned" ? w2.crowned : e.rarity === "champion" ? w2.champion : e.rarity === "rare" ? w2.rare : e.rarity === "magic" ? w2.magic : w2.normal;
    }
    if (power > 0) {
      if (def.empower.dmgPerPower)
        useMult *= 1 + def.empower.dmgPerPower * power;
      if (def.empower.buffPerPower) {
        caster.addBuff(buffWithSource({ ...def.empower.buffPerPower, stacksOnApply: power }, inst), caster.sheet.get("effectDuration", tags, extra));
      }
      $combatOwner.text(vec(caster.pos.x, caster.pos.y - 22), `power ${power}`, def.color, 11);
    }
  }
  if (def.ultimate && !opts.noRepeat)
    $combatOwner.ultimateFlash(caster, def);
  if (def.chrono && !opts.noRepeat) {
    $combatOwner.castChrono(caster, def.chrono, `chrono:${caster.id}:${def.id}`, def.chrono.duration * caster.sheet.get("effectDuration", tags, extra), def.name);
  }
  {
    const sac = socketSpec(inst, "sacrifice");
    if (sac && !opts.noRepeat) {
      let pick2 = null;
      let best = sac.radius;
      for (const m of $combatOwner.actors) {
        if (m.owner !== caster || m.dead || m.construct)
          continue;
        const dd = dist(caster.pos, m.pos);
        if (dd <= best) {
          best = dd;
          pick2 = m;
        }
      }
      if (pick2) {
        useMult *= 1 + pick2.life * sac.dmgPerLife;
        $combatOwner.kill(pick2, true, caster, "sacrifice");
        const feedingCue = pick2.dead ? feedingCueFlash(pick2.pos, caster, def.feedingCue, "ritual", pick2.tier, pick2.radius) : void 0;
        if (feedingCue)
          $combatOwner.flashes.push(feedingCue);
        if (pick2.dead)
          $combatOwner.showSkillArrival(caster, inst, pick2.pos, pick2.radius + 12, pick2.tier, "sacrifice");
      }
    }
  }
  if (targetInfo?.actor && !targetInfo.actor.dead && (def.delivery.type === "dash" || def.delivery.type === "blink" || def.delivery.type === "leap" || def.delivery.type === "carom")) {
    aim = vec(targetInfo.actor.pos.x, targetInfo.actor.pos.y);
  }
  if (!opts.keepFacing)
    caster.facing = angleTo(caster.pos, aim);
  if (targetInfo?.actor && targetInfo.actor.dead) {
    $combatOwner.failNote(caster, def.id + ":lost", "target lost");
    return { completed: false };
  }
  if (targetInfo?.corpse && !$combatOwner.corpses.includes(targetInfo.corpse)) {
    const fresh = $combatOwner.resolveTargeting(caster, inst, aim);
    if (fresh?.corpse) {
      targetInfo = fresh;
    } else {
      $combatOwner.failNote(caster, def.id + ":lost", "corpse lost");
      return { completed: false };
    }
  }
  if (!targetInfo && !instanceCurseField(inst) && instanceTargeting(inst)?.target === "corpse") {
    targetInfo = $combatOwner.resolveTargeting(caster, inst, aim);
    if (!targetInfo) {
      $combatOwner.failNote(caster, def.id + ":lost", "corpse lost");
      return { completed: false };
    }
  }
  if (def.pool) {
    const banked = caster.pools.get(def.pool.id) ?? 0;
    const rel = def.pool.release;
    if (rel.mode === "vent") {
      if (caster.venting.has(def.pool.id)) {
        caster.venting.delete(def.pool.id);
      } else if (banked > 0) {
        caster.venting.add(def.pool.id);
        $combatOwner.showSelfRelease(caster, inst);
      }
    } else {
      caster.pools.set(def.pool.id, 0);
      const radius = rel.radius * caster.sheet.get("aoeRadius", tags, extra);
      $combatOwner.burstDamage(vec(caster.pos.x, caster.pos.y), radius, banked * (rel.ratio ?? 1), def.pool.damageType, cosmeticColor, caster.team, effectTier, void 0, void 0, banked > 0 ? skillSelfVoice(def.id, "burst") : void 0);
    }
    return { completed: true };
  }
  if (def.invokes) {
    const runes = caster.runes;
    const rule = resolveInvocation(runes);
    if (!rule || !SKILLS[rule.skillId]) {
      $combatOwner.failNote(caster, def.id + ":norunes", "no runes woven");
      return { completed: false };
    }
    const count = runes.length;
    const last = runes[runes.length - 1];
    caster.runes = [];
    $combatOwner.showSelfRelease(caster, inst);
    const payload = makeInvocationPayload(inst, SKILLS[rule.skillId], last);
    noteProcCue(caster, rule.releaseCue === false ? false : {
      profile: "rune",
      color: RUNE_INFO[last]?.color ?? def.color,
      ...rule.releaseCue
    }, "invoke", rule.id, count);
    $combatOwner.executeSkill(caster, payload, aim, {
      dmgMult: (1 + (instanceInvocation(inst)?.damagePerRune ?? rule.dmgPerRune ?? 0.15) * count) * useMult,
      noCooldown: true,
      noRepeat: true
    });
    return { completed: true };
  }
  if (targetInfo?.actor) {
    for (const ts of instanceTethers(inst)) {
      if (ts.link === "target")
        $combatOwner.addTether(caster, targetInfo.actor, ts, inst, caster);
    }
  }
  if (opts.strikeAngle !== void 0) {
    const reach = Math.max(48, dist(caster.pos, aim));
    aim = vec(caster.pos.x + Math.cos(opts.strikeAngle) * reach, caster.pos.y + Math.sin(opts.strikeAngle) * reach);
    caster.facing = opts.strikeAngle;
  } else {
    const aimSpec = instanceAim(inst);
    if (aimSpec?.sequence?.steps.length) {
      const seq = aimSpec.sequence;
      const baseAng = angleTo(caster.pos, aim);
      const reach = Math.max(48, dist(caster.pos, aim));
      const pause = Math.max(0.05, seq.pause / caster.speedFactor(inst));
      for (let i = 1; i < seq.steps.length; i++) {
        $combatOwner.pendingSteps.push({
          caster,
          inst,
          aim: vec(aim.x, aim.y),
          angle: baseAng + seq.steps[i] * Math.PI / 180,
          timer: pause * i,
          dmgMult: useMult,
          aoeMult: opts.aoeMult ?? 1,
          paidCost: opts.paidCost
        });
      }
      const a0 = baseAng + seq.steps[0] * Math.PI / 180;
      aim = vec(caster.pos.x + Math.cos(a0) * reach, caster.pos.y + Math.sin(a0) * reach);
      caster.facing = a0;
    } else if (aimSpec?.random) {
      const baseAng = angleTo(caster.pos, aim);
      const reach = Math.max(48, dist(caster.pos, aim));
      const spread = Math.min(Math.PI * 2, aimSpec.random.spreadDeg * Math.PI / 180 * caster.sheet.get("randomArc", tags, extra));
      const ang = baseAng + (aimSpec.random.offsetDeg ?? 0) * Math.PI / 180 + rand(-spread / 2, spread / 2);
      aim = vec(caster.pos.x + Math.cos(ang) * reach, caster.pos.y + Math.sin(ang) * reach);
      caster.facing = ang;
    }
  }
  const ventRounds = opts.ventRounds ?? 0;
  const ventCounts = def.delivery.type === "storm" || def.delivery.type === "projectile";
  const repeats = Math.max(1, opts.repeat ?? 1) + (ventCounts ? 0 : ventRounds);
  if (repeats > 1) {
    const dv = def.delivery.type;
    if (dv === "blink" || dv === "dash" || dv === "leap" || dv === "carom") {
      $combatOwner.pendingRepeats.push({
        caster,
        inst,
        aim: vec(aim.x, aim.y),
        n: repeats - 1,
        k: 1,
        timer: 0.16,
        interval: 0.16,
        dmgMult: useMult,
        aoeMult: opts.aoeMult ?? 1,
        scaleStep: caster.sheet.get("repeatScale", tags, extra),
        retarget: caster.sheet.get("repeatRetarget", tags, extra) > 0
      });
      return { completed: $combatOwner.executeSkill(caster, inst, aim, { ...opts, repeat: 1, ventRounds: ventCounts ? opts.ventRounds : 0 }) };
    }
    let ok = true;
    for (let i = 0; i < repeats; i++) {
      ok = $combatOwner.executeSkill(caster, inst, aim, { ...opts, repeat: 1, noCooldown: i > 0 || opts.noCooldown, ventRounds: ventCounts ? opts.ventRounds : 0 }) && ok;
    }
    return { completed: ok };
  }
  let flatBonus;
  let corpseFeast = 0;
  const targetSpec = instanceTargeting(inst);
  if (targetInfo && targetSpec) {
    const t = targetSpec;
    if (targetInfo.corpse) {
      const feast = (targetInfo.corpses ?? [targetInfo.corpse]).filter((c) => $combatOwner.corpses.includes(c));
      if (t.corpseLifeDamage) {
        let fuel = 0;
        for (const c of feast)
          fuel += c.maxLife * t.corpseLifeDamage;
        flatBonus = { fire: fuel };
      }
      if (t.consumesCorpse !== false && def.delivery.type !== "summon") {
        for (const c of feast)
          $combatOwner.removeCorpse(c);
        for (const c of feast)
          $combatOwner.showSkillArrival(caster, inst, c.pos, 28, c.tier ?? $combatOwner.spoilStoryAt(c.pos), true);
        corpseFeast = Math.max(0, feast.length - 1);
        if (t.corpseLifeRestore) {
          const rr = t.corpseLifeRestore;
          let meat = 0;
          for (const c of feast)
            meat += c.maxLife;
          if (rr.life)
            $combatOwner.applyRestore(caster, { resource: "life", amount: meat * rr.life }, { tags: def.tags, feedingCue: def.feedingCue });
          if (rr.mana)
            $combatOwner.applyRestore(caster, { resource: "mana", amount: meat * rr.mana }, { tags: def.tags, feedingCue: def.feedingCue });
          for (const corpse of feast) {
            const feedingCue = feedingCueFlash(corpse.pos, caster, def.feedingCue, "flesh", corpse.tier);
            if (feedingCue)
              $combatOwner.flashes.push(feedingCue);
          }
        }
        $combatOwner.corpseSpawn(caster, inst, targetInfo.corpse.pos, feast.length);
      }
    }
    if (targetInfo.actor && t.requiresStatus && t.consumesStatus) {
      const reqs = statusReqs(t.requiresStatus);
      let payload = 0;
      for (let i = targetInfo.actor.statuses.length - 1; i >= 0; i--) {
        const s = targetInfo.actor.statuses[i];
        if (!reqs.includes(s.id))
          continue;
        payload += s.dps * s.stacks * Math.max(0, s.remaining);
        targetInfo.actor.statuses.splice(i, 1);
        targetInfo.actor.sheet.removeSource("status:" + s.id);
      }
      if (payload > 0) {
        flatBonus = { ...flatBonus ?? {}, physical: (flatBonus?.physical ?? 0) + payload };
      }
    }
    if (t.drainsTargetLife) {
      const victim = targetInfo.actor ?? (targetInfo.self ? caster : null);
      if (victim)
        victim.life = Math.max(1, victim.life - victim.life * t.drainsTargetLife);
    }
  }
  if (def.poiseReap && targetInfo?.actor?.poiseBroken) {
    const reap = targetInfo.actor.maxPoise() * def.poiseReap.mult;
    if (reap > 0) {
      flatBonus = { ...flatBonus ?? {}, physical: (flatBonus?.physical ?? 0) + reap };
    }
  }
  if (opts.paidCost) {
    const perMana = caster.sheet.get("costDamage_mana", tags, extra);
    const perLife = caster.sheet.get("costDamage_life", tags, extra);
    const total = (opts.paidCost.mana * perMana + opts.paidCost.life * perLife) * (def.addedEffectiveness ?? 1);
    if (total > 0) {
      flatBonus = { ...flatBonus ?? {} };
      const entries = Object.entries(def.baseDamage ?? {});
      let mass = 0;
      for (const [, r] of entries)
        mass += (r[0] + r[1]) / 2;
      if (mass > 0) {
        for (const [k, r] of entries) {
          flatBonus[k] = (flatBonus[k] ?? 0) + total * ((r[0] + r[1]) / 2 / mass);
        }
      } else {
        flatBonus.physical = (flatBonus.physical ?? 0) + total;
      }
    }
  }
  const origin = targetInfo?.pos ?? caster.pos;
  if (!opts.noCooldown && !instanceUseCharges(inst)?.magazine && def.cooldownAt !== "press") {
    $combatOwner.stampSkillCooldown(caster, inst, def.cooldown);
  }
  $combatOwner.guardArts.cast(caster, inst);
  if (opts.primed) {
    caster.primedPours.push({ skillId: def.id, chargesSpent: opts.chargesSpent ?? 0, aim: vec(aim.x, aim.y) });
    const payloadCues = payloadTransition(caster, inst, "prime");
    if (payloadCues)
      $combatOwner.flashes.push(payloadCues);
    return { completed: true };
  }
  const d = instanceDelivery(inst);
  let aoeScale = caster.sheet.get("aoeRadius", tags, extra) * (opts.aoeMult ?? 1);
  if (corpseFeast > 0)
    aoeScale *= 1 + CORPSE_CFG.batch.aoePerExtra * corpseFeast;
  {
    const vAoe = instanceVariance(inst)?.aoe;
    if (vAoe)
      aoeScale *= rand(vAoe[0], vAoe[1]);
  }
  const arcScale = caster.sheet.get("swingArc", tags, extra) * (opts.arcMult ?? 1);
  let fieldAt = null;
  {
    const lash = socketSpec(inst, "meleeFissure");
    if (lash && (!opts.noRepeat || opts.componentUse) && chance(lash.chance)) {
      const lashD = {
        type: "ground",
        radius: lash.radius,
        castRange: 0,
        lingerDuration: lash.linger,
        tickInterval: lash.tickInterval ?? 0.5,
        fissure: { length: lash.length, speed: lash.speed, close: lash.close }
      };
      $combatOwner.layFissure(caster, inst, vec(caster.pos.x, caster.pos.y), caster.facing, lashD, useMult * lash.damageScale, flatBonus, Math.round(caster.sheet.get("fissureBranches", tags, extra)), 0, effectTier);
    }
  }
  {
    const cf = instanceCurseField(inst);
    if (cf && tags.has("curse")) {
      const cfRadius = cf.radius * aoeScale;
      const cfTick = cf.tickInterval ?? 0.7;
      const cfMult = (cf.damageScale ?? 0.5) * useMult;
      if (cf.mode === "follow") {
        const reserve = (cf.reservePct ?? 0.25) * caster.maxMana();
        if (caster.reservedMana + reserve > caster.maxMana()) {
          $combatOwner.failNote(caster, def.id + ":reserve", "cannot sustain");
          return { completed: false };
        }
        caster.reservedMana += reserve;
        caster.mana = Math.min(caster.mana, caster.availableMaxMana());
        $combatOwner.zones.push({
          tier: effectTier,
          pos: vec(caster.pos.x, caster.pos.y),
          radius: cfRadius,
          caster,
          inst,
          color: cosmeticColor,
          delay: 0,
          exploded: true,
          linger: 1,
          tickInterval: cfTick,
          tickTimer: 0,
          shape: 0,
          facing: caster.facing,
          dmgMult: cfMult,
          depth: 1,
          follow: true,
          toggled: true,
          reserved: reserve,
          madden: $combatOwner.maddenBankOf(inst),
          flatBonus
        });
      } else {
        for (let zi = $combatOwner.zones.length - 1; zi >= 0; zi--) {
          const z = $combatOwner.zones[zi];
          if (z.caster === caster && z.inst.def.id === def.id) {
            $combatOwner.expireZone(z);
            $combatOwner.zones.splice(zi, 1);
          }
        }
        const reach = instanceTargeting(inst)?.castRange ?? 460;
        const dd = Math.min(dist(caster.pos, aim), reach);
        const at = $combatOwner.clampPos(vec(caster.pos.x + Math.cos(caster.facing) * dd, caster.pos.y + Math.sin(caster.facing) * dd), 10, void 0, { tier: effectTier });
        $combatOwner.zones.push({
          tier: effectTier,
          pos: at,
          radius: cfRadius,
          caster,
          inst,
          color: cosmeticColor,
          delay: 0,
          exploded: true,
          linger: (cf.duration ?? 10) * caster.sheet.get("effectDuration", tags, extra),
          tickInterval: cfTick,
          tickTimer: 0,
          shape: 0,
          facing: caster.facing,
          dmgMult: cfMult,
          depth: 1,
          madden: $combatOwner.maddenBankOf(inst),
          flatBonus
        });
        fieldAt = at;
      }
      const fieldCueZone = $combatOwner.zones[$combatOwner.zones.length - 1];
      if (def.fieldCue !== false) {
        fieldCueZone.fieldCue = def.fieldCue ?? {};
        fieldCueZone.tier = effectTier ?? 0;
        $combatOwner.flashes.push({ ...combatCueFlash(fieldCueZone.pos, fieldCueZone.fieldCue.form ?? "field_form", fieldCueZone.radius, 0, def.fieldCue?.color ?? cosmeticColor), recoveryCueTier: fieldCueZone.tier });
      }
      return { completed: true };
    }
  }
  if (cosmeticPaint.motif)
    $combatOwner.flashes.push({
      recoveryCueTier: effectTier,
      pos: { ...caster.pos },
      radius: caster.radius * COSMETIC_CFG.cast.radiusScale,
      color: cosmeticColor,
      life: COSMETIC_CFG.cast.lifetime,
      maxLife: COSMETIC_CFG.cast.lifetime,
      cosmeticMotif: cosmeticPaint.motif
    });
  return { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor, effectTier, fieldAt };
}
function completePrototype(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor, effectTier } = frame, def = inst.def;
  {
    const cb = instanceBirth(inst);
    if (cb && !cb.onHit && d.type !== "ground" && d.type !== "storm" && d.type !== "projectile") {
      $combatOwner.birthAt(caster, inst, cb, origin);
    }
  }
  if ((!opts.noRepeat && !opts.noCooldown || opts.componentUse) && !caster.construct?.echo) {
    let repeats = Math.round(caster.sheet.get("repeatCount", tags, extra)) + Math.round((instanceChargeCost(inst)?.repeatsPerCharge ?? 0) * (opts.chargesSpent ?? 0));
    const unleashMax = caster.sheet.get("unleashMax", tags, extra);
    if (unleashMax > 0) {
      const st = inst.state ??= {};
      const restEnd = st.pressAt ?? $combatOwner.time;
      repeats += Math.min(Math.round(unleashMax), Math.max(0, Math.floor((restEnd - (st.lastUseAt ?? -999)) / UNLEASH_CFG.interval)));
      st.lastUseAt = $combatOwner.time;
    }
    if (repeats > 0) {
      const interval = 0.22 / (opts.componentUse ? caster.speedFactor(inst) : 1);
      const echoSpec = instanceTargeting(inst);
      const echoMark = instanceDelivery(inst).type === "target" && targetInfo && echoSpec && echoSpec.target !== "corpse" && !def.effects.some((f) => f.type === "tame") ? targetInfo.actor ?? (targetInfo.self ? caster : void 0) : void 0;
      $combatOwner.pendingRepeats.push({
        caster,
        inst,
        aim: vec(aim.x, aim.y),
        n: repeats,
        k: 1,
        timer: interval,
        interval,
        dmgMult: useMult,
        aoeMult: opts.aoeMult ?? 1,
        scaleStep: caster.sheet.get("repeatScale", tags, extra),
        retarget: caster.sheet.get("repeatRetarget", tags, extra) > 0,
        mark: echoMark
      });
      if (caster.sheet.get("repeatLock", tags, extra) > 0) {
        caster.useLock = Math.max(caster.useLock, repeats * interval + 0.1);
      }
    }
  }
  if (!opts.noRepeat && !opts.noCooldown)
    $combatOwner.consumeRemnants(caster, def);
  if (!opts.noRepeat && !opts.noCooldown)
    $combatOwner.consumeAmmunition(caster, def);
  if (!opts.noRepeat && !opts.noCooldown) {
    if (def.tags.includes("movement"))
      caster.noteRecent("move");
    $combatOwner.rollOwnProcs(caster, "cast", { tags, extra, inst, aim });
  }
  if (!opts.noRepeat && !opts.noCooldown) {
    const ss = instanceSelfStack(inst);
    if (ss) {
      const st = inst.state ??= {};
      st.stackN = Math.min(ss.maxStacks, (st.stackN ?? 0) + 1);
      st.stackT = ss.duration;
    }
  }
  const castCycle = instanceCastCycle(inst);
  if (!opts.noRepeat && !opts.noCooldown && castCycle) {
    const n = (caster.castCycles.get(def.id) ?? 0) + 1;
    if (n >= castCycle.count) {
      caster.castCycles.set(def.id, 0);
      const cycleBuff = buffWithSource(castCycle.buff, inst);
      $combatOwner.associateTreeBuff(cycleBuff, { caster, inst });
      caster.addBuff(cycleBuff, caster.sheet.get("effectDuration", tags, extra));
      $combatOwner.text(vec(caster.pos.x, caster.pos.y - 18), castCycle.buff.id.replace(/_/g, " ") + "!", def.color, 12);
    } else {
      caster.castCycles.set(def.id, n);
    }
  }
  if (!opts.noRepeat && !opts.noCooldown) {
    for (const spec of instanceChargeGain(inst)) {
      if (spec.on !== "use")
        continue;
      if (spec.chance !== void 0 && !chance(spec.chance))
        continue;
      caster.gainCharge(spec.charge, spec.amount, spec.max, inst);
    }
  }
  if (!opts.noRepeat && !opts.noCooldown && !caster.construct && !caster.owner && $combatOwner.remnants.length < 14) {
    const rc = caster.sheet.get("remnantOnCast", tags, extra);
    if (rc > 0 && chance(Math.min(0.5, rc))) {
      const els = ELEMENTAL_TYPES.filter((el) => def.tags.includes(el));
      if (els.length) {
        const ang = rand(0, Math.PI * 2);
        const r = rand(40, 70);
        $combatOwner.remnants.push({
          pos: $combatOwner.clampPos(vec(caster.pos.x + Math.cos(ang) * r, caster.pos.y + Math.sin(ang) * r), 8, void 0, { tier: effectTier }),
          element: pick(els),
          bob: rand(0, Math.PI * 2),
          life: 14
        });
      }
    }
  }
  if (!opts.noRepeat && !opts.noCooldown)
    $combatOwner.consumeStealth(caster, def);
  if (!opts.noRepeat && !opts.noCooldown && !caster.construct && !def.invokes) {
    $combatOwner.bankRune(caster, def);
  }
  if (!opts.noRepeat && !opts.noCooldown && !caster.construct) {
    $combatOwner.recordCast(caster, def, inst.chainOf);
    markBodyAction(caster, inst, $combatOwner.time, angleTo(caster.pos, aim));
  }
  if (!opts.noRepeat && !opts.noCooldown && !caster.construct && caster.team === "enemy") {
    for (const s of $combatOwner.seats) {
      const p = s.actor;
      if (p.dead || p.kind !== "player")
        continue;
      mimicRefreshWatch(p, $combatOwner.time);
      if (!p.mimicWatch || p.mimicWitnessR <= 0)
        continue;
      if (dist(p.pos, caster.pos) > p.mimicWitnessR)
        continue;
      if (!$combatOwner.lineOfSight(p.pos, caster.pos, p.tier, effectTier))
        continue;
      if (mimicCapture($combatOwner, p, caster, def)) {
        $combatOwner.notice(`ART WITNESSED: ${def.name}`, "#c8a0e8", 14, "world");
      }
    }
  }
  if ((!opts.noRepeat && !opts.noCooldown || opts.componentUse) && !caster.construct && def.delivery.type !== "construct") {
    for (const e of instanceEchoes(inst)) {
      $combatOwner.spawnEchoRiders(caster, inst, e.spec, e.key, aim, inst);
    }
  }
  if (!opts.noRepeat && !opts.noCooldown && !caster.construct) {
    for (const r of $combatOwner.actors) {
      const rc2 = r.construct;
      if (!rc2 || rc2.kind !== "relic" || r.dead || r.owner !== caster)
        continue;
      if (rc2.timer > $combatOwner.time || !rc2.castInst)
        continue;
      rc2.timer = $combatOwner.time + (rc2.castInterval ?? 0.8);
      r.useLock = 0;
      r.mana = r.maxMana();
      $combatOwner.executeSkill(r, rc2.castInst, vec(r.pos.x, r.pos.y), { keepFacing: true, noCooldown: true, noRepeat: true });
    }
  }
  if ((!opts.noRepeat && !opts.noCooldown || opts.componentUse) && !opts.noFollowUp && !caster.construct) {
    $combatOwner.queueFollowUps(caster, inst, aim, opts.chargesSpent ?? 0);
  }
  if (!opts.noRepeat && !caster.construct) {
    if (!opts.noCooldown)
      $combatOwner.challenges.completed(caster, inst);
    $combatOwner.cohortArts.completed(caster, inst, aim);
    $combatOwner.summonArts.completed(caster, inst, aim);
    $combatOwner.frameArts.completed(caster, inst, aim);
    $combatOwner.companionBonds.onCast(caster, inst, aim);
    $combatOwner.battleDoctrines.cast(caster, inst, aim);
    $combatOwner.echoToClones(caster, inst, aim, useMult, opts.targetInfo);
  }
  if (!caster.dead)
    $combatOwner.presenceMoment(caster, "pulse");
}
function projectile(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      let count = rollCount(d.count, Math.round(caster.sheet.get("projectileCount", tags, extra))) + $combatOwner.projectileArts.count(caster, inst) + (opts.bonusProjectiles ?? 0) + ventRounds + Math.round((instanceChargeCost(inst)?.projectilesPerCharge ?? 0) * (opts.chargesSpent ?? 0)) + corpseFeast * CORPSE_CFG.batch.projectilesPerExtra;
      if (gPow !== 1)
        count = Math.max(1, Math.round(count * gPow));
      const projChance = caster.sheet.get("projectileCountChance", tags, extra);
      if (projChance > 0 && chance(projChance))
        count += 1;
      count = Math.max(1, count);
      if (inst.projectileSpec?.orbit) {
        const total = Math.min($combatOwner.projectileArts.limit(inst), count + Math.max(0, Math.round(caster.sheet.get("projNova", tags, extra))));
        for (let n = 0; n < total; n++)
          $combatOwner.spawnProjectile(caster, inst, caster.pos, caster.facing + n / total * Math.PI * 2, { tier: effectTier, mult: useMult, flat: flatBonus });
        return fieldAt;
      }
      const caromCap = caromCapacity(caster, inst);
      if (d.caroms?.hang) {
        const armedIdx = $combatOwner.pendingAmbushes.findIndex((am) => am.caster === caster && am.inst.def.id === def.id);
        if (armedIdx !== -1) {
          $combatOwner.triggerAmbush(armedIdx, useMult, flatBonus);
          return fieldAt;
        }
        const arrow = $combatOwner.spawnConstruct(caster, inst, {
          type: "construct",
          kind: "embed",
          look: d.caroms.hang.look ?? SECONDARY_LOOKS.hanging,
          range: 0,
          duration: d.caroms.hang.duration ?? 24,
          maxActive: caromCap,
          invulnerable: true,
          placeRange: 9999
        }, aim, void 0, $combatOwner.clampPos(vec(aim.x, aim.y), 10, void 0, { tier: effectTier }), 1, effectTier);
        const arrows = $combatOwner.minionsOfSkill(caster, def.id).filter((a) => a.construct?.kind === "embed");
        if (arrow && arrows.length >= caromCap) {
          $combatOwner.pendingAmbushes.push({
            caster,
            inst,
            points: arrows.map((a2) => vec(a2.pos.x, a2.pos.y)),
            arrowIds: arrows.map((a2) => a2.id),
            triggerRadius: d.caroms.hang.triggerRadius ?? 90,
            deadline: $combatOwner.time + (d.caroms.hang.duration ?? 24)
          });
        }
        fieldAt = vec(aim.x, aim.y);
        return fieldAt;
      }
      if (d.caroms) {
        const st = inst.state ??= {};
        const stale = st.anchorsAt !== void 0 && $combatOwner.time - st.anchorsAt > d.caroms.window;
        if (!st.anchors || stale)
          st.anchors = [];
        st.anchorsAt = $combatOwner.time;
        const anchorAt = $combatOwner.clampPos(vec(aim.x, aim.y), 10, void 0, { tier: effectTier });
        st.anchors.push({ x: anchorAt.x, y: anchorAt.y });
        $combatOwner.flashes.push({ recoveryCueTier: effectTier, pos: vec(anchorAt.x, anchorAt.y), radius: 16, color: cosmeticColor, life: 0.35, maxLife: 0.35 });
        if (st.anchors.length < caromCap) {
          return fieldAt;
        }
        const pts = st.anchors.map((a2) => vec(a2.x, a2.y));
        st.anchors = [];
        for (let i = 0; i < count; i++) {
          $combatOwner.spawnProjectile(caster, inst, vec(pts[0].x, pts[0].y), angleTo(pts[0], pts[1 % pts.length]), { tier: effectTier, mult: useMult, flat: flatBonus, patrol: pts });
        }
        fieldAt = vec(pts[0].x, pts[0].y);
        return fieldAt;
      }
      let origin2 = caster.pos;
      if (d.origin === "cursor" || caster.sheet.get("castAtCursor", tags, extra) > 0) {
        const reach = Math.min(dist(caster.pos, aim), d.originRange ?? 420);
        const ang = angleTo(caster.pos, aim);
        origin2 = $combatOwner.clampPos(vec(caster.pos.x + Math.cos(ang) * reach, caster.pos.y + Math.sin(ang) * reach), d.radius, void 0, { tier: effectTier });
      }
      const nova2 = Math.round(caster.sheet.get("projNova", tags, extra));
      if (nova2 > 0) {
        const total = count + nova2;
        for (let i = 0; i < total; i++) {
          $combatOwner.spawnProjectile(caster, inst, origin2, caster.facing + i / total * Math.PI * 2, { tier: effectTier, mult: useMult, flat: flatBonus });
        }
        return fieldAt;
      }
      const style = caster.sheet.get("fireSalvo", tags, extra) > 0 ? "salvo" : caster.sheet.get("fireVolley", tags, extra) > 0 ? "volley" : d.fire ?? "fan";
      if (style === "salvo") {
        const interval = Math.max(0.03, (d.salvoInterval ?? 0.09) / caster.speedFactor(inst));
        const fixedOrigin = origin2 !== caster.pos ? vec(origin2.x, origin2.y) : null;
        $combatOwner.spawnProjectile(caster, inst, origin2, caster.facing, { tier: effectTier, mult: useMult, flat: flatBonus });
        if (count > 1) {
          $combatOwner.pendingSalvos.push({
            tier: fixedOrigin ? effectTier : void 0,
            caster,
            inst,
            aim: vec(aim.x, aim.y),
            origin: fixedOrigin,
            shots: count - 1,
            timer: interval,
            interval,
            mult: useMult,
            flat: flatBonus
          });
        }
        return fieldAt;
      }
      if (style === "volley") {
        const gap = (d.volleySpacing ?? 34) * caster.sheet.get("volleySpacing", tags, extra);
        const perp = caster.facing + Math.PI / 2;
        for (let i = 0; i < count; i++) {
          const rank = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 === 1 ? 1 : -1);
          const at = $combatOwner.clampPos(vec(origin2.x + Math.cos(perp) * gap * rank, origin2.y + Math.sin(perp) * gap * rank), d.radius, void 0, { tier: effectTier });
          $combatOwner.spawnProjectile(caster, inst, at, caster.facing, { tier: effectTier, mult: useMult, flat: flatBonus });
        }
        return fieldAt;
      }
      if (d.ring) {
        const phase = d.ring.phaseJitter === false ? 0 : rand(0, Math.PI * 2 / Math.max(1, count));
        for (let i = 0; i < count; i++) {
          const ang = phase + i / Math.max(1, count) * Math.PI * 2;
          $combatOwner.spawnProjectile(caster, inst, origin2, ang, { tier: effectTier, mult: useMult, flat: flatBonus });
        }
        return fieldAt;
      }
      let spreadBase = d.spreadDeg ?? 14;
      if (d.spreadByAim) {
        const f = Math.min(1, dist(caster.pos, aim) / Math.max(1, d.spreadByAim.range));
        spreadBase = d.spreadByAim.near + (d.spreadByAim.far - d.spreadByAim.near) * f;
      }
      const spread = spreadBase * Math.PI / 180 * caster.sheet.get("spreadAngle", tags, extra);
      for (let i = 0; i < count; i++) {
        const off = count === 1 ? 0 : (i / (count - 1) - 0.5) * spread;
        $combatOwner.spawnProjectile(caster, inst, origin2, caster.facing + off, { tier: effectTier, mult: useMult, flat: flatBonus, dest: vec(aim.x, aim.y) });
      }
      return fieldAt;
    }
  }
  return fieldAt;
}
function melee(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      const sweeping = caster.sheet.get("meleeSweep", tags, extra) > 0;
      const reach = (caster.radius + d.range) * caster.sheet.get("meleeReach", tags, extra);
      const arcRad = Math.min(Math.PI * 2, d.arcDeg * Math.PI / 180 * Math.sqrt(aoeScale) * arcScale);
      const swingShape = caster.sheet.get("aoeShape", tags, extra, AOE_SHAPE[d.shape ?? "circle"]);
      const banded = swingShape === AOE_SHAPE.band;
      const bandGeo = banded ? bandSwingGeo(reach, arcRad) : null;
      const bandC = bandGeo ? vec(caster.pos.x + Math.cos(caster.facing) * bandGeo.standoff, caster.pos.y + Math.sin(caster.facing) * bandGeo.standoff) : caster.pos;
      const struck = /* @__PURE__ */ new Set();
      const assaultLockedTarget = $combatOwner.assaults.locked(caster, inst);
      if (assaultLockedTarget) {
        struck.add(assaultLockedTarget.id);
        $combatOwner.resolveHit(caster, inst, assaultLockedTarget, useMult, 0, flatBonus, void 0, void 0, void 0, void 0, effectTier);
        $combatOwner.flashes.push({ recoveryCueTier: effectTier, pos: { ...assaultLockedTarget.pos }, radius: 18, color: cosmeticColor, life: 0.18, maxLife: 0.18 });
      }
      let sweepR = 0, sweepArc = 0;
      if (sweeping) {
        sweepR = Math.min(140, Math.max(70, (caster.radius + d.range) * 1.35));
        sweepArc = d.arcDeg * Math.PI / 180 * Math.sqrt(aoeScale) * arcScale;
        const speed = 480 * caster.sheet.get("sweepSpeed", tags, extra);
        const travel = 210 * caster.sheet.get("sweepRange", tags, extra) * Math.min(2, caster.sheet.get("effectDuration", tags, extra));
        $combatOwner.zones.push({
          tier: effectTier,
          pos: vec(caster.pos.x, caster.pos.y),
          radius: sweepR,
          caster,
          inst,
          color: cosmeticColor,
          delay: 0,
          exploded: true,
          linger: travel / speed,
          tickInterval: 0,
          tickTimer: 0,
          shape: AOE_SHAPE.crescent,
          facing: caster.facing,
          dmgMult: useMult,
          depth: 0,
          drift: speed,
          arcRad: sweepArc,
          struck,
          flatBonus
        });
        $combatOwner.flashes.push({
          recoveryCueTier: effectTier,
          pos: vec(caster.pos.x, caster.pos.y),
          radius: sweepR * 0.6,
          color: cosmeticColor,
          life: 0.2,
          maxLife: 0.2,
          arc: { facing: caster.facing, arcRad: sweepArc },
          fx: d.fx ?? skillStrikeVoice(inst.def.id)
        });
        fieldAt = vec(caster.pos.x, caster.pos.y);
      } else {
        $combatOwner.releaseStruckSummons(caster, inst, (body) => {
          if (banded)
            return inAoe(bandC, bandGeo.halfWidth, AOE_SHAPE.band, caster.facing, body.pos, body.radius);
          if (swingShape >= 1 && swingShape <= 2)
            return inAoe(caster.pos, reach, swingShape, caster.facing, body.pos, body.radius);
          return dist(caster.pos, body.pos) - body.radius <= reach && Math.abs(angleDiff(caster.facing, angleTo(caster.pos, body.pos))) <= arcRad / 2;
        });
        for (const enemy of $combatOwner.enemiesOf(caster, effectTier)) {
          if (enemy.tier !== effectTier)
            continue;
          if (struck.has(enemy.id))
            continue;
          const nb = nearestBody(enemy, caster.pos);
          if (banded) {
            if (!inAoe(bandC, bandGeo.halfWidth, AOE_SHAPE.band, caster.facing, nb.pos, nb.r))
              continue;
          } else if (swingShape >= 1 && swingShape <= 2) {
            if (!inAoe(caster.pos, reach, swingShape, caster.facing, nb.pos, nb.r))
              continue;
          } else {
            if (dist(caster.pos, nb.pos) - nb.r > reach)
              continue;
            if (Math.abs(angleDiff(caster.facing, angleTo(caster.pos, nb.pos))) > arcRad / 2)
              continue;
          }
          struck.add(enemy.id);
          noteBodyHit(enemy, nb.seg);
          $combatOwner.resolveHit(caster, inst, enemy, useMult, 0, flatBonus, void 0, void 0, void 0, void 0, effectTier);
        }
      }
      const reverb = Math.round(caster.sheet.get("meleeReverb", tags, extra));
      for (let r = 0; r < reverb; r++) {
        let next = null, bd = reach + 140;
        for (const e of $combatOwner.enemiesOf(caster, effectTier)) {
          if (struck.has(e.id))
            continue;
          const dd = dist(caster.pos, e.pos);
          if (dd < bd) {
            bd = dd;
            next = e;
          }
        }
        if (!next)
          break;
        struck.add(next.id);
        $combatOwner.resolveHit(caster, inst, next, useMult, 0, flatBonus, void 0, void 0, void 0, void 0, effectTier);
        $combatOwner.flashes.push({ recoveryCueTier: effectTier, pos: vec(next.pos.x, next.pos.y), radius: 18, color: cosmeticColor, life: 0.15, maxLife: 0.15 });
      }
      if (!sweeping) {
        $combatOwner.flashes.push(banded ? {
          pos: vec(bandC.x, bandC.y),
          radius: bandGeo.halfWidth,
          color: cosmeticColor,
          life: 0.18,
          maxLife: 0.18,
          shape: AOE_SHAPE.band,
          facing: caster.facing,
          fx: d.fx ?? skillStrikeVoice(inst.def.id)
        } : swingShape >= 1 && swingShape <= 2 ? {
          pos: vec(caster.pos.x, caster.pos.y),
          radius: reach,
          color: cosmeticColor,
          life: 0.18,
          maxLife: 0.18,
          shape: swingShape,
          facing: caster.facing,
          fx: d.fx ?? skillStrikeVoice(inst.def.id)
        } : {
          pos: vec(caster.pos.x, caster.pos.y),
          radius: reach,
          color: cosmeticColor,
          life: 0.18,
          maxLife: 0.18,
          arc: { facing: caster.facing, arcRad },
          fx: d.fx ?? skillStrikeVoice(inst.def.id)
        });
        fieldAt = banded ? vec(bandC.x, bandC.y) : swingShape === 1 ? vec(caster.pos.x, caster.pos.y) : vec(caster.pos.x + Math.cos(caster.facing) * reach * 0.6, caster.pos.y + Math.sin(caster.facing) * reach * 0.6);
      }
      $combatOwner.mintAftermath(caster, inst, banded && !sweeping ? vec(bandC.x, bandC.y) : vec(caster.pos.x, caster.pos.y), sweeping ? sweepR : banded ? bandGeo.halfWidth : reach, sweeping ? AOE_SHAPE.crescent : banded ? AOE_SHAPE.band : swingShape >= 1 && swingShape <= 2 ? swingShape : AOE_SHAPE.sector, caster.facing, useMult, tags, extra, sweeping ? sweepArc : banded || swingShape >= 1 && swingShape <= 2 ? void 0 : arcRad, void 0, void 0, effectTier);
      if (!sweeping) {
        $combatOwner.healAlliesInArea(caster, inst, (a) => banded ? inAoe(bandC, bandGeo.halfWidth, AOE_SHAPE.band, caster.facing, a.pos, a.radius) : dist(caster.pos, a.pos) - a.radius <= reach && Math.abs(angleDiff(caster.facing, angleTo(caster.pos, a.pos))) <= arcRad / 2, useMult, void 0, void 0, effectTier);
        $combatOwner.frontSplash(caster, inst, caster.pos, reach, effectTier);
        $combatOwner.strikeSurfaces(caster, banded ? bandC : caster.pos, banded ? bandGeo.halfWidth : reach, (p, r) => banded ? inAoe(bandC, bandGeo.halfWidth, AOE_SHAPE.band, caster.facing, p, r) : dist(caster.pos, p) - r <= reach && Math.abs(angleDiff(caster.facing, angleTo(caster.pos, p))) <= arcRad / 2, void 0, effectTier, skillContextTags(inst).has("aoe"));
      }
      return fieldAt;
    }
  }
  return fieldAt;
}
function nova(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      const radius = d.radius * aoeScale;
      const shape = caster.sheet.get("aoeShape", tags, extra);
      const phase = $combatOwner.skillOcclusion(caster, inst) === "free";
      let pool = d.affects === "all" ? $combatOwner.actors.filter((a) => !a.dead && !a.untargetable) : d.affects === "allies" ? $combatOwner.actors.filter((a) => !a.dead && a.team === caster.team) : $combatOwner.enemiesOf(caster, effectTier);
      if (d.spareCaster)
        pool = pool.filter((a) => a !== caster && a.partLink?.root !== caster);
      pool = pool.filter((v) => v.tier === effectTier && !inst.frameExclusions?.has(v.id));
      const novaBody = (v) => inAoeBody(origin, radius, shape, caster.facing, v, void 0, (bp, br) => !(d.edgeOnly && dist(origin, bp) + br < radius * d.edgeOnly) && (phase || v === caster || $combatOwner.lineOfFire(origin, bp, effectTier)));
      if (d.maxTargets !== void 0) {
        pool = pool.filter((v) => novaBody(v) !== null).sort((a, b) => dist(origin, a.pos) - dist(origin, b.pos)).slice(0, Math.max(1, d.maxTargets));
      }
      for (const victim of pool) {
        if (d.requiresStatus && !victim.statuses.some((s) => d.requiresStatus.includes(s.id)))
          continue;
        const nb = novaBody(victim);
        if (!nb)
          continue;
        noteBodyHit(victim, nb.seg);
        inst.frameReceipts?.add(victim.id);
        $combatOwner.resolveHit(caster, inst, victim, useMult, 0, flatBonus, void 0, void 0, void 0, void 0, effectTier);
        if (d.lanceFx) {
          $combatOwner.flashes.push({
            recoveryCueTier: effectTier,
            pos: vec(origin.x, origin.y),
            radius: dist(origin, nb.pos) + nb.r,
            color: cosmeticColor,
            life: 0.22,
            maxLife: 0.22,
            beam: true,
            facing: angleTo(origin, nb.pos)
          });
        }
      }
      $combatOwner.flashes.push({
        recoveryCueTier: effectTier,
        pos: vec(origin.x, origin.y),
        radius,
        color: cosmeticColor,
        life: 0.3,
        maxLife: 0.3,
        shape,
        facing: caster.facing,
        edgeFrac: d.edgeOnly,
        fx: d.fx ?? skillBurstVoice(inst.def.id)
      });
      $combatOwner.spawnAftershocks(caster, inst, origin, radius, shape, void 0, effectTier);
      $combatOwner.mintAftermath(caster, inst, origin, radius, shape, caster.facing, useMult, tags, extra, void 0, d.edgeOnly, void 0, effectTier);
      fieldAt = vec(origin.x, origin.y);
      if (d.affects === void 0) {
        $combatOwner.healAlliesInArea(caster, inst, (a) => inAoe(origin, radius, shape, caster.facing, a.pos, a.radius) && !(d.edgeOnly && dist(origin, a.pos) + a.radius < radius * d.edgeOnly), useMult, void 0, void 0, effectTier);
        $combatOwner.frontSplash(caster, inst, origin, radius, effectTier);
        $combatOwner.strikeSurfaces(caster, origin, radius, (p, r) => inAoe(origin, radius, shape, caster.facing, p, r) && !(d.edgeOnly && dist(origin, p) + r < radius * d.edgeOnly) && (phase || $combatOwner.lineOfFire(origin, p, effectTier)), void 0, effectTier);
      }
      return fieldAt;
    }
  }
  return fieldAt;
}
function target(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      const friendly = targetInfo?.actor?.team === caster.team ? targetInfo.actor : targetInfo?.self ? caster : null;
      if (friendly) {
        let pourCrit;
        for (const fx of instanceEffects(inst)) {
          if (fx.type === "heal")
            $combatOwner.applyHealChained(caster, inst, friendly, fx, useMult);
          else if (fx.type === "cleanse")
            $combatOwner.cleanseActor(friendly, fx.count ?? 2);
          else if (fx.type === "absorb") {
            $combatOwner.grantAbsorb(friendly, skillAbsorbAmount(caster, inst, fx.amount), fx.duration * caster.sheet.get("effectDuration", tags, extra));
          } else if (fx.type === "restore")
            $combatOwner.applyRestore(friendly, fx, { tags: def.tags });
          else if (fx.type === "ward") {
            friendly.gainWard(fx.amount * (fx.perCharge ? Math.max(1, opts.chargesSpent ?? 0) : 1));
          } else if (fx.type === "restoreOverTime") {
            pourCrit ??= $combatOwner.critMendMult(caster, inst, friendly.pos);
            $combatOwner.startRestoreStream(friendly, caster, inst, fx, opts.chargesSpent ?? 0, pourCrit);
          }
        }
        $combatOwner.showSkillArrival(caster, inst, friendly.pos, friendly.radius + 14, friendly.tier);
        return fieldAt;
      }
      if (targetInfo?.actor) {
        const tameFx = def.effects.find((f) => f.type === "tame");
        if (tameFx) {
          $combatOwner.tryTame(caster, inst, targetInfo.actor, tameFx);
          if (targetInfo.actor.owner === caster)
            $combatOwner.showSkillArrival(caster, inst, targetInfo.actor.pos, targetInfo.actor.radius + 14, targetInfo.actor.tier);
          return fieldAt;
        }
        $combatOwner.resolveHit(caster, inst, targetInfo.actor, useMult, 0, flatBonus, void 0, void 0, void 0, void 0, effectTier);
        const extraTargets = Math.round(caster.sheet.get("multiTarget", tags, extra));
        if (extraTargets > 0) {
          const need = statusReqs(instanceTargeting(inst)?.requiresStatus);
          const more = $combatOwner.enemiesOf(caster, effectTier).filter((e) => e !== targetInfo.actor && dist(targetInfo.pos, e.pos) <= 170 && (!need || e.statuses.some((s) => need.includes(s.id)))).sort((a, b) => dist(targetInfo.pos, a.pos) - dist(targetInfo.pos, b.pos)).slice(0, extraTargets);
          for (const e of more) {
            $combatOwner.resolveHit(caster, inst, e, useMult, 0, flatBonus, void 0, void 0, void 0, void 0, effectTier);
            $combatOwner.showSkillArrival(caster, inst, e.pos, e.radius + 14, e.tier);
          }
        }
        if (d.splash) {
          const splash = d.splash * aoeScale;
          for (const enemy of $combatOwner.enemiesOf(caster, effectTier)) {
            if (enemy === targetInfo.actor)
              continue;
            const nb = nearestBody(enemy, targetInfo.pos);
            if (dist(targetInfo.pos, nb.pos) - nb.r <= splash) {
              noteBodyHit(enemy, nb.seg);
              $combatOwner.resolveHit(caster, inst, enemy, useMult * 0.5, 0, void 0, void 0, void 0, void 0, void 0, effectTier);
            }
          }
          $combatOwner.frontSplash(caster, inst, targetInfo.pos, splash, effectTier);
          $combatOwner.strikeSurfaces(caster, targetInfo.pos, splash, void 0, void 0, effectTier);
        }
      }
      if (!targetInfo?.corpse || targetSpec?.consumesCorpse === false || !skillRiteVoice(def.id)) {
        $combatOwner.showSkillArrival(caster, inst, targetInfo?.actor?.pos ?? origin, d.splash ? d.splash * aoeScale : (targetInfo?.actor?.radius ?? 12) + 14, targetInfo?.actor?.tier ?? effectTier, false, !!d.splash);
      }
      fieldAt = vec(origin.x, origin.y);
      return fieldAt;
    }
  }
  return fieldAt;
}
function cone(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      const range = d.range * aoeScale * caster.sheet.get("meleeReach", tags, extra);
      const arcRad = Math.min(Math.PI * 2, d.arcDeg * Math.PI / 180 * arcScale);
      const coneSigil = Math.round(caster.sheet.get("aoeShape", tags, extra));
      const sigiled = coneSigil === 1 || coneSigil === 2;
      const sigilC = coneSigil === 2 ? vec(caster.pos.x + Math.cos(caster.facing) * range / 3, caster.pos.y + Math.sin(caster.facing) * range / 3) : vec(caster.pos.x + Math.cos(caster.facing) * range / 2, caster.pos.y + Math.sin(caster.facing) * range / 2);
      const sigilR = coneSigil === 2 ? range * (8 / 15) : range / 2;
      const sigilF = caster.facing;
      const phase = $combatOwner.skillOcclusion(caster, inst) === "free";
      for (const enemy of $combatOwner.enemiesOf(caster, effectTier)) {
        const nb = nearestBody(enemy, caster.pos);
        if (sigiled) {
          if (!inAoe(sigilC, sigilR, coneSigil, sigilF, nb.pos, nb.r))
            continue;
        } else {
          const dd = dist(caster.pos, nb.pos);
          if (dd - nb.r > range)
            continue;
          if (d.edgeOnly && dd + nb.r < range * d.edgeOnly)
            continue;
          if (Math.abs(angleDiff(caster.facing, angleTo(caster.pos, nb.pos))) > arcRad / 2)
            continue;
        }
        if (!phase && !$combatOwner.lineOfFire(caster.pos, nb.pos, effectTier))
          continue;
        noteBodyHit(enemy, nb.seg);
        $combatOwner.resolveHit(caster, inst, enemy, useMult, 0, flatBonus, void 0, void 0, void 0, void 0, effectTier);
      }
      if (d.beamFx && !sigiled) {
        const beamLen = phase ? range : dist(caster.pos, $combatOwner.clipShot(caster.pos, vec(caster.pos.x + Math.cos(caster.facing) * range, caster.pos.y + Math.sin(caster.facing) * range), effectTier));
        $combatOwner.flashes.push({
          recoveryCueTier: effectTier,
          pos: vec(caster.pos.x, caster.pos.y),
          radius: beamLen,
          color: cosmeticColor,
          life: 0.22,
          maxLife: 0.22,
          beam: true,
          facing: caster.facing,
          fx: skillBeamVoice(inst.def.id),
          arc: { facing: caster.facing, arcRad }
        });
      } else if (sigiled) {
        $combatOwner.flashes.push({
          recoveryCueTier: effectTier,
          pos: vec(sigilC.x, sigilC.y),
          radius: sigilR,
          color: cosmeticColor,
          life: 0.25,
          maxLife: 0.25,
          shape: coneSigil,
          facing: sigilF,
          fx: skillStrikeVoice(inst.def.id)
        });
      } else {
        $combatOwner.flashes.push({
          recoveryCueTier: effectTier,
          pos: vec(caster.pos.x, caster.pos.y),
          radius: range,
          color: cosmeticColor,
          life: 0.25,
          maxLife: 0.25,
          arc: { facing: caster.facing, arcRad },
          edgeFrac: d.edgeOnly,
          fx: skillStrikeVoice(inst.def.id)
        });
      }
      fieldAt = sigiled && coneSigil === 2 ? vec(caster.pos.x + Math.cos(caster.facing) * range * 0.33, caster.pos.y + Math.sin(caster.facing) * range * 0.33) : vec(caster.pos.x + Math.cos(caster.facing) * range * 0.55, caster.pos.y + Math.sin(caster.facing) * range * 0.55);
      $combatOwner.healAlliesInArea(caster, inst, (a) => {
        if (sigiled)
          return inAoe(sigilC, sigilR, coneSigil, sigilF, a.pos, a.radius);
        const dd = dist(caster.pos, a.pos);
        return dd - a.radius <= range && !(d.edgeOnly && dd + a.radius < range * d.edgeOnly) && Math.abs(angleDiff(caster.facing, angleTo(caster.pos, a.pos))) <= arcRad / 2;
      }, useMult, void 0, void 0, effectTier);
      $combatOwner.frontSplash(caster, inst, caster.pos, range, effectTier);
      $combatOwner.strikeSurfaces(caster, caster.pos, range, (p, r) => {
        if (sigiled) {
          return inAoe(sigilC, sigilR, coneSigil, sigilF, p, r) && (phase || $combatOwner.lineOfFire(caster.pos, p, effectTier));
        }
        const dd = dist(caster.pos, p);
        return dd - r <= range && !(d.edgeOnly && dd + r < range * d.edgeOnly) && Math.abs(angleDiff(caster.facing, angleTo(caster.pos, p))) <= arcRad / 2 && (phase || $combatOwner.lineOfFire(caster.pos, p, effectTier));
      }, void 0, effectTier);
      $combatOwner.mintAftermath(caster, inst, sigiled ? sigilC : vec(caster.pos.x, caster.pos.y), sigiled ? sigilR : range, sigiled ? coneSigil : AOE_SHAPE.sector, sigiled ? sigilF : caster.facing, useMult, tags, extra, sigiled ? void 0 : arcRad, sigiled ? void 0 : d.edgeOnly, caster.facing, effectTier);
      return fieldAt;
    }
  }
  return fieldAt;
}
function ground(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      const at = $combatOwner.clampGroundTarget(caster, aim, d, inst);
      for (const fx of instanceEffects(inst)) {
        if (fx.type === "kindle") {
          $combatOwner.plantKindle(caster, fx.kind, at, aoeScale, caster.sheet.get("effectDuration", tags, extra));
          continue;
        }
        if (fx.type === "vent") {
          $combatOwner.plantVent(fx, at, aoeScale, caster.sheet.get("effectDuration", tags, extra), effectTier);
          continue;
        }
        if (fx.type === "conjure") {
          const cr = fx.radius * aoeScale;
          const cd = fx.duration * caster.sheet.get("effectDuration", tags, extra);
          const conjOpts = {
            caster,
            grants: $combatOwner.conjureGrantsFor(caster, tags, extra, fx.grants),
            ...fx.look !== void 0 ? { look: fx.look } : {},
            ...fx.follow ? { follow: true } : {}
          };
          if (fx.line) {
            const ldx = at.x - caster.pos.x, ldy = at.y - caster.pos.y;
            const len = Math.hypot(ldx, ldy);
            const lstep = Math.max(1, cr * CONJURE_CFG.lineStep);
            const hops = Math.min(CONJURE_CFG.lineMaxHops, Math.max(1, Math.round(len / lstep)));
            for (let h = 1; h <= hops; h++) {
              $combatOwner.conjureCloud(caster.pos.x + ldx * h / hops, caster.pos.y + ldy * h / hops, cr, cd, conjOpts);
            }
          } else {
            $combatOwner.conjureCloud(at.x, at.y, cr, cd, conjOpts);
          }
        }
      }
      {
        const gb = instanceBirth(inst);
        if (gb && !gb.onHit)
          $combatOwner.birthAt(caster, inst, gb, at);
      }
      const isCurse = def.tags.includes("curse");
      const curseAllies = isCurse && caster.sheet.get("hedonism", tags, extra) > 0;
      if (d.exclusive) {
        for (let zi = $combatOwner.zones.length - 1; zi >= 0; zi--) {
          const z = $combatOwner.zones[zi];
          if (z.caster === caster && z.inst.def.id === def.id) {
            $combatOwner.expireZone(z);
            $combatOwner.zones.splice(zi, 1);
          }
        }
      }
      let zoneAnchor;
      const turret = instanceTurret(inst);
      if (turret && (d.lingerDuration ?? 0) > 0 && SKILLS[turret.castSkillId]) {
        const turretCast = makeSkillInstance(SKILLS[turret.castSkillId], effectiveSkillLevel(inst));
        $combatOwner.forwardSummonSockets(inst, [turretCast], {
          scale: CONSTRUCT_FORWARD_CFG.scale["totem"] ?? CONSTRUCT_FORWARD_CFG.scaleDefault
        });
        const built = $combatOwner.spawnConstruct(caster, inst, {
          type: "construct",
          kind: "totem",
          range: d.radius * aoeScale,
          duration: d.lingerDuration ?? 6,
          maxActive: 1,
          life: turret.life ?? 45,
          placeRange: 0,
          look: turret.look
        }, caster.pos, turretCast, vec(caster.pos.x, caster.pos.y), 1, effectTier);
        if (built) {
          zoneAnchor = built;
          at.x = built.pos.x;
          at.y = built.pos.y;
        }
      }
      if (d.fissure) {
        const fans = 1 + Math.round(caster.sheet.get("fissureCount", tags, extra));
        const fanSpread = Math.PI / 5;
        const baseAng = dist(caster.pos, at) < 1 ? caster.facing : angleTo(caster.pos, at);
        const from = dist(caster.pos, at) < 1 ? vec(caster.pos.x, caster.pos.y) : at;
        for (let f = 0; f < fans; f++) {
          const off = fans === 1 ? 0 : (f / (fans - 1) - 0.5) * fanSpread * (fans - 1);
          $combatOwner.layFissure(caster, inst, from, baseAng + off, d, useMult, flatBonus, Math.round(caster.sheet.get("fissureBranches", tags, extra, d.fissure.branches ?? 0)), f, effectTier);
        }
        fieldAt = at;
        return fieldAt;
      }
      const groundShape = caster.sheet.get("aoeShape", tags, extra, AOE_SHAPE[d.shape ?? "circle"]);
      const cadence = socketSpec(inst, "cadence")?.intervalStep;
      const pPlan = instancePulsePlan(inst);
      const pSpec = pPlan.native;
      const pulseN = Math.max(0, (pSpec ? pSpec.count ?? 1 : 0) + Math.round(caster.sheet.get("pulseCount", tags, extra)));
      const pDelay = pSpec?.delay ?? 1;
      const pInterval = pSpec?.interval ?? pDelay;
      const pStep = cadence ?? pSpec?.intervalStep ?? 1;
      const pQueue = flattenPulseQueue(pPlan.appended, cadence);
      const mintPulse = (telegraph) => pulseN > 0 ? {
        delay: pDelay,
        interval: pInterval,
        intervalStep: pStep,
        dmgMult: pSpec?.dmgMult ?? 1,
        dmgStep: pSpec?.dmgStep ?? 1,
        radiusMult: pSpec?.radiusMult ?? 1,
        radiusStep: pSpec?.radiusStep ?? 1,
        left: pulseN,
        next: $combatOwner.time + Math.max(0, telegraph) + pDelay,
        queue: pQueue.length ? [...pQueue] : void 0
      } : void 0;
      let pulseSpan = 0;
      if (pulseN > 0) {
        pulseSpan = pDelay + 0.1;
        let gap = pInterval;
        for (let k = 1; k < pulseN; k++) {
          pulseSpan += gap;
          gap = Math.max(0.05, gap * pStep);
        }
        for (const q of pQueue)
          pulseSpan += q.delay;
      }
      const pulseLinger = (secs) => Math.max(secs, pulseSpan);
      const ownLinger = (d.lingerDuration ?? 0) > 0;
      const groundTick = ownLinger || pulseN === 0 ? d.tickInterval ?? 0.5 : Infinity;
      const groundTick0 = ownLinger || pulseN === 0 ? 0 : Infinity;
      const expGraft = socketSpec(inst, "exposure");
      const expAfter = expGraft?.after ?? d.exposure;
      const expDomain = (expGraft ? expGraft.domain : d.exposureDomain) ? true : void 0;
      const mintExposure = () => expAfter ? { after: expAfter, dwell: /* @__PURE__ */ new Map() } : void 0;
      const maddenBank = $combatOwner.maddenBankOf(inst);
      const sizeOver = resolveSizeOver(instanceSizeOver(inst));
      if (d.line) {
        const pts = [];
        const n = d.line.segments;
        if (groundShape >= 1) {
          const R = d.line.spacing * n / (Math.PI * 2) * 1.45;
          for (let i = 0; i < n; i++) {
            const ang = caster.facing + i / n * Math.PI * 2;
            let r;
            if (groundShape >= 2) {
              const rel = ((ang - caster.facing) % (Math.PI * 2 / 3) + Math.PI * 2 / 3) % (Math.PI * 2 / 3);
              r = R * 0.5 / Math.max(0.2, Math.cos(rel - Math.PI / 3));
            } else {
              r = R / Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)));
            }
            pts.push(vec(at.x + Math.cos(ang) * r, at.y + Math.sin(ang) * r));
          }
        } else {
          const perp = caster.facing + Math.PI / 2;
          for (let i = 0; i < n; i++) {
            const off = (i - (n - 1) / 2) * d.line.spacing;
            pts.push(vec(at.x + Math.cos(perp) * off, at.y + Math.sin(perp) * off));
          }
        }
        for (const pt of pts) {
          $combatOwner.zones.push({
            tier: effectTier,
            pos: $combatOwner.clampPos(pt, 10, void 0, { tier: effectTier }),
            radius: d.radius * aoeScale * (sizeOver?.from ?? 1),
            caster,
            inst,
            color: cosmeticColor,
            delay: d.delay ?? 0,
            exploded: (d.delay ?? 0) <= 0,
            impactDress: d.impactDress,
            linger: pulseLinger((d.lingerDuration ?? 0) * caster.sheet.get("effectDuration", tags, extra)),
            linger0: pulseLinger((d.lingerDuration ?? 0) * caster.sheet.get("effectDuration", tags, extra)),
            tickInterval: groundTick,
            tickTimer: groundTick0,
            shape: 0,
            facing: caster.facing,
            dmgMult: useMult,
            depth: 0,
            curseAllies,
            struck: d.hitOnce ? /* @__PURE__ */ new Set() : void 0,
            rearm: d.rearmOnExit || void 0,
            pulse: mintPulse(d.delay ?? 0),
            exposure: mintExposure(),
            madden: maddenBank,
            sizeOver,
            radius0: sizeOver ? d.radius * aoeScale : void 0,
            flatBonus
          });
        }
        fieldAt = at;
        return fieldAt;
      }
      if (d.marker) {
        const cap = Math.max(1, d.marker.cap + Math.round(caster.sheet.get("stormCount", tags, extra)));
        const mine = $combatOwner.zones.filter((z) => z.caster === caster && z.inst.def.id === def.id && z.marker && !z.exploded);
        while (mine.length >= cap) {
          const oldest = mine.shift();
          const zi = $combatOwner.zones.indexOf(oldest);
          if (zi !== -1) {
            $combatOwner.expireZone(oldest);
            $combatOwner.zones.splice(zi, 1);
          }
        }
      }
      const fillTime = d.fillTime ?? (d.lingerDuration ?? 1);
      $combatOwner.zones.push({
        tier: effectTier,
        pos: at,
        radius: d.radius * aoeScale * (sizeOver?.from ?? 1),
        caster,
        inst,
        color: cosmeticColor,
        marker: d.marker ? true : void 0,
        delay: d.delay ?? 0,
        exploded: !!d.noImpact,
        impactDress: d.impactDress,
        linger: pulseLinger((d.lingerDuration ?? 0) * caster.sheet.get("effectDuration", tags, extra)),
        tickInterval: groundTick,
        tickTimer: groundTick0,
        shape: groundShape,
        facing: caster.facing,
        dmgMult: useMult,
        depth: 0,
        curseAllies,
        pulse: mintPulse(d.delay ?? 0),
        exposure: mintExposure(),
        exposureDomain: expDomain,
        pull: d.pull,
        pullRadius: d.pullRadius ? d.pullRadius * aoeScale : void 0,
        drift: d.drift,
        grow: d.grow ?? socketSpec(inst, "zoneGrow"),
        sizeOver,
        radius0: sizeOver ? d.radius * aoeScale : void 0,
        rotate: (() => {
          const r = caster.sheet.get("aoeSpin", tags, extra, d.rotate ?? 0);
          return r !== 0 ? r : void 0;
        })(),
        follow: d.follow || (socketSpec(inst, "zoneFollow") ? true : void 0),
        retract: d.retract,
        seek: d.seek ? { speed: d.seek.speed, range: d.seek.range ?? 420 } : void 0,
        madden: maddenBank,
        endBurst: d.endBurst,
        pendulum: (() => {
          const ps = hostSockets(inst).find((s) => s.def.pendulum)?.def.pendulum ?? d.pendulum;
          return ps ? { arc: ps.arcDeg * Math.PI / 180, period: ps.period, base: caster.facing } : void 0;
        })(),
        sweep: d.sweep ? d.sweep.converge ? {
          arc: d.sweep.arcDeg / 2 * Math.PI / 180,
          base: caster.facing - d.sweep.arcDeg / 4 * Math.PI / 180
        } : { arc: d.sweep.arcDeg * Math.PI / 180, base: caster.facing } : void 0,
        linger0: pulseLinger((d.lingerDuration ?? 0) * caster.sheet.get("effectDuration", tags, extra)),
        leaveTerrain: d.leaveTerrain,
        edge: d.innerFraction ?? d.fillFrom,
        fillRate: d.innerFraction === void 0 && d.fillFrom ? d.fillFrom / Math.max(0.2, fillTime) : void 0,
        emit: d.emit ?? (() => {
          const ze = socketSpec(inst, "zoneEmit");
          return ze ? { skillId: ze.skillId, interval: ze.interval, at: ze.at } : void 0;
        })(),
        emitStep: cadence ?? d.emit?.intervalStep,
        domain: d.domain,
        domainKey: d.domain ? `domain:${$combatOwner.domainSeq++}` : void 0,
        arcRad: d.arcDeg !== void 0 ? d.arcDeg * Math.PI / 180 * Math.sqrt(aoeScale) * arcScale : void 0,
        struck: d.hitOnce ? /* @__PURE__ */ new Set() : void 0,
        rearm: d.rearmOnExit || void 0,
        anchor: zoneAnchor,
        flatBonus
      });
      const prime = $combatOwner.zones[$combatOwner.zones.length - 1];
      if (d.sweep?.converge) {
        $combatOwner.zones.push({
          tier: effectTier,
          ...prime,
          pos: vec(prime.pos.x, prime.pos.y),
          sweep: {
            arc: -(d.sweep.arcDeg / 2 * Math.PI / 180),
            base: caster.facing + d.sweep.arcDeg / 4 * Math.PI / 180
          },
          struck: d.hitOnce ? /* @__PURE__ */ new Set() : void 0,
          emit: void 0,
          emitTimer: void 0,
          emitInst: void 0,
          emitInterval: void 0,
          emitStep: void 0,
          domain: void 0,
          domainKey: void 0,
          domainAffected: void 0,
          exposureDomain: void 0,
          marker: void 0,
          onImpact: void 0,
          madden: maddenBank,
          pulse: mintPulse(d.delay ?? 0),
          exposure: mintExposure()
        });
      }
      {
        const plan = instanceCascadePlan(inst, "axis");
        const extraCasc = Math.round(caster.sheet.get("aoeCascade", tags, extra));
        const nativeCount = (plan.native?.count ?? 0) + extraCasc;
        const axisAng = dist(caster.pos, at) < 1 ? caster.facing : angleTo(caster.pos, at);
        const stepScale = caster.sheet.get("cascadeStep", tags, extra);
        const walkPoints = (spec, count, from) => {
          const pts = [];
          if (count <= 0)
            return pts;
          const dir = spec?.dir ?? "axis";
          const stepLen = (spec?.step ?? d.radius * 1.4) * stepScale;
          const beatStep = cadence ?? spec?.intervalStep ?? 1;
          let beatAt = 0;
          let beatGap = spec?.interval ?? 0;
          for (let k = 1; k <= count; k++) {
            beatAt += beatGap;
            beatGap = Math.max(0.02, beatGap * beatStep);
            if (dir === "random") {
              const ra = rand(0, Math.PI * 2);
              const rd = stepLen * rand(0.5, 1.5);
              pts.push({ x: from.x + Math.cos(ra) * rd, y: from.y + Math.sin(ra) * rd, beatAt, k });
            } else {
              const sign = dir === "forward" ? 1 : dir === "backward" ? -1 : k % 2 === 1 ? 1 : -1;
              const reach = dir === "axis" ? Math.ceil(k / 2) * stepLen : k * stepLen;
              pts.push({
                x: from.x + Math.cos(axisAng) * reach * sign,
                y: from.y + Math.sin(axisAng) * reach * sign,
                beatAt,
                k
              });
            }
          }
          return pts;
        };
        const mintMarch = (from, baseMult, delayBase) => {
          const spec = plan.native;
          const scaleStep = spec?.scaleStep ?? 1;
          const dmgStep = spec?.dmgStep ?? 0.75;
          for (const p of walkPoints(spec, nativeCount, from)) {
            $combatOwner.zones.push({
              tier: effectTier,
              pos: vec(p.x, p.y),
              radius: d.radius * aoeScale * Math.pow(scaleStep, p.k) * (sizeOver?.from ?? 1),
              caster,
              inst,
              color: cosmeticColor,
              delay: delayBase + p.beatAt,
              exploded: false,
              linger: pulseLinger((d.lingerDuration ?? 0) * caster.sheet.get("effectDuration", tags, extra)),
              linger0: pulseLinger((d.lingerDuration ?? 0) * caster.sheet.get("effectDuration", tags, extra)),
              tickInterval: groundTick,
              tickTimer: groundTick0,
              shape: groundShape,
              facing: axisAng,
              dmgMult: baseMult * Math.pow(dmgStep, p.k),
              depth: 0,
              curseAllies,
              pull: d.pull,
              drift: d.drift,
              grow: d.grow ?? socketSpec(inst, "zoneGrow"),
              sizeOver,
              radius0: sizeOver ? d.radius * aoeScale * Math.pow(scaleStep, p.k) : void 0,
              pulse: mintPulse(delayBase + p.beatAt),
              exposure: mintExposure(),
              madden: maddenBank,
              arcRad: d.arcDeg !== void 0 ? d.arcDeg * Math.PI / 180 * Math.sqrt(aoeScale) * arcScale : void 0,
              struck: d.hitOnce ? /* @__PURE__ */ new Set() : void 0,
              flatBonus
            });
          }
        };
        mintMarch(at, useMult, d.delay ?? 0);
        for (const r of plan.recasts) {
          const rDmgStep = r.dmgStep ?? 0.75;
          const rScaleStep = r.scaleStep ?? 1;
          for (const p of walkPoints(r, r.count, at)) {
            const mult = useMult * Math.pow(rDmgStep, p.k);
            const delayBase = (d.delay ?? 0) + p.beatAt;
            const scale = Math.pow(rScaleStep, p.k);
            $combatOwner.zones.push({
              tier: effectTier,
              ...prime,
              pos: vec(p.x, p.y),
              radius: prime.radius * scale,
              radius0: prime.radius0 !== void 0 ? prime.radius0 * scale : void 0,
              delay: delayBase,
              exploded: !!d.noImpact,
              linger: prime.linger0 ?? prime.linger,
              linger0: prime.linger0,
              tickInterval: groundTick,
              tickTimer: groundTick0,
              dmgMult: mult,
              struck: d.hitOnce ? /* @__PURE__ */ new Set() : void 0,
              madden: maddenBank,
              exposure: mintExposure(),
              pulse: mintPulse(delayBase),
              emit: void 0,
              emitTimer: void 0,
              emitInst: void 0,
              emitInterval: void 0,
              emitStep: void 0,
              domain: void 0,
              domainKey: void 0,
              domainAffected: void 0,
              exposureDomain: void 0,
              marker: void 0,
              onImpact: void 0
            });
            mintMarch(vec(p.x, p.y), mult, delayBase);
          }
        }
      }
      const hex = caster.sheet.get("hexBlast", tags, extra);
      if (isCurse && hex > 0) {
        $combatOwner.zones.push({
          tier: effectTier,
          pos: vec(at.x, at.y),
          radius: d.radius * aoeScale,
          caster,
          inst,
          color: "#b06bd4",
          delay: (d.delay ?? 0) + 0.9,
          exploded: false,
          linger: 0,
          tickInterval: 0.5,
          tickTimer: 0,
          shape: caster.sheet.get("aoeShape", tags, extra),
          facing: caster.facing,
          dmgMult: hex * useMult,
          depth: 1,
          forceDamage: true
        });
      }
      fieldAt = at;
      return fieldAt;
    }
  }
  return fieldAt;
}
function self(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    $combatOwner.showSkillArrival(caster, inst, caster.pos, caster.radius + 18, effectTier, true);
    if (!skillRiteVoice(def.id) && !instanceEffects(inst).some((f) => f.type === "detonateMinions" || f.type === "shatterConstructs"))
      $combatOwner.showSelfRelease(caster, inst);
    {
      const mtWalk = caster.sheet.get("moveTrail", tags, extra);
      if (mtWalk > 0) {
        let dur = 0;
        for (const fx of instanceEffects(inst)) {
          if (fx.type === "buff" && fx.duration)
            dur = Math.max(dur, fx.duration);
          else if (fx.type === "status") {
            dur = Math.max(dur, STATUS_DEFS[fx.status]?.duration ?? 0);
          }
        }
        const hold = (dur > 0 ? dur : 4) * caster.sheet.get("effectDuration", tags, extra);
        const wt = caster;
        wt.walkTrail = { spec: $combatOwner.statTrailSpec(mtWalk), until: $combatOwner.time + hold, inst };
        wt.walkTrailPrev = vec(caster.pos.x, caster.pos.y);
        wt.walkTrailOdo = 0;
      }
    }
    if (def.amalgam && caster.casting?.mode === "channel") {
      const lord = caster.owner ?? caster;
      const cs2 = caster.casting;
      if ((cs2.amalgamFed ?? 0) < def.amalgam.cap) {
        let meal = null, bd = def.amalgam.radius;
        for (const m of $combatOwner.actors) {
          if (m.owner !== lord || m.dead || m.construct || m.untargetable)
            continue;
          const dd = dist(caster.pos, m.pos);
          if (dd < bd) {
            bd = dd;
            meal = m;
          }
        }
        if (meal) {
          cs2.amalgamFed = (cs2.amalgamFed ?? 0) + 1;
          $combatOwner.kill(meal, true, caster, "sacrifice");
          const feedingCue = meal.dead ? feedingCueFlash(meal.pos, caster, def.feedingCue, "ritual", meal.tier, meal.radius) : void 0;
          if (feedingCue)
            $combatOwner.flashes.push(feedingCue);
        }
      }
    }
    return fieldAt;
  }
  return fieldAt;
}
function summon(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      if (d.channelFormation) {
        $combatOwner.channelFormations.pulse(caster, inst);
        return fieldAt;
      }
      if (d.fromCorpse) {
        const form = grimoireForm(inst);
        if (form && MONSTERS[form]) {
          $combatOwner.spawnMinion(caster, inst, { tier: effectTier, monsterId: form });
          return fieldAt;
        }
        if (!targetInfo?.corpse)
          return fieldAt;
        const haul = (targetInfo.corpses ?? [targetInfo.corpse]).filter((c) => $combatOwner.corpses.includes(c));
        if (!haul.length)
          return fieldAt;
        const rosterCap = summonCapacity(caster, inst, d);
        const standing = (d.poolGroup ? $combatOwner.minionsOfGroup(caster, d.poolGroup) : $combatOwner.minionsOfSkill(caster, inst.def.id)).filter((a) => !a.summonOffspring).length;
        const raise = Math.max(1, Math.min(haul.length, rosterCap - standing));
        for (let ri = 0; ri < raise; ri++) {
          const corpse = haul[ri];
          $combatOwner.removeCorpse(corpse);
          $combatOwner.spawnMinion(caster, inst, { tier: effectTier, monsterId: corpse.defId, pos: corpse.pos });
        }
        $combatOwner.corpseSpawn(caster, inst, haul[0].pos, raise);
        return fieldAt;
      }
      if (d.persistent?.toggle) {
        if (caster.summonToggles.has(def.id))
          return fieldAt;
        const slots = summonContractSlots(caster, inst, d);
        const reserve = summonReservationUnit(caster, inst, d) * slots;
        let freed = 0;
        if (d.exclusiveGroup)
          for (const t of caster.summonToggles.values()) {
            const td = instanceDelivery(t.inst);
            if (td.type === "summon" && td.exclusiveGroup === d.exclusiveGroup)
              freed += t.reserved;
          }
        if (slots <= 0 || caster.reservedMana - freed + reserve > caster.maxMana()) {
          $combatOwner.text(caster.pos, "cannot sustain", "#d05050", 12);
          return fieldAt;
        }
        $combatOwner.dismissExclusiveSummons(caster, inst, d);
        caster.reservedMana += reserve;
        caster.mana = Math.min(caster.mana, caster.availableMaxMana());
        caster.summonToggles.set(def.id, { inst, reserved: reserve, slots });
        const first = def.hivecall || d.frame?.consolidation ? 1 : Math.min(slots, Math.max(1, Math.round((d.count + Math.round(caster.sheet.get("summonCount", tags, extra))) * gPow)));
        const seqFill = caster.sheet.get("summonSequence", tags, extra) > 0;
        if (seqFill && first > 1) {
          $combatOwner.spawnMinion(caster, inst, { tier: effectTier, dmgMult: useMult });
          $combatOwner.pendingSummons.push({
            caster,
            inst,
            remaining: first - 1,
            timer: 0.35,
            interval: 0.35,
            mult: useMult
          });
        } else {
          for (let i = 0; i < first; i++)
            $combatOwner.spawnMinion(caster, inst, { tier: effectTier, dmgMult: useMult });
        }
        return fieldAt;
      }
      $combatOwner.dismissExclusiveSummons(caster, inst, d);
      const total = Math.max(1, Math.round((d.count + Math.round(caster.sheet.get("summonCount", tags, extra))) * gPow));
      const cursorRange = d.placeAt?.range ?? 420;
      const wantCursor = d.placeAt?.at === "cursor" || caster.sheet.get("summonAtCursor", tags, extra) > 0;
      const summonAt = wantCursor ? $combatOwner.clampPos(dist(caster.pos, aim) <= cursorRange ? vec(aim.x, aim.y) : vec(caster.pos.x + Math.cos(caster.facing) * cursorRange, caster.pos.y + Math.sin(caster.facing) * cursorRange), 10, void 0, { tier: effectTier }) : void 0;
      const scatter = d.placeAt?.scatter ?? 60;
      const spot = () => summonAt ? vec(summonAt.x + rand(-scatter, scatter), summonAt.y + rand(-scatter, scatter)) : void 0;
      if (d.waves && d.waves.count > 1) {
        for (let i = 0; i < total; i++)
          $combatOwner.spawnMinion(caster, inst, { tier: effectTier, pos: spot(), dmgMult: useMult });
        const perWave = d.waves.costFactor ? (() => {
          const c = caster.skillCost(inst);
          return { mana: c.mana * d.waves.costFactor, life: c.life * d.waves.costFactor };
        })() : void 0;
        $combatOwner.pendingSummons.push({
          caster,
          inst,
          remaining: (d.waves.count - 1) * total,
          timer: d.waves.interval,
          interval: d.waves.interval,
          batch: total,
          at: summonAt ? vec(summonAt.x, summonAt.y) : void 0,
          trackAim: d.waves.trackAim,
          scatter,
          range: d.placeAt?.range ?? 420,
          mult: useMult,
          costPer: perWave
        });
        return fieldAt;
      }
      const sequential = caster.sheet.get("summonSequence", tags, extra) > 0;
      if (sequential && total > 1) {
        $combatOwner.spawnMinion(caster, inst, { tier: effectTier, pos: spot(), dmgMult: useMult });
        $combatOwner.pendingSummons.push({
          caster,
          inst,
          remaining: total - 1,
          timer: 0.35,
          interval: 0.35,
          at: summonAt,
          scatter
        });
      } else {
        for (let i = 0; i < total; i++)
          $combatOwner.spawnMinion(caster, inst, { tier: effectTier, pos: spot(), dmgMult: useMult });
      }
      return fieldAt;
    }
  }
  return fieldAt;
}
function storm(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      const wantAt = dist(caster.pos, aim) <= d.castRange ? vec(aim.x, aim.y) : vec(caster.pos.x + Math.cos(caster.facing) * d.castRange, caster.pos.y + Math.sin(caster.facing) * d.castRange);
      const at = $combatOwner.clampPos($combatOwner.skillOcclusion(caster, inst) === "blocked" ? $combatOwner.clipShot(caster.pos, wantAt, effectTier) : wantAt, 10, void 0, { tier: effectTier });
      const strikes = Math.max(1, Math.round(rollCount(d.count, Math.round(caster.sheet.get("stormCount", tags, extra)) + ventRounds) * gPow));
      const immFrac = d.interval <= 0 ? 1 : caster.sheet.get("stormImmediate", tags, extra);
      const immCount = Math.round(strikes * immFrac);
      const shape = caster.sheet.get("aoeShape", tags, extra);
      const fuse = d.telegraph ?? 0;
      if (fuse > 0) {
        $combatOwner.flashes.push({
          recoveryCueTier: effectTier,
          pos: vec(at.x, at.y),
          radius: d.areaRadius * aoeScale,
          color: cosmeticColor,
          life: fuse,
          maxLife: fuse,
          edgeFrac: 0.94
        });
      }
      const sVar = d.scatter ?? 0;
      const under = d.atEnemies ? $combatOwner.enemiesOf(caster, effectTier).filter((e) => dist(at, e.pos) <= d.areaRadius * aoeScale).sort((e1, e2) => dist(at, e1.pos) - dist(at, e2.pos)).slice(0, strikes).map((e) => vec(e.pos.x + rand(-sVar, sVar), e.pos.y + rand(-sVar, sVar))) : [];
      const arming = d.awaitRelease !== void 0 && caster.casting?.mode === "channel" && caster.casting.inst.def.id === def.id;
      const stCad = socketSpec(inst, "cadence")?.intervalStep;
      const stPlan = instancePulsePlan(inst);
      const stSpec = stPlan.native;
      const stN = Math.max(0, (stSpec ? stSpec.count ?? 1 : 0) + Math.round(caster.sheet.get("pulseCount", tags, extra)));
      const stDelay = stSpec?.delay ?? 1;
      const stInterval = stSpec?.interval ?? stDelay;
      const stStep = stCad ?? stSpec?.intervalStep ?? 1;
      const stQueue = flattenPulseQueue(stPlan.appended, stCad);
      let stSpan = 0;
      if (stN > 0) {
        stSpan = stDelay + 0.1;
        let gap = stInterval;
        for (let k = 1; k < stN; k++) {
          stSpan += gap;
          gap = Math.max(0.05, gap * stStep);
        }
        for (const q of stQueue)
          stSpan += q.delay;
      }
      const strikeBirth = (() => {
        const b = instanceBirth(inst);
        return b && !b.onHit ? b : void 0;
      })();
      for (let i = 0; i < strikes; i++) {
        const ang = rand(0, Math.PI * 2);
        const r = Math.sqrt((() => w.random())()) * d.areaRadius * aoeScale;
        const zDelay = arming ? 9999 : fuse + (i < immCount ? rand(0.15, 0.3) : 0.3 + (i - immCount) * d.interval);
        $combatOwner.zones.push({
          tier: effectTier,
          pos: $combatOwner.clampPos(i < under.length ? vec(under[i].x, under[i].y) : vec(at.x + Math.cos(ang) * r, at.y + Math.sin(ang) * r), 10, void 0, { tier: effectTier }),
          radius: d.hitRadius * aoeScale,
          caster,
          inst,
          color: cosmeticColor,
          delay: zDelay,
          hitAll: d.sky || void 0,
          spareDormant: d.sky || void 0,
          spareRoofed: d.sky || void 0,
          lobFrom: d.lob && !arming ? vec(caster.pos.x, caster.pos.y) : void 0,
          lobArc: d.lob?.arc,
          delay0: !arming ? zDelay : void 0,
          impactDress: d.impactDress,
          birth: strikeBirth,
          fx: skillPresenceVoice(def.id, "pulse") ?? d.fx,
          onGround: d.onGround,
          armed: arming || void 0,
          armSeq: arming ? $combatOwner.sparkSeq++ : void 0,
          exploded: false,
          linger: stN > 0 ? stSpan : 0,
          tickInterval: stN > 0 ? Infinity : 0.5,
          tickTimer: stN > 0 ? Infinity : 0,
          shape,
          facing: ang,
          dmgMult: useMult,
          depth: 0,
          flatBonus,
          pulse: stN > 0 ? {
            delay: stDelay,
            interval: stInterval,
            intervalStep: stStep,
            dmgMult: stSpec?.dmgMult ?? 1,
            dmgStep: stSpec?.dmgStep ?? 1,
            radiusMult: stSpec?.radiusMult ?? 1,
            radiusStep: stSpec?.radiusStep ?? 1,
            left: stN,
            next: 0,
            queue: stQueue.length ? [...stQueue] : void 0
          } : void 0
        });
      }
      fieldAt = at;
      return fieldAt;
    }
  }
  return fieldAt;
}
function dash(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      if (caster.caromRun)
        $combatOwner.endCarom(caster, { quiet: true });
      if (d.decoyDuration) {
        const mirage = new Actor(`${caster.name}?`, caster.team, vec(caster.pos.x, caster.pos.y));
        mirage.owner = caster;
        mirage.sourceSkillId = def.id;
        mirage.summonInst = inst;
        mirage.tier = effectTier;
        mirage.shape = caster.shape;
        mirage.color = caster.color;
        mirage.radius = caster.radius;
        mirage.facing = caster.facing;
        mirage.look = caster.look;
        mirage.adorn = caster.adorn;
        mirage.material = caster.material;
        mirage.taunt = true;
        mirage.construct = { kind: "decoy", range: 0, timer: 0 };
        mirage.sheet.setBase("life", 25 + caster.maxLife() * 0.2);
        mirage.fillResources();
        mirage.lifespan = d.decoyDuration * caster.sheet.get("effectDuration", tags, extra);
        $combatOwner.actors.push(mirage);
      }
      const dashSpeed = d.speed * (opts.speedMult ?? 1);
      caster.dash = { dir: caster.facing, speed: dashSpeed, remaining: d.distance / dashSpeed };
      $combatOwner.movementFlashes.delete(caster);
      $combatOwner.movementMoment(caster, inst, "depart");
      if (d.phase) {
        const want = d.distance / dashSpeed + 0.25;
        caster.applyStatus("phasing", 0, want / (STATUS_DEFS["phasing"]?.duration ?? 4), def.name);
      }
      caster.dashSkill = inst;
      caster.dashHits = /* @__PURE__ */ new Set();
      const mt = caster.sheet.get("moveTrail", tags, extra);
      caster.dashTrailSpec = d.trailZone ?? (mt > 0 ? { radius: 32, duration: 2.2, tickInterval: 0.4, damageScale: mt } : void 0);
      caster.dashVentSpec = d.trailVent ? {
        bank: d.trailVent.bank,
        radius: d.trailVent.radius * aoeScale,
        duration: d.trailVent.duration * caster.sheet.get("effectDuration", tags, extra),
        spacing: Math.max(20, d.trailVent.spacing ?? 90)
      } : void 0;
      const ct = caster.sheet.get("cloudTrail", tags, extra);
      const stCT = CONJURE_CFG.statTrail;
      const baseCT = d.trailConjure ?? (ct > 0 ? { radius: stCT.radius + ct * stCT.radiusPer, duration: stCT.hold + ct * stCT.holdPer } : void 0);
      caster.dashConjureSpec = baseCT ? {
        radius: baseCT.radius,
        duration: baseCT.duration,
        grants: $combatOwner.conjureGrantsFor(caster, tags, extra, baseCT.grants),
        ...baseCT.look !== void 0 ? { look: baseCT.look } : {}
      } : void 0;
      $combatOwner.moveBlast(caster, inst, caster.pos, "depart");
      return fieldAt;
    }
  }
  return fieldAt;
}
function carom(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      if (caster.caromRun)
        $combatOwner.endCarom(caster, { quiet: true });
      const caromSpeed = d.speed * (opts.speedMult ?? 1);
      const caromDur = d.duration * caster.sheet.get("effectDuration", tags, extra);
      const rideStatus = d.status ?? "caroming";
      caster.caromRun = { dir: caster.facing, speed: caromSpeed, status: rideStatus };
      $combatOwner.movementFlashes.delete(caster);
      $combatOwner.movementMoment(caster, inst, "depart");
      caster.caromSkill = inst;
      caster.caromHits = /* @__PURE__ */ new Map();
      caster.caromRung = /* @__PURE__ */ new Set();
      const rideDef = STATUS_DEFS[rideStatus];
      if (rideDef)
        caster.applyStatus(rideStatus, 0, caromDur / (rideDef.duration || 1), def.name);
      $combatOwner.moveBlast(caster, inst, caster.pos, "depart");
      return fieldAt;
    }
  }
  return fieldAt;
}
function blink(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      if (caster.caromRun)
        $combatOwner.endCarom(caster, { quiet: true });
      let dest;
      if (d.behindTarget && targetInfo?.actor) {
        const foe = targetInfo.actor;
        const ang = foe.facing + Math.PI;
        dest = vec(foe.pos.x + Math.cos(ang) * (foe.radius + caster.radius + 10), foe.pos.y + Math.sin(ang) * (foe.radius + caster.radius + 10));
      } else if (targetInfo) {
        dest = vec(targetInfo.pos.x, targetInfo.pos.y);
      } else {
        const dd = Math.min(dist(caster.pos, aim), d.range);
        dest = vec(caster.pos.x + Math.cos(caster.facing) * dd, caster.pos.y + Math.sin(caster.facing) * dd);
      }
      dest = $combatOwner.affordedDest(caster, inst, $combatOwner.clampPos(dest, caster.radius, void 0, { mover: caster }));
      const ctB = caster.sheet.get("cloudTrail", tags, extra);
      if (ctB > 0) {
        const st = CONJURE_CFG.statTrail;
        $combatOwner.conjureCloud(caster.pos.x, caster.pos.y, st.radius + ctB * st.radiusPer, st.hold + ctB * st.holdPer, { caster, grants: $combatOwner.conjureGrantsFor(caster, tags, extra) });
      }
      const mtBlink = caster.sheet.get("moveTrail", tags, extra);
      if (mtBlink > 0) {
        const spec = $combatOwner.statTrailSpec(mtBlink);
        $combatOwner.mintTrailPatch(caster, inst, spec, caster.pos, caster.facing);
        $combatOwner.mintTrailPatch(caster, inst, spec, dest, caster.facing);
      }
      $combatOwner.moveBlast(caster, inst, caster.pos, "depart");
      if (d.delay && d.delay > 0) {
        const visual = {
          pos: vec(dest.x, dest.y),
          radius: caster.radius * 1.6,
          color: cosmeticColor,
          life: d.delay,
          maxLife: d.delay,
          fx: skillMovementVoice(def.id, "wait"),
          facing: caster.facing,
          recoveryCueTier: effectTier
        };
        $combatOwner.pendingBlinks.push({
          actor: caster,
          dest,
          timer: d.delay,
          color: cosmeticColor,
          inst,
          visual,
          ...d.behindTarget && targetInfo?.actor ? { faceTarget: targetInfo.actor } : {}
        });
        $combatOwner.flashes.push(visual);
      } else {
        $combatOwner.teleportActor(caster, dest, cosmeticColor, void 0, effectTier, def.id);
        if (d.behindTarget && targetInfo?.actor) {
          caster.facingPrev = caster.facing = angleTo(caster.pos, targetInfo.actor.pos);
        }
        $combatOwner.moveBlast(caster, inst, caster.pos);
        $combatOwner.dropLingerField(caster, inst, caster.pos);
      }
      return fieldAt;
    }
  }
  return fieldAt;
}
function leap(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      if (caster.leap || opts.noRepeat) {
        const radius = d.radius * aoeScale;
        for (const e of $combatOwner.enemiesOf(caster, effectTier)) {
          if (e.tier !== effectTier)
            continue;
          if (dist(caster.pos, e.pos) - e.radius <= radius) {
            $combatOwner.resolveHit(caster, inst, e, useMult, void 0, void 0, void 0, void 0, void 0, void 0, effectTier);
          }
        }
        $combatOwner.strikeSurfaces(caster, caster.pos, radius, void 0, void 0, effectTier);
        $combatOwner.flashes.push({
          pos: vec(caster.pos.x, caster.pos.y),
          radius,
          color: cosmeticColor,
          life: 0.3,
          maxLife: 0.3,
          fx: skillMovementVoice(def.id, "impact"),
          facing: caster.facing,
          recoveryCueTier: effectTier
        });
        return fieldAt;
      }
      const dd = Math.min(dist(caster.pos, aim), d.range);
      const dest = $combatOwner.affordedDest(caster, inst, $combatOwner.clampPos(vec(caster.pos.x + Math.cos(caster.facing) * dd, caster.pos.y + Math.sin(caster.facing) * dd), caster.radius, void 0, { mover: caster }));
      caster.leap = {
        from: vec(caster.pos.x, caster.pos.y),
        dest,
        total: d.airTime,
        timer: d.airTime,
        radius: d.radius * aoeScale,
        inst,
        dmgMult: useMult,
        wasUntargetable: caster.untargetable,
        telegraph: d.telegraph ? { color: (typeof d.telegraph === "object" ? d.telegraph.color : void 0) ?? def.color } : void 0,
        vent: d.vent ? { columnR: d.vent.columnR * aoeScale } : void 0
      };
      caster.untargetable = true;
      $combatOwner.movementFlashes.delete(caster);
      $combatOwner.movementMoment(caster, inst, "depart");
      caster.dash = null;
      if (caster.caromRun)
        $combatOwner.endCarom(caster, { quiet: true });
      caster.useLock = Math.max(caster.useLock, d.airTime + 0.1);
      if (d.vent) {
        const vr = d.vent.columnR * aoeScale;
        const vScale = useMult * (d.vent.scale ?? 0.6);
        for (const e of $combatOwner.enemiesOf(caster, effectTier)) {
          if (dist(caster.pos, e.pos) - e.radius <= vr)
            $combatOwner.resolveHit(caster, inst, e, vScale, void 0, void 0, void 0, void 0, void 0, void 0, effectTier);
        }
        $combatOwner.strikeSurfaces(caster, caster.pos, vr, void 0, void 0, effectTier);
        $combatOwner.flashes.push({
          recoveryCueTier: effectTier,
          pos: vec(caster.pos.x, caster.pos.y),
          radius: vr,
          color: "#d9f7fb",
          life: 0.35,
          maxLife: 0.35
        });
      }
      const ctL = caster.sheet.get("cloudTrail", tags, extra);
      if (ctL > 0) {
        const st = CONJURE_CFG.statTrail;
        $combatOwner.conjureCloud(caster.pos.x, caster.pos.y, st.radius + ctL * st.radiusPer, st.hold + ctL * st.holdPer, { caster, grants: $combatOwner.conjureGrantsFor(caster, tags, extra) });
      }
      const mtLeap = caster.sheet.get("moveTrail", tags, extra);
      if (mtLeap > 0) {
        $combatOwner.mintTrailPatch(caster, inst, $combatOwner.statTrailSpec(mtLeap), caster.pos, caster.facing);
      }
      $combatOwner.moveBlast(caster, inst, caster.pos, "depart");
      return fieldAt;
    }
  }
  return fieldAt;
}
function mark(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      const st = inst.state ??= {};
      if (st.markPos) {
        $combatOwner.teleportActor(caster, vec(st.markPos.x, st.markPos.y), cosmeticColor, void 0, void 0, def.id);
        st.markPos = null;
      } else {
        const dd = Math.min(dist(caster.pos, aim), d.castRange);
        const at = $combatOwner.clampPos(vec(caster.pos.x + Math.cos(caster.facing) * dd, caster.pos.y + Math.sin(caster.facing) * dd), 10, void 0, { tier: effectTier });
        st.markPos = { x: at.x, y: at.y };
        $combatOwner.flashes.push({
          pos: vec(at.x, at.y),
          radius: 28,
          color: cosmeticColor,
          life: 0.4,
          maxLife: 0.4,
          fx: skillSelfVoice(def.id),
          recoveryCueTier: effectTier
        });
      }
      return fieldAt;
    }
  }
  return fieldAt;
}
function construct(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      if (challengeOf(inst)?.device) {
        $combatOwner.challenges.toss(caster, inst, aim, d, useMult);
        return fieldAt;
      }
      const sum = instanceSummon(inst);
      if (sum) {
        $combatOwner.spawnMinion(caster, inst, { tier: effectTier, delivery: sum });
        return fieldAt;
      }
      const castInst = d.castSkillId ? makeSkillInstance(SKILLS[d.castSkillId], effectiveSkillLevel(inst)) : void 0;
      if (castInst) {
        $combatOwner.forwardSummonSockets(inst, [castInst], {
          scale: CONSTRUCT_FORWARD_CFG.scale[d.kind ?? ""] ?? CONSTRUCT_FORWARD_CFG.scaleDefault
        });
      }
      if (d.kind === "echo" && d.echo) {
        $combatOwner.spawnEchoRiders(caster, inst, d.echo, def.id + ":self", aim, castInst);
        return fieldAt;
      }
      if (d.ring) {
        const reach = Math.min(dist(caster.pos, aim), d.placeRange ?? 320);
        const center = targetInfo?.pos ?? $combatOwner.clampPos(vec(caster.pos.x + Math.cos(caster.facing) * reach, caster.pos.y + Math.sin(caster.facing) * reach), 10, void 0, { tier: effectTier });
        const R = d.ring.radius * aoeScale;
        for (let i = 0; i < d.ring.segments; i++) {
          const ang = i / d.ring.segments * Math.PI * 2;
          $combatOwner.spawnConstruct(caster, inst, d, aim, castInst, vec(center.x + Math.cos(ang) * R, center.y + Math.sin(ang) * R), 1, effectTier);
        }
        return fieldAt;
      }
      const segs = d.wallSegments ?? 1;
      if (segs > 1) {
        const reach = Math.min(dist(caster.pos, aim), d.placeRange ?? 100);
        const base = vec(caster.pos.x + Math.cos(caster.facing) * reach, caster.pos.y + Math.sin(caster.facing) * reach);
        const perp = caster.facing + Math.PI / 2;
        const spacing = 34;
        for (let i = 0; i < segs; i++) {
          const off = (i - (segs - 1) / 2) * spacing;
          $combatOwner.spawnConstruct(caster, inst, d, aim, castInst, vec(base.x + Math.cos(perp) * off, base.y + Math.sin(perp) * off), 1, effectTier);
        }
      } else {
        $combatOwner.spawnConstruct(caster, inst, d, aim, castInst, void 0, def.castMode === "charge" ? useMult : 1, effectTier);
      }
      return fieldAt;
    }
  }
  return fieldAt;
}
function aura(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      $combatOwner.activateAura(caster, inst, d, aoeScale);
      return fieldAt;
    }
  }
  return fieldAt;
}
function detonateProjectile(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      let best = null;
      let bd = Infinity;
      for (const pr of $combatOwner.projectiles) {
        if (pr.caster !== caster)
          continue;
        if (d.requireTag && !pr.inst.def.tags.includes(d.requireTag))
          continue;
        const dd = dist(pr.pos, aim);
        if (dd < bd) {
          bd = dd;
          best = pr;
        }
      }
      const at = best ? vec(best.pos.x, best.pos.y) : vec(caster.pos.x, caster.pos.y);
      if (best)
        $combatOwner.projectiles.splice($combatOwner.projectiles.indexOf(best), 1);
      const mult = (best ? d.consumeBonus ?? 1.5 : 1) * useMult;
      const radius = d.radius * aoeScale;
      const shape = caster.sheet.get("aoeShape", tags, extra);
      for (const victim of $combatOwner.enemiesOf(caster, effectTier)) {
        if (!inAoe(at, radius, shape, caster.facing, victim.pos, victim.radius))
          continue;
        $combatOwner.resolveHit(caster, inst, victim, mult, 0, flatBonus, void 0, void 0, void 0, void 0, effectTier);
      }
      $combatOwner.frontSplash(caster, inst, at, radius, effectTier);
      $combatOwner.strikeSurfaces(caster, at, radius, (p, r) => inAoe(at, radius, shape, caster.facing, p, r), void 0, effectTier);
      $combatOwner.flashes.push({
        pos: at,
        radius,
        color: cosmeticColor,
        life: 0.35,
        maxLife: 0.35,
        shape,
        facing: caster.facing,
        fx: skillSelfVoice(def.id, "burst"),
        recoveryCueTier: effectTier
      });
      $combatOwner.spawnAftershocks(caster, inst, at, radius, shape, void 0, effectTier);
      $combatOwner.mintAftermath(caster, inst, at, radius, shape, caster.facing, useMult, tags, extra, void 0, void 0, void 0, effectTier);
      fieldAt = at;
      return fieldAt;
    }
  }
  return fieldAt;
}
function detonate(frame) {
  const { caster, inst, aim, opts, targetInfo, targetSpec, origin, d, tags, extra, useMult, gPow, ventRounds, corpseFeast, flatBonus, aoeScale, arcScale, cosmeticColor } = frame;
  const effectTier = frame.effectTier ?? frame.opts.tier ?? caster.tier, def = inst.def;
  let fieldAt = null;
  {
    {
      const mines = $combatOwner.actors.filter((a) => a.owner === caster && !a.dead && a.construct?.kind === "mine" && !(a.construct.timer > 0) && a.construct.detonationLeft === void 0 && !$combatOwner.pendingDetonations.some((pd) => pd.mine === a));
      mines.forEach((mine, i) => {
        const timer = DEVICE_CFG.detonation.lead + i * DEVICE_CFG.detonation.stagger, fx = skillSelfVoice(def.id, "prepare");
        mine.construct.detonationLeft = timer;
        const visual = fx ? {
          pos: { ...mine.pos },
          radius: mine.radius + 18,
          color: cosmeticColor,
          life: timer,
          maxLife: timer,
          fx,
          recoveryCueTier: mine.tier
        } : void 0;
        if (visual)
          $combatOwner.flashes.push(visual);
        $combatOwner.pendingDetonations.push({ mine, timer, visual });
      });
      if (mines.length)
        $combatOwner.showSelfRelease(caster, inst);
      if (!mines.length)
        $combatOwner.text(caster.pos, "no mines placed", "#8a8678", 11);
      return fieldAt;
    }
  }
  return fieldAt;
}
const deliveryFamilies = { projectile, melee, nova, target, cone, ground, self, summon, storm, dash, carom, blink, leap, mark, construct, aura, detonateProjectile, detonate };
function deliverPrototype(frame) {
  const run = deliveryFamilies[frame.d.type];
  if (!run) throw Error("Unsupported prototype delivery: " + frame.d.type);
  return run(frame);
}

return {preparePrototype,deliverPrototype,completePrototype};
}
export function createPrototypeMechanics(w,q) {
const library={};
Object.assign(library,castSequence(w,q,library));
Object.assign(library,strikeTiming(w,q,library));
Object.assign(library,groundDevices(w,q,library));
Object.assign(library,buffSource(w,q,library));
Object.assign(library,projectileArts(w,q,library));
Object.assign(library,summonArts(w,q,library));
Object.assign(library,cohortArts(w,q,library));
Object.assign(library,frameArts(w,q,library));
Object.assign(library,channelFormation(w,q,library));
Object.assign(library,summonPacts(w,q,library));
Object.assign(library,minionTransmutation(w,q,library));
Object.assign(library,battleDoctrines(w,q,library));
Object.assign(library,controllers(w,q,library));
Object.assign(library,deliveries(w,q,library));
return Object.freeze(library);
}
