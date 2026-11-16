// Mechanically extracted ground and storm placement; see the extraction manifest.
import {dist,angleTo,AOE_SHAPE,type CombatPoint} from './combat-geometry.js';
import {flattenPulseQueue,resolveSizeOver,type CombatField,type GroundCascadeSpec} from './combat-fields.js';
import {rollDeliveryCount} from './projectile-delivery.js';
import type {FieldDeliveryActor,FieldDeliverySkill,FieldDeliveryPorts,FieldDeliveryState,FieldDeliveryRules,FieldDeliveryFrame,GroundDeliverySpec,StormDeliverySpec} from './field-delivery-types.js';
export type * from './field-delivery-types.js';
const vec=(x:number,y:number):CombatPoint=>({x,y});
export class FieldDeliveries<A extends FieldDeliveryActor<I>,I extends FieldDeliverySkill,F,B extends {onHit?:boolean},G>{
constructor(readonly state:FieldDeliveryState<A,I,F,B>,readonly rules:FieldDeliveryRules,readonly ports:FieldDeliveryPorts<A,I,F,B,G>&{flash(value:{pos:CombatPoint;radius:number;color:string;life:number;maxLife:number;edgeFrac:number}):void}){}
ground(frame:FieldDeliveryFrame<A,I,F,GroundDeliverySpec>):CombatPoint|null{
const {ports:sdk,state,rules}=this,{caster,inst,d,aim,tags,extra,useMult,flatBonus,aoeScale,arcScale,cosmeticColor}=frame;const def=inst.def;let fieldAt:CombatPoint|null=null;
const rand=(min:number,max:number)=>min+sdk.random()*(max-min);
const at = sdk.clampGroundTarget(caster, aim, d, inst);
for (const fx of sdk.instanceEffects(inst)) {
    if (fx.type === 'kindle') {
        sdk.plantKindle(caster, fx.kind, at, aoeScale, caster.sheet.get('effectDuration', tags, extra));
        continue;
    }
    if (fx.type === 'vent') {
        sdk.plantVent(fx, at, aoeScale, caster.sheet.get('effectDuration', tags, extra), caster.tier);
        continue;
    }
    if (fx.type === 'conjure') {
        const cr = fx.radius * aoeScale;
        const cd = fx.duration * caster.sheet.get('effectDuration', tags, extra);
        const conjOpts = {
            caster,
            grants: sdk.conjureGrantsFor(caster, tags, extra, fx.grants),
            ...(fx.look !== undefined ? { look: fx.look } : {}),
            ...(fx.follow ? { follow: true } : {}),
        };
        if (fx.line) {
            const ldx = at.x - caster.pos.x, ldy = at.y - caster.pos.y;
            const len = Math.hypot(ldx, ldy);
            const lstep = Math.max(1, cr * rules.conjure.lineStep);
            const hops = Math.min(rules.conjure.lineMaxHops, Math.max(1, Math.round(len / lstep)));
            for (let h = 1; h <= hops; h++) {
                sdk.conjureCloud(caster.pos.x + (ldx * h) / hops, caster.pos.y + (ldy * h) / hops, cr, cd, conjOpts);
            }
        }
        else {
            sdk.conjureCloud(at.x, at.y, cr, cd, conjOpts);
        }
    }
}
{
    const gb = sdk.instanceBirth(inst);
    if (gb && !gb.onHit)
        sdk.birthAt(caster, inst, gb, at);
}
const isCurse = def.tags.includes('curse');
const curseAllies = isCurse && caster.sheet.get('hedonism', tags, extra) > 0;
if (d.exclusive) {
    for (let zi = state.zones.length - 1; zi >= 0; zi--) {
        const z = state.zones[zi];
        if (z.caster === caster && z.inst.def.id === def.id) {
            sdk.expireZone(z);
            state.zones.splice(zi, 1);
        }
    }
}
let zoneAnchor: A | undefined;
const turret = sdk.instanceTurret(inst);
if (turret && (d.lingerDuration ?? 0) > 0 && sdk.hasSkill(turret.castSkillId)) {
    const turretCast = sdk.makeSkill(turret.castSkillId, sdk.effectiveSkillLevel(inst));
    sdk.forwardSummonSockets(inst, [turretCast], {
        scale: rules.forwarding.scale['totem'] ?? rules.forwarding.scaleDefault,
    });
    const built = sdk.spawnConstruct(caster, inst, {
        type: 'construct', kind: 'totem',
        range: d.radius * aoeScale,
        duration: d.lingerDuration ?? 6, maxActive: 1,
        life: turret.life ?? 45, placeRange: 0,
        look: turret.look,
    }, caster.pos, turretCast, vec(caster.pos.x, caster.pos.y));
    if (built) {
        zoneAnchor = built;
        at.x = built.pos.x;
        at.y = built.pos.y;
    }
}
if (d.fissure) {
    const fans = 1 + Math.round(caster.sheet.get('fissureCount', tags, extra));
    const fanSpread = Math.PI / 5;
    const baseAng = dist(caster.pos, at) < 1 ? caster.facing : angleTo(caster.pos, at);
    const from = dist(caster.pos, at) < 1 ? vec(caster.pos.x, caster.pos.y) : at;
    for (let f = 0; f < fans; f++) {
        const off = fans === 1 ? 0 : (f / (fans - 1) - 0.5) * fanSpread * (fans - 1);
        sdk.layFissure(caster, inst, from, baseAng + off, d, useMult, flatBonus, Math.round(caster.sheet.get('fissureBranches', tags, extra, d.fissure.branches ?? 0)), f);
    }
    fieldAt = at;
    return fieldAt;
}
const groundShape = caster.sheet.get('aoeShape', tags, extra, AOE_SHAPE[d.shape ?? 'circle']);
const cadence = sdk.socketSpec(inst, 'cadence')?.intervalStep;
const pPlan = sdk.instancePulsePlan(inst);
const pSpec = pPlan.native;
const pulseN = Math.max(0, (pSpec ? (pSpec.count ?? 1) : 0)
    + Math.round(caster.sheet.get('pulseCount', tags, extra)));
const pDelay = pSpec?.delay ?? 1;
const pInterval = pSpec?.interval ?? pDelay;
const pStep = cadence ?? pSpec?.intervalStep ?? 1;
const pQueue = flattenPulseQueue(pPlan.appended, cadence);
const mintPulse = (telegraph: number): CombatField<A, I, F, B>['pulse'] => pulseN > 0
    ? {
        delay: pDelay, interval: pInterval, intervalStep: pStep,
        dmgMult: pSpec?.dmgMult ?? 1, dmgStep: pSpec?.dmgStep ?? 1,
        radiusMult: pSpec?.radiusMult ?? 1, radiusStep: pSpec?.radiusStep ?? 1,
        left: pulseN, next: sdk.time() + Math.max(0, telegraph) + pDelay,
        queue: pQueue.length ? [...pQueue] : undefined,
    } : undefined;
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
const pulseLinger = (secs: number): number => Math.max(secs, pulseSpan);
const ownLinger = (d.lingerDuration ?? 0) > 0;
const groundTick = ownLinger || pulseN === 0 ? (d.tickInterval ?? 0.5) : Infinity;
const groundTick0 = ownLinger || pulseN === 0 ? 0 : Infinity;
const expGraft = sdk.socketSpec(inst, 'exposure');
const expAfter = expGraft?.after ?? d.exposure;
const expDomain = (expGraft ? expGraft.domain : d.exposureDomain) ? true as const : undefined;
const mintExposure = (): CombatField<A, I, F, B>['exposure'] => expAfter ? { after: expAfter, dwell: new Map<number, number>() } : undefined;
const maddenBank = sdk.maddenBankOf(inst);
const sizeOver = resolveSizeOver(sdk.instanceSizeOver(inst));
if (d.line) {
    const pts: CombatPoint[] = [];
    const n = d.line.segments;
    if (groundShape >= 1) {
        const R = (d.line.spacing * n) / (Math.PI * 2) * 1.45;
        for (let i = 0; i < n; i++) {
            const ang = caster.facing + (i / n) * Math.PI * 2;
            let r: number;
            if (groundShape >= 2) {
                const rel = ((ang - caster.facing) % (Math.PI * 2 / 3) + Math.PI * 2 / 3) % (Math.PI * 2 / 3);
                r = (R * 0.5) / Math.max(0.2, Math.cos(rel - Math.PI / 3));
            }
            else {
                r = R / Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)));
            }
            pts.push(vec(at.x + Math.cos(ang) * r, at.y + Math.sin(ang) * r));
        }
    }
    else {
        const perp = caster.facing + Math.PI / 2;
        for (let i = 0; i < n; i++) {
            const off = (i - (n - 1) / 2) * d.line.spacing;
            pts.push(vec(at.x + Math.cos(perp) * off, at.y + Math.sin(perp) * off));
        }
    }
    for (const pt of pts) {
        state.zones.push({
            pos: sdk.clampPos(pt, 10), radius: d.radius * aoeScale * (sizeOver?.from ?? 1),
            caster, inst, color: cosmeticColor,
            delay: d.delay ?? 0, exploded: (d.delay ?? 0) <= 0,
            impactDress: d.impactDress,
            linger: pulseLinger((d.lingerDuration ?? 0) * caster.sheet.get('effectDuration', tags, extra)),
            linger0: pulseLinger((d.lingerDuration ?? 0) * caster.sheet.get('effectDuration', tags, extra)),
            tickInterval: groundTick, tickTimer: groundTick0,
            shape: 0, facing: caster.facing,
            dmgMult: useMult, depth: 0,
            curseAllies,
            struck: d.hitOnce ? new Set() : undefined,
            rearm: d.rearmOnExit || undefined,
            pulse: mintPulse(d.delay ?? 0),
            exposure: mintExposure(),
            madden: maddenBank,
            sizeOver,
            radius0: sizeOver ? d.radius * aoeScale : undefined,
            flatBonus,
        });
    }
    fieldAt = at;
    return fieldAt;
}
if (d.marker) {
    const cap = Math.max(1, d.marker.cap
        + Math.round(caster.sheet.get('stormCount', tags, extra)));
    const mine = state.zones.filter(z => z.caster === caster && z.inst.def.id === def.id && z.marker && !z.exploded);
    while (mine.length >= cap) {
        const oldest = mine.shift()!;
        const zi = state.zones.indexOf(oldest);
        if (zi !== -1) {
            sdk.expireZone(oldest);
            state.zones.splice(zi, 1);
        }
    }
}
const fillTime = d.fillTime ?? (d.lingerDuration ?? 1);
state.zones.push({
    pos: at, radius: d.radius * aoeScale * (sizeOver?.from ?? 1),
    caster, inst, color: cosmeticColor,
    marker: d.marker ? true : undefined,
    delay: d.delay ?? 0, exploded: !!d.noImpact,
    impactDress: d.impactDress,
    linger: pulseLinger((d.lingerDuration ?? 0) * caster.sheet.get('effectDuration', tags, extra)),
    tickInterval: groundTick, tickTimer: groundTick0,
    shape: groundShape,
    facing: caster.facing,
    dmgMult: useMult, depth: 0,
    curseAllies,
    pulse: mintPulse(d.delay ?? 0),
    exposure: mintExposure(),
    exposureDomain: expDomain,
    pull: d.pull,
    pullRadius: d.pullRadius ? d.pullRadius * aoeScale : undefined,
    drift: d.drift,
    grow: d.grow ?? sdk.socketSpec(inst, 'zoneGrow'),
    sizeOver,
    radius0: sizeOver ? d.radius * aoeScale : undefined,
    rotate: (() => {
        const r = caster.sheet.get('aoeSpin', tags, extra, d.rotate ?? 0);
        return r !== 0 ? r : undefined;
    })(),
    follow: d.follow || (sdk.socketSpec(inst, 'zoneFollow') ? true : undefined),
    retract: d.retract,
    seek: d.seek ? { speed: d.seek.speed, range: d.seek.range ?? 420 } : undefined,
    madden: maddenBank,
    endBurst: d.endBurst,
    pendulum: (() => {
        const ps = sdk.hostSockets(inst).find(s => s.def.pendulum)?.def.pendulum ?? d.pendulum;
        return ps
            ? { arc: ps.arcDeg * Math.PI / 180, period: ps.period, base: caster.facing }
            : undefined;
    })(),
    sweep: d.sweep
        ? (d.sweep.converge
            ? {
                arc: (d.sweep.arcDeg / 2) * Math.PI / 180,
                base: caster.facing - (d.sweep.arcDeg / 4) * Math.PI / 180,
            }
            : { arc: d.sweep.arcDeg * Math.PI / 180, base: caster.facing })
        : undefined,
    linger0: pulseLinger((d.lingerDuration ?? 0) * caster.sheet.get('effectDuration', tags, extra)),
    leaveTerrain: d.leaveTerrain,
    edge: d.fillFrom,
    fillRate: d.fillFrom ? d.fillFrom / Math.max(0.2, fillTime) : undefined,
    emit: d.emit ?? (() => {
        const ze = sdk.socketSpec(inst, 'zoneEmit');
        return ze ? { skillId: ze.skillId, interval: ze.interval, at: ze.at } : undefined;
    })(),
    emitStep: cadence ?? d.emit?.intervalStep,
    domain: d.domain,
    domainKey: d.domain ? `domain:${state.domainSeq++}` : undefined,
    arcRad: d.arcDeg !== undefined
        ? (d.arcDeg * Math.PI / 180) * Math.sqrt(aoeScale) * arcScale
        : undefined,
    struck: d.hitOnce ? new Set() : undefined,
    rearm: d.rearmOnExit || undefined,
    anchor: zoneAnchor,
    flatBonus,
});
const prime = state.zones[state.zones.length - 1];
if (d.sweep?.converge) {
    state.zones.push({
        ...prime,
        pos: vec(prime.pos.x, prime.pos.y),
        sweep: {
            arc: -((d.sweep.arcDeg / 2) * Math.PI / 180),
            base: caster.facing + (d.sweep.arcDeg / 4) * Math.PI / 180,
        },
        struck: d.hitOnce ? new Set() : undefined,
        emit: undefined, emitTimer: undefined, emitInst: undefined,
        emitInterval: undefined, emitStep: undefined,
        domain: undefined, domainKey: undefined, domainAffected: undefined,
        exposureDomain: undefined,
        marker: undefined, onImpact: undefined,
        madden: maddenBank,
        pulse: mintPulse(d.delay ?? 0),
        exposure: mintExposure(),
    });
}
{
    const plan = sdk.instanceCascadePlan(inst, 'axis');
    const extraCasc = Math.round(caster.sheet.get('aoeCascade', tags, extra));
    const nativeCount = (plan.native?.count ?? 0) + extraCasc;
    const axisAng = dist(caster.pos, at) < 1 ? caster.facing : angleTo(caster.pos, at);
    const stepScale = caster.sheet.get('cascadeStep', tags, extra);
    const walkPoints = (spec: GroundCascadeSpec | undefined, count: number, from: CombatPoint): {
        x: number;
        y: number;
        beatAt: number;
        k: number;
    }[] => {
        const pts: {
            x: number;
            y: number;
            beatAt: number;
            k: number;
        }[] = [];
        if (count <= 0)
            return pts;
        const dir = spec?.dir ?? 'axis';
        const stepLen = (spec?.step ?? d.radius * 1.4) * stepScale;
        const beatStep = cadence ?? spec?.intervalStep ?? 1;
        let beatAt = 0;
        let beatGap = spec?.interval ?? 0;
        for (let k = 1; k <= count; k++) {
            beatAt += beatGap;
            beatGap = Math.max(0.02, beatGap * beatStep);
            if (dir === 'random') {
                const ra = rand(0, Math.PI * 2);
                const rd = stepLen * rand(0.5, 1.5);
                pts.push({ x: from.x + Math.cos(ra) * rd, y: from.y + Math.sin(ra) * rd, beatAt, k });
            }
            else {
                const sign = dir === 'forward' ? 1 : dir === 'backward' ? -1
                    : (k % 2 === 1 ? 1 : -1);
                const reach = dir === 'axis' ? Math.ceil(k / 2) * stepLen : k * stepLen;
                pts.push({
                    x: from.x + Math.cos(axisAng) * reach * sign,
                    y: from.y + Math.sin(axisAng) * reach * sign, beatAt, k,
                });
            }
        }
        return pts;
    };
    const mintMarch = (from: CombatPoint, baseMult: number, delayBase: number): void => {
        const spec = plan.native;
        const scaleStep = spec?.scaleStep ?? 1;
        const dmgStep = spec?.dmgStep ?? 0.75;
        for (const p of walkPoints(spec, nativeCount, from)) {
            state.zones.push({
                pos: vec(p.x, p.y),
                radius: d.radius * aoeScale * Math.pow(scaleStep, p.k) * (sizeOver?.from ?? 1),
                caster, inst, color: cosmeticColor,
                delay: delayBase + p.beatAt, exploded: false,
                linger: pulseLinger((d.lingerDuration ?? 0) * caster.sheet.get('effectDuration', tags, extra)),
                linger0: pulseLinger((d.lingerDuration ?? 0) * caster.sheet.get('effectDuration', tags, extra)),
                tickInterval: groundTick, tickTimer: groundTick0,
                shape: groundShape,
                facing: axisAng,
                dmgMult: baseMult * Math.pow(dmgStep, p.k), depth: 0,
                curseAllies,
                pull: d.pull,
                drift: d.drift,
                grow: d.grow ?? sdk.socketSpec(inst, 'zoneGrow'),
                sizeOver,
                radius0: sizeOver ? d.radius * aoeScale * Math.pow(scaleStep, p.k) : undefined,
                pulse: mintPulse(delayBase + p.beatAt),
                exposure: mintExposure(),
                madden: maddenBank,
                arcRad: d.arcDeg !== undefined
                    ? (d.arcDeg * Math.PI / 180) * Math.sqrt(aoeScale) * arcScale
                    : undefined,
                struck: d.hitOnce ? new Set() : undefined,
                flatBonus,
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
            state.zones.push({
                ...prime,
                pos: vec(p.x, p.y),
                radius: prime.radius * scale,
                radius0: prime.radius0 !== undefined ? prime.radius0 * scale : undefined,
                delay: delayBase, exploded: !!d.noImpact,
                linger: prime.linger0 ?? prime.linger,
                linger0: prime.linger0,
                tickInterval: groundTick, tickTimer: groundTick0,
                dmgMult: mult,
                struck: d.hitOnce ? new Set() : undefined,
                madden: maddenBank,
                exposure: mintExposure(),
                pulse: mintPulse(delayBase),
                emit: undefined, emitTimer: undefined, emitInst: undefined,
                emitInterval: undefined, emitStep: undefined,
                domain: undefined, domainKey: undefined, domainAffected: undefined,
                exposureDomain: undefined,
                marker: undefined, onImpact: undefined,
            });
            mintMarch(vec(p.x, p.y), mult, delayBase);
        }
    }
}
const hex = caster.sheet.get('hexBlast', tags, extra);
if (isCurse && hex > 0) {
    state.zones.push({
        pos: vec(at.x, at.y), radius: d.radius * aoeScale,
        caster, inst, color: '#b06bd4',
        delay: (d.delay ?? 0) + 0.9, exploded: false,
        linger: 0, tickInterval: 0.5, tickTimer: 0,
        shape: caster.sheet.get('aoeShape', tags, extra),
        facing: caster.facing,
        dmgMult: hex * useMult, depth: 1,
        forceDamage: true,
    });
}
fieldAt = at;
return fieldAt;
}
storm(frame:FieldDeliveryFrame<A,I,F,StormDeliverySpec>):CombatPoint|null{
const {ports:sdk,state}=this,{caster,inst,d,aim,tags,extra,useMult,flatBonus,aoeScale,cosmeticColor,ventRounds,gPow}=frame;const def=inst.def;let fieldAt:CombatPoint|null=null;
const rand=(min:number,max:number)=>min+sdk.random()*(max-min);
const rollCount=(spec:number|readonly[number,number],bonus:number)=>rollDeliveryCount(spec,bonus,()=>sdk.random());
const wantAt = dist(caster.pos, aim) <= d.castRange ? vec(aim.x, aim.y)
    : vec(caster.pos.x + Math.cos(caster.facing) * d.castRange, caster.pos.y + Math.sin(caster.facing) * d.castRange);
const at = sdk.clampPos(sdk.skillOcclusion(caster, inst) === 'blocked'
    ? sdk.clipShot(caster.pos, wantAt, caster.tier) : wantAt, 10);
const strikes = Math.max(1, Math.round(rollCount(d.count, Math.round(caster.sheet.get('stormCount', tags, extra)) + ventRounds) * gPow));
const immFrac = d.interval <= 0 ? 1 : caster.sheet.get('stormImmediate', tags, extra);
const immCount = Math.round(strikes * immFrac);
const shape = caster.sheet.get('aoeShape', tags, extra);
const fuse = d.telegraph ?? 0;
if (fuse > 0) {
    sdk.flash({
        pos: vec(at.x, at.y), radius: d.areaRadius * aoeScale,
        color: cosmeticColor, life: fuse, maxLife: fuse, edgeFrac: 0.94,
    });
}
const sVar = d.scatter ?? 0;
const under: CombatPoint[] = d.atEnemies
    ? sdk.enemiesOf(caster)
        .filter(e => dist(at, e.pos) <= d.areaRadius * aoeScale)
        .sort((e1, e2) => dist(at, e1.pos) - dist(at, e2.pos))
        .slice(0, strikes)
        .map(e => vec(e.pos.x + rand(-sVar, sVar), e.pos.y + rand(-sVar, sVar)))
    : [];
const arming = d.awaitRelease !== undefined
    && caster.casting?.mode === 'channel'
    && caster.casting.inst.def.id === def.id;
const stCad = sdk.socketSpec(inst, 'cadence')?.intervalStep;
const stPlan = sdk.instancePulsePlan(inst);
const stSpec = stPlan.native;
const stN = Math.max(0, (stSpec ? (stSpec.count ?? 1) : 0)
    + Math.round(caster.sheet.get('pulseCount', tags, extra)));
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
    const b = sdk.instanceBirth(inst);
    return b && !b.onHit ? b : undefined;
})();
for (let i = 0; i < strikes; i++) {
    const ang = rand(0, Math.PI * 2);
    const r = Math.sqrt(sdk.random()) * d.areaRadius * aoeScale;
    const zDelay = arming ? 9999
        : fuse + (i < immCount ? rand(0.15, 0.3) : 0.3 + (i - immCount) * d.interval);
    state.zones.push({
        pos: sdk.clampPos(i < under.length
            ? vec(under[i].x, under[i].y)
            : vec(at.x + Math.cos(ang) * r, at.y + Math.sin(ang) * r), 10),
        radius: d.hitRadius * aoeScale,
        caster, inst, color: cosmeticColor,
        delay: zDelay,
        hitAll: d.sky || undefined,
        spareDormant: d.sky || undefined,
        spareRoofed: d.sky || undefined,
        lobFrom: d.lob && !arming ? vec(caster.pos.x, caster.pos.y) : undefined,
        lobArc: d.lob?.arc,
        delay0: !arming ? zDelay : undefined,
        impactDress: d.impactDress,
        birth: strikeBirth,
        fx: sdk.skillPresenceVoice(def.id, 'pulse') ?? d.fx,
        onGround: d.onGround,
        armed: arming || undefined,
        armSeq: arming ? state.sparkSeq++ : undefined,
        exploded: false,
        linger: stN > 0 ? stSpan : 0,
        tickInterval: stN > 0 ? Infinity : 0.5,
        tickTimer: stN > 0 ? Infinity : 0,
        shape, facing: ang,
        dmgMult: useMult, depth: 0,
        flatBonus,
        pulse: stN > 0
            ? {
                delay: stDelay, interval: stInterval, intervalStep: stStep,
                dmgMult: stSpec?.dmgMult ?? 1, dmgStep: stSpec?.dmgStep ?? 1,
                radiusMult: stSpec?.radiusMult ?? 1, radiusStep: stSpec?.radiusStep ?? 1,
                left: stN, next: 0,
                queue: stQueue.length ? [...stQueue] : undefined,
            } : undefined,
    });
}
fieldAt = at;
return fieldAt;
}
}
