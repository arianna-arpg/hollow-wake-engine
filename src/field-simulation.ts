// Mechanically extracted field clock and contact policy; see extraction manifest.
import {dist,angleTo,inAoe,zoneHoleSpares,AOE_SHAPE,type CombatPoint} from './combat-geometry.js';
import {evalFieldCurve as evalCurve,type CombatField} from './combat-fields.js';
import type {FieldSimulationActor,FieldSimulationSkill,FieldSimulationPorts,FieldSimulationRules} from './field-simulation-types.js';
export type * from './field-simulation-types.js';
const vec=(x:number,y:number):CombatPoint=>({x,y});const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export class FieldSimulation<A extends FieldSimulationActor<A,I>,I extends FieldSimulationSkill,F,B>{
constructor(readonly state:{zones:CombatField<A,I,F,B>[]},readonly rules:FieldSimulationRules,readonly ports:FieldSimulationPorts<A,I,F,B>){}
updateZones(dt: number): void {
const {ports:sdk,state,rules}=this;
const rand=(min:number,max:number)=>min+sdk.random()*(max-min);
const chance=(value:number)=>sdk.random()<value;
const pick=<T>(pool:T[]):T=>pool[Math.floor(sdk.random()*pool.length)]!;

    {
        let releasing: Map<string, CombatField<A, I, F, B>[]> | null = null;
        for (const z of state.zones) {
            z.tier ??= z.caster.tier;
            if (!z.armed)
                continue;
            const holding = !z.caster.dead && z.caster.casting?.mode === 'channel'
                && z.caster.casting.inst.def.id === z.inst.def.id;
            if (holding)
                continue;
            releasing ??= new Map();
            const key = z.caster.id + ':' + z.inst.def.id;
            if (!releasing.has(key))
                releasing.set(key, []);
            releasing.get(key)!.push(z);
        }
        if (releasing) {
            for (const zs of releasing.values()) {
                const d0 = zs[0].inst.def.delivery;
                const spec = d0.type === 'storm' ? d0.awaitRelease : undefined;
                const order = sdk.socketSpec(zs[0].inst, 'releaseOrder') ?? spec?.order ?? 'placed';
                const interval = spec?.interval ?? 0.08;
                zs.sort((a2, b2) => (a2.armSeq ?? 0) - (b2.armSeq ?? 0));
                if (order === 'random') {
                    for (let k = zs.length - 1; k > 0; k--) {
                        const j = Math.floor(sdk.random() * (k + 1));
                        [zs[k], zs[j]] = [zs[j], zs[k]];
                    }
                }
                zs.forEach((z2, k) => {
                    z2.armed = undefined;
                    z2.delay = 0.05 + k * interval;
                    z2.delay0 = z2.delay;
                });
            }
        }
    }
    for (let i = state.zones.length - 1; i >= 0; i--) {
        const z = state.zones[i];
        if (z.attackPattern && (z.caster.dead || z.caster.aiSkillBans?.has(z.inst.def.id))) {
            this.expireZone(z);
            state.zones.splice(i, 1);
            continue;
        }
        if (!z.exploded) {
            z.delay -= dt;
            if (z.delay <= 0) {
                z.exploded = true;
                if (z.pulse)
                    z.pulse.next = sdk.time() + z.pulse.delay;
                for (const victim of this.zoneVictims(z)) {
                    if (!inAoe(z.pos, z.radius, z.shape, z.facing, victim.pos, victim.radius, z.arcRad))
                        continue;
                    if (z.onGround) {
                        const gk = sdk.regionAt(victim.pos.x, victim.pos.y);
                        if (!gk || !z.onGround.includes(gk))
                            continue;
                    }
                    if (z.edgeFrac && dist(z.pos, victim.pos) + victim.radius < z.radius * z.edgeFrac)
                        continue;
                    if (z.spareDormant && sdk.isDormant(victim))
                        continue;
                    if (z.spareRoofed && sdk.underRoofAt(victim.pos))
                        continue;
                    if (zoneHoleSpares(z, victim.pos, victim.radius))
                        continue;
                    if (!this.zoneSees(z, victim))
                        continue;
                    if (z.struck) {
                        if (z.struck.has(victim.id))
                            continue;
                        z.struck.add(victim.id);
                    }
                    sdk.resolveHit(z.caster, z.inst, victim, z.dmgMult, z.depth, z.flatBonus, z.forceDamage, false, undefined, z.pos, z.tier);
                }
                this.strikeZoneSurfaces(z);
                sdk.flash({
                    pos: vec(z.pos.x, z.pos.y), radius: z.radius, color: z.color,
                    life: 0.35, maxLife: 0.35, shape: z.shape, facing: z.facing, arcRad: z.arcRad,
                    edgeFrac: z.edgeFrac,
                    bolt: !z.fx && z.hitAll && !z.meteor, meteor: z.meteor,
                    fx: z.fx, onGround: z.onGround?.slice(), recoveryCueTier: z.tier ?? z.caster.tier,
                });
                z.onImpact?.();
                if (z.birth && !z.caster.dead)
                    sdk.birthAt(z.caster, z.inst, z.birth, z.pos);
                if (z.impactDress)
                    sdk.plantImpactDress(z);
                if (z.marker) {
                    let k = 1;
                    for (const other of state.zones) {
                        if (other === z || other.exploded || !other.marker)
                            continue;
                        if (other.caster !== z.caster || other.inst.def.id !== z.inst.def.id)
                            continue;
                        other.delay = Math.min(other.delay, 0.06 * k++);
                    }
                }
                this.spawnAftershocks(z.caster, z.inst, z.pos, z.radius, z.shape, z.depth);
                if (z.leaveTerrain) {
                    sdk.addTempGround(z.pos, z.leaveTerrain.kind, z.leaveTerrain.radius, z.leaveTerrain.duration
                        * z.caster.sheet.get('effectDuration', sdk.skillContextTags(z.inst.def), sdk.instanceMods(z.inst)));
                }
                if (z.linger <= 0) {
                    this.expireZone(z);
                    state.zones.splice(i, 1);
                    continue;
                }
            }
        }
        else {
            if (z.drift && !z.seek) {
                z.pos = sdk.clampPos(vec(z.pos.x + Math.cos(z.facing) * z.drift * dt, z.pos.y + Math.sin(z.facing) * z.drift * dt), 10);
            }
            if (z.seek) {
                let prey: A | null = null;
                let bd = z.seek.range;
                for (const e of sdk.enemiesOf(z.caster)) {
                    if (e.construct?.breakable)
                        continue;
                    const dd = dist(z.pos, e.pos);
                    if (dd < bd) {
                        bd = dd;
                        prey = e;
                    }
                }
                if (prey && bd > 6) {
                    const ang = angleTo(z.pos, prey.pos);
                    z.pos = sdk.clampPos(vec(z.pos.x + Math.cos(ang) * z.seek.speed * dt, z.pos.y + Math.sin(ang) * z.seek.speed * dt), 10);
                }
            }
            if (z.follow) {
                if (z.caster.dead) {
                    this.expireZone(z);
                    state.zones.splice(i, 1);
                    continue;
                }
                z.pos.x = z.caster.pos.x;
                z.pos.y = z.caster.pos.y;
            }
            if (z.anchor) {
                if (z.anchor.dead) {
                    this.expireZone(z);
                    state.zones.splice(i, 1);
                    continue;
                }
                z.pos.x = z.anchor.pos.x;
                z.pos.y = z.anchor.pos.y;
            }
            if (z.struck && z.rearm && z.struck.size) {
                for (const id of [...z.struck]) {
                    const v = sdk.actorById(id);
                    if (!v || v.dead || !this.zoneHas(z, v.pos, v.radius)) {
                        z.struck.delete(id);
                    }
                }
            }
            if (z.sizeOver && z.radius0 !== undefined && (z.linger0 ?? 0) > 0) {
                const t = ((z.linger0 ?? 1) - Math.max(0, z.linger)) / (z.linger0 ?? 1);
                const s = evalCurve(z.sizeOver.curve, t);
                z.radius = Math.max(0, z.radius0
                    * (z.sizeOver.from + (z.sizeOver.to - z.sizeOver.from) * s));
            }
            else {
                const retracting = z.retract !== undefined
                    && (z.linger0 ?? 0) - z.linger >= z.retract.at;
                if (retracting && z.retract!.fizzle) {
                    z.linger = Math.min(z.linger, 0);
                }
                else {
                    if (z.grow && !retracting)
                        z.radius += z.grow * dt;
                    if (retracting)
                        z.radius = Math.max(10, z.radius - (z.retract!.speed ?? 100) * dt);
                }
            }
            if (z.volatile && z.exploded && z.linger > 0 && sdk.time() >= z.volatile.next) {
                z.volatile.next = sdk.time() + z.volatile.interval;
                if (chance(z.volatile.chance)) {
                    sdk.flash({
                        pos: vec(z.pos.x, z.pos.y), radius: z.radius + 10,
                        color: z.color, life: 0.3, maxLife: 0.3,
                    });
                    for (const v of this.zoneVictims(z)) {
                        const nb = sdk.bodyWhere(v, (bp, br) => this.zoneHas(z, bp, br));
                        if (!nb)
                            continue;
                        if (!this.zoneSees(z, v))
                            continue;
                        sdk.noteBodyHit(v, nb.seg);
                        sdk.resolveHit(z.caster, z.inst, v, z.dmgMult * z.volatile.damageScale, z.depth, z.flatBonus, true, false, undefined, z.pos, z.tier);
                    }
                    this.strikeZoneSurfaces(z, false);
                }
            }
            if (z.aftershock && z.exploded && z.linger > 0
                && sdk.time() >= z.aftershock.readyAt
                && this.detonateFissureSegment(z, z.aftershock.damageScale, z.aftershock.radiusScale ?? 2.4)) {
                z.aftershock.readyAt = sdk.time() + z.aftershock.rearm;
            }
            if (z.roulette && z.exploded && z.linger > 0) {
                if (sdk.time() >= z.roulette.next) {
                    z.roulette.next = sdk.time() + z.roulette.interval;
                    if (sdk.time() >= z.roulette.armedUntil && chance(z.roulette.chance)) {
                        z.roulette.armedUntil = sdk.time() + z.roulette.window;
                    }
                }
                if (sdk.time() < z.roulette.armedUntil
                    && this.detonateFissureSegment(z, z.roulette.damageScale, z.roulette.radiusScale ?? 2.2)) {
                    z.roulette.armedUntil = 0;
                }
            }
            if (z.pulse && z.pulse.left > 0 && z.linger > 0 && sdk.time() >= z.pulse.next) {
                z.pulse.left--;
                z.pulse.next = sdk.time() + z.pulse.interval;
                z.pulse.interval = Math.max(0.05, z.pulse.interval * z.pulse.intervalStep);
                const pr = z.seg ? z.radius : z.radius * z.pulse.radiusMult;
                for (const v of this.zoneVictims(z)) {
                    const nb = sdk.bodyWhere(v, (bp, br) => (z.seg
                        ? this.zoneHas(z, bp, br)
                        : inAoe(z.pos, pr, z.shape, z.facing, bp, br, z.arcRad))
                        && !(z.edgeFrac && dist(z.pos, bp) + br < pr * z.edgeFrac)
                        && !zoneHoleSpares(z, bp, br));
                    if (!nb)
                        continue;
                    if (z.spareDormant && sdk.isDormant(v))
                        continue;
                    if (!this.zoneSees(z, v))
                        continue;
                    sdk.noteBodyHit(v, nb.seg);
                    sdk.resolveHit(z.caster, z.inst, v, z.dmgMult * z.pulse.dmgMult, z.depth, z.flatBonus, z.forceDamage, false, undefined, z.pos, z.tier);
                }
                this.strikeZoneSurfaces(z, false, z.seg ? undefined : z.pos, z.seg ? undefined : pr);
                sdk.flash({
                    pos: vec(z.pos.x, z.pos.y), radius: pr, color: z.color,
                    life: 0.35, maxLife: 0.35, shape: z.shape, facing: z.facing, arcRad: z.arcRad,
                    edgeFrac: z.edgeFrac,
                    fx: ['nova', 'melee', 'cone', 'leap', 'storm'].includes(sdk.instanceDelivery(z.inst).type) ? z.fx : undefined,
                    onGround: z.onGround?.slice(), recoveryCueTier: z.tier ?? z.caster.tier,
                });
                this.spawnAftershocks(z.caster, z.inst, z.pos, pr, z.shape, z.depth);
                z.pulse.dmgMult *= z.pulse.dmgStep;
                z.pulse.radiusMult *= z.pulse.radiusStep;
                if (z.pulse.left === 0 && z.pulse.queue?.length) {
                    const q = z.pulse.queue.shift()!;
                    z.pulse.left = 1;
                    z.pulse.next = sdk.time() + q.delay;
                    z.pulse.dmgMult = q.dmgMult;
                    z.pulse.radiusMult = q.radiusMult;
                }
            }
            if (z.rotate)
                z.facing += z.rotate * dt;
            if (z.pendulum) {
                const lived = (z.linger0 ?? 0) - z.linger;
                z.facing = z.pendulum.base
                    + Math.sin((lived / z.pendulum.period) * Math.PI * 2) * (z.pendulum.arc / 2);
            }
            if (z.sweep && (z.linger0 ?? 0) > 0) {
                const prog = clamp(1 - z.linger / z.linger0!, 0, 1);
                z.facing = z.sweep.base - z.sweep.arc / 2 + z.sweep.arc * prog;
            }
            if (z.pull) {
                const reach = z.pullRadius ?? z.radius * 1.35;
                for (const v of sdk.enemiesOf(z.caster)) {
                    if (v.construct || v.leap || v.anchored)
                        continue;
                    const dd = dist(z.pos, v.pos);
                    if (dd - v.radius > reach || dd < 6)
                        continue;
                    const stepIn = Math.min(z.pull * dt, dd - 4);
                    const ang = angleTo(v.pos, z.pos);
                    v.pos = sdk.clampPos(vec(v.pos.x + Math.cos(ang) * stepIn, v.pos.y + Math.sin(ang) * stepIn), v.radius, v.pos);
                }
            }
            if (z.edge !== undefined && z.fillRate) {
                const floor = z.shape === AOE_SHAPE.crescent ? 0.55 : 0;
                z.edge = Math.max(floor, z.edge - z.fillRate * dt);
            }
            if (z.emit && sdk.hasSkill(z.emit.skillId)) {
                z.emitInterval ??= z.emit.interval;
                z.emitTimer = (z.emitTimer ?? z.emitInterval) - dt;
                if (z.emitTimer <= 0) {
                    z.emitTimer += z.emitInterval;
                    if (z.emitStep && z.emitStep !== 1) {
                        z.emitInterval = Math.max(0.05, z.emitInterval * z.emitStep);
                    }
                    z.emitInst ??= sdk.makeSkill(z.emit.skillId, z.inst.level);
                    const n = z.emit.count ?? 1;
                    for (let k = 0; k < n; k++) {
                        let at: CombatPoint | null = null;
                        if ((z.emit.at ?? 'point') === 'enemy') {
                            const pool = this.zoneVictims(z).filter(v => this.zoneHas(z, v.pos, v.radius + (z.emit!.reach ?? 0)));
                            if (pool.length) {
                                const v = pick(pool);
                                at = vec(v.pos.x, v.pos.y);
                            }
                        }
                        else {
                            const ang = rand(0, Math.PI * 2);
                            const r = Math.sqrt(sdk.random()) * z.radius;
                            at = vec(z.pos.x + Math.cos(ang) * r, z.pos.y + Math.sin(ang) * r);
                        }
                        if (!at)
                            break;
                        const keepDir = z.caster.facing;
                        if (z.emit.bearing === 'random') {
                            z.caster.facing = rand(0, Math.PI * 2);
                        }
                        else if (z.emit.bearing === 'out') {
                            z.caster.facing = dist(z.pos, at) < 1
                                ? rand(0, Math.PI * 2) : angleTo(z.pos, at);
                        }
                        sdk.executeSkill(z.caster, z.emitInst, at, {
                            dmgMult: z.dmgMult, noCooldown: true, noRepeat: true, keepFacing: true,
                        });
                        z.caster.facing = keepDir;
                    }
                }
            }
            if (z.domain && z.domainKey)
                this.updateZoneDomain(z);
            if (z.exposure && z.linger > 0) {
                const pool = z.exposureDomain && z.domain
                    ? sdk.actors().filter(a => !a.dead && !a.untargetable && !a.construct)
                    : this.zoneVictims(z);
                for (const v of pool) {
                    if (this.zoneHas(z, v.pos, v.radius)) {
                        z.exposure.dwell.set(v.id, (z.exposure.dwell.get(v.id) ?? 0) + dt);
                    }
                    else {
                        z.exposure.dwell.delete(v.id);
                    }
                }
            }
            if (z.madden && z.linger > 0) {
                const bank = z.madden;
                const story = z.tier ?? z.caster.tier;
                for (const v of sdk.enemiesOf(z.caster)) {
                    if (v.tier !== story || bank.credited.get(v.id) === sdk.time())
                        continue;
                    if (!this.zoneHas(z, v.pos, v.radius))
                        continue;
                    bank.credited.set(v.id, sdk.time());
                    const dwelt = (bank.dwell.get(v.id) ?? 0) + dt;
                    if (dwelt + rules.maddenEpsilon >= bank.after && !v.statuses.some(s => s.id === 'maddened')) {
                        v.applyStatus('maddened', sdk.baselineStatusDps('maddened', sdk.encounterLevel()), 1, z.inst.def.name, { casterId: z.caster.id });
                        bank.dwell.set(v.id, 0);
                    }
                    else {
                        bank.dwell.set(v.id, dwelt);
                    }
                }
            }
            if (!z.toggled)
                z.linger -= dt;
            z.tickTimer -= dt;
            if (z.tickTimer <= 0) {
                z.tickTimer = z.tickInterval;
                if (z.healTick) {
                    const hp = z.caster.sheet.get('healPower', sdk.skillContextTags(z.inst.def), sdk.instanceMods(z.inst));
                    for (const ally of sdk.actors()) {
                        if (ally.dead || ally.team !== z.caster.team || ally.tier !== (z.tier ?? z.caster.tier))
                            continue;
                        if (!this.zoneHas(z, ally.pos, ally.radius))
                            continue;
                        const got = ally.healBy(z.healTick * hp);
                        if (got > 0.5)
                            sdk.text(ally.pos, '+' + Math.round(got), '#8ae0a8', 10);
                    }
                }
                else {
                    if (z.struck && sdk.instanceDelivery(z.inst).type === 'melee') {
                        sdk.releaseStruckSummons(z.caster, z.inst, body => this.zoneHas(z, body.pos, body.radius), z.struck, z.facing);
                    }
                    for (const victim of this.zoneVictims(z)) {
                        const nb = sdk.bodyWhere(victim, (bp, br) => this.zoneHas(z, bp, br)
                            && !(z.edge && dist(z.pos, bp) + br < z.radius * z.edge));
                        if (!nb)
                            continue;
                        if (z.spareDormant && sdk.isDormant(victim))
                            continue;
                        if (z.exposure && (z.exposure.dwell.get(victim.id) ?? 0) < z.exposure.after)
                            continue;
                        if (!this.zoneSees(z, victim))
                            continue;
                        if (z.struck) {
                            if (z.struck.has(victim.id))
                                continue;
                            z.struck.add(victim.id);
                        }
                        sdk.noteBodyHit(victim, nb.seg);
                        sdk.resolveHit(z.caster, z.inst, victim, z.dmgMult, z.depth, z.flatBonus, z.forceDamage, false, undefined, z.pos, z.tier);
                    }
                    this.strikeZoneSurfaces(z);
                }
                sdk.healAlliesInArea(z.caster, z.inst, a => this.zoneHas(z, a.pos, a.radius), z.dmgMult, true, z.struck);
            }
            if (z.linger <= 0) {
                if (z.endBurst) {
                    const radius = z.radius * (z.endBurst.radiusScale ?? 1);
                    for (const victim of this.zoneVictims(z)) {
                        const nb = sdk.bodyWhere(victim, (bp, br) => dist(z.pos, bp) - br <= radius);
                        if (!nb)
                            continue;
                        sdk.noteBodyHit(victim, nb.seg);
                        sdk.resolveHit(z.caster, z.inst, victim, z.dmgMult * z.endBurst.damageScale, z.depth, z.flatBonus, true, false, undefined, z.pos, z.tier);
                    }
                    sdk.frontSplash(z.caster, z.inst, z.pos, radius);
                    sdk.strikeSurfaces(z.caster, z.pos, radius);
                    sdk.flash({
                        pos: vec(z.pos.x, z.pos.y), radius, color: z.color,
                        life: 0.35, maxLife: 0.35,
                    });
                }
                this.expireZone(z);
                state.zones.splice(i, 1);
            }
        }
    }
}
expireZone(z: CombatField<A, I, F, B>): void {
const {ports:sdk,rules}=this;

    if (!z.presenceRetired && (!z.exploded || z.pulse) && sdk.presenceProfile(z.inst.def.id)?.family === 'storm') {
        z.presenceRetired = true;
        sdk.flash({ pos: { ...z.pos }, radius: z.radius, color: z.color,
            life: rules.expireCueSeconds, maxLife: rules.expireCueSeconds,
            fx: sdk.skillPresenceVoice(z.inst.def.id, 'expire'), shape: z.shape, facing: z.facing,
            arcRad: z.arcRad, edgeFrac: z.edgeFrac, onGround: z.onGround?.slice(), recoveryCueTier: z.tier ?? z.caster.tier });
    }
    if (z.fieldCue) {
        sdk.flash({ ...sdk.combatCueFlash(z.pos, z.fieldCue.release ?? 'field_release', z.radius, 0, z.fieldCue.color ?? z.color), recoveryCueTier: z.tier ?? z.caster.tier ?? 0 });
        z.fieldCue = undefined;
    }
    if (z.reserved && z.reserved > 0) {
        z.caster.reservedMana = Math.max(0, z.caster.reservedMana - z.reserved);
        z.reserved = 0;
    }
    if (z.madden) {
        for (const id of z.madden.dwell.keys()) {
            const a = sdk.actorById(id);
            if (!a || a.dead) {
                z.madden.dwell.delete(id);
                z.madden.credited.delete(id);
            }
        }
    }
    if (!z.domainAffected || !z.domainKey)
        return;
    for (const a of z.domainAffected)
        a.sheet.removeSource(z.domainKey);
    z.domainAffected.clear();
}
updateZoneDomain(z: CombatField<A, I, F, B>): void {
const {ports:sdk}=this;

    const set = (z.domainAffected ??= new Set());
    const inside = new Set<A>();
    for (const a of sdk.actors()) {
        if (a.dead || a.downed || a.untargetable || a.construct)
            continue;
        if (a.tier !== (z.tier ?? z.caster.tier))
            continue;
        let mods = a.team === z.caster.team ? z.domain!.allyMods : z.domain!.enemyMods;
        if (a.team === z.caster.team && a.owner === z.caster && z.domain!.minionMods) {
            mods = [...(mods ?? []), ...z.domain!.minionMods];
        }
        if (!mods?.length)
            continue;
        if (!inAoe(z.pos, z.radius, z.shape, z.facing, a.pos, a.radius, z.arcRad))
            continue;
        if (z.exposure && z.exposureDomain
            && (z.exposure.dwell.get(a.id) ?? 0) < z.exposure.after)
            continue;
        inside.add(a);
        if (!set.has(a)) {
            set.add(a);
            a.sheet.setSource(z.domainKey!, mods);
        }
    }
    for (const a of [...set]) {
        if (!inside.has(a)) {
            set.delete(a);
            a.sheet.removeSource(z.domainKey!);
        }
    }
}
zoneVictims(z: CombatField<A, I, F, B>): A[] {
const {ports:sdk}=this;
const chance=(value:number)=>sdk.random()<value;

    if (z.hitAll) {
        const all: A[] = [];
        for (const a of sdk.actors()) {
            if (a.dead || a.untargetable)
                continue;
            if (a.kind === 'player' && !a.downed)
                all.push(a);
            else if (a.team === 'enemy' && !(a.defId && sdk.passiveMonster(a.defId))
                && !(sdk.activeBoss() && a.defId === sdk.activeBoss()!.bossId))
                all.push(a);
        }
        return all;
    }
    const story = z.tier ?? z.caster.tier;
    const out = sdk.enemiesOf(z.caster).filter(v => v.tier === story);
    if (z.curseAllies) {
        for (const a of sdk.actors()) {
            if (a.dead || a.team !== z.caster.team || a.untargetable || a.tier !== story)
                continue;
            if (chance(0.5))
                out.push(a);
        }
    }
    return out;
}
zoneSees(z: CombatField<A, I, F, B>, v: A | CombatPoint): boolean {
const {ports:sdk,rules}=this;

    const p = 'pos' in v ? v.pos : v;
    z.phase ??= !(rules.occludingDeliveries[z.inst.def.delivery.type]
        && sdk.skillOcclusion(z.caster, z.inst) === 'blocked');
    if (z.phase)
        return true;
    let ox = z.pos.x, oy = z.pos.y;
    if (z.seg) {
        const sx = z.seg.bx - z.seg.ax, sy = z.seg.by - z.seg.ay;
        const ll = sx * sx + sy * sy;
        const t = ll > 0
            ? clamp(((p.x - z.seg.ax) * sx + (p.y - z.seg.ay) * sy) / ll, 0, 1) : 0;
        ox = z.seg.ax + sx * t;
        oy = z.seg.ay + sy * t;
    }
    return sdk.lineOfFire(vec(ox, oy), p);
}
zoneHas(z: {
    seg?: {
        ax: number;
        ay: number;
        bx: number;
        by: number;
    };
    pos: CombatPoint;
    radius: number;
    shape: number;
    facing: number;
    arcRad?: number;
}, pos: CombatPoint, radius: number): boolean {
    if (z.seg) {
        const dx = z.seg.bx - z.seg.ax, dy = z.seg.by - z.seg.ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 <= 0.0001 ? 0
            : clamp(((pos.x - z.seg.ax) * dx + (pos.y - z.seg.ay) * dy) / len2, 0, 1);
        const cx = z.seg.ax + dx * t, cy = z.seg.ay + dy * t;
        return Math.hypot(pos.x - cx, pos.y - cy) <= z.radius + radius;
    }
    return inAoe(z.pos, z.radius, z.shape, z.facing, pos, radius, z.arcRad);
}
strikeZoneSurfaces(z: CombatField<A, I, F, B>, useStruck = true, at?: CombatPoint, radius?: number): void {
const {ports:sdk}=this;

    if (z.exposure || z.healTick)
        return;
    const cAt = at ?? z.pos;
    const r = radius ?? z.radius;
    sdk.frontSplash(z.caster, z.inst, cAt, r);
    sdk.strikeSurfaces(z.caster, cAt, r, (p, pr) => (at !== undefined || radius !== undefined
        ? inAoe(cAt, r, z.shape, z.facing, p, pr, z.arcRad)
        : this.zoneHas(z, p, pr))
        && !zoneHoleSpares(z, p, pr)
        && this.zoneSees(z, p), useStruck ? z.struck : undefined);
}
detonateFissureSegment(z: CombatField<A, I, F, B>, damageScale: number, radiusScale: number): boolean {
const {ports:sdk}=this;

    if (z.caster.dead || !this.zoneHas(z, z.caster.pos, z.caster.radius))
        return false;
    const radius = z.radius * radiusScale;
    const at = z.seg
        ? vec((z.seg.ax + z.seg.bx) / 2, (z.seg.ay + z.seg.by) / 2)
        : vec(z.pos.x, z.pos.y);
    sdk.flash(sdk.combatCueFlash(at, 'aftershock', radius, z.facing ?? 0, z.color));
    for (const v of this.zoneVictims(z)) {
        const nb = sdk.bodyWhere(v, (bp, br) => dist(at, bp) - br <= radius);
        if (!nb)
            continue;
        if (!this.zoneSees(z, v))
            continue;
        sdk.noteBodyHit(v, nb.seg);
        sdk.resolveHit(z.caster, z.inst, v, z.dmgMult * damageScale, z.depth, z.flatBonus, true, false, undefined, z.pos, z.tier);
    }
    this.strikeZoneSurfaces(z, false, at, radius);
    this.spawnAftershocks(z.caster, z.inst, at, radius, z.shape, 0);
    return true;
}
spawnAftershocks(caster: A, inst: I, at: CombatPoint, radius: number, shape: number, depth = 0): void {
const {ports:sdk,state}=this;
const rand=(min:number,max:number)=>min+sdk.random()*(max-min);

    if (depth > 0)
        return;
    const tags = sdk.skillContextTags(inst);
    const extra = sdk.instanceMods(inst);
    const scatter = Math.round(caster.sheet.get('aoeScatter', tags, extra));
    for (let i = 0; i < scatter; i++) {
        const ang = rand(0, Math.PI * 2);
        const r = rand(radius * 0.4, radius * 1.1);
        state.zones.push({
            pos: sdk.clampPos(vec(at.x + Math.cos(ang) * r, at.y + Math.sin(ang) * r), 10),
            radius: radius * 0.5,
            caster, inst, color: inst.def.color,
            delay: 0.3 + i * 0.12, exploded: false,
            linger: 0, tickInterval: 0.5, tickTimer: 0,
            shape, facing: ang,
            dmgMult: 0.5, depth: 1,
        });
    }
}
}
