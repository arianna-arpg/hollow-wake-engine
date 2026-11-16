// Original secondary fields, trails, movement bursts and ground targeting.
import {dist,angleTo,type CombatPoint} from './combat-geometry.js';import type {Modifier} from './types.js';
import {flattenPulseQueue,resolveSizeOver,type CombatField,type GroundCascadeSpec} from './combat-fields.js';
import type {AftermathFieldActor,AftermathFieldSkill,AftermathFieldPorts,AftermathFieldState,GroundDeliverySpec,DropZoneSpec} from './field-aftermath-types.js';
export type * from './field-aftermath-types.js';const vec=(x:number,y:number):CombatPoint=>({x,y});const sameStory=(a:{tier:number},b:{tier:number})=>(a.tier??0)===(b.tier??0);
export class FieldAftermath<A extends AftermathFieldActor,I extends AftermathFieldSkill,F,B>{
constructor(readonly state:AftermathFieldState<A,I,F,B>,readonly ports:AftermathFieldPorts<A,I,F,B>){}
mintAftermath(caster: A, inst: I, at: CombatPoint, radius: number, shape: number, facing: number, useMult: number, tags: Set<string>, extra: Modifier[], arcRad?: number, edgeFrac?: number, walkFacing?: number): void {
const {ports:sdk,state}=this;
const rand=(min:number,max:number)=>min+sdk.random()*(max-min);

    const burstDelivery = sdk.instanceDelivery(inst);
    const burstVoice = burstDelivery.type === 'nova'
        ? burstDelivery.fx ?? sdk.skillBurstVoice(inst.def.id)
        : burstDelivery.type === 'melee' ? burstDelivery.fx ?? sdk.skillStrikeVoice(inst.def.id)
            : burstDelivery.type === 'cone' ? sdk.skillStrikeVoice(inst.def.id)
                : burstDelivery.type === 'leap' ? sdk.skillMovementVoice(inst.def.id, 'impact')
                    : burstDelivery.type === 'storm' ? sdk.skillPresenceVoice(inst.def.id, 'pulse') ?? burstDelivery.fx : undefined;
    const cadence = sdk.socketSpec(inst, 'cadence')?.intervalStep;
    const pPlan = sdk.instancePulsePlan(inst);
    const pSpec = pPlan.native;
    const pulseN = Math.max(0, (pSpec ? (pSpec.count ?? 1) : 0)
        + Math.round(caster.sheet.get('pulseCount', tags, extra)));
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
    const pulseFor = (extraDelay: number): CombatField<A, I, F, B>['pulse'] => pulseN > 0
        ? {
            delay: pDelay, interval: pInterval, intervalStep: pStep,
            dmgMult: pSpec?.dmgMult ?? 1, dmgStep: pSpec?.dmgStep ?? 1,
            radiusMult: pSpec?.radiusMult ?? 1, radiusStep: pSpec?.radiusStep ?? 1,
            left: pulseN, next: sdk.time() + extraDelay + pDelay,
            queue: pQueue.length ? [...pQueue] : undefined,
        } : undefined;
    if (pulseN > 0) {
        state.zones.push({
            pos: vec(at.x, at.y), radius, caster, inst, color: inst.def.color,
            delay: 0, exploded: true,
            linger: pulseSpan, linger0: pulseSpan,
            tickInterval: Infinity, tickTimer: Infinity,
            shape, facing, arcRad, edgeFrac,
            fx: burstVoice,
            dmgMult: useMult, depth: 0,
            pulse: pulseFor(0),
        });
    }
    const plan = sdk.instanceCascadePlan(inst, 'forward');
    const nativeCount = (plan.native?.count ?? 0)
        + Math.round(caster.sheet.get('aoeCascade', tags, extra));
    const stepScale = caster.sheet.get('cascadeStep', tags, extra);
    const walkF = walkFacing ?? facing;
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
        const dir = spec?.dir ?? 'forward';
        const stepLen = (spec?.step ?? radius * 1.4) * stepScale;
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
                const sign = dir === 'backward' ? -1 : dir === 'axis' ? (k % 2 === 1 ? 1 : -1) : 1;
                const reach = dir === 'axis' ? Math.ceil(k / 2) * stepLen : k * stepLen;
                pts.push({
                    x: from.x + Math.cos(walkF) * reach * sign,
                    y: from.y + Math.sin(walkF) * reach * sign, beatAt, k,
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
                pos: vec(p.x, p.y), radius: radius * Math.pow(scaleStep, p.k),
                caster, inst, color: inst.def.color,
                delay: delayBase + p.beatAt, exploded: false,
                linger: 0, linger0: 0,
                tickInterval: Infinity, tickTimer: 0,
                shape, facing, arcRad, edgeFrac,
                fx: burstVoice,
                dmgMult: baseMult * Math.pow(dmgStep, p.k), depth: 0,
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
            state.zones.push({
                pos: vec(p.x, p.y), radius: radius * Math.pow(rScaleStep, p.k),
                caster, inst, color: inst.def.color,
                delay: delayBase, exploded: false,
                linger: quakes ? pulseSpan : 0, linger0: quakes ? pulseSpan : 0,
                tickInterval: Infinity, tickTimer: quakes ? Infinity : 0,
                shape, facing, arcRad, edgeFrac,
                fx: burstVoice,
                dmgMult: mult, depth: 0,
                pulse: pulseFor(delayBase),
            });
            mintMarch(vec(p.x, p.y), mult, delayBase);
        }
    }
}
dropLingerField(caster: A, inst: I, at: CombatPoint, useMult = 1): void {
const {ports:sdk,state}=this;

    const tags = sdk.skillContextTags(inst, sdk.grantedTags(inst));
    const extra = sdk.instanceMods(inst);
    const fieldSecs = caster.sheet.get('lingerField', tags, extra);
    const healField = sdk.socketSpec(inst, 'healField');
    if (fieldSecs <= 0 && !healField)
        return;
    const zoneEmit = sdk.socketSpec(inst, 'zoneEmit');
    const sizeOver = resolveSizeOver(sdk.instanceSizeOver(inst));
    const grow = sdk.socketSpec(inst, 'zoneGrow');
    const rotate = caster.sheet.get('aoeSpin', tags, extra, 0);
    const pend = sdk.hostSockets(inst).find(s => s.def.pendulum)?.def.pendulum;
    const radius = 80 * caster.sheet.get('aoeRadius', tags, extra);
    const linger = Math.max(fieldSecs, healField ? 4 : 0)
        * caster.sheet.get('effectDuration', tags, extra);
    state.zones.push({
        pos: vec(at.x, at.y),
        radius,
        caster, inst, color: healField ? '#8ae0a8' : inst.def.color,
        delay: 0, exploded: true,
        linger,
        tickInterval: 0.5, tickTimer: 0.5,
        shape: caster.sheet.get('aoeShape', tags, extra),
        facing: caster.facing,
        healTick: healField?.amount,
        dmgMult: healField ? 0 : 0.4 * useMult, depth: 1,
        forceDamage: !healField,
        emit: zoneEmit ? { skillId: zoneEmit.skillId, interval: zoneEmit.interval, at: zoneEmit.at } : undefined,
        madden: sdk.maddenBankOf(inst),
        sizeOver,
        radius0: sizeOver ? radius : undefined,
        linger0: sizeOver ? linger : undefined,
        grow,
        rotate: rotate !== 0 ? rotate : undefined,
        pendulum: pend
            ? { arc: pend.arcDeg * Math.PI / 180, period: pend.period, base: caster.facing }
            : undefined,
    });
}
mintTrailPatch(a: A, inst: I, spec: DropZoneSpec, at: CombatPoint, facing: number, linger?: number): void {
const {state}=this;

    const dso = resolveSizeOver(spec.sizeOver);
    const hold = linger ?? spec.duration;
    state.zones.push({
        pos: vec(at.x, at.y), radius: spec.radius * (dso?.from ?? 1),
        tier: a.tier,
        caster: a, inst, color: inst.def.color,
        delay: 0, exploded: true,
        linger: hold, linger0: hold,
        tickInterval: spec.tickInterval ?? 0.4, tickTimer: 0.2,
        shape: 0, facing,
        dmgMult: spec.damageScale ?? 0.5, depth: 1,
        sizeOver: dso,
        radius0: dso ? spec.radius : undefined,
    });
}
statTrailSpec(mt: number): DropZoneSpec {
    return { radius: 32, duration: 2.2, tickInterval: 0.4, damageScale: mt };
}
moveBlast(caster: A, inst: I, at: CombatPoint, phase: 'depart' | 'arrive' = 'arrive'): void {
const {ports:sdk}=this;

    const tags = sdk.skillContextTags(inst, sdk.grantedTags(inst));
    const extra = sdk.instanceMods(inst);
    const scale = caster.sheet.get('moveExplode', tags, extra)
        + (phase === 'depart' ? caster.sheet.get('departSplash', tags, extra) : 0);
    if (scale <= 0)
        return;
    const radius = 85 * caster.sheet.get('aoeRadius', tags, extra);
    for (const e of sdk.enemiesOf(caster)) {
        if (!sameStory(caster, e))
            continue;
        if (dist(at, e.pos) - e.radius > radius)
            continue;
        sdk.resolveHit(caster, inst, e, scale, 1, undefined, true);
    }
    sdk.flash({ pos: vec(at.x, at.y), radius, color: sdk.cosmetic(caster, inst.def.id).color ?? inst.def.color, life: 0.3, maxLife: 0.3,
        fx: sdk.skillMovementVoice(inst.def.id, 'impact'), facing: caster.facing, recoveryCueTier: caster.tier });
    sdk.frontSplash(caster, inst, at, radius);
    sdk.strikeSurfaces(caster, at, radius);
}
clampGroundTarget(caster: A, aim: CombatPoint, d: GroundDeliverySpec, inst: I): CombatPoint {
const {ports:sdk}=this;

    const from = caster.pos;
    const dd = dist(from, aim);
    let at: CombatPoint;
    if (dd <= d.castRange)
        at = vec(aim.x, aim.y);
    else {
        const ang = angleTo(from, aim);
        at = vec(from.x + Math.cos(ang) * d.castRange, from.y + Math.sin(ang) * d.castRange);
    }
    if (sdk.skillOcclusion(caster, inst) === 'blocked') {
        const clipped = sdk.clipShot(from, at, caster.tier);
        if (clipped.x !== at.x || clipped.y !== at.y) {
            sdk.occluded('place');
            at = clipped;
        }
    }
    return at;
}
layFissure(caster: A, inst: I, from: CombatPoint, ang: number, d: GroundDeliverySpec, useMult: number, flatBonus: F | undefined, branches: number, fan = 0): void {
const {ports:sdk,state}=this;
const chance=(value:number)=>sdk.random()<value;

    const fz = d.fissure!;
    const tags = sdk.skillContextTags(inst, sdk.grantedTags(inst));
    const extra = sdk.instanceMods(inst);
    const aoeScale = caster.sheet.get('aoeRadius', tags, extra);
    const durScale = caster.sheet.get('effectDuration', tags, extra);
    const step = fz.step ?? d.radius * 1.1;
    const n = Math.min(28, Math.max(2, Math.ceil(fz.length / step)));
    const warp = sdk.socketSpec(inst, 'fissurePath');
    const pts: {
        x: number;
        y: number;
        ang: number;
    }[] = [];
    if (warp?.kind === 'orbit') {
        const R = Math.max(56, dist(caster.pos, from)) + fan * step * 2.2;
        const cx = caster.pos.x, cy = caster.pos.y;
        for (let i = 0; i < n; i++) {
            const th = ang + (step * (i + 0.5)) / R;
            pts.push({ x: cx + Math.cos(th) * R, y: cy + Math.sin(th) * R, ang: th + Math.PI / 2 });
        }
    }
    else if (warp?.kind === 'spiral') {
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
    }
    else if (warp?.kind === 'serpent') {
        const amp = ((warp.waveDeg ?? 38) * Math.PI) / 180;
        let px = from.x, py = from.y;
        for (let i = 0; i < n; i++) {
            const h = ang + Math.sin(i * 0.85) * amp;
            px += Math.cos(h) * step;
            py += Math.sin(h) * step;
            pts.push({ x: px, y: py, ang: h });
        }
    }
    else {
        for (let i = 0; i < n; i++) {
            pts.push({
                x: from.x + Math.cos(ang) * step * (i + 0.5),
                y: from.y + Math.sin(ang) * step * (i + 0.5),
                ang,
            });
        }
    }
    const volatile = sdk.socketSpec(inst, 'fissureVolatile');
    const aftershock = sdk.socketSpec(inst, 'fissureAftershock');
    const roulette = sdk.socketSpec(inst, 'fissureRoulette');
    const segLinger = (secs: number): number => (volatile || aftershock || roulette) ? Math.max(secs, 5) : secs;
    const ownFizLinger = (d.lingerDuration ?? 0) > 0;
    const fizSizeOver = resolveSizeOver(sdk.instanceSizeOver(inst));
    const maddenBank = sdk.maddenBankOf(inst);
    const lay = (px: number, py: number, segAng: number, delay: number, mult: number, linger: number): void => {
        const half = step / 2;
        state.zones.push({
            pos: sdk.clampPos(vec(px, py), 10),
            radius: d.radius * aoeScale * (fizSizeOver?.from ?? 1),
            seg: {
                ax: px - Math.cos(segAng) * half, ay: py - Math.sin(segAng) * half,
                bx: px + Math.cos(segAng) * half, by: py + Math.sin(segAng) * half,
            },
            caster, inst, color: inst.def.color,
            delay, exploded: false,
            linger,
            tickInterval: ownFizLinger ? (d.tickInterval ?? 0.5) : Infinity,
            tickTimer: ownFizLinger ? 0 : Infinity,
            linger0: linger,
            sizeOver: fizSizeOver,
            radius0: fizSizeOver ? d.radius * aoeScale : undefined,
            shape: 0, facing: segAng,
            dmgMult: mult, depth: 1,
            emit: linger > 0 ? d.emit : undefined,
            emitStep: linger > 0
                ? (sdk.socketSpec(inst, 'cadence')?.intervalStep ?? d.emit?.intervalStep)
                : undefined,
            exposure: (() => {
                const after = sdk.socketSpec(inst, 'exposure')?.after ?? d.exposure;
                return after && linger > 0
                    ? { after, dwell: new Map<number, number>() } : undefined;
            })(),
            madden: linger > 0 ? maddenBank : undefined,
            volatile: linger > 0 && volatile
                ? { ...volatile, next: sdk.time() + delay + volatile.interval } : undefined,
            aftershock: linger > 0 && aftershock
                ? { ...aftershock, readyAt: sdk.time() + delay } : undefined,
            roulette: linger > 0 && roulette
                ? { ...roulette, next: sdk.time() + delay + roulette.interval, armedUntil: 0 } : undefined,
            flatBonus,
        });
    };
    for (let i = 0; i < n; i++) {
        const pt = pts[i];
        const delay = (d.delay ?? 0.1) + (step * i) / fz.speed;
        lay(pt.x, pt.y, pt.ang, delay, useMult, segLinger(d.lingerDuration ?? 0) * durScale);
        if (branches > 0 && i > 0 && i % Math.max(1, Math.floor(n / (branches + 1))) === 0) {
            const side = (Math.floor(i / Math.max(1, Math.floor(n / (branches + 1)))) % 2 === 0) ? 1 : -1;
            const bAng = pt.ang + side * (fz.branchDeg ?? 42) * Math.PI / 180;
            const bn = Math.max(2, Math.floor(n / 2));
            for (let k = 0; k < bn; k++) {
                lay(pt.x + Math.cos(bAng) * step * (k + 0.5), pt.y + Math.sin(bAng) * step * (k + 0.5), bAng, delay + (step * k) / fz.speed, useMult * 0.75, segLinger((d.lingerDuration ?? 0) * 0.7) * durScale);
            }
        }
    }
    const reclose = sdk.socketSpec(inst, 'fissureReclose');
    const closeSpec = fz.close
        ?? (reclose ? { delay: reclose.interval, damageScale: reclose.damageScale } : undefined);
    if (closeSpec) {
        let passes = 1;
        if (reclose) {
            for (let k = 0; k < reclose.times && chance(reclose.chance); k++)
                passes++;
        }
        const openDone = (d.delay ?? 0.1) + (step * n) / fz.speed;
        const zipDur = (step * n) / (fz.speed * 1.4);
        for (let pass = 0; pass < passes; pass++) {
            const start = openDone + closeSpec.delay + pass * (zipDur + (reclose?.interval ?? 0.8));
            const scale = pass === 0 ? closeSpec.damageScale : reclose!.damageScale;
            for (let i = 0; i < n; i++) {
                const pt = pts[i];
                lay(pt.x, pt.y, pt.ang, start + (step * (n - 1 - i)) / (fz.speed * 1.4), useMult * scale, 0);
            }
        }
    }
}
}
