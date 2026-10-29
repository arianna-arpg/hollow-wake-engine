// Shared damage policy extracted from the pinned game; see docs/damage-pipeline.md.
import type {DamageActor, DamageSkill, DamageRules, DamagePorts, DamageType, DamageBand,
  SkillDamagePreview, HitResult, DamagePacket as Packet, MitigateOptions} from './damage-pipeline-types.js';
export type * from './damage-pipeline-types.js';

const DAMAGE_TYPES: readonly DamageType[] = Object.freeze(['physical','fire','cold','lightning','chaos']);
const TAKEN_AS_IDS = Object.freeze(DAMAGE_TYPES.flatMap(from => DAMAGE_TYPES.filter(to => to !== from).map(to => from + '_' + to)));
const conversionStat = (from: DamageType, to: DamageType) => 'convert_' + from + '_' + to;
const extraAsStat = (to: DamageType) => 'extraAs_' + to;
const ADDED_DAMAGE_STAT = Object.freeze({physical:'addedPhysical',fire:'addedFire',cold:'addedCold',lightning:'addedLightning',chaos:'addedChaos'});
const addedDamageStat = (to: DamageType) => ADDED_DAMAGE_STAT[to];
const takenAsStat = (from: DamageType, to: DamageType) => 'takenAs_' + from + '_' + to;
const clamp = (n: number, lo: number, hi: number) => n < lo ? lo : n > hi ? hi : n;

/** Copy configuration once. Changing a ruleset requires a new service, never a
 * process-wide mutable registry. Live actor records and callback effects stay borrowed. */
function ownRules(input: DamageRules): DamageRules {
  const groups = ['armor','resistance','evasion','block','poise','endurance'] as const;
  for (const group of groups) for (const n of Object.values(input[group]))
    if (!Number.isFinite(n)) throw new TypeError('Damage rules must be finite: ' + group);
  for (const n of [input.slayer.giantsbaneRatio,input.slayer.quailAt,input.offTargetLess])
    if (!Number.isFinite(n)) throw new TypeError('Damage rules must be finite');
  if (input.armor.k <= 0 || input.endurance.spendRatio <= 0) throw new RangeError('Damage divisors must be positive');
  if (!input.slayer.regicideRarities.every(n=>typeof n==='string')) throw new TypeError('Rarity ids must be strings');
  return Object.freeze({armor:Object.freeze({...input.armor}),resistance:Object.freeze({...input.resistance}),
    evasion:Object.freeze({...input.evasion}),block:Object.freeze({...input.block}),poise:Object.freeze({...input.poise}),
    endurance:Object.freeze({...input.endurance}),slayer:Object.freeze({...input.slayer,regicideRarities:Object.freeze([...input.slayer.regicideRarities])}),offTargetLess:input.offTargetLess});
}
export const HOLLOW_WAKE_DAMAGE_RULES: DamageRules = ownRules({armor:{k:6},resistance:{hardCap:.9,floor:-.75},
  evasion:{weight:.3,minHitChance:.2,windowReset:4},block:{guardBase:12,guardPerLevel:3},
  poise:{drFloor:.35,drainRatio:.5,drainFlat:1},endurance:{spendRatio:1},
  slayer:{giantsbaneRatio:1.5,regicideRarities:['magic','rare','champion','crowned'],quailAt:.5},offTargetLess:.3});

/** All calls finish synchronously. Ports may re-enter: no scratch state is shared
 * between operations. Errors preserve writes already made; this is not a transaction.
 * Tag vocabularies must include the five damage types, 'attack' and 'aoe'. */
export function createDamagePipeline<A extends DamageActor<A,I,M,Tag>, I extends DamageSkill,
  M extends {when?: string}, Tag extends string>(input: DamagePorts<A,I,M,Tag>, configuration: DamageRules = HOLLOW_WAKE_DAMAGE_RULES) {
  const rules=ownRules(configuration), DEFENSE_CFG=rules, SLAYER_CFG=rules.slayer;
  const ports: DamagePorts<A,I,M,Tag> = Object.freeze({random:input.random.bind(input),
    instanceMods:input.instanceMods.bind(input),instanceInnateMods:input.instanceInnateMods.bind(input),
    skillContextTags:input.skillContextTags.bind(input),travelProtected:input.travelProtected.bind(input),
    weakPointBonus:input.weakPointBonus.bind(input),plyFloor:input.plyFloor.bind(input),dominantType:input.dominantType.bind(input),
    stampSegment:input.stampSegment.bind(input),feedWound:input.feedWound.bind(input),resourceFlow:input.resourceFlow.bind(input),
    boundToAbsorb:input.boundToAbsorb.bind(input),onHit:input.onHit?.bind(input),onDot:input.onDot?.bind(input)});
  const {instanceMods,instanceInnateMods,skillContextTags,travelProtected:throngTravelProtected,
    weakPointBonus,plyFloor:plyFloorOf,dominantType:dominantTypeOf,stampSegment:stampSegFlash,
    feedWound,resourceFlow:noteResourceFlow}=ports;
  const chance=(p:number)=>ports.random()<p;
  const rand=(lo:number,hi:number)=>lo+ports.random()*(hi-lo);
  type Actor=A; type SkillInstance=I; type Modifier=M; type SkillTag=Tag;
  type DamagePacket=Packet<M,Tag>; type MitigateOpts=MitigateOptions<A,M,Tag>;
function applyConversion(caster: Actor, amounts: Partial<Record<DamageType, number>>, tags: Set<SkillTag>, extra?: Modifier[]): void {
    for (const from of DAMAGE_TYPES) {
        const amt = amounts[from];
        if (!amt)
            continue;
        let remaining = 1;
        for (const to of DAMAGE_TYPES) {
            if (to === from || remaining <= 0)
                continue;
            const frac = caster.sheet.get(conversionStat(from, to), tags, extra);
            if (frac <= 0)
                continue;
            const f = Math.min(remaining, frac);
            remaining -= f;
            amounts[to] = (amounts[to] ?? 0) + amt * f;
        }
        if (remaining < 1) {
            if (remaining <= 0.0001)
                delete amounts[from];
            else
                amounts[from] = amt * remaining;
        }
    }
    const extras = caster.sheet.armedFamily('extraAs_', DAMAGE_TYPES, extra);
    if (extras.length) {
        let total = 0;
        for (const t of DAMAGE_TYPES)
            total += amounts[t] ?? 0;
        if (total > 0) {
            for (const to of extras as readonly DamageType[]) {
                const frac = caster.sheet.get(extraAsStat(to), tags, extra);
                if (frac > 0)
                    amounts[to] = (amounts[to] ?? 0) + total * frac;
            }
        }
    }
}
type RangePick = (lo: number, hi: number) => number;
interface DamageContext {
    extra: Modifier[];
    baseTags: Set<SkillTag>;
    vsTags?: readonly SkillTag[];
    effectiveness: number;
}
function damageContext(caster: Actor, inst: SkillInstance, vsTags?: readonly SkillTag[]): DamageContext {
    const extra = instanceMods(inst);
    const cs = caster.casting;
    if (cs?.mode === 'guard' && cs.inst !== inst) {
        for (const m of instanceInnateMods(cs.inst)) {
            if (m.when === 'guarding')
                extra.push(m);
        }
    }
    return {
        extra,
        baseTags: skillContextTags(inst, vsTags as SkillTag[] | undefined),
        vsTags,
        effectiveness: inst.def.addedEffectiveness ?? 1,
    };
}
function foldSkillDamage(caster: Actor, inst: SkillInstance, ctx: DamageContext, pick: RangePick, flatBonus?: Partial<Record<DamageType, number>>): Partial<Record<DamageType, number>> {
    const def = inst.def;
    const { extra, baseTags, effectiveness, vsTags } = ctx;
    const amounts: Partial<Record<DamageType, number>> = {};
    for (const type of DAMAGE_TYPES) {
        const tags = skillContextTags(inst, vsTags ? [type as Tag, ...vsTags] : [type as Tag]);
        let base = flatBonus?.[type] ?? 0;
        const range = def.baseDamage?.[type];
        const minAdd = caster.sheet.get(`addedMin_${type}`, tags, extra) * effectiveness;
        const maxAdd = caster.sheet.get(`addedMax_${type}`, tags, extra) * effectiveness;
        if (range || minAdd > 0 || maxAdd > 0) {
            let lo = (range?.[0] ?? 0) + minAdd;
            let hi = Math.max(lo, (range?.[1] ?? 0) + maxAdd);
            const spread = caster.sheet.get('damageSpread', tags, extra);
            if (spread !== 0 && hi > lo) {
                const mid = (lo + hi) / 2;
                const half = ((hi - lo) / 2) * Math.max(0, 1 + spread);
                lo = Math.max(0, mid - half);
                hi = mid + half;
            }
            base += pick(lo, hi);
        }
        const added = caster.sheet.get(addedDamageStat(type), tags, extra) * effectiveness;
        const total = (base + added) * caster.sheet.get('damage', tags, extra);
        if (total > 0)
            amounts[type] = total;
    }
    const spikes = caster.sheet.get('thornsToHit', baseTags, extra);
    if (spikes > 0) {
        const th = caster.sheet.get('thorns');
        if (th > 0) {
            amounts.physical = (amounts.physical ?? 0)
                + th * spikes * caster.sheet.get('damage', skillContextTags(def, ['physical' as Tag]), extra);
        }
    }
    const dominion = caster.sheet.get('reservedDamage', baseTags, extra) * caster.reservedMana
        + caster.sheet.get('maxManaDamage', baseTags, extra) * caster.sheet.get('mana');
    if (dominion > 0) {
        const cur = (Object.values(amounts) as number[]).reduce((s, v) => s + v, 0);
        if (cur > 0) {
            const scale = (cur + dominion) / cur;
            for (const t of Object.keys(amounts) as DamageType[])
                amounts[t]! *= scale;
        }
    }
    applyConversion(caster, amounts, baseTags, extra);
    return amounts;
}
function rollSkillDamage(caster: Actor, inst: SkillInstance, flatBonus?: Partial<Record<DamageType, number>>, vsTags?: readonly SkillTag[]): DamagePacket {
    const def = inst.def;
    const ctx = damageContext(caster, inst, vsTags);
    const { extra, baseTags } = ctx;
    const lucky = chance(caster.sheet.get('luckyChance', baseTags, extra));
    const unlucky = chance(caster.sheet.get('unluckyChance', baseTags, extra));
    let rollAcc = 0, rollWeight = 0;
    const rollRange: RangePick = (lo, hi) => {
        let r = rand(lo, hi);
        if (lucky !== unlucky) {
            const second = rand(lo, hi);
            r = lucky ? Math.max(r, second) : Math.min(r, second);
        }
        if (hi > lo) {
            const mid = (lo + hi) / 2;
            rollAcc += ((r - lo) / (hi - lo)) * mid;
            rollWeight += mid;
        }
        return r;
    };
    const amounts = foldSkillDamage(caster, inst, ctx, rollRange, flatBonus);
    let crit = false;
    if (Object.keys(amounts).length) {
        crit = chance(caster.sheet.get('critChance', baseTags, extra));
        if (crit) {
            const multi = caster.sheet.get('critMulti', baseTags, extra);
            for (const t of Object.keys(amounts) as DamageType[])
                amounts[t]! *= multi;
        }
    }
    return {
        amounts, crit, tags: baseTags, sourceName: def.name, extra,
        rollT: rollWeight > 0 ? rollAcc / rollWeight : undefined,
    };
}
function skillDamageBands(caster: Actor, inst: SkillInstance, flatBonus?: Partial<Record<DamageType, number>>): SkillDamagePreview {
    const ctx = damageContext(caster, inst);
    const loAmounts = foldSkillDamage(caster, inst, ctx, (lo) => lo, flatBonus);
    const hiAmounts = foldSkillDamage(caster, inst, ctx, (_lo, hi) => hi, flatBonus);
    const bands: Partial<Record<DamageType, DamageBand>> = {};
    const total: DamageBand = { lo: 0, hi: 0 };
    for (const type of DAMAGE_TYPES) {
        const lo = loAmounts[type] ?? 0;
        const hi = hiAmounts[type] ?? 0;
        if (lo <= 0 && hi <= 0)
            continue;
        bands[type] = { lo, hi };
        total.lo += lo;
        total.hi += hi;
    }
    return {
        bands, total,
        critChance: caster.sheet.get('critChance', ctx.baseTags, ctx.extra),
        critMulti: caster.sheet.get('critMulti', ctx.baseTags, ctx.extra),
    };
}
const RES_STAT: Record<DamageType, string | null> = {
    physical: null,
    fire: 'fireRes',
    cold: 'coldRes',
    lightning: 'lightningRes',
    chaos: 'chaosRes',
};
function resistValue(target: Actor, type: DamageType, pen?: {
    attacker: Actor;
    tags?: Set<SkillTag>;
    extra?: Modifier[];
}): number {
    const stat = RES_STAT[type];
    if (!stat)
        return 0;
    const cap = Math.min(target.sheet.get(stat + 'Max'), DEFENSE_CFG.resistance.hardCap);
    let res = Math.min(target.sheet.get(stat), cap);
    if (pen) {
        const p = pen.attacker.sheet.get(type + 'Pen', pen.tags, pen.extra);
        if (p > 0)
            res = Math.max(DEFENSE_CFG.resistance.floor, res - p);
    }
    return res;
}
function mitigateTyped(target: Actor, amounts: Partial<Record<DamageType, number>>, opts?: MitigateOpts): number {
    if (target.sheet.get('damageImmunity') > 0)
        return 0;
    return mitigatePools(target, mitigateWound(target, amounts, opts), opts);
}
function mitigateWound(target: Actor, amounts: Partial<Record<DamageType, number>>, opts?: MitigateOpts): number {
    amounts = receiveDamageAs(target, amounts);
    if (opts?.out)
        opts.out.receivedAmounts = amounts;
    const pen = opts?.attacker
        ? { attacker: opts.attacker, tags: opts.tags, extra: opts.extra } : undefined;
    let total = 0;
    for (const type of Object.keys(amounts) as DamageType[]) {
        let dmg = amounts[type]!;
        if (dmg <= 0)
            continue;
        if (type === 'physical') {
            let armor = target.sheet.get('armor');
            if (pen)
                armor *= 1 - pen.attacker.sheet.get('armorPen', pen.tags, pen.extra);
            dmg *= Math.max(opts?.armorDamageFloor ?? 0, pen?.attacker.sheet.get('armorDamageFloor', pen.tags, pen.extra) ?? 0, DEFENSE_CFG.armor.k * dmg / (Math.max(0, armor) + DEFENSE_CFG.armor.k * dmg));
        }
        else {
            dmg *= 1 - resistValue(target, type, pen);
        }
        total += dmg;
    }
    if (total > 0 && opts?.attacker) {
        const atk = opts.attacker;
        if (target.level > atk.level) {
            const v = atk.sheet.get('overmatch', opts.tags, opts.extra);
            if (v > 0)
                total *= 1 + v;
        }
        const gb = atk.sheet.get('giantsbane', opts.tags, opts.extra);
        if (gb > 0 && target.effectiveWeight() >= atk.effectiveWeight() * SLAYER_CFG.giantsbaneRatio) {
            total *= 1 + gb;
        }
        if (target.rarity && SLAYER_CFG.regicideRarities.includes(target.rarity)) {
            const v = atk.sheet.get('regicide', opts.tags, opts.extra);
            if (v > 0)
                total *= 1 + v;
        }
        if (target.partLink) {
            const v = atk.sheet.get('limbreaver', opts.tags, opts.extra);
            if (v > 0)
                total *= 1 + v;
        }
        if (target.stationary) {
            const v = atk.sheet.get('siegebreaker', opts.tags, opts.extra);
            if (v > 0)
                total *= 1 + v;
        }
        if (target.spent) {
            const v = atk.sheet.get('spentbane', opts.tags, opts.extra);
            if (v > 0)
                total *= 1 + v;
        }
        if (target.rootedSpec && !target.rootedHeld) {
            const v = atk.sheet.get('uprooter', opts.tags, opts.extra);
            if (v > 0)
                total *= 1 + v;
        }
        if (target.bondHeld) {
            const v = atk.sheet.get('bondbreaker', opts.tags, opts.extra);
            if (v > 0)
                total *= 1 + v;
        }
        if (target.aiNerve < SLAYER_CFG.quailAt) {
            const v = atk.sheet.get('quailbane', opts.tags, opts.extra);
            if (v > 0)
                total *= 1 + v;
        }
    }
    total *= target.sheet.get('damageTaken') * (1 + weakPointBonus(target));
    return total;
}
function mitigatePools(target: Actor, total: number, opts?: MitigateOpts): number {
    if (total > 0 && target.insight > 0) {
        const momentum = target.insightMomentum();
        if (momentum > 0) {
            const pierce = opts?.attacker
                ? Math.min(1, opts.attacker.sheet.get('insightPen', opts.tags, opts.extra)) : 0;
            const eff = target.sheet.get('insightEfficiency');
            const want = total * target.sheet.get('insightDR') * momentum * (1 - pierce);
            const avoided = Math.min(want, target.insight * eff);
            if (avoided > 0) {
                target.insight = Math.max(0, target.insight - avoided / eff);
                total -= avoided;
            }
        }
    }
    const maxPoise = target.maxPoise();
    if (total > 0 && maxPoise > 0) {
        if (target.poise > 0 && !target.poiseBroken) {
            const f = DEFENSE_CFG.poise.drFloor;
            const wear = f + (1 - f) * Math.min(1, target.poise / maxPoise);
            total *= 1 - target.sheet.get('poiseDR') * wear;
        }
        const mult = opts?.attacker
            ? opts.attacker.sheet.get('poiseDamage', opts.tags, opts.extra) : 1;
        const drain = (total * DEFENSE_CFG.poise.drainRatio + DEFENSE_CFG.poise.drainFlat) * mult;
        if (target.damagePoise(drain, opts?.attacker, opts?.tags, opts?.extra) && opts?.out) {
            opts.out.poiseBroke = true;
        }
    }
    if (total > 0 && target.endurance > 0) {
        const prevented = Math.min(total * target.sheet.get('enduranceDR'), target.endurance / DEFENSE_CFG.endurance.spendRatio);
        if (prevented > 0) {
            total -= prevented;
            target.endurance = Math.max(0, target.endurance - prevented * DEFENSE_CFG.endurance.spendRatio);
            target.enduranceDelay = target.sheet.get('enduranceRegenDelay');
        }
    }
    for (const aura of target.activeAuras.values()) {
        const dv = aura.inst.def.delivery;
        const led = dv.type === 'aura' ? dv.ledger : undefined;
        if (!led || led.source !== 'damageTaken' || !aura.ledger || total <= 0)
            continue;
        const room = target.ledgerCap(led) - aura.ledger.balance;
        const skim = Math.max(0, Math.min(total * Math.min(1, led.rate), room));
        aura.ledger.balance += skim;
        total -= skim;
    }
    let landed = soakDamage(target, total, opts?.attacker
        ? { pen: { attacker: opts.attacker, tags: opts.tags, extra: opts.extra } }
        : undefined);
    if (landed > 0) {
        const cap = target.sheet.get('hitCap');
        if (cap > 0 && landed > cap) {
            landed = cap;
            if (opts?.out)
                opts.out.clamped = true;
        }
    }
    return landed;
}
function plyEats(attacker: Actor, target: Actor, total: number, packet: DamagePacket): boolean {
    if (target.plies <= 0)
        return false;
    if (total >= plyFloorOf(target)) {
        const rend = Math.max(0, Math.floor(attacker.sheet.get('plyRend', packet.tags, packet.extra)));
        target.plies = Math.max(0, target.plies - 1 - rend);
        target.assaultPlyBreak?.(attacker);
        if (target.plies === 0 && target.plySpec?.spentStatus) {
            target.applyStatus(target.plySpec.spentStatus, 0, 1, 'plies');
        }
    }
    return true;
}
function landLifeDamage(target: Actor, total: number): number {
    if (target.sheet.get('damageImmunity') > 0)
        return 0;
    for (const intercept of target.lifeDamageInterceptors?.values() ?? [])
        total = Math.max(0, intercept(total));
    if (total <= 0)
        return 0;
    if (total >= target.life && target.life > 0 && !target.dead && !target.invulnerable
        && target.lastGaspCd <= 0) {
        const gasp = target.sheet.get('lastGasp');
        if (gasp > 0 && chance(gasp)) {
            const stood = Math.max(1, target.maxLife() * target.sheet.get('lastGaspLife'));
            const removed = Math.max(0, target.life - stood);
            target.life = stood;
            target.lastGaspCd = target.sheet.get('lastGaspCooldown');
            target.lastGaspSpan = target.lastGaspCd;
            target.gasped = true;
            return removed;
        }
    }
    target.life -= total;
    return total;
}
function applyHit(attacker: Actor, target: Actor, packet: DamagePacket): HitResult {
    const result = applyHitCore(attacker, target, packet);
    ports.onHit?.(attacker, target, result, packet);
    return result;
}
function applyHitCore(attacker: Actor, target: Actor, packet: DamagePacket): HitResult {
    const segHit = target.segHitPending;
    target.segHitPending = undefined;
    if (target.invulnerable || throngTravelProtected(target))
        return { evaded: false, immune: true, blocked: false, total: 0, crit: false };
    if (!packet.assaultGuaranteed && target.sheet.get('hitImmune') > 0) {
        return { evaded: true, immune: false, blocked: false, total: 0, crit: false };
    }
    const areaAvoidance = packet.tags.has('aoe' as Tag) ? target.sheet.get('areaAvoidance') : 0;
    if (!packet.assaultGuaranteed && areaAvoidance > 0 && chance(areaAvoidance)) {
        return { evaded: true, immune: false, blocked: false, total: 0, crit: false };
    }
    if (!packet.assaultGuaranteed && packet.tags.has('attack' as Tag)) {
        const acc = attacker.sheet.get('accuracy', packet.tags);
        const ev = target.sheet.get('evasion');
        const hitChance = clamp(acc / (acc + ev * DEFENSE_CFG.evasion.weight), DEFENSE_CFG.evasion.minHitChance, 1);
        if (target.evadeWindow <= 0)
            target.evadeEntropy = rand(0, 1);
        target.evadeWindow = DEFENSE_CFG.evasion.windowReset;
        target.evadeEntropy += hitChance;
        if (target.evadeEntropy < 1) {
            return { evaded: true, immune: false, blocked: false, total: 0, crit: false };
        }
        target.evadeEntropy -= 1;
    }
    const bsc = target.stanceRead();
    if (chance(target.sheet.get('blockChance', bsc?.tags, bsc?.extra))) {
        const mo = { attacker, tags: packet.tags, extra: packet.extra };
        const wound = mitigateWound(target, packet.amounts, mo);
        const guard = (DEFENSE_CFG.block.guardBase
            + DEFENSE_CFG.block.guardPerLevel * target.level
            + target.sheet.get('blockValue', bsc?.tags, bsc?.extra))
            * target.sheet.get('guardStrength', bsc?.tags, bsc?.extra);
        const stopped = Math.min(wound * target.sheet.get('blockPower', bsc?.tags, bsc?.extra), guard);
        let leaked = Math.max(0, wound - stopped);
        if (leaked > 0) {
            const out: {
                poiseBroke?: boolean;
                clamped?: boolean;
            } = {};
            leaked = mitigatePools(target, leaked, { ...mo, out });
            if (plyEats(attacker, target, leaked, packet)) {
                target.hitFlash = 0.12;
                target.hitFlashType = dominantTypeOf(packet.amounts);
                return { evaded: false, immune: false, blocked: true, blockedAmount: stopped, total: 0,
                    crit: false, poiseBroke: out.poiseBroke, plyEaten: true };
            }
            landLifeDamage(target, leaked);
            target.hitFlash = 0.1;
            target.hitFlashType = dominantTypeOf(packet.amounts);
            if (leaked > 0 && segHit !== undefined && segHit >= 0) {
                stampSegFlash(target, segHit);
                if (feedWound(target, segHit, leaked))
                    (target.segTears ??= []).push(segHit);
            }
            return { evaded: false, immune: false, blocked: true, blockedAmount: stopped, total: leaked,
                crit: false, poiseBroke: out.poiseBroke, clamped: out.clamped };
        }
        return { evaded: false, immune: false, blocked: true, blockedAmount: stopped, total: 0, crit: false };
    }
    if (packet.crit && chance(target.sheet.get('critAvoid'))) {
        const multi = attacker.sheet.get('critMulti', packet.tags, packet.extra);
        if (multi > 1) {
            for (const t of Object.keys(packet.amounts) as DamageType[]) {
                packet.amounts[t]! /= multi;
            }
        }
        packet.crit = false;
    }
    let vsMult = 1;
    for (const s of target.statuses) {
        const v = attacker.sheet.get('damageVs_' + s.id, packet.tags, packet.extra);
        if (v !== 0)
            vsMult *= 1 + v * s.stacks;
    }
    const taunt = attacker.statuses.find(s => s.id === 'taunted');
    if (taunt?.casterId !== undefined && taunt.casterId !== target.id) {
        vsMult *= 1 - rules.offTargetLess;
    }
    if (vsMult !== 1) {
        for (const t of Object.keys(packet.amounts) as DamageType[]) {
            packet.amounts[t]! *= vsMult;
        }
    }
    const out: NonNullable<MitigateOpts['out']> = {};
    const total = mitigateTyped(target, packet.amounts, { attacker, tags: packet.tags, extra: packet.extra, out });
    if (plyEats(attacker, target, total, packet)) {
        target.hitFlash = 0.12;
        target.hitFlashType = dominantTypeOf(packet.amounts);
        return {
            evaded: false, immune: false, blocked: false, total: 0,
            crit: packet.crit, poiseBroke: out.poiseBroke, plyEaten: true,
            receivedAmounts: out.receivedAmounts,
        };
    }
    landLifeDamage(target, total);
    target.hitFlash = 0.15;
    target.hitFlashType = dominantTypeOf(packet.amounts);
    if (total > 0 && segHit !== undefined && segHit >= 0) {
        stampSegFlash(target, segHit);
        if (feedWound(target, segHit, total))
            (target.segTears ??= []).push(segHit);
    }
    if (total > 0) {
        const rec = target.sheet.get('recuperate');
        if (rec > 0) {
            const back = total * rec;
            target.restoreStreams.push({
                resource: 'life',
                perSec: back / target.sheet.get('recuperateTime'),
                remaining: back,
            });
        }
    }
    let culled = false;
    if (total > 0 && target.life > 0 && !target.invulnerable) {
        const cull = attacker.sheet.get('cullThreshold', packet.tags, packet.extra);
        if (cull > 0 && target.life <= target.maxLife() * cull) {
            target.life = 0;
            culled = true;
        }
    }
    if (total > 0 && !attacker.dead) {
        const onHit = attacker.sheet.get('lifeOnHit', packet.tags, packet.extra);
        const leech = attacker.sheet.get('lifeLeech', packet.tags, packet.extra) * total;
        const healed = attacker.healBy(onHit + leech);
        noteResourceFlow(attacker, target, 'life', healed);
        const leechHealed = healed * (leech / Math.max(0.000001, onHit + leech));
        if (leechHealed > 0)
            attacker.gainEvents.push({ kind: 'heal', id: 'life', depth: 0, n: leechHealed, tags: [...packet.tags] });
        const wleech = attacker.sheet.get('wardLeech', packet.tags, packet.extra) * total;
        if (wleech > 0)
            attacker.gainWard(wleech);
        const esGain = attacker.sheet.get('esOnHit', packet.tags, packet.extra)
            + attacker.sheet.get('esLeech', packet.tags, packet.extra) * total;
        if (esGain > 0)
            noteResourceFlow(attacker, target, 'es', attacker.gainEs(esGain));
        const mLeech = attacker.sheet.get('manaLeech', packet.tags, packet.extra) * total;
        if (mLeech > 0) {
            const before = attacker.mana;
            attacker.mana = Math.min(attacker.availableMaxMana(), attacker.mana + mLeech);
            noteResourceFlow(attacker, target, 'mana', attacker.mana - before);
        }
        const pGain = attacker.sheet.get('poiseOnHit', packet.tags, packet.extra);
        if (pGain > 0)
            attacker.gainPoise(pGain);
    }
    return {
        evaded: false, immune: false, blocked: false, total, crit: packet.crit,
        poiseBroke: out.poiseBroke, culled, clamped: out.clamped,
        receivedAmounts: out.receivedAmounts,
    };
}
function interruptEsRecharge(target: Actor): void {
    if (target.esRecharging && chance(target.sheet.get('esRechargeSteadfast')))
        return;
    target.esDelay = target.sheet.get('esRechargeDelay');
}
function soakDamage(target: Actor, total: number, opts?: {
    esBypass?: number;
    delayOnDrainOnly?: boolean;
    pen?: {
        attacker: Actor;
        tags?: ReadonlySet<SkillTag>;
        extra?: readonly Modifier[];
    };
}): number {
    if (total <= 0)
        return total;
    if (!opts?.delayOnDrainOnly && target.sheet.get('energyShield') > 0) {
        interruptEsRecharge(target);
    }
    if (target.ward > 0) {
        const w = Math.min(target.ward, total);
        target.ward -= w;
        total -= w;
    }
    const hadAbsorbLayers = target.absorbTotal > 0;
    total = spendAbsorbLayers(target, total);
    if (target.absorb > 0) {
        const a = Math.min(target.absorb, total);
        target.absorb -= a;
        total -= a;
    }
    if (hadAbsorbLayers && target.absorbTotal <= 0) {
        for (let i = target.statuses.length - 1; i >= 0; i--) {
            const s = target.statuses[i];
            if (!ports.boundToAbsorb(s.id))
                continue;
            target.statuses.splice(i, 1);
            target.sheet.removeSource('status:' + s.id);
        }
    }
    if (total > 0 && target.es > 0) {
        const bypass = Math.min(1, Math.max(0, opts?.esBypass ?? 0));
        const shred = opts?.pen
            ? Math.max(0.25, opts.pen.attacker.sheet.get('esShred', opts.pen.tags, opts.pen.extra))
            : 1;
        const e = Math.min(target.es, total * (1 - bypass) * shred);
        if (e > 0) {
            const hadShield = target.es > 0.5;
            target.es -= e;
            total -= e / shred;
            if (opts?.delayOnDrainOnly) {
                interruptEsRecharge(target);
            }
            if (hadShield && target.es <= 0.001)
                target.esBroke = true;
        }
    }
    if (total > 0) {
        const frac = target.sheet.get('manaShield');
        if (frac > 0 && target.mana > 0) {
            const m = Math.min(target.mana, total * frac);
            target.mana -= m;
            total -= m;
        }
    }
    if (total > 0) {
        const sf = target.sheet.get('staggerFrac');
        if (sf > 0) {
            const spread = total * sf;
            target.staggerDamage(spread);
            total -= spread;
        }
    }
    return total;
}
function applyDot(target: Actor, amount: number, type?: DamageType): number {
    const landed = applyDotCore(target, amount, type);
    ports.onDot?.(target, landed, type);
    return landed;
}
function applyDotCore(target: Actor, amount: number, type?: DamageType): number {
    if (target.invulnerable || throngTravelProtected(target))
        return 0;
    const tags = type ? new Set<SkillTag>([type as Tag]) : undefined;
    let total = amount * target.sheet.get('damageTaken', tags) * (1 + weakPointBonus(target));
    if (total <= 0)
        return 0;
    if (target.es > 0.5) {
        const resist = target.sheet.get('esDotResist', tags);
        if (resist > 0)
            total *= 1 - resist;
    }
    total = soakDamage(target, total, {
        esBypass: target.sheet.get('esDotBypass', tags),
        delayOnDrainOnly: true,
    });
    return landLifeDamage(target, total);
}
function spendAbsorbLayers(target: Actor, total: number): number {
    for (const [key, layer] of [...target.absorbLayers]) {
        if (total <= 0)
            break;
        const used = Math.min(layer.amount, total);
        layer.amount -= used;
        total -= used;
        if (layer.amount <= 0) {
            target.absorbLayers.delete(key);
            layer.ended('broken');
        }
    }
    return total;
}
function tickAbsorbLayers(target: Actor, dt: number): void {
    for (const [key, layer] of [...target.absorbLayers]) {
        layer.remaining -= dt;
        if (layer.remaining > 1e-9)
            continue;
        target.absorbLayers.delete(key);
        if (!target.dead && !target.downed)
            layer.ended('expired');
    }
}
function skillAbsorbAmount(caster: Actor, inst: SkillInstance, base: number): number {
    return Math.max(0, base * caster.sheet.get('absorbPower', skillContextTags(inst), instanceMods(inst)));
}
function receiveDamageAs(target: Actor, amounts: Partial<Record<DamageType, number>>): Partial<Record<DamageType, number>> {
    if (!target.sheet.armedFamily('takenAs_', TAKEN_AS_IDS).length)
        return amounts;
    const out: Partial<Record<DamageType, number>> = {};
    for (const from of DAMAGE_TYPES) {
        const amount = amounts[from] ?? 0;
        if (amount <= 0)
            continue;
        const routes = DAMAGE_TYPES.filter(to => to !== from)
            .map(to => ({ to, share: Math.max(0, target.sheet.get(takenAsStat(from, to))) })).filter(r => r.share > 0);
        const sum = routes.reduce((n, r) => n + r.share, 0), divisor = Math.max(1, sum);
        out[from] = (out[from] ?? 0) + amount * (1 - Math.min(1, sum));
        for (const r of routes)
            out[r.to] = (out[r.to] ?? 0) + amount * r.share / divisor;
    }
    return out;
}
return Object.freeze({applyConversion,rollSkillDamage,skillDamageBands,resistValue,mitigateTyped,landLifeDamage,applyHit,applyDot,
  spendAbsorbLayers,tickAbsorbLayers,skillAbsorbAmount,receiveDamageAs});
}
