// Generated combat conductor rules. w is the internal SDK owner.
import {bodySkillLevel as monsterSkillLevelOf} from '../../dist/body-levels.js';
import {inAoe} from '../../dist/combat-geometry.js';
export function createCombatPolicies(w, q) {
  const {SECONDARY_LOOKS, instanceConstructLook, isConcealed, anatomyCueState, anatomyFlash, feedingCueFlash, noteRestoreGain, summonCapacity, THRONG_EVOLUTION, angleDiff, angleTo, dist, vec, mod, STATUS_DEFS, parryCounter, HIVECALL, hivecallNode, hivecallState, reachTo, segR, tickSegFlash, woundCount, DEFENSE_CFG, MASS_CFG, impactFrac, impactScale, crewBoardingOpen, guardBashSpec, instanceChargeCost, instanceSideFeast, instanceDelivery, instanceMods, instanceSummon, instanceChannel, skillContextTags, supportFitsInst, supportRidesMinions, MONSTERS, DAMAGE_COLOR, canSquish, sameStory, movementDiagnosticsEnabled, recordMovement, CLING_CFG, clingEligible, clingMotionShaken, clingSeatPos, clingSeatsOf, gnawTags, buffWithSource, defenseCueFlash, combatCueFlash, guardArcRadians, plyFloorOf} = q;
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
    w.damageText(attacker, dealt, "#d88a50", 11);
    if (attacker.life <= 0 && !attacker.dead)
      w.kill(attacker, false, victim);
  }
  consumeChargeCost(caster, inst) {
    const cc = instanceChargeCost(inst);
    if (!cc)
      return { mult: 1, consumed: 0 };
    const pay = (cost) => {
      const have = caster.charges.get(cost.charge) ?? 0;
      const consumed = cost.amount === "all" ? have : Math.min(have, cost.amount);
      caster.spendCharge(cost.charge, consumed);
      return { mult: cost.damagePerCharge && consumed > 0 ? 1 + cost.damagePerCharge * consumed : 1, consumed };
    };
    const paid = pay(cc);
    const feast = instanceSideFeast(inst);
    return feast ? { mult: paid.mult * pay(feast).mult, consumed: paid.consumed } : paid;
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
          tier: a.tier,
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
  healAlliesInArea(caster, inst, accepts, mult = 1, quiet = false, once, tier = caster.tier) {
    const fxs = inst.def.effects.filter((fx) => fx.type === "heal" || fx.type === "cleanse");
    if (!fxs.length)
      return;
    for (const a of w.actors) {
      if (a.dead || a.downed || a.untargetable || a.construct || a.team !== caster.team || a.tier !== tier)
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
  enemiesOf(actor, sourceTier = actor.tier ?? 0) {
    return w.actors.filter((a) => (w.hostileTo(actor, a, sourceTier) || a.construct?.breakable !== void 0 && a.owner === actor && ((a.tier ?? 0) === sourceTier || w.zone.tiers?.rimDuels)) && !a.dead && !a.untargetable && !a.downed);
  }
  spawnAftershocks(caster, inst, at, radius, shape, depth = 0, tier = caster.tier) {
    if (depth > 0)
      return;
    const tags = skillContextTags(inst);
    const extra = instanceMods(inst);
    const scatter = Math.round(caster.sheet.get("aoeScatter", tags, extra));
    for (let i = 0; i < scatter; i++) {
      const ang = rand(0, Math.PI * 2);
      const r = rand(radius * 0.4, radius * 1.1);
      w.zones.push({
        tier,
        pos: w.clampPos(vec(at.x + Math.cos(ang) * r, at.y + Math.sin(ang) * r), 10, void 0, { tier }),
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
  forwardSummonSockets(summonInst, skills, opts) {
    if (!summonInst)
      return;
    const summonHost = summonInst.def.delivery.type === "summon" || !!instanceSummon(summonInst);
    if (summonHost && !crewBoardingOpen(summonInst, opts?.faction))
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
  clearSummonReleaseFields(owner, inst) {
    w.frameArts.clear(owner, inst);
    const d = instanceDelivery(inst);
    if (d.type !== "summon" || !d.strikeRelease && !d.arts && !d.cohort && !d.frame)
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
    w.frameArts.clear(caster, inst);
    w.summonArts.clear(caster, inst);
    w.cohortArts.clear(caster, inst);
    w.channelFormations.clear(caster, inst);
    w.attackSequences.clear(caster, inst);
    w.projectileArts.clear(caster, inst);
    w.challenges.clear(caster, inst);
    const ownsTreePayload = (candidate) => candidate === inst || candidate.invocationHost === inst || candidate.followUpHost === inst || candidate.challengeHost === inst || candidate.guardArtsHost === inst || candidate.projectileHost === inst;
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
  accumulateDotText(a, dot, dt) {
    let acc = w.dotAccum.get(a.id);
    if (!acc) {
      acc = { amount: 0, timer: 0 };
      w.dotAccum.set(a.id, acc);
    }
    acc.amount += dot;
    acc.timer += dt;
    if (acc.timer >= 0.5 && acc.amount >= 1) {
      w.damageText(a, acc.amount, "#d88a50", 11, "dmg");
      acc.amount = 0;
      acc.timer = 0;
    }
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
    w.damageText(target, taken, "#bc4540", 14, "combat");
    w.flashes.push({ pos: { ...target.pos }, radius: target.radius + 18, color: "#c6453b", life: 0.25, maxLife: 0.25 });
    if (target.life <= 0 && !target.dead)
      w.kill(target, false, caster);
  }
  plantSpiritTotem(caster, inst, aim) {
    const def = inst.def;
    w.spawnConstruct(caster, inst, {
      type: "construct",
      kind: "totem",
      look: instanceConstructLook(inst, "spiritTotem", SECONDARY_LOOKS.spiritTotem),
      range: def.ai?.range ?? 420,
      duration: 8,
      maxActive: 1,
      life: 45,
      placeRange: 90
    }, aim, inst);
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
    p.projectileOrbit = void 0;
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
      w.damageText(target, result.total, "#ffd700", 14);
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
    guardian.noteRecent("block");
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
          w.damageText(attacker, counter, "#ffd700", 14);
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
    if (owner && !owner.dead && sameStory(owner, victim) && owner.isGuarding() && dist(owner.pos, victim.pos) <= 240) {
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
      if (attacker && (body.shellGuard?.pool ?? 0) < before) {
        w.applyThorns(body, attacker);
        w.frameArts.absorbed(body, attacker, before - (body.shellGuard?.pool ?? 0));
      }
      if (blocked)
        return true;
    }
    return false;
  }
  hivecallCap(hero, inst) {
    const d = instanceDelivery(inst);
    if (d.type !== "summon")
      return 0;
    const raw = summonCapacity(hero, inst, d);
    const contract = hero.summonToggles.get(inst.def.id);
    const unit = summonReservationUnit(hero, inst, d);
    return contract && unit > 0 ? Math.min(raw, Math.round(contract.reserved / unit)) : raw;
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
      w.damageText(v, taken, DAMAGE_COLOR[domType], 11);
    if (v.life <= 0 && !v.dead) {
      w.kill(v, false, credit);
      w.observers.pooledKill?.(v, credit);
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
                w.damageText(v2, taken, DAMAGE_COLOR[type], 11);
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
    w.damageText(a, taken, DAMAGE_COLOR.physical, 14);
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
          w.damageText(b, taken, DAMAGE_COLOR.physical, 13);
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
            a.addBuff(buffWithSource({ type: "buff", id: "hivecall_fury", duration: 3, mods: [mod("damage", "more", 0.3), mod("attackSpeed", "increased", 0.4), mod("castSpeed", "increased", 0.4)] }, host));
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
      if (m.summonPactReward)
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
  checkMinionDetonations() {
    for (const a of w.actors) {
      if (a.dead || !a.isMinion() || a.explodeOnLowLife <= 0)
        continue;
      if (a.life < a.maxLife() * a.lowLifeLine()) {
        w.explodeActor(a, a.explodeOnLowLife);
        w.kill(a, true, a.owner ?? void 0, "sacrifice");
      }
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
                w2.damageText(e, taken, b.color ?? "#ffd24a", 11, void 0, vec(e.pos.x, e.pos.y - 12));
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
          if (w.chargesThroughSeat(a, b) || w.chargesThroughSeat(b, a))
            continue;
          if (a.flying !== b.flying)
            continue;
          if (b.squish && canSquish(a, b, b.squish) || a.squish && canSquish(b, a, a.squish))
            continue;
          const ang = angleTo(a.pos, b.pos);
          const aFixed = !!a.construct || a.anchored || b.keeperYieldUntil > w.time && !!w.seatOf(a);
          const bFixed = !!b.construct || b.anchored || a.keeperYieldUntil > w.time && !!w.seatOf(b);
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
            if (movementDiagnosticsEnabled)
              recordMovement(w, a, "body-separation", vec(fx, fy), a.pos, { other: b.id });
          }
          if (!bFixed && aShare < 1) {
            const fx = b.pos.x, fy = b.pos.y;
            b.pos.x += Math.cos(ang) * overlap * (1 - aShare);
            b.pos.y += Math.sin(ang) * overlap * (1 - aShare);
            b.pos = w.clampPos(b.pos, b.radius, vec(fx, fy), { mover: b });
            if (movementDiagnosticsEnabled)
              recordMovement(w, b, "body-separation", vec(fx, fy), b.pos, { other: a.id });
          }
        }
      }
    }
  }
  resyncMinionSupports(inst) {
    w.frameArts.resync(inst);
    w.summonArts.resync(inst);
    w.cohortArts.resync(inst);
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
      w.forwardSummonSockets(inst, a.skills, { faction: a.faction });
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
  movementLocked(a) {
    if (a.statuses.some((s) => s.remaining > 0 && STATUS_DEFS[s.id]?.immobilize))
      return true;
    if (a.magicPack && a.sheet.getSourceMods("magicPack:beamChannel"))
      return true;
    if (a.magicPack && a.sheet.getSourceMods("magicPack:eventChannel"))
      return true;
    if (a.dash || a.leap || a.caromRun || a.isStunned() || a.dead || a.anchored || a.passive && !a.driven && !(a.defId && MONSTERS[a.defId]?.brain?.behavior?.haunt))
      return true;
    for (const au of a.activeAuras.values()) {
      const ad = au.inst.def.delivery;
      if (ad.type === "aura" && ad.moveFactor === 0)
        return true;
    }
    if (a.casting) {
      if (a.casting.mode === "channel") {
        return (a.casting.gather ?? instanceChannel(a.casting.inst))?.move === "immobile" && w.channelMobility(a, a.casting.inst) <= 0;
      }
      if (a.casting.mode === "guard")
        return false;
      return w.castMoveFactor(a, a.casting.inst) <= 0;
    }
    return false;
  }
}

  function statusReqs(req) {
  return req === void 0 ? null : Array.isArray(req) ? req : [req];
}
const STEALTH_CHARGE = "stealth";
function isStealthed(a) {
  return isConcealed(a) || a.sheet.get("invisible") > 0;
}
const NOCLIP_DISP = { ignoreConfine: true };
const LEVITATE_DISP = { ignoreFall: true };

  w.statusReqs = statusReqs;
  w.isStealthed = isStealthed;
  return new Policies();
}
export const combatPolicyMethods = Object.freeze(["applyThorns","consumeChargeCost","tickChannelSupports","healAlliesInArea","enemiesOf","spawnAftershocks","forwardSummonSockets","clearSummonReleaseFields","clearTreeFields","accumulateDotText","attackSequenceBurst","plantSpiritTotem","reflectParriedProjectile","resolveParryDamage","tryGuardBlock","guardianFor","tryShellBlock","hivecallCap","litePooledHit","updateClings","resolveImpactHit","sweepBodySlam","updateHivecall","updateMinionMeta","checkMinionDetonations","updateWorms","separateActors","resyncMinionSupports","movementLocked"]);
