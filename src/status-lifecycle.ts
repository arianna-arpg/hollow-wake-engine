// Ordered status policy from the pinned game; see docs/status-lifecycle.md.
import type {ActiveStatus, StatusOptions, StatusDefinition, StatusActor, StatusSkill, StatusPorts, StatusTick, StatusDamageType} from './status-lifecycle-types.js';
export type * from './status-lifecycle-types.js';

export const WET_STAND_STATUSES: readonly string[] = Object.freeze(['wading','swimming','soaked']);
export const HOLLOW_WAKE_AILMENT_TUNING = Object.freeze({bleed:Object.freeze({identityThreshold:.7,incidentalScale:0}),burn:Object.freeze({identityThreshold:.6,incidentalScale:.35})});
export function tuneAilmentChance(id:string, authored:number, tuning:Readonly<Record<string,{readonly identityThreshold:number;readonly incidentalScale:number}>>=HOLLOW_WAKE_AILMENT_TUNING):number {
  const rule = tuning[id];
  return !rule || authored >= rule.identityThreshold ? authored : authored * rule.incidentalScale;
}
export function statusRuptureRadius(status:Pick<ActiveStatus,'ruptureRadius'>):number {return status.ruptureRadius ?? 90;}
export function bankFracOf(status:Pick<ActiveStatus,'dps'|'bankPeak'>, definition:{bank?:{capMul:number}}|undefined):number {
  const cap=definition?.bank?.capMul ?? 0;
  if (!cap || !status.bankPeak || status.bankPeak <= 0) return 0;
  return Math.max(0,Math.min(1,status.dps/(status.bankPeak*cap)));
}
export function statusBaselineDps(definition:{baseline?:{dps:number;perLevel:number}}|undefined,level:number):number {
  const baseline=definition?.baseline;return baseline ? baseline.dps+baseline.perLevel*Math.max(0,level-1) : 0;
}
/** Synchronous, reentrant operations on borrowed records. Callback exceptions
 * retain earlier writes. No ambient random, clock, shared scratch or registry.
 * Arrays remain live during reverse ticking; the host owns callback discipline. */
export function createStatusLifecycle<A extends StatusActor<A,I,M,Tag>, I extends StatusSkill<Tag>, M extends {value:number}, Tag extends string, D extends StatusDefinition<M,Tag>>(input:StatusPorts<A,I,D,Tag>) {
  const definition=input.definition.bind(input), random=input.random.bind(input), skillContextTags=input.skillContextTags.bind(input), popCue=input.popCue.bind(input);
  const STATUS_RELAY_IDS=Object.freeze([...input.relayIds]);
  const chance=(p:number)=>random()<p;
  type SkillInstance=I;
function applyStatus(actor: A, id: string, dps: number, durationScale: number, sourceName: string, opts?: StatusOptions): void {
    const def = definition(id);
    if (!def)
        return;
    if (!def.beneficial && actor.sheet.get('debuffImmunity') > 0)
        return;
    if (!opts?.relayed && actor.statusRelay && actor.sheet.armedFamily('relayStatus_', STATUS_RELAY_IDS).length
        && actor.statusRelay(actor, [id, dps, durationScale, sourceName, opts]))
        return;
    if (def.hardCC && !def.beneficial && actor.poise > 0.5 && !actor.poiseBroken
        && chance(actor.sheet.get('poiseCcAvoid'))) {
        return;
    }
    if (def.forbidsTags && actor.casting
        && def.forbidsTags.some(t => actor.casting!.inst.def.tags.includes(t))) {
        actor.casting = null;
    }
    const expiry = def.beneficial ? 1 : actor.sheet.get('afflictionExpiry');
    const banking = !!def.bank && opts?.casterId !== undefined;
    if (banking && def.bank!.wetMul !== undefined && actor.isWet())
        dps *= def.bank!.wetMul;
    const baseDur = banking && def.bank!.duration !== undefined ? def.bank!.duration : def.duration;
    const duration = baseDur * durationScale / expiry;
    const existing = actor.statuses.find(s => s.id === id && s.challengeField === opts?.challengeField && s.sourceKey === opts?.sourceKey);
    const previousRemaining = existing?.remaining;
    const fixedFuse = existing !== undefined && existing.rupture !== undefined;
    const cap = (def.maxStacks ?? 99) + (opts?.stacksBonus ?? 0);
    const power = Math.max(0, opts?.power ?? 1);
    if (existing && banking && !fixedFuse) {
        const peak = Math.max(existing.bankPeak ?? 0, dps);
        existing.bankPeak = peak;
        existing.dps = Math.min(existing.dps + dps, peak * def.bank!.capMul);
        existing.remaining = Math.max(existing.remaining, duration);
        existing.total = Math.max(existing.total ?? 0, existing.remaining);
        existing.bankFrac = bankFracOf(existing, def);
    }
    else if (existing && def.stacking) {
        if (existing.stacks < cap)
            existing.stacks++;
        if (!fixedFuse)
            existing.remaining = duration;
        existing.dps = Math.max(existing.dps, dps);
        if (def.buildup && existing.stacks >= cap) {
            const i = actor.statuses.indexOf(existing);
            if (i !== -1)
                actor.statuses.splice(i, 1);
            actor.sheet.removeSource('status:' + id);
            actor.applyStatus(def.buildup.into, 0, durationScale, sourceName, { power });
        }
    }
    else if (existing && def.stackPolicy === 'strongest' && !fixedFuse) {
        if (dps > existing.dps) {
            existing.dps = dps;
            existing.remaining = duration;
        }
    }
    else if (existing && def.pop && !fixedFuse) {
        const owed = existing.dps * existing.stacks * existing.remaining;
        const frac = def.pop.fraction * (1 + Math.max(0, opts?.popBonus ?? 0));
        if (owed > 0 && frac > 0)
            existing.popAcc = (existing.popAcc ?? 0) + owed * frac;
        existing.dps = dps;
        existing.remaining = duration;
        existing.total = duration;
    }
    else if (existing) {
        if (!fixedFuse)
            existing.remaining = Math.max(existing.remaining, duration);
        existing.dps = Math.max(existing.dps, dps);
    }
    else {
        actor.statuses.push({
            id, remaining: duration, stacks: 1, dps, sourceName, challengeField: opts?.challengeField,
            sourceKey: opts?.sourceKey, holdDischarge: opts?.holdDischarge,
            power: power !== 1 ? power : undefined,
            propagates: opts?.propagates || def.propagateOnDeath,
            rupture: opts?.rupture,
            ruptureType: opts?.ruptureType,
            ruptureRadius: opts?.ruptureRadius,
            casterId: opts?.casterId,
            brood: opts?.brood,
            leech: opts?.leech,
            total: duration, statusDuration: duration,
            bankPeak: banking ? dps : undefined,
            bankFrac: banking && def.bank ? bankFracOf({ dps, bankPeak: dps }, def) : undefined,
            'window': def.weakSpot ? (() => {
                const frac = actor.life / Math.max(1, actor.maxLife());
                const hi = Math.max(0.02, frac - def.weakSpot.gap);
                return { hi, lo: Math.max(0, hi - def.weakSpot.size) };
            })() : undefined,
        });
        if (def.mods) {
            actor.sheet.setSource('status:' + id, power !== 1
                ? def.mods.map(m => ({ ...m, value: m.value * power }))
                : def.mods);
        }
        return;
    }
    if (existing && existing.remaining !== previousRemaining)
        existing.statusDuration = existing.remaining;
    if (existing && opts) {
        existing.propagates = existing.propagates || opts.propagates || def.propagateOnDeath;
        if (opts.rupture !== undefined)
            existing.ruptureRadius = existing.rupture !== undefined
                ? Math.max(existing.ruptureRadius ?? 90, opts.ruptureRadius ?? 90) : opts.ruptureRadius;
        existing.rupture = ((existing.rupture ?? 0) + (opts.rupture ?? 0)) || undefined;
        existing.ruptureType = existing.ruptureType ?? opts.ruptureType;
        existing.casterId = def.refreshCaster && opts.casterId !== undefined
            ? opts.casterId
            : existing.casterId ?? opts.casterId;
        existing.brood = existing.brood ?? opts.brood;
        if (opts.leech)
            existing.leech = Math.max(existing.leech ?? 0, opts.leech);
    }
    if (existing && actor.statuses.includes(existing)) {
        existing.power = Math.max(existing.power ?? 1, power);
        if (def.mods) {
            const mult = (def.modsPerStack ? existing.stacks : 1) * (existing.power ?? 1);
            actor.sheet.setSource('status:' + id, mult !== 1
                ? def.mods.map(m => ({ ...m, value: m.value * mult }))
                : def.mods);
        }
    }
}
function tickChronoStatuses(actor: A, rawDt: number): void {
    for (let i = actor.statuses.length - 1; i >= 0; i--) {
        const s = actor.statuses[i];
        if (definition(s.id)?.timeScale === undefined)
            continue;
        s.remaining -= rawDt;
        if (s.remaining <= 0) {
            actor.statuses.splice(i, 1);
            actor.expiredStatuses.push(s);
            if (!actor.statuses.some(o => o.id === s.id))
                actor.sheet.removeSource('status:' + s.id);
        }
    }
}
function endStatus(actor: A, id: string): void {
    let any = false;
    for (let i = actor.statuses.length - 1; i >= 0; i--) {
        if (actor.statuses[i].id !== id)
            continue;
        actor.statuses.splice(i, 1);
        any = true;
    }
    if (any && !actor.statuses.some(o => o.id === id)) {
        actor.sheet.removeSource('status:' + id);
    }
}
function cleanseDebuffs(actor: A, count = Infinity): number {
    let stripped = 0;
    for (let i = actor.statuses.length - 1; i >= 0 && stripped < count; i--) {
        const s = actor.statuses[i];
        if (definition(s.id)?.beneficial)
            continue;
        actor.statuses.splice(i, 1);
        if (!actor.statuses.some(o => o.id === s.id))
            actor.sheet.removeSource('status:' + s.id);
        stripped++;
    }
    return stripped;
}
function isStunned(actor: A): boolean {
    return actor.statuses.some(s => definition(s.id)?.hardCC);
}
function isPanicked(actor: A): boolean {
    return actor.statuses.some(s => definition(s.id)?.panic);
}
function neverRetreats(actor: A): boolean {
    return actor.statuses.some(s => definition(s.id)?.neverRetreats);
}
function fickleSpan(actor: A): [
    number,
    number
] | undefined {
    let best: [
        number,
        number
    ] | undefined;
    for (const s of actor.statuses) {
        const f = definition(s.id)?.fickleSpan;
        if (f && (!best || f[0] + f[1] < best[0] + best[1]))
            best = f;
    }
    return best;
}
function isWet(actor: A): boolean {
    if (actor.rainWet)
        return true;
    for (const s of actor.statuses)
        if (WET_STAND_STATUSES.includes(s.id))
            return true;
    return false;
}
function tagsForbidden(actor: A, inst: SkillInstance): boolean {
    for (const s of actor.statuses) {
        const forbids = definition(s.id)?.forbidsTags;
        if (!forbids)
            continue;
        for (const t of forbids)
            if (skillContextTags(inst).has(t))
                return true;
    }
    return false;
}
function tickStatuses(actor:A, dt:number, chronoDt=dt, onDotTick?:StatusTick) {
let dot: Partial<Record<StatusDamageType | 'untyped', number>> | null = null;
for (let i = actor.statuses.length - 1; i >= 0; i--) {
    const s = actor.statuses[i];
    s.remaining -= definition(s.id)?.timeScale !== undefined ? chronoDt : dt;
    if (s.dps > 0) {
        const sdef = definition(s.id);
        const key = sdef?.dotType ?? 'untyped';
        let curve = 1;
        if (sdef?.dpsCurve && s.total) {
            const prog = Math.min(1, Math.max(0, 1 - s.remaining / s.total));
            curve = sdef.dpsCurve === 'ramp' ? 2 * prog : 2 * (1 - prog);
        }
        const tick = s.dps * s.stacks * curve * dt;
        dot ??= {};
        dot[key] = (dot[key] ?? 0) + tick;
        onDotTick?.(s, tick, key);
        if (s.brood)
            s.broodAcc = (s.broodAcc ?? 0) + tick;
        if (s.leech)
            s.leechAcc = (s.leechAcc ?? 0) + tick * s.leech;
    }
    if (s.popAcc) {
        const procCue = definition(s.id);
        popCue(actor, s.id, procCue);
        const key = definition(s.id)?.dotType ?? 'untyped';
        dot ??= {};
        dot[key] = (dot[key] ?? 0) + s.popAcc;
        onDotTick?.(s, s.popAcc, key);
        if (s.leech)
            s.leechAcc = (s.leechAcc ?? 0) + s.popAcc * s.leech;
        s.popAcc = 0;
    }
    if (s.remaining <= 0) {
        actor.statuses.splice(i, 1);
        actor.expiredStatuses.push(s);
        if (!actor.statuses.some(o => o.id === s.id))
            actor.sheet.removeSource('status:' + s.id);
    }
}
let fly = actor.flyingBase;
if (!fly && actor.statuses.length) {
    for (const s of actor.statuses) {
        if (definition(s.id)?.flight) {
            fly = true;
            break;
        }
    }
}
if (actor.flying && !fly)
    actor.touchdown = true;
actor.flying = fly;
return dot;
}
function baselineStatusDps(id:string,level:number):number {return statusBaselineDps(definition(id),level);}
return Object.freeze({applyStatus,tickChronoStatuses,endStatus,cleanseDebuffs,isStunned,isPanicked,neverRetreats,fickleSpan,isWet,tagsForbidden,tickStatuses,baselineStatusDps});
}
