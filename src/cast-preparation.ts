// Ordered preparation extracted from executeSkill; campaign deed recording is an optional observer responsibility.
import {dist,angleTo,type CombatPoint} from './combat-geometry.js';import type {GroundDeliverySpec} from './field-delivery-types.js';
import type {PreparationActor,PreparationSkill,PreparationCorpse,PreparationPorts,PreparationState,PreparationRules,PreparationOptions,PreparedCast} from './cast-preparation-types.js';
export type * from './cast-preparation-types.js';const vec=(x:number,y:number):CombatPoint=>({x,y});
export class CastPreparation<A extends PreparationActor<A,I,B>,I extends PreparationSkill<B>,C extends PreparationCorpse,B,D,Z>{
constructor(readonly state:PreparationState<A,I,C,Z>,readonly rules:PreparationRules,readonly ports:PreparationPorts<A,I,C,B,D,Z>){}
prepare(caster:A,inst:I,aim:CombatPoint,opts:PreparationOptions<A,C>={}):PreparedCast<A,I,C,D>|{completed:boolean}{
const {ports:sdk,state,rules}=this;const rand=(min:number,max:number)=>min+sdk.random()*(max-min),chance=(value:number)=>sdk.random()<value;
if (sdk.replenishingDelivery(inst))
    return { completed: false };
inst = sdk.prepareChallenge(caster, inst, !opts.noRepeat && !opts.noCooldown && !opts.fromFuse);
inst = sdk.prepareAttack(caster, inst, aim, opts.dmgMult ?? 1);
const def = inst.def;
const cosmeticPaint = sdk.cosmetic(caster, def.id);
const cosmeticColor = cosmeticPaint.color ?? def.color;
const extra = sdk.instanceMods(inst);
sdk.castObserved(caster,inst,!!opts.noRepeat);
if (def.selfCleanse && !opts.noRepeat) {
    sdk.ringAfflictions(caster, def.selfCleanse.stacksPortion);
}
const tags = sdk.skillContextTags(inst, sdk.grantedTags(inst));
let useMult = opts.dmgMult ?? 1;
const gPow = def.gauge ? (inst.state?.gaugePower ?? 1) : 1;
let targetInfo = opts.targetInfo ?? null;
if (sdk.denseCount() && def.delivery.type === 'melee'
    && def.effects.some(f => f.type === 'grabSeize')) {
    const reach = caster.radius + (def.delivery.range ?? 60) + 24;
    let anyClose = false;
    for (const e of sdk.enemiesOf(caster)) {
        if (dist(caster.pos, e.pos) - e.radius <= reach) {
            anyClose = true;
            break;
        }
    }
    if (!anyClose) {
        sdk.litePromoteNearest(caster.pos, { within: reach, max: 1, opposing: caster.team, rank: aim, story: caster.tier });
    }
}
if (def.empower && !opts.noRepeat) {
    const w = rules.empower;
    let power = 0;
    for (const e of sdk.enemiesOf(caster)) {
        if (e.dead || e.untargetable)
            continue;
        if (dist(caster.pos, e.pos) > def.empower.radius)
            continue;
        power += e.defId && sdk.bossMonster(e.defId) ? w.boss
            : e.rarity === 'crowned' ? w.crowned
                : e.rarity === 'champion' ? w.champion
                    : e.rarity === 'rare' ? w.rare
                        : e.rarity === 'magic' ? w.magic : w.normal;
    }
    if (power > 0) {
        if (def.empower.dmgPerPower)
            useMult *= 1 + def.empower.dmgPerPower * power;
        if (def.empower.buffPerPower) {
            caster.addBuff({ ...def.empower.buffPerPower, stacksOnApply: power }, caster.sheet.get('effectDuration', tags, extra));
        }
        sdk.text(vec(caster.pos.x, caster.pos.y - 22), `power ${power}`, def.color, 11);
    }
}
if (def.ultimate && !opts.noRepeat)
    sdk.ultimateFlash(caster, def);
if (def.chrono && !opts.noRepeat) {
    sdk.castChrono(caster, def.chrono, `chrono:${caster.id}:${def.id}`, def.chrono.duration * caster.sheet.get('effectDuration', tags, extra), def.name);
}
{
    const sac = sdk.socketSpec(inst, 'sacrifice');
    if (sac && !opts.noRepeat) {
        let pick2: A | null = null;
        let best = sac.radius;
        for (const m of sdk.actors()) {
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
            sdk.kill(pick2, true);
            const feedingCue = pick2.dead ? sdk.feedingCueFlash(pick2.pos, caster, def.feedingCue, 'ritual', pick2.tier, pick2.radius) : undefined;
            if (feedingCue)
                sdk.flash(feedingCue);
            if (pick2.dead)
                sdk.showSkillArrival(caster, inst, pick2.pos, pick2.radius + 12, pick2.tier, 'sacrifice');
        }
    }
}
if (targetInfo?.actor && !targetInfo.actor.dead
    && (def.delivery.type === 'dash' || def.delivery.type === 'blink'
        || def.delivery.type === 'leap' || def.delivery.type === 'carom')) {
    aim = vec(targetInfo.actor.pos.x, targetInfo.actor.pos.y);
}
if (!opts.keepFacing)
    caster.facing = angleTo(caster.pos, aim);
if (targetInfo?.actor && targetInfo.actor.dead) {
    sdk.failNote(caster, def.id + ':lost', 'target lost');
    return { completed: false };
}
if (targetInfo?.corpse && !state.corpses.includes(targetInfo.corpse)) {
    const fresh = sdk.resolveTargeting(caster, inst, aim);
    if (fresh?.corpse) {
        targetInfo = fresh;
    }
    else {
        sdk.failNote(caster, def.id + ':lost', 'corpse lost');
        return { completed: false };
    }
}
if (!targetInfo && !sdk.instanceCurseField(inst)
    && sdk.instanceTargeting(inst)?.target === 'corpse') {
    targetInfo = sdk.resolveTargeting(caster, inst, aim);
    if (!targetInfo) {
        sdk.failNote(caster, def.id + ':lost', 'corpse lost');
        return { completed: false };
    }
}
if (def.pool) {
    const banked = caster.pools.get(def.pool.id) ?? 0;
    const rel = def.pool.release;
    if (rel.mode === 'vent') {
        if (caster.venting.has(def.pool.id)) {
            caster.venting.delete(def.pool.id);
        }
        else if (banked > 0) {
            caster.venting.add(def.pool.id);
            sdk.showSelfRelease(caster, inst);
        }
    }
    else {
        caster.pools.set(def.pool.id, 0);
        const radius = rel.radius * caster.sheet.get('aoeRadius', tags, extra);
        sdk.burstDamage(vec(caster.pos.x, caster.pos.y), radius, banked * (rel.ratio ?? 1), def.pool.damageType, cosmeticColor, caster.team, caster.tier, undefined, undefined, banked > 0 ? sdk.skillSelfVoice(def.id, 'burst') : undefined);
    }
    return { completed: true };
}
if (def.invokes) {
    const runes = caster.runes;
    const rule = sdk.resolveInvocation(runes);
    if (!rule || !sdk.hasSkill(rule.skillId)) {
        sdk.failNote(caster, def.id + ':norunes', 'no runes woven');
        return { completed: false };
    }
    const count = runes.length;
    const last = runes[runes.length - 1] as string;
    caster.runes = [];
    sdk.showSelfRelease(caster, inst);
    const payload = sdk.invocationPayload(inst, rule.skillId, last);
    sdk.noteProcCue(caster, rule.releaseCue === false ? false : {
        profile: 'rune', color: sdk.runeColor(last) ?? def.color, ...rule.releaseCue,
    }, 'invoke', rule.id, count);
    sdk.executeSkill(caster, payload, aim, {
        dmgMult: (1 + (sdk.instanceInvocation(inst)?.damagePerRune ?? rule.dmgPerRune ?? 0.15) * count) * useMult,
        noCooldown: true, noRepeat: true,
    });
    return { completed: true };
}
if (targetInfo?.actor) {
    for (const ts of sdk.instanceTethers(inst)) {
        if (ts.link === 'target')
            sdk.addTether(caster, targetInfo.actor, ts, inst, caster);
    }
}
if (opts.strikeAngle !== undefined) {
    const reach = Math.max(48, dist(caster.pos, aim));
    aim = vec(caster.pos.x + Math.cos(opts.strikeAngle) * reach, caster.pos.y + Math.sin(opts.strikeAngle) * reach);
    caster.facing = opts.strikeAngle;
}
else {
    const aimSpec = sdk.instanceAim(inst);
    if (aimSpec?.sequence?.steps.length) {
        const seq = aimSpec.sequence;
        const baseAng = angleTo(caster.pos, aim);
        const reach = Math.max(48, dist(caster.pos, aim));
        const pause = Math.max(0.05, seq.pause / caster.speedFactor(inst));
        for (let i = 1; i < seq.steps.length; i++) {
            state.pendingSteps.push({
                caster, inst, aim: vec(aim.x, aim.y),
                angle: baseAng + seq.steps[i] * Math.PI / 180,
                timer: pause * i,
                dmgMult: useMult, aoeMult: opts.aoeMult ?? 1,
                paidCost: opts.paidCost,
            });
        }
        const a0 = baseAng + seq.steps[0] * Math.PI / 180;
        aim = vec(caster.pos.x + Math.cos(a0) * reach, caster.pos.y + Math.sin(a0) * reach);
        caster.facing = a0;
    }
    else if (aimSpec?.random) {
        const baseAng = angleTo(caster.pos, aim);
        const reach = Math.max(48, dist(caster.pos, aim));
        const spread = Math.min(Math.PI * 2, (aimSpec.random.spreadDeg * Math.PI / 180)
            * caster.sheet.get('randomArc', tags, extra));
        const ang = baseAng + (aimSpec.random.offsetDeg ?? 0) * Math.PI / 180
            + rand(-spread / 2, spread / 2);
        aim = vec(caster.pos.x + Math.cos(ang) * reach, caster.pos.y + Math.sin(ang) * reach);
        caster.facing = ang;
    }
}
const ventRounds = opts.ventRounds ?? 0;
const ventCounts = def.delivery.type === 'storm' || def.delivery.type === 'projectile';
const repeats = Math.max(1, opts.repeat ?? 1) + (ventCounts ? 0 : ventRounds);
if (repeats > 1) {
    const dv = def.delivery.type;
    if (dv === 'blink' || dv === 'dash' || dv === 'leap' || dv === 'carom') {
        state.pendingRepeats.push({
            caster, inst, aim: vec(aim.x, aim.y),
            n: repeats - 1, k: 1, timer: 0.16, interval: 0.16,
            dmgMult: useMult, aoeMult: opts.aoeMult ?? 1,
            scaleStep: caster.sheet.get('repeatScale', tags, extra),
            retarget: caster.sheet.get('repeatRetarget', tags, extra) > 0,
        });
        return { completed: sdk.executeSkill(caster, inst, aim, { ...opts, repeat: 1, ventRounds: ventCounts ? opts.ventRounds : 0 }) };
    }
    let ok = true;
    for (let i = 0; i < repeats; i++) {
        ok = sdk.executeSkill(caster, inst, aim, { ...opts, repeat: 1, noCooldown: i > 0 || opts.noCooldown, ventRounds: ventCounts ? opts.ventRounds : 0 }) && ok;
    }
    return { completed: ok };
}
let flatBonus: Partial<Record<string, number>> | undefined;
let corpseFeast = 0;
const targetSpec = sdk.instanceTargeting(inst);
if (targetInfo && targetSpec) {
    const t = targetSpec;
    if (targetInfo.corpse) {
        const feast = (targetInfo.corpses ?? [targetInfo.corpse])
            .filter(c => state.corpses.includes(c));
        if (t.corpseLifeDamage) {
            let fuel = 0;
            for (const c of feast)
                fuel += c.maxLife * t.corpseLifeDamage;
            flatBonus = { fire: fuel };
        }
        if (t.consumesCorpse !== false && def.delivery.type !== 'summon') {
            for (const c of feast)
                sdk.removeCorpse(c);
            for (const c of feast)
                sdk.showSkillArrival(caster, inst, c.pos, 28, c.tier ?? sdk.spoilStoryAt(c.pos), true);
            corpseFeast = Math.max(0, feast.length - 1);
            if (t.corpseLifeRestore) {
                const rr = t.corpseLifeRestore;
                let meat = 0;
                for (const c of feast)
                    meat += c.maxLife;
                if (rr.life)
                    sdk.applyRestore(caster, { resource: 'life', amount: meat * rr.life }, { tags: def.tags, feedingCue: def.feedingCue });
                if (rr.mana)
                    sdk.applyRestore(caster, { resource: 'mana', amount: meat * rr.mana }, { tags: def.tags, feedingCue: def.feedingCue });
                for (const corpse of feast) {
                    const feedingCue = sdk.feedingCueFlash(corpse.pos, caster, def.feedingCue, 'flesh', corpse.tier);
                    if (feedingCue)
                        sdk.flash(feedingCue);
                }
            }
            sdk.corpseSpawn(caster, inst, targetInfo.corpse.pos, feast.length);
        }
    }
    if (targetInfo.actor && t.requiresStatus && t.consumesStatus) {
        const reqs = sdk.statusReqs(t.requiresStatus)!;
        let payload = 0;
        for (let i = targetInfo.actor.statuses.length - 1; i >= 0; i--) {
            const s = targetInfo.actor.statuses[i];
            if (!reqs.includes(s.id))
                continue;
            payload += s.dps * s.stacks * Math.max(0, s.remaining);
            targetInfo.actor.statuses.splice(i, 1);
            targetInfo.actor.sheet.removeSource('status:' + s.id);
        }
        if (payload > 0) {
            flatBonus = { ...(flatBonus ?? {}), physical: (flatBonus?.physical ?? 0) + payload };
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
        flatBonus = { ...(flatBonus ?? {}), physical: (flatBonus?.physical ?? 0) + reap };
    }
}
if (opts.paidCost) {
    const perMana = caster.sheet.get('costDamage_mana', tags, extra);
    const perLife = caster.sheet.get('costDamage_life', tags, extra);
    const total = (opts.paidCost.mana * perMana + opts.paidCost.life * perLife)
        * (def.addedEffectiveness ?? 1);
    if (total > 0) {
        flatBonus = { ...(flatBonus ?? {}) };
        const entries = Object.entries(def.baseDamage ?? {}) as [
            string,
            [
                number,
                number
            ]
        ][];
        let mass = 0;
        for (const [, r] of entries)
            mass += (r[0] + r[1]) / 2;
        if (mass > 0) {
            for (const [k, r] of entries) {
                flatBonus[k] = (flatBonus[k] ?? 0) + total * ((r[0] + r[1]) / 2 / mass);
            }
        }
        else {
            flatBonus.physical = (flatBonus.physical ?? 0) + total;
        }
    }
}
const origin = targetInfo?.pos ?? caster.pos;
if (!opts.noCooldown && !sdk.instanceUseCharges(inst)?.magazine
    && def.cooldownAt !== 'press') {
    sdk.stampSkillCooldown(caster, inst, def.cooldown);
}
sdk.guardCast(caster, inst);
if (opts.primed) {
    caster.primedPours.push({ skillId: def.id, chargesSpent: opts.chargesSpent ?? 0, aim: vec(aim.x, aim.y) });
    const payloadCues = sdk.payloadTransition(caster, inst, 'prime');
    if (payloadCues)
        sdk.flash(payloadCues);
    return { completed: true };
}
const d = sdk.instanceDelivery(inst);
let aoeScale = caster.sheet.get('aoeRadius', tags, extra) * (opts.aoeMult ?? 1);
if (corpseFeast > 0)
    aoeScale *= 1 + rules.corpseAreaPerExtra * corpseFeast;
{
    const vAoe = sdk.instanceVariance(inst)?.aoe;
    if (vAoe)
        aoeScale *= rand(vAoe[0], vAoe[1]);
}
const arcScale = caster.sheet.get('swingArc', tags, extra) * (opts.arcMult ?? 1);
let fieldAt: CombatPoint | null = null;
{
    const lash = sdk.socketSpec(inst, 'meleeFissure');
    if (lash && (!opts.noRepeat || opts.componentUse) && chance(lash.chance)) {
        const lashD: GroundDeliverySpec = {
            type: 'ground', radius: lash.radius, castRange: 0,
            lingerDuration: lash.linger, tickInterval: lash.tickInterval ?? 0.5,
            fissure: { length: lash.length, speed: lash.speed, close: lash.close },
        };
        sdk.layFissure(caster, inst, vec(caster.pos.x, caster.pos.y), caster.facing, lashD, useMult * lash.damageScale, flatBonus, Math.round(caster.sheet.get('fissureBranches', tags, extra)));
    }
}
{
    const cf = sdk.instanceCurseField(inst);
    if (cf && tags.has('curse')) {
        const cfRadius = cf.radius * aoeScale;
        const cfTick = cf.tickInterval ?? 0.7;
        const cfMult = (cf.damageScale ?? 0.5) * useMult;
        if (cf.mode === 'follow') {
            const reserve = (cf.reservePct ?? 0.25) * caster.maxMana();
            if (caster.reservedMana + reserve > caster.maxMana()) {
                sdk.failNote(caster, def.id + ':reserve', 'cannot sustain');
                return { completed: false };
            }
            caster.reservedMana += reserve;
            caster.mana = Math.min(caster.mana, caster.availableMaxMana());
            state.zones.push({
                pos: vec(caster.pos.x, caster.pos.y), radius: cfRadius,
                caster, inst, color: cosmeticColor,
                delay: 0, exploded: true,
                linger: 1, tickInterval: cfTick, tickTimer: 0,
                shape: 0, facing: caster.facing,
                dmgMult: cfMult, depth: 1,
                follow: true, toggled: true, reserved: reserve,
                madden: sdk.maddenBankOf(inst),
                flatBonus,
            });
        }
        else {
            for (let zi = state.zones.length - 1; zi >= 0; zi--) {
                const z = state.zones[zi];
                if (z.caster === caster && z.inst.def.id === def.id) {
                    sdk.expireZone(z);
                    state.zones.splice(zi, 1);
                }
            }
            const reach = sdk.instanceTargeting(inst)?.castRange ?? 460;
            const dd = Math.min(dist(caster.pos, aim), reach);
            const at = sdk.clampPos(vec(caster.pos.x + Math.cos(caster.facing) * dd, caster.pos.y + Math.sin(caster.facing) * dd), 10);
            state.zones.push({
                pos: at, radius: cfRadius,
                caster, inst, color: cosmeticColor,
                delay: 0, exploded: true,
                linger: (cf.duration ?? 10) * caster.sheet.get('effectDuration', tags, extra),
                tickInterval: cfTick, tickTimer: 0,
                shape: 0, facing: caster.facing,
                dmgMult: cfMult, depth: 1,
                madden: sdk.maddenBankOf(inst),
                flatBonus,
            });
            fieldAt = at;
        }
        const fieldCueZone = state.zones[state.zones.length - 1];
        if (def.fieldCue !== false) {
            fieldCueZone.fieldCue = def.fieldCue ?? {};
            fieldCueZone.tier = caster.tier ?? 0;
            sdk.flash({ ...sdk.combatCueFlash(fieldCueZone.pos, fieldCueZone.fieldCue.form ?? 'field_form', fieldCueZone.radius, 0, def.fieldCue?.color ?? cosmeticColor), recoveryCueTier: fieldCueZone.tier });
        }
        return { completed: true };
    }
}
if (cosmeticPaint.motif)
    sdk.flash({
        pos: { ...caster.pos }, radius: caster.radius * rules.cosmetic.radiusScale, color: cosmeticColor,
        life: rules.cosmetic.lifetime, maxLife: rules.cosmetic.lifetime, cosmeticMotif: cosmeticPaint.motif,
    });
return {caster,inst,aim,opts,targetInfo,origin,d,tags,extra,useMult,gPow,ventRounds,corpseFeast,flatBonus,aoeScale,arcScale,cosmeticColor,fieldAt};
}
}
