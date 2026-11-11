import {lockSequenceRecovery, releaseSequenceRecovery, settleSequenceRecoveries,
  type SequenceRecoveryPorts} from './sequence-recovery.js';
import type {AttackSequencePorts, AttackSequenceSpec, SequenceActor, SequenceBuff,
  SequenceProjectile, SequenceSkill} from './attack-sequence-types.js';
export type * from './attack-sequence-types.js';

interface SequenceState<A, I, M, D extends {type: string}> {
  owner: A; host: I; spec: AttackSequenceSpec<M, D>; policy: string; key: string;
  stacks: Map<A, number>; caught: number; retired: boolean; buffs: Map<A, SequenceBuff<M>>;
}
interface SequenceCast<A, I, M, D extends {type: string}> {
  state: SequenceState<A, I, M, D>; inst: I; caught: number; connected: boolean; done: boolean;
  receipt?: { target: A; dealt: number; physical: number };
}
interface Recovery<A, I, P, Aim, M, D extends {type: string}> {
  cast: SequenceCast<A, I, M, D>; projectile: P; target?: A; at: Aim; from: Aim;
  elapsed: number; duration: number; marker?: A; dealt: number; airborne: boolean;
}
interface Scheduled<A, I, Aim, M, D extends {type: string}> {
  state: SequenceState<A, I, M, D>; inst: I; aim: Aim; due: number; power: number;
}

/** Actor/instance/target-scoped cycles and recoverable weapons. All damage still
 * enters the shared hit/status/mitigation paths; secondary generations never
 * inherit the recovery contract or advance the originating hit cycle. */
export class AttackSequences<
  A extends SequenceActor<A, I, Aim, M, Tag>,
  I extends SequenceSkill<I, M, Tag, D>, P extends SequenceProjectile<A, I, Aim>,
  Aim, M, Tag extends string, D extends {type: string}
> {
  private states = new Set<SequenceState<A, I, M, D>>();
  private casts = new WeakMap<I, SequenceCast<A, I, M, D>>();
  private active = new Set<SequenceCast<A, I, M, D>>();
  private recoveries: Recovery<A, I, P, Aim, M, D>[] = [];
  private scheduled: Scheduled<A, I, Aim, M, D>[] = [];
  private rainAt = new WeakMap<P, number>();
  private deferredContacts: { projectile: P; target: A }[] = [];
  private serial = 0;
  constructor(private readonly ports: AttackSequencePorts<A, I, P, Aim, M, Tag, D>) {}
  private readonly recoveryPorts: SequenceRecoveryPorts<SequenceCast<A, I, M, D>> = {
    flying: (cast, s) => this.ports.flights().some(p => this.casts.get(p.inst) === cast && p.caster === s.owner),
    pending: cast => this.scheduled.some(j => j.inst === cast.inst)
      || this.ports.work('salvos').some(j => j.inst === cast.inst)
      || this.ports.work('repeats').some(j => j.inst === cast.inst)
      || this.ports.work('fuses').some(j => j.inst === cast.inst),
    objects: cast => this.recoveries.filter(r => r.cast === cast),
    clearCatch: s => { s.owner.removeBuff(s.key + ':catch'); },
  };

  private policy(inst: I): string {
    return JSON.stringify([inst.treeNodes, inst.level, inst.sockets.map(s => s && [s.def.id, s.level, s.rolled]),
      inst.grafts?.map(s => [s.def.id, s.level, s.rolled]), inst.def.attackSequence]);
  }
  private state(owner: A, inst: I): SequenceState<A, I, M, D> | undefined {
    const host = inst.sequenceHost ?? inst;
    const captured = this.casts.get(inst);
    if (captured) return captured.state.retired ? undefined : captured.state;
    const spec = this.ports.spec(host); if (!spec) return undefined;
    let state = [...this.states].find(s => s.owner === owner && s.host === host);
    const policy = this.policy(host);
    if (state && state.policy !== policy) { this.clear(owner, host); state = undefined; }
    if (!state) {
      state = { owner, host, spec, policy, key: `sequence:${owner.id}:${host.def.id}:${++this.serial}`,
        stacks: new Map(), caught: 0, retired: false, buffs: new Map() };
      this.states.add(state);
    }
    return state;
  }
  stacks(owner: A, host: I, target: A): number {
    return this.state(owner, host)?.stacks.get(target) ?? 0;
  }
  private max(s: SequenceState<A, I, M, D>): number { return s.spec.cycleMax ?? s.spec.hitCycle?.max ?? 1; }

  prepare(owner: A, host: I, aim: Aim, power = 1): I {
    if (host.sequenceRole || !this.ports.spec(host)) return host;
    const state = this.state(owner, host)!;
    const delivery = this.ports.delivery(host);
    const extraMods: M[] = [...(host.extraMods ?? [])];
    const area = state.spec.cycleArea;
    if (area) {
      // One footprint per swing, read from the enemy the caster aims at. Other
      // bodies keep their own damage cycles; iteration order cannot grow an arc.
      const target = this.ports.enemiesOf(owner).filter(a => a.tier === owner.tier)
        .sort((a, b) => this.ports.distance(a.pos, aim) - this.ports.distance(b.pos, aim))[0];
      const step = target ? (state.stacks.get(target) ?? 0) + 1 : 1;
      extraMods.push(this.ports.modifier('meleeReach', 'more', area.radiusPerStack * step), this.ports.modifier('swingArc', 'more', area.arcPerStack * step));
    }
    const inst: I = { ...host, def: { ...host.def, delivery, tags: [...this.ports.tags(host)] },
      sockets: [...host.sockets], grafts: host.grafts && [...host.grafts], treeNodes: [...(host.treeNodes ?? [])],
      extraMods, state: host.state ??= {}, sequenceHost: host, sequenceRole: 'primary' };
    const cast: SequenceCast<A, I, M, D> = { state, inst, caught: 0, connected: false, done: false };
    this.casts.set(inst, cast);
    if (state.spec.recovery) {
      this.active.add(cast); this.lock(state);
      const buff = state.spec.catchBuff;
      if (buff && state.caught) for (let i = 1; i <= state.caught; i++) {
        this.scheduled.push({ state, inst, aim: this.ports.copyPosition(aim), due: this.ports.time() + i * buff.repeatInterval / owner.speedFactor(host), power });
      }
    }
    return inst;
  }

  /** Per-victim increased damage participates in the normal additive stat fold. */
  forTarget(owner: A, inst: I, target: A, depth: number): I {
    const cast = this.casts.get(inst), s = cast?.state;
    if (!s || s.owner !== owner || s.retired || !s.spec.hitCycle || depth > 0 || inst.sequenceRole !== 'primary') return inst;
    const step = (s.stacks.get(target) ?? 0) + 1;
    if (s.spec.vulnerability) return inst; // this investment replaces the Cleave-only ramp
    const hit = { ...inst, extraMods: [...(inst.extraMods ?? []), this.ports.modifier('damage', 'increased', step * s.spec.hitCycle.increasedPerStack)] };
    this.casts.set(hit, cast); return hit;
  }

  landed(owner: A, inst: I, target: A, dealt: number, physical: number, depth: number): void {
    const cast = this.casts.get(inst), s = cast?.state;
    if (!cast || !s || s.owner !== owner || s.retired || depth > 0 || dealt <= 0) return;
    cast.receipt = { target, dealt, physical };
    const deferred = this.deferredContacts.find(c => c.projectile.inst === cast.inst && c.target === target);
    if (deferred) {
      this.deferredContacts.splice(this.deferredContacts.indexOf(deferred), 1);
      this.contact(deferred.projectile, target);
    }
    if (!s.spec.hitCycle) return;
    const step = (s.stacks.get(target) ?? 0) + 1, maximum = step >= this.max(s);
    s.stacks.set(target, maximum ? 0 : step);
    const v = s.spec.vulnerability;
    if (v) {
      target.removeBuff(s.key + ':vulnerability');
      if (!maximum && !target.dead && target.life > 0) target.addBuff({ type: 'buff', id: s.key + ':vulnerability',
        label: v.label, duration: v.duration, mods: [this.ports.modifier('damageTaken', 'increased', v.perStack * step)] });
    }
    const rhythm = s.spec.rhythm;
    if (rhythm && !target.dead && target.life > 0) {
      this.ailment(s, inst, target, step % 2 ? 'bleed' : 'impaled', step % 2 ? dealt * rhythm.bleed : physical * rhythm.impale,
        s.key + ':rhythm', !!s.spec.consumeRhythm);
      if (maximum && s.spec.consumeRhythm) {
        let bank = 0;
        target.statuses = target.statuses.filter(st => {
          if (st.sourceKey !== s.key + ':rhythm') return true;
          bank += st.dps * st.stacks * Math.max(0, st.remaining) + (st.rupture ?? 0); return false;
        });
        this.burst(s, inst, target, bank * s.spec.consumeRhythm.multiplier);
      }
    }
    if (maximum && s.spec.cycleBuff && !owner.dead) {
      const buff = { ...s.spec.cycleBuff, id: s.key + ':maximum' };
      owner.addBuff(buff, owner.sheet.get('effectDuration', this.ports.tags(inst), this.ports.mods(inst)));
      s.buffs.set(owner, buff);
    }
    this.ports.cycleCue(target, inst, step, maximum);
  }

  /** Paid casting sweeps own independent beats; the cast bar governs the throw. */
  opening(owner: A, host: I, aim: Aim, power: number): void {
    const s = this.state(owner, host);
    if (!s || host.sequenceRole) return;
    for (const sweep of s.spec.castSweeps ?? []) {
      const inst = this.ports.sweep(host, sweep.delivery);
      const sweepPower = power * sweep.power;
      if (sweep.delay === 0) this.fire(s, inst, aim, sweepPower);
      else this.scheduled.push({ state: s, inst, aim: this.ports.copyPosition(aim),
        due: this.ports.time() + sweep.delay / owner.speedFactor(inst), power: sweepPower });
    }
  }

  private payload(s: SequenceState<A, I, M, D>, host: I, delivery: D, tags?: Tag[]): I {
    const inst = this.ports.payload(host, delivery, tags);
    inst.sequenceHost = s.host;
    return inst;
  }
  private fire(s: SequenceState<A, I, M, D>, inst: I, aim: Aim, power: number): void {
    const facing = s.owner.facing;
    this.ports.execute(s.owner, inst, aim, { noRepeat: true, noCooldown: true, dmgMult: power,
      componentUse: inst.sequenceRole === 'payload' && inst.def.delivery.type === 'melee' });
    s.owner.facing = facing;
  }

  beforeContact(p: P): void {
    const cast = this.casts.get(p.inst); if (cast) cast.receipt = undefined;
  }
  /** True consumes this flight. First landed flesh owns the recovery, like a
   * catch-spot projectile; misses/blocks never strand a weapon in a body. */
  contact(p: P, target: A): boolean {
    const cast = this.casts.get(p.inst), s = cast?.state, receipt = cast?.receipt;
    if (!cast || !s?.spec.recovery || s.retired || p.caster !== s.owner) return false;
    if (receipt?.target !== target) {
      if (this.ports.work('fuses').some(f => f.kind === 'hit' && f.inst === p.inst && f.targetId === target.id)) {
        this.deferredContacts.push({ projectile: p, target }); return true;
      }
      return false;
    }
    cast.connected = true;
    if (s.spec.impactBleed) {
      const impact = s.spec.impactBleed, radius = impact.radius * s.owner.sheet.get('aoeRadius', this.ports.tags(p.inst), this.ports.mods(p.inst));
      for (const victim of this.ports.enemiesOf(s.owner)) {
        if (victim.tier !== target.tier || this.ports.distance(victim.pos, target.pos) > radius + victim.radius
          || !this.ports.lineOfFire(target.pos, victim.pos, target.tier)) continue;
        this.burst(s, p.inst, victim, receipt.dealt * impact.power);
        if (!victim.dead) this.ailment(s, p.inst, victim, 'bleed', receipt.dealt * impact.bleed, s.key + ':impact');
      }
      this.ports.impactCue(target, radius);
    }
    const bounce = s.spec.bounce;
    if (bounce) {
      if (!target.dead) this.ailment(s, p.inst, target, 'bleed', receipt.dealt * s.spec.recovery.bleed, s.key + ':throw');
      s.owner.gainCharge(bounce.charge, bounce.amount, bounce.cap, p.inst);
      const angle = this.ports.random() * Math.PI * 2;
      let at = this.ports.clampPosition(this.ports.pointAt(s.owner.pos, angle, bounce.distance),
        bounce.radius, s.owner.pos, s.owner.tier);
      // Confinement preserves the owner's floor; an obstructed fallback lands
      // at their feet instead of stranding required equipment behind masonry.
      if (!this.ports.lineOfFire(s.owner.pos, at, s.owner.tier)) at = this.ports.copyPosition(s.owner.pos);
      const marker = this.marker(s, p.inst, at, bounce.radius);
      if (!marker) return true; // failed placement leaves no axe to recover
      marker.look = bounce.airLook;
      this.recoveries.push({ cast, projectile: p, at, from: this.ports.copyPosition(target.pos), elapsed: 0,
        duration: bounce.seconds, marker, dealt: receipt.dealt, airborne: true });
    } else if (!target.dead && target.life > 0) {
      this.recoveries.push({ cast, projectile: p, target, at: this.ports.copyPosition(target.pos), from: this.ports.copyPosition(target.pos),
        elapsed: 0, duration: 0, dealt: receipt.dealt, airborne: false });
    }
    return true;
  }
  private marker(s: SequenceState<A, I, M, D>, inst: I, at: Aim, radius: number): A | undefined {
    const body = this.ports.spawnMarker(s.owner, inst, { type: 'construct', kind: 'embed',
      look: s.spec.recovery!.look, range: 0, duration: 0, maxActive: 1000, invulnerable: true, placeRange: 9999 }, at);
    if (body) {
      body.lifespan = 0; body.radius = radius; body.untargetable = true; body.tier = s.owner.tier;
      // A pickup is a floor marking, never an anchored body that shoulders its
      // owner away. Use the existing shared body-pass-through stat.
      body.sheet.setBase('phasing', 1);
    }
    return body ?? undefined;
  }
  private lock(s: SequenceState<A, I, M, D>): void {
    lockSequenceRecovery(s);
  }
  private release(s: SequenceState<A, I, M, D>, miss: boolean): void {
    releaseSequenceRecovery(s, miss);
  }

  flight(p: P, paint = true): void {
    if (paint && p.inst.sequenceHost) this.ports.flightCue(p);
    const cast = this.casts.get(p.inst), s = cast?.state, rain = s?.spec.flightRain;
    if (!s || s.retired || !rain || p.caster !== s.owner || this.ports.time() < (this.rainAt.get(p) ?? 0)) return;
    this.rainAt.set(p, this.ports.time() + rain.interval);
    const d = s.spec.thrown!;
    const inst = this.payload(s, p.inst, { ...d, radius: rain.radius, range: rain.range, count: 1 });
    this.ports.spawnProjectile(s.owner, inst, p.pos, this.ports.random() * Math.PI * 2,
      { mult: p.mult * rain.power, depth: 1, inherit: this.ports.inheritedFlight(p) });
  }

  private ailment(s: SequenceState<A, I, M, D>, inst: I, target: A, id: string, amount: number, sourceKey: string, holdDischarge = false): void {
    if (target.dead || amount <= 0) return;
    const sd = this.ports.statusDefinition(id), tags = this.ports.tags(inst), extra = this.ports.mods(inst);
    const resist = target.sheet.get('ailmentResist', new Set<Tag>(sd.element ? [sd.element] : []));
    if (resist > 0 && this.ports.random() < resist) return;
    const duration = s.owner.sheet.get('effectDuration', tags, extra);
    const power = s.owner.sheet.get('statusMagnitude', new Set([...tags, ...(sd.element ? [sd.element] : [])]), extra);
    let dps = sd.dotType ? Math.max(amount, this.ports.baselineStatusDps(id, this.ports.zoneLevel())) * power / Math.max(0.5, duration) : 0;
    const critical = sd.dotType && this.ports.random() < s.owner.sheet.get('dotCrit', tags, extra) * s.owner.sheet.get('critChance', tags, extra);
    if (critical) dps *= s.owner.sheet.get('critMulti', tags, extra);
    const rupture = sd.dotType ? dps * sd.duration * duration * s.owner.sheet.get('dotRupture', tags, extra) : amount * power;
    this.ports.applyStatus(target, id, dps, duration, inst.def.name, { casterId: s.owner.id, sourceKey, holdDischarge,
      rupture: rupture > 0 ? rupture : undefined, ruptureType: sd.element,
      stacksBonus: Math.round(s.owner.sheet.get('ailmentStacks', tags, extra)),
      leech: s.owner.sheet.get('dotLeech_' + id, tags, extra),
      propagates: this.ports.random() < s.owner.sheet.get('dotPropagates', tags, extra) });
  }
  private burst(s: SequenceState<A, I, M, D>, inst: I, target: A, amount: number): void {
    this.ports.burst(s.owner, inst, target, amount);
  }

  update(dt: number): void {
    for (const s of [...this.states]) {
      const seated = s.owner.skills.includes(s.host) || [...(s.owner.aiActionInsts?.values() ?? [])].includes(s.host)
        || s.owner.construct?.castInst === s.host;
      if (s.owner.dead || !this.ports.actors().includes(s.owner) || !seated || s.policy !== this.policy(s.host)) { this.clear(s.owner, s.host); continue; }
      for (const target of s.stacks.keys()) if (target.dead || !this.ports.actors().includes(target)) s.stacks.delete(target);
    }
    for (const job of [...this.scheduled]) if (job.due <= this.ports.time()) {
      this.scheduled.splice(this.scheduled.indexOf(job), 1);
      if (!job.state.retired) this.fire(job.state, job.inst, job.aim, job.power);
    }
    for (const r of [...this.recoveries]) {
      const s = r.cast.state, owner = s.owner, recovery = s.spec.recovery!;
      if (s.retired) continue;
      if (r.marker && (r.marker.dead || !this.ports.actors().includes(r.marker))) { this.removeRecovery(r); continue; }
      r.elapsed += dt * this.ports.actorScale(owner);
      if (r.target) {
        r.at = this.ports.copyPosition(r.target.pos);
        const gone = r.target.dead || !this.ports.actors().includes(r.target);
        const near = owner.tier === r.target.tier && this.ports.distance(owner.pos, r.target.pos) <= owner.radius + r.target.radius + recovery.meleeRange
          && this.ports.lineOfFire(owner.pos, r.target.pos, owner.tier);
        if (gone || near) {
          if (near && !gone) this.ailment(s, r.cast.inst, r.target, 'bleed', r.dealt * recovery.bleed, s.key + ':throw');
          this.removeRecovery(r); continue;
        }
        this.ports.lodgedCue(r.at, r.target, r.cast.inst);
      } else {
        const b = s.spec.bounce!;
        const near = owner.tier === (r.projectile.tier ?? 0) && this.ports.distance(owner.pos, r.at) <= b.radius
          && this.ports.lineOfFire(owner.pos, r.at, owner.tier);
        if (near) {
          if (r.elapsed < r.duration) {
            r.cast.caught++;
            if (s.spec.catchBuff) {
              s.caught = Math.min(s.spec.catchBuff.max, s.caught + 1);
              owner.addBuff({ type: 'buff', id: s.key + ':catch', label: s.spec.catchBuff.label,
                duration: 999999, maxStacks: s.spec.catchBuff.max, mods: [] });
            }
            const inherited = this.ports.inheritedFlight(r.projectile);
            const nova = this.payload(s, r.cast.inst, { ...s.spec.thrown!, count: b.nova.count, ring: { phaseJitter: true },
              trajectory: inherited ? { homing: inherited.homing, erratic: inherited.erratic, spiral: inherited.spiral,
                orbit: inherited.orbit, spin: inherited.spin, weave: inherited.weave, amplitude: inherited.amp, orbitRadius: inherited.orbitR0 } : s.spec.thrown!.trajectory });
            this.fire(s, nova, owner.pos, r.projectile.mult * b.nova.power);
          }
          this.removeRecovery(r); continue;
        }
        if (r.elapsed < r.duration) {
          const t = r.elapsed / r.duration;
          r.projectile.pos = this.ports.interpolate(r.from, r.at, t);
          this.flight(r.projectile, false);
          this.ports.bounceCue(r.at, r.projectile, r.cast.inst, b.radius, r.elapsed, t);
        } else {
          r.airborne = false;
          if (r.marker) r.marker.look = recovery.look;
        }
      }
    }
    this.deferredContacts = this.deferredContacts.filter(c => this.ports.work('fuses').some(f =>
      f.kind === 'hit' && f.inst === c.projectile.inst && f.targetId === c.target.id));
    settleSequenceRecoveries(this.active, this.recoveryPorts);
  }
  private removeRecovery(r: Recovery<A, I, P, Aim, M, D>): void {
    if (r.marker) r.marker.dead = true;
    this.recoveries.splice(this.recoveries.indexOf(r), 1);
  }
  clear(owner: A, host: I): void {
    for (const s of [...this.states]) if (s.owner === owner && s.host === host) {
      s.retired = true; this.states.delete(s);
      for (const target of this.ports.actors()) {
        target.removeBuff(s.key + ':vulnerability');
        target.statuses = target.statuses.filter(st => !st.sourceKey?.startsWith(s.key + ':'));
      }
      for (const [a, b] of s.buffs) if (a.buffs.get(b.id)?.def === b) a.removeBuff(b.id);
      owner.removeBuff(s.key + ':catch');
      for (const r of [...this.recoveries]) if (r.cast.state === s) this.removeRecovery(r);
      for (const c of [...this.active]) if (c.state === s) this.active.delete(c);
      this.scheduled = this.scheduled.filter(j => j.state !== s);
      this.deferredContacts = this.deferredContacts.filter(j => this.casts.get(j.projectile.inst)?.state !== s);
      if (s.spec.recovery) this.release(s, false);
      const owned = (inst: I) => inst.sequenceHost === host;
      this.ports.filterFlights(p => p.caster !== owner || !owned(p.inst));
      this.ports.filterWork('repeats', p => p.caster !== owner || !owned(p.inst));
      this.ports.filterWork('steps', p => p.caster !== owner || !owned(p.inst));
      this.ports.filterWork('followUps', p => p.caster !== owner || !owned(p.inst));
      this.ports.filterWork('salvos', p => p.caster !== owner || !owned(p.inst));
      this.ports.filterWork('fuses', p => p.caster !== owner || !owned(p.inst));
      this.ports.retireZones((caster, inst) => caster === owner && owned(inst));
      for (const a of this.ports.actors()) if (a.owner === owner && a.construct?.echo
        && a.construct.castInst && owned(a.construct.castInst)) this.ports.kill(a, true);
    }
  }
  clearAll(): void { for (const s of [...this.states]) this.clear(s.owner, s.host); }
}
