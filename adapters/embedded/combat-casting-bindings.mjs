import {SkillIntent} from '@hollow-wake/engine/casting/intent';
// Generated from reviewed casting adapters; all callbacks target the SDK owner.
import {ChargedCasting} from '@hollow-wake/engine/casting/charged';
import {ChannelCasting} from '@hollow-wake/engine/casting/channel';
import {GuardCasting} from '@hollow-wake/engine/casting/guard';
import {SkillInstances} from '@hollow-wake/engine/casting/instances';
export function combatCastingBindings(w, q) {
  const world = w;
  const convertRuleHolds = (...args) => w.convertRuleHolds(...args);
  const {BASH_CFG, CONCENTRATION_CFG, GRAB_CFG, LOS_CFG, REFLEX_CFG, SKILLS, STATUS_DEFS, TRIGGER_CFG, angleDiff, angleTo, castingEventFlash, dist, effectiveSkillLevel, gaugeSpend, grantedTags, guardBashSpec, guardCapacity, instanceCastMode, instanceChannel, instanceChargeCost, instanceConvert, instanceCurseField, instanceEffects, instanceMods, instanceOvercharge, instanceStrikeTiming, instanceTargeting, instanceTreeMods, instanceTrigger, instanceTriggerArmed, instanceUseCharges, makeSkillInstance, mimicPowerMods, mimicSelected, mod, replenishingDelivery, skillContextTags, socketSpec, throngTravelProtected, timingCueFlash, updateCastAim} = q;
  const vec = (x, y) => ({x, y});
  const rand = (a, b) => a + w.random() * (b - a);
  const randInt = (a, b) => Math.floor(a + w.random() * (b + 1 - a));
  const chance = p => w.random() < p;
  const pick = values => values[Math.floor(w.random() * values.length)];
  const request = {
  castSealed: (actor, inst) => w.castSealed(actor, inst),
  hivecallMeta: (actor, inst) => w.hivecallMeta(actor, inst),
  throngTravelProtected,
  replenishingDelivery,
  forgetReplenishment: (actor, inst) => w.replenishment.forget(actor, inst),
  seatOf: (actor) => w.seatOf(actor),
  triggerSeat: (actor) => w.seats.find((seat) => seat.actor === actor),
  markMetaDirty: (seat) => w.markMetaDirty(seat),
  markCharacterDirty: () => {
    w.charDirty = true;
  },
  replenishmentFeedback: (actor, inst) => w.text(vec(actor.pos.x, actor.pos.y - 20), inst.replenishmentPaused ? "replenishment paused" : "replenishment enabled", inst.def.color, 13),
  markSeatActed: (actor) => w.markSeatActed(actor),
  isReflex: (actor, inst) => actor.isReflex(inst),
  actorById: (id) => w.actorById(id),
  mashPress: () => GRAB_CFG.break.mashPress,
  failNote: (actor, key, text) => w.failNote(actor, key, text),
  maxLife: (actor) => actor.maxLife(),
  trigger: instanceTrigger,
  triggerArmed: instanceTriggerArmed,
  requirementRefusal: (actor, inst) => w.castReqRefusal(actor, inst),
  conversion: instanceConvert,
  definition: (id) => SKILLS[id],
  conversionHolds: (when, actor, inst) => convertRuleHolds(when, actor, inst, w),
  mint: (actor, host, id) => w.mintMetaInstance(actor, host, id),
  dispatch: (actor, inst, aim, seatPress) => w.useSkill(actor, inst, aim, seatPress),
  time: () => w.time,
  mimicSelected,
  mimicPowerMods: (inst) => mimicPowerMods(inst.def.mimic),
  unmetGate: (actor, inst) => actor.unmetGate(inst),
  effects: instanceEffects,
  relocationTarget: (actor, inst, radius) => w.relocationTarget(actor, inst, radius),
  canUse: (actor, inst) => actor.canUse(inst)
};

const dispatch = {
  preflight: (actor, inst, aim, seatPress) => w.sdkSkillRequest.preflight(actor, inst, aim, seatPress),
  time: () => w.time,
  failNote: (actor, key, text) => w.failNote(actor, key, text),
  canAct: (actor) => actor.canAct(),
  canUse: (actor, inst) => actor.canUse(inst),
  comboCursor: (actor, inst) => w.comboCursorOf(actor, inst),
  definition: (id) => SKILLS[id],
  comboStep: (actor, inst, index) => w.comboStepOf(actor, inst, index),
  dispatch: (actor, inst, aim, seatPress) => w.useSkill(actor, inst, aim, seatPress),
  copyAim: (aim) => vec(aim.x, aim.y),
  facingTo: (actor, aim) => angleTo(actor.pos, aim),
  status: (id) => STATUS_DEFS[id],
  random: () => w.random(),
  applyStatus: (actor, id, source, duration, label) => {
    actor.applyStatus(id, source, duration, label);
  },
  scrambleLatch: () => w.scrambleLatch,
  setScrambleLatch: (value) => {
    w.scrambleLatch = value;
  },
  trigger: instanceTrigger,
  feedback: (actor, kind, color) => {
    switch (kind) {
      case "scramble":
        w.text(vec(actor.pos.x, actor.pos.y - 16), "addled!", color, 12, "combat");
        break;
      case "strobe-off":
        w.text(actor.pos, "the earth rests", color, 11);
        break;
      case "hex-off":
        w.text(actor.pos, "hex sheathed", color, 11, "combat");
        break;
      case "hex-on":
        w.text(actor.pos, "hex drawn", color, 11, "combat");
        break;
    }
  },
  deactivateAura: (actor, id) => w.deactivateAura(actor, id),
  dismissSummon: (actor, id) => w.dismissSummonToggle(actor, id),
  maxMana: (actor) => actor.maxMana(),
  cost: (actor, inst) => actor.skillCost(inst),
  pay: (actor, inst, cost) => w.paySkillCost(actor, inst, cost),
  curseOnHit: (inst) => socketSpec(inst, "curseOnHit"),
  curseField: instanceCurseField,
  zones: () => w.zones,
  expireZone: (zone) => w.expireZone(zone),
  castMode: instanceCastMode,
  tags: (def) => skillContextTags(def),
  modifiers: instanceMods,
  stat: (actor, key, tags, mods, base) => actor.sheet.get(key, tags, mods, base),
  useTime: (actor, inst) => actor.skillUseTime(inst),
  targeting: instanceTargeting,
  resolveTarget: (actor, inst, aim) => w.resolveTargeting(actor, inst, aim),
  lightweightCount: () => w.lite.liveCount,
  promoteTarget: (actor, aim, within, max) => w.litePromoteNearest(aim, { within, max, opposing: actor.team, story: actor.tier }),
  useCharges: instanceUseCharges,
  ammunition: () => w.sdkAmmunitionPress,
  channel: instanceChannel,
  gather: (inst) => socketSpec(inst, "gather"),
  speed: (actor, inst) => actor.speedFactor(inst),
  consumeCharges: (actor, inst) => w.consumeChargeCost(actor, inst),
  spendGauge: (actor, inst) => gaugeSpend(inst, inst.def.gauge, actor.gaugeEff(inst)),
  stampCooldown: (actor, inst, duration) => w.stampSkillCooldown(actor, inst, duration),
  opening: (actor, inst, aim, multiplier) => w.attackSequences.opening(actor, inst, aim, multiplier),
  quarry: (target) => target.actor,
  guardCapacity,
  refreshGuard: (actor, state) => w.refreshGuardBash(actor, state),
  guardRaised: (actor, inst) => w.guardArts.raised(actor, inst),
  shellGraft: (inst) => socketSpec(inst, "shellGraft"),
  overcharge: instanceOvercharge,
  strikeTiming: instanceStrikeTiming,
  assaultLock: (actor, inst, aim) => w.assaults.lock(actor, inst, aim),
  primedPourOpen: (actor, inst) => actor.primedPourOpen(inst),
  execute: (actor, inst, aim, payload) => w.executeSkill(actor, inst, aim, payload),
  isReflex: (actor, inst) => actor.isReflex(inst),
  reflexRecovery: () => REFLEX_CFG.lock
};

const continuation = {
  stunned: (actor) => actor.isStunned(),
  lowerGuard: (actor, inst) => w.guardArts.lower(actor, inst),
  feedback: (actor, state, kind) => {
    const cue = castingEventFlash(actor, state, kind);
    if (cue)
      w.flashes.push(cue);
  },
  updateAim: updateCastAim,
  seated: (actor) => !!w.seatOf(actor),
  primary: (actor) => actor === w.player,
  actor: (id) => w.actorById(id),
  assignAim: (aim, position) => {
    aim.x = position.x;
    aim.y = position.y;
  },
  copyAim: (aim) => vec(aim.x, aim.y),
  channel: instanceChannel,
  random: () => w.random(),
  hold: (state) => w.aiHoldOf(state),
  needsFireLine: (actor, inst) => w.aiNeedsFireLine(actor, inst),
  lineOfFire: (actor, prey) => w.lineOfFire(actor.pos, prey.pos, actor.tier),
  click: (actor) => w.castPress(actor),
  distance: dist,
  tags: (inst) => skillContextTags(inst.def),
  mods: instanceMods,
  stat: (actor, id, tags, mods) => actor.sheet.get(id, tags, mods),
  target: (pos, actor) => actor ? { pos, actor } : { pos },
  deliver: (actor, inst, aim, options) => w.executeSkill(actor, inst, aim, options),
  advanceGuard: (actor, state, dt) => w.sdkGuardCasting().advance(actor, state, dt),
  advanceChannel: (actor, state, dt, target) => w.sdkChannelCasting().advance(actor, state, dt, target),
  advanceCharged: (actor, dt) => w.sdkChargedCasting().advance(actor, dt),
  plantTotem: (actor, inst, aim) => {
    w.plantSpiritTotem(actor, inst, aim);
  },
  spawnChannelVessel: (actor, inst, spec, aim) => w.spawnConstruct(actor, inst, spec, aim, inst),
  acted: (actor) => w.markSeatActed(actor),
  timingBonus: (inst) => instanceStrikeTiming(inst)?.bonus,
  timingCue: (actor, cue, aim) => {
    w.flashes.push(timingCueFlash(actor, cue, aim));
  },
  flawless: (actor, aim, inst) => w.rollTriggers(actor, "flawless", { aim, sourceInst: inst })
};

const chargedEffects = {
  pay: (actor, state, cost) => w.paySkillCost(actor, state.inst, cost),
  stageBanked: (actor, state) => {
    w.flashes.push({
      pos: vec(actor.pos.x, actor.pos.y),
      radius: 18 + 7 * state.stage,
      color: "#ffd700",
      life: 0.18,
      maxLife: 0.18
    });
    w.rollTriggers(actor, "overchargeStage", { aim: vec(state.aim.x, state.aim.y), sourceInst: state.inst });
  },
  execute: (actor, state, release) => w.executeSkill(actor, state.inst, state.aim, {
    ...release,
    targetInfo: state.targetInfo,
    paidCost: state.paidCost,
    chargesSpent: state.chargesSpent
  }),
  cue: (actor, state, kind) => {
    w.flashes.push(timingCueFlash(actor, kind, state.aim));
  }
};

function createChargedCasting(effects) {
  return new ChargedCasting({
    active: (actor) => {
      const state = actor.casting;
      return state?.mode === "charge" || state?.mode === "overcharge" ? state : null;
    },
    dead: (actor) => actor.dead,
    chargeSpec: (state) => state.inst.def.chargeUp,
    overchargeSpec: (state) => instanceOvercharge(state.inst),
    stageLimit: (actor, state, spec) => actor.sheet.get("overchargeStages", skillContextTags(state.inst.def), instanceMods(state.inst), spec.stages),
    timing: (state) => instanceStrikeTiming(state.inst),
    sparkBonus: (actor, state, spec) => actor.sheet.get("sparkBonus", skillContextTags(state.inst.def), instanceMods(state.inst), spec.windowBonus ?? 0.35),
    cost: (actor, state) => actor.skillCost(state.inst),
    canAfford: (actor, cost) => actor.canAfford(cost),
    pay: (actor, state, cost) => effects.pay(actor, state, cost),
    random: () => w.random(),
    stageBanked: (actor, state) => effects.stageBanked(actor, state),
    end: (actor, _state, recovery) => {
      actor.casting = null;
      actor.useLock = recovery;
    },
    execute: (actor, state, release) => effects.execute(actor, state, release),
    cue: (actor, state, kind) => effects.cue(actor, state, kind)
  });
}

const channelEffects = {
  trigger: (a, cs, event) => w.rollTriggers(a, event, { aim: vec(cs.aim.x, cs.aim.y), sourceInst: cs.inst }),
  tapFinish: (a) => w.tapCharges(a, "channelFinish"),
  rune: (a, cs) => w.bankRune(a, cs.inst.def),
  aim: (a, cs, ch, dt) => {
    const def = cs.inst.def;
    const track = ch.trackAim !== false && a.sheet.get("channelLockAim", skillContextTags(def), instanceMods(cs.inst)) <= 0;
    const autoSpin = a.sheet.get("channelAutoSpin", skillContextTags(def), instanceMods(cs.inst));
    if (autoSpin > 0) {
      a.facing += autoSpin * dt;
      const reach = Math.max(60, dist(a.pos, cs.aim));
      cs.aim = vec(a.pos.x + Math.cos(a.facing) * reach, a.pos.y + Math.sin(a.facing) * reach);
    }
    if (autoSpin <= 0 && track) {
      const want = angleTo(a.pos, cs.aim);
      const rate = w.castTurnRate(a, ch.turnRate ? ch.turnRate * a.sheet.get("channelTurnRate", skillContextTags(def), instanceMods(cs.inst)) : Infinity);
      if (Number.isFinite(rate)) {
        const diff = angleDiff(a.facing, want);
        const turn = Math.min(Math.abs(diff), rate * dt);
        a.facing += Math.sign(diff) * turn;
      } else {
        a.facing = want;
      }
    }
    return track;
  },
  releaseEffects: (a, cs, ch) => {
    const def = cs.inst.def;
    if (ch.releaseDetonate && !a.dead) {
      for (let pi = w.projectiles.length - 1; pi >= 0; pi--) {
        const pr = w.projectiles[pi];
        if (pr.caster !== a || pr.inst.def.id !== def.id)
          continue;
        pr.mult *= ch.releaseDetonate.damageScale;
        w.explodeProjectile(pr);
        w.projectiles.splice(pi, 1);
      }
    }
    if (def.amalgam && !a.dead && (cs.amalgamFed ?? 0) > 0) {
      const lord = a.owner ?? a;
      const n = Math.min(def.amalgam.cap, cs.amalgamFed ?? 0);
      const big = w.createMonster(def.amalgam.monsterId, lord.level, lord.team, lord);
      big.sourceSkillId = def.id;
      big.radius *= 1 + def.amalgam.perMinion.size * n;
      big.sheet.setSource("amalgam", [
        mod("damage", "more", def.amalgam.perMinion.damage * n),
        mod("life", "more", def.amalgam.perMinion.life * n)
      ]);
      big.fillResources();
      big.lifespan = (def.amalgam.duration ?? 20) * lord.sheet.get("effectDuration", skillContextTags(def), instanceMods(cs.inst));
      big.pos = w.clampPos(vec(a.pos.x + 34, a.pos.y), big.radius);
      w.actors.push(big);
      w.showRecoveryCue(big, "arrive", cs.inst);
    }
  },
  release: (a, cs, track, payload, initialTarget) => w.executeSkill(a, cs.inst, track ? cs.aim : cs.lockedAim ?? cs.aim, {
    dmgMult: payload.dmgMult,
    aoeMult: payload.aoeMult,
    keepFacing: true,
    targetInfo: initialTarget,
    noCooldown: payload.noCooldown
  }),
  persist: (a, cs, plan) => w.pendingPersists.push({ caster: a, inst: cs.inst, ...plan }),
  supports: (a, cs, dt) => w.tickChannelSupports(a, cs, dt),
  target: (a, cs) => instanceTargeting(cs.inst) ? w.resolveTargeting(a, cs.inst, cs.aim) ?? null : void 0,
  pay: (a, cs, cost) => w.paySkillCost(a, cs.inst, cost),
  pulse: (a, cs, track, target, payload) => w.executeSkill(a, cs.inst, track ? cs.aim : cs.lockedAim ?? cs.aim, {
    dmgMult: payload.dmgMult,
    aoeMult: payload.aoeMult,
    arcMult: payload.arcMult,
    noCooldown: true,
    keepFacing: true,
    bonusProjectiles: payload.bonusProjectiles,
    targetInfo: target,
    paidCost: payload.paidCost
  }),
  cue: (a, cs, kind) => {
    if (kind === "gather") {
      w.flashes.push({
        pos: vec(a.pos.x, a.pos.y),
        radius: 16 + 30 * Math.min(1, (cs.channelTime ?? 0) / 4),
        color: cs.inst.def.color,
        life: 0.15,
        maxLife: 0.15
      });
    } else {
      const cue = castingEventFlash(a, cs, kind);
      if (cue)
        w.flashes.push(cue);
    }
  }
};

function createChannelCasting(effects) {
  const context = { tags: /* @__PURE__ */ new Set(), extra: [] };
  return new ChannelCasting({
    ...effects,
    spec: (state) => state.gather ?? instanceChannel(state.inst),
    dead: (actor) => actor.dead,
    stat: (actor, state, key) => actor.sheet.get(key, skillContextTags(state.inst.def), instanceMods(state.inst)),
    speed: (actor, state) => actor.speedFactor(state.inst),
    brim: (actor, state, spec) => {
      const map = actor.brims ??= /* @__PURE__ */ new Map();
      let bank = map.get(state.inst.def.id);
      if (!bank) {
        bank = { fill: 0, inst: state.inst, spec };
        map.set(state.inst.def.id, bank);
      }
      bank.inst = state.inst;
      bank.spec = spec;
      return bank;
    },
    releaseBrim: (actor, state) => actor.brims?.get(state.inst.def.id),
    end: (actor, _state, recovery) => {
      actor.casting = null;
      actor.useLock = recovery;
    },
    cooldown: (state) => state.inst.def.cooldown,
    stampCooldown: (actor, state, duration) => {
      actor.cooldowns.set(state.inst.def.id, duration);
    },
    context: (state) => {
      context.tags = skillContextTags(state.inst.def);
      context.extra = instanceMods(state.inst);
      return context;
    },
    cost: (actor, state) => actor.skillCost(state.inst),
    canAfford: (actor, cost) => actor.canAfford(cost),
    random: () => w.random(),
    pulseStat: (actor, terms, key) => actor.sheet.get(key, terms.tags, terms.extra),
    construct: (actor) => !!actor.construct
  }, TRIGGER_CFG.channelInterval);
}

const guardEffects = {
  seated: (a) => !!w.seatOf(a),
  aim: (a, cs, spec, dt) => {
    const want = angleTo(a.pos, cs.aim);
    const diff = angleDiff(a.facing, want);
    const turn = Math.min(Math.abs(diff), w.castTurnRate(a, spec.turnRate ?? 2.5) * dt);
    if (cs.aiGuardFacing === void 0)
      a.facing += Math.sign(diff) * turn;
    else
      a.facing = cs.aiGuardFacing;
  },
  supports: (a, cs, dt) => w.tickChannelSupports(a, cs, dt),
  trigger: (a, cs) => w.rollTriggers(a, "guardBeat", { aim: vec(cs.aim.x, cs.aim.y), sourceInst: cs.inst }),
  pulse: (a, cs, skill) => w.executeSkill(a, w.mintMetaInstance(a, cs.inst, skill), vec(cs.aim.x, cs.aim.y), { noCooldown: true, noRepeat: true, keepFacing: true }),
  time: () => w.time,
  lower: (a, cs) => w.guardArts.lower(a, cs.inst),
  stampCooldown: (a, cs, duration) => w.stampSkillCooldown(a, cs.inst, duration),
  deliverBash: (a, cs, bash, payload) => w.guardBash(a, cs.inst, bash, payload)
};

function createGuardCasting(effects) {
  const context = { tags: /* @__PURE__ */ new Set(), extra: [] };
  return new GuardCasting({
    ...effects,
    spec: (state) => state.inst.def.guard,
    holdBonus: (actor, state) => actor.sheet.get("guardHoldTime", skillContextTags(state.inst), instanceMods(state.inst)),
    bash: (state) => guardBashSpec(state.inst),
    context: (state) => {
      context.tags = skillContextTags(state.inst.def, grantedTags(state.inst));
      context.extra = instanceMods(state.inst);
      return context;
    },
    bashStat: (actor, terms, key) => actor.sheet.get(key, terms.tags, terms.extra),
    dead: (actor) => actor.dead,
    facing: (actor) => actor.facing,
    plantUntil: (actor, deadline) => {
      actor.aiPlantUntil = Math.max(actor.aiPlantUntil, deadline);
    },
    end: (actor, _state, recovery) => {
      actor.casting = null;
      actor.useLock = recovery;
    },
    cleanup: (actor, state) => {
      if (actor.shellGuard?.fromAura === state.inst.def.id)
        actor.shellGuard = void 0;
    },
    cooldown: (state) => state.inst.def.cooldown
  }, { beatInterval: TRIGGER_CFG.guardInterval, releaseFloor: BASH_CFG.releaseFloor, armTime: BASH_CFG.armTime });
}

const instances = new SkillInstances({
  skill: (id) => SKILLS[id],
  create: makeSkillInstance,
  effectiveLevel: effectiveSkillLevel,
  treeMods: instanceTreeMods
});

const intentPorts = {
  time: () => world.time,
  seat: (actor) => world.seatOf(actor),
  knownSkill: (seat, id) => seat.meta.knownSkills.has(id),
  requirementShortfall: (id, seat) => world.reqShortfall(id, seat),
  trigger: (inst) => !!instanceTrigger(inst),
  gatesMet: (actor, inst) => actor.gatesMet(inst),
  chargeCost: instanceChargeCost,
  targeting: instanceTargeting,
  qualifiedTargetAvailable: (actor, inst) => world.resolveTargeting(actor, inst, actor.aimPos ?? actor.pos) !== null,
  canUse: (actor, inst) => actor.canUse(inst),
  mimicSelected,
  mimicPowerMods: (inst) => mimicPowerMods(inst.def.mimic),
  conversion: instanceConvert,
  conversionHolds: (when, actor, inst) => convertRuleHolds(when, actor, inst, world)
};

  continuation.finesse = actor => w.host.intent?.finesse?.(actor.id);
  channelEffects.beforeRelease = (actor, state) => {
    w.channelFormations?.release(actor, state);
    if (!actor.dead) w.frameArts?.release(actor, state.inst);
  };
  intentPorts.castSeal = () => w.host.castSeal?.current();
  intentPorts.sealShuts = (spec, actor, inst) => w.host.castSeal.shuts(spec, actor.id, inst.def.id);
  return {request, dispatch, continuation, instances, intent: new SkillIntent(instances, intentPorts),
    charged: createChargedCasting(chargedEffects), channel: createChannelCasting(channelEffects), guard: createGuardCasting(guardEffects)};
}
