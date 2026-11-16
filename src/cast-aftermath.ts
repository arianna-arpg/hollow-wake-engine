// Ordered post-cast rules extracted from executeSkill; no campaign or storage dependency.
import {dist,angleTo,type CombatPoint} from './combat-geometry.js';import type {PreparationTarget} from './cast-preparation-types.js';
import type {AftermathActor,AftermathSkill,AftermathState,AftermathRules,AftermathPorts,AftermathFrame} from './cast-aftermath-types.js';
export type * from './cast-aftermath-types.js';const vec=(x:number,y:number):CombatPoint=>({x,y});
export class CastAftermath<A extends AftermathActor<A,I,B>,I extends AftermathSkill,C,B,Z,E>{
constructor(readonly state:AftermathState<A,I>,readonly rules:AftermathRules,readonly ports:AftermathPorts<A,I,C,B,Z,E>){}
complete(frame:AftermathFrame<A,I,C,{type:string}>):void{
const {ports:sdk,state,rules}=this,{caster,inst,aim,origin,d,opts,targetInfo,tags,extra,useMult}=frame,def=inst.def;
const rand=(min:number,max:number)=>min+sdk.random()*(max-min),chance=(value:number)=>sdk.random()<value,pick=<T>(list:readonly T[]):T=>list[Math.floor(sdk.random()*list.length)]!;
{
    const cb = sdk.instanceBirth(inst);
    if (cb && !cb.onHit && d.type !== 'ground' && d.type !== 'storm'
        && d.type !== 'projectile') {
        sdk.birthAt(caster, inst, cb, origin);
    }
}
if (((!opts.noRepeat && !opts.noCooldown) || opts.componentUse) && !caster.construct?.echo) {
    let repeats = Math.round(caster.sheet.get('repeatCount', tags, extra))
        + Math.round((sdk.instanceChargeCost(inst)?.repeatsPerCharge ?? 0) * (opts.chargesSpent ?? 0));
    const unleashMax = caster.sheet.get('unleashMax', tags, extra);
    if (unleashMax > 0) {
        const st = (inst.state ??= {});
        const restEnd = st.pressAt ?? sdk.time();
        repeats += Math.min(Math.round(unleashMax), Math.max(0, Math.floor((restEnd - (st.lastUseAt ?? -999)) / rules.unleashInterval)));
        st.lastUseAt = sdk.time();
    }
    if (repeats > 0) {
        const interval = 0.22 / (opts.componentUse ? caster.speedFactor(inst) : 1);
        const echoSpec = sdk.instanceTargeting(inst);
        const echoMark = sdk.instanceDelivery(inst).type === 'target' && targetInfo
            && echoSpec && echoSpec.target !== 'corpse' && !def.effects.some(f => f.type === 'tame')
            ? targetInfo.actor ?? (targetInfo.self ? caster : undefined) : undefined;
        state.pendingRepeats.push({
            caster, inst, aim: vec(aim.x, aim.y),
            n: repeats, k: 1, timer: interval, interval,
            dmgMult: useMult, aoeMult: opts.aoeMult ?? 1,
            scaleStep: caster.sheet.get('repeatScale', tags, extra),
            retarget: caster.sheet.get('repeatRetarget', tags, extra) > 0,
            mark: echoMark,
        });
        if (caster.sheet.get('repeatLock', tags, extra) > 0) {
            caster.useLock = Math.max(caster.useLock, repeats * interval + 0.1);
        }
    }
}
if (!opts.noRepeat && !opts.noCooldown)
    sdk.consumeRemnants(caster, def);
if (!opts.noRepeat && !opts.noCooldown)
    sdk.consumeAmmunition(caster, def);
if (!opts.noRepeat && !opts.noCooldown) {
    if (def.tags.includes('movement'))
        caster.noteRecent('move');
    sdk.rollOwnProcs(caster, 'cast', { tags, extra, inst, aim });
}
if (!opts.noRepeat && !opts.noCooldown) {
    const ss = sdk.instanceSelfStack(inst);
    if (ss) {
        const st = (inst.state ??= {});
        st.stackN = Math.min(ss.maxStacks, (st.stackN ?? 0) + 1);
        st.stackT = ss.duration;
    }
}
const castCycle = sdk.instanceCastCycle(inst);
if (!opts.noRepeat && !opts.noCooldown && castCycle) {
    const n = (caster.castCycles.get(def.id) ?? 0) + 1;
    if (n >= castCycle.count) {
        caster.castCycles.set(def.id, 0);
        const cycleBuff = { ...castCycle.buff };
        sdk.associateTreeBuff(cycleBuff, { caster, inst });
        caster.addBuff(cycleBuff, caster.sheet.get('effectDuration', tags, extra));
        sdk.text(vec(caster.pos.x, caster.pos.y - 18), castCycle.buff.id.replace(/_/g, ' ') + '!', def.color, 12);
    }
    else {
        caster.castCycles.set(def.id, n);
    }
}
if (!opts.noRepeat && !opts.noCooldown) {
    for (const spec of sdk.instanceChargeGain(inst)) {
        if (spec.on !== 'use')
            continue;
        if (spec.chance !== undefined && !chance(spec.chance))
            continue;
        caster.gainCharge(spec.charge, spec.amount, spec.max, inst);
    }
}
if (!opts.noRepeat && !opts.noCooldown && !caster.construct && !caster.owner
    && state.remnants.length < 14) {
    const rc = caster.sheet.get('remnantOnCast', tags, extra);
    if (rc > 0 && chance(Math.min(0.5, rc))) {
        const els = rules.elements.filter(el => def.tags.includes(el));
        if (els.length) {
            const ang = rand(0, Math.PI * 2);
            const r = rand(40, 70);
            state.remnants.push({
                pos: sdk.clampPos(vec(caster.pos.x + Math.cos(ang) * r, caster.pos.y + Math.sin(ang) * r), 8),
                element: pick(els),
                bob: rand(0, Math.PI * 2), life: 14,
            });
        }
    }
}
if (!opts.noRepeat && !opts.noCooldown)
    sdk.consumeStealth(caster, def);
if (!opts.noRepeat && !opts.noCooldown && !caster.construct && !def.invokes) {
    sdk.bankRune(caster, def);
}
if (!opts.noRepeat && !opts.noCooldown && !caster.construct) {
    sdk.recordCast(caster, def, inst.chainOf);
    sdk.markBodyAction(caster, inst, sdk.time(), angleTo(caster.pos, aim));
}
if (!opts.noRepeat && !opts.noCooldown && !caster.construct
    && caster.team === 'enemy') {
    for (const s of sdk.seats()) {
        const p = s.actor;
        if (p.dead || p.kind !== 'player')
            continue;
        sdk.mimicRefreshWatch(p, sdk.time());
        if (!p.mimicWatch || p.mimicWitnessR <= 0)
            continue;
        if (dist(p.pos, caster.pos) > p.mimicWitnessR)
            continue;
        if (!sdk.lineOfSight(p.pos, caster.pos, p.tier, caster.tier))
            continue;
        if (sdk.mimicCapture(p, caster, def)) {
            sdk.notice(`ART WITNESSED: ${def.name}`, '#c8a0e8', 14, 'world');
        }
    }
}
if (((!opts.noRepeat && !opts.noCooldown) || opts.componentUse) && !caster.construct
    && def.delivery.type !== 'construct') {
    for (const e of sdk.instanceEchoes(inst)) {
        sdk.spawnEchoRiders(caster, inst, e.spec, e.key, aim, inst);
    }
}
if (!opts.noRepeat && !opts.noCooldown && !caster.construct) {
    for (const r of sdk.actors()) {
        const rc2 = r.construct;
        if (!rc2 || rc2.kind !== 'relic' || r.dead || r.owner !== caster)
            continue;
        if (rc2.timer > sdk.time() || !rc2.castInst)
            continue;
        rc2.timer = sdk.time() + (rc2.castInterval ?? 0.8);
        r.useLock = 0;
        r.mana = r.maxMana();
        sdk.executeSkill(r, rc2.castInst, vec(r.pos.x, r.pos.y), { keepFacing: true, noCooldown: true, noRepeat: true });
    }
}
if (((!opts.noRepeat && !opts.noCooldown) || opts.componentUse) && !opts.noFollowUp && !caster.construct) {
    sdk.queueFollowUps(caster, inst, aim, opts.chargesSpent ?? 0);
}
if (!opts.noRepeat && !caster.construct) {
    if (!opts.noCooldown)
        sdk.challengeCompleted(caster, inst);
    sdk.companionCast(caster, inst, aim);
    sdk.echoToClones(caster, inst, aim, useMult, opts.targetInfo as PreparationTarget<A, C> | undefined);
}
if (!caster.dead)
    sdk.presenceMoment(caster, 'pulse');
}
}
