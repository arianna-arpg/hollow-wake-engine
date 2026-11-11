export interface AuraTickDelivery {
  type: string;
  mode?: 'toggle' | 'duration';
  maxDuration?: number;
  upkeep?: {
    manaPerSec?: number; manaPctMaxPerSec?: number; manaPctCurPerSec?: number;
    lifeFractionPerSec?: number; rampPerSec?: number;
    charges?: {charge: string; perSec: number};
  };
  seal?: {drCap?: number; drPerMissing?: number; stagger?: number};
}
export interface AuraTickSkill {def: {delivery: {type: string}}}
export interface AuraTickSpec<D extends string, M> {
  radius: number;
  allyMods?: M[]; enemyMods?: M[];
  enemyDps?: {amount?: number; type: D; drainLifeFraction?: number};
  siphonFraction?: number;
  pulse?: {interval: number; healAllies?: {base: 'maxLife' | 'maxMana' | 'lifeRegen'; amount: number}};
}
export interface AuraTickState<S, F, M = unknown> {
  inst: S; spec: F; radius: number; shape: number; remaining: number;
  allyMods?: M[];
  pulseTimer: number; affected: Set<number>; since?: number;
  sealVal?: number; chargeAcc?: number;
}
export interface AuraTickActor<S, F, M = unknown> {
  id: number; team: unknown; dead: boolean; life: number; mana: number;
  invulnerable: boolean;
  activeAuras: ReadonlyMap<string, AuraTickState<S, F, M>>;
  charges: ReadonlyMap<string, number>;
}
export interface AuraTickPorts<A, S extends AuraTickSkill, F, D extends string, M, Q> {
  /** Return the current collection for each loop. Its iteration remains live. */
  actors(): Iterable<A>;
  /** Host hostility/targetability policy returns its original selection snapshot. */
  enemies(actor: A): Iterable<A>;
  context(inst: S): Q;
  /** Select the aura view from the previously captured definition. */
  aura(definition: S['def']): AuraTickDelivery | undefined;
  time(): number;
  skillStat(actor: A, key: 'effectDuration' | 'damage', definition: S['def'], context: Q, type?: D): number;
  stat(actor: A, key: 'damageTaken' | 'lifeRegen'): number;
  maxLife(actor: A): number; maxMana(actor: A): number;
  sameStory(actor: A, bearer: A): boolean;
  inside(bearer: A, aura: AuraTickState<S, F, M>, target: A): boolean;
  retire(actor: A, key: string): void;
  spendCharge(actor: A, key: string, amount: number): void;
  modifier(key: 'damageTaken' | 'staggerFrac', operation: 'more' | 'flat', value: number): M;
  setSource(actor: A, key: string, modifiers: M[]): void;
  removeSource(actor: A, key: string): void;
  convert(actor: A, amounts: Partial<Record<D, number>>, definition: S['def'], context: Q, type: D): void;
  resistance(actor: A, type: D): number;
  damageText(actor: A, amount: number, dt: number): void;
  heal(actor: A, amount: number): number;
  /** Receives the live instance after healing; the host reads its feeding cue. */
  resourceFlow(actor: A, source: A, landed: number, inst: S): void;
  kill(actor: A, bearer: A): void;
  presence(actor: A): void;
  healText(actor: A, landed: number): void;
}

/** Synchronous frame policy over borrowed actor/aura state. No clock, registry,
 * geometry engine or persistent per-actor cache is owned here. Callback failures
 * retain preceding writes. The host owns frame admission and outer scheduling. */
export class AuraTick<
  A extends AuraTickActor<S, F, M>, S extends AuraTickSkill,
  F extends AuraTickSpec<D, M>, D extends string, M, Q
> {
  constructor(private readonly p: AuraTickPorts<A, S, F, D, M, Q>) {}

  update(dt: number): void {
    for (const bearer of this.p.actors()) {
      if (bearer.activeAuras.size === 0) continue;
      if (bearer.dead) continue;
      for (const [skillId, aura] of [...bearer.activeAuras]) {
        const definition = aura.inst.def;
        const context = this.p.context(aura.inst);
        const delivery = this.p.aura(definition);
        if (aura.remaining !== Infinity) {
          aura.remaining -= dt;
          if (aura.remaining <= 0) { this.p.retire(bearer, skillId); continue; }
        }
        const held = this.p.time() - (aura.since ?? this.p.time());
        if (delivery?.mode === 'toggle' && delivery.maxDuration !== undefined
          && held >= delivery.maxDuration * this.p.skillStat(bearer, 'effectDuration', definition, context)) {
          this.p.retire(bearer, skillId);
          continue;
        }
        if (delivery?.mode === 'toggle' && delivery.upkeep) {
          const ramp = 1 + (delivery.upkeep.rampPerSec ?? 0) * held;
          const manaDrain = (delivery.upkeep.manaPerSec ?? 0)
            + (delivery.upkeep.manaPctMaxPerSec ? this.p.maxMana(bearer) * delivery.upkeep.manaPctMaxPerSec : 0)
            + (delivery.upkeep.manaPctCurPerSec ? bearer.mana * delivery.upkeep.manaPctCurPerSec : 0);
          if (manaDrain > 0) {
            bearer.mana -= manaDrain * ramp * dt;
            if (bearer.mana <= 0) { bearer.mana = 0; this.p.retire(bearer, skillId); continue; }
          }
          if (delivery.upkeep.lifeFractionPerSec) {
            const drained = this.p.maxLife(bearer) * delivery.upkeep.lifeFractionPerSec * ramp * dt;
            if (bearer.life - drained <= 1) { this.p.retire(bearer, skillId); continue; }
            bearer.life -= drained;
          }
          if (delivery.upkeep.charges) {
            const upkeep = delivery.upkeep.charges;
            aura.chargeAcc = (aura.chargeAcc ?? 0) + upkeep.perSec * ramp * dt;
            if (aura.chargeAcc >= 1) {
              const owed = Math.floor(aura.chargeAcc);
              aura.chargeAcc -= owed;
              const bank = bearer.charges.get(upkeep.charge) ?? 0;
              if (bank < owed) {
                if (bank > 0) this.p.spendCharge(bearer, upkeep.charge, bank);
                this.p.retire(bearer, skillId);
                continue;
              }
              this.p.spendCharge(bearer, upkeep.charge, owed);
            }
          }
        }
        if (delivery?.seal) {
          const missing = 1 - bearer.life / Math.max(1, this.p.maxLife(bearer));
          const reduction = Math.min(delivery.seal.drCap ?? 0.6, (delivery.seal.drPerMissing ?? 0) * missing);
          const value = Math.round(reduction * 100) / 100;
          if (aura.sealVal !== value) {
            aura.sealVal = value;
            const modifiers: M[] = [];
            if (value > 0) modifiers.push(this.p.modifier('damageTaken', 'more', -value));
            if (delivery.seal.stagger) modifiers.push(this.p.modifier('staggerFrac', 'flat', delivery.seal.stagger));
            this.p.setSource(bearer, 'seal:' + skillId, modifiers);
          }
        }
        const sourceName = 'aura:' + skillId + ':' + bearer.id;
        const inside = new Set<number>();
        const allyMods = aura.allyMods ?? aura.spec.allyMods;
        if (allyMods) {
          for (const actor of this.p.actors()) {
            if (actor.dead || actor.team !== bearer.team || !this.p.sameStory(actor, bearer)) continue;
            if (!this.p.inside(bearer, aura, actor)) continue;
            inside.add(actor.id);
            if (!aura.affected.has(actor.id)) this.p.setSource(actor, sourceName, allyMods);
          }
        }
        const dps = aura.spec.enemyDps;
        let base = 0;
        const amounts: Partial<Record<D, number>> = {};
        if (dps) {
          base = dps.drainLifeFraction ? this.p.maxLife(bearer) * dps.drainLifeFraction : (dps.amount ?? 0);
          base *= this.p.skillStat(bearer, 'damage', definition, context, dps.type);
          if (base > 0) {
            amounts[dps.type] = base;
            this.p.convert(bearer, amounts, definition, context, dps.type);
          }
        }
        for (const enemy of this.p.enemies(bearer)) {
          if (!this.p.inside(bearer, aura, enemy)) continue;
          if (aura.spec.enemyMods) {
            inside.add(enemy.id);
            if (!aura.affected.has(enemy.id)) this.p.setSource(enemy, sourceName, aura.spec.enemyMods);
          }
          if (dps && base > 0) {
            let amount = 0;
            for (const [type, value] of Object.entries(amounts) as [D, number | undefined][]) {
              let part = (value ?? 0) * dt * this.p.stat(enemy, 'damageTaken');
              part *= 1 - this.p.resistance(enemy, type);
              amount += part;
            }
            if (enemy.invulnerable) amount = 0;
            if (amount > 0) {
              enemy.life -= amount;
              this.p.damageText(enemy, amount, dt);
              if (aura.spec.siphonFraction) {
                this.p.resourceFlow(bearer, enemy, this.p.heal(bearer, amount * aura.spec.siphonFraction), aura.inst);
              }
              if (enemy.life <= 0 && !enemy.dead) this.p.kill(enemy, bearer);
            }
          }
        }
        for (const actor of this.p.actors()) {
          if (aura.affected.has(actor.id) && !inside.has(actor.id)) this.p.removeSource(actor, sourceName);
        }
        aura.affected = inside;
        if (aura.spec.pulse) {
          aura.pulseTimer -= dt;
          if (aura.pulseTimer <= 0) {
            aura.pulseTimer = aura.spec.pulse.interval;
            this.p.presence(bearer);
            const heal = aura.spec.pulse.healAllies;
            if (heal) {
              for (const actor of this.p.actors()) {
                if (actor.dead || actor.team !== bearer.team || !this.p.sameStory(actor, bearer)) continue;
                if (!this.p.inside(bearer, aura, actor)) continue;
                const base = heal.base === 'maxLife' ? this.p.maxLife(actor)
                  : heal.base === 'maxMana' ? this.p.maxMana(actor) : this.p.stat(actor, 'lifeRegen');
                const landed = this.p.heal(actor, base * heal.amount);
                if (landed > 0) this.p.healText(actor, landed);
              }
            }
          }
        }
      }
    }
  }
}
