import type {ChallengePoint, ChallengeActor, ChallengeSkill, ChallengeProjectile, ChallengeCarrier, ChallengeConstructDelivery, ChallengePorts} from './challenge-types.js';
import {challengeContinuationState, type ChallengeOwnedState, type ChallengeState, type ChallengeCast, type Effigy, type Landing, type Shock} from './challenge-owned.js';
export type * from './challenge-types.js';

const dist=(a:ChallengePoint,b:ChallengePoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const angleTo=(a:ChallengePoint,b:ChallengePoint)=>Math.atan2(b.y-a.y,b.x-a.x);

/** Challenge casts capture their investment; bounded secondary generations
 * and explicit host ownership prevent recursion and respec leftovers. */
export class Challenges<A extends ChallengeActor<I,M>,I extends ChallengeSkill<M>,M,P extends ChallengeProjectile<A,I>,R extends ChallengeCarrier<A,I>,F extends ChallengeCarrier<A,I>,Z extends ChallengeCarrier<A,I>,C extends ChallengeConstructDelivery> {
  private states = new Map<string, ChallengeState<A,I>>();
  private casts = new WeakMap<I, ChallengeCast<A,I>>();
  private landings: Landing<A,I,C>[] = [];
  private effigies: Effigy<A,I>[] = [];
  private shocks: Shock<A,I>[] = [];
  private used = false;
  constructor(private readonly ports:ChallengePorts<A,I,M,P,R,F,Z,C>) {}
  /** @internal Used only by the optional continuation entry. */
  [challengeContinuationState](next?: ChallengeOwnedState<A,I,C>): ChallengeOwnedState<A,I,C> {
    if (next) {
      this.states = next.states; this.casts = next.casts; this.landings = next.landings;
      this.effigies = next.effigies; this.shocks = next.shocks; this.used = next.used;
    }
    return {states: this.states, casts: this.casts, landings: this.landings,
      effigies: this.effigies, shocks: this.shocks, used: this.used};
  }
  private policy(inst: I) {
    return JSON.stringify([inst.treeNodes, inst.level, inst.sockets.map(s => s && [s.def.id, s.level]), inst.grafts?.map(s => [s.def.id, s.level])]);
  }
  private key(owner: A, host: I) { return `${owner.id}:${host.def.id}`; }
  private readyId(state: ChallengeState<A,I>) { return `goad_reopening:${state.owner.id}:${state.host.def.id}`; }

  prepare(owner: A, inst: I, real: boolean): I {
    if (this.casts.has(inst)) return inst;
    const spec = this.ports.spec(inst); if (!spec) return inst;
    const key = this.key(owner, inst), policy = this.policy(inst);
    let state = this.states.get(key);
    if (state && (state.host !== inst || state.policy !== policy)) { this.clear(owner, state.host); state = undefined; }
    if (!state) {
      state = { owner, host: inst, spec, policy, primed: false, guaranteedAt: -Infinity, retired: false };
      this.states.set(key, state);
      this.used = true;
    }
    const snapshot = { ...inst, sockets: [...inst.sockets], grafts: inst.grafts && [...inst.grafts], treeNodes: [...(inst.treeNodes ?? [])],
      state: inst.state ??= {}, challengeHost: inst };
    this.casts.set(snapshot, { state, inst: snapshot, primed: real && state.primed, generation: 0, orbitTargets: new Set() });
    if (real) { state.primed = false; owner.removeBuff(this.readyId(state)); }
    return snapshot;
  }

  completed(owner: A, inst: I): void {
    const cast = this.casts.get(inst); if (!cast || cast.state.retired) return;
    const state = cast.state, s = state.spec;
    if (!s.resetChance) return;
    const guaranteed = !!s.guaranteedResetEvery && this.ports.time >= state.guaranteedAt;
    if (guaranteed || this.ports.random() < s.resetChance) {
      if (guaranteed) state.guaranteedAt = this.ports.time + s.guaranteedResetEvery!;
      owner.cooldowns.delete(state.host.def.id); owner.cooldownTotals.delete(state.host.def.id);
      state.primed = true;
      owner.addBuff({ type: 'buff', id: this.readyId(state), label: 'Reopening Ready', duration: 999999, mods: [] });
      this.ports.text(owner.pos, 'Goad reset — reopen the wound', '#e0a078', 12);
    }
  }

  beforeEffects(caster: A, inst: I, target: A, dealt: number, depth: number): void {
    const cast = this.casts.get(inst);
    if (!cast || cast.state.retired || target.dead || dealt <= 0) return;
    const s = cast.state.spec, bleeding = target.statuses.some(st => st.id === 'bleed');
    if (depth === 0 && bleeding && s.bleedingImpaleMore) {
      const impale = target.statuses.find(st => st.id === 'impaled');
      if (impale?.rupture) impale.rupture *= 1 + s.bleedingImpaleMore;
    }
    if (cast.primed && s.bleedPop) {
      let remaining = 0;
      target.statuses = target.statuses.filter(st => {
        if (st.id !== 'bleed' || st.challengeField !== undefined) return true;
        remaining += st.dps * st.stacks * Math.max(0, st.remaining); return false;
      });
      if (remaining > 0) this.ports.challengeBurst(caster, target, remaining * s.bleedPop);
      if (!target.dead) target.applyStatus('hemorrhage', dealt * 0.45, 1, 'Reopening Challenge', { casterId: caster.id });
    }
  }

  afterHit(caster: A, inst: I, target: A, dealt: number, depth: number, power: number): void {
    if (dealt > 0 && depth === 0 && !target.dead) for (const effigy of this.effigies) {
      const f = effigy.cast.state.spec.impaleField;
      if (!f || !this.live(effigy) || caster.team !== effigy.body.team || caster.tier !== target.tier
        || target.tier !== effigy.body.tier || dist(target.pos, effigy.body.pos) > effigy.radius) continue;
      for (const other of this.ports.enemiesOf(effigy.body)) {
        if (other === target || dist(other.pos, target.pos) > f.radius) continue;
        other.applyStatus('impaled', 0, 1, 'Lodged Contagion', { casterId: effigy.cast.state.owner.id });
        const lodged = other.statuses.find(st => st.id === 'impaled');
        if (lodged) { lodged.rupture = (lodged.rupture ?? 0) + dealt * f.ratio; lodged.ruptureType = 'physical'; }
      }
    }
    if (inst.def.id === 'goad_device_call') {
      const effigy = this.effigies.find(e => e.body === caster), s = effigy?.cast.state.spec;
      if (effigy && s?.aftershock && this.live(effigy) && target.statuses.some(st => st.id === 'taunted' && st.casterId === caster.id)
        && this.ports.random() < s.aftershock.chance && this.shocks.filter(sh => sh.effigy === effigy).length < 32) {
        const greater = !!s.greaterShock && this.ports.random() < s.greaterShock.chance;
        this.shocks.push({ effigy, at: { ...target.pos }, due: this.ports.time + s.aftershock.delay, greater, echoes: true });
        this.ports.flashes.push({ pos: { ...target.pos }, radius: greater ? s.greaterShock!.radius : s.aftershock.radius, color: '#b99b70', life: s.aftershock.delay, maxLife: s.aftershock.delay });
      }
    }
    const cast = this.casts.get(inst);
    if (!cast || cast.state.retired || dealt <= 0 || depth !== 0 || cast.generation > 1) return;
    const s = cast.state.spec;
    if (s.splinters && cast.generation === 0) {
      const f = s.splinters, bearing = angleTo(caster.pos, target.pos);
      for (let k = 0; k < f.count; k++) {
        const angle = bearing + (k / Math.max(1, f.count - 1) - 0.5) * f.spread * Math.PI / 180;
        const shard = this.secondary(cast, { type: 'projectile', speed: 420, radius: 6, range: 280 }, 1);
        const from = { x: target.pos.x + Math.cos(angle) * (target.radius + 8), y: target.pos.y + Math.sin(angle) * (target.radius + 8) };
        this.ports.spawnProjectile(caster, shard, from, angle, { mult: power * f.power });
      }
    }
    if (s.ballast && !cast.orbitTargets.has(target.id)) {
      cast.orbitTargets.add(target.id);
      const b = s.ballast, owned = this.ports.projectiles.filter(p => p.caster === caster && p.inst.challengeHost === cast.state.host && p.orbitAnchorId !== undefined);
      while (owned.length >= b.cap) { const old = owned.shift()!; this.ports.projectiles.splice(this.ports.projectiles.indexOf(old), 1); }
      const rock = this.secondary(cast, { type: 'projectile', speed: 170, radius: 7, range: 9999, duration: b.duration,
        rehit: b.rehit, trajectory: { orbit: 1, orbitRadius: b.radius } }, 2);
      const first = this.ports.projectiles.length;
      this.ports.spawnProjectile(caster, rock, { x: target.pos.x + b.radius, y: target.pos.y }, Math.PI / 2, { mult: power * b.power });
      for (const p of this.ports.projectiles.slice(first)) { p.orbitAnchorId = target.id; p.anchor = { ...target.pos }; p.hits.set(target.id, Infinity); }
    }
  }

  private secondary(parent: ChallengeCast<A,I>, delivery: I['def']['delivery'], generation: number): I {
    const inst: I = { ...parent.inst, def: { ...parent.inst.def, delivery }, challengeHost: parent.state.host };
    this.casts.set(inst, { ...parent, inst, generation, orbitTargets: new Set() });
    return inst;
  }
  private payload(cast: ChallengeCast<A,I>, delivery: I['def']['delivery'], name: string): I {
    const inst = this.ports.createSkill({ ...cast.inst.def, id: `goad_${name}`, name, tree: undefined, noDrop: true, cooldown: 0, useTime: 0,
      tags: [...this.ports.tags(cast.inst)], innateMods: this.ports.modifiers(cast.inst), leveling: undefined,
      delivery, effects: [{ type: 'damage' }] }, 1);
    inst.challengeHost = cast.state.host; inst.procChainDepth = 1;
    return inst;
  }

  toss(owner: A, inst: I, aim: ChallengePoint, d: C, power: number): void {
    const cast = this.casts.get(inst); if (!cast || cast.state.retired) return;
    const length = Math.min(dist(owner.pos, aim), d.placeRange ?? 420), angle = angleTo(owner.pos, aim);
    const at = this.ports.clampPos({ x: owner.pos.x + Math.cos(angle) * length, y: owner.pos.y + Math.sin(angle) * length }, 13);
    const duration = Math.max(0.15, length / 600);
    this.landings.push({ cast, from: { ...owner.pos }, at, d, remaining: duration, duration, power });
  }
  private plant(landing: Landing<A,I,C>): void {
    const { cast, d, at, power } = landing, state = cast.state;
    if (state.retired || state.owner.dead) return;
    const call = this.ports.createSkill({ ...this.ports.deviceCall, delivery: { type: 'nova', radius: d.range, affects: 'enemies' } }, 1);
    const body = this.ports.spawnConstruct(state.owner, state.host, d, at, call, at); if (!body) return;
    const bands = this.ports.damageBands(state.owner, cast.inst).total, average = (bands.lo + bands.hi) / 2 * power;
    body.sheet.setSource('goad_thorns', [this.ports.modifier('thorns', 'flat', average * state.spec.device!.thornsRatio)]);
    const radius = d.range * state.owner.sheet.get('aoeRadius', this.ports.tags(cast.inst), this.ports.modifiers(cast.inst));
    // The pulse and its aura share one resolved radius; inherited construct
    // area modifiers must not apply a second time to the taunt alone.
    call.def = { ...call.def, delivery: { type: 'nova', affects: 'enemies',
      radius: radius / Math.max(0.01, body.sheet.get('aoeRadius', this.ports.tags(call), this.ports.modifiers(call))) } };
    body.construct!.range = radius; body.construct!.timer = 0;
    const effigy: Effigy<A,I> = { body, cast, average, radius, center: { ...at }, trailAt: 0, strikeAt: 0 };
    if (state.spec.creeper) {
      const creeper = this.ports.allocate('Burrowing Pursuer', body.team, { ...at });
      creeper.owner = state.owner; creeper.sourceSkillId = `__goad_creeper:${body.id}`;
      creeper.tier = body.tier; creeper.radius = 8; creeper.color = '#b39364'; creeper.shape = 'circle';
      creeper.passive = true; creeper.untargetable = true; creeper.invulnerable = true; creeper.noBounty = true;
      this.ports.actors.push(creeper); effigy.creeper = creeper;
    }
    this.effigies.push(effigy);
  }
  private live(e: Effigy<A,I>) { return !e.body.dead && !e.cast.state.retired && !e.cast.state.owner.dead && this.ports.actors.includes(e.body); }

  update(dt: number): void {
    for (const state of [...this.states.values()]) if (state.owner.dead || !this.ports.actors.includes(state.owner) || !state.owner.skills.includes(state.host)
      || state.policy !== this.policy(state.host)) this.clear(state.owner, state.host);
    for (const landing of [...this.landings]) {
      landing.remaining -= dt;
      const t = Math.max(0, Math.min(1, 1 - landing.remaining / landing.duration));
      this.ports.flashes.push({ pos: { x: landing.from.x + (landing.at.x - landing.from.x) * t,
        y: landing.from.y + (landing.at.y - landing.from.y) * t - Math.sin(t * Math.PI) * 45 }, radius: 5, color: '#ceb98c', life: 0.05, maxLife: 0.05 });
      if (landing.remaining <= 0) { this.landings.splice(this.landings.indexOf(landing), 1); this.plant(landing); }
    }
    for (const effigy of [...this.effigies]) {
      if (!this.live(effigy)) { this.retireEffigy(effigy); continue; }
      const s = effigy.cast.state.spec, enemies = this.ports.enemiesOf(effigy.body).filter(a => dist(a.pos, effigy.body.pos) <= effigy.radius);
      if (s.bleedingField) for (const enemy of enemies) {
        let wound = enemy.statuses.find(st => st.challengeField === effigy.body.id);
        if (!wound) {
          enemy.applyStatus('bleed', effigy.average * s.bleedingField.power, 1, 'Field of Wounds',
            { casterId: effigy.cast.state.owner.id, challengeField: effigy.body.id });
          wound = enemy.statuses.find(st => st.challengeField === effigy.body.id);
        }
        // No future bleed bank exists beyond this frame of exposure.
        if (wound) { wound.remaining = dt + 0.05; wound.total = wound.remaining; }
      }
      for (const actor of this.ports.actors) actor.statuses = actor.statuses.filter(st => st.challengeField !== effigy.body.id || enemies.includes(actor));
      if (s.creeper && effigy.creeper) this.moveCreeper(effigy, enemies, dt);
    }
    for (const shock of [...this.shocks]) if (shock.due <= this.ports.time) {
      this.shocks.splice(this.shocks.indexOf(shock), 1);
      const e = shock.effigy; if (!this.live(e)) continue;
      const s = e.cast.state.spec, row = shock.greater ? s.greaterShock! : s.aftershock!;
      const payload = this.payload(e.cast, { type: 'ground', radius: row.radius, delay: 0, castRange: 9999 }, 'Aftershock');
      this.ports.executeSkill(e.cast.state.owner, payload, shock.at, { noRepeat: true, noCooldown: true, dmgMult: row.power });
      if (shock.greater && shock.echoes) for (let k = 0; k < s.greaterShock!.echoes; k++) {
        this.shocks.push({ effigy: e, at: { ...shock.at }, due: this.ports.time + (k + 1) * 0.25, greater: false, echoes: false });
      }
    }
  }

  private moveCreeper(e: Effigy<A,I>, enemies: A[], dt: number): void {
    const c = e.creeper!, s = e.cast.state.spec.creeper!;
    let target: A | undefined, nearest = Infinity;
    for (const enemy of enemies) {
      const distance = dist(enemy.pos, c.pos);
      if (!Number.isFinite(distance)) { target = enemies.sort((a, b) => dist(a.pos, c.pos) - dist(b.pos, c.pos))[0]; break; }
      if (distance < nearest) { target = enemy; nearest = distance; }
    }
    const toward = target?.pos ?? e.body.pos, distance = dist(e.center, toward), step = Math.min(1, s.speed * dt / Math.max(1, distance));
    e.center.x += (toward.x - e.center.x) * step; e.center.y += (toward.y - e.center.y) * step;
    const phase = this.ports.time * 3 + e.body.id, radius = target ? 34 : Math.min(65, e.radius * 0.4);
    let at = { x: e.center.x + Math.sin(phase) * radius, y: e.center.y + Math.sin(phase * 2) * radius * 0.5 };
    const reach = dist(at, e.body.pos); if (reach > e.radius) at = { x: e.body.pos.x + (at.x - e.body.pos.x) * e.radius / reach, y: e.body.pos.y + (at.y - e.body.pos.y) * e.radius / reach };
    c.pos = this.ports.clampPos(at, c.radius);
    if (this.ports.time >= e.trailAt) {
      e.trailAt = this.ports.time + 0.2;
      const trail = this.payload(e.cast, { type: 'ground', radius: s.trailRadius, delay: 0, castRange: 9999, lingerDuration: s.trailDuration, tickInterval: 0.3 }, 'Burrow Wake');
      this.ports.executeSkill(e.cast.state.owner, trail, c.pos, { noRepeat: true, noCooldown: true, dmgMult: s.trailPower });
    }
    if (target && dist(c.pos, target.pos) <= 75 && this.ports.time >= e.strikeAt) {
      e.strikeAt = this.ports.time + s.strikeInterval;
      const strike = this.payload(e.cast, { type: 'target' }, 'Burrow Stone');
      this.ports.challengeHit(e.cast.state.owner, strike, target, s.strikePower);
      this.ports.flashes.push({ pos: { ...target.pos }, radius: 12, color: '#c5a66d', life: 0.15, maxLife: 0.15 });
    }
  }
  private retireEffigy(e: Effigy<A,I>): void {
    if (e.creeper) e.creeper.dead = true;
    this.shocks = this.shocks.filter(s => s.effigy !== e);
    for (const actor of this.ports.actors) actor.statuses = actor.statuses.filter(st => st.challengeField !== e.body.id);
    this.effigies.splice(this.effigies.indexOf(e), 1);
  }
  clear(owner: A, host: I): void {
    const state = this.states.get(this.key(owner, host)); if (!state || state.host !== host) return;
    state.retired = true; owner.removeBuff(this.readyId(state)); this.states.delete(this.key(owner, host));
    this.landings = this.landings.filter(l => l.cast.state !== state);
    for (const effigy of [...this.effigies]) if (effigy.cast.state === state) {
      effigy.body.dead = true; this.retireEffigy(effigy);
    }
    const owned = (inst: I) => inst.challengeHost === host;
    this.ports.projectiles = this.ports.projectiles.filter(p => p.caster !== owner || !owned(p.inst));
    this.ports.pendingRepeats = this.ports.pendingRepeats.filter(p => p.caster !== owner || !owned(p.inst));
    this.ports.pendingFuses = this.ports.pendingFuses.filter(p => p.caster !== owner || !owned(p.inst));
    for (const zone of [...this.ports.zones]) if (zone.caster === owner && owned(zone.inst)) this.ports.retireOwnedZone(zone);
  }
  clearAll(): void {
    for (const state of [...this.states.values()]) this.clear(state.owner, state.host);
  }
}
