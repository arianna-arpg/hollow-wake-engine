// Generated isolated combat commands. General AI planning stays in the host.
export function createCombatCommands(w, q) {
  const {C, COMPANION_CUE_STYLES, MONSTERS, STATUS_DEFS, combatCueFlash, dist, evalCurve, instanceDelivery, instanceMods, instanceUseCharges, makeSkillInstance, mod, normalizeBrain, sameStory, skillContextTags, skillCooldownSeconds} = q;
  const mitigateTyped = (...args) => w.damage.mitigateTyped(...args);
  const landLifeDamage = (...args) => w.damage.landLifeDamage(...args);
  const conversions = Object.create(null);
  const registerConvertRule = (id, rule) => {conversions[id] = rule;};
  const ASSAULT = { radius: 200, chance: 0.2, refund: 0.25, maxHits: 5, duration: 6 };
const assaultNode = (s, id) => s.def.id === "command_assault" && !!s.treeNodes?.includes(id);
function assaultOrbitPositions(a, time) {
  if (!a.assaultOrbit || a.plies <= 0) return [];
  return Array.from({ length: a.plies }, (_, i) => {
    const angle = time * 5 + i * Math.PI * 2 / a.plies + a.id;
    const radius = a.radius + 22;
    return { x: a.pos.x + Math.cos(angle) * radius, y: a.pos.y + Math.sin(angle) * radius };
  });
}
class Assaults {
  constructor(w2) {
    this.w = w2;
  }
  courts = /* @__PURE__ */ new Map();
  recalls = /* @__PURE__ */ new Map();
  wards = /* @__PURE__ */ new Map();
  clearAll() {
    for (const c of [...this.courts.values()]) this.clear(c);
  }
  policy(host) {
    return JSON.stringify([host.treeNodes, host.level, host.sockets.map((s) => s && [s.def.id, s.level])]);
  }
  live(c) {
    return !c.owner.dead && !c.owner.downed && this.w.seats.some((s) => s.actor === c.owner) && c.owner.skills.includes(c.host) && c.policy === this.policy(c.host);
  }
  court(owner, host) {
    let c = this.courts.get(owner);
    if (c && (c.host !== host || !this.live(c))) {
      this.clear(c);
      c = void 0;
    }
    if (!c) {
      c = { owner, host, policy: this.policy(host), bank: 0, bodies: /* @__PURE__ */ new Set() };
      this.courts.set(owner, c);
    }
    return c;
  }
  duration(c) {
    return ASSAULT.duration * c.owner.sheet.get("effectDuration", skillContextTags(c.host), instanceMods(c.host));
  }
  clear(c) {
    c.owner.lifeDamageInterceptors?.delete("assault");
    c.owner.assaultHud = void 0;
    c.owner.assaultAura = false;
    for (const a of c.bodies) {
      a.assaultPreparation = void 0;
      a.assaultLockedTarget = void 0;
      for (const id of ["assault_preparation", "assault_shelter", "assault_orders", "assault_tempo"]) a.removeBuff(id);
      a.sheet.removeSource("assault:formation");
      a.assaultFormationStats = void 0;
      if (a.aiCommand?.assaultFormation) a.aiCommand = void 0;
      this.endWard(a);
      this.recalls.delete(a);
    }
    this.courts.delete(c.owner);
  }
  endWard(a) {
    a.plies = Math.max(0, a.plies - a.assaultWardCount);
    a.pliesMax = Math.max(0, a.pliesMax - a.assaultWardCount);
    a.assaultWardCount = 0;
    a.assaultPlyBreak = void 0;
    a.assaultOrbit = false;
    this.wards.delete(a);
  }
  grantPly(a) {
    a.assaultWardCount++;
    a.plies++;
    a.pliesMax++;
    a.plySpec ??= { count: 0 };
  }
  /** Called once per actual command, after obedience selected its recipients. */
  command(owner, inst, bodies, recall) {
    const host = inst.def.id === "command_assault" ? inst : inst.def.id === "command_recall" && !inst.hostSkillId ? owner.skills.find((s) => s?.def.id === "command_assault") : void 0;
    if (!host) return;
    const c = this.court(owner, host), until = this.w.time + this.duration(c);
    const unit = Math.max(0.1, skillCooldownSeconds(owner, host));
    const extra = !recall && assaultNode(host, "patient_signal") ? Math.min(ASSAULT.maxHits - 1, Math.floor(c.bank / unit)) : 0;
    if (!recall) c.bank = Math.max(0, c.bank - extra * unit);
    bodies.forEach((a, index) => {
      c.bodies.add(a);
      if (recall) {
        if (!assaultNode(host, "iron_advance")) return;
        this.recalls.set(a, { court: c, at: this.w.time + index * Math.min(0.035, 0.5 / Math.max(1, bodies.length - 1)) });
        return;
      }
      const ranks = host.treeNodes?.filter((id) => id === "clear_orders").length ?? 0;
      if (ranks) a.addBuff({ type: "buff", id: "assault_orders", duration: this.duration(c), mods: [mod("moveSpeed", "increased", 0.1 * ranks), mod("attackSpeed", "increased", 0.1 * ranks), mod("castSpeed", "increased", 0.1 * ranks), mod("damage", "increased", 0.03 * ranks)] });
      if (assaultNode(host, "killing_signal")) a.assaultPreparation = { owner, host, hits: 1 + extra, until, policy: c.policy };
      this.endWard(a);
      if (assaultNode(host, "sheltered_advance")) {
        this.grantPly(a);
        const ward = { court: c, body: a, until, lost: false, rebuilt: false, contacts: 0, touched: /* @__PURE__ */ new Map() };
        this.wards.set(a, ward);
        a.assaultOrbit = assaultNode(host, "scattered_advance");
        a.assaultPlyBreak = (attacker) => {
          if (!this.live(c) || this.w.time >= ward.until || attacker && (!this.w.hostileTo(attacker, a) || !sameStory(attacker, a))) return;
          ward.lost = true;
          const spent = Math.min(a.assaultWardCount, Math.max(0, a.pliesMax - a.plies));
          a.assaultWardCount -= spent;
          a.pliesMax -= spent;
          this.burst(a, a.pos, 48, 0.65);
        };
      }
    });
    this.hud(c);
  }
  prepared(a) {
    const p = a.assaultPreparation;
    if (!p || p.hits <= 0 || p.until <= this.w.time || p.owner.dead || !p.owner.skills.includes(p.host) || p.policy !== this.policy(p.host)) return void 0;
    return p;
  }
  lock(a, inst, aim) {
    a.assaultLockedTarget = void 0;
    const p = this.prepared(a), d = instanceDelivery(inst);
    if (!p || !assaultNode(p.host, "stunning_signal") || d.type !== "melee" || a.sheet.get("meleeSweep", skillContextTags(inst), instanceMods(inst)) > 0) return;
    const reach = (a.radius + d.range) * a.sheet.get("meleeReach", skillContextTags(inst), instanceMods(inst));
    const candidates = this.w.enemiesOf(a).filter((t) => sameStory(a, t) && dist(a.pos, t.pos) <= reach + t.radius);
    const target = candidates.find((t) => t.id === a.aiTargetId) ?? candidates.sort((x, y) => dist(x.pos, aim) - dist(y.pos, aim))[0];
    if (target) a.assaultLockedTarget = { inst, targetId: target.id, until: this.w.time + Math.max(1, a.skillUseTime(inst) + 0.5) };
  }
  locked(a, inst) {
    const lock = a.assaultLockedTarget;
    a.assaultLockedTarget = void 0;
    if (!lock || lock.inst !== inst || lock.until < this.w.time || !this.prepared(a)) return;
    const target = this.w.actorById(lock.targetId);
    return target && !target.dead && !target.untargetable && sameStory(a, target) && this.w.hostileTo(a, target) ? target : void 0;
  }
  packet(a, packet, depth) {
    const p = depth === 0 ? this.prepared(a) : void 0;
    if (p && assaultNode(p.host, "sure_signal")) packet.assaultGuaranteed = true;
  }
  plant(a, target, packet, depth, dealt) {
    if (depth !== 0 || dealt <= 0 || target.dead || !this.prepared(a)) return;
    for (const type of Object.keys(packet.amounts)) {
      const amount = packet.amounts[type] ?? 0;
      if (amount <= 0) continue;
      target.applyStatus("impaled_" + type, 0, 1, "Killing Signal", { casterId: a.id, rupture: amount * 0.2, ruptureType: type });
    }
  }
  feed(c, target, dealt, source) {
    if (!this.live(c)) return;
    if (dealt > 0 && assaultNode(c.host, "finishing_signal") && !target.dead) target.applyStatus("doom", 0, 1, "Dooming Signal", { casterId: source.id, rupture: dealt * 0.4, ruptureType: "chaos" });
    if (assaultNode(c.host, "rapid_signals") && w.random() < ASSAULT.chance) this.refund(c.owner, c.host, ASSAULT.refund);
  }
  refund(owner, host, amount) {
    const c = this.court(owner, host), left = owner.cooldowns.get(host.def.id) ?? 0;
    const reduction = Math.min(left, amount);
    if (left > reduction) owner.cooldowns.set(host.def.id, left - reduction);
    else owner.cooldowns.delete(host.def.id);
    if (left <= 0 && assaultNode(host, "patient_signal")) c.bank = Math.min(skillCooldownSeconds(owner, host) * (ASSAULT.maxHits - 1), c.bank + amount);
    this.hud(c);
  }
  afterHit(a, target, dealt, depth, landed = dealt > 0) {
    if (depth !== 0 || !landed) return;
    for (const c of this.courts.values()) if (a !== c.owner && a.ownedBy(c.owner)) this.feed(c, target, dealt, a);
    const p = this.prepared(a);
    if (!p) return;
    if (assaultNode(p.host, "rushing_signal")) a.addBuff({ type: "buff", id: "assault_tempo", label: "Rising Tempo", duration: 4, maxStacks: 5, mods: [mod("moveSpeed", "increased", 0.1), mod("attackSpeed", "increased", 0.1), mod("castSpeed", "increased", 0.1)] });
    if (--p.hits <= 0) {
      a.assaultPreparation = void 0;
      a.removeBuff("assault_preparation");
    }
  }
  pooledHit(owner, target, dealt, amounts) {
    if (dealt <= 0 || target.dead) return;
    for (const s of [...target.statuses]) {
      if (!s.id.startsWith("impaled_") || !s.rupture || !s.ruptureType || !(amounts[s.ruptureType] > 0)) continue;
      target.statuses.splice(target.statuses.indexOf(s), 1);
      target.sheet.removeSource("status:" + s.id);
      landLifeDamage(target, mitigateTyped(target, { [s.ruptureType]: s.rupture }));
      if (target.life <= 0) {
        this.w.kill(target, false, owner);
        break;
      }
    }
    const c = this.courts.get(owner);
    if (c) this.feed(c, target, dealt, owner);
    this.w.assaultDoomCull(target);
  }
  burst(a, at, radius, power, only) {
    const hit = makeSkillInstance({ id: "assault_blade", name: "Command Blade", tags: ["spell", "physical", "aoe"], color: "#dfc77b", manaCost: 0, cooldown: 0, useTime: 0, delivery: { type: "self" }, description: "A protective ply cuts nearby enemies.", baseDamage: { physical: [4 + a.level * 1.5, 6 + a.level * 1.5] }, effects: [{ type: "damage" }] });
    const enemies = only ? [only] : this.w.enemiesOf(a);
    for (const e of enemies) if (!e.dead && sameStory(a, e) && this.w.hostileTo(a, e) && dist(e.pos, at) <= radius + e.radius) this.w.assaultBladeHit(a, hit, e, power);
    if (!only) this.w.flashes.push({ pos: { ...at }, radius, color: "#dfc77b", life: 0.2, maxLife: 0.2 });
  }
  hud(c) {
    if (!assaultNode(c.host, "patient_signal")) {
      c.owner.assaultHud = void 0;
      return;
    }
    const unit = Math.max(0.1, skillCooldownSeconds(c.owner, c.host));
    const extra = Math.min(ASSAULT.maxHits - 1, Math.floor(c.bank / unit));
    c.owner.assaultHud = { hits: 1 + extra, progress: extra >= ASSAULT.maxHits - 1 ? 1 : c.bank / unit % 1 };
  }
  update(dt) {
    for (const c of [...this.courts.values()]) if (!this.live(c)) this.clear(c);
    for (const seat of this.w.seats) {
      const owner = seat.actor, host = owner.skills.find((s) => s?.def.id === "command_assault");
      if (!host || owner.dead) continue;
      const c = this.court(owner, host), ready = (owner.cooldowns.get(host.def.id) ?? 0) <= 0;
      const aura = ready && assaultNode(host, "renewed_advance");
      owner.assaultAura = aura;
      for (const a of c.bodies) if (a.dead || !a.ownedBy(owner)) {
        this.endWard(a);
        a.assaultPreparation = void 0;
        a.assaultLockedTarget = void 0;
        a.sheet.removeSource("assault:formation");
        a.assaultFormationStats = void 0;
        for (const id of ["assault_preparation", "assault_shelter", "assault_orders", "assault_tempo"]) a.removeBuff(id);
        c.bodies.delete(a);
        this.recalls.delete(a);
      }
      const bodies = this.w.actors.filter((a) => !a.dead && !a.construct && a !== owner && a.ownedBy(owner));
      const shields = aura ? bodies.filter((a) => sameStory(a, owner) && dist(a.pos, owner.pos) <= ASSAULT.radius) : [];
      owner.lifeDamageInterceptors?.delete("assault");
      if (aura) (owner.lifeDamageInterceptors ??= /* @__PURE__ */ new Map()).set("assault", (amount) => {
        if (!this.live(c) || (owner.cooldowns.get(host.def.id) ?? 0) > 0) return amount;
        const alive = shields.filter((a) => !a.dead && a.life > 0 && sameStory(a, owner) && dist(a.pos, owner.pos) <= ASSAULT.radius);
        if (!alive.length) return amount;
        let shared = 0;
        for (const a of alive) {
          const wound = Math.min(a.life, amount * 0.3 / alive.length);
          shared += wound;
          landLifeDamage(a, wound);
          if (a.life <= 0) this.w.kill(a, false, owner);
        }
        return amount - shared;
      });
      bodies.forEach((a, index) => {
        c.bodies.add(a);
        const inside = shields.includes(a);
        const regen = inside && assaultNode(host, "mending_advance") ? 4 * owner.sheet.get("minionDamage") : 0;
        const offense = !ready && assaultNode(host, "lasting_advance");
        const mods = [...regen ? [mod("lifeRegen", "flat", regen)] : [], ...offense ? [mod("damage", "more", 0.1)] : []];
        const signature = `${regen}:${offense}`;
        if (a.assaultFormationStats !== signature) {
          a.assaultFormationStats = signature;
          a.sheet.setSource("assault:formation", mods);
        }
        if (inside) {
          const angle = index * Math.PI * 2 / Math.max(1, shields.length), r = 48 + Math.min(55, shields.length * 2);
          issueCommand(a, { kind: "hold", pos: { x: owner.pos.x + Math.cos(angle) * r, y: owner.pos.y + Math.sin(angle) * r }, radius: 65, until: this.w.time + 0.2, issuerId: owner.id, assaultFormation: true });
        } else if (a.aiCommand?.assaultFormation) a.aiCommand = void 0;
        if (a.assaultPreparation && !this.prepared(a)) {
          a.assaultPreparation = void 0;
          a.removeBuff("assault_preparation");
        }
      });
      this.hud(c);
    }
    for (const [a, recall] of this.recalls) {
      if (a.dead || !this.live(recall.court)) {
        this.recalls.delete(a);
        continue;
      }
      if (this.w.time < recall.at) continue;
      const owner = recall.court.owner;
      this.burst(a, a.pos, 65, 1.3);
      const angle = a.id * 2.4;
      this.w.teleportActor(a, { x: owner.pos.x + Math.cos(angle) * 40, y: owner.pos.y + Math.sin(angle) * 40 }, "#dfc77b", void 0, owner.tier);
      a.casting = null;
      a.assaultLockedTarget = void 0;
      this.recalls.delete(a);
    }
    for (const [a, ward] of this.wards) {
      if (a.dead || !this.live(ward.court)) {
        this.endWard(a);
        continue;
      }
      if (ward.until <= this.w.time) {
        this.endWard(a);
        continue;
      }
      const points = assaultOrbitPositions(a, this.w.time);
      if (!points.length) continue;
      for (const e of this.w.enemiesOf(a)) {
        if (!sameStory(a, e) || !this.w.hostileTo(a, e) || dist(a.pos, e.pos) > a.radius + e.radius + 30) continue;
        points.forEach((p, index) => {
          const key = index + ":" + e.id;
          if (e.dead || (ward.touched.get(key) ?? 0) > this.w.time || dist(p, e.pos) > e.radius + 6) return;
          ward.touched.set(key, this.w.time + 0.3);
          const before = e.life;
          this.burst(a, e.pos, 6, 0.6, e);
          if (ward.lost && e.life < before && !ward.rebuilt && assaultNode(ward.court.host, "flowing_advance") && ++ward.contacts >= 3) {
            this.grantPly(a);
            ward.rebuilt = true;
          }
        });
      }
      for (const [id, until] of ward.touched) if (until < this.w.time - 1) ward.touched.delete(id);
    }
  }
}
function replenishingDelivery(inst) {
  if (inst.def.delivery.type !== "summon") return void 0;
  const d = instanceDelivery(inst);
  return d.type === "summon" && d.replenish ? d : void 0;
}
function replenishmentActive(inst) {
  const d = replenishingDelivery(inst);
  return !!d && (!d.replenish?.toggle || !inst.replenishmentPaused);
}
function replenishShape(actor, inst, d) {
  const tags = skillContextTags(inst), extra = instanceMods(inst);
  return {
    cap: Math.max(1, Math.round(actor.sheet.get("minionMaxCount", tags, extra, d.maxActive))),
    count: Math.max(1, d.count + Math.round(actor.sheet.get("summonCount", tags, extra))),
    interval: Math.max(0.1, (d.replenish?.interval ?? 1) * actor.sheet.get("minionRespawnTime", tags, extra))
  };
}
class ReplenishmentClocks {
  actors = /* @__PURE__ */ new WeakMap();
  forget(actor, inst) {
    if (inst) this.actors.get(actor)?.delete(inst);
    else this.actors.delete(actor);
  }
  update(actor, entries, dt, spawn) {
    if (!entries.length) {
      this.actors.delete(actor);
      return;
    }
    let clocks = this.actors.get(actor);
    if (!clocks) {
      clocks = /* @__PURE__ */ new Map();
      this.actors.set(actor, clocks);
    }
    const seated = new Set(entries.map((e) => e.inst));
    for (const inst of clocks.keys()) if (!seated.has(inst)) clocks.delete(inst);
    for (const e of entries) {
      const remaining = e.room <= 0 ? e.interval : (clocks.get(e.inst) ?? e.interval) - dt;
      clocks.set(e.inst, remaining > 0 ? remaining : e.interval);
      if (remaining <= 0 && dt > 0 && e.room > 0) spawn(e.inst, Math.min(e.room, e.count));
    }
  }
}
function companionCueStyle(profile) {
  return COMPANION_CUE_STYLES[Object.hasOwn(COMPANION_CUE_STYLES, profile) ? profile : "bond"];
}
function companionMaterial(spec, fallback = "bond") {
  const profile = spec?.profile && Object.hasOwn(COMPANION_CUE_STYLES, spec.profile) ? spec.profile : fallback;
  return { profile, color: spec?.color ?? companionCueStyle(profile).color };
}
function companionCueVisible(a) {
  return !a.dead && !a.burrow && !a.summonReform && !a.statuses.some((s) => STATUS_DEFS[s.id]?.conceals);
}
const point = (a) => ({ id: a.id, ...a.pos, tier: a.tier ?? 0, radius: a.radius });
function companionCueFlash(a, event, from, spec) {
  if (spec === false) return;
  const color = spec ? companionMaterial(spec).color : event === "bind" && a.sourceSkillId?.startsWith("__dominate:") ? companionCueStyle("thrall").color : void 0;
  return {
    ...combatCueFlash(a.pos, "companion_" + event, a.radius + C.eventPad, a.facing, color),
    companionCue: { event, tier: a.tier ?? 0, from: from && companionCueVisible(from) ? point(from) : void 0 }
  };
}
function companionCueSpec(a) {
  return a.summonInst?.def.companionCue ?? a.owner?.skills.find((s) => s?.def.id === a.sourceSkillId?.replace("__companion:", "").replace("__dominate:", ""))?.def.companionCue ?? (a.defId ? MONSTERS[a.defId]?.companionCue : void 0);
}
function issueCommand(actor, cmd) {
  actor.throngCarried = false;
  actor.aiCommand = cmd;
  actor.aiTargetId = void 0;
  actor.threat.clear();
  actor.wanderDir = void 0;
}
function obedienceOf(actor) {
  return actor.aiObedience ?? normalizeBrain(actor.brain ?? DEFAULT_BRAIN).base.obedience ?? 1;
}
const DEFAULT_BRAIN = {};
function shellArcFactor(sg, time) {
  const b = sg.breathe;
  if (!b) return 1;
  const period = Math.max(0.5, b.period);
  const t = time % period / period;
  const min = b.minFrac ?? 0.35;
  return min + (1 - min) * evalCurve(b.curve ?? "breath", t);
}
registerConvertRule("companionsFull", (caster, inst, world) => world.companionBondsOfSkill(caster, inst.def.id) >= world.companionCapOf(inst));
registerConvertRule("chargesEmpty", (caster, inst) => {
  const uc = instanceUseCharges(inst);
  return !!uc && uc.empower === void 0 && !uc.ventAll && caster.skillChargeBank(inst).count <= 0;
});
registerConvertRule("seatAway", (caster, _inst, world) => !!world.seatOf(caster)?.home);

  return {assaults: new Assaults(w), replenishment: new ReplenishmentClocks(), issueCommand, obedienceOf, assaultOrbitPositions, replenishShape, replenishmentActive, companionCueFlash, companionCueSpec, shellArcFactor,
    conversionIds: Object.freeze(Object.keys(conversions)), convertRuleHolds: (id, actor, inst) => conversions[id]?.(actor, inst, w) ?? false};
}
