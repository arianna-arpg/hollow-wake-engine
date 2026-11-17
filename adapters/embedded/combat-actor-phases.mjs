// Generated ordered combat frame pieces; the owner binds SDK services.
export function createCombatActorPhases(w, q) {
  const {anatomyFlash, takeWeakPointBreaks, finishAIRecovery, angleDiff, angleTo, clamp, dist, vec, FOURTH_WALL_CFG, frameReflect, STATUS_DEFS, shellArcFactor, nearestBody, noteBodyHit, MASS_CFG, BEHAVIOR_CFG, grantedTags, guardBashSpec, instanceMods, makeSkillInstance, BASH_CFG, skillContextTags, BLOOM_CFG, SKILLS, MONSTERS, landingTier, tierEnclosed, tierFloorAt, TIER_CFG, batchScaleOf, GRAB_CFG, procCueStyle, PROC_CUE_CFG, defenseCueFlash, combatCueFlash, ROOTED_CFG, standsRooted, inPhases, ORB_DEFS, ORB_CAP, orbTrickleStat, ORB_TRICKLE} = q;
  const rand = (a, b) => a + w.random() * (b - a), chance = p => w.random() < p;
  const randInt = (a, b) => Math.floor(a + w.random() * (b + 1 - a));
  const pick = rows => rows[Math.floor(w.random() * rows.length)];
  const isDormant = a => w.isDormant(a);
  const syncAttributeBequests = (...args) => w.bequests.sync(...args);
  const mitigateTyped = (...args) => w.damage.mitigateTyped(...args);
  const landLifeDamage = (...args) => w.damage.landLifeDamage(...args);
  const PUSH_DAMPING = w.rules.pushDamping;
  function beforeTimers(a, flowDt, rawDt) {
  w.syncPocketGrants(a);
  a.statusRelay ??= w.relayStatus;
  w.updateGrantedTrails(a);
  if ((a.owner || a.bequestSignature) && (!a.companion || !w.companionBonds.host(a))) {
    const anchor = a.summonInst;
    syncAttributeBequests(a, anchor?.def.throng ? batchScaleOf(anchor.def.throng) : 1, anchor ? skillContextTags(anchor.def) : void 0, anchor ? instanceMods(anchor) : void 0);
  }
  const atf = w.timeflow.actorScale(a);
  if (atf <= 0) {
    a.tickChronoStatuses(rawDt);
    return false;
  }
  const dt = atf === 1 ? flowDt : flowDt * atf;
  if (a.decay && !a.dead) {
    a.decay.t += dt;
    if (a.decay.t > 0) {
      a.life -= a.decay.dps0 * Math.pow(a.decay.growth, a.decay.t) * dt;
      if (a.life <= 0) {
        w.kill(a);
        if (a.dead)
          w.showCompanionCue(a, "unravel");
        return false;
      }
    }
  }
  if (a.bloomIn > 0 && !a.dead) {
    a.bloomIn -= dt;
    if (a.bloomIn <= 0) {
      a.bloomIn = 0;
      const owner = a.owner;
      const power = owner && !owner.dead ? owner.sheet.get("minionBloomPower", a.summonInst ? skillContextTags(a.summonInst.def) : void 0, a.summonInst ? instanceMods(a.summonInst) : void 0) : 0;
      if (power > 0)
        w.explodeActor(a, power, { type: BLOOM_CFG.type, color: BLOOM_CFG.color, recoveryCue: "companion_bloom" });
      w.releaseContract(a, true);
      w.kill(a, !a.expiryTriggersDeath);
      return false;
    }
  }
  if (a.lifespan > 0) {
    a.lifespan -= dt;
    if (a.lifespan <= 0) {
      if (!a.presenceBadge)
        w.flashes.push({ pos: vec(a.pos.x, a.pos.y), radius: a.radius * 1.4, color: a.color, life: 0.3, maxLife: 0.3 });
      if (a.construct && a.explodeOnDeath > 0) {
        w.explodeActor(a, a.explodeOnDeath);
      }
      if (a.construct && a.summonInst) {
        const eBash = guardBashSpec(a.summonInst);
        if (eBash && a.life > 0) {
          w.guardBash(a, a.summonInst, { ...eBash, arcDeg: 360 }, a.life);
        }
      }
      if (a.construct?.hatch)
        w.hatchPod(a);
      w.releaseContract(a, true);
      w.kill(a, !a.expiryTriggersDeath, void 0, "expire");
      return false;
    }
  }
  a.orbTrickleT += dt;
  if (a.orbTrickleT >= ORB_TRICKLE.everySec) {
    a.orbTrickleT -= ORB_TRICKLE.everySec;
    if (w.orbs.length < ORB_CAP) {
      for (const id of Object.keys(ORB_DEFS)) {
        const c = a.sheet.get(orbTrickleStat(id));
        if (c > 0 && chance(Math.min(0.75, c))) {
          w.shedOrb(id, a.pos, { scatter: ORB_TRICKLE.scatter, tier: a.tier });
        }
      }
    }
  }
  return dt;
}
function afterTimers(a, dt) {
  for (const procCue of a.procPopEvents) {
    const style = procCueStyle(procCue.profile ?? "blood");
    w.flashes.push(combatCueFlash(a.pos, style.pop ?? "proc_pop", a.radius + PROC_CUE_CFG.popPad, a.facing, procCue.color ?? style.color));
  }
  a.procPopEvents.length = 0;
  if (a.touchdown && !a.flying && !a.leap && !a.dash) {
    a.touchdown = false;
    if (w.zone.tiers && w.walk?.regionAt) {
      a.tier = landingTier(w.walk.regionAt(a.pos.x, a.pos.y), a.tier);
    }
  }
}
function afterBanks(a, dt) {
  if (a.habitat && !a.dead) {
    if (!a.confine) {
      const h = a.habitat;
      let bx = 0, by = 0, br = -1, bd = Infinity;
      for (const d of w.doodads) {
        if (d.kind !== h.kind || d.gone || d.radius < (h.minRadius ?? 0))
          continue;
        const dd = dist(a.pos, d.pos);
        if (dd < bd) {
          bd = dd;
          bx = d.pos.x;
          by = d.pos.y;
          br = d.radius;
        }
      }
      a.confine = br >= 0 ? { x: bx, y: by, r: br + (h.grace ?? 24) } : { x: a.pos.x, y: a.pos.y, r: 120 };
    }
    const cdx = a.pos.x - a.confine.x, cdy = a.pos.y - a.confine.y;
    const cd = Math.hypot(cdx, cdy);
    if (cd > a.confine.r) {
      const s = a.confine.r / cd;
      a.pos.x = a.confine.x + cdx * s;
      a.pos.y = a.confine.y + cdy * s;
    }
  }
  if (a.ambushArmed && !a.dead) {
    const spec = a.ambushSpec ?? (a.defId ? MONSTERS[a.defId]?.ambush : void 0);
    const wake = spec?.radius ?? 130;
    for (const e of w.enemiesOf(a)) {
      if (e.dead || e.sheet.get("invisible") > 0)
        continue;
      if (dist(a.pos, e.pos) > wake)
        continue;
      w.springAmbush(a);
      break;
    }
  }
  if (a.defId && !a.dead) {
    const bond = MONSTERS[a.defId]?.bond;
    if (bond) {
      const r = bond.radius ?? 520;
      const r2 = r * r;
      let from;
      let bd = Infinity;
      for (const o of w.actors) {
        if (o === a || o.dead || o.team !== a.team)
          continue;
        if (bond.kin ? o.defId !== bond.kin && o.tag !== bond.kin && o.faction !== bond.kin : a.squadId === void 0 || o.squadId !== a.squadId)
          continue;
        const dx = a.pos.x - o.pos.x, dy = a.pos.y - o.pos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2 || d2 >= bd)
          continue;
        bd = d2;
        from = o;
      }
      const held = !!from;
      const companionCueFrom = a.bondFrom;
      a.bondFrom = from;
      if (held !== a.bondHeld) {
        a.bondHeld = held;
        a.sheet.setSource("bond", held ? bond.mods : []);
        if (!held)
          w.showCompanionCue(a, "sever", companionCueFrom);
      }
    }
  }
  if (a.defId && !a.dead) {
    const noct = MONSTERS[a.defId]?.nocturne;
    if (noct) {
      const held = inPhases(w.time, noct.phases);
      if (held !== a.nocturneHeld) {
        a.nocturneHeld = held;
        a.sheet.setSource("nocturne", held ? noct.mods : []);
      }
    }
  }
  if (a.defId && !a.dead) {
    const root = MONSTERS[a.defId]?.rooted;
    if (root) {
      const on = standsRooted(root, a.pos, {
        groundKind: a.groundKind ?? a.gridRegion,
        creepCover: w.creep ? (k, x, y) => w.creep.coverOf(k, x, y) : void 0
      });
      if (on)
        a.rootedOffAt = 0;
      else if (a.rootedOffAt === 0)
        a.rootedOffAt = w.time;
      const held = on || w.time - a.rootedOffAt < (root.grace ?? ROOTED_CFG.grace);
      if (held !== a.rootedHeld) {
        a.rootedHeld = held;
        a.sheet.setSource("rooted", held ? root.mods : root.off ?? []);
        const note = held ? root.noteOn : root.note;
        if (note) {
          w.text(vec(a.pos.x, a.pos.y - 18), note, held ? ROOTED_CFG.onColor : ROOTED_CFG.offColor, 11);
        }
      }
    }
  }
  const sg = a.shellGuard;
  if (sg && !a.dead && sg.pool < sg.max && w.time - sg.lastHitAt >= sg.regenDelay) {
    sg.pool = Math.min(sg.max, sg.pool + sg.regenRate * dt);
    if (sg.broken && sg.pool >= sg.max * (sg.reformFraction ?? 0.4)) {
      sg.broken = false;
      w.flashes.push(defenseCueFlash(a, "shell", "reform", sg.color, {
        style: sg.shellVisual,
        facing: a.facing + (sg.side === "rear" ? Math.PI : 0),
        arc: sg.side === "all" ? Math.PI * 2 : sg.arcDeg * Math.PI / 180 * shellArcFactor(sg, w.time)
      }));
    }
  }
  {
    const cl = a.casting;
    if (cl && cl.mode !== "channel" && cl.mode !== "guard" && !a.dead && dist(a.pos, cl.aim) > 2) {
      a.facing = angleTo(a.pos, cl.aim);
    }
  }
  const steeredCast = a.casting?.mode === "channel" || a.casting?.mode === "guard";
  if (steeredCast && a.facingPrev !== void 0) {
    a.facing = a.facingPrev;
  } else if (a.facingPrev !== void 0 && !a.dead) {
    const rate = w.actorTurnRate(a);
    if (rate > 0) {
      const want = angleDiff(a.facingPrev, a.facing);
      const cap = rate * dt;
      if (Math.abs(want) > cap)
        a.facing = a.facingPrev + Math.sign(want) * cap;
    }
  }
  a.facingPrev = a.facing;
  if (dt > 0) {
    if (a.posPrev) {
      const cap = BEHAVIOR_CFG.velSampleMax;
      const ix = clamp((a.pos.x - a.posPrev.x) / dt, -cap, cap);
      const iy = clamp((a.pos.y - a.posPrev.y) / dt, -cap, cap);
      const k = Math.min(1, dt * BEHAVIOR_CFG.velEmaRate);
      a.velEst.x += (ix - a.velEst.x) * k;
      a.velEst.y += (iy - a.velEst.y) * k;
      a.posPrev.x = a.pos.x;
      a.posPrev.y = a.pos.y;
    } else {
      a.posPrev = { x: a.pos.x, y: a.pos.y };
    }
  }
  return steeredCast;
}
function afterStatuses(a, dt, steeredCast) {
  for (const cue of takeWeakPointBreaks(a))
    w.flashes.push(anatomyFlash(a.pos, a.radius, a.facing, cue));
  if (a.casting) {
    const cast = a.casting;
    const castFacing = a.facing;
    w.updateCasting(a, dt);
    if (!steeredCast && w.actorTurnRate(a) > 0)
      a.facing = castFacing;
    if (steeredCast)
      a.facingPrev = a.facing;
    if (a.casting !== cast && cast.aiRecovery !== void 0 && !a.dead && !a.isStunned() && !w.seatOf(a)) {
      finishAIRecovery(a, w.time, cast.aiRecovery);
    }
  }
  {
    let frameLocked = false;
    for (const s of a.statuses) {
      if (STATUS_DEFS[s.id]?.frameLock) {
        frameLocked = true;
        break;
      }
    }
    if (frameLocked) {
      if (!a.frameLockRect)
        a.frameLockRect = { ...w.viewRectFor(a) };
    } else if (a.frameLockRect)
      a.frameLockRect = null;
  }
  if (a.dash) {
    const inst = a.dashSkill;
    const hits = a.dashHits;
    const visualFrom = { ...a.pos }, visualTier = a.tier;
    const step = a.dash.speed * Math.min(dt, Math.max(0, a.dash.remaining));
    w.steppedClamp(a, vec(a.pos.x + Math.cos(a.dash.dir) * step, a.pos.y + Math.sin(a.dash.dir) * step), a.pos);
    if (inst && a.tier === visualTier && dist(visualFrom, a.pos) <= step + 0.01) {
      w.noteMovementTravel(a, inst, visualFrom, 1 - a.dash.remaining / Math.max(0.01, inst.def.delivery.type === "dash" ? inst.def.delivery.distance / a.dash.speed : 1));
    }
    if (inst && hits && inst.def.delivery.type === "dash" && inst.def.delivery.width > 0) {
      for (const enemy of w.enemiesOf(a)) {
        if (hits.has(enemy.id))
          continue;
        const nb = nearestBody(enemy, a.pos);
        if (dist(a.pos, nb.pos) - nb.r <= inst.def.delivery.width / 2 + a.radius) {
          hits.add(enemy.id);
          noteBodyHit(enemy, nb.seg);
          w.resolveHit(a, inst, enemy, inst.def.delivery.corridorScale ?? 1);
          const carry = inst.def.delivery.onContact;
          if (carry && w.grabSeize(a, inst, enemy, carry.grab)) {
            if (carry.maxCarryDistance !== void 0) {
              a.dash.remaining = Math.min(a.dash.remaining, dt + Math.max(0, carry.maxCarryDistance) / Math.max(1, a.dash.speed));
            }
            const hold = a.gripping;
            if (hold && hold.id === enemy.id) {
              hold.until = Math.min(hold.until, w.time + a.dash.remaining);
            }
          }
        }
      }
      w.strikeSurfaces(a, a.pos, inst.def.delivery.width / 2 + a.radius, void 0, hits);
    }
    const conjSpec = a.dashConjureSpec;
    if (conjSpec) {
      const cc = a;
      cc.conjTrailDist = (cc.conjTrailDist ?? 99) + step;
      if (cc.conjTrailDist >= 30) {
        cc.conjTrailDist = 0;
        w.conjureCloud(a.pos.x, a.pos.y, conjSpec.radius, conjSpec.duration, {
          caster: a,
          grants: conjSpec.grants,
          ...conjSpec.look !== void 0 ? { look: conjSpec.look } : {}
        });
      }
    }
    const ventSpec = a.dashVentSpec;
    if (ventSpec) {
      const vc = a;
      vc.ventTrailDist = (vc.ventTrailDist ?? 1e9) + step;
      if (vc.ventTrailDist >= ventSpec.spacing) {
        vc.ventTrailDist = 0;
        w.plantVent({ bank: ventSpec.bank, radius: ventSpec.radius, duration: ventSpec.duration }, vec(a.pos.x, a.pos.y), 1, 1, a.tier);
      }
    }
    const trail = a.dashTrailSpec;
    if (inst && trail) {
      const carrier = a;
      carrier.trailDist = (carrier.trailDist ?? 99) + step;
      if (carrier.trailDist >= 42) {
        carrier.trailDist = 0;
        w.mintTrailPatch(a, inst, trail, a.pos, a.dash.dir, trail.duration * speedLingerMul(trail.durationBySpeed, a.dash.speed));
      }
    }
    a.dash.remaining -= dt;
    if (a.dash.remaining <= 0) {
      {
        const hold = a.gripping;
        const carryD = inst && inst.def.delivery.type === "dash" ? inst.def.delivery.onContact : void 0;
        if (inst && carryD && hold && hold.skillId === inst.def.id) {
          const v = w.actorById(hold.id);
          w.grabRelease(a);
          if (v && !v.dead) {
            v.pos = w.clampPos(vec(a.pos.x + Math.cos(a.dash.dir) * (a.radius + v.radius) * 0.9, a.pos.y + Math.sin(a.dash.dir) * (a.radius + v.radius) * 0.9), v.radius);
            v.facing = a.dash.dir + Math.PI;
            w.pushActor(v, a.dash.dir, a.dash.speed * (carryD.shove ?? GRAB_CFG.runCarry.shoveFrac) / PUSH_DAMPING, a, inst, { noAuthority: true });
            w.flashes.push({
              pos: vec(v.pos.x, v.pos.y),
              radius: a.radius + v.radius + 10,
              color: "#d8a06a",
              life: 0.2,
              maxLife: 0.2
            });
          }
        }
      }
      a.dash = null;
      Object.assign(a, {
        dashSkill: void 0,
        dashHits: void 0,
        dashConjureSpec: void 0,
        conjTrailDist: void 0,
        dashVentSpec: void 0,
        ventTrailDist: void 0,
        dashTrailSpec: void 0,
        trailDist: void 0
      });
      if (inst) {
        w.movementMoment(a, inst, "arrive");
        w.moveBlast(a, inst, a.pos);
        w.dropLingerField(a, inst, a.pos);
        const dBash = guardBashSpec(inst);
        if (dBash) {
          w.guardBash(a, inst, dBash, BASH_CFG.poollessShield * a.sheet.get("guardStrength", skillContextTags(inst, grantedTags(inst)), instanceMods(inst)));
        }
      }
    }
  }
  if (a.caromRun) {
    const run = a.caromRun;
    const caromC = a;
    const inst = caromC.caromSkill;
    if (!a.statuses.some((s) => s.id === run.status) || a.dead || a.downed || a.isStunned() || a.heldBy !== void 0 || a.mountId !== void 0) {
      w.endCarom(a);
    } else {
      const C = FOURTH_WALL_CFG.carom;
      const spec = inst?.def.delivery.type === "carom" ? inst.def.delivery : void 0;
      const step = run.speed * dt;
      const beforeX = a.pos.x, beforeY = a.pos.y;
      const wantX = Math.cos(run.dir) * step, wantY = Math.sin(run.dir) * step;
      w.steppedClamp(a, vec(a.pos.x + wantX, a.pos.y + wantY), a.pos);
      let cdx = Math.cos(run.dir), cdy = Math.sin(run.dir), banked = false;
      if (Math.abs(wantX) > C.blockedMin && (a.pos.x - beforeX) / wantX < C.blockedFrac) {
        cdx = -cdx;
        banked = true;
      }
      if (Math.abs(wantY) > C.blockedMin && (a.pos.y - beforeY) / wantY < C.blockedFrac) {
        cdy = -cdy;
        banked = true;
      }
      if (banked)
        run.dir = Math.atan2(cdy, cdx);
      const fw = frameReflect(a.pos.x, a.pos.y, run.dir, a.radius, w.viewRectFor(a));
      if (fw) {
        a.pos.x = fw.x;
        a.pos.y = fw.y;
        run.dir = fw.dir;
      }
      a.facing = run.dir;
      if (inst) {
        if (dist({ x: beforeX, y: beforeY }, a.pos) <= step + 0.01)
          w.noteMovementTravel(a, inst, { x: beforeX, y: beforeY }, w.time % 1);
        if (banked || fw)
          w.movementMoment(a, inst, "bank");
      }
      if (inst) {
        const rehit = spec?.rehit ?? C.rehitSec;
        const reach = a.radius + C.contactPad;
        for (const enemy of w.enemiesOf(a)) {
          const nb = nearestBody(enemy, a.pos);
          if (dist(a.pos, nb.pos) - nb.r > reach)
            continue;
          if ((caromC.caromHits?.get(enemy.id) ?? -1) > w.time)
            continue;
          caromC.caromHits?.set(enemy.id, w.time + rehit);
          noteBodyHit(enemy, nb.seg);
          w.resolveHit(a, inst, enemy, spec?.contactScale ?? 1);
        }
        w.strikeSurfaces(a, a.pos, reach, void 0, caromC.caromRung);
      }
    }
  }
  {
    const wt = a;
    if (wt.walkTrail && !a.dead) {
      if (w.time >= wt.walkTrail.until) {
        wt.walkTrail = void 0;
        wt.walkTrailPrev = void 0;
      } else {
        const prev = wt.walkTrailPrev;
        wt.walkTrailPrev = vec(a.pos.x, a.pos.y);
        if (prev) {
          wt.walkTrailOdo = (wt.walkTrailOdo ?? 0) + dist(prev, a.pos);
          if (wt.walkTrailOdo >= 42) {
            wt.walkTrailOdo = 0;
            w.mintTrailPatch(a, wt.walkTrail.inst, wt.walkTrail.spec, a.pos, a.facing);
          }
        }
      }
    }
  }
  if (a.wake && !a.dead && !a.untargetable) {
    const prev = a.wakePrev;
    a.wakePrev = vec(a.pos.x, a.pos.y);
    if (prev) {
      a.wakeOdo = (a.wakeOdo ?? 0) + dist(prev, a.pos);
      if (a.wakeOdo >= a.wake.everyDist) {
        a.wakeOdo = 0;
        const wdef = SKILLS[a.wake.skillId];
        if (wdef) {
          a.wakeInst ??= makeSkillInstance(wdef, Math.max(1, Math.round(a.level)));
          w.executeSkill(a, a.wakeInst, vec(a.pos.x, a.pos.y), {
            dmgMult: a.wake.dmgMult ?? 1,
            noCooldown: true,
            noRepeat: true,
            keepFacing: true
          });
        }
      }
    }
  }
  if (a.brims?.size) {
    for (const [sid, bs] of a.brims) {
      if (a.casting?.mode === "channel" && a.casting.held && a.casting.inst.def.id === sid)
        continue;
      if (bs.fill <= 0) {
        a.brims.delete(sid);
        continue;
      }
      const spec = bs.spec;
      if (!spec.decay)
        continue;
      if (spec.bankAt !== void 0 && bs.fill >= spec.bankAt)
        continue;
      bs.fill -= spec.decay * a.sheet.get("brimDecay", skillContextTags(bs.inst.def), instanceMods(bs.inst)) * dt;
      if (bs.fill <= 0)
        a.brims.delete(sid);
    }
  }
  if (a.push) {
    const p = a.push;
    const from = a.pos;
    const speed = Math.hypot(p.vx, p.vy);
    const sc = w.cScratch;
    sc.hit = "none";
    a.pos = w.clampPos(vec(a.pos.x + p.vx * dt, a.pos.y + p.vy * dt), a.radius, from, { out: sc, mover: a });
    w.deviceContacts?.record(a, from, a.pos, a.tier, a.flying || !!a.leap || w.levitating(a));
    const hit = sc.hit;
    if (speed >= MASS_CFG.slam.minSpeed)
      w.sweepBodySlam(a, p, speed);
    if (hit === "void")
      w.resolveBoundary(a, sc, from, true);
    if (hit === "wall" && a.tier >= 1 && w.walk && w.zone.tiers && !tierEnclosed(w.zone.tiers)) {
      const rawX = from.x + p.vx * dt, rawY = from.y + p.vy * dt;
      const kRaw = w.walk.regionAt?.(rawX, rawY);
      if (!tierFloorAt(kRaw, a.tier)) {
        let land = -1;
        for (let t = a.tier - 1; t >= 0; t--) {
          if (tierFloorAt(kRaw, t)) {
            land = t;
            break;
          }
        }
        if (land >= 0) {
          a.tier = land;
          a.pos = w.clampPos(vec(rawX, rawY), a.radius, void 0, { mover: a });
          a.applyStatus("stun", 0, TIER_CFG.fallStunSec, "the fall");
          p.vx *= 0.4;
          p.vy *= 0.4;
        }
      }
    }
    if ((hit === "wall" || hit === "void") && !p.collided && p.caster && p.inst && !p.caster.dead) {
      p.collided = true;
      w.rollCollisionProcs(p.caster, p.inst, a);
    }
    if (hit === "wall")
      w.resolveImpactHit(a, speed, p);
    const decay = Math.exp(-PUSH_DAMPING * dt);
    p.vx *= decay;
    p.vy *= decay;
    if (Math.hypot(p.vx, p.vy) < 40)
      a.push = null;
  }
  if (!a.dash && !a.caromRun && !a.casting && !a.leap && a.lastMoveAt < w.time - 0.05) {
    const sp = Math.hypot(a.vel.x, a.vel.y);
    if (sp > 4) {
      const traction = clamp(a.sheet.get("traction"), 0.05, 1);
      if (traction < 0.999) {
        w.steppedClamp(a, vec(a.pos.x + a.vel.x * dt, a.pos.y + a.vel.y * dt), a.pos);
        const decay = Math.exp(-dt * (1.2 + traction * 9));
        a.vel.x *= decay;
        a.vel.y *= decay;
      } else {
        a.vel.x = 0;
        a.vel.y = 0;
      }
    }
  }
}
function speedLingerMul(spec, speed) {
  if (!spec) return 1;
  const raw = Math.pow(Math.max(1, speed) / Math.max(1, spec.ref), spec.exp ?? 1);
  return Math.min(spec.max ?? 4, Math.max(spec.min ?? 0.25, raw));
}

  return {beforeTimers, afterTimers, afterBanks, afterStatuses};
}
