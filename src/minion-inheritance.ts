/** Trusted host reads preserve their original order. Definitions and modifiers
 * are borrowed; the caller owns validation and source lifetime. */
export interface InheritanceModifier {stat:string;kind:string;value:number}
export interface MinionInheritanceSkill {def:{throng?:unknown;hivecall?:unknown};relicSource?:unknown}
export interface MinionInheritancePorts<A,I,M,T> {
 tags(inst:I):T;modifiers(inst:I):M[];bodyContext(tags:T,bodyId?:string):T;
 combat(inst:I):{areaAvoidance?:number;threat?:number};
 stat(actor:A,id:string,tags:T,mods:M[]):number;base(id:string):number|undefined;
 ordinaryStats():number;maxAreaAvoidance():number;minThreat():number;armorFloor():number;lifeScale(inst:I):number|undefined;
 modifier(stat:string,kind:'flat'|'more'|'increased',value:number):M;
 readonly statusIds:readonly string[];armed(actor:A,prefix:string,ids:readonly string[],extra:M[]):readonly string[];
}
export interface MinionPlyActor {
 hiveDeathPlies:number;assaultWardCount:number;plySpec?:{count:number;perLevel?:number};level:number;pliesMax:number;plies:number;
}

/** A pure inheritance result. Callers own lifetime, body size, and source
 * attribution; summons and persistent companions resolve the same investment. */
export interface MinionInheritance<M,T> {
  tags: T;
  extra: M[];
  ownerMods: M[];
  combatMods: M[];
  size: number;
  guard: boolean;
  plyBonus: number;
}

export class MinionInheritanceResolver<A,I extends MinionInheritanceSkill,M extends InheritanceModifier,T> {
 constructor(private readonly p:MinionInheritancePorts<A,I,M,T>) {}
 areaAvoidanceOf(caster: A, inst: I,
  tags: T = this.p.tags(inst), extra: M[] = this.p.modifiers(inst)): number {
  return Math.max(0, Math.min(this.p.maxAreaAvoidance(),
    (this.p.combat(inst).areaAvoidance ?? 0)
    + this.p.stat(caster,'minionAreaAvoidance', tags, extra) * (inst.relicSource ? this.p.ordinaryStats() : 1)));
}

/** Owner contributions pay the throng batch divisor once. Rates, body size,
 * survival fractions and discrete plies are not divided. The life trade and
 * echo both read the original investment, never one another's output. */
resolve(caster: A, inst: I,
  bodyId?: string, scale = 1): MinionInheritance<M,T> {
  const tags = this.p.bodyContext(this.p.tags(inst), bodyId), extra = this.p.modifiers(inst);
  const get = (stat: string): number => {
    const raw = this.p.stat(caster,stat, tags, extra);
    if (!inst.relicSource) return raw;
    const base = this.p.base(stat) ?? 0;
    return base + (raw - base) * this.p.ordinaryStats();
  };
  const combat = this.p.combat(inst);
  const threat = Math.max(this.p.minThreat(), (combat.threat ?? 1) * get('minionThreat'));
  const combatMods = [
    this.p.modifier('armorDamageFloor', 'flat', (inst.def.throng || inst.def.hivecall) ? this.p.armorFloor() : 0),
    this.p.modifier('threatGen', 'more', threat - 1),
    this.p.modifier('targetPriority', 'more', threat - 1),
    this.p.modifier('areaAvoidance', 'flat', this.areaAvoidanceOf(caster, inst, tags, extra)),
  ];
  const lifeInc0 = get('minionLife') - 1;
  const tradeAt = get('minionLifePlyTrade'), echoAt = get('minionLifePlyEcho');
  // Epsilon keeps an exactly purchased threshold whole despite IEEE rounding.
  const tradedPlies = tradeAt > 0 && lifeInc0 > 0 ? Math.floor(lifeInc0 / tradeAt + 1e-9) : 0;
  const echoPlies = echoAt > 0 && lifeInc0 > 0 ? Math.floor(lifeInc0 / echoAt + 1e-9) : 0;
  const lifeInc = tradeAt > 0 && lifeInc0 > 0 ? Math.max(0, lifeInc0 - tradedPlies * tradeAt) : lifeInc0;
  const haste = get('minionHaste'), regenRate = get('minionRegenRate');
  const ownerMods = [
    this.p.modifier('damage', 'more', (get('minionDamage') - 1) * scale),
    this.p.modifier('life', 'more', lifeInc * (this.p.lifeScale(inst) ?? scale)),
    this.p.modifier('damageTaken', 'more', (get('minionDamageTaken') - 1) * scale),
    this.p.modifier('moveSpeed', 'more', (get('minionMoveSpeed') * haste - 1) * scale),
    this.p.modifier('attackSpeed', 'more', (haste - 1) * scale),
    this.p.modifier('castSpeed', 'more', (haste - 1) * scale),
    this.p.modifier('detectionRange', 'more', (get('minionDetectionRange') - 1) * scale),
    this.p.modifier('lifeRegen', 'flat', get('minionRegen') * scale),
    this.p.modifier('lifeRegenPct', 'flat', get('minionRegenPct') * scale),
    // Rate quickens native AND inherited regeneration. Scaling it again
    // would apply the batch divisor twice to the investment product.
    this.p.modifier('lifeRegen', 'increased', regenRate - 1),
    this.p.modifier('lifeRegenPct', 'increased', regenRate - 1),
  ];
  // Socketed damage bonuses and penalties ride every descendant. Keep their
  // attack/spell/etc. filters for the recipient's own damage context.
  for (const m of extra) if (m.stat === 'damage') {
    ownerMods.push(m.kind === 'override' ? m : { ...m, value: m.value * scale });
  }
  for (const sid of this.p.armed(caster,'minionApply_',this.p.statusIds,extra)) {
    const carry = get('minionApply_' + sid);
    if (carry > 0) ownerMods.push(this.p.modifier('apply_' + sid, 'flat', carry * scale));
  }
  return { tags, extra, ownerMods, combatMods, size: get('minionSize'), guard: get('minionGuard') > 0,
    plyBonus: tradedPlies + echoPlies + Math.max(0, Math.round(get('minionPlies'))) };
}

}

/** Re-derive capacity without refilling spent armor on an unchanged refresh.
 * Runtime gifts (Hivecall / Assault) remain independent of owner investment. */
export function applyMinionPlyBonus(minion: MinionPlyActor, inherited: number): void {
  const bonus = inherited + minion.hiveDeathPlies + minion.assaultWardCount;
  if (!minion.plySpec && bonus <= 0) return;
  minion.plySpec ??= { count: 0 };
  const spent = Math.max(0, minion.pliesMax - minion.plies);
  minion.pliesMax = Math.max(0, minion.plySpec.count + Math.floor((minion.plySpec.perLevel ?? 0) * Math.max(0, minion.level - 1))) + bonus;
  minion.plies = Math.max(0, minion.pliesMax - spent);
}
