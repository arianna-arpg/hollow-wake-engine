import type {GrabActor,GrabSkill,GrabPoint,GrabPorts,GrabRules,GrabSpec,GripHold,GrabThrowSpec,GrabHandoffSpec} from './grab-types.js';
export type * from './grab-types.js';
const vec=(x:number,y:number):GrabPoint=>({x,y});
const dist=(a:GrabPoint,b:GrabPoint):number=>Math.hypot(a.x-b.x,a.y-b.y);
const angleTo=(a:GrabPoint,b:GrabPoint):number=>Math.atan2(b.y-a.y,b.x-a.x);
const clamp=(n:number,min:number,max:number):number=>Math.max(min,Math.min(max,n));
/** Sustained bodily-control rules, mechanically extracted from the pinned game.
 * Hosts supply physical placement, combat pipeline services and ordered signals.
 * General AI, discovery ledgers and campaign death consequences stay outside.
 * Borrowed records commit synchronously; callback failures retain prefix writes. */
export class Grabs<A extends GrabActor<I>,I extends GrabSkill>{
  private readonly grabScratch={x:0,y:0};
  constructor(readonly rules:GrabRules,readonly ports:GrabPorts<A,I>){}
  private rand(lo:number,hi:number):number{return lo+this.ports.random()*(hi-lo);}
policy(victim: A): number {
    if (victim.grabbable !== undefined) {
        return typeof victim.grabbable === 'number' ? victim.grabbable
            : victim.grabbable ? 1 : 0;
    }
    return this.rules.policy[victim.rarity ?? 'normal'] ?? 1;
}
refusal(holder: A, victim: A, spec: GrabSpec, gripPower: number, handoffFrom?: GripHold): string | null {
    const passing = handoffFrom !== undefined && handoffFrom.id === victim.id;
    if (holder.dead || victim.dead)
        return 'dead';
    if (holder.gripping)
        return 'hands full';
    if (victim.heldBy !== undefined && !passing)
        return 'already held';
    if (victim.gripping)
        return 'it is holding';
    if (holder.heldBy !== undefined)
        return 'held fast';
    if (holder.clingTo)
        return 'riding';
    const veiled = passing ? (handoffFrom.wasUntargetable ?? false) : victim.untargetable;
    if (veiled || victim.passive || victim.invulnerable)
        return 'no purchase';
    if (victim.construct || victim.anchored)
        return 'rooted fast';
    if (victim.leap || holder.leap)
        return 'mid-air';
    if (!!victim.flying !== !!holder.flying)
        return 'out of reach';
    if (victim.sheet.get('phasing') > 0 || holder.sheet.get('phasing') > 0)
        return 'no rim to hold';
    const policy = this.policy(victim);
    if (policy <= 0)
        return 'too mighty to hold';
    const hw = holder.effectiveWeight(), vw = victim.effectiveWeight();
    if (vw > hw * this.rules.eligibility.maxRatio)
        return 'far too heavy';
    const ratio = spec.ratio ?? this.rules.eligibility.ratio;
    if (hw * (1 + Math.max(0, gripPower)) < vw * ratio)
        return 'too heavy';
    return null;
}
seat(holder: A, victim: A, hold: GripHold, out: {
    x: number;
    y: number;
}): void {
    const cfg = this.rules.seat;
    const span = holder.radius + victim.radius;
    const frac = hold.verb === 'carry' ? cfg.carryDist
        : hold.verb === 'drag' ? cfg.dragDist
            : hold.verb === 'pin' ? cfg.pinDist
                : cfg.swallowDist;
    const back = hold.verb === 'drag' ? Math.PI : 0;
    const ang = holder.facing + back + hold.bearing;
    out.x = holder.pos.x + Math.cos(ang) * span * frac;
    out.y = holder.pos.y + Math.sin(ang) * span * frac;
}
struggleRate(hold: GripHold, holder: A, victim: A): number {
    const b = this.rules.break;
    const ratio = Math.pow(victim.effectiveWeight() / Math.max(0.05, holder.effectiveWeight()), b.powRatio);
    const wriggle = 1 + Math.max(0, victim.sheet.get('wriggle'));
    const grip = 1 + Math.max(0, holder.sheet.get('gripPower'));
    return b.base * ratio * (hold.spec.breakMult ?? 1)
        * this.policy(victim) * wriggle / grip;
}
bounds(spec: GrabSpec): readonly [
    number,
    number
] {
    return spec.holdSec ?? this.rules.holdSec[spec.verb];
}
moveFactor(hold: GripHold): number {
    return clamp(hold.spec.holderMove ?? this.rules.holderMove[hold.verb], 0, 1);
}
advance(dt: number): void {
    for (const a of this.ports.actors()) {
        if (a.heldBy === undefined)
            continue;
        const holder = this.ports.actorById(a.heldBy);
        if (!holder || holder.dead || holder.gripping?.id !== a.id) {
            a.heldBy = undefined;
            if (a.untargetable && a.statuses.some(s => s.id === 'swallowed'))
                a.untargetable = false;
            for (let i = a.statuses.length - 1; i >= 0; i--) {
                const id = a.statuses[i].id;
                if (id === 'seized' || id === 'swallowed') {
                    a.statuses.splice(i, 1);
                    a.sheet.removeSource('status:' + id);
                }
            }
        }
    }
    for (const a of this.ports.actors()) {
        const hold = a.gripping;
        if (!hold)
            continue;
        const v = this.ports.actorById(hold.id);
        if (!v || v.dead || a.dead || v.heldBy !== a.id) {
            this.release(a);
            continue;
        }
        if (this.rules.release.onHardCC && a.isStunned()) {
            this.release(a);
            continue;
        }
        if (hold.severed >= (hold.spec.severFrac ?? this.rules.break.severFrac)) {
            this.release(a);
            continue;
        }
        if (hold.struggle >= 1) {
            const burst = hold.spec.burstHurt ?? (hold.verb === 'swallow' ? this.rules.swallow.burstHurt : 0);
            if (burst > 0 && !a.invulnerable) {
                const taken = this.ports.mitigate(a, { physical: burst * a.maxLife() });
                a.life -= taken;
                a.hitFlash = 0.15;
                a.hitFlashType = 'physical';
                this.ports.text(a.pos, Math.round(taken).toString(), this.rules.physicalColor, 13);
                if (a.life <= 0 && !a.dead)
                    this.ports.kill(a, false, v);
            }
            this.release(a);
            continue;
        }
        if (this.ports.time() >= hold.until) {
            const t = hold.spec.throw;
            if (t?.handoff && this.handoff(a, v, t.handoff))
                continue;
            if (t)
                this.throw(a, t.impulse, this.spitDirection(a, v, t));
            else
                this.release(a);
            continue;
        }
        this.seat(a, v, hold, this.grabScratch);
        const gap = dist(v.pos, this.grabScratch);
        const step = this.rules.reelSpeed * dt;
        if (gap > step) {
            const ang = angleTo(v.pos, this.grabScratch);
            v.pos = this.ports.clamp(vec(v.pos.x + Math.cos(ang) * step, v.pos.y + Math.sin(ang) * step), v.radius);
        }
        else {
            v.pos = this.ports.clamp(vec(this.grabScratch.x, this.grabScratch.y), v.radius);
        }
        v.facing = angleTo(v.pos, a.pos);
        if (v.push) {
            v.push.vx = 0;
            v.push.vy = 0;
        }
        hold.struggle += this.struggleRate(hold, a, v) * dt;
        if (this.ports.time() >= hold.statusAt) {
            hold.statusAt = this.ports.time() + 0.25;
            v.applyStatus(this.rules.markers[hold.verb], 0, 1, 'grab');
            if (hold.spec.rideStatus)
                v.applyStatus(hold.spec.rideStatus, 0, 1, 'grab');
        }
        const dot = hold.spec.dot;
        if (dot && !v.invulnerable) {
            const taken = this.ports.mitigate(v, { [dot.type]: dot.frac * v.maxLife() * dt });
            if (taken > 0) {
                const deedLifeBefore = v.life;
                v.life -= taken;
                this.ports.damaged(v, a, deedLifeBefore);
                hold.dotAcc += taken;
                this.ports.dot(v, taken, dot.type);
                if (hold.spec.leech)
                    this.ports.leech(a, v, 'life', a.healBy(taken * hold.spec.leech));
                if (v.life <= 0 && !v.dead) {
                    this.ports.kill(v, false, a);
                    this.release(a);
                }
            }
        }
        if (!v.dead && !v.invulnerable && a.gripping === hold) {
            const wringInst = hold.skillId
                ? a.skills.find(s => s?.def.id === hold.skillId) : undefined;
            const crush = wringInst
                ? a.sheet.get('gripCrush', this.ports.tags(wringInst.def), this.ports.modifiers(wringInst))
                : a.sheet.get('gripCrush');
            if (crush > 0) {
                const taken = this.ports.mitigate(v, { physical: crush * v.maxLife() * dt });
                if (taken > 0) {
                    const deedLifeBefore = v.life;
                    v.life -= taken;
                    this.ports.damaged(v, a, deedLifeBefore);
                    this.ports.dot(v, taken, 'physical');
                    if (v.life <= 0 && !v.dead) {
                        this.ports.kill(v, false, a);
                        this.release(a);
                    }
                }
            }
        }
    }
}
release(a: A): void {
    const hold = a.gripping;
    a.gripping = undefined;
    if (!hold)
        return;
    const v = this.ports.actorById(hold.id);
    if (!v)
        return;
    if (v.heldBy === a.id)
        v.heldBy = undefined;
    if (hold.verb === 'swallow')
        v.untargetable = hold.wasUntargetable ?? false;
    for (let i = v.statuses.length - 1; i >= 0; i--) {
        const id = v.statuses[i].id;
        if (id === 'seized' || id === 'swallowed') {
            v.statuses.splice(i, 1);
            v.sheet.removeSource('status:' + id);
        }
    }
    v.grabProofUntil = Math.max(v.grabProofUntil, this.ports.time() + (hold.spec.releaseGrace ?? this.rules.break.graceSec));
}
spitDirection(a: A, v: A, t: GrabThrowSpec): number {
    if (t.spitAt === 'foe') {
        let best: A | null = null, bd = 620;
        for (const e of this.ports.enemies(a)) {
            if (e === v || e.dead || e.untargetable)
                continue;
            const dd = dist(a.pos, e.pos);
            if (dd < bd) {
                bd = dd;
                best = e;
            }
        }
        if (best)
            return angleTo(a.pos, best.pos);
    }
    return a.facing;
}
handoff(from: A, v: A, hs: GrabHandoffSpec): boolean {
    const hold = from.gripping;
    if (!hold || hold.id !== v.id || v.dead)
        return false;
    const range = hs.range ?? this.rules.handoff.range;
    let best: A | null = null, bestInst: I | null = null, bestSpec: GrabSpec | null = null, bd = range;
    for (const r of this.ports.actors()) {
        if (r === from || r === v || r.dead)
            continue;
        if (r.tier !== from.tier)
            continue;
        if (this.ports.hostileTo(from, r) || !this.ports.hostileTo(r, v))
            continue;
        if (this.ports.dormant(r) || r.passive || r.untargetable)
            continue;
        const dd = dist(from.pos, r.pos);
        if (dd >= bd)
            continue;
        let rInst: I | null = null, rSpec: GrabSpec | null = null;
        for (const s of r.skills) {
            const f = s?.def.effects.find(e => e.type === 'grabSeize');
            if (f?.type === 'grabSeize') {
                rInst = s!;
                rSpec = (f as {type: 'grabSeize'; grab: GrabSpec}).grab;
                break;
            }
        }
        if (!rInst || !rSpec)
            continue;
        const grip = r.sheet.get('gripPower', this.ports.tags(rInst.def), this.ports.modifiers(rInst));
        if (this.refusal(r, v, rSpec, grip, hold))
            continue;
        if (!this.ports.lineOfSight(from.pos, r.pos))
            continue;
        bd = dd;
        best = r;
        bestInst = rInst;
        bestSpec = rSpec;
    }
    if (!best || !bestInst || !bestSpec)
        return false;
    const nv = bestSpec.verb;
    if (hold.verb === 'swallow' && nv !== 'swallow') {
        v.untargetable = hold.wasUntargetable ?? false;
    }
    for (let i = v.statuses.length - 1; i >= 0; i--) {
        const id = v.statuses[i].id;
        if (id === 'seized' || id === 'swallowed') {
            v.statuses.splice(i, 1);
            v.sheet.removeSource('status:' + id);
        }
    }
    from.gripping = undefined;
    const bounds = this.bounds(bestSpec);
    best.gripping = {
        id: v.id, verb: nv, spec: bestSpec,
        until: this.ports.time() + this.rand(bounds[0], bounds[1]),
        skillId: bestInst.def.id,
        struggle: hold.struggle,
        severed: 0,
        statusAt: this.ports.time(), dotAcc: 0,
        bearing: hold.bearing,
        wasUntargetable: hold.wasUntargetable,
    };
    v.heldBy = best.id;
    if (nv === 'swallow')
        v.untargetable = true;
    v.applyStatus(this.rules.markers[nv], 0, 1, 'grab');
    best.aiTargetId = v.id;
    this.ports.text(vec(v.pos.x, v.pos.y - 14), 'passed — ' + this.rules.labels[nv] + '!', '#d8a06a', 13);
    this.ports.flash({
        pos: vec(best.pos.x, best.pos.y), radius: best.radius + v.radius + 10,
        color: '#d8a06a', life: 0.2, maxLife: 0.2,
    });
    return true;
}
throw(a: A, impulse: number, dir: number, inst?: I, damageMult?: number): void {
    const hold = a.gripping;
    if (!hold)
        return;
    const v = this.ports.actorById(hold.id);
    this.release(a);
    if (!v || v.dead)
        return;
    v.pos = this.ports.clamp(vec(a.pos.x + Math.cos(dir) * (a.radius + v.radius) * 0.9, a.pos.y + Math.sin(dir) * (a.radius + v.radius) * 0.9), v.radius);
    v.facing = dir + Math.PI;
    if (damageMult && inst && this.ports.hostileTo(a, v)) {
        this.ports.hit(a, inst, v, damageMult, 0);
    }
    if (!v.dead)
        this.ports.push(v, dir, impulse, a, inst);
    this.ports.flash({
        pos: vec(a.pos.x, a.pos.y), radius: a.radius + v.radius + 10,
        color: '#d8a06a', life: 0.2, maxLife: 0.2,
    });
}
seize(caster: A, inst: I, victim: A, spec: GrabSpec): boolean {
    if (caster.dead || victim.dead)
        return false;
    if (this.ports.dormant(victim))
        return false;
    if (!this.ports.hostileTo(caster, victim))
        return false;
    if (this.ports.time() < victim.grabProofUntil) {
        if (caster === this.ports.localActor())
            this.ports.fail(caster, inst.def.id + ':slip', 'it slips the grip');
        return false;
    }
    const grip = caster.sheet.get('gripPower', this.ports.tags(inst), this.ports.modifiers(inst));
    const why = this.refusal(caster, victim, spec, grip);
    if (why) {
        if (caster === this.ports.localActor())
            this.ports.fail(caster, inst.def.id + ':grab', why);
        return false;
    }
    if (victim.clingTo)
        this.ports.unclasp(victim);
    victim.casting = null;
    const bounds = this.bounds(spec);
    caster.gripping = {
        id: victim.id, verb: spec.verb, spec,
        until: this.ports.time() + this.rand(bounds[0], bounds[1]),
        skillId: inst.def.id,
        struggle: 0, severed: 0, statusAt: this.ports.time(), dotAcc: 0,
        bearing: this.rand(-0.35, 0.35),
        wasUntargetable: victim.untargetable,
    };
    victim.heldBy = caster.id;
    if (spec.verb === 'swallow')
        victim.untargetable = true;
    victim.applyStatus(this.rules.markers[spec.verb], 0, 1, 'grab');
    caster.aiTargetId = victim.id;
    this.ports.text(vec(victim.pos.x, victim.pos.y - 14), this.rules.labels[spec.verb] + '!', '#d8a06a', 13);
    this.ports.flash({
        pos: vec(victim.pos.x, victim.pos.y), radius: victim.radius + 12,
        color: '#d8a06a', life: 0.25, maxLife: 0.25,
    });
    this.ports.seized(victim, caster);
    return true;
}
}
