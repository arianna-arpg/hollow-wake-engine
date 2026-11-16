// Generated combat conductor rules. w is the internal SDK owner.
import {bodySkillLevel as monsterSkillLevelOf} from '../../dist/body-levels.js';
import {inAoe} from '../../dist/combat-geometry.js';
export function createCombatPolicies(w, q) {
  const {movementProfile, skillMovementVoice, MOVEMENT_VISUAL_STYLE, extendMovementTrail, lightningProfile, LIGHTNING_STYLE, extendLightningTrace, skillSelfVoice, skillPresenceVoice, PRESENCE_STYLE, isConcealed, PERCEPTION_CFG, anatomyCueState, anatomyFlash, notePartScar, clearPartScar, feedingCueFlash, noteRestoreGain, RECOVERY_CUES, minionAreaAvoidanceOf, throngEvolution, throngClusterPlies, THRONG_EVOLUTION, instanceCastMode, instanceEffects, costWard, angleDiff, angleTo, clamp, dist, vec, replenishingDelivery, replenishShape, replenishmentActive, weaveVel, mod, STATUS_DEFS, parryCounter, HIVECALL, hivecallNode, hivecallState, hivecallRescueFactor, hivecallFormDamage, reachTo, segR, tickSegFlash, woundCount, DEFENSE_CFG, MASS_CFG, impactFrac, impactScale, shoveAuthority, BEHAVIOR_STATS, normalizeBrain, crewBoardingOpen, effectiveSkillLevel, grantedTags, guardBashSpec, hostSockets, instanceChargeCost, instanceChargeGain, instanceDelivery, instanceMetas, instanceMods, instanceSummon, instanceTameMod, instanceTargeting, instanceThrongSources, instanceTrigger, instanceTriggerArmed, instanceTriggerLimit, instanceTriggerPermit, makeSkillInstance, BASH_CFG, META_CHAIN_INTERVAL, TRIGGER_CFG, skillContextTags, supportFitsInst, supportRidesMinions, RELIQUARY_CFG, SKILLS, MONSTERS, coopScale, VICTIM_CONDITIONS, runeForCast, COMBO_CFG, comboRepeatedNow, comboStat, comboVariedNow, matchComboRule, COMBO_LIST, ATTRIBUTES, ELEMENTAL_TYPES, DAMAGE_COLOR, EMERGE_CFG, emergeFor, emergeSeedOf, canSquish, SQUISH_CFG, sameStory, tierFloorAt, gatherSympathyRecipients, SYMPATHY_CFG, SYMPATHY_LINKS, sympathyRelationOf, sympathyStat, CHARGE_DEFS, transitDwell, transitRadius, transitReach, MINION_COMBAT, batchScaleOf, buildWornThrongDef, isThrongBody, THRONG_CFG, throngMarkerOf, throngPocketKey, throngSpecsOn, WORN_THRONGS, wornThrongDefOfSkillId, wornThrongStat, CLING_CFG, clingEligible, clingMotionShaken, clingSeatPos, clingSeatsOf, gnawTags, STATUS_RELAYS, STATUS_RELAY_IDS, relayStatusStat, TRAIL_GRANTS, POCKET_GRANTS, pocketGrantStat, trailGrantStat, placeGrantedPockets, POCKET_GRANT_IDS, TRAIL_GRANT_IDS, substituteThrongKind, LITE_CFG, liteNoise, liteRingOffset, resolveLiteKind, GRAB_CFG, payloadTransition, noteProcCue, poolVentRead, defenseCueFlash, combatCueFlash, guardArcRadians, guardBashGeometry, DEFENSE_CUE_CFG, plyFloorOf, LOS_CFG, SATELLITE_CFG, REMNANT_KINDS, remnantDropStat, ORB_DEFS, ORB_CAP, orbAmount, orbOnKillStat, orbRefundStat} = q;
  const rand = (a, b) => a + w.random() * (b - a);
  const randInt = (a, b) => Math.floor(a + w.random() * (b + 1 - a));
  const chance = p => w.random() < p;
  const pick = values => values[Math.floor(w.random() * values.length)];
  const mitigateTyped = (...args) => w.damage.mitigateTyped(...args);
  const resistValue = (...args) => w.damage.resistValue(...args);
  const applyHit = (...args) => w.damage.applyHit(...args);
  const landLifeDamage = (...args) => w.damage.landLifeDamage(...args);
  const rollSkillDamage = (...args) => w.damage.rollSkillDamage(...args);
  const skillAbsorbAmount = (...args) => w.damage.skillAbsorbAmount(...args);
  const resolveMinionInheritance = (...args) => w.minionInheritance.resolve(...args);
  const applyMinionPlyBonus = (...args) => w.applyMinionPlyBonus(...args);
  const syncAttributeBequests = (...args) => w.bequests.sync(...args);
  const companionCueFlash = (...args) => w.companionCueFlash(...args);
  const companionCueSpec = (...args) => w.companionCueSpec(...args);
  const isDormant = actor => w.isDormant(actor);
  const shellArcFactor = (...args) => w.shellArcFactor(...args);
  const cosmeticSkillPaint = (_owner, actor, id) => w.host.presentation?.cosmetic?.(actor.id, id) ?? {};
  const affordTravel = (_owner, ...args) => w.host.space.travelHit(...args);
  const summonReservationUnit = (...args) => w.summonContracts.reservation(...args);
  const issueCommand = (...args) => w.issueCommand(...args);
  const PUSH_DAMPING = w.rules.pushDamping, PUSH_MAX_SPEED = w.rules.pushMaxSpeed;
  const XP_SCALE = w.rules.xpScale;
  const COMMAND_CFG = w.rules.commands;
  const TETHER_TICK = w.rules.tetherTick;
  const REVIVE_RADIUS = w.rules.partyRecovery.radius, REVIVE_DWELL = w.rules.partyRecovery.dwell;
  const DWELL_IDLE_GRACE = w.rules.partyRecovery.idleGrace;
  class Policies {
  applyThorns(victim, attacker, landed = 0) {
    if (attacker.dead || attacker.invulnerable || attacker === victim)
      return;
    const sc = victim.stanceRead();
    let total = victim.sheet.get("thorns", sc?.tags, sc?.extra) + landed * victim.sheet.get("thornsReflect", sc?.tags, sc?.extra);
    if (sc)
      total += victim.sheet.get("channelThorns", sc.tags, sc.extra);
    if (total <= 0)
      return;
    const dealt = total * attacker.sheet.get("damageTaken");
    const deedLifeBefore = attacker.life;
    attacker.life -= dealt;
    w.recordIndirectDamage(attacker, victim, deedLifeBefore);
    attacker.hitFlash = 0.1;
    attacker.hitFlashType = void 0;
    w.text(attacker.pos, Math.round(dealt).toString(), "#d88a50", 11);
    if (attacker.life <= 0 && !attacker.dead)
      w.kill(attacker, false, victim);
  }
  releasePrimedPours(a) {
    if (!a.primedPours.length || a.dead)
      return;
    const banked = a.primedPours;
    a.primedPours = [];
    for (const b of banked) {
      const inst = a.skills.find((s) => s?.def.id === b.skillId);
      if (!inst)
        continue;
      const payloadCues = payloadTransition(a, inst, "prime", true);
      if (payloadCues)
        w.flashes.push(payloadCues);
      const durScale = a.sheet.get("effectDuration", skillContextTags(inst), instanceMods(inst));
      const pourCrit = w.critMendMult(a, inst, a.pos);
      for (const fx of instanceEffects(inst)) {
        if (fx.type === "restoreOverTime") {
          w.startRestoreStream(a, a, inst, fx, b.chargesSpent, pourCrit);
        } else if (fx.type === "buff") {
          w.applyBuffEffect(a, inst, fx, durScale, 1);
        } else if (fx.type === "cleanse") {
          w.cleanseActor(a, fx.count ?? 2);
        } else if (fx.type === "restore") {
          w.applyRestore(a, fx, { tags: inst.def.tags });
        } else if (fx.type === "heal") {
          w.applyHealChained(a, inst, a, fx, 1);
        } else if (fx.type === "absorb") {
          w.grantAbsorb(a, skillAbsorbAmount(a, inst, fx.amount), fx.duration * durScale);
        } else if (fx.type === "ward") {
          a.gainWard(fx.amount * (fx.perCharge ? Math.max(1, b.chargesSpent) : 1));
        }
      }
      w.queueFollowUps(a, inst, b.aim ?? a.pos, b.chargesSpent);
    }
  }
  bankPools(caster, feed, amount) {
    if (amount <= 0)
      return;
    for (const inst of caster.skills) {
      const pl = inst?.def.pool;
      if (!pl)
        continue;
      const ratio = feed.type !== void 0 ? pl.fromDamage?.[feed.type] ?? 0 : pl.fromDot?.[feed.status] ?? 0;
      if (ratio <= 0)
        continue;
      const cap = pl.cap * caster.sheet.get("poolCap", skillContextTags(inst.def), instanceMods(inst));
      caster.pools.set(pl.id, Math.min(cap, (caster.pools.get(pl.id) ?? 0) + amount * ratio));
    }
  }
  triggerEligible(owner, inst) {
    if (replenishingDelivery(inst))
      return false;
    const def = inst.def;
    if (def.channel || instanceCastMode(inst) === "guard" || def.delivery.type === "aura" || def.delivery.type === "dash" || def.delivery.type === "blink" || def.delivery.type === "leap" || def.delivery.type === "carom" || def.pool || def.invokes || def.comboChain || def.delivery.type === "ground" && def.delivery.strobe)
      return false;
    if (owner.isStunned() || owner.tagsForbidden(inst))
      return false;
    if (w.castSealed(owner, inst))
      return false;
    if (w.castReqRefusal(owner, inst) !== void 0)
      return false;
    if (def.useTime > instanceTriggerLimit(inst)) {
      if (!instanceTriggerPermit(inst))
        return false;
      if (owner.casting)
        return false;
    }
    if (owner.cooldowns.has(def.id))
      return false;
    const cost = owner.skillCost(inst);
    return owner.canAfford({
      mana: cost.mana * TRIGGER_CFG.costMult,
      life: cost.life * TRIGGER_CFG.costMult
    });
  }
  rollTriggers(owner, kind, ctx = {}) {
    const skills = owner.skills;
    if (!skills?.length || owner.dead)
      return;
    const depth = ctx.depth ?? 0;
    if (depth >= TRIGGER_CFG.maxChainDepth)
      return;
    const start = ((owner.triggerRR.get(kind) ?? -1) + 1) % skills.length;
    for (let k = 0; k < skills.length; k++) {
      const idx = (start + k) % skills.length;
      const inst = skills[idx];
      if (!inst || inst === ctx.sourceInst)
        continue;
      const spec = instanceTrigger(inst);
      if (!spec || spec.on !== kind)
        continue;
      const st = inst.state ??= {};
      if (!instanceTriggerArmed(inst))
        continue;
      if (w.time < (st.trigReadyAt ?? 0))
        continue;
      const tags = skillContextTags(inst, grantedTags(inst));
      const extra = instanceMods(inst);
      if (kind === "damageTaken") {
        const frac = Math.max(0.05, owner.sheet.get("triggerThreshold", tags, extra, spec.lifeFrac ?? TRIGGER_CFG.lifeFrac));
        if ((st.trigAccum ?? 0) < frac * owner.maxLife())
          continue;
      }
      if (kind === "statusApply") {
        const need = Math.max(1, owner.sheet.get("triggerPower", tags, extra, spec.power ?? 1));
        if ((st.trigAccum ?? 0) < need)
          continue;
      }
      if (kind === "highRoll" && !w.rollTopMet(owner, spec.rollTop ?? TRIGGER_CFG.rollTop, ctx.rollT, tags, extra))
        continue;
      if (!w.triggerEligible(owner, inst))
        continue;
      owner.triggerRR.set(kind, idx);
      const p = owner.sheet.get("triggerChance", tags, extra, spec.chance ?? 1);
      if (!spec.guaranteed && !chance(Math.min(TRIGGER_CFG.chanceCap, p)))
        return;
      st.trigReadyAt = w.time + (spec.icd ?? TRIGGER_CFG.icd[kind]);
      if (kind === "damageTaken" || kind === "statusApply")
        st.trigAccum = 0;
      st.trigDepth = depth + 1;
      const cost = owner.skillCost(inst);
      w.paySkillCost(owner, inst, { mana: cost.mana * TRIGGER_CFG.costMult, life: cost.life * TRIGGER_CFG.costMult });
      const aim = ctx.aim ?? owner.aimPos ?? vec(owner.pos.x + Math.cos(owner.facing) * 140, owner.pos.y + Math.sin(owner.facing) * 140);
      if (inst.def.useTime > instanceTriggerLimit(inst)) {
        owner.casting = {
          inst,
          mode: "cast",
          aim: vec(aim.x, aim.y),
          elapsed: 0,
          total: Math.max(0.2, owner.skillUseTime(inst)),
          held: false,
          baseMult: 1,
          paidCost: { mana: cost.mana * TRIGGER_CFG.costMult, life: cost.life * TRIGGER_CFG.costMult }
        };
      } else {
        w.executeSkill(owner, inst, vec(aim.x, aim.y), {
          paidCost: { mana: cost.mana * TRIGGER_CFG.costMult, life: cost.life * TRIGGER_CFG.costMult }
        });
      }
      return;
    }
  }
  bankStatusTriggers(owner, statusId, at, depth = 0, sourceInst) {
    if (!owner.skills?.length || owner.dead)
      return;
    let any = false;
    for (const inst of owner.skills) {
      if (!inst)
        continue;
      const spec = instanceTrigger(inst);
      if (!spec || spec.on !== "statusApply")
        continue;
      if (spec.status !== void 0) {
        const list = Array.isArray(spec.status) ? spec.status : [spec.status];
        if (!list.includes(statusId))
          continue;
      }
      const st = inst.state ??= {};
      if (!instanceTriggerArmed(inst))
        continue;
      st.trigAccum = (st.trigAccum ?? 0) + 1;
      any = true;
    }
    if (any)
      w.rollTriggers(owner, "statusApply", { aim: at, depth, sourceInst });
  }
  bankDamageTakenTriggers(owner, amount, from) {
    if (amount <= 0 || !owner.skills?.length)
      return;
    let any = false;
    for (const inst of owner.skills) {
      if (!inst)
        continue;
      const spec = instanceTrigger(inst);
      if (!spec || spec.on !== "damageTaken")
        continue;
      const st = inst.state ??= {};
      if (!instanceTriggerArmed(inst))
        continue;
      st.trigAccum = (st.trigAccum ?? 0) + amount;
      any = true;
    }
    if (any) {
      w.rollTriggers(owner, "damageTaken", {
        aim: from && !from.dead ? vec(from.pos.x, from.pos.y) : void 0
      });
    }
  }
  sweepDefenseEvents(a, depth = 0) {
    if (a.poiseJustBroke) {
      a.poiseJustBroke = false;
      w.flashes.push(defenseCueFlash(a, "poise", "break", DEFENSE_CUE_CFG.poiseColor));
      w.rollOwnProcs(a, "poiseBroken", { depth });
    }
    if (a.poiseBracketHits.length) {
      const rungs = a.poiseBracketHits;
      a.poiseBracketHits = [];
      for (const frac of rungs)
        w.rollOwnProcs(a, "poiseBracket", { depth, bracket: frac });
    }
    if (a.poiseJustRearmed) {
      a.poiseJustRearmed = false;
      w.flashes.push(defenseCueFlash(a, "poise", "reform", DEFENSE_CUE_CFG.poiseColor));
      w.rollOwnProcs(a, "poiseRearmed", { depth });
    }
    if (a.esRechargeJustStarted) {
      a.esRechargeJustStarted = false;
      w.rollOwnProcs(a, "esRechargeStart", { depth });
    }
    if (a.esJustFilled) {
      a.esJustFilled = false;
      w.rollOwnProcs(a, "esFilled", { depth });
    }
  }
  recordCast(caster, def, asId) {
    if (w.time >= caster.comboWatchAt) {
      caster.comboWatchAt = w.time + COMBO_CFG.watchRefresh;
      let rules = null;
      for (const rule of COMBO_LIST) {
        if (caster.sheet.get(comboStat(rule.id)) > 0)
          (rules ??= []).push(rule);
      }
      let watch = !!rules || caster.sheet.usesCondition("comboVaried") || caster.sheet.usesCondition("comboRepeated");
      if (!watch && (caster.kind === "player" || caster.kind === "mercenary")) {
        outer: for (const inst of caster.skills) {
          if (!inst)
            continue;
          for (const m of instanceMods(inst)) {
            if (m.when === "comboVaried" || m.when === "comboRepeated") {
              watch = true;
              break outer;
            }
          }
        }
      }
      caster.comboRules = rules;
      caster.comboWatch = watch;
      if (!watch && caster.castRing) {
        caster.castRing = null;
        caster.comboCondBits = 0;
        caster.comboCondLeft = 0;
      }
    }
    if (!caster.comboWatch)
      return;
    const ring = caster.castRing ??= [];
    ring.push({ sid: asId ?? def.id, tags: def.tags, at: w.time, seq: ++caster.castSeq });
    if (ring.length > COMBO_CFG.ringCap)
      ring.shift();
    const varied = comboVariedNow(ring, w.time);
    const repeated = comboRepeatedNow(ring, w.time);
    caster.comboCondBits = (varied ? 1 : 0) | (repeated ? 2 : 0);
    caster.comboCondLeft = varied || repeated ? COMBO_CFG.conditionWindow : 0;
    if (!caster.comboRules)
      return;
    const windowScale = caster.sheet.get("comboWindow");
    for (const rule of caster.comboRules) {
      const span = matchComboRule(ring, rule, w.time, windowScale);
      if (span <= 0)
        continue;
      const fire = caster.comboFire?.get(rule.id);
      if (fire) {
        if (w.time - fire.at < (rule.icd ?? COMBO_CFG.defaultIcd))
          continue;
        if (!rule.overlap && ring[ring.length - span].seq <= fire.seq)
          continue;
      }
      (caster.comboFire ??= /* @__PURE__ */ new Map()).set(rule.id, { at: w.time, seq: caster.castSeq });
      w.executeProc({
        id: "combo:" + rule.id,
        name: rule.name,
        color: rule.color,
        trigger: "hit",
        effect: rule.effect,
        announceName: false
      }, caster, null, null, 0);
    }
  }
  paySkillCost(caster, inst, cost) {
    const paid = {
      mana: Math.max(0, Math.min(caster.mana, cost.mana)),
      life: caster.overdrive.life && caster.life <= cost.life ? 0 : Math.max(0, cost.life)
    };
    caster.payCost(cost);
    if (caster.construct)
      return;
    const ward = costWard(caster, inst, paid);
    if (ward.amount > 0 && ward.duration > 0)
      w.grantAbsorb(caster, ward.amount, ward.duration);
  }
  consumeChargeCost(caster, inst) {
    const cc = instanceChargeCost(inst);
    if (!cc)
      return { mult: 1, consumed: 0 };
    const have = caster.charges.get(cc.charge) ?? 0;
    const consumed = cc.amount === "all" ? have : Math.min(have, cc.amount);
    caster.spendCharge(cc.charge, consumed);
    return {
      mult: cc.damagePerCharge && consumed > 0 ? 1 + cc.damagePerCharge * consumed : 1,
      consumed
    };
  }
  consumeStealth(caster, def) {
    if (def.effects.some((fx) => fx.type === "gainCharge" && fx.charge === STEALTH_CHARGE))
      return;
    const offensive = def.breaksStealth ?? (!!def.baseDamage || def.effects.some((fx) => fx.type === "damage" || fx.type === "knockback" || fx.type === "pull"));
    if (!offensive)
      return;
    caster.concealmentExposedUntil = w.time + PERCEPTION_CFG.exposureSec;
    const have = caster.charges.get(STEALTH_CHARGE) ?? 0;
    if (have > 0)
      caster.spendCharge(STEALTH_CHARGE, 1);
    for (const [id, b] of [...caster.buffs]) {
      if (b.def.mods.some((m) => m.stat === "invisible"))
        caster.removeBuff(id);
    }
  }
  bankRune(caster, def) {
    if (caster.construct)
      return;
    const invoker = caster.skills.find((s) => s?.def.invokes);
    if (!invoker)
      return;
    const rune = runeForCast(def, invoker, caster.runes);
    if (!rune)
      return;
    const cap = Math.max(1, Math.round(caster.sheet.get("runeCap", skillContextTags(invoker.def), instanceMods(invoker))));
    while (caster.runes.length >= cap)
      caster.runes.shift();
    caster.runes.push(rune);
  }
  consumeAmmunition(caster, def) {
    for (const [id, buff] of [...caster.buffs]) {
      const c = buff.def.consumeOnUse;
      if (!c)
        continue;
      if (c.tags && !c.tags.some((t) => def.tags.includes(t)))
        continue;
      caster.consumeBuffStacks(id, 1);
    }
  }
  consumeRemnants(caster, def) {
    for (const el of ELEMENTAL_TYPES) {
      if (def.tags.includes(el) && caster.buffs.has("remnant_" + el)) {
        noteProcCue(caster, caster.buffs.get("remnant_" + el).def.storedCue, "release", "remnant:" + el);
        caster.removeBuff("remnant_" + el);
      }
    }
  }
  rollKillRemnants(caster, inst, at) {
    if (caster.construct || w.remnants.length >= 14)
      return;
    const tags = skillContextTags(inst, grantedTags(inst));
    const extra = instanceMods(inst);
    for (const kind of Object.values(REMNANT_KINDS)) {
      const c = caster.sheet.get(remnantDropStat(kind.id), tags, extra);
      if (c <= 0 || !chance(Math.min(0.75, c)))
        continue;
      const ang = rand(0, Math.PI * 2);
      const r = rand(10, 40);
      w.remnants.push({
        pos: w.clampPos(vec(at.x + Math.cos(ang) * r, at.y + Math.sin(ang) * r), 8),
        kind: kind.id,
        bob: rand(0, Math.PI * 2),
        life: 12
      });
      if (w.remnants.length >= 14)
        break;
    }
  }
  victimGate(ids, victim, attacker) {
    for (const id of ids) {
      const def = VICTIM_CONDITIONS[id];
      const holds = def ? def.test(victim, attacker, { time: w.time }) : victim.statuses.some((st) => st.id === id && st.stacks > 0);
      if (!holds)
        return false;
    }
    return true;
  }
  isEliteVictim(a) {
    return a.rarity === "rare" || a.rarity === "champion" || a.rarity === "crowned" || !!(a.defId && MONSTERS[a.defId]?.boss);
  }
  minionsOfSkill(owner, skillId) {
    return w.actors.filter((a) => a.owner === owner && !a.dead && !a.summonInst?.companionGrant && a.sourceSkillId === skillId);
  }
  minionsOfGroup(owner, group) {
    return w.actors.filter((a) => a.owner === owner && !a.dead && !a.summonInst?.companionGrant && a.sourcePoolGroup === group);
  }
  minionServes(m, skillId) {
    return m.sourceSkillId === skillId || m.sourceSkillId === "__companion:" + skillId || m.sourceSkillId === throngMarkerOf(skillId);
  }
  companionsOfSkill(keeper, skillId) {
    return w.actors.filter((a) => a.companion && !a.dead && a.owner === keeper && a.sourceSkillId === "__companion:" + skillId);
  }
  tickChannelSupports(a, cs, dt) {
    const tags = skillContextTags(cs.inst.def);
    const extra = instanceMods(cs.inst);
    const speed = a.speedFactor(cs.inst);
    if (cs.mode === "guard") {
      const mend = a.sheet.get("guardMend", tags, extra);
      if (mend > 0) {
        const hp = a.sheet.get("healPower", tags, extra);
        for (const ally of w.actors) {
          if (ally.dead || ally.team !== a.team || ally === a || !sameStory(ally, a))
            continue;
          if (dist(a.pos, ally.pos) > 160)
            continue;
          ally.healBy(mend * hp * dt);
        }
      }
    }
    const burst = a.sheet.get("channelBurst", tags, extra);
    if (burst > 0) {
      cs.burstTimer = (cs.burstTimer ?? 2 / speed) - dt;
      if (cs.burstTimer <= 0) {
        cs.burstTimer = 2 / speed;
        const radius = 95 * a.sheet.get("aoeRadius", tags, extra);
        for (const e of w.enemiesOf(a)) {
          if (!sameStory(a, e))
            continue;
          if (dist(a.pos, e.pos) - e.radius <= radius) {
            w.resolveHit(a, cs.inst, e, burst, 1, void 0, true);
          }
        }
        w.flashes.push({
          pos: vec(a.pos.x, a.pos.y),
          radius,
          color: "#ff8a4a",
          life: 0.25,
          maxLife: 0.25
        });
      }
    }
    const storm = a.sheet.get("channelStorm", tags, extra);
    if (storm > 0) {
      cs.stormTimer = (cs.stormTimer ?? 1.1 / speed) - dt;
      if (cs.stormTimer <= 0) {
        cs.stormTimer = 1.1 / speed;
        const ang = rand(0, Math.PI * 2);
        const r = rand(40, 210);
        w.zones.push({
          pos: w.clampPos(vec(a.pos.x + Math.cos(ang) * r, a.pos.y + Math.sin(ang) * r), 10),
          radius: 52 * a.sheet.get("aoeRadius", tags, extra),
          caster: a,
          inst: cs.inst,
          color: "#ffe14a",
          delay: 0.25,
          exploded: false,
          linger: 0,
          tickInterval: 0.5,
          tickTimer: 0,
          shape: 0,
          facing: ang,
          dmgMult: storm,
          depth: 1,
          forceDamage: true
        });
      }
    }
  }
  actorTurnRate(a) {
    return a.sheet.get(BEHAVIOR_STATS.turnSpeed, void 0, void 0, w.seatOf(a) ? 0 : a.turnSpeed);
  }
  castTurnRate(a, authored) {
    const body = w.actorTurnRate(a);
    return body > 0 ? Math.min(body, authored) : authored;
  }
  assaultBladeHit(caster, inst, target, power) {
    w.resolveHit(caster, inst, target, power, 1);
  }
  healAlliesInArea(caster, inst, accepts, mult = 1, quiet = false, once) {
    const fxs = inst.def.effects.filter((fx) => fx.type === "heal" || fx.type === "cleanse");
    if (!fxs.length)
      return;
    for (const a of w.actors) {
      if (a.dead || a.downed || a.untargetable || a.construct || a.team !== caster.team || !sameStory(a, caster))
        continue;
      if (once?.has(a.id))
        continue;
      if (!accepts(a))
        continue;
      let touched = false;
      for (const fx of fxs) {
        if (fx.type === "heal" && fx.excludeCaster && a === caster)
          continue;
        touched = true;
        if (fx.type === "heal")
          w.applyHealChained(caster, inst, a, fx, mult, quiet);
        else
          w.cleanseActor(a, fx.count ?? 2);
      }
      if (touched)
        once?.add(a.id);
    }
  }
  enemiesOf(actor) {
    return w.actors.filter((a) => (w.hostileTo(actor, a) || a.construct?.breakable !== void 0 && a.owner === actor) && !a.dead && !a.untargetable && !a.downed);
  }
  skillOcclusion(caster, inst) {
    const d = inst.def.delivery;
    const base = d.occlusion ?? LOS_CFG.delivery[d.type] ?? "free";
    if (base === "free")
      return "free";
    return caster.sheet.get("phasing", skillContextTags(inst, grantedTags(inst)), instanceMods(inst)) > 0 ? "free" : base;
  }
  spawnAftershocks(caster, inst, at, radius, shape, depth = 0) {
    if (depth > 0)
      return;
    const tags = skillContextTags(inst);
    const extra = instanceMods(inst);
    const scatter = Math.round(caster.sheet.get("aoeScatter", tags, extra));
    for (let i = 0; i < scatter; i++) {
      const ang = rand(0, Math.PI * 2);
      const r = rand(radius * 0.4, radius * 1.1);
      w.zones.push({
        pos: w.clampPos(vec(at.x + Math.cos(ang) * r, at.y + Math.sin(ang) * r), 10),
        radius: radius * 0.5,
        caster,
        inst,
        color: inst.def.color,
        delay: 0.3 + i * 0.12,
        exploded: false,
        linger: 0,
        tickInterval: 0.5,
        tickTimer: 0,
        shape,
        facing: ang,
        dmgMult: 0.5,
        depth: 1
      });
    }
  }
  castChrono(caster, spec, id, duration, label) {
    let actors;
    if (!spec.world) {
      const ex = spec.exempt ?? "pack";
      actors = ex === "caster" ? { exceptIds: [caster.id] } : ex === "pack" ? { exceptIds: [caster.id], exceptOwnedBy: [caster.id] } : ex === "team" ? { exceptTeam: caster.team } : {};
    }
    w.timeflow.hold({
      id,
      scale: spec.scale,
      kind: "skill",
      duration,
      actors,
      hud: spec.hud ?? {
        tint: "rgba(150,200,225,0.14)",
        label: label ?? "time bends"
      }
    });
  }
  isPrey(a, b) {
    if (!a.brain || a === b || b.dead)
      return false;
    const prey = a.aiPrey ?? normalizeBrain(a.brain).base.target?.prey;
    if (!prey || !prey.length)
      return false;
    if (b.defId === a.defId)
      return false;
    if (a.squadId !== void 0 && b.squadId === a.squadId)
      return false;
    if (b.statuses.some((s) => STATUS_DEFS[s.id]?.smellsOfPrey))
      return true;
    return prey.some((p) => b.tag === p || b.faction === p || b.defId === p);
  }
  failNote(a, key, msg) {
    if (a !== w.player)
      return;
    const last = w.failNoteAt.get(key) ?? -9;
    if (w.time - last < 1.4)
      return;
    w.failNoteAt.set(key, w.time);
    w.text(a.pos, msg, "#8a8678", 11);
  }
  forwardSummonSockets(summonInst, skills, opts) {
    if (!summonInst)
      return;
    const summonHost = summonInst.def.delivery.type === "summon" || !!instanceSummon(summonInst);
    if (summonHost && !crewBoardingOpen(summonInst))
      return;
    const carried = summonInst.grafts?.length ? [...summonInst.sockets, ...summonInst.grafts] : summonInst.sockets;
    let grew = true;
    while (grew) {
      grew = false;
      for (const socket of carried) {
        if (!socket || !supportRidesMinions(socket.def))
          continue;
        for (const sk of skills) {
          if (!sk || sk.sockets.some((x) => x?.def.id === socket.def.id))
            continue;
          if (!supportFitsInst(socket.def, sk, socket.rolled))
            continue;
          sk.sockets.push({
            def: socket.def,
            level: socket.level,
            forwarded: true,
            ...socket.rolled ? { rolled: { ...socket.rolled } } : {},
            ...opts?.scale !== void 0 && opts.scale !== 1 ? { forwardScale: opts.scale } : {}
          });
          grew = true;
        }
      }
    }
  }
  bakeMinionOwnerStats(minion, caster, inst, scale = 1) {
    const relic = !!inst.relicSource;
    const inherited = resolveMinionInheritance(caster, inst, minion.defId, scale);
    for (const source of minion.sheet.sourceNames())
      if (source.startsWith("relic:"))
        minion.sheet.removeSource(source);
    if (relic) {
      w.relevelActor(minion, Math.max(1, Math.floor(caster.level * RELIQUARY_CFG.minion.levelFactor)));
      const power = w.relicPower(caster);
      const factor = 1 + power * RELIQUARY_CFG.minion.empowerment;
      minion.sheet.setSource("relic:" + inst.relicSource, [
        mod("damage", "more", RELIQUARY_CFG.minion.baseDamage * factor - 1),
        mod("life", "more", RELIQUARY_CFG.minion.baseLife * factor - 1)
      ]);
    }
    const throngSpentPlies = Math.max(0, minion.pliesMax - minion.plies);
    minion.sheet.setSource("minionCombat", inherited.combatMods);
    minion.sheet.setSource("owner", inherited.ownerMods);
    minion.radius = Math.max(5, (inst.def.throng || inst.def.hivecall ? MONSTERS[minion.defId]?.radius ?? minion.radius : minion.radius) * inherited.size);
    syncAttributeBequests(minion, relic ? scale * RELIQUARY_CFG.minion.ordinaryStats : scale, inherited.tags, inherited.extra);
    minion.guardMode = inherited.guard;
    applyMinionPlyBonus(minion, inherited.plyBonus);
    if (!inst.def.throng)
      return;
    minion.summonInst = inst;
    const evo = throngEvolution(inst), units = minion.throngUnits ?? 1;
    minion.sheet.setSource("throngEvolution:body", [
      mod("life", "more", units - 1),
      mod("damage", "more", units - 1),
      mod("damage", "more", evo.damageMore ?? 0)
    ]);
    if (evo.cluster) {
      const bonus = throngClusterPlies(units);
      minion.pliesMax += bonus;
      minion.plies = Math.max(0, minion.pliesMax - throngSpentPlies);
      minion.radius *= Math.min(8, Math.sqrt(units));
    }
  }
  conjurationLifeline(conjurer) {
    if (w.seatOf(conjurer))
      return void 0;
    return w.seats.some((s) => s.actor.team === conjurer.team) ? conjurer.id : void 0;
  }
  armAmbush(a, spec) {
    a.ambushArmed = true;
    if (!spec.visible) {
      a.untargetable = true;
      a.sheet.setSource("ambush", [mod("invisible", "flat", 1)]);
    }
  }
  applyPartyScale(a) {
    const s = coopScale(w.partyScaleCount());
    if (s.life > 0 || s.damage > 0) {
      a.sheet.setSource("partyScale", [mod("life", "more", s.life), mod("damage", "more", s.damage)]);
    } else {
      a.sheet.removeSource("partyScale");
    }
  }
  relayStatus = (owner, args) => {
    if (owner.dead || owner.downed)
      return false;
    for (const id of owner.sheet.armedFamily("relayStatus_", STATUS_RELAY_IDS)) {
      const relay = STATUS_RELAYS[id];
      if (relay.status !== args[0] || owner.sheet.get(relayStatusStat(id)) <= 0)
        continue;
      let nearest, reach = relay.radius;
      for (const enemy of w.enemiesOf(owner)) {
        if (!sameStory(owner, enemy) || enemy.dead || enemy.untargetable || enemy.invulnerable || enemy.passive)
          continue;
        const d = dist(owner.pos, enemy.pos);
        if (d < reach) {
          reach = d;
          nearest = enemy;
        }
      }
      if (!nearest)
        continue;
      nearest.applyStatus(args[0], args[1], args[2], owner.name, { ...args[4], casterId: owner.id, relayed: true });
      return true;
    }
    return false;
  };
  presenceMoment(a, phase) {
    const badge = a.presenceBadge, fx = badge && skillPresenceVoice(badge.skillId, phase);
    if (!badge || !fx)
      return false;
    if (phase === "pulse") {
      if (w.time - (w.presencePulseAt.get(a) ?? -Infinity) < 0.12)
        return true;
      w.presencePulseAt.set(a, w.time);
    }
    const life = PRESENCE_STYLE[phase];
    w.flashes.push({
      pos: { ...a.pos },
      radius: Math.min(56, a.radius + (phase === "pulse" ? 12 : 20)),
      color: badge.color,
      life,
      maxLife: life,
      fx,
      recoveryCueTier: a.tier
    });
    return true;
  }
  releaseStruckSummons(caster, inst, touches, struck, direction = caster.facing) {
    const receptive = w.strikeReleaseBodies.get(caster);
    if (!receptive?.size)
      return;
    const tags = skillContextTags(inst);
    for (const body of [...receptive]) {
      if (body.dead || !w.actors.includes(body)) {
        receptive.delete(body);
        continue;
      }
      if (body.owner !== caster || body.team !== caster.team || body.dead || body.downed || body.summonReform || body.untargetable || body.summonOffspring || body.summonInst?.companionGrant || !sameStory(caster, body) || !body.summonInst || struck?.has(body.id) || !touches(body))
        continue;
      const d = instanceDelivery(body.summonInst);
      const release = d.type === "summon" ? d.strikeRelease : void 0;
      if (!release || !release.tags.every((tag) => tags.has(tag)))
        continue;
      const payload = body.skills.find((skill) => skill?.def.id === release.skill);
      if (!payload || payload.def.delivery.type !== "projectile")
        continue;
      struck?.add(body.id);
      const duration = Math.max(0.1, release.reformTime * caster.sheet.get("minionRespawnTime", skillContextTags(body.summonInst), instanceMods(body.summonInst)));
      body.summonReform = { remaining: duration, duration, invulnerable: body.invulnerable, untargetable: body.untargetable };
      body.invulnerable = true;
      body.untargetable = true;
      body.casting = null;
      body.sheet.setSource("summon:reform", [mod("moveSpeed", "more", -1)]);
      body.facing = direction;
      w.executeSkill(body, payload, vec(body.pos.x + Math.cos(direction) * 800, body.pos.y + Math.sin(direction) * 800), { keepFacing: true, noCooldown: true, noRepeat: true, componentUse: true });
    }
  }
  updateSummonReforms(dt) {
    for (const body of w.actors) {
      const state = body.summonReform;
      if (!state || body.dead)
        continue;
      state.remaining -= dt * w.timeflow.actorScale(body);
      if (state.remaining > 0)
        continue;
      body.invulnerable = state.invulnerable;
      body.untargetable = state.untargetable;
      body.sheet.removeSource("summon:reform");
      body.summonReform = void 0;
      w.flashes.push({ pos: { ...body.pos }, radius: body.radius * 2, color: body.color, life: 0.25, maxLife: 0.25 });
    }
  }
  clearSummonReleaseFields(owner, inst) {
    const d = instanceDelivery(inst);
    if (d.type !== "summon" || !d.strikeRelease)
      return;
    const payloads = [
      ...w.projectiles,
      ...w.zones,
      ...w.pendingRepeats,
      ...w.pendingFuses,
      ...w.pendingSalvos,
      ...w.pendingSteps,
      ...w.pendingFollowUps
    ];
    const bodies = /* @__PURE__ */ new Set([...w.actors, ...payloads.map((p) => p.caster)]);
    for (const body of bodies)
      if (body.owner === owner && body.summonInst === inst) {
        const skills = /* @__PURE__ */ new Set([
          ...body.skills.filter((s) => !!s),
          ...payloads.filter((p) => p.caster === body).map((p) => p.inst)
        ]);
        for (const skill of skills)
          w.clearTreeFields(body, skill);
      }
  }
  clearTreeFields(caster, inst) {
    w.guardArts.clear(caster, inst);
    w.attackSequences.clear(caster, inst);
    w.challenges.clear(caster, inst);
    const ownsTreePayload = (candidate) => candidate === inst || candidate.invocationHost === inst || candidate.followUpHost === inst || candidate.challengeHost === inst || candidate.guardArtsHost === inst;
    w.pendingFollowUps = w.pendingFollowUps.filter((p) => p.caster !== caster || !ownsTreePayload(p.inst));
    caster.primedPours = caster.primedPours.filter((p) => p.skillId !== inst.def.id);
    caster.clearTreeChargeClocks(inst);
    if (inst.def.invokes)
      caster.runes = [];
    if (caster.activeAuras.get(inst.def.id)?.inst === inst)
      w.deactivateAura(caster, inst.def.id, true);
    w.clearTreeConstructs(caster, inst);
    caster.castCycles.delete(inst.def.id);
    for (const [key, step] of caster.metaInsts)
      if (step.chainOf === inst.def.id) {
        w.clearTreeFields(caster, step);
        caster.metaInsts.delete(key);
      }
    w.retireTreeBuffs(caster, inst);
    w.pendingFuses = w.pendingFuses.filter((f) => f.caster !== caster || !ownsTreePayload(f.inst));
    w.pendingBlinks = w.pendingBlinks.filter((b) => {
      const keep = b.actor !== caster || !b.inst || !ownsTreePayload(b.inst);
      if (!keep && b.visual)
        b.visual.life = 0;
      return keep;
    });
    w.pendingRepeats = w.pendingRepeats.filter((r) => r.caster !== caster || !ownsTreePayload(r.inst));
    w.pendingSalvos = w.pendingSalvos.filter((r) => r.caster !== caster || !ownsTreePayload(r.inst));
    w.pendingSteps = w.pendingSteps.filter((r) => r.caster !== caster || !ownsTreePayload(r.inst));
    w.projectiles = w.projectiles.filter((p) => p.caster !== caster || !ownsTreePayload(p.inst) && w.recallTreeSpears.get(p.inst) !== inst);
    for (const p of w.projectiles)
      if (p.caster === caster && p.suffuse?.inst === inst)
        delete p.suffuse;
    if (caster.casting?.inst === inst)
      caster.casting = null;
    if (caster.shellGuard?.fromAura === inst.def.id)
      caster.shellGuard = void 0;
    for (let i = w.zones.length - 1; i >= 0; i--) {
      const z = w.zones[i];
      if (z.caster !== caster || !ownsTreePayload(z.inst))
        continue;
      w.expireZone(z);
      w.zones.splice(i, 1);
    }
  }
  clearTreeConstructs(caster, inst) {
    const bodies = /* @__PURE__ */ new Set([
      ...w.actors,
      ...w.projectiles.map((p) => p.caster),
      ...w.zones.map((z) => z.caster),
      ...w.pendingFuses.map((f) => f.caster),
      ...w.pendingRepeats.map((r) => r.caster)
    ]);
    for (const body of bodies)
      if (body.construct && body.owner === caster && body.summonInst === inst) {
        w.clearTreeFields(body, inst);
        if (body.construct.castInst && body.construct.castInst !== inst)
          w.clearTreeFields(body, body.construct.castInst);
        const capturedTreePayloads = new Set([...w.projectiles, ...w.zones, ...w.pendingFuses, ...w.pendingRepeats].filter((payload) => payload.caster === body).map((payload) => payload.inst));
        for (const payload of capturedTreePayloads)
          w.clearTreeFields(body, payload);
        for (const id of [...body.activeAuras.keys()])
          w.deactivateAura(body, id, true);
        body.casting = null;
        body.dead = true;
        body.life = 0;
      }
  }
  accumulateDotText(a, dot, dt) {
    let acc = w.dotAccum.get(a.id);
    if (!acc) {
      acc = { amount: 0, timer: 0 };
      w.dotAccum.set(a.id, acc);
    }
    acc.amount += dot;
    acc.timer += dt;
    if (acc.timer >= 0.5 && acc.amount >= 1) {
      w.text(a.pos, Math.round(acc.amount).toString(), "#d88a50", 11, "dmg");
      acc.amount = 0;
      acc.timer = 0;
    }
  }
  emergeBody(a, opts = {}) {
    if (a.dead)
      return null;
    const def = a.defId ? MONSTERS[a.defId] : void 0;
    const ground = opts.ground ?? w.emergeGroundAt(a.pos, a.tier);
    const spec = emergeFor([opts.spec, def?.emerge], ground, !!opts.host);
    if (!spec)
      return null;
    w.flashes.push({
      pos: vec(a.pos.x, a.pos.y),
      radius: a.radius * 2.2,
      color: a.color,
      life: 0.35,
      maxLife: 0.35,
      ...spec.haze ? { haze: spec.haze } : spec.voice ? { fx: spec.voice } : {}
    });
    if (w.emergences.length >= EMERGE_CFG.maxLive)
      return null;
    const seed = emergeSeedOf(a.pos.x, a.pos.y, a.id);
    const rec = {
      actorId: a.id,
      pos: vec(a.pos.x, a.pos.y),
      radius: a.radius,
      seed,
      spec,
      at: w.time,
      life: spec.life,
      maxLife: spec.life,
      held: spec.hold
    };
    if (spec.hold) {
      a.emergeHeldTargetable = a.untargetable;
      a.untargetable = true;
      a.emergeUntil = w.time + spec.life;
    }
    w.emergences.push(rec);
    return rec;
  }
  updateEmergences(dt) {
    for (let i = w.emergences.length - 1; i >= 0; i--) {
      const r = w.emergences[i];
      r.life -= dt;
      if (r.life > 0)
        continue;
      w.emergences.splice(i, 1);
      if (!r.held)
        continue;
      const a = w.actorById(r.actorId);
      if (!a)
        continue;
      a.untargetable = a.emergeHeldTargetable ?? false;
      a.emergeHeldTargetable = void 0;
      a.emergeUntil = void 0;
    }
  }
  showRecoveryCue(a, kind, inst) {
    const recoveryCue = (inst ?? a.summonInst)?.def.recoveryCues?.[kind] ?? (a.defId ? MONSTERS[a.defId]?.recoveryCues?.[kind] : void 0);
    if (recoveryCue === false)
      return;
    const recoveryCueFlashAt = w.flashes.length;
    const recoveryCueBody = w.emergeBody(a, { spec: { ...RECOVERY_CUES[kind], ...recoveryCue, hold: false } });
    if (recoveryCueBody)
      recoveryCueBody.recoveryCueTier = a.tier ?? 0;
    if (w.flashes[recoveryCueFlashAt])
      w.flashes[recoveryCueFlashAt].recoveryCueTier = a.tier ?? 0;
  }
  showCompanionCue(a, event, from, spec = companionCueSpec(a)) {
    const companionCue = companionCueFlash(a, event, from, spec);
    if (companionCue)
      w.flashes.push(companionCue);
  }
  attackSequenceBurst(caster, inst, target, amount) {
    if (target.dead || target.invulnerable || amount <= 0)
      return;
    const before = target.life;
    const taken = mitigateTyped(target, { physical: amount }, { attacker: caster, tags: skillContextTags(inst), extra: instanceMods(inst) });
    landLifeDamage(target, taken);
    w.recordIndirectDamage(target, caster, before);
    w.observers?.onDot?.(target, taken, "physical");
    target.hitFlash = 0.15;
    target.hitFlashType = "physical";
    w.text(target.pos, String(Math.round(taken)), "#bc4540", 14, "combat");
    w.flashes.push({ pos: { ...target.pos }, radius: target.radius + 18, color: "#c6453b", life: 0.25, maxLife: 0.25 });
    if (target.life <= 0 && !target.dead)
      w.kill(target, false, caster);
  }
  challengeBurst(caster, target, amount) {
    const taken = mitigateTyped(target, { physical: amount });
    if (taken <= 0 || target.dead)
      return;
    target.life -= taken;
    target.hitFlash = 0.15;
    w.text(target.pos, `REOPENED ${Math.round(taken)}`, "#d96962", 13, "combat");
    if (target.life <= 0)
      w.kill(target, false, caster);
  }
  challengeHit(caster, inst, target, power) {
    w.resolveHit(caster, inst, target, power, 1);
  }
  companionCapOf(inst) {
    const fx = inst.def.effects.find((f) => f.type === "tame");
    return Math.max(1, (fx?.slots ?? 1) + instanceTameMod(inst).slotsAdd);
  }
  companionPulseHit(beast, inst, target, power) {
    w.resolveHit(beast, inst, target, power, 1);
  }
  guardArtCooldown(a, inst) {
    w.stampSkillCooldown(a, inst, inst.def.cooldown);
  }
  guardArtHit(a, inst, target, flat, push = 0) {
    w.resolveHit(a, inst, target, 1, 1, flat, true, false, push > 0 ? [{ type: "knockback", strength: push }] : []);
  }
  guardBash(a, inst, bash, payloadShield) {
    if (a.dead || payloadShield <= 0)
      return;
    const { radius: reach, arc: arcRad, fullCircle } = guardBashGeometry(a, bash);
    const elem = ["fire", "cold", "lightning"].find((e) => inst.def.tags.includes(e) || grantedTags(inst).includes(e));
    const power = a.sheet.get("bashPower", skillContextTags(inst, grantedTags(inst)), instanceMods(inst));
    const flat = { [elem ?? "physical"]: payloadShield * bash.mult * power };
    w.guardArts.bashWave(a, inst, flat);
    const hitEffects = [];
    if (bash.knockback)
      hitEffects.push({ type: "knockback", strength: bash.knockback });
    if (bash.stunChance)
      hitEffects.push({ type: "status", status: "stun", chance: bash.stunChance });
    for (const e of w.enemiesOf(a)) {
      if (!sameStory(a, e))
        continue;
      if (dist(a.pos, e.pos) - e.radius > reach)
        continue;
      if (!fullCircle && Math.abs(angleDiff(a.facing, angleTo(a.pos, e.pos))) > arcRad / 2)
        continue;
      w.resolveHit(a, inst, e, 1, 0, flat, true, false, hitEffects);
    }
    w.flashes.push({
      pos: vec(a.pos.x, a.pos.y),
      radius: reach,
      color: inst.def.color,
      life: 0.25,
      maxLife: 0.25,
      fx: skillSelfVoice(inst.def.id, "burst"),
      recoveryCueTier: a.tier,
      ...fullCircle ? {} : { arc: { facing: a.facing, arcRad } }
    });
    w.flashes.push(defenseCueFlash(a, "guard", "bash", inst.def.color, { arc: fullCircle ? Math.PI * 2 : arcRad }));
  }
  inheritedFlight(p, specInherit) {
    const frac = Math.min(1, p.inheritFrac + (specInherit ?? 0));
    if (frac <= 0)
      return void 0;
    return {
      homing: p.homing * frac,
      erratic: p.erratic * frac,
      spiral: p.spiral * frac,
      orbit: p.orbit * frac,
      spin: p.spin * frac,
      weave: p.weave * frac,
      amp: p.amp * frac,
      orbitR0: p.orbitR0 * frac
    };
  }
  retireOwnedZone(zone) {
    const index = w.zones.indexOf(zone);
    if (index < 0)
      return;
    w.expireZone(zone);
    w.zones.splice(index, 1);
  }
  plantSpiritTotem(caster, inst, aim) {
    const def = inst.def;
    w.spawnConstruct(caster, inst, {
      type: "construct",
      kind: "totem",
      range: def.ai?.range ?? 420,
      duration: 8,
      maxActive: 1,
      life: 45,
      placeRange: 90
    }, aim, inst);
  }
  shedOrb(kind, at, opts) {
    const def = ORB_DEFS[kind];
    if (!def || w.orbs.length >= ORB_CAP)
      return;
    const s = opts?.scatter ?? 0;
    const p = vec(at.x + (s ? rand(-s, s) : 0), at.y + (s ? rand(-s, s) : 0));
    const story = opts?.tier ?? w.spoilStory;
    w.orbs.push({
      pos: opts?.clamp === false ? p : w.clampPos(p, 8, void 0, story !== void 0 && story >= 1 ? { tier: story } : void 0),
      kind,
      amount: opts?.amount ?? orbAmount(def, w.encounter.level),
      bob: rand(0, Math.PI * 2),
      life: opts?.life ?? def.life ?? 12,
      homeTo: opts?.homeTo,
      flowFromTier: opts?.flowFromTier,
      tier: story
    });
    w.observers?.onOrbShed?.(kind);
  }
  pushActor(target, dir, strength, caster, inst, opts) {
    if (target.construct && !target.construct.massed || target.anchored || target.leap || isDormant(target))
      return;
    if (target.heldBy !== void 0) {
      const holder = w.actorById(target.heldBy);
      const hold = holder?.gripping;
      if (hold && hold.id === target.id)
        hold.struggle += strength * GRAB_CFG.break.shoveFeed;
      return;
    }
    if (target.gripping && strength >= GRAB_CFG.release.shove) {
      w.grabRelease(target);
    }
    if (target.clingTo)
      w.clingRelease(target);
    const auth = caster && !opts?.noAuthority ? shoveAuthority(caster, inst) : 1;
    const eff = strength * auth / target.effectiveWeight();
    const vx = Math.cos(dir) * eff * PUSH_DAMPING;
    const vy = Math.sin(dir) * eff * PUSH_DAMPING;
    const p = target.push;
    if (p) {
      p.vx += vx;
      p.vy += vy;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > PUSH_MAX_SPEED) {
        p.vx *= PUSH_MAX_SPEED / sp;
        p.vy *= PUSH_MAX_SPEED / sp;
      }
      if (caster && inst) {
        p.caster = caster;
        p.inst = inst;
        p.collided = false;
      }
    } else {
      target.push = { vx, vy, caster, inst };
    }
  }
  springAmbush(a, quiet = false) {
    if (!a.ambushArmed || a.dead)
      return;
    a.ambushArmed = false;
    a.untargetable = false;
    a.sheet.setSource("ambush", []);
    const spec = a.ambushSpec ?? (a.defId ? MONSTERS[a.defId]?.ambush : void 0);
    w.emergeBody(a, { spec: spec?.emerge ?? (spec?.visible ? { motion: "stir" } : void 0) });
    if (spec?.pack) {
      for (const k of w.actors) {
        if (k === a || k.dead || !k.ambushArmed || k.team !== a.team || !sameStory(k, a))
          continue;
        if (dist(a.pos, k.pos) <= spec.pack)
          w.springAmbush(k, true);
      }
    }
  }
  reflectParriedProjectile(p, guardian, power, parryPacket) {
    const previous = p.caster;
    if (!p.parryDamage) {
      const packet = parryPacket ?? rollSkillDamage(previous, p.inst, p.flat);
      for (const type of Object.keys(packet.amounts))
        packet.amounts[type] *= p.mult;
      p.parryDamage = { packet, power, reflections: 0 };
    }
    p.parryDamage.power = Math.max(0, power);
    p.parryDamage.reflections++;
    if (p.parryDamage.reflections > DEFENSE_CFG.parry.maxReflections) {
      p.dissolved = true;
      return;
    }
    p.dir = p.guideDir = dist(p.pos, previous.pos) > 0.01 ? angleTo(p.pos, previous.pos) : p.dir + Math.PI;
    p.caster = guardian;
    p.anchor = vec(p.pos.x, p.pos.y);
    p.origin = vec(p.pos.x, p.pos.y);
    p.homing = p.guide = p.orbit = p.spiral = p.spin = p.weave = p.erratic = 0;
    p.guided = false;
    p.returnMode = 0;
    p.returnPhase = false;
    p.landAt = p.destAt = void 0;
    p.patrol = p.zig = void 0;
    p.preyId = p.orbitAnchorId = void 0;
    p.hits.clear();
    p.lastHitId = void 0;
    p.range = Math.max(p.range, p.traveled, dist(p.pos, previous.pos) + previous.radius + p.radius);
    p.traveled = 0;
    if (p.maxAge !== void 0)
      p.maxAge = p.age + p.range / Math.max(1, p.speed);
  }
  resolveParryDamage(caster, target, payload, scale = 1, threatPos = caster.pos) {
    const parrySegment = target.segHitPending;
    target.segHitPending = void 0;
    if (target.dead || target.invulnerable || !w.parryDamageWindow.ready(target, w.time))
      return;
    const packet = parryCounter(payload, scale);
    if (!Object.values(packet.amounts).some((v) => (v ?? 0) > 0))
      return;
    if (w.tryShellBlock(target, threatPos, packet, caster)) {
      w.parryDamageWindow.spend(target, w.time);
      return;
    }
    const before = target.life;
    target.segHitPending = parrySegment;
    const result = applyHit(caster, target, packet);
    if (!result.evaded && !result.immune && (!result.blocked || result.total > 0 || result.plyEaten)) {
      w.parryDamageWindow.spend(target, w.time);
    }
    w.recordIndirectDamage(target, caster, before);
    if (result.clamped)
      w.showCombatOutcome(target, "hit_cap", threatPos);
    if (result.culled)
      w.showCombatOutcome(target, "culled", threatPos);
    if (result.total > 0)
      w.text(target.pos, Math.round(result.total).toString(), "#ffd700", 14);
    if (target.life <= 0 && !target.dead)
      w.kill(target, false, caster);
  }
  tryGuardBlock(victim, attacker, threatPos, rawDamage, parryProjectile, parryPacket) {
    const guardian = w.guardianFor(victim);
    if (!guardian)
      return false;
    const cs = guardian.casting;
    const spec = cs.inst.def.guard;
    if (!spec || (cs.shield ?? 0) <= 0)
      return false;
    const arc = guardArcRadians(guardian);
    if (Math.abs(angleDiff(guardian.facing, angleTo(guardian.pos, threatPos))) > arc / 2)
      return false;
    w.observers.guardBlocked?.(guardian, attacker, rawDamage);
    const gtags = skillContextTags(cs.inst.def);
    const gextra = instanceMods(cs.inst);
    const window = spec.parry?.window ?? guardian.sheet.get("guardParry", gtags, gextra);
    const counterMult = (spec.parry?.counterMult ?? guardian.sheet.get("guardParryPower", gtags, gextra)) + guardian.sheet.get("parryCounterBonus", gtags, gextra);
    if (window > 0 && (cs.channelTime ?? 99) <= window) {
      const parryCueFacing = angleTo(guardian.pos, threatPos);
      guardian.facing = angleTo(guardian.pos, attacker.pos);
      if (parryProjectile) {
        w.reflectParriedProjectile(parryProjectile, guardian, counterMult, parryPacket);
      } else if (!attacker.dead && !attacker.invulnerable && w.parryDamageWindow.ready(attacker, w.time)) {
        const counter = Math.max(0, rawDamage * counterMult * attacker.sheet.get("damageTaken"));
        if (counter > 0) {
          w.parryDamageWindow.spend(attacker, w.time);
          const before = attacker.life;
          landLifeDamage(attacker, counter);
          w.recordIndirectDamage(attacker, guardian, before);
          attacker.hitFlash = 0.15;
          attacker.hitFlashType = void 0;
          w.text(attacker.pos, Math.round(counter).toString(), "#ffd700", 14);
          w.flashes.push({
            pos: vec(attacker.pos.x, attacker.pos.y),
            radius: attacker.radius + 10,
            color: "#ffd700",
            life: 0.25,
            maxLife: 0.25
          });
          if (attacker.life <= 0 && !attacker.dead)
            w.kill(attacker, false, guardian);
        }
      }
      w.flashes.push(combatCueFlash(vec(guardian.pos.x + Math.cos(parryCueFacing) * (guardian.radius + 10), guardian.pos.y + Math.sin(parryCueFacing) * (guardian.radius + 10)), "parry", 16, parryCueFacing));
      w.tapCharges(guardian, "block");
      w.rollOwnProcs(guardian, "block", {});
      w.rollTriggers(guardian, "block", { aim: vec(attacker.pos.x, attacker.pos.y) });
      if (spec.endOnParry) {
        guardian.casting = null;
        guardian.useLock = 0.15;
        if (cs.inst.def.cooldown > 0) {
          w.stampSkillCooldown(guardian, cs.inst, cs.inst.def.cooldown);
        }
      }
      return true;
    }
    const guardArtHit = w.guardArts.guardHit(guardian, cs.inst, rawDamage);
    cs.shield = Math.max(0, (cs.shield ?? 0) - guardArtHit.damage);
    if (cs.shield > 0 && guardArtHit.restore > 0)
      cs.shield += ((cs.maxShield ?? cs.shield) - cs.shield) * guardArtHit.restore;
    w.flashes.push(defenseCueFlash(guardian, "guard", "impact", cs.inst.def.color, { facing: angleTo(guardian.pos, threatPos), arc: spec.arcDeg * Math.PI / 180 }));
    w.applyThorns(guardian, attacker);
    w.tapCharges(guardian, "block");
    w.rollTriggers(guardian, "block", { aim: vec(attacker.pos.x, attacker.pos.y) });
    if ((cs.shield ?? 0) <= 0) {
      w.guardArts.lower(guardian, cs.inst);
      guardian.casting = null;
      guardian.useLock = 0.3;
      if (cs.inst.def.cooldown > 0)
        w.stampSkillCooldown(guardian, cs.inst, cs.inst.def.cooldown);
      w.flashes.push(defenseCueFlash(guardian, "guard", "break", cs.inst.def.color, { arc: spec.arcDeg * Math.PI / 180 }));
      if (spec.bashOnBreak) {
        const bash = guardBashSpec(cs.inst);
        if (bash)
          w.guardBash(guardian, cs.inst, bash, cs.maxShield ?? 0);
      }
    }
    return true;
  }
  guardianFor(victim) {
    if (victim.isGuarding())
      return victim;
    const owner = victim.owner;
    if (owner && !owner.dead && owner.isGuarding() && dist(owner.pos, victim.pos) <= 240) {
      const inst = owner.casting.inst;
      if (owner.sheet.get("guardAegis", skillContextTags(inst), instanceMods(inst)) > 0) {
        return owner;
      }
    }
    return null;
  }
  tryShellBlock(victim, threatPos, packet, attacker) {
    if (w.tryShellPool(victim, threatPos, packet, victim.shellGuard))
      return true;
    for (const body of victim.summonShells ?? []) {
      if (body.dead || !w.actors.includes(body)) {
        victim.summonShells?.delete(body);
        continue;
      }
      if (!body.summonShell || body.owner !== victim || body.dead || body.downed || victim.dead || victim.downed)
        continue;
      if (!body.summonInst || !victim.skills.includes(body.summonInst))
        continue;
      const before = body.shellGuard?.pool ?? 0;
      const blocked = w.tryShellPool(victim, threatPos, packet, body.shellGuard);
      if (attacker && (body.shellGuard?.pool ?? 0) < before)
        w.applyThorns(body, attacker);
      if (blocked)
        return true;
    }
    return false;
  }
  tryShellPool(victim, threatPos, packet, sg) {
    if (!sg || sg.broken || sg.pool <= 0)
      return false;
    if (sg.side !== "all") {
      const center = victim.facing + (sg.side === "rear" ? Math.PI : 0);
      const arc = sg.arcDeg * Math.PI / 180 * shellArcFactor(sg, w.time);
      if (Math.abs(angleDiff(center, angleTo(victim.pos, threatPos))) > arc / 2)
        return false;
    }
    const raw = Object.values(packet.amounts).reduce((s, v) => s + (v ?? 0), 0);
    if (raw <= 0)
      return false;
    sg.lastHitAt = w.time;
    const absorb = Math.min(sg.pool, raw);
    sg.pool -= absorb;
    if (sg.pool <= 0) {
      sg.broken = true;
      w.flashes.push(defenseCueFlash(victim, "shell", "break", sg.color, {
        style: sg.shellVisual,
        facing: victim.facing + (sg.side === "rear" ? Math.PI : 0),
        arc: sg.side === "all" ? Math.PI * 2 : sg.arcDeg * Math.PI / 180 * shellArcFactor(sg, w.time)
      }));
    }
    if (!sg.broken)
      w.flashes.push(defenseCueFlash(victim, "shell", "impact", sg.color, { style: sg.shellVisual, facing: angleTo(victim.pos, threatPos), arc: 0.85 }));
    if (absorb >= raw) {
      return true;
    }
    const k = (raw - absorb) / raw;
    for (const t of Object.keys(packet.amounts)) {
      packet.amounts[t] *= k;
    }
    return false;
  }
  noteLightningTravel(p, from) {
    if (!lightningProfile(p.inst.def.id) || p.dissolved)
      return;
    const to = p.phase ? p.pos : w.clipShot(from, p.pos, p.tier);
    if (dist(from, to) < 0.01)
      return;
    let flash = w.lightningFlashes.get(p);
    if (!flash || !w.flashes.includes(flash)) {
      if (w.flashes.filter((f) => f.lightning).length >= LIGHTNING_STYLE.maxTraces)
        return;
      flash = {
        pos: { ...to },
        radius: p.radius,
        color: p.color,
        life: LIGHTNING_STYLE.fadeSeconds,
        maxLife: LIGHTNING_STYLE.fadeSeconds,
        recoveryCueTier: p.tier ?? 0,
        lightning: { skillId: p.inst.def.id, width: p.radius, clock: p.age, points: [] }
      };
      w.lightningFlashes.set(p, flash);
      w.flashes.push(flash);
    }
    flash.pos = { ...to };
    flash.color = p.color;
    flash.life = flash.maxLife;
    flash.lightning.width = p.radius;
    extendLightningTrace(flash.lightning, from, to, p.age);
  }
  carriedEffectContext() {
    return {
      active: (a) => !a.untargetable && !a.passive && !a.burrow && !a.summonShell && !isDormant(a) && !a.statuses.some((s) => STATUS_DEFS[s.id]?.conceals),
      elapsed: (a, elapsed) => elapsed * w.timeflow.actorScale(a),
      enemies: (a, reach, at = a.pos) => {
        if (w.lite.liveCount)
          w.litePromoteNearest(at, {
            within: reach + SATELLITE_CFG.sweepSpacing,
            max: SATELLITE_CFG.promotePerFrame,
            opposing: a.team,
            story: a.tier
          });
        return w.enemiesOf(a);
      },
      hostile: (a, b) => w.hostileTo(a, b) && !isDormant(b),
      clear: (a, b, tier) => w.lineOfSight(a, b, tier, tier),
      instance: (a, id, slot) => w.guardArts.satellitePayload(a, id, slot) ?? (SKILLS[id] ? makeSkillInstance(SKILLS[id], monsterSkillLevelOf(a.level)) : void 0),
      hit: (a, inst, b) => w.resolveHit(a, inst, b, 1, 1),
      launch: (a, inst, from, dir) => w.spawnProjectile(a, inst, from, dir, { depth: 1 }),
      radius: (a, inst) => {
        const delivery = instanceDelivery(inst);
        return delivery.type === "ground" ? delivery.radius * a.sheet.get("aoeRadius", skillContextTags(inst), instanceMods(inst)) : delivery.type === "projectile" ? delivery.radius * a.sheet.get("projectileSize", skillContextTags(inst), instanceMods(inst)) : 0;
      }
    };
  }
  movementMoment(a, inst, phase) {
    const fx = skillMovementVoice(inst.def.id, phase);
    if (!fx || a.dead || a.downed || w.flashes.filter((f) => f.movement || f.fx?.startsWith("skillMove:")).length >= 80)
      return;
    w.flashes.push({
      pos: { ...a.pos },
      radius: a.radius * 1.8,
      facing: a.facing,
      color: cosmeticSkillPaint(w, a, inst.def.id).color ?? inst.def.color,
      life: 0.24,
      maxLife: 0.24,
      fx,
      recoveryCueTier: a.tier
    });
  }
  affordedDest(caster, inst, dest) {
    if (w.skillOcclusion(caster, inst) !== "travel")
      return dest;
    const len = dist(caster.pos, dest);
    if (len <= 1e-6)
      return dest;
    const hit = affordTravel(w, caster.pos, dest, w.shotElev(caster.pos, caster.tier));
    if (!hit)
      return dest;
    const back = Math.max(0, hit.d - LOS_CFG.clipBackoff);
    return w.clampPos(vec(caster.pos.x + (dest.x - caster.pos.x) * (back / len), caster.pos.y + (dest.y - caster.pos.y) * (back / len)), caster.radius, void 0, { mover: caster });
  }
  hivecallRoster(hero, inst) {
    return w.minionsOfSkill(hero, inst.def.id).filter((a) => !a.summonOffspring);
  }
  hivecallCap(hero, inst) {
    const d = instanceDelivery(inst);
    if (d.type !== "summon")
      return 0;
    const raw = Math.max(1, Math.round(hero.sheet.get("minionMaxCount", skillContextTags(inst), instanceMods(inst), d.maxActive)));
    const contract = hero.summonToggles.get(inst.def.id);
    const unit = summonReservationUnit(hero, inst, d);
    return contract && unit > 0 ? Math.min(raw, Math.round(contract.reserved / unit)) : raw;
  }
  hivecallPayload(caster, host, id) {
    const payload = makeSkillInstance(SKILLS[id], effectiveSkillLevel(host));
    w.executeSkill(caster, payload, { ...caster.pos });
  }
  hivecallDeath(body) {
    const hero = body.owner;
    const host = body.summonOffspring ? hero?.skills.find((s) => s?.def.hivecall && s.def.id === body.sourceSkillId) : body.summonInst;
    if (!hero || hero.dead || !host || !hero.skills.includes(host))
      return;
    if (hivecallNode(host, "teeming_contract")) {
      for (const ally of w.minionsOfSkill(hero, host.def.id)) {
        ally.life = ally.maxLife();
        ally.hiveDeathPlies++;
        ally.plySpec ??= { count: 0 };
        ally.pliesMax++;
        ally.plies++;
      }
    }
    if (hivecallNode(host, "overflowing_cells"))
      w.hivecallPayload(body, host, "hive_death_pool");
    if (body.summonOffspring || !hivecallNode(host, "royal_guard"))
      return;
    const st = hivecallState(host);
    const form = w.seats.find((s) => s.home === hero)?.actor.hiveForm;
    if (form) {
      if (hivecallNode(host, "regal_execution"))
        form.remaining = Math.min(HIVECALL.duration, form.remaining + HIVECALL.duration * HIVECALL.deathGain / HIVECALL.meterMax);
    } else
      st.meter = Math.min(HIVECALL.meterMax, st.meter + HIVECALL.deathGain);
  }
  hivecallTransform(hero, host, automatic = false) {
    const seat = w.seatOf(hero), st = hivecallState(host);
    if (!seat || seat.home || hero.dead || hero.downed || !hero.skills.includes(host) || !hivecallNode(host, "royal_guard") || st.meter <= 0)
      return false;
    if (automatic ? st.meter <= 20 : w.time < (st.readyAt ?? 0))
      return false;
    let factor = 1;
    if (automatic) {
      const streak = w.time < (st.rescueUntil ?? 0) ? st.rescueStreak ?? 0 : 0;
      factor = hivecallRescueFactor(streak);
      st.rescueStreak = streak + 1;
      st.rescueUntil = w.time + HIVECALL.rescueWindow;
    }
    const remaining = HIVECALL.duration * st.meter / HIVECALL.meterMax * factor;
    w.shapeshiftPress(hero, host, { form: "hive_sovereign" });
    const form = seat.actor;
    if (form === hero)
      return false;
    st.meter = 0;
    form.tier = hero.tier;
    form.hiveForm = { hero, host, remaining, automatic, factor };
    w.syncHivecallFormDamage(form, host);
    form.sheet.setSource("hivecall:form", [mod("life", "override", Math.max(1, hero.maxLife() * 1.5 * factor))]);
    form.fillResources();
    for (const skill of form.skills)
      if (skill && skill !== host)
        skill.level = effectiveSkillLevel(host);
    if (hivecallNode(host, "royal_ferocity")) {
      form.sheet.setSource("hivecall:ferocity", [mod("damage", "more", 0.3), mod("attackSpeed", "more", 0.25), mod("castSpeed", "more", 0.25)]);
      form.skills.splice(form.skills.length - 1, 0, makeSkillInstance(SKILLS.hive_royal_cataclysm, effectiveSkillLevel(host)));
      if (form.possession)
        form.possession.guestSlot = form.skills.length - 1;
    }
    if (hivecallNode(host, "crushing_mandibles")) {
      for (const skill of form.skills)
        if (skill && ["hive_venom_mandibles", "hive_poison_spit"].includes(skill.def.id)) {
          skill.def = { ...skill.def, innateMods: [...skill.def.innateMods ?? [], mod("damage", "more", 1), mod("aoeRadius", "increased", 0.5), mod("projectileCount", "flat", 2)] };
        }
    }
    if (hivecallNode(host, "barbed_regents"))
      w.hivecallPayload(form, host, "hive_royal_nova");
    if (hivecallNode(host, "regal_execution") && hero.summonToggles.has(host.def.id)) {
      const room = Math.max(0, w.hivecallCap(hero, host) - w.hivecallRoster(hero, host).length);
      for (let n = 0; n < Math.min(2, room); n++)
        w.spawnMinion(hero, host);
    }
    return true;
  }
  hivecallReturn(body, reason) {
    const form = body.hiveForm;
    if (!form)
      return;
    const { hero, host, automatic, factor } = form, st = hivecallState(host);
    body.hiveForm = void 0;
    st.meter = 0;
    const cd = hivecallNode(host, "barbed_regents") ? HIVECALL.novaCooldown : HIVECALL.cooldown;
    st.readyAt = w.time + cd;
    hero.cooldowns.set(host.def.id, cd);
    hero.cooldownTotals.set(host.def.id, cd);
    hero.cooldowns.set("enrage_swarm", cd);
    hero.cooldownTotals.set("enrage_swarm", cd);
    if (automatic && !hero.dead && reason !== "travel")
      hero.life = Math.min(hero.maxLife(), hero.life + hero.maxLife() * 0.4 * factor);
    if ((reason === "press" || reason === "duration") && hivecallNode(host, "barbed_regents"))
      w.hivecallPayload(hero, host, "hive_royal_nova");
    hero.hivecallHud = { meter: st.meter, ready: cd };
  }
  hivecallMeta(caster, host) {
    if (!host.def.hivecall)
      return;
    if (caster.dead || caster.downed)
      return false;
    if (caster.hiveForm) {
      const seat = w.seatOf(caster);
      if (!seat)
        return false;
      w.seatEject(seat, "press");
      return true;
    }
    if (!caster.skills.includes(host))
      return false;
    if (hivecallNode(host, "royal_guard"))
      return w.hivecallTransform(caster, host);
    if (!hivecallNode(host, "sacrificial_chitin"))
      return;
    const swarm = w.hivecallRoster(caster, host);
    const meta = w.mintMetaInstance(caster, host, "enrage_swarm");
    const cost = meta.def.manaCost * caster.sheet.get("manaCost", skillContextTags(meta), instanceMods(meta));
    if (!swarm.length || caster.cooldowns.has("enrage_swarm") || caster.mana < cost)
      return false;
    caster.mana -= cost;
    const cd = 8 / Math.max(0.01, caster.sheet.get("cooldownRecovery", skillContextTags(meta), instanceMods(meta)));
    caster.cooldowns.set("enrage_swarm", cd);
    caster.cooldownTotals.set("enrage_swarm", cd);
    for (const body of swarm) {
      w.hivecallPayload(body, host, "hive_detonation");
      w.kill(body, false, caster);
    }
    for (const body of swarm)
      w.spawnMinion(caster, host, { pos: { ...body.pos } });
    hivecallState(host).rebirthAt = void 0;
    return true;
  }
  syncHivecallFormDamage(body, host) {
    const damage = hivecallFormDamage(host);
    if (body.sheet.getSourceMods("hivecall:tending")?.[0]?.value !== damage) {
      body.sheet.setSource("hivecall:tending", [mod("damage", "increased", damage)]);
    }
  }
  throngBodiesOf(keeper, skillId) {
    const marker = throngMarkerOf(skillId);
    return w.actors.filter((a) => !a.dead && a.owner === keeper && a.sourceSkillId === marker);
  }
  throngRosterCount(keeper, inst) {
    const spec = inst.def.throng;
    let n = w.throngBodiesOf(keeper, inst.def.id).reduce((n2, b) => n2 + (b.throngUnits ?? 1), 0);
    if (spec?.tier === "lite") {
      const kindIdx = w.liteKindOf(spec.monsterId);
      if (kindIdx >= 0)
        n += w.lite.countOwned(keeper.id, kindIdx);
    }
    return n;
  }
  throngCapOf(keeper, inst) {
    const spec = inst.def.throng;
    if (!spec)
      return 0;
    return Math.max(1, Math.round(keeper.sheet.get("minionMaxCount", skillContextTags(inst), instanceMods(inst), spec.cap)));
  }
  throngRecruitCap(keeper, inst) {
    const evo = throngEvolution(inst);
    return Math.max(evo.minimum ?? 0, evo.overflowCap ?? w.throngCapOf(keeper, inst));
  }
  throngGain(keeper, inst, count) {
    const result = [];
    const room = w.throngRecruitCap(keeper, inst) - w.throngRosterCount(keeper, inst);
    for (let i = 0; i < Math.min(count, room); i++) {
      const b = w.mintThrongBody(keeper, inst, keeper.pos, keeper.level);
      b.throngCarried = true;
      result.push(b);
    }
    if (result.length)
      w.charDirty = true;
    return result;
  }
  throngKeepMinimum(keeper, inst) {
    if (keeper.dead || keeper.downed || !keeper.skills.includes(inst))
      return;
    const minimum = throngEvolution(inst).minimum ?? 0;
    if (minimum)
      w.throngGain(keeper, inst, minimum - w.throngRosterCount(keeper, inst));
  }
  throngEvolutionHit(body, victim, scale) {
    const bite = body.skills.find((s) => s?.def.baseDamage);
    if (!bite || victim.dead || victim.passive || victim.untargetable || victim.tier !== body.tier || !w.hostileTo(body, victim))
      return;
    let area = w.throngEvolutionBites.get(bite);
    if (!area) {
      area = makeSkillInstance({ ...bite.def, tags: [...bite.def.tags.filter((t) => t !== "attack"), "aoe"] });
      w.throngEvolutionBites.set(bite, area);
    }
    area.level = bite.level;
    w.resolveHit(body, area, victim, scale, 0);
  }
  throngEvolutionBurst(body, at, radius, scale, except) {
    for (const victim of w.enemiesOf(body)) {
      if (victim.tier !== body.tier)
        continue;
      if (victim !== except && dist(victim.pos, at) <= radius + victim.radius)
        w.throngEvolutionHit(body, victim, scale);
    }
    w.flashes.push({ pos: { ...at }, radius, color: "#c4d578", life: 0.25, maxLife: 0.25 });
  }
  mintThrongBody(keeper, inst, pos, level, bodyKind) {
    const spec = inst.def.throng;
    const body = w.createMonster(bodyKind ?? spec.monsterId, Math.max(1, level), keeper.team, keeper);
    body.noBounty = true;
    body.sourceSkillId = throngMarkerOf(inst.def.id);
    body.summonInst = inst;
    body.lifelineId = w.conjurationLifeline(keeper);
    w.bakeMinionOwnerStats(body, keeper, inst, batchScaleOf(spec));
    body.fillResources();
    body.tier = keeper.tier;
    body.pos = w.clampPos(vec(pos.x, pos.y), body.radius, void 0, { mover: body });
    w.actors.push(body);
    return body;
  }
  onPartBroken(part, killer) {
    part.dead = true;
    const link = part.partLink;
    part.partLink = void 0;
    if (!link || link.root.dead)
      return;
    const root = link.root;
    const pd = link.def;
    notePartScar(part, root, pd);
    root.partActors = root.partActors?.filter((p) => p !== part);
    const scar = root.partScars.find((s) => s.id === part.id);
    if (scar)
      w.flashes.push(anatomyFlash(part.pos, part.radius, root.facing, scar));
    w.shake = Math.max(w.shake, 5);
    if (pd.breakDamage) {
      root.life -= root.maxLife() * pd.breakDamage;
      if (root.life <= 0 && !root.dead) {
        w.kill(root, false, killer);
        return;
      }
    }
    if (pd.breakMods?.length) {
      root.sheet.setSource(`partBreak_${part.id}`, pd.breakMods);
    }
    if (pd.breakDisables?.length) {
      root.skills = root.skills.filter((s) => !s || !pd.breakDisables.includes(s.def.id));
      root.aiSkillBans ??= /* @__PURE__ */ new Set();
      for (const id of pd.breakDisables)
        root.aiSkillBans.add(id);
    }
  }
  ringBell(bell) {
    const st = bell.construct;
    if (!st?.castOnStruck || !st.castInst || bell.dead)
      return false;
    if (w.time < (st.bellReadyAt ?? 0))
      return false;
    st.bellReadyAt = w.time + (bell.summonInst?.def.delivery.type === "construct" ? bell.summonInst.def.delivery.interval ?? 0.6 : 0.6);
    bell.useLock = 0;
    bell.mana = bell.maxMana();
    w.executeSkill(bell, st.castInst, vec(bell.pos.x, bell.pos.y), { keepFacing: true, noRepeat: true });
    return true;
  }
  rollKillOrbs(caster, inst, victim) {
    if (caster.construct || victim.noBounty || w.orbs.length >= ORB_CAP)
      return;
    const tags = skillContextTags(inst, grantedTags(inst));
    const extra = instanceMods(inst);
    const rate = caster.sheet.get("orbShedRate", tags, extra);
    const graft = hostSockets(inst).map((s) => s.def.orbShedGraft).find((g) => g);
    const globalRate = graft ? caster.sheet.get("orbShedRate") : 0;
    for (const id of Object.keys(ORB_DEFS)) {
      const base = caster.sheet.get(orbOnKillStat(id), tags, extra);
      const grafted = graft?.orbs.includes(id) ? graft.chance : 0;
      const c = base > 0 ? (base + grafted) * rate : grafted * globalRate;
      if (c > 0 && chance(Math.min(0.75, c))) {
        w.shedOrb(id, victim.pos, { scatter: 26, tier: victim.tier });
      }
    }
  }
  clingRelease(a, cause = "drop") {
    const ride = a.clingTo;
    a.clingTo = void 0;
    const bur = cause === "shake" ? a.cling?.burrow : void 0;
    const flop = cause === "shake" && !bur ? a.cling?.flop : void 0;
    a.clingCooldownUntil = w.time + (bur ? bur.grace ?? CLING_CFG.burrow.grace : flop ? flop.grace ?? CLING_CFG.flop.grace : CLING_CFG.reattachGrace);
    for (let i = a.statuses.length - 1; i >= 0; i--) {
      if (a.statuses[i].id === "burrowed") {
        a.statuses.splice(i, 1);
        a.sheet.removeSource("status:burrowed");
      }
    }
    if (!ride)
      return;
    const ang = bur || flop ? rand(0, Math.PI * 2) : ride.ang;
    const hop = bur ? bur.toss ?? CLING_CFG.burrow.toss : flop ? flop.toss ?? CLING_CFG.flop.toss : CLING_CFG.detachHop;
    a.pos = w.clampPos(vec(a.pos.x + Math.cos(ang) * hop, a.pos.y + Math.sin(ang) * hop), a.radius);
    if (flop?.status && STATUS_DEFS[flop.status])
      a.applyStatus(flop.status, 0, 1, "the flop");
    if (bur || flop) {
      w.flashes.push({
        pos: vec(a.pos.x, a.pos.y),
        radius: a.radius + 6,
        color: a.color,
        life: 0.22,
        maxLife: 0.22
      });
    }
  }
  setLure(id, pos, radius, pace, standoff, linger = 0.6, tier) {
    w.lures.set(id, { pos: vec(pos.x, pos.y), radius, pace, standoff, until: w.time + linger, tier });
  }
  throngOnHit(caster, target, wasCrit, lethal) {
    let lord = caster;
    while (lord.owner)
      lord = lord.owner;
    if (lord.kind !== "player")
      return;
    if (target.team === lord.team || target.passive || target.untargetable)
      return;
    if (lethal)
      w.throngLastKill.set(lord.id, vec(target.pos.x, target.pos.y));
    for (const { inst, spec } of throngSpecsOn(lord.skills)) {
      const st = inst.state ??= {};
      const evo = throngEvolution(inst);
      if (evo.hitFill) {
        st.throngEvolutionGauge = (st.throngEvolutionGauge ?? 0) + evo.hitFill;
        if (st.throngEvolutionGauge >= 100) {
          st.throngEvolutionGauge -= 100;
          w.throngGain(lord, inst, Math.ceil(Math.max(0, w.throngCapOf(lord, inst) - w.throngRosterCount(lord, inst)) / 2));
        }
      }
      for (const row of w.throngSources(inst, spec)) {
        if (row.kind === "onCrit") {
          if (!wasCrit || caster !== lord)
            continue;
          if (w.time < (st.throngCritAt ?? 0) || !chance(row.chance))
            continue;
          st.throngCritAt = w.time + (row.icd ?? THRONG_CFG.critIcd);
          const n = w.throngYieldCount(lord, inst, 1);
          for (let i = 0; i < n; i++) {
            w.mintThrongFind(lord, inst, w.throngStandNear(target.pos, target.tier), { ttl: THRONG_CFG.motes.ttl, tier: target.tier });
          }
        } else if (row.kind === "gauge") {
          const fromMinion = caster !== lord;
          const counts = row.per === "both" || (row.per === "minionHit" ? fromMinion : !fromMinion);
          if (!counts)
            continue;
          st.throngGauge = (st.throngGauge ?? 0) + row.fill;
          if (st.throngGauge >= 100) {
            st.throngGauge = 0;
            const n = w.throngYieldCount(lord, inst, Math.round(rand(row.yield[0], row.yield[1])));
            for (let i = 0; i < n; i++) {
              w.mintThrongFind(lord, inst, w.throngStandNear(lord.pos, lord.tier), { ttl: THRONG_CFG.motes.ttl, tier: lord.tier });
            }
            w.text(vec(lord.pos.x, lord.pos.y - 18), "the throng stirs", THRONG_CFG.joinColor, 12);
          }
        }
      }
    }
  }
  throngOnKill(victim, killer) {
    if (!killer || victim.noBounty || victim.throngWild)
      return;
    let lord = killer;
    while (lord.owner)
      lord = lord.owner;
    if (lord.kind !== "player")
      return;
    for (const { inst, spec } of throngSpecsOn(lord.skills)) {
      for (const row of w.throngSources(inst, spec)) {
        if (row.kind !== "onKill" || !chance(row.chance))
          continue;
        const n = w.throngYieldCount(lord, inst, 1);
        for (let i = 0; i < n; i++) {
          w.mintThrongFind(lord, inst, w.throngStandNear(victim.pos, victim.tier), { ttl: THRONG_CFG.motes.ttl, tier: victim.tier });
        }
      }
    }
  }
  throngSources(inst, spec) {
    const grafts = instanceThrongSources(inst);
    return grafts.length ? [...spec.sources, ...grafts] : spec.sources;
  }
  throngYieldCount(keeper, inst, base) {
    return Math.max(1, Math.round(base * keeper.sheet.get("throngYield", skillContextTags(inst), instanceMods(inst))));
  }
  mintThrongFind(keeper, inst, pos, opts, rng = w.random) {
    const original = inst.def.throng.monsterId;
    const eggs = throngEvolution(inst).eggs;
    if (eggs) {
      const enemy = [...w.enemiesOf(keeper)].filter((e) => !e.dead && !e.passive && !e.untargetable && e.tier === keeper.tier && dist(e.pos, keeper.pos) < 360).sort((a, b) => dist(a.pos, keeper.pos) - dist(b.pos, keeper.pos))[0];
      const egg = w.mintThrongHusk(original, enemy ? w.throngStandNear(enemy.pos, keeper.tier) : pos, { ...opts, affinity: original });
      if (egg) {
        egg.throngEgg = eggs;
        egg.radius = 12;
      }
      return egg;
    }
    const kind = substituteThrongKind(original, keeper, inst, rng, (stat) => keeper.sheet.get(stat, skillContextTags(inst), instanceMods(inst)));
    return w.mintThrongHusk(kind, pos, { ...opts, affinity: original });
  }
  mintThrongHusk(monsterId, pos, opts) {
    if (!MONSTERS[monsterId])
      return null;
    const husk = w.createMonster(monsterId, Math.max(1, w.encounter.level), "enemy");
    husk.throngWild = opts?.affinity ?? monsterId;
    husk.tier = opts?.tier ?? 0;
    husk.passive = true;
    husk.untargetable = true;
    husk.invulnerable = true;
    husk.noBounty = true;
    if (opts?.pocketKey)
      husk.throngPocketKey = opts.pocketKey;
    if (opts?.ttl !== void 0)
      husk.throngExpiresAt = w.time + opts.ttl;
    husk.pos = w.clampPos(vec(pos.x, pos.y), husk.radius, void 0, { mover: husk });
    w.actors.push(husk);
    return husk;
  }
  liteKindOf(defId) {
    let idx = w.liteKindIdxMap.get(defId);
    if (idx !== void 0)
      return idx;
    const def = MONSTERS[defId];
    const kind = def ? resolveLiteKind(def, Math.max(1, w.encounter.level), XP_SCALE) : null;
    idx = kind ? w.liteKinds.length : -1;
    if (kind) {
      w.liteKinds.push(kind);
      w.liteMaxR = Math.max(w.liteMaxR, kind.radius);
      if (kind.trampleMinSpeed < Infinity) {
        w.liteHasTrample = true;
        w.liteMinTrampleSpeed = Math.min(w.liteMinTrampleSpeed, kind.trampleMinSpeed);
      }
    }
    w.liteKindIdxMap.set(defId, idx);
    return idx;
  }
  litePromoteNearest(at, opts) {
    const pool = w.lite;
    const picks = [];
    const carveTeam = opts.opposing ? opts.opposing === "player" ? 0 : 1 : void 0;
    const rank = opts.rank ?? at;
    for (let i = 0; i < pool.used; i++) {
      if (!pool.alive[i])
        continue;
      if (opts.owner !== void 0 && pool.owner[i] !== opts.owner)
        continue;
      if (opts.kindIdx !== void 0 && pool.kind[i] !== opts.kindIdx)
        continue;
      if (carveTeam !== void 0 && pool.team[i] !== carveTeam)
        continue;
      if (opts.story !== void 0 && pool.story[i] !== opts.story)
        continue;
      const dx = pool.x[i] - at.x, dy = pool.y[i] - at.y;
      if (dx * dx + dy * dy > opts.within * opts.within)
        continue;
      const rx = pool.x[i] - rank.x, ry = pool.y[i] - rank.y;
      picks.push({ i, d: rx * rx + ry * ry });
    }
    picks.sort((a, b) => a.d - b.d);
    const out = [];
    for (const pick of picks) {
      if (out.length >= opts.max)
        break;
      const body = w.promoteLite(pick.i);
      if (body)
        out.push(body);
    }
    return out;
  }
  promoteLite(i) {
    const pool = w.lite;
    if (!pool.alive[i])
      return null;
    const k = w.liteKinds[pool.kind[i]];
    if (!k || !MONSTERS[k.defId])
      return null;
    const ownerId = pool.owner[i];
    const pos = vec(pool.x[i], pool.y[i]);
    const spent = Math.max(0, k.plies0 - pool.plies[i]);
    let body = null;
    if (ownerId) {
      const keeper = w.actorById(ownerId);
      if (keeper && !keeper.dead) {
        const inst = keeper.skills.find((s) => s?.def.throng?.tier === "lite" && s.def.throng.monsterId === k.defId);
        if (inst)
          body = w.mintThrongBody(keeper, inst, pos, keeper.level);
      }
      if (!body)
        return null;
    } else {
      body = w.createMonster(k.defId, Math.max(1, w.encounter.level), pool.team[i] === 1 ? "player" : "enemy");
      body.tier = pool.story[i];
      body.pos = w.clampPos(pos, body.radius, void 0, { mover: body });
      w.actors.push(body);
    }
    if (body.pliesMax > 0)
      body.plies = Math.max(1, body.pliesMax - spent);
    w.litePocketDisturb(pool.pocket[i]);
    pool.free(i);
    return body;
  }
  liteNoteDeath(k, rowTeam, credit) {
    if (rowTeam !== 0)
      return;
    if (credit && credit.team !== "player")
      return;
    if (k.xpValue > 0)
      w.liteXpAcc += k.xpValue;
    w.liteKills.set(k.defId, (w.liteKills.get(k.defId) ?? 0) + 1);
  }
  litePocketDisturb(pk) {
    if (pk < 0)
      return;
    const p = w.litePockets[pk];
    if (!p || p.extinct)
      return;
    p.disturbedUntil = Math.max(p.disturbedUntil, w.time + p.quietSec);
  }
  liteProjectileSweep(p, x0, y0) {
    const pool = w.lite;
    const kinds = w.liteKinds;
    const carveTeam = p.caster.team === "player" ? 0 : 1;
    let stopped = false;
    const rend = p.caster ? Math.max(0, Math.floor(p.caster.sheet.get("plyRend"))) : 0;
    pool.forEachAlong(x0, y0, p.pos.x, p.pos.y, w.liteMaxR + p.radius + 2, (i) => {
      if (pool.team[i] !== carveTeam)
        return;
      if (pool.story[i] !== (p.tier ?? 0))
        return;
      const k = kinds[pool.kind[i]];
      if (!k)
        return;
      const bx = pool.x[i], by = pool.y[i];
      w.litePocketDisturb(pool.pocket[i]);
      if (pool.plies[i] > 1 + rend) {
        pool.plies[i] -= 1 + rend;
        w.flashes.push({ pos: vec(bx, by), radius: k.radius + 3, color: "#ffffff", life: 0.1, maxLife: 0.1 });
      } else {
        w.flashes.push({ pos: vec(bx, by), radius: k.radius + 5, color: k.color, life: 0.18, maxLife: 0.18 });
        w.liteNoteDeath(k, pool.team[i], p.caster);
        pool.free(i);
      }
      if (p.rehit)
        return;
      if (p.pierce > 0) {
        p.pierce--;
        return;
      }
      p.pos.x = bx;
      p.pos.y = by;
      stopped = true;
      return true;
    });
    return stopped;
  }
  liteCarve(striker, at, reach, test, story = striker ? striker.tier : null, minionCombatArea = true) {
    const pool = w.lite;
    if (!pool.liveCount)
      return;
    const kinds = w.liteKinds;
    const carveTeam = striker ? striker.team === "player" ? 0 : 1 : -1;
    const pad = w.liteMaxR + 8;
    const rr = (reach + pad) * (reach + pad);
    const tears = 1 + (striker ? Math.max(0, Math.floor(striker.sheet.get("plyRend"))) : 0);
    let areaAvoidance;
    let torn = 0, fx = 0, cx = 0, cy = 0;
    for (let i = 0; i < pool.used; i++) {
      if (!pool.alive[i])
        continue;
      if (carveTeam >= 0 && pool.team[i] !== carveTeam)
        continue;
      if (story !== null && pool.story[i] !== story)
        continue;
      const dx = pool.x[i] - at.x, dy = pool.y[i] - at.y;
      if (dx * dx + dy * dy > rr)
        continue;
      const k = kinds[pool.kind[i]];
      if (!k)
        continue;
      w.liteVec.x = pool.x[i];
      w.liteVec.y = pool.y[i];
      if (test) {
        if (!test(w.liteVec, k.radius))
          continue;
      } else if (Math.sqrt(dx * dx + dy * dy) - k.radius > reach)
        continue;
      if (minionCombatArea && pool.owner[i]) {
        const key = pool.owner[i] * 256 + pool.kind[i];
        let avoid = areaAvoidance?.get(key);
        if (avoid === void 0) {
          const keeper = w.actorById(pool.owner[i]);
          const anchor = keeper?.skills.find((s) => s?.def.throng?.monsterId === k.defId);
          avoid = keeper && anchor ? w.minionAreaAvoidanceOf(keeper, anchor) : 0;
          (areaAvoidance ??= /* @__PURE__ */ new Map()).set(key, avoid);
        }
        if (avoid > 0 && chance(avoid))
          continue;
      }
      w.litePocketDisturb(pool.pocket[i]);
      if (pool.plies[i] > tears) {
        pool.plies[i] -= tears;
        if (fx < LITE_CFG.fx.flashes) {
          fx++;
          w.flashes.push({ pos: vec(pool.x[i], pool.y[i]), radius: k.radius + 3, color: "#ffffff", life: 0.1, maxLife: 0.1 });
        }
        continue;
      }
      torn++;
      cx += pool.x[i];
      cy += pool.y[i];
      if (fx < LITE_CFG.fx.flashes) {
        fx++;
        w.flashes.push({ pos: vec(pool.x[i], pool.y[i]), radius: k.radius + 6, color: k.color, life: 0.22, maxLife: 0.22 });
      }
      w.liteNoteDeath(k, pool.team[i], striker);
      pool.free(i);
    }
    if (torn >= LITE_CFG.fx.countTextAt) {
      w.text(vec(cx / torn, cy / torn - 10), `\xD7${torn}`, "#e8d8a0", 13);
    }
  }
  litePooledHit(v, amounts, credit) {
    if (v.dead || v.invulnerable)
      return;
    let domType = "physical", domAmt = 0;
    for (const ty of Object.keys(amounts)) {
      if ((amounts[ty] ?? 0) > domAmt) {
        domAmt = amounts[ty];
        domType = ty;
      }
    }
    const taken = mitigateTyped(v, amounts, { armorDamageFloor: credit ? THRONG_EVOLUTION.armorFloor : 0 });
    if (v.plies > 0) {
      if (taken >= plyFloorOf(v)) {
        v.plies--;
        v.assaultPlyBreak?.(credit);
        if (v.plies === 0 && v.plySpec?.spentStatus) {
          v.applyStatus(v.plySpec.spentStatus, 0, 1, "plies");
        }
      }
      v.hitFlash = 0.12;
      v.hitFlashType = domType;
      return;
    }
    landLifeDamage(v, taken);
    if (credit)
      w.assaults.pooledHit(credit, v, taken, amounts);
    v.hitFlash = 0.15;
    v.hitFlashType = domType;
    if (taken > 0.5)
      w.text(v.pos, Math.round(taken).toString(), DAMAGE_COLOR[domType], 11);
    if (v.life <= 0 && !v.dead) {
      w.kill(v, false, credit);
      w.observers.pooledKill?.(v, credit);
    }
  }
  liteBiteVictim(v, t) {
    const pool = w.lite;
    const kinds = w.liteKinds;
    if (w.liteCounts.length < kinds.length)
      w.liteCounts = new Int32Array(kinds.length * 2);
    const counts = w.liteCounts;
    counts.fill(0, 0, kinds.length);
    const vTeam = v.team === "player" ? 1 : 0;
    let trSpeed = 0, trMass = 0, tramples = 0, trX = 0, trY = 0;
    if (w.liteHasTrample) {
      trSpeed = Math.hypot(v.velEst.x, v.velEst.y);
      if (trSpeed >= w.liteMinTrampleSpeed) {
        trMass = v.effectiveWeight() + v.sheet.get("trample");
      } else
        trSpeed = 0;
    }
    let pressed = false, creditOwner = 0, latchIdx = -1, latchD = Infinity;
    pool.forEachIn(v.pos.x, v.pos.y, v.radius + w.liteMaxR + LITE_CFG.contact.pad, 0, (i) => {
      if (pool.team[i] === vTeam)
        return;
      if (pool.story[i] !== v.tier)
        return;
      const k = kinds[pool.kind[i]];
      if (!k)
        return;
      const dx = pool.x[i] - v.pos.x, dy = pool.y[i] - v.pos.y;
      const dd = dx * dx + dy * dy;
      if (trSpeed >= k.trampleMinSpeed && trMass >= k.trampleMinWeight) {
        const crush = v.radius + k.radius;
        if (dd <= crush * crush) {
          tramples++;
          trX += pool.x[i];
          trY += pool.y[i];
          if (tramples <= LITE_CFG.fx.flashes) {
            w.flashes.push({
              pos: vec(pool.x[i], pool.y[i]),
              radius: k.radius + 5,
              color: k.color,
              life: 0.2,
              maxLife: 0.2
            });
          }
          w.liteNoteDeath(k, pool.team[i], v);
          w.litePocketDisturb(pool.pocket[i]);
          pool.free(i);
          return;
        }
      }
      const rr = v.radius + k.radius + LITE_CFG.contact.pad;
      if (dd > rr * rr)
        return;
      counts[pool.kind[i]]++;
      pressed = true;
      if (!creditOwner && pool.owner[i])
        creditOwner = pool.owner[i];
      if (k.clings && dd < latchD) {
        latchD = dd;
        latchIdx = i;
      }
    });
    if (tramples >= LITE_CFG.fx.countTextAt) {
      w.text(vec(trX / tramples, trY / tramples - 10), `\xD7${tramples}`, "#d8c8a0", 13);
    }
    if (!pressed)
      return;
    if (latchIdx >= 0 && w.litePromoteBudget > 0 && !v.untargetable && !v.passive) {
      let riders = 0;
      for (const r of w.actors)
        if (!r.dead && r.clingTo?.id === v.id)
          riders++;
      if (riders < clingSeatsOf(v)) {
        w.litePromoteBudget--;
        const body = w.promoteLite(latchIdx);
        if (body)
          body.aiTargetId = v.id;
      }
    }
    let due = w.liteBeatAt.get(v.id);
    let beat = Infinity;
    let total = 0;
    for (let ki = 0; ki < kinds.length; ki++) {
      if (!counts[ki] || kinds[ki].contactDamage <= 0)
        continue;
      beat = Math.min(beat, kinds[ki].contactBeat);
      total++;
    }
    if (!total)
      return;
    if (due === void 0) {
      const frac = (v.id * 2654435761 >>> 16 & 255) / 255;
      w.liteBeatAt.set(v.id, t + beat * (LITE_CFG.contact.stagger + frac * (1 - LITE_CFG.contact.stagger)));
      return;
    }
    if (t < due)
      return;
    w.liteBeatAt.set(v.id, t + beat);
    const amounts = {};
    for (let ki = 0; ki < kinds.length; ki++) {
      if (!counts[ki])
        continue;
      const k = kinds[ki];
      if (k.contactDamage <= 0)
        continue;
      amounts[k.contactType] = (amounts[k.contactType] ?? 0) + k.contactDamage * Math.min(counts[ki], k.countCap);
    }
    const credit = creditOwner ? w.actorById(creditOwner) : void 0;
    w.litePooledHit(v, amounts, credit);
  }
  liteSteerAndBite(dt) {
    const pool = w.lite;
    const kinds = w.liteKinds;
    pool.rebuildBuckets();
    w.litePromoteBudget = LITE_CFG.promote.latchPerSweep;
    const t = w.time;
    const wobTick = t * LITE_CFG.steer.wobbleHz | 0;
    const s = w.liteVec;
    const keepers = w.liteKeeperScratch;
    keepers.clear();
    for (let i = 0; i < pool.used; i++) {
      if (!pool.alive[i])
        continue;
      const k = kinds[pool.kind[i]];
      if (!k) {
        pool.free(i);
        continue;
      }
      if (k.speed <= 0) {
        pool.vx[i] *= 0.7;
        pool.vy[i] *= 0.7;
        continue;
      }
      const px = pool.x[i], py = pool.y[i];
      let gx = px, gy = py, arrive = 10;
      const own = pool.owner[i];
      if (own) {
        let keeper = keepers.get(own);
        if (keeper === void 0) {
          keeper = w.actorById(own) ?? null;
          keepers.set(own, keeper);
        }
        const order = w.liteOrders.get(own * 256 + pool.kind[i]);
        if (order && t < order.until) {
          const tgt = order.targetId !== void 0 ? w.actorById(order.targetId) : void 0;
          if (tgt && !tgt.dead) {
            gx = tgt.pos.x;
            gy = tgt.pos.y;
            arrive = tgt.radius + k.radius + 2;
          } else {
            gx = order.x;
            gy = order.y;
            arrive = 14;
          }
        } else if (keeper && !keeper.dead) {
          liteRingOffset(pool.seat[i], t, s);
          gx = keeper.pos.x + s.x;
          gy = keeper.pos.y + s.y;
          arrive = 8;
        } else {
          gx = pool.hx[i];
          gy = pool.hy[i];
        }
      } else {
        let bd = k.aggro * k.aggro, found = false;
        for (const seat of w.seats) {
          const a = seat.actor;
          if (a.dead || a.downed)
            continue;
          if (a.tier !== pool.story[i])
            continue;
          const dx2 = a.pos.x - px, dy2 = a.pos.y - py;
          const dd = dx2 * dx2 + dy2 * dy2;
          if (dd < bd) {
            bd = dd;
            gx = a.pos.x;
            gy = a.pos.y;
            found = true;
          }
        }
        if (found)
          arrive = 6;
        else {
          const slow = t * 0.25 | 0;
          const wang = liteNoise(i, slow) * Math.PI;
          gx = pool.hx[i] + Math.cos(wang) * LITE_CFG.homeLeash * Math.abs(liteNoise(i + 7717, slow));
          gy = pool.hy[i] + Math.sin(wang) * LITE_CFG.homeLeash * Math.abs(liteNoise(i + 3191, slow));
          arrive = 18;
        }
      }
      const dx = gx - px, dy = gy - py;
      const d = Math.hypot(dx, dy);
      let dvx = 0, dvy = 0;
      if (d > arrive) {
        const jit = 1 + ((pool.seat[i] >>> 8 & 255) / 255 - 0.5) * 2 * LITE_CFG.steer.speedJitter;
        const speed = k.speed * jit;
        const head = Math.atan2(dy, dx) + liteNoise(i, wobTick) * LITE_CFG.steer.erratic * k.erratic;
        dvx = Math.cos(head) * speed;
        dvy = Math.sin(head) * speed;
        weaveVel(LITE_CFG.steer.weave * k.weave, LITE_CFG.steer.weaveAmp, t + pool.phase[i], head, s);
        dvx += s.x;
        dvy += s.y;
      }
      pool.sepFold(i, k.radius * 2.4, LITE_CFG.steer.sepIters, s);
      dvx += s.x * LITE_CFG.steer.sep * k.separation;
      dvy += s.y * LITE_CFG.steer.sep * k.separation;
      const cr = Math.min(1, LITE_CFG.steer.accel * dt);
      pool.vx[i] += (dvx - pool.vx[i]) * cr;
      pool.vy[i] += (dvy - pool.vy[i]) * cr;
      const nx = px + pool.vx[i] * dt, ny = py + pool.vy[i] * dt;
      if (w.liteOpenAt(nx, ny)) {
        pool.x[i] = nx;
        pool.y[i] = ny;
      } else if (w.liteOpenAt(nx, py)) {
        pool.x[i] = nx;
        pool.vy[i] *= -0.4;
      } else if (w.liteOpenAt(px, ny)) {
        pool.y[i] = ny;
        pool.vx[i] *= -0.4;
      } else {
        pool.vx[i] *= -0.5;
        pool.vy[i] *= -0.5;
      }
    }
    const victims = w.liteVictimScratch;
    victims.length = 0;
    for (const a of w.actors) {
      if (a.dead || a.downed || a.untargetable || a.passive || a.throngWild)
        continue;
      if (isDormant(a))
        continue;
      victims.push(a);
    }
    for (const v of victims)
      w.liteBiteVictim(v, t);
    victims.length = 0;
    if (w.liteBeatAt.size > 512)
      w.liteBeatAt.clear();
  }
  liteDemoteSweep() {
    const pool = w.lite;
    for (const a of [...w.actors]) {
      if (a.dead || !a.owner || !isThrongBody(a))
        continue;
      const inst = a.owner.skills.find((s) => s && throngMarkerOf(s.def.id) === a.sourceSkillId);
      const spec = inst?.def.throng;
      if (!spec || spec.tier !== "lite")
        continue;
      if (a.defId !== spec.monsterId)
        continue;
      if (w.minionNeedsFullDurability(a.owner, inst) || a.plies < a.pliesMax || a.life < a.maxLife() || a.assaultOrbit || a.sheet.getSourceMods("assault:formation")?.length)
        continue;
      if (a.clingTo || a.heldBy !== void 0 || a.gripping || a.casting)
        continue;
      if (a.aiCommand || a.aiTargetId !== void 0)
        continue;
      if (a.statuses.length > 0 || a.buffs.size > 0)
        continue;
      const kindIdx = w.liteKindOf(spec.monsterId);
      if (kindIdx < 0)
        continue;
      const k = w.liteKinds[kindIdx];
      const spent = a.pliesMax > 0 ? Math.max(0, a.pliesMax - a.plies) : 0;
      if (pool.spawn(kindIdx, a.pos.x, a.pos.y, 1, a.owner.id, Math.max(1, k.plies0 - spent), -1, a.tier) < 0)
        continue;
      w.kill(a, true);
    }
    for (let i = 0; i < pool.used; i++) {
      if (!pool.alive[i] || !pool.owner[i])
        continue;
      const k = w.liteKinds[pool.kind[i]];
      if (!k) {
        pool.free(i);
        continue;
      }
      const keeper = w.actorById(pool.owner[i]);
      const anchored = keeper && !keeper.dead && keeper.skills.some((s) => s?.def.throng?.tier === "lite" && s.def.throng.monsterId === k.defId);
      if (anchored)
        continue;
      const hx = pool.x[i], hy = pool.y[i];
      pool.free(i);
      w.mintThrongHusk(k.defId, vec(hx, hy), { ttl: THRONG_CFG.motes.ttl * 2 });
    }
  }
  minionNeedsFullDurability(caster, inst) {
    if (inst.def.hivecall || inst.def.throng && inst.treeNodes?.length)
      return true;
    const tags = skillContextTags(inst), extra = instanceMods(inst);
    return MINION_COMBAT.actorDurabilityStats.some((stat) => caster.sheet.get(stat, tags, extra) > 0);
  }
  reqShortfall(skillId, seat = w.localSeat) {
    ;
    const req = SKILLS[skillId]?.requirements;
    if (!req)
      return void 0;
    let short = "";
    for (const [attr, need] of Object.entries(req)) {
      if ((seat.meta.attrs[attr] ?? 0) < (need ?? 0)) {
        short += `${short ? ", " : ""}${ATTRIBUTES[attr].short} ${need}`;
      }
    }
    return short ? "needs " + short : void 0;
  }
  companionBondsOfSkill(keeper, skillId) {
    const groups = /* @__PURE__ */ new Set();
    for (const a of w.companionsOfSkill(keeper, skillId)) {
      groups.add(a.bondGroup ?? String(a.id));
    }
    return groups.size;
  }
  updateThrongEvolution(dt) {
    for (const seat of w.seats) {
      const keeper = seat.actor;
      if (keeper.dead || keeper.downed)
        continue;
      for (const { inst, spec } of throngSpecsOn(keeper.skills)) {
        const evo = throngEvolution(inst), st = inst.state ??= {};
        const active = Object.keys(evo).length > 0;
        if (!active && !w.throngEvolutionActive.has(inst))
          continue;
        if (active)
          w.throngEvolutionActive.add(inst);
        else
          w.throngEvolutionActive.delete(inst);
        if (active && spec.tier === "lite") {
          const kindIdx = w.liteKindOf(spec.monsterId);
          if (kindIdx >= 0 && w.lite.countOwned(keeper.id, kindIdx))
            w.litePromoteNearest(keeper.pos, { within: Infinity, max: w.lite.used, owner: keeper.id, kindIdx });
        }
        w.throngKeepMinimum(keeper, inst);
        const cap = w.throngRecruitCap(keeper, inst);
        if (evo.accumulateSec && w.throngRosterCount(keeper, inst) < cap) {
          st.throngEvolutionClock = (st.throngEvolutionClock ?? 0) + dt;
          while (st.throngEvolutionClock >= evo.accumulateSec && w.throngRosterCount(keeper, inst) < cap) {
            st.throngEvolutionClock -= evo.accumulateSec;
            w.throngGain(keeper, inst, 1);
          }
        } else
          st.throngEvolutionClock = 0;
        if (evo.hitFill)
          st.throngEvolutionGauge ??= 0;
        else
          st.throngEvolutionGauge = 0;
        let bodies = w.throngBodiesOf(keeper, inst.def.id);
        if (evo.cluster && bodies.length > 1) {
          const eligible = bodies.filter((b) => !b.throngDive);
          const lead = eligible[0];
          if (lead && eligible.length > 1) {
            const units = eligible.reduce((n, b) => n + (b.throngUnits ?? 1), 0);
            const lifeFrac = eligible.reduce((n, b) => n + b.life / b.maxLife() * (b.throngUnits ?? 1), 0) / units;
            const spent = eligible.reduce((n, b) => n + Math.max(0, b.pliesMax - b.plies), 0);
            lead.throngUnits = units;
            for (const b of eligible.slice(1))
              w.kill(b, true);
            w.bakeMinionOwnerStats(lead, keeper, inst, batchScaleOf(spec));
            lead.life = lead.maxLife() * lifeFrac;
            lead.plies = Math.max(0, lead.pliesMax - spent);
            bodies = w.throngBodiesOf(keeper, inst.def.id);
          }
        } else if (!evo.cluster) {
          for (const b of bodies)
            if ((b.throngUnits ?? 1) > 1) {
              const count = b.throngUnits, frac = b.life / b.maxLife(), plies = b.plies;
              b.throngUnits = void 0;
              w.bakeMinionOwnerStats(b, keeper, inst, batchScaleOf(spec));
              b.life = b.maxLife() * frac;
              b.plies = Math.min(b.pliesMax, plies);
              let left = Math.max(0, plies - b.plies);
              for (let i = 1; i < count; i++) {
                const child = w.mintThrongBody(keeper, inst, b.pos, b.level);
                child.life = child.maxLife() * frac;
                child.plies = Math.min(child.pliesMax, left);
                left -= child.plies;
                child.throngCarried = b.throngCarried;
              }
            }
          bodies = w.throngBodiesOf(keeper, inst.def.id);
        }
        const conducting = keeper.casting?.inst === inst;
        let protectedUnits = w.throngCapOf(keeper, inst);
        const foes = active && conducting ? [...w.enemiesOf(keeper)] : [];
        for (let i = 0; i < bodies.length; i++) {
          const b = bodies[i], units = b.throngUnits ?? 1;
          const excess = Math.max(0, units - Math.max(0, protectedUnits));
          protectedUnits -= units;
          if (evo.overflowCap && excess > 0) {
            b.decay ??= { t: 0, dps0: 0, growth: THRONG_EVOLUTION.decayGrowth };
            const lifeInvestment = b.sheet.getSourceMods("owner")?.find((m) => m.stat === "life" && m.kind === "more")?.value ?? 0;
            b.decay.dps0 = b.maxLife() / Math.max(0.01, 1 + lifeInvestment) * excess / units * THRONG_EVOLUTION.decayFraction;
          } else
            b.decay = void 0;
          const enraged = !!(conducting && evo.conductFury);
          if (enraged !== !!b.throngEnraged)
            b.sheet.setSource("throngEvolution:conduct", enraged ? [
              mod("moveSpeed", "more", THRONG_EVOLUTION.furyMove),
              mod("attackSpeed", "more", THRONG_EVOLUTION.furyHaste),
              mod("castSpeed", "more", THRONG_EVOLUTION.furyHaste),
              mod("damage", "more", THRONG_EVOLUTION.furyDamage)
            ] : []);
          b.throngEnraged = enraged;
          if (!active) {
            b.throngCarried = false;
            b.throngDive = void 0;
            w.bakeMinionOwnerStats(b, keeper, inst, batchScaleOf(spec));
          }
          const old = { ...b.pos };
          b.throngDriven = !!b.throngDive || !!(conducting && evo.whirlwind);
          if (b.throngDive) {
            if (!evo.fullDive) {
              b.throngDive = void 0;
              b.throngDriven = false;
            } else {
              const d = dist(b.pos, b.throngDive), step = b.sheet.get("moveSpeed") * 2 * dt;
              if (d <= Math.max(8, step)) {
                b.pos = { ...b.throngDive };
                b.throngDive = void 0;
                b.throngDriven = false;
                w.throngEvolutionBurst(b, b.pos, THRONG_EVOLUTION.diveRadius, THRONG_EVOLUTION.diveScale);
                w.kill(b);
                continue;
              }
              b.pos = w.clampPos(vec(b.pos.x + (b.throngDive.x - b.pos.x) / d * step, b.pos.y + (b.throngDive.y - b.pos.y) / d * step), b.radius, void 0, { mover: b });
            }
          } else if (conducting && evo.whirlwind) {
            if (b.clingTo)
              w.clingRelease(b);
            b.throngCarried = false;
            b.casting = null;
            const angle = w.time * THRONG_EVOLUTION.orbitSpeed + i / bodies.length * Math.PI * 2;
            const r = THRONG_EVOLUTION.orbitRadius + (i % 3 - 1) * 14;
            b.pos = w.clampPos(vec(keeper.pos.x + Math.cos(angle) * r, keeper.pos.y + Math.sin(angle) * r), b.radius, void 0, { mover: b });
            b.tier = keeper.tier;
          } else if (b.throngCarried && !conducting) {
            const angle = w.time + i * 2.4;
            b.pos = vec(keeper.pos.x + Math.cos(angle) * (keeper.radius + 7), keeper.pos.y + Math.sin(angle) * (keeper.radius + 7));
            b.tier = keeper.tier;
          } else if (conducting)
            b.throngCarried = false;
          const scale = evo.whirlwind ? 1 : evo.contactScale ?? 0;
          if (conducting && scale && !b.throngDive) {
            const previous = b.throngContactPos ?? old;
            for (const victim of foes) {
              if ((b.throngContact?.get(victim.id) ?? 0) > w.time)
                continue;
              const dx = b.pos.x - previous.x, dy = b.pos.y - previous.y;
              const q = Math.max(0, Math.min(1, ((victim.pos.x - previous.x) * dx + (victim.pos.y - previous.y) * dy) / (dx * dx + dy * dy || 1)));
              if (dist(victim.pos, vec(previous.x + dx * q, previous.y + dy * q)) > victim.radius + b.radius + 5)
                continue;
              (b.throngContact ??= /* @__PURE__ */ new Map()).set(victim.id, w.time + THRONG_EVOLUTION.contactInterval);
              w.throngEvolutionHit(b, victim, scale);
            }
            for (const [id, until] of b.throngContact ?? [])
              if (until <= w.time)
                b.throngContact.delete(id);
          }
          b.throngContactPos = { ...b.pos };
        }
      }
    }
  }
  updateThrong(dt) {
    w.throngScan -= dt;
    if (w.throngScan > 0)
      return;
    w.throngScan = 0.2;
    const t = w.time;
    for (const m of [...w.actors]) {
      if (m.dead)
        continue;
      if (m.throngWild && m.throngExpiresAt !== void 0 && t >= m.throngExpiresAt) {
        w.kill(m, true);
        continue;
      }
      if (!m.owner || !isThrongBody(m))
        continue;
      const anchored = m.owner.skills.some((s) => s?.def.throng && throngMarkerOf(s.def.id) === m.sourceSkillId) || w.wornThrongAnchored(m.owner, m.sourceSkillId);
      if (!anchored) {
        const defId = m.defId;
        const releasedSpec = m.summonInst?.def.throng;
        w.kill(m, true);
        if (defId && releasedSpec?.release !== "dismiss")
          for (let i = 0; i < (m.throngUnits ?? 1); i++)
            w.mintThrongHusk(defId, m.pos, { ttl: THRONG_CFG.motes.ttl * 2, tier: m.tier, affinity: releasedSpec?.monsterId });
      }
    }
    w.throngRebake -= 0.2;
    const rebake = w.throngRebake <= 0;
    if (rebake)
      w.throngRebake = 1;
    for (const seat of w.seats) {
      const keeper = seat.actor;
      if (keeper.dead || keeper.downed)
        continue;
      for (const { inst, spec } of [
        ...throngSpecsOn(keeper.skills),
        ...w.wornThrongAnchorsOf(keeper)
      ]) {
        if (rebake) {
          if (spec.tier === "lite" && w.minionNeedsFullDurability(keeper, inst)) {
            const kindIdx = w.liteKindOf(spec.monsterId);
            if (kindIdx >= 0)
              w.litePromoteNearest(keeper.pos, {
                within: Infinity,
                max: w.lite.used,
                owner: keeper.id,
                kindIdx
              });
          }
          for (const b of w.throngBodiesOf(keeper, inst.def.id)) {
            w.bakeMinionOwnerStats(b, keeper, inst, batchScaleOf(spec));
          }
        }
        let roster = w.throngRosterCount(keeper, inst);
        const cap = w.throngRecruitCap(keeper, inst);
        if (roster < cap) {
          for (const a of [...w.actors]) {
            if (a.dead || a.throngWild !== spec.monsterId)
              continue;
            if (a.tier !== keeper.tier)
              continue;
            const reach = THRONG_CFG.collect.reach + keeper.radius + a.radius;
            if (dist(keeper.pos, a.pos) > reach)
              continue;
            w.claimThrongHusk(keeper, inst, a);
            roster = w.throngRosterCount(keeper, inst);
            if (roster >= cap)
              break;
          }
        }
        const rows = w.throngSources(inst, spec);
        const moteRow = rows.find((r) => r.kind === "motes");
        if (moteRow) {
          const st = inst.state ??= {};
          if (st.throngMoteAt === void 0) {
            st.throngMoteAt = t + rand(moteRow.every[0], moteRow.every[1]);
          } else if (t >= st.throngMoteAt) {
            st.throngMoteAt = t + rand(moteRow.every[0], moteRow.every[1]);
            const pos = w.throngMoteSpot(keeper, moteRow.at);
            if (pos) {
              const n = w.throngYieldCount(keeper, inst, 1);
              for (let i = 0; i < n; i++) {
                w.mintThrongFind(keeper, inst, i === 0 ? pos : w.throngStandNear(pos, keeper.tier), { ttl: moteRow.ttl ?? THRONG_CFG.motes.ttl, tier: keeper.tier });
              }
            }
          }
        }
        const trickleRow = rows.find((r) => r.kind === "trickle");
        if (trickleRow) {
          const st = inst.state ??= {};
          if (roster >= cap) {
            st.throngTrickleAt = void 0;
          } else if (st.throngTrickleAt === void 0) {
            st.throngTrickleAt = t + trickleRow.everySec;
          } else if (t >= st.throngTrickleAt) {
            st.throngTrickleAt = t + trickleRow.everySec;
            let n = w.throngYieldCount(keeper, inst, trickleRow.count ?? 1);
            if ((trickleRow.at ?? "near") === "roster") {
              n = Math.min(n, cap - roster);
              for (let i = 0; i < n; i++) {
                const b = w.mintThrongBody(keeper, inst, w.throngStandNear(keeper.pos), keeper.level);
                w.text(vec(b.pos.x, b.pos.y - 14), "+1", THRONG_CFG.joinColor, 11);
                roster++;
              }
              if (n > 0)
                w.charDirty = true;
            } else {
              for (let i = 0; i < n; i++) {
                const spot = trickleRow.at === "ring" ? w.throngMoteSpot(keeper, "near") ?? w.throngStandNear(keeper.pos) : w.throngStandNear(keeper.pos, keeper.tier);
                w.mintThrongFind(keeper, inst, spot, { ttl: trickleRow.ttl ?? THRONG_CFG.motes.ttl, tier: keeper.tier });
              }
            }
          }
        }
        if (spec.untamed && rebake)
          w.driveUntamedThrong(keeper, inst, spec);
      }
    }
  }
  updateClings() {
    let seats = null;
    for (const a of w.actors) {
      if (a.dead)
        continue;
      const ride = a.clingTo;
      if (ride) {
        const v2 = w.actorById(ride.id);
        const cmd = a.aiCommand;
        const redirected = cmd !== void 0 && (cmd.kind === "recall" || cmd.targetId !== ride.id && dist(cmd.pos, v2?.pos ?? cmd.pos) > (cmd.radius ?? COMMAND_CFG.markRadius));
        if (!v2 || v2.dead || redirected) {
          w.clingRelease(a);
          continue;
        }
        if (w.time >= ride.until || clingMotionShaken(a, v2, w.time)) {
          clingSeatPos(v2, a, ride.ang, a.pos);
          w.clingRelease(a, "shake");
          continue;
        }
        clingSeatPos(v2, a, ride.ang, a.pos);
        a.facing = ride.ang + Math.PI;
        a.aiTargetId = ride.id;
        const spec = a.cling;
        if (w.time >= ride.statusAt) {
          ride.statusAt = w.time + CLING_CFG.rideStatusEvery;
          if (spec?.rideStatus)
            v2.applyStatus(spec.rideStatus, 0, 1, "cling");
          if (spec?.burrow)
            a.applyStatus("burrowed", 0, 1, "cling");
        }
        const g = spec?.gnaw;
        if (g && w.time >= ride.gnawAt) {
          const every = g.every ?? CLING_CFG.gnaw.every;
          ride.gnawAt = w.time + every;
          if (!v2.invulnerable) {
            const type = g.type ?? "physical";
            const amt = g.dps * every * a.sheet.get("damage", gnawTags(type));
            const taken = mitigateTyped(v2, { [type]: amt }, { attacker: a });
            w.observers?.onDot?.(v2, taken, type);
            if (taken > 0) {
              const deedLifeBefore = v2.life;
              v2.life -= taken;
              w.recordIndirectDamage(v2, a, deedLifeBefore);
              v2.hitFlash = 0.12;
              v2.hitFlashType = type;
              if (taken >= 1) {
                w.text(v2.pos, Math.round(taken).toString(), DAMAGE_COLOR[type], 11);
              }
              if (v2.life <= 0 && !v2.dead)
                w.kill(v2, false, a);
            }
          }
        }
        continue;
      }
      if (!a.cling || a.passive || a.throngCarried || a.throngDriven || a.throngDive || w.time < a.clingThinkAt)
        continue;
      if (a.isStunned() || a.heldBy !== void 0 || a.gripping)
        continue;
      a.clingThinkAt = w.time + CLING_CFG.thinkEvery;
      if (w.time < a.clingCooldownUntil || isDormant(a))
        continue;
      const v = a.aiTargetId !== void 0 ? w.actorById(a.aiTargetId) : void 0;
      if (!v || !clingEligible(a, v))
        continue;
      if (v.tier !== a.tier)
        continue;
      const pad = a.cling.pad ?? CLING_CFG.attachPad;
      if (dist(a.pos, v.pos) > a.radius + v.radius + pad)
        continue;
      if (!seats) {
        seats = /* @__PURE__ */ new Map();
        for (const r of w.actors) {
          if (!r.dead && r.clingTo)
            seats.set(r.clingTo.id, (seats.get(r.clingTo.id) ?? 0) + 1);
        }
      }
      const used = seats.get(v.id) ?? 0;
      if (used >= clingSeatsOf(v))
        continue;
      seats.set(v.id, used + 1);
      const shake = a.cling.shakeSec ?? CLING_CFG.shakeSec;
      a.clingTo = {
        id: v.id,
        ang: angleTo(v.pos, a.pos) + rand(-0.5, 0.5),
        until: w.time + rand(shake[0], shake[1]),
        statusAt: w.time,
        gnawAt: w.time + (a.cling.gnaw?.every ?? CLING_CFG.gnaw.every)
      };
      clingMotionShaken(a, v, w.time);
      if (a.cling.gnaw && !w.seatOf(a))
        a.casting = null;
      a.aiTargetId = v.id;
    }
  }
  claimThrongHusk(keeper, inst, husk) {
    if (husk.throngEgg) {
      const count = Math.min(husk.throngEgg, w.throngRecruitCap(keeper, inst) - w.throngRosterCount(keeper, inst));
      if (count <= 0)
        return;
      const at2 = { ...husk.pos };
      const bodies = w.throngGain(keeper, inst, count);
      if (bodies.length)
        w.throngEvolutionBurst(bodies[0], at2, THRONG_EVOLUTION.eggRadius, THRONG_EVOLUTION.eggScale * bodies.length);
      if (husk.throngPocketKey)
        w.throngClaimed.add(husk.throngPocketKey);
      w.kill(husk, true);
      return;
    }
    const bodyKind = husk.defId;
    if (husk.throngPocketKey)
      w.throngClaimed.add(husk.throngPocketKey);
    husk.throngWild = void 0;
    const at = vec(husk.pos.x, husk.pos.y);
    let radius = husk.radius;
    w.kill(husk, true);
    const spec = inst.def.throng;
    if (spec.tier === "lite" && bodyKind === spec.monsterId && !w.minionNeedsFullDurability(keeper, inst)) {
      const kindIdx = w.liteKindOf(spec.monsterId);
      if (kindIdx >= 0) {
        w.lite.spawn(kindIdx, at.x, at.y, 1, keeper.id, w.liteKinds[kindIdx].plies0);
      }
    } else {
      const body = w.mintThrongBody(keeper, inst, at, keeper.level, bodyKind);
      at.x = body.pos.x;
      at.y = body.pos.y;
      radius = body.radius;
    }
    w.text(vec(at.x, at.y - 14), "+1", THRONG_CFG.joinColor, 11);
    w.flashes.push({
      pos: vec(at.x, at.y),
      radius: radius + 8,
      color: THRONG_CFG.joinColor,
      life: 0.35,
      maxLife: 0.35
    });
    w.charDirty = true;
  }
  wornThrongAnchorsOf(keeper) {
    let out = null;
    let mine = w.wornThrongInsts.get(keeper.id);
    for (const def of Object.values(WORN_THRONGS)) {
      const rank = keeper.sheet.get(wornThrongStat(def.id));
      if (rank <= 0) {
        mine?.delete(def.id);
        continue;
      }
      if (!mine)
        w.wornThrongInsts.set(keeper.id, mine = /* @__PURE__ */ new Map());
      let row = mine.get(def.id);
      if (!row) {
        row = { inst: makeSkillInstance(buildWornThrongDef(def, rank), 1), rank };
        mine.set(def.id, row);
      } else if (row.rank !== rank) {
        row.inst.def = buildWornThrongDef(def, rank);
        row.rank = rank;
      }
      (out ??= []).push({ inst: row.inst, spec: row.inst.def.throng });
    }
    return out ?? [];
  }
  wornThrongAnchored(owner, marker) {
    if (!marker?.startsWith("__throng:worn:"))
      return false;
    const def = wornThrongDefOfSkillId(marker.slice("__throng:".length));
    return !!def && owner.sheet.get(wornThrongStat(def.id)) > 0;
  }
  driveUntamedThrong(keeper, inst, spec) {
    const bodies = w.throngBodiesOf(keeper, inst.def.id);
    if (!bodies.length)
      return;
    const reach = spec.untamed?.huntRadius ?? THRONG_CFG.untamed.huntRadius;
    const until = w.time + THRONG_CFG.untamed.orderSec;
    const prey = [];
    for (const e of w.enemiesOf(keeper)) {
      if (e.dead || e.passive || e.untargetable || e.sheet.get("invisible") > 0)
        continue;
      if (dist(e.pos, keeper.pos) > reach)
        continue;
      prey.push(e);
    }
    if (!prey.length)
      return;
    for (const b of bodies) {
      if (b.aiCommand && b.aiCommand.until > w.time && !b.aiCommand.autonomous)
        continue;
      let best = null;
      let bd = Infinity;
      for (const e of prey) {
        const dd = dist(b.pos, e.pos);
        if (dd < bd) {
          bd = dd;
          best = e;
        }
      }
      if (!best)
        continue;
      const cmd = {
        kind: "assault",
        pos: vec(best.pos.x, best.pos.y),
        until,
        radius: THRONG_CFG.direct.radius,
        issuerId: keeper.id,
        targetId: best.id,
        autonomous: true
      };
      issueCommand(b, cmd);
    }
  }
  throngMoteSpot(keeper, at) {
    if (at === "mixed")
      at = chance(0.5) ? "near" : "far";
    if (at === "lastKill") {
      const p = w.throngLastKill.get(keeper.id);
      if (p && w.walk?.isWalkable(p.x, p.y))
        return w.throngStandNear(p);
    }
    if (at === "far") {
      for (let i = 0; i < 14; i++) {
        const x = rand(80, w.arena.w - 80), y = rand(80, w.arena.h - 80);
        if (dist(vec(x, y), keeper.pos) < THRONG_CFG.motes.farMin)
          continue;
        if (w.walk && !w.walk.isWalkable(x, y))
          continue;
        if (w.pointInSolid(x, y, 10))
          continue;
        return vec(x, y);
      }
      const stand = w.farthestStand(10, false);
      if (stand)
        return stand;
    }
    const band = THRONG_CFG.motes.near;
    for (let i = 0; i < 10; i++) {
      const ang = rand(0, Math.PI * 2);
      const d = rand(band[0], band[1]);
      const x = keeper.pos.x + Math.cos(ang) * d, y = keeper.pos.y + Math.sin(ang) * d;
      if (w.walk && !w.walk.isWalkable(x, y))
        continue;
      if (w.pointInSolid(x, y, 10))
        continue;
      return vec(x, y);
    }
    return null;
  }
  noteMovementTravel(a, inst, from, progress) {
    const p = movementProfile(inst.def.id);
    if (!p || p.family === "blink" || a.dead || a.downed || dist(from, a.pos) < 0.01)
      return;
    let flash = w.movementFlashes.get(a);
    if (!flash || !w.flashes.includes(flash) || flash.movement?.skillId !== inst.def.id || flash.recoveryCueTier !== a.tier) {
      if (w.flashes.filter((f) => f.movement).length >= MOVEMENT_VISUAL_STYLE.maxTraces)
        return;
      flash = {
        pos: { ...a.pos },
        radius: a.radius,
        facing: a.facing,
        color: cosmeticSkillPaint(w, a, inst.def.id).color ?? inst.def.color,
        life: MOVEMENT_VISUAL_STYLE.fadeSeconds,
        maxLife: MOVEMENT_VISUAL_STYLE.fadeSeconds,
        recoveryCueTier: a.tier,
        movement: { skillId: inst.def.id, clock: w.time, progress, points: [] }
      };
      w.movementFlashes.set(a, flash);
      w.flashes.push(flash);
    }
    flash.pos = { ...a.pos };
    flash.life = flash.maxLife;
    extendMovementTrail(flash.movement, from, a.pos, w.time, Math.max(0, Math.min(1, progress)));
  }
  resolveImpactHit(a, speed, p) {
    if (a.dead || a.invulnerable || a.untargetable)
      return;
    const caster = p.caster && !p.caster.dead ? p.caster : void 0;
    if (caster ? !w.hostileTo(caster, a) : !MASS_CFG.impact.casterless)
      return;
    if (w.time < a.slamIcdUntil)
      return;
    const frac = impactFrac(speed, a.effectiveWeight()) * (caster ? impactScale(caster, p.inst) : 1);
    if (frac <= 0)
      return;
    a.slamIcdUntil = w.time + MASS_CFG.impact.icdSec;
    const out = {};
    const taken = mitigateTyped(a, { physical: frac * a.maxLife() }, { out });
    a.life -= taken;
    const poiseFrac = MASS_CFG.impact.poiseFrac;
    if (poiseFrac > 0)
      a.damagePoise(frac * poiseFrac * a.maxPoise(), caster);
    a.hitFlash = 0.15;
    a.hitFlashType = "physical";
    w.flashes.push({
      pos: vec(a.pos.x, a.pos.y),
      radius: a.radius + 12,
      color: "#c8b8a0",
      life: 0.22,
      maxLife: 0.22
    });
    w.text(a.pos, Math.round(taken).toString(), DAMAGE_COLOR.physical, 14);
    if (out.clamped)
      w.showCombatOutcome(a, "hit_cap", caster?.pos);
    if (a.life <= 0 && !a.dead)
      w.kill(a, false, caster);
  }
  sweepBodySlam(a, p, speed) {
    const near = w.actorsNear(a.pos.x, a.pos.y, a.radius + 96, w.slamScratch);
    const dir = Math.atan2(p.vy, p.vx);
    const moverW = a.effectiveWeight();
    const casterLive = p.caster && !p.caster.dead ? p.caster : void 0;
    for (const b of near) {
      if (b === a || b === p.caster || b.dead || b.downed)
        continue;
      if (b.untargetable || b.invulnerable)
        continue;
      if (isDormant(b))
        continue;
      if (!!a.flying !== !!b.flying)
        continue;
      if (!sameStory(a, b))
        continue;
      if (a.sheet.get("phasing") > 0 || b.sheet.get("phasing") > 0)
        continue;
      if (dist(a.pos, b.pos) > a.radius + b.radius)
        continue;
      const arrested = b.effectiveWeight() >= moverW * MASS_CFG.slam.arrestRatio;
      if (w.time >= b.slamIcdUntil) {
        b.slamIcdUntil = w.time + MASS_CFG.impact.icdSec;
        const frac = impactFrac(speed, moverW) * (casterLive ? impactScale(casterLive, p.inst) : 1) * MASS_CFG.slam.struckFrac;
        if (frac > 0 && (casterLive ? w.hostileTo(casterLive, b) : MASS_CFG.impact.casterless)) {
          const out = {};
          const taken = mitigateTyped(b, { physical: frac * b.maxLife() }, { out });
          b.life -= taken;
          const poiseFrac = MASS_CFG.impact.poiseFrac;
          if (poiseFrac > 0)
            b.damagePoise(frac * poiseFrac * b.maxPoise(), casterLive);
          b.hitFlash = 0.15;
          b.hitFlashType = "physical";
          w.text(b.pos, Math.round(taken).toString(), DAMAGE_COLOR.physical, 13);
          if (out.clamped)
            w.showCombatOutcome(b, "hit_cap", a.pos);
          if (b.life <= 0 && !b.dead)
            w.kill(b, false, casterLive);
        }
        if (!b.dead) {
          w.pushActor(b, dir, speed * (arrested ? MASS_CFG.slam.arrestNudge : MASS_CFG.slam.transfer) / PUSH_DAMPING, p.caster, p.inst, { noAuthority: true });
        }
        if (!arrested) {
          p.vx *= MASS_CFG.slam.plowDamping;
          p.vy *= MASS_CFG.slam.plowDamping;
          speed *= MASS_CFG.slam.plowDamping;
        }
      }
      if (arrested) {
        if (!p.collided && casterLive && p.inst) {
          p.collided = true;
          w.rollCollisionProcs(casterLive, p.inst, a);
        }
        w.resolveImpactHit(a, speed, p);
        p.vx = 0;
        p.vy = 0;
        return;
      }
      if (speed < MASS_CFG.slam.minSpeed)
        return;
    }
  }
  updateHivecall(dt) {
    for (const a of w.hivecallHooks)
      for (const key of a.lifeDamageInterceptors?.keys() ?? []) {
        if (key.startsWith("hivecall:"))
          a.lifeDamageInterceptors?.delete(key);
      }
    w.hivecallHooks.clear();
    for (const seat of w.seats) {
      const hero = seat.home ?? seat.actor;
      const host = hero.skills.find((s) => s?.def.hivecall);
      if (!host || hero.dead) {
        hero.hivecallHud = void 0;
        if (seat.actor.hiveForm)
          w.seatEject(seat, "released");
        continue;
      }
      const st = hivecallState(host);
      let form = seat.actor.hiveForm;
      if (form) {
        hero.pos = { ...seat.actor.pos };
        hero.tier = seat.actor.tier;
      }
      if (form && (!hivecallNode(host, "royal_guard") || form.host !== host)) {
        w.seatEject(seat, "released");
        form = void 0;
      }
      if (!hivecallNode(host, "royal_guard"))
        st.meter = 0;
      if (form) {
        w.syncHivecallFormDamage(seat.actor, host);
        form.remaining -= dt;
        if (form.remaining <= 0) {
          w.seatEject(seat, "duration");
          form = void 0;
        }
      }
      const roster = w.hivecallRoster(hero, host), cap = w.hivecallCap(hero, host);
      if (roster.length && hivecallNode(host, "royal_guard")) {
        const passiveGain = HIVECALL.passiveGain * dt;
        if (!form)
          st.meter = Math.min(HIVECALL.meterMax, st.meter + passiveGain);
        else if (hivecallNode(host, "regal_execution"))
          form.remaining = Math.min(HIVECALL.duration, form.remaining + passiveGain * HIVECALL.duration / HIVECALL.meterMax);
      }
      if (hero.summonToggles.has(host.def.id) && roster.length < cap) {
        const d = instanceDelivery(host);
        const speed = hero.sheet.get("minionRespawnTime", skillContextTags(host), instanceMods(host));
        const delay = (d.type === "summon" ? d.persistent?.respawnTime ?? 4 : 4) * speed;
        st.rebirthAt ??= w.time + delay;
        if (w.time >= st.rebirthAt) {
          w.spawnMinion(hero, host);
          st.rebirthAt = w.hivecallRoster(hero, host).length >= cap ? void 0 : w.time + (hivecallNode(host, "crowded_cells") ? HIVECALL.rapidInterval * speed : delay);
        }
      } else
        st.rebirthAt = void 0;
      for (const guard of roster) {
        if (!hivecallNode(host, "brood_nourishment") || guard.defId !== "hive_royal_guard") {
          guard.hiveBroodAt = void 0;
          continue;
        }
        guard.hiveBroodAt ??= w.time + HIVECALL.broodDelay;
        if (w.time < guard.hiveBroodAt)
          continue;
        guard.hiveBroodAt = w.time + HIVECALL.broodDelay;
        const child = { ...host, treeNodes: host.treeNodes?.filter((id) => !["scurrying_tide", "needle_mandibles", "brood_nourishment"].includes(id)), state: {} };
        const d = instanceDelivery(child);
        if (d.type !== "summon")
          continue;
        for (let n = 0; n < 2; n++)
          w.spawnMinion(hero, child, {
            monsterId: "swarmling",
            pos: { x: guard.pos.x + (n ? 15 : -15), y: guard.pos.y },
            delivery: { ...d, persistent: void 0, duration: HIVECALL.broodLife },
            offspring: { maxActive: cap * 2, size: 1, life: 1, damage: 1 }
          });
      }
      hero.hivecallHud = { meter: st.meter, remaining: form?.remaining, rebirth: st.rebirthAt === void 0 ? void 0 : Math.max(0, st.rebirthAt - w.time), ready: Math.max(0, (st.readyAt ?? 0) - w.time) };
      seat.actor.hivecallHud = hero.hivecallHud;
      const aura = !!form && hivecallNode(host, "royal_carapace");
      const recipients = aura ? w.actors.filter((a) => !a.dead && a.team === seat.actor.team && sameStory(a, seat.actor) && dist(a.pos, seat.actor.pos) <= HIVECALL.auraRadius) : [hero];
      for (const a of recipients) {
        w.hivecallHooks.add(a);
        (a.lifeDamageInterceptors ??= /* @__PURE__ */ new Map()).set(`hivecall:${hero.id}`, (amount) => {
          if (amount <= 0)
            return amount;
          if (aura && seat.actor.hiveForm && sameStory(a, seat.actor) && dist(a.pos, seat.actor.pos) <= HIVECALL.auraRadius) {
            a.addBuff({ type: "buff", id: "hivecall_fury", duration: 3, mods: [mod("damage", "more", 0.3), mod("attackSpeed", "increased", 0.4), mod("castSpeed", "increased", 0.4)] });
            if (w.hivecallRedirecting)
              return amount;
            const shields = w.hivecallRoster(hero, host).filter((m) => m !== a && sameStory(m, a) && dist(m.pos, seat.actor.pos) <= HIVECALL.auraRadius);
            if (shields.length) {
              const share = amount * HIVECALL.redirect / shields.length;
              let absorbed = 0;
              w.hivecallRedirecting = true;
              try {
                for (const m of shields) {
                  const wound = Math.min(share, Math.max(0, m.life));
                  absorbed += wound;
                  landLifeDamage(m, wound);
                  if (m.life <= 0)
                    w.kill(m, false, a);
                }
              } finally {
                w.hivecallRedirecting = false;
              }
              amount -= absorbed;
            }
          }
          if (a === hero && amount >= hero.life && hero.life > 0 && hivecallNode(host, "knitted_regents") && w.hivecallTransform(hero, host, true))
            return Math.max(0, hero.life - 1);
          return amount;
        });
      }
    }
  }
  updateMinionMeta(dt) {
    w.minionMetaScan -= dt;
    if (w.minionMetaScan > 0)
      return;
    w.minionMetaScan = 0.4;
    for (const m of [...w.actors]) {
      if (m.dead || !m.owner || m.owner.kind !== "player")
        continue;
      if (m.summonInst?.companionGrant)
        continue;
      const anchor = m.summonInst?.hostSkillId ?? m.sourceSkillId;
      if (!anchor || anchor.startsWith("__"))
        continue;
      if (m.owner.skills.some((s) => s?.def.id === anchor))
        continue;
      w.releaseContract(m, false);
      w.kill(m, true);
    }
    for (const m of [...w.actors]) {
      if (m.dead || m.lifelineId === void 0)
        continue;
      const keeper = w.actorById(m.lifelineId);
      if (!keeper || keeper.dead) {
        w.releaseContract(m, false);
        w.kill(m, true);
      }
    }
    const presence = /* @__PURE__ */ new Map();
    for (const a of w.actors) {
      if (a.dead || !a.owner || a.construct || !a.sourceSkillId)
        continue;
      const d = a.summonInst?.def.delivery;
      if (d?.type !== "summon" || !d.presence)
        continue;
      const list = presence.get(a.owner) ?? [];
      if (!list.some((p) => p.skillId === a.sourceSkillId)) {
        list.push({
          key: "presence:" + a.sourceSkillId,
          skillId: a.sourceSkillId,
          mods: d.presence.minionMods
        });
        presence.set(a.owner, list);
      }
    }
    for (const m of w.actors) {
      if (m.dead || !m.owner || m.construct || !m.isMinion())
        continue;
      const want = (presence.get(m.owner) ?? []).filter((p) => p.skillId !== m.sourceSkillId);
      const worn = m.wornPresence ?? [];
      if (!want.length && !worn.length)
        continue;
      for (const key of worn) {
        if (!want.some((p) => p.key === key))
          m.sheet.removeSource(key);
      }
      for (const p of want) {
        if (!worn.includes(p.key))
          m.sheet.setSource(p.key, p.mods);
      }
      m.wornPresence = want.map((p) => p.key);
    }
    for (const eater of w.actors) {
      if (eater.dead || !eater.devour || !eater.owner)
        continue;
      if (w.time < eater.devour.next)
        continue;
      const spec = eater.devour.spec;
      let meal = null, bd = spec.radius ?? 220;
      for (const m of w.actors) {
        if (m === eater || m.dead || m.owner !== eater.owner || m.construct || m.untargetable)
          continue;
        if (m.sourceSkillId === eater.sourceSkillId)
          continue;
        if (m.devour)
          continue;
        const dd = dist(eater.pos, m.pos);
        if (dd < bd) {
          bd = dd;
          meal = m;
        }
      }
      if (!meal)
        continue;
      eater.devour.next = w.time + spec.interval;
      if (spec.heal)
        noteRestoreGain(eater, "life", eater.healBy(meal.maxLife() * spec.heal), spec.feedingCue);
      if (spec.mods?.length) {
        eater.addBuff({
          type: "buff",
          id: "devour_feast",
          duration: spec.duration ?? 15,
          mods: spec.mods,
          maxStacks: spec.maxStacks ?? 5
        });
      }
      w.kill(meal, false, eater);
      const feedingCue = meal.dead ? feedingCueFlash(meal.pos, eater, spec.feedingCue, "flesh", meal.tier, meal.radius) : void 0;
      if (feedingCue)
        w.flashes.push(feedingCue);
    }
  }
  updateReplenishment(dt) {
    for (const caster of [...w.actors]) {
      if (caster.dead || caster.downed || !caster.skills.some((inst) => inst && replenishingDelivery(inst))) {
        w.replenishment.forget(caster);
        continue;
      }
      const entries = [];
      for (const inst of new Set(caster.skills)) {
        if (!inst)
          continue;
        const d = replenishingDelivery(inst);
        if (!d || !replenishmentActive(inst) || d.persistent || d.decay || d.waves || d.fromCorpse || !Number.isFinite(d.replenish.interval) || d.replenish.interval <= 0 || instanceTargeting(inst)?.target === "corpse" || caster.isStunned() || caster.tagsForbidden(inst) || w.castSealed(caster, inst) || w.castReqRefusal(caster, inst))
          continue;
        const shape = replenishShape(caster, inst, d);
        const alive = d.poolGroup ? w.minionsOfGroup(caster, d.poolGroup) : w.minionsOfSkill(caster, inst.def.id);
        const capacityBodies = alive.filter((a) => !a.summonOffspring);
        entries.push({ inst, interval: shape.interval, count: shape.count, room: shape.cap - capacityBodies.length });
      }
      w.replenishment.update(caster, entries, dt * w.timeflow.actorScale(caster), (inst, count) => {
        const d = replenishingDelivery(inst);
        const alive = d.poolGroup ? w.minionsOfGroup(caster, d.poolGroup) : w.minionsOfSkill(caster, inst.def.id);
        const room = replenishShape(caster, inst, d).cap - alive.filter((a) => !a.summonOffspring).length;
        for (let n = 0; n < Math.min(count, room); n++)
          w.spawnMinion(caster, inst);
      });
    }
  }
  updateLeaps(dt) {
    for (const a of w.actors) {
      const L = a.leap;
      if (!L)
        continue;
      if (a.dead) {
        a.leap = void 0;
        continue;
      }
      L.timer -= dt * w.timeflow.actorScale(a);
      const t = clamp(1 - L.timer / L.total, 0, 1);
      const visualFrom = { ...a.pos };
      a.pos = vec(L.from.x + (L.dest.x - L.from.x) * t, L.from.y + (L.dest.y - L.from.y) * t);
      w.noteMovementTravel(a, L.inst, visualFrom, t);
      if (L.timer > 0)
        continue;
      a.pos = vec(L.dest.x, L.dest.y);
      a.untargetable = L.wasUntargetable;
      a.leap = void 0;
      const lTags = skillContextTags(L.inst.def, grantedTags(L.inst));
      const lMods = instanceMods(L.inst);
      const lSigil = Math.round(a.sheet.get("aoeShape", lTags, lMods));
      const lShape = lSigil === 1 || lSigil === 2 ? lSigil : 0;
      for (const e of w.enemiesOf(a)) {
        if (!sameStory(a, e))
          continue;
        if (lShape ? inAoe(a.pos, L.radius, lShape, a.facing, e.pos, e.radius) : dist(a.pos, e.pos) - e.radius <= L.radius) {
          w.resolveHit(a, L.inst, e, L.dmgMult);
        }
      }
      w.strikeSurfaces(a, a.pos, L.radius);
      w.flashes.push({
        pos: vec(a.pos.x, a.pos.y),
        radius: L.radius,
        color: cosmeticSkillPaint(w, a, L.inst.def.id).color ?? L.inst.def.color,
        life: 0.3,
        maxLife: 0.3,
        fx: skillMovementVoice(L.inst.def.id, "impact"),
        recoveryCueTier: a.tier,
        shape: lShape,
        facing: a.facing
      });
      w.mintAftermath(a, L.inst, a.pos, L.radius, lShape, a.facing, L.dmgMult, lTags, lMods);
      w.moveBlast(a, L.inst, a.pos);
      w.dropLingerField(a, L.inst, a.pos);
      const mtLand = a.sheet.get("moveTrail", skillContextTags(L.inst.def, grantedTags(L.inst)), instanceMods(L.inst));
      if (mtLand > 0) {
        w.mintTrailPatch(a, L.inst, w.statTrailSpec(mtLand), a.pos, a.facing);
      }
      const lBash = guardBashSpec(L.inst);
      if (lBash) {
        w.guardBash(a, L.inst, lBash, BASH_CFG.poollessShield * a.sheet.get("guardStrength", skillContextTags(L.inst.def, grantedTags(L.inst)), instanceMods(L.inst)));
      }
    }
  }
  updateStrobes(dt) {
    for (const a of w.actors) {
      if (a.hexToggles.size && a.dead) {
        for (const [id, hx] of a.hexToggles) {
          a.reservedMana = Math.max(0, a.reservedMana - hx.reserved);
          a.hexToggles.delete(id);
        }
      }
      if (!a.strobes.size)
        continue;
      for (const [id, st] of a.strobes) {
        const d = st.inst.def.delivery;
        if (a.dead || d.type !== "ground" || !d.strobe) {
          a.reservedMana = Math.max(0, a.reservedMana - st.reserved);
          a.strobes.delete(id);
          continue;
        }
        st.timer -= dt;
        if (st.timer > 0)
          continue;
        st.timer += d.strobe.interval;
        const bearing = (d.strobe.bearing ?? "random") === "facing" ? a.facing : rand(0, Math.PI * 2);
        const reach = Math.max(24, d.castRange);
        const aim = vec(a.pos.x + Math.cos(bearing) * reach, a.pos.y + Math.sin(bearing) * reach);
        w.executeSkill(a, st.inst, aim, { noCooldown: true, noRepeat: true, keepFacing: true });
      }
    }
  }
  updateVents(dt) {
    for (const a of w.actors) {
      if (!a.venting.size || a.dead)
        continue;
      a.ventTick -= dt;
      if (a.ventTick > 0)
        continue;
      a.ventTick += TETHER_TICK;
      for (const id of [...a.venting]) {
        const inst = a.skills.find((s) => s?.def.pool?.id === id);
        const pl = inst?.def.pool;
        if (!pl || pl.release.mode !== "vent") {
          a.venting.delete(id);
          continue;
        }
        const { rate, radius } = poolVentRead(a, inst);
        const banked = a.pools.get(id) ?? 0;
        const drain = Math.min(banked, rate * TETHER_TICK);
        if (drain <= 0) {
          a.venting.delete(id);
          continue;
        }
        a.pools.set(id, banked - drain);
        for (const e of w.actors) {
          if (!w.isBurstTarget(e, a.team, a.tier))
            continue;
          if (dist(a.pos, e.pos) - e.radius > radius)
            continue;
          const taken = mitigateTyped(e, { [pl.damageType]: drain });
          if (taken > 0) {
            e.life -= taken;
            w.accumulateDotText(e, taken, TETHER_TICK);
            if (e.life <= 0 && !e.dead)
              w.kill(e, false, a);
          }
        }
      }
    }
  }
  updateDischarges() {
    for (const a of w.actors) {
      if (a.dead)
        continue;
      for (const inst of a.skills) {
        const ds = inst?.def.discharge;
        if (!ds)
          continue;
        if ((a.charges.get(ds.charge) ?? 0) < 1)
          continue;
        if (w.time < (a.dischargeAt.get(inst.def.id) ?? 0))
          continue;
        const tags = skillContextTags(inst.def);
        const extra = instanceMods(inst);
        const zapPhase = (ds.occlusion ?? "blocked") === "free" || a.sheet.get("phasing", tags, extra) > 0;
        let best = null;
        let bd = ds.range * a.sheet.get("aoeRadius", tags, extra);
        for (const e of w.enemiesOf(a)) {
          if (!sameStory(a, e))
            continue;
          if (e.invulnerable)
            continue;
          const dd = dist(a.pos, e.pos) - e.radius;
          if (dd >= bd)
            continue;
          if (!zapPhase && !w.lineOfFire(a.pos, e.pos, a.tier))
            continue;
          bd = dd;
          best = e;
        }
        if (!best)
          continue;
        const held = (a.charges.get(ds.charge) ?? 1) - 1;
        const beat = Math.max(0.15, ds.interval - (ds.intervalPerCharge ?? 0) * held);
        a.dischargeAt.set(inst.def.id, w.time + beat);
        a.spendCharge(ds.charge, 1);
        w.resolveHit(a, inst, best, ds.damageScale ?? 0.6);
        w.tethers.push({
          a,
          b: best,
          owner: a,
          skillId: "__discharge:" + inst.def.id,
          link: "zap",
          visual: inst.def.id,
          visualAge: 0,
          amounts: {},
          heal: 0,
          affects: "enemies",
          width: 5,
          remaining: 0.14,
          tickTimer: 9,
          color: inst.def.color,
          ax: a.pos.x,
          ay: a.pos.y,
          bx: best.pos.x,
          by: best.pos.y
        });
      }
    }
  }
  checkMinionDetonations() {
    for (const a of w.actors) {
      if (a.dead || !a.isMinion() || a.explodeOnLowLife <= 0)
        continue;
      if (a.life < a.maxLife() * a.lowLifeLine()) {
        w.explodeActor(a, a.explodeOnLowLife);
        w.kill(a, true);
      }
    }
  }
  updateSummonShells() {
    for (const body of w.actors) {
      if (!body.summonShell || body.dead || !body.owner)
        continue;
      body.pos = { ...body.owner.pos };
      body.tier = body.owner.tier;
      body.facing = body.owner.facing;
      body.facingPrev = body.owner.facing;
      if (body.owner.dead || body.owner.downed || body.shellGuard?.broken)
        body.casting = null;
    }
  }
  echoSympathy(gainer, ev) {
    if (gainer.dead)
      return;
    const holders = [gainer];
    if (gainer.owner && !gainer.owner.dead)
      holders.push(gainer.owner);
    for (const s of w.seats) {
      if (s.actor !== gainer && !s.actor.dead && !holders.includes(s.actor)) {
        holders.push(s.actor);
      }
    }
    for (const holder of holders) {
      const rel = sympathyRelationOf(holder, gainer, w);
      if (!rel)
        continue;
      for (const id in SYMPATHY_LINKS) {
        const link = SYMPATHY_LINKS[id];
        if ((link.from ?? "self") !== rel)
          continue;
        if (!link.channels.includes(ev.kind))
          continue;
        if (link.tags && !(ev.tags && link.tags.every((t) => ev.tags.includes(t))))
          continue;
        if (link.chargeIds && !(ev.kind === "charge" && link.chargeIds.includes(ev.id)))
          continue;
        if (link.buffIds && !(ev.kind === "buff" && link.buffIds.includes(ev.id)))
          continue;
        if (link.orbKinds && !(ev.kind === "orb" && link.orbKinds.includes(ev.id)))
          continue;
        if (ev.depth > SYMPATHY_CFG.maxSourceDepth + Math.floor(holder.sheet.get("sympathyDepth")))
          continue;
        const potency = w.sympathyPotency(holder, link.id);
        if (potency <= 0)
          continue;
        const scale = (link.scale ?? SYMPATHY_CFG.scale) * potency;
        if (scale <= 0)
          continue;
        for (const r of gatherSympathyRecipients(w, holder, link, gainer)) {
          const landed = w.applySympathyEcho(r, ev, scale);
          if (landed && SYMPATHY_CFG.text && ev.kind !== "charge" && ev.kind !== "buff") {
            w.text(r.pos, link.label, link.color ?? "#9ab8e8", 10);
          }
        }
      }
    }
  }
  sympathyPotency(holder, linkId) {
    const stat = sympathyStat(linkId);
    let p = holder.sheet.get(stat);
    for (const inst of holder.skills) {
      if (!inst || inst.sockets.length === 0 && !inst.def.innateMods && !inst.treeNodes?.length && !inst.grafts?.length)
        continue;
      p = Math.max(p, holder.sheet.get(stat, skillContextTags(inst, grantedTags(inst)), instanceMods(inst)));
    }
    return p;
  }
  applySympathyEcho(r, ev, scale) {
    switch (ev.kind) {
      case "restore": {
        const total = (ev.n ?? 0) * scale;
        if (total <= 0)
          return false;
        if (ev.dur === void 0) {
          return w.applyRestore(r, {
            resource: ev.id,
            amount: total
          }, { noEvent: true }) > 0;
        }
        r.restoreStreams.push({
          resource: ev.id,
          perSec: total / Math.max(0.2, ev.dur),
          remaining: total
        });
        return true;
      }
      case "heal":
        return r.healBy((ev.n ?? 0) * scale) > 0;
      case "charge": {
        let cap = CHARGE_DEFS[ev.id]?.baseCap ?? 0;
        for (const inst of r.skills) {
          if (!inst)
            continue;
          for (const cg of instanceChargeGain(inst)) {
            if (cg.charge === ev.id)
              cap = Math.max(cap, cg.max);
          }
        }
        const before = r.charges.get(ev.id) ?? 0;
        r.gainCharge(ev.id, ev.n ?? 1, cap, void 0, ev.depth + 1);
        return (r.charges.get(ev.id) ?? 0) > before;
      }
      case "buff": {
        if (!ev.buff)
          return false;
        r.addBuff(ev.buff, scale, ev.depth + 1);
        return true;
      }
      case "orb": {
        const def = ORB_DEFS[ev.id];
        if (!def)
          return false;
        let landed = false;
        if (def.restore && (ev.n ?? 0) > 0) {
          landed = w.applyRestore(r, {
            resource: def.restore,
            amount: (ev.n ?? 0) * scale,
            resetEsDelay: def.restore === "es"
          }, { noEvent: true }) > 0;
        }
        if (def.charge) {
          const before = r.charges.get(def.charge.charge) ?? 0;
          r.gainCharge(def.charge.charge, def.charge.amount, def.charge.max, void 0, ev.depth + 1);
          landed = landed || (r.charges.get(def.charge.charge) ?? 0) > before;
        }
        return landed;
      }
    }
  }
  updateOrbs(dt) {
    for (let i = w.orbs.length - 1; i >= 0; i--) {
      const orb = w.orbs[i];
      const def = ORB_DEFS[orb.kind];
      if (!def) {
        w.orbs.splice(i, 1);
        continue;
      }
      orb.bob += dt * 3;
      orb.life -= dt;
      if (orb.life <= 0) {
        w.orbs.splice(i, 1);
        continue;
      }
      if (orb.homeTo) {
        if (orb.homeTo.dead) {
          orb.homeTo = void 0;
          continue;
        }
        const home = orb.homeTo;
        const gap = dist(orb.pos, home.pos);
        if (gap <= home.radius + 10) {
          w.pourOrb(home, orb);
          w.orbs.splice(i, 1);
        } else {
          const ang = angleTo(orb.pos, home.pos);
          const speed = 320 + (8 - orb.life) * 90;
          orb.pos.x += Math.cos(ang) * speed * dt;
          orb.pos.y += Math.sin(ang) * speed * dt;
        }
        continue;
      }
      orb.tier ??= w.spoilStoryAt(orb.pos);
      const seat = w.pickupSeat(orb.pos, Math.max(18, def.magnet ?? 0), void 0, orb.tier);
      if (!seat)
        continue;
      const p = seat.actor;
      if (dist(orb.pos, p.pos) > p.radius + 18) {
        const ang = angleTo(orb.pos, p.pos);
        orb.pos.x += Math.cos(ang) * 240 * dt;
        orb.pos.y += Math.sin(ang) * 240 * dt;
        continue;
      }
      w.pourOrb(p, orb);
      w.orbs.splice(i, 1);
    }
  }
  pourOrb(a, orb) {
    const def = ORB_DEFS[orb.kind];
    if (!def)
      return;
    const gained = [];
    if (def.restore && orb.amount > 0) {
      w.applyRestore(a, {
        resource: def.restore,
        amount: orb.amount,
        resetEsDelay: def.restore === "es"
      }, { noEvent: true });
      gained.push(`+${orb.amount} ${def.label}`);
    }
    if (def.charge) {
      const before = a.charges.get(def.charge.charge) ?? 0;
      a.gainCharge(def.charge.charge, def.charge.amount, def.charge.max);
      if ((a.charges.get(def.charge.charge) ?? 0) > before) {
        gained.push(`+${def.charge.amount} ${def.label}`);
      }
    }
    w.tapCharges(a, "orbPickup", void 0, orb.kind);
    w.refundOnOrb(a, orb.kind);
    if (a.gainEvents.length < 64) {
      a.gainEvents.push({ kind: "orb", id: orb.kind, depth: 0, n: orb.amount });
    }
    if (gained.length)
      w.text(a.pos, gained.join("  "), def.color, 12, "gains");
    w.observers?.onOrbPickup?.(orb.kind, a);
  }
  updateRemnants(dt) {
    for (let i = w.remnants.length - 1; i >= 0; i--) {
      const r = w.remnants[i];
      r.bob += dt * 3;
      r.life -= dt;
      if (r.life <= 0) {
        w.remnants.splice(i, 1);
        continue;
      }
      const seat = w.pickupSeat(r.pos, 18);
      if (!seat)
        continue;
      const p = seat.actor;
      if (r.kind) {
        const def = REMNANT_KINDS[r.kind];
        if (def) {
          const remnantCue = def.cue ?? { profile: "physical", color: def.color };
          if (def.buff) {
            p.addBuff({ ...def.buff, storedCue: def.buff.storedCue ?? remnantCue });
            if (p.buffs.has(def.buff.id))
              noteProcCue(p, remnantCue, "gain", "remnant:" + def.id);
          }
          if (def.charge) {
            const remnantCueBefore = p.charges.get(def.charge.charge) ?? 0;
            p.gainCharge(def.charge.charge, def.charge.amount, def.charge.max);
            const remnantCueGain = (p.charges.get(def.charge.charge) ?? 0) - remnantCueBefore;
            if (remnantCueGain > 0)
              noteProcCue(p, remnantCue, "gain", "remnant:" + def.id, remnantCueGain);
          }
        }
      } else if (r.element) {
        p.addBuff({
          type: "buff",
          id: "remnant_" + r.element,
          duration: 10,
          storedCue: { profile: r.element },
          mods: [
            mod("damage", "more", 0.4, [r.element]),
            mod("projectileCount", "flat", 1, [r.element]),
            mod("aoeRadius", "increased", 0.3, [r.element])
          ]
        });
        if (p.buffs.has("remnant_" + r.element))
          noteProcCue(p, { profile: r.element }, "gain", "remnant:" + r.element);
      }
      w.remnants.splice(i, 1);
    }
  }
  pickupSeat(at, reach, exclude, story = 0) {
    let best;
    let bestD = Infinity;
    for (const s of w.seats) {
      if (s.actor.dead || s.actor.downed)
        continue;
      if (exclude && s.id === exclude)
        continue;
      if (s.actor.tier !== story)
        continue;
      const d = dist(at, s.actor.pos);
      if (d <= s.actor.radius + reach && d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }
  refundOnOrb(a, kind) {
    if (a.cooldowns.size === 0)
      return;
    for (const inst of a.skills) {
      if (!inst)
        continue;
      const left = a.cooldowns.get(inst.def.id);
      if (left === void 0)
        continue;
      const s = a.sheet.get(orbRefundStat(kind), skillContextTags(inst, grantedTags(inst)), instanceMods(inst));
      if (s <= 0)
        continue;
      const next = left - s;
      if (next <= 0)
        a.cooldowns.delete(inst.def.id);
      else
        a.cooldowns.set(inst.def.id, next);
    }
  }
  updatePendingContagions() {
    for (let i = w.pendingContagions.length - 1; i >= 0; i--) {
      const c = w.pendingContagions[i];
      if (w.time < c.when)
        continue;
      w.pendingContagions.splice(i, 1);
      if (c.caster.dead)
        continue;
      const sdef = SKILLS[c.skillId];
      if (!sdef)
        continue;
      const at = !c.host.dead ? vec(c.host.pos.x, c.host.pos.y) : c.at;
      const minted = makeSkillInstance(sdef, c.level);
      (minted.state ??= {}).contagion = { gen: c.gen, seen: c.seen };
      w.executeSkill(c.caster, minted, vec(at.x, at.y), {
        targetInfo: { pos: vec(at.x, at.y), actor: !c.host.dead ? c.host : void 0 },
        dmgMult: c.damageScale,
        noCooldown: true,
        noRepeat: true,
        noFollowUp: true,
        keepFacing: true
      });
    }
  }
  grantedPocketsFor(a) {
    if (w.syncedGrantedPockets)
      return w.syncedGrantedPockets[a.id] ?? [];
    const zoneKey = `${w.zone.id}:${w.currentZoneSeed}`;
    if (w.grantedPocketZone !== zoneKey) {
      w.grantedPocketZone = zoneKey;
      w.grantedPocketCache.clear();
    }
    const out = [];
    for (const def of Object.values(POCKET_GRANTS)) {
      if (a.dead || a.downed || a.sheet.get(pocketGrantStat(def.id)) <= 0)
        continue;
      const key = `${def.id}:${a.tier}`;
      let pockets = w.grantedPocketCache.get(key);
      if (!pockets) {
        const walk = a.tier >= 1 && w.tierViews ? w.tierViews[a.tier] ?? w.walk : w.walk;
        pockets = placeGrantedPockets(def, w.currentZoneSeed, a.tier, w.arena.w, w.arena.h, (x, y) => {
          if (x < 0 || y < 0 || x > w.arena.w || y > w.arena.h)
            return false;
          if (walk && !walk.isWalkable(x, y))
            return false;
          if (w.walk?.regionAt && !tierFloorAt(w.walk.regionAt(x, y), a.tier))
            return false;
          return !w.pointInSolid(x, y, 4, a.tier);
        });
        w.grantedPocketCache.set(key, pockets);
      }
      out.push(...pockets);
    }
    return out;
  }
  insideGrantedPocket(a, id, pockets = w.grantedPocketsFor(a)) {
    return pockets.some((p) => p.grantId === id && p.tier === a.tier && Math.hypot(p.x - a.pos.x, p.y - a.pos.y) <= p.r);
  }
  inGrantedRefuge(a, resource) {
    return Object.values(POCKET_GRANTS).some((def) => def.resource === resource && a.sheet.get(pocketGrantStat(def.id)) > 0 && w.insideGrantedPocket(a, def.id));
  }
  syncPocketGrants(a) {
    const armed = a.sheet.armedFamily("pocketGrant_", POCKET_GRANT_IDS);
    if (!armed.length && !a.pocketGrantSignature)
      return;
    const mods = [];
    const states = [];
    let pockets;
    for (const id of armed) {
      const def = POCKET_GRANTS[id];
      if (a.sheet.get(pocketGrantStat(def.id)) <= 0)
        continue;
      pockets ??= w.grantedPocketsFor(a);
      const natural = a.tier === 0 && w.walk?.regionAt?.(a.pos.x, a.pos.y) === def.regionId;
      const inside = !a.leap && !a.flying && (natural || w.insideGrantedPocket(a, def.id, pockets));
      states.push(`${def.id}:${inside ? 1 : 0}`);
      mods.push(...inside ? def.inside : def.outside);
    }
    const signature = states.join("|");
    if ((a.pocketGrantSignature ?? "") === signature)
      return;
    a.pocketGrantSignature = signature || void 0;
    if (mods.length)
      a.sheet.setSource("pocket-grants", mods);
    else
      a.sheet.removeSource("pocket-grants");
  }
  updateGrantedTrails(a) {
    let memory = w.grantedTrailMemory.get(a.id);
    if (!memory && !a.sheet.armedFamily("trailGrant_", TRAIL_GRANT_IDS).length)
      return;
    for (const def of Object.values(TRAIL_GRANTS)) {
      const power = a.sheet.get(trailGrantStat(def.id));
      const skill = SKILLS[def.skillId];
      if (power <= 0 || !skill || a.untargetable) {
        memory?.delete(def.id);
        continue;
      }
      if (!memory)
        w.grantedTrailMemory.set(a.id, memory = /* @__PURE__ */ new Map());
      let trail = memory.get(def.id);
      if (!trail || trail.tier !== a.tier) {
        trail = { x: a.pos.x, y: a.pos.y, tier: a.tier, odo: 0, inst: makeSkillInstance(skill, Math.max(1, a.level)) };
        memory.set(def.id, trail);
        continue;
      }
      trail.inst.level = Math.max(1, a.level);
      trail.odo += Math.hypot(a.pos.x - trail.x, a.pos.y - trail.y);
      trail.x = a.pos.x;
      trail.y = a.pos.y;
      if (trail.odo < def.everyDist)
        continue;
      trail.odo = 0;
      if (w.zones.filter((z) => z.caster === a && z.inst.def.id === def.skillId).length >= def.maxPatches)
        continue;
      w.mintTrailPatch(a, trail.inst, {
        ...def.patch,
        radius: def.patch.radius * a.sheet.get("aoeRadius", skillContextTags(skill)),
        damageScale: (def.patch.damageScale ?? 1) * power
      }, a.pos, a.facing);
    }
    if (memory && !memory.size)
      w.grantedTrailMemory.delete(a.id);
  }
  updateDownedCompanions(dt) {
    for (const a of w.actors) {
      if (!a.companion || a.dead || !a.downed || a.companionDormant)
        continue;
      const tended = w.seats.some((s) => !s.actor.dead && !s.actor.downed && dist(s.actor.pos, a.pos) <= transitRadius("revive:companion", REVIVE_RADIUS) && w.dwellReachable(s.actor.pos, a.pos, transitReach("revive:companion"), w.storyPair(s.actor, a)) && w.seatIdle(s));
      a.companionReviveDwell = tended ? a.companionReviveDwell + dt : 0;
      if (a.companionReviveDwell >= transitDwell("revive:companion", REVIVE_DWELL))
        w.reviveCompanion(a);
    }
  }
  seatIdle(seat) {
    return w.time - seat.lastActedAt >= DWELL_IDLE_GRACE && seat.actor.isQuiescent();
  }
  updateCompanionGrants(dt) {
    for (const seat of w.seats) {
      const owner = w.seatHero(seat);
      w.companionGrants.update(owner, w.actors, dt, (inst, delivery) => w.spawnMinion(owner, inst, { delivery }), (body) => w.kill(body, true));
    }
  }
  updateWorms(dt) {
    for (const a of w.actors) {
      if (!a.worm || a.dead)
        continue;
      const w2 = a.worm;
      while (w2.segments.length < w2.length) {
        const last = w2.segments[w2.segments.length - 1] ?? a.pos;
        w2.segments.push(vec(last.x, last.y));
      }
      let prev = a.pos;
      for (const seg of w2.segments) {
        const d = dist(seg, prev);
        if (d > w2.spacing) {
          const pull = (d - w2.spacing) / d;
          seg.x += (prev.x - seg.x) * pull;
          seg.y += (prev.y - seg.y) * pull;
        }
        prev = seg;
      }
      tickSegFlash(w2, dt);
      if (a.segTears?.length) {
        const spec = w2.wounds;
        for (const seg of a.segTears) {
          const at = w2.segments[seg];
          if (!at || !spec)
            continue;
          const r = segR(a, seg);
          const anatomyState = anatomyCueState(a).segments.find((s) => s.index === seg);
          if (anatomyState)
            w2.flashes.push(anatomyFlash(at, r, a.facing, anatomyState));
          if (spec.burst) {
            const b = spec.burst;
            const amounts = { [b.type ?? "physical"]: a.maxLife() * b.damageFrac };
            for (const e of w2.enemiesOf(a)) {
              if (!sameStory(a, e))
                continue;
              if (reachTo(e, at) > b.radius)
                continue;
              const taken = mitigateTyped(e, { ...amounts });
              if (taken > 0) {
                e.life -= taken;
                e.hitFlash = 0.1;
                e.hitFlashType = b.type ?? "physical";
                w2.text(vec(e.pos.x, e.pos.y - 12), Math.round(taken).toString(), b.color ?? "#ffd24a", 11);
                if (e.life <= 0 && !e.dead)
                  w2.kill(e, false, a);
              }
            }
            w2.flashes.push({
              pos: vec(at.x, at.y),
              radius: b.radius,
              color: b.color ?? "#ffd24a",
              life: 0.3,
              maxLife: 0.3
            });
          }
        }
        if (spec?.mods?.length) {
          const n = woundCount(a);
          const stacked = [];
          for (let i = 0; i < n; i++)
            stacked.push(...spec.mods);
          a.sheet.setSource("segWounds", stacked);
        }
        a.segTears = void 0;
      }
    }
  }
  updateParts() {
    for (const a of w.actors) {
      if (a.dead)
        continue;
      const def = a.defId ? MONSTERS[a.defId] : void 0;
      if (def?.parts && !a.partsSpawned) {
        a.partsSpawned = true;
        a.partActors ??= [];
        for (const pd of def.parts)
          w.graftPart(a, pd);
      }
      if (!a.partActors?.length)
        continue;
      const c = Math.cos(a.facing), s = Math.sin(a.facing);
      for (const part of a.partActors) {
        if (part.dead || !part.partLink)
          continue;
        const pd = part.partLink.def;
        part.pos.x = a.pos.x + (pd.dx * c - pd.dy * s) * a.radius;
        part.pos.y = a.pos.y + (pd.dx * s + pd.dy * c) * a.radius;
        if (part.skills.length === 0 || !part.aggroed) {
          part.facing = a.facing + (pd.rot ?? 0);
        }
      }
    }
  }
  graftPart(host, pd, opts) {
    if (host.dead || host.partLink || !MONSTERS[pd.monster])
      return null;
    const part = w.createMonster(pd.monster, host.level, host.team);
    part.faction = host.faction;
    part.anchored = true;
    part.xpValue = 0;
    part.fromZoneGen = false;
    part.partLink = { root: host, def: pd };
    clearPartScar(host, pd);
    part.graftKey = opts?.key;
    if (pd.lifeFrac) {
      const target = Math.max(1, Math.round(host.maxLife() * pd.lifeFrac));
      part.sheet.setBase("life", target);
      const got = part.maxLife();
      if (got > 1 && Math.abs(got - target) > 1) {
        part.sheet.setBase("life", Math.max(1, target * (target / got)));
      }
      part.fillResources();
    }
    const c = Math.cos(host.facing), s = Math.sin(host.facing);
    part.pos.x = host.pos.x + (pd.dx * c - pd.dy * s) * host.radius;
    part.pos.y = host.pos.y + (pd.dx * s + pd.dy * c) * host.radius;
    (host.partActors ??= []).push(part);
    w.actors.push(part);
    if (opts?.flash) {
      w.flashes.push({
        pos: vec(part.pos.x, part.pos.y),
        radius: part.radius * 1.6,
        color: part.color,
        life: 0.35,
        maxLife: 0.35
      });
    }
    return part;
  }
  separateActors() {
    const flat = (a) => !!a.summonReform || !!a.summonShell || !!a.construct && (a.construct.kind === "pad" || a.construct.kind === "gate" || a.construct.kind === "trap" || a.construct.kind === "mine" || a.construct.kind === "echo" && a.construct.echo?.mode !== "mimic");
    const alive = w.actors.filter((a) => !a.dead && !a.downed && !flat(a) && !a.leap);
    const cand = w.separateScratch;
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      w.actorsNear(a.pos.x, a.pos.y, a.radius, cand);
      for (const b of cand) {
        if (b.gridSeq <= a.gridSeq)
          continue;
        if (b.dead || b.downed || flat(b) || b.leap)
          continue;
        if (!sameStory(a, b))
          continue;
        const d = dist(a.pos, b.pos);
        const minD = a.radius + b.radius;
        if (d < minD && d > 0.01) {
          if (a.heldBy === b.id || b.heldBy === a.id)
            continue;
          if (a.partLink?.root === b || b.partLink?.root === a)
            continue;
          if (a.partLink && a.partLink.root === b.partLink?.root)
            continue;
          if (a.clingTo?.id === b.id || b.clingTo?.id === a.id)
            continue;
          if (a.clingTo && a.clingTo.id === b.clingTo?.id)
            continue;
          if (a.mountId === b.id || b.mountId === a.id)
            continue;
          if (a.mountId !== void 0 && a.mountId === b.mountId)
            continue;
          if (a.sheet.get("phasing") > 0 || b.sheet.get("phasing") > 0)
            continue;
          if (a.flying !== b.flying)
            continue;
          if (b.squish && canSquish(a, b, b.squish) || a.squish && canSquish(b, a, a.squish))
            continue;
          const ang = angleTo(a.pos, b.pos);
          const aFixed = !!a.construct || a.anchored;
          const bFixed = !!b.construct || b.anchored;
          if (aFixed && bFixed)
            continue;
          const overlap = minD - d;
          const wa = a.effectiveWeight();
          const wb = b.effectiveWeight();
          const aShare = aFixed ? 0 : bFixed ? 1 : wb / (wa + wb);
          if (!aFixed && aShare > 0) {
            const fx = a.pos.x, fy = a.pos.y;
            a.pos.x -= Math.cos(ang) * overlap * aShare;
            a.pos.y -= Math.sin(ang) * overlap * aShare;
            a.pos = w.clampPos(a.pos, a.radius, vec(fx, fy), { mover: a });
          }
          if (!bFixed && aShare < 1) {
            const fx = b.pos.x, fy = b.pos.y;
            b.pos.x += Math.cos(ang) * overlap * (1 - aShare);
            b.pos.y += Math.sin(ang) * overlap * (1 - aShare);
            b.pos = w.clampPos(b.pos, b.radius, vec(fx, fy), { mover: b });
          }
        }
      }
    }
  }
  updateSquish() {
    for (const v of w.actors) {
      const spec = v.squish;
      if (!spec || v.dead)
        continue;
      if (isDormant(v))
        continue;
      const span = v.worm ? v.worm.length * v.worm.spacing + v.radius : v.radius;
      for (const t of w.actorsNear(v.pos.x, v.pos.y, span + 64, w.squishScratch)) {
        if (!sameStory(t, v))
          continue;
        if (!canSquish(t, v, spec))
          continue;
        const tread = t.radius * SQUISH_CFG.treadFrac;
        let hit = dist(t.pos, v.pos) <= tread + v.radius;
        if (!hit && v.worm) {
          const segs = v.worm.segments;
          for (let i = 0; i < segs.length && !hit; i++) {
            hit = dist(t.pos, segs[i]) <= tread + segR(v, i);
          }
        }
        if (!hit)
          continue;
        w.kill(v, false, t);
        if (!spec.quiet) {
          const tint = spec.color ?? (v.defId ? MONSTERS[v.defId]?.color : void 0) ?? "#8a6a4a";
          w.flashes.push({
            pos: vec(v.pos.x, v.pos.y),
            radius: SQUISH_CFG.fx.radius,
            color: tint,
            life: SQUISH_CFG.fx.life,
            maxLife: SQUISH_CFG.fx.life
          });
          if (spec.text) {
            w.text(vec(v.pos.x, v.pos.y - 16), spec.text, tint, SQUISH_CFG.textSize);
          }
        }
        break;
      }
    }
  }
  resyncMinionSupports(inst) {
    for (const a of w.actors) {
      if (a.dead || a.construct || a.summonInst !== inst)
        continue;
      for (const sk of a.skills) {
        if (!sk)
          continue;
        for (let i = sk.sockets.length - 1; i >= 0; i--) {
          if (sk.sockets[i]?.forwarded)
            sk.sockets.splice(i, 1);
        }
      }
      w.forwardSummonSockets(inst, a.skills);
      const d = instanceDelivery(inst);
      if (d.type === "summon")
        for (const id of d.crewAuras ?? []) {
          const sk = a.skills.find((s) => s?.def.id === id);
          if (!sk || sk.def.delivery.type !== "aura")
            continue;
          w.deactivateAura(a, id);
          w.activateAura(a, sk, sk.def.delivery, a.sheet.get("aoeRadius", skillContextTags(sk), instanceMods(sk)));
        }
    }
  }
  clearSummonTreeBodies(caster, inst) {
    if (inst.def.delivery.type !== "summon" || !inst.def.tree)
      return;
    w.replenishment.forget(caster, inst);
    w.clearSummonReleaseFields(caster, inst);
    for (const body of [...w.actors])
      if (!body.dead && body.owner === caster && body.summonInst === inst) {
        w.releaseContract(body, false);
        w.kill(body, true);
      }
    w.pendingSummons = w.pendingSummons.filter((p) => p.caster !== caster || p.inst !== inst);
    w.pendingRespawns = w.pendingRespawns.filter((p) => p.caster !== caster || p.inst !== inst);
  }
  useMetaSkill(caster, host, aim) {
    const metas = instanceMetas(host).filter((m) => SKILLS[m.skillId]);
    if (!metas.length)
      return false;
    const native = metas[0].skillId === "enrage_swarm" ? w.hivecallMeta(caster, host) : void 0;
    const ok = native ?? w.useSkill(caster, w.mintMetaInstance(caster, host, metas[0].skillId), aim);
    for (let i = 1; i < metas.length; i++) {
      w.pendingMetas.push({
        caster,
        host,
        skillId: metas[i].skillId,
        aim: vec(aim.x, aim.y),
        timer: META_CHAIN_INTERVAL * i
      });
    }
    return ok;
  }
}

  function statusReqs(req) {
  return req === void 0 ? null : Array.isArray(req) ? req : [req];
}
const STEALTH_CHARGE = "stealth";
function isStealthed(a) {
  return isConcealed(a) || a.sheet.get("invisible") > 0;
}

  w.statusReqs = statusReqs;
  w.isStealthed = isStealthed;
  return new Policies();
}
export const combatPolicyMethods = Object.freeze(["applyThorns","releasePrimedPours","bankPools","triggerEligible","rollTriggers","bankStatusTriggers","bankDamageTakenTriggers","sweepDefenseEvents","recordCast","paySkillCost","consumeChargeCost","consumeStealth","bankRune","consumeAmmunition","consumeRemnants","rollKillRemnants","victimGate","isEliteVictim","minionsOfSkill","minionsOfGroup","minionServes","companionsOfSkill","tickChannelSupports","actorTurnRate","castTurnRate","assaultBladeHit","healAlliesInArea","enemiesOf","skillOcclusion","spawnAftershocks","castChrono","isPrey","failNote","forwardSummonSockets","bakeMinionOwnerStats","conjurationLifeline","armAmbush","applyPartyScale","relayStatus","presenceMoment","releaseStruckSummons","updateSummonReforms","clearSummonReleaseFields","clearTreeFields","clearTreeConstructs","accumulateDotText","emergeBody","updateEmergences","showRecoveryCue","showCompanionCue","attackSequenceBurst","challengeBurst","challengeHit","companionCapOf","companionPulseHit","guardArtCooldown","guardArtHit","guardBash","inheritedFlight","retireOwnedZone","plantSpiritTotem","shedOrb","pushActor","springAmbush","reflectParriedProjectile","resolveParryDamage","tryGuardBlock","guardianFor","tryShellBlock","tryShellPool","noteLightningTravel","carriedEffectContext","movementMoment","affordedDest","hivecallRoster","hivecallCap","hivecallPayload","hivecallDeath","hivecallTransform","hivecallReturn","hivecallMeta","syncHivecallFormDamage","throngBodiesOf","throngRosterCount","throngCapOf","throngRecruitCap","throngGain","throngKeepMinimum","throngEvolutionHit","throngEvolutionBurst","mintThrongBody","onPartBroken","ringBell","rollKillOrbs","clingRelease","setLure","throngOnHit","throngOnKill","throngSources","throngYieldCount","mintThrongFind","mintThrongHusk","liteKindOf","litePromoteNearest","promoteLite","liteNoteDeath","litePocketDisturb","liteProjectileSweep","liteCarve","litePooledHit","liteBiteVictim","liteSteerAndBite","liteDemoteSweep","minionNeedsFullDurability","reqShortfall","companionBondsOfSkill","updateThrongEvolution","updateThrong","updateClings","claimThrongHusk","wornThrongAnchorsOf","wornThrongAnchored","driveUntamedThrong","throngMoteSpot","noteMovementTravel","resolveImpactHit","sweepBodySlam","updateHivecall","updateMinionMeta","updateReplenishment","updateLeaps","updateStrobes","updateVents","updateDischarges","checkMinionDetonations","updateSummonShells","echoSympathy","sympathyPotency","applySympathyEcho","updateOrbs","pourOrb","updateRemnants","pickupSeat","refundOnOrb","updatePendingContagions","grantedPocketsFor","insideGrantedPocket","inGrantedRefuge","syncPocketGrants","updateGrantedTrails","updateDownedCompanions","seatIdle","updateCompanionGrants","updateWorms","updateParts","graftPart","separateActors","updateSquish","resyncMinionSupports","clearSummonTreeBodies","useMetaSkill"]);
