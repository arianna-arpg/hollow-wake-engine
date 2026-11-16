/** Internal authored composition. Every service here is supplied by the SDK
 * runtime assembler, not by a game host. Methods are shared on the prototype;
 * actor-bound clocks stay in a weak table and follow the actor's lifetime. */
export function createCombatActorType(initialize, core, bind, rules) {
  const required = {
    vitals: ['maxLife', 'maxMana', 'maxEs', 'maxPoise', 'maxInsight', 'maxEndurance', 'availableMaxMana',
      'lifeCeiling', 'stanceRead', 'insightMomentum', 'damagePoise', 'gainPoise', 'gainEs', 'gainEndurance',
      'gainWard', 'effectiveWeight', 'staggerDamage', 'healBy', 'refillLife', 'fillResources'],
    buffs: ['grant', 'consume', 'spend', 'remove'],
    statuses: ['applyStatus', 'endStatus', 'cleanseDebuffs', 'tickChronoStatuses', 'isWet'],
    conditions: ['holds', 'refresh'], pricing: ['speed', 'useTime', 'cost'],
    payment: ['canAfford', 'pay'],
    admission: ['canAct', 'canUse', 'unmetGate', 'gatesMet', 'primedPourOpen', 'tagsForbidden', 'isReflex'],
  };
  for (const [service, methods] of Object.entries(required)) for (const method of methods) {
    if (typeof core?.[service]?.[method] !== 'function') throw Error(`Incomplete combat actor service: ${service}.${method}`);
  }
  for (const method of ['statusDefinition', 'gaugeTerms', 'attributeModifiers', 'sockets']) {
    if (typeof core?.[method] !== 'function') throw Error(`Incomplete combat actor query: ${method}`);
  }
  if (typeof initialize !== 'function' || typeof bind !== 'function') throw Error('Combat actor assembly requires state and clock factories');
  const recentKinds = [...rules.recentKinds], recentWindows = [...rules.recentWindows];
  if (recentKinds.length !== recentWindows.length || !recentWindows.every(n => Number.isFinite(n) && n >= 0)) throw Error('Invalid combat recency rules');
  const local = new WeakMap();
  return class CombatActor {
    constructor(id, name, team, pos, sheet) {
      initialize(this, id, name, team, pos, sheet);
      const owned = bind(this);
      for (const [service, methods] of Object.entries({charges: ['gain', 'spend', 'capFor', 'startDrain', 'isDraining', 'spendsCharge', 'clearTreeClocks'],
        ammunition: ['bank', 'capacity', 'spendOne'], timers: ['advance']})) {
        for (const method of methods) if (typeof owned?.[service]?.[method] !== 'function') throw Error(`Incomplete actor clock: ${service}.${method}`);
      }
      local.set(this, owned);
    }
    get invulnerable() {return this.baseInvulnerable || this.sheet.get('damageImmunity') > 0;}
    set invulnerable(value) {this.baseInvulnerable = value;}
    get absorbTotal() {let n = this.absorb; for (const layer of this.absorbLayers.values()) n += layer.amount; return n;}
    maxLife() {return core.vitals.maxLife(this);}
    maxMana() {return core.vitals.maxMana(this);}
    maxEs() {return core.vitals.maxEs(this);}
    maxPoise() {return core.vitals.maxPoise(this);}
    maxInsight() {return core.vitals.maxInsight(this);}
    maxEndurance() {return core.vitals.maxEndurance(this);}
    availableMaxMana() {return core.vitals.availableMaxMana(this);}
    lifeCeiling() {return core.vitals.lifeCeiling(this);}
    stanceRead() {return core.vitals.stanceRead(this);}
    insightMomentum() {return core.vitals.insightMomentum(this);}
    damagePoise(n, breaker, tags, extra) {return core.vitals.damagePoise(this, n, breaker, tags, extra);}
    gainPoise(n) {return core.vitals.gainPoise(this, n);}
    gainEs(n) {return core.vitals.gainEs(this, n);}
    gainEndurance(n) {return core.vitals.gainEndurance(this, n);}
    gainWard(n) {return core.vitals.gainWard(this, n);}
    effectiveWeight() {return core.vitals.effectiveWeight(this);}
    staggerDamage(n) {return core.vitals.staggerDamage(this, n);}
    healBy(n, silent = false) {return core.vitals.healBy(this, n, silent);}
    refillLife() {return core.vitals.refillLife(this);}
    fillResources() {return core.vitals.fillResources(this);}
    isMinion() {return !!this.owner;}
    ownedBy(lord) {let owner = this.owner; for (let hops = 0; owner && hops < 8; hops++) {if (owner === lord) return true; owner = owner.owner;} return false;}
    addThreat(id, amount) {if (amount > 0) this.threat.set(id, (this.threat.get(id) ?? 0) + amount);}
    isPlayerKind() {return this.kind === 'player';}
    isStunned() {return this.statuses.some(s => core.statusDefinition(s.id)?.hardCC);}
    isPanicked() {return this.statuses.some(s => core.statusDefinition(s.id)?.panic);}
    neverRetreats() {return this.statuses.some(s => core.statusDefinition(s.id)?.neverRetreats);}
    fickleSpan() {let best; for (const s of this.statuses) {const f = core.statusDefinition(s.id)?.fickleSpan; if (f && (!best || f[0] + f[1] < best[0] + best[1])) best = f;} return best;}
    isGuarding() {return this.casting?.mode === 'guard';}
    isChanneling() {return this.casting?.mode === 'channel' || this.casting?.mode === 'guard';}
    isQuiescent() {return !this.casting && !this.dash && !this.caromRun && !this.push && this.useLock <= 0 && !this.isStunned() && this.heldBy === undefined;}
    setAttributes(attrs) {this.attributeValues = {...attrs}; this.sheet.setSource('attributes', core.attributeModifiers(attrs));}
    addBuff(def, scale = 1, depth = 0, tags) {return core.buffs.grant(this, def, scale, depth, tags);}
    consumeBuffStacks(id, count = 1) {return core.buffs.consume(this, id, count);}
    spendBuffs(event, tags, skillId) {return core.buffs.spend(this, event, tags, skillId);}
    removeBuff(id) {return core.buffs.remove(this, id);}
    noteRecent(kind) {this.since[recentKinds.indexOf(kind)] = 0;}
    recently(kind) {const index = recentKinds.indexOf(kind); return this.since[index] < recentWindows[index];}
    gaugeReferenced(id) {
      if (this.sheet.usesGauge(id)) return true;
      for (const skill of this.skills) {
        if (!skill) continue;
        if (skill.def.innateMods?.some(m => m.gauge === id)) return true;
        for (const socket of core.sockets(skill)) {
          if (socket.def.mods.some(m => m.gauge === id) || socket.def.perLevel?.some(m => m.gauge === id)) return true;
        }
      }
      return false;
    }
    gainCharge(id, amount, max, skill, depth = 0) {return local.get(this).charges.gain(id, amount, max, skill, depth);}
    chargeCapFor(id, skill) {return local.get(this).charges.capFor(id, skill);}
    spendCharge(id, amount) {return local.get(this).charges.spend(id, amount);}
    startChargeDrain(id, rate) {return local.get(this).charges.startDrain(id, rate);}
    isChargeDraining(id) {return local.get(this).charges.isDraining(id);}
    spendsCharge(id) {return local.get(this).charges.spendsCharge(id);}
    clearTreeChargeClocks(skill) {return local.get(this).charges.clearTreeClocks(skill.def.id);}
    hasConditionalMods(when) {
      for (const skill of this.skills) {
        if (!skill) continue;
        if (skill.def.innateMods?.some(m => m.when === when)) return true;
        for (const socket of core.sockets(skill)) if (socket.def.mods.some(m => m.when === when)) return true;
      }
      return false;
    }
    lowLifeLine() {return this.sheet.get('lowLifeLine');}
    conditionHolds(id) {return core.conditions.holds(this, id);}
    refreshConditions() {return core.conditions.refresh(this);}
    applyStatus(id, dps, duration, source, options) {return core.statuses.applyStatus(this, id, dps, duration, source, options);}
    tickChronoStatuses(dt) {return core.statuses.tickChronoStatuses(this, dt);}
    endStatus(id) {return core.statuses.endStatus(this, id);}
    cleanseDebuffs(count = Infinity) {return core.statuses.cleanseDebuffs(this, count);}
    isWet() {return core.statuses.isWet(this);}
    skillChargeBank(skill) {return local.get(this).ammunition.bank(skill);}
    skillChargeCap(skill) {return local.get(this).ammunition.capacity(skill);}
    spendSkillCharge(skill) {return local.get(this).ammunition.spendOne(skill);}
    skillBankStill() {return this.idleFor >= rules.bankStillGrace && !this.dash && !this.leap && !this.caromRun;}
    speedFactor(skill) {return core.pricing.speed(this, skill);}
    skillUseTime(skill) {return core.pricing.useTime(this, skill);}
    skillCost(skill) {return core.pricing.cost(this, skill);}
    canAfford(cost) {return core.payment.canAfford(this, cost);}
    payCost(cost) {return core.payment.pay(this, cost);}
    ledgerCap(spec) {if (!spec.cap) return Infinity; return (spec.cap.flat ?? 0) + (spec.cap.maxLifePct ?? 0) * this.maxLife() + (spec.cap.maxManaPct ?? 0) * this.maxMana();}
    gaugeEff(skill) {return core.gaugeTerms(this, skill);}
    canAct() {return core.admission.canAct(this);}
    canUse(skill) {return core.admission.canUse(this, skill);}
    unmetGate(skill) {return core.admission.unmetGate(this, skill);}
    gatesMet(skill) {return core.admission.gatesMet(this, skill);}
    primedPourOpen(skill) {return core.admission.primedPourOpen(this, skill);}
    tagsForbidden(skill) {return core.admission.tagsForbidden(this, skill);}
    isReflex(skill) {return core.admission.isReflex(this, skill);}
    updateTimers(dt, chronoDt = dt, onDotTick) {return local.get(this).timers.advance(dt, chronoDt, onDotTick);}
  };
}
