// Original echo ownership and construct clocks. See the extraction manifest.
import {dist,angleTo,angleDiff,type CombatPoint} from './combat-geometry.js';import {pointSegDist} from './segment-geometry.js';import type {Modifier} from './types.js';import type {ConstructBirthSpec} from './construct-birth.js';
import type {ConstructClockActor,ConstructClockSkill,ConstructTarget,ConstructLifecycleState,ConstructLifecyclePorts,EchoRiderSpec} from './construct-lifecycle-types.js';
export type * from './construct-lifecycle-types.js';const vec=(x:number,y:number):CombatPoint=>({x,y});const sameStory=(a:{tier:number},b:{tier:number})=>(a.tier??0)===(b.tier??0);
const mod=(stat:string,kind:'more',value:number):Modifier=>({stat,kind,value});
export class ConstructLifecycle<A extends ConstructClockActor<A,I>,I extends ConstructClockSkill>{
constructor(readonly state:ConstructLifecycleState<A,I>,readonly rules:{echoStrikeLifeMax:number},readonly ports:ConstructLifecyclePorts<A,I>){}
spawnEchoRiders(owner: A, sourceInst: I, spec: EchoRiderSpec, key: string, aim: CombatPoint, castInst?: I): void {
const {ports:sdk,rules}=this;

    if (owner.construct)
        return;
    if (castInst && spec.mode !== 'mimic') {
        const cd = castInst.def;
        if (['construct', 'aura', 'detonate', 'detonateProjectile', 'summon',
            'mark', 'dash', 'blink', 'leap', 'self'].includes(cd.delivery.type)
            || cd.pool || cd.targeting
            || (() => { const cc = sdk.instanceChargeCost(castInst); return cc && !cc.optional; })())
            return;
    }
    const tags = sdk.skillContextTags(sourceInst.def);
    const extra = sdk.instanceMods(sourceInst);
    let othersFlat = 0;
    if (!key.endsWith(':self')) {
        const gemId = key.slice(key.indexOf(':') + 1);
        for (const s of sdk.hostSockets(sourceInst)) {
            if (!s.def.echo || s.def.id === gemId)
                continue;
            for (const m of s.def.mods) {
                if (m.stat === 'mirageCount' && m.kind === 'flat')
                    othersFlat += m.value;
            }
        }
    }
    const cap = Math.round(owner.sheet.get('mirageCount', tags, extra, spec.count ?? 0)) - othersFlat;
    if (cap < 1)
        return;
    const power = (spec.damageFactor ?? 0.5) * owner.sheet.get('mirageDamage', tags, extra);
    const life = spec.duration * owner.sheet.get('effectDuration', tags, extra);
    const family = sdk.actors().filter(a => a.owner === owner && !a.dead && a.construct?.echoKey === key);
    if (spec.mode === 'strike') {
        const prey = sdk.enemiesOf(owner)
            .filter(e => !e.passive && dist(owner.pos, e.pos) <= (spec.range ?? 200))
            .sort((a, b) => dist(owner.pos, a.pos) - dist(owner.pos, b.pos))
            .slice(0, cap);
        if (!prey.length)
            return;
        for (let i = family.length + prey.length - cap * 3; i > 0; i--) {
            const oldest = family.shift();
            if (oldest)
                sdk.kill(oldest, true);
        }
        for (const mark of prey) {
            const g = this.buildEchoRider(owner, sourceInst, spec, key, power, castInst);
            if (!g)
                continue;
            g.construct!.echoPrey = mark.id;
            g.construct!.echoCasts = spec.casts ?? 1;
            g.lifespan = Math.min(rules.echoStrikeLifeMax, life);
            const ang = angleTo(owner.pos, mark.pos);
            g.pos = vec(owner.pos.x + Math.cos(ang) * (owner.radius + 14), owner.pos.y + Math.sin(ang) * (owner.radius + 14));
            g.facing = ang;
        }
        return;
    }
    while (family.length > cap) {
        const oldest = family.shift();
        if (oldest)
            sdk.kill(oldest, true);
    }
    for (const r of family) {
        r.lifespan = Math.max(r.lifespan, life);
        if (r.construct) {
            r.construct.echoPower = power;
            if (castInst)
                r.construct.castInst = castInst;
            r.construct.castInterval = (spec.interval ?? 0.9)
                / owner.sheet.get('constructCastRate', tags, extra);
        }
        r.sheet.setSource('mirage', this.mirageSource(spec, power));
    }
    for (let i = family.length; i < cap; i++) {
        const r = this.buildEchoRider(owner, sourceInst, spec, key, power, castInst);
        if (!r)
            continue;
        r.construct!.echoSlot = i;
        if (spec.mode === 'mimic') {
            r.pos = vec(owner.pos.x, owner.pos.y);
            r.facing = owner.facing;
            if (spec.substitute) {
                const back = owner.facing + Math.PI;
                sdk.flash({
                    pos: vec(owner.pos.x, owner.pos.y), radius: 26,
                    color: '#4a4066', life: 0.3, maxLife: 0.3,
                });
                owner.pos = sdk.clampPos(vec(owner.pos.x + Math.cos(back) * spec.substitute, owner.pos.y + Math.sin(back) * spec.substitute), owner.radius);
            }
        }
        else {
            const slot = this.hoverSlotPos(owner, i, spec);
            r.pos = vec(slot.x, slot.y);
        }
    }
}
mirageSource(spec: EchoRiderSpec, power: number): Modifier[] {
    return spec.mode === 'mimic'
        ? [mod('statusMagnitude', 'more', power - 1)]
        : [mod('damage', 'more', power - 1), mod('statusMagnitude', 'more', power - 1)];
}
hoverSlotPos(owner: A, slot: number, spec: EchoRiderSpec): CombatPoint {
    const side = slot % 2 === 0 ? 1 : -1;
    const ang = owner.facing + Math.PI + side * (0.6 + Math.floor(slot / 2) * 0.45);
    const r = (spec.hoverRadius ?? 46) + Math.floor(slot / 2) * 18;
    return vec(owner.pos.x + Math.cos(ang) * r, owner.pos.y + Math.sin(ang) * r);
}
buildEchoRider(owner: A, sourceInst: I, spec: EchoRiderSpec, key: string, power: number, castInst?: I): A | null {
const {ports:sdk}=this;

    const mimic = spec.mode === 'mimic';
    const d: ConstructBirthSpec<unknown> = {
        type: 'construct', kind: 'echo',
        range: spec.range ?? 440,
        duration: spec.duration,
        maxActive: 99,
        life: mimic ? 30 + owner.maxLife() * 0.25 : 40,
        invulnerable: !mimic,
        placeRange: 0,
        interval: spec.interval,
    };
    const c = sdk.spawnConstruct(owner, sourceInst, d, owner.pos, castInst);
    if (!c)
        return null;
    c.shape = owner.shape;
    c.color = owner.color;
    c.radius = owner.radius;
    c.look = owner.look;
    c.adorn = owner.adorn;
    c.material = owner.material;
    const st = c.construct!;
    st.echo = spec;
    st.echoKey = key;
    st.echoPower = power;
    st.timer = 0.15;
    c.sheet.setSource('owner', mimic
        ? [mod('life', 'more', owner.sheet.get('minionLife', sdk.skillContextTags(sourceInst.def), sdk.instanceMods(sourceInst)) - 1)]
        : []);
    c.sheet.setSource('mirage', this.mirageSource(spec, power));
    if (!mimic)
        c.explodeOnDeath = 0;
    c.life = c.maxLife();
    return c;
}
echoToClones(owner: A, inst: I, aim: CombatPoint, useMult: number, targetInfo?: ConstructTarget<A>): void {
const {ports:sdk,state}=this;

    const def = inst.def;
    if (!['projectile', 'melee', 'nova', 'cone', 'ground', 'storm'].includes(def.delivery.type))
        return;
    if (def.pool || sdk.instanceTargeting(inst))
        return;
    if (!def.baseDamage && !def.effects.some(fx => fx.type === 'damage'))
        return;
    let clone: A | null = null;
    for (const a of sdk.actors()) {
        if (a.owner !== owner || a.dead || a.construct?.echo?.mode !== 'mimic')
            continue;
        if (sdk.time() < (a.construct.echoReadyAt ?? 0))
            continue;
        if (!clone || (a.construct.echoReadyAt ?? 0) < (clone.construct!.echoReadyAt ?? 0))
            clone = a;
    }
    if (!clone)
        return;
    const st = clone.construct!;
    st.echoReadyAt = sdk.time() + Math.max(0.25, st.castInterval ?? 0.9);
    const at = targetInfo?.actor && !targetInfo.actor.dead
        ? vec(targetInfo.actor.pos.x, targetInfo.actor.pos.y)
        : vec(aim.x, aim.y);
    clone.facing = angleTo(clone.pos, at);
    state.pendingRepeats.push({
        caster: clone, inst, aim: at,
        n: 1, k: 0, timer: 0.2, interval: 0.2,
        dmgMult: useMult * (st.echoPower ?? 0.35), aoeMult: 1,
        scaleStep: 0, retarget: false,
    });
}
updateConstructs(dt: number): void {
const {ports:sdk,state}=this;
const rand=(min:number,max:number)=>min+sdk.random()*(max-min);
const pick=<T>(values:readonly T[]):T=>values[Math.floor(sdk.random()*values.length)];

    for (const c of sdk.actors()) {
        if (c.dead || !c.construct)
            continue;
        const st = c.construct;
        if (st.follows && c.owner && !c.owner.dead) {
            const slot = c.owner.facing + Math.PI * 0.78;
            const want = vec(c.owner.pos.x + Math.cos(slot) * 36, c.owner.pos.y + Math.sin(slot) * 36);
            const dd = dist(c.pos, want);
            if (dd > 5) {
                const step = Math.min(dd, Math.max(140, dd * 3.2) * dt);
                const ang = angleTo(c.pos, want);
                c.pos.x += Math.cos(ang) * step;
                c.pos.y += Math.sin(ang) * step;
            }
        }
        const pulse = st.fx?.pulse;
        if (pulse && c.summonInst) {
            st.fxAt ??= sdk.time() + pulse.interval;
            if (sdk.time() >= st.fxAt) {
                st.fxAt = sdk.time() + pulse.interval;
                const radius = pulse.radius * (c.owner ?? c).sheet.get('aoeRadius', sdk.skillContextTags(c.summonInst.def), sdk.instanceMods(c.summonInst));
                let struck = false;
                for (const e of sdk.enemiesOf(c)) {
                    if (dist(c.pos, e.pos) - e.radius > radius)
                        continue;
                    sdk.resolveHit(c, c.summonInst, e, pulse.damageScale ?? 0.4, 1);
                    struck = true;
                }
                if (struck) {
                    sdk.flash({ pos: vec(c.pos.x, c.pos.y), radius, color: c.color, life: 0.18, maxLife: 0.18 });
                    sdk.presenceMoment(c, 'pulse');
                }
            }
        }
        switch (st.kind) {
            case 'totem': {
                if (!st.castInst || !c.canUse(st.castInst))
                    break;
                if (st.castInst.def.targeting?.target === 'ally') {
                    let sick: A | null = null;
                    let worst = 0.92;
                    for (const a of sdk.actors()) {
                        if (a.dead || a.construct || a.untargetable || a.team !== c.team || !sameStory(a, c))
                            continue;
                        if (dist(c.pos, a.pos) > st.range)
                            continue;
                        const frac = a.life / Math.max(1, a.maxLife());
                        if (frac < worst) {
                            worst = frac;
                            sick = a;
                        }
                    }
                    if (sick)
                        sdk.useSkill(c, st.castInst, sick.pos);
                    break;
                }
                let best: A | null = null, bestD = st.range;
                for (const e of sdk.enemiesOf(c)) {
                    const d = dist(c.pos, e.pos);
                    if (d < bestD) {
                        bestD = d;
                        best = e;
                    }
                }
                if (best)
                    sdk.useSkill(c, st.castInst, best.pos);
                break;
            }
            case 'sentry': {
                if (!st.castInst || !c.canUse(st.castInst))
                    break;
                const inLane = sdk.enemiesOf(c).some(e => dist(c.pos, e.pos) <= st.range
                    && Math.abs(angleDiff(c.facing, angleTo(c.pos, e.pos))) < 0.3);
                if (inLane) {
                    const aim = vec(c.pos.x + Math.cos(c.facing) * st.range, c.pos.y + Math.sin(c.facing) * st.range);
                    sdk.useSkill(c, st.castInst, aim);
                }
                break;
            }
            case 'trap': {
                if (st.timer > 0) {
                    st.timer -= dt;
                    break;
                }
                const prey = sdk.enemiesOf(c).find(e => dist(c.pos, e.pos) - e.radius <= st.range);
                if (prey && st.castInst) {
                    c.useLock = 0;
                    c.mana = c.maxMana();
                    sdk.executeSkill(c, st.castInst, prey.pos, { keepFacing: true });
                    sdk.kill(c, true);
                }
                break;
            }
            case 'mine':
            case 'decoy':
            case 'barrier':
            case 'dome':
            case 'relic':
                break;
            case 'embed': {
                const spec = st.embed;
                const owner = c.owner;
                if (!spec || !owner || owner.dead)
                    break;
                if (spec.runOver && sdk.time() >= (st.embedReadyAt ?? 0)
                    && dist(owner.pos, c.pos) <= owner.radius + c.radius + 8) {
                    if (spec.runOver === 'collect' && spec.collect) {
                        const col = spec.collect;
                        if (col.charge)
                            owner.gainCharge(col.charge, col.amount, col.max ?? 10, c.summonInst);
                        if (col.resource)
                            sdk.applyRestore(owner, { resource: col.resource, amount: col.amount });
                        sdk.text(owner.pos, 'collected', c.color, 11);
                    }
                    else if (spec.runOver === 'detonate' && spec.detonateSkillId && sdk.skill(spec.detonateSkillId)) {
                        const payload = sdk.makeSkillInstance(sdk.skill(spec.detonateSkillId)!, c.summonInst ? sdk.effectiveSkillLevel(c.summonInst) : c.level);
                        c.useLock = 0;
                        c.mana = c.maxMana();
                        sdk.executeSkill(c, payload, vec(c.pos.x, c.pos.y), { keepFacing: true });
                    }
                    if (spec.icd && spec.icd > 0) {
                        st.embedReadyAt = sdk.time() + spec.icd;
                    }
                    else {
                        sdk.kill(c, true);
                        break;
                    }
                }
                if (spec.emitInterval && spec.detonateSkillId && sdk.skill(spec.detonateSkillId)) {
                    st.emitAt ??= sdk.time() + spec.emitInterval;
                    if (sdk.time() >= st.emitAt) {
                        st.emitAt = sdk.time() + spec.emitInterval;
                        const payload = sdk.makeSkillInstance(sdk.skill(spec.detonateSkillId)!, c.summonInst ? sdk.effectiveSkillLevel(c.summonInst) : c.level);
                        c.useLock = 0;
                        c.mana = c.maxMana();
                        sdk.executeSkill(c, payload, vec(c.pos.x, c.pos.y), { keepFacing: true });
                    }
                }
                if (spec.beam && c.summonInst) {
                    st.beamAt ??= sdk.time() + spec.beam.interval;
                    if (sdk.time() >= st.beamAt) {
                        st.beamAt = sdk.time() + spec.beam.interval;
                        let kin: A | null = null, bd = spec.beam.range ?? 320;
                        for (const o of sdk.actors()) {
                            if (o === c || o.dead || o.owner !== owner)
                                continue;
                            if (o.construct?.kind !== 'embed' || o.sourceSkillId !== c.sourceSkillId)
                                continue;
                            const dd = dist(c.pos, o.pos);
                            if (dd < bd) {
                                bd = dd;
                                kin = o;
                            }
                        }
                        if (kin) {
                            const width = spec.beam.width ?? 10;
                            for (const e of sdk.enemiesOf(c)) {
                                if (pointSegDist(e.pos.x, e.pos.y, c.pos.x, c.pos.y, kin.pos.x, kin.pos.y) > width + e.radius)
                                    continue;
                                sdk.resolveHit(c, c.summonInst, e, spec.beam.damageScale ?? 0.5, 1);
                            }
                            state.tethers.push({
                                a: c, b: kin, owner: c, skillId: '__embedbeam:' + c.id, link: 'zap',
                                visual: 'embed', visualAge: 0,
                                amounts: {}, heal: 0, affects: 'enemies', width,
                                remaining: 0.15, tickTimer: 9, color: c.color,
                                ax: c.pos.x, ay: c.pos.y, bx: kin.pos.x, by: kin.pos.y,
                            });
                        }
                    }
                }
                break;
            }
            case 'echo': {
                const spec = st.echo;
                const owner = c.owner;
                if (!spec)
                    break;
                if (!owner || owner.dead) {
                    sdk.kill(c, true);
                    break;
                }
                if (spec.mode === 'mimic')
                    break;
                if (spec.mode === 'strike') {
                    const prey = st.echoPrey !== undefined ? sdk.actorById(st.echoPrey) : undefined;
                    if (!prey || prey.dead) {
                        sdk.kill(c, true);
                        break;
                    }
                    const ang = angleTo(c.pos, prey.pos);
                    c.facing = ang;
                    const reach = c.radius + prey.radius + 10;
                    const dd = dist(c.pos, prey.pos);
                    if (dd > reach) {
                        const step = Math.min((spec.glideSpeed ?? 300) * dt, dd - reach + 1);
                        c.pos.x += Math.cos(ang) * step;
                        c.pos.y += Math.sin(ang) * step;
                        break;
                    }
                    if (c.casting)
                        break;
                    if (!st.castInst) {
                        sdk.kill(c, true);
                        break;
                    }
                    if ((st.echoCasts ?? 0) <= 0)
                        break;
                    c.useLock = 0;
                    c.mana = c.maxMana();
                    sdk.useSkill(c, st.castInst, vec(prey.pos.x, prey.pos.y));
                    st.echoCasts = (st.echoCasts ?? 1) - 1;
                    const seq = sdk.instanceAim(st.castInst)?.sequence;
                    const stay = Math.max(c.skillUseTime(st.castInst), st.castInst.def.chargeUp?.maxTime ?? 0)
                        + (seq ? seq.steps.length * seq.pause + 0.2 : 0) + 0.35;
                    c.lifespan = st.echoCasts > 0
                        ? Math.max(c.lifespan, stay + 0.4)
                        : stay;
                    break;
                }
                const slot = this.hoverSlotPos(owner, st.echoSlot ?? 0, spec);
                if (dist(c.pos, slot) > 320) {
                    c.pos.x = slot.x;
                    c.pos.y = slot.y;
                }
                else {
                    const k = Math.min(1, dt * 8);
                    c.pos.x += (slot.x - c.pos.x) * k;
                    c.pos.y += (slot.y - c.pos.y) * k;
                }
                if (!c.casting)
                    c.facing = owner.facing;
                if (sdk.isStealthed(owner) || owner.downed)
                    break;
                st.timer -= dt;
                if (c.casting || st.timer > 0)
                    break;
                if (!st.castInst || !c.canUse(st.castInst)) {
                    st.timer = 0.2;
                    break;
                }
                let best: A | null = null, bestD = st.range;
                for (const e of sdk.enemiesOf(c)) {
                    if (e.passive)
                        continue;
                    const d2 = dist(c.pos, e.pos);
                    if (d2 < bestD) {
                        bestD = d2;
                        best = e;
                    }
                }
                if (!best) {
                    st.timer = 0.2;
                    break;
                }
                st.timer = Math.max(0.6, st.castInterval ?? 0.9);
                c.mana = c.maxMana();
                sdk.useSkill(c, st.castInst, vec(best.pos.x, best.pos.y));
                break;
            }
            case 'pad': {
                if (st.timer > 0) {
                    st.timer -= dt;
                    break;
                }
                const owner = c.owner;
                const d2 = c.summonInst?.def.delivery;
                const propel = d2?.type === 'construct' ? d2.propel : undefined;
                if (!owner || owner.dead || !propel)
                    break;
                if (dist(c.pos, owner.pos) <= c.radius + owner.radius + 4 && !owner.dash && !owner.caromRun) {
                    owner.dash = { dir: c.facing, speed: propel.speed, remaining: propel.distance / propel.speed };
                    (owner as A & {
                        dashSkill?: I;
                    }).dashSkill = undefined;
                    (owner as A & {
                        dashHits?: Set<number>;
                    }).dashHits = undefined;
                    st.timer = 0.8;
                    if (!sdk.presenceMoment(c, 'pulse'))
                        sdk.flash({ pos: vec(c.pos.x, c.pos.y), radius: 26, color: c.color, life: 0.25, maxLife: 0.25 });
                }
                break;
            }
            case 'gate': {
                if (st.timer > 0) {
                    st.timer -= dt;
                    break;
                }
                if (c.gateLink !== undefined) {
                    const partner = sdk.actors().find(a => a.id === c.gateLink && !a.dead);
                    if (!partner) {
                        c.gateLink = undefined;
                        break;
                    }
                    const owner = c.owner;
                    if (owner && !owner.dead
                        && dist(c.pos, owner.pos) <= c.radius + owner.radius + 4) {
                        sdk.teleportActor(owner, vec(partner.pos.x + 30, partner.pos.y), c.color);
                        sdk.presenceMoment(c, 'pulse');
                        sdk.presenceMoment(partner, 'pulse');
                        st.timer = 1.2;
                        if (partner.construct)
                            partner.construct.timer = 1.2;
                    }
                }
                break;
            }
            case 'eruptor': {
                if (!st.castInst)
                    break;
                if (st.holdOnce) {
                    if (c.casting && c.lifespan > 0 && c.lifespan < 0.25) {
                        c.casting.held = false;
                    }
                    if (st.started && !c.casting) {
                        sdk.kill(c, true);
                        break;
                    }
                    if (!st.started) {
                        st.started = true;
                        c.useLock = 0;
                        c.mana = c.maxMana();
                        sdk.useSkill(c, st.castInst, vec(c.pos.x + Math.cos(c.facing) * 40, c.pos.y + Math.sin(c.facing) * 40));
                    }
                    break;
                }
                st.timer -= dt;
                if (st.timer <= 0) {
                    st.timer = st.castInterval ?? 0.8;
                    c.useLock = 0;
                    c.mana = c.maxMana();
                    c.cooldowns.clear();
                    const ang = rand(0, Math.PI * 2);
                    const r = rand(st.range * 0.25, st.range);
                    sdk.useSkill(c, st.castInst, vec(c.pos.x + Math.cos(ang) * r, c.pos.y + Math.sin(ang) * r));
                }
                break;
            }
            case 'pylon': {
                if (!st.castInst)
                    break;
                st.timer -= dt;
                if (st.timer <= 0 && c.canUse(st.castInst)) {
                    const targets = sdk.enemiesOf(c).filter(e => dist(c.pos, e.pos) <= st.range);
                    if (targets.length) {
                        const challengeDelivery = c.summonInst && sdk.instanceDelivery(c.summonInst);
                        st.timer = challengeDelivery?.type === 'construct' ? (challengeDelivery.interval ?? 1.5) : 1.5;
                        sdk.useSkill(c, st.castInst, pick(targets).pos);
                    }
                }
                break;
            }
        }
    }
}
}
