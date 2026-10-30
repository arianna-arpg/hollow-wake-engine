import type { HitAftermathActor, HitAftermathInstance, HitAftermathSkill, HitAftermathPacket, HitAftermathSocket, HitAftermathFrame, HitAftermathPorts } from './hit-aftermath-types.js';
export type * from './hit-aftermath-types.js';
/** Complete remaining hit policy. Scalars retain their earlier captures; actor,
 * instance, definition and packet references remain borrowed. No shared hit scratch. */
export function createHitAftermath<A extends HitAftermathActor<A, I, P, M, Tag, Status>, I extends HitAftermathInstance<S>, S extends HitAftermathSkill<Tag>, P, Direction, M, Tag extends string, Status extends {
    id: string;
}, Socket extends HitAftermathSocket, Frame extends HitAftermathFrame<Tag>, Packet extends HitAftermathPacket<Tag>, Tone, Effect>(ports: HitAftermathPorts<A, I, S, P, Direction, M, Tag, Status, Socket, Frame, Packet, Tone, Effect>) {
    function apply(caster: A, inst: I, target: A, dmgMult: number, depth: number, hitEffects: Effect[] | undefined, def: S, extra: M[], packet: Packet, struckTone: Tone | null, afflictionCarry: number, hasDamage: boolean, dealt: number, wasCrit: boolean): void {
        if (hasDamage) {
            if (dealt > 0 && target.volatile && target.life > 0 && !target.dead
                && !target.untargetable && ports.time() >= target.volatileReadyAt
                && ports.chance(target.volatile.chance)) {
                const vdef = ports.skill(target.volatile.skillId);
                if (vdef) {
                    target.volatileReadyAt = ports.time() + (target.volatile.icd ?? 1.5);
                    target.volatileInst ??= ports.makeInstance(vdef, Math.max(1, Math.round(target.level)));
                    if (target.volatile.cue !== false)
                        ports.volatileCue(target, caster.pos, vdef.color);
                    ports.executeSkill(target, target.volatileInst, ports.copyPosition(caster), {
                        dmgMult: target.volatile.dmgMult ?? 1,
                        noCooldown: true, noRepeat: true, keepFacing: true,
                    });
                }
            }
            if (dealt > 0 && target.onHitByType && target.life > 0 && !target.dead
                && !target.untargetable && ports.time() >= target.onHitTypeReadyAt) {
                for (const [dtype, row] of Object.entries(target.onHitByType)) {
                    if (!row || !((packet.amounts as Record<string, number>)[dtype] > 0))
                        continue;
                    if (row.chance !== undefined && !ports.chance(row.chance))
                        continue;
                    target.onHitTypeReadyAt = ports.time() + (target.onHitTypeIcd ?? 0.8);
                    if (row.status)
                        target.applyStatus(row.status, 0, 1, 'element response');
                    if (row.skillId && ports.skill(row.skillId)) {
                        target.onHitTypeInsts ??= new Map();
                        let oi = target.onHitTypeInsts.get(row.skillId);
                        if (!oi) {
                            oi = ports.makeInstance(ports.skill(row.skillId)!, Math.max(1, Math.round(target.level)));
                            target.onHitTypeInsts.set(row.skillId, oi);
                        }
                        ports.executeSkill(target, oi, ports.copyPosition(target), {
                            dmgMult: row.dmgMult ?? 1,
                            noCooldown: true, noRepeat: true, keepFacing: true,
                        });
                    }
                    break; // one row per landed hit — the icd's clean unit
                }
            }
            ports.knockFixtures(caster, target, struckTone, dealt > 0, inst);
            {
                const cg = ports.contagion(inst);
                if (cg && dealt > 0 && !caster.dead) {
                    const chain = inst.state?.contagion;
                    const gen = chain?.gen ?? 0;
                    const lid = Math.min(ports.contagionConfig.maxGenerations, cg.maxGenerations ?? ports.contagionConfig.maxGenerations);
                    const sid = cg.skillId ?? inst.def.id;
                    if (gen < lid && ports.skill(sid)
                        && ports.time() >= target.contagionReadyAt
                        && !chain?.seen.has(target.id)
                        && ports.chance(cg.chance * Math.pow(cg.decay ?? ports.contagionConfig.decay, gen))) {
                        target.contagionReadyAt = ports.time() + ports.contagionConfig.actorIcd;
                        const seen = chain?.seen ?? new Set<number>();
                        seen.add(target.id);
                        const delay = cg.delay ?? ports.contagionConfig.delay;
                        ports.queueContagion({
                            when: ports.time() + delay, caster, skillId: sid,
                            level: ports.effectiveLevel(inst), host: target,
                            at: ports.copyPosition(target), gen: gen + 1, seen,
                            damageScale: cg.damageScale ?? 1,
                        });
                        // The honest telegraph: an edge ring for the whole delay.
                        ports.flash(ports.copyPosition(target), target.radius + 14, ports.skill(sid)!.color, delay, 0.9);
                    }
                }
            }
            if (dealt > 0 && depth === 0 && target.statuses.length) {
                const strain = ports.spreadOnHit(inst);
                if (strain && ports.chance(strain.chance)) {
                    const s = ports.pick(target.statuses);
                    let best: A | null = null;
                    let bd = strain.radius;
                    for (const e of ports.enemies(caster)) {
                        if (!ports.sameStory(e, target))
                            continue; // the spread reaches the victim's story (the sovereignty gate)
                        if (e === target || e.statuses.some(x => x.id === s.id))
                            continue;
                        const dd = ports.distance(target.pos, e.pos);
                        if (dd <= bd) {
                            bd = dd;
                            best = e;
                        }
                    }
                    if (best) {
                        ports.transplant(best, s, 'Carrier Strain', strain);
                    }
                }
            }
            if (dealt > 0 && depth === 0 && caster.hexToggles.size && !target.dead) {
                for (const hex of caster.hexToggles.values()) {
                    if (hex.inst === inst)
                        continue;
                    const coh = ports.curseOnHit(hex.inst);
                    if (!coh)
                        continue;
                    ports.resolveHit(caster, hex.inst, target, coh.damageScale ?? 0.3, depth + 1, true);
                }
            }
            ports.dischargeStatuses(caster, target, packet, dealt, depth);
            ports.plantAssault(caster, target, packet, depth, dealt);
            ports.plantImpale(caster, target, def, packet, extra, dealt, depth);
            if (dealt > 0 && depth === 0) {
                const echo = caster.sheet.get('echoMight', packet.tags, extra);
                if (echo > 0) {
                    caster.addBuff({
                        type: 'buff', id: 'echoing_might', duration: 4,
                        mods: [ports.flatPhysicalModifier(dealt * echo)],
                    });
                }
            }
            if (target.life <= 0 && !target.dead && depth === 0) {
                const dom = ports.dominate(inst);
                if (dom && target.defId && !target.isMinion() && ports.monster(target.defId)
                    && !ports.monster(target.defId)!.boss && ports.chance(dom.chance)) {
                    const key = '__dominate:' + inst.def.id;
                    if (ports.actors().filter(m => m.owner === caster && !m.dead
                        && m.sourceSkillId === key).length < dom.max) {
                        const thrall = ports.createMonster(target.defId, target.level, caster.team, caster);
                        thrall.sourceSkillId = key;
                        thrall.lifespan = dom.duration;
                        thrall.pos = ports.clampPoint(ports.copyPosition(target), thrall.radius);
                        ports.appendActor(thrall);
                        ports.companionBindCue(thrall, caster, def);
                        ports.companionArrivalCue(thrall, inst);
                    }
                }
            }
            if (target.gripping && dealt > 0 && caster.id !== target.gripping.id) {
                target.gripping.severed += dealt / target.maxLife();
            }
            ports.thorns(target, caster, dealt);
            if (target.ironWard && ports.time() < target.ironWard.until) {
                target.ironWard.stored = Math.min(target.ironWard.cap, target.ironWard.stored + dealt);
            }
            if (dealt > 0 && depth === 0) {
                const share = target.sheet.get('minionShare');
                if (share > 0) {
                    const pack = ports.actors().filter(m => m.owner === target && !m.dead && !m.construct && !m.untargetable);
                    if (pack.length) {
                        const moved = dealt * share;
                        target.life = Math.min(target.lifeCeiling(), target.life + moved);
                        const per = moved / pack.length;
                        for (const m of pack) {
                            m.life -= per;
                            m.hitFlash = 0.1;
                            m.hitFlashType = undefined; // shared wound, no blow — white
                            if (m.life <= 0 && !m.dead)
                                ports.kill(m);
                        }
                    }
                }
            }
            if (depth === 0) {
                for (const inst2 of target.skills) {
                    const rt = inst2?.def.retaliate;
                    if (!rt || (target.charges.get(rt.charge) ?? 0) < 1)
                        continue;
                    if (ports.minionsOfSkill(target, inst2!.def.id).length >= rt.max)
                        continue;
                    target.spendCharge(rt.charge, 1);
                    const hound = ports.createMonster(rt.monsterId, target.level, target.team, target);
                    hound.sourceSkillId = inst2!.def.id;
                    hound.lifespan = rt.duration;
                    hound.pos = ports.clampPoint(ports.scatterPosition(caster, 26), hound.radius);
                    ports.appendActor(hound);
                    ports.flash(ports.copyPosition(hound), 22, inst2!.def.color, 0.25);
                    break; // one shard per blow
                }
            }
        }
        if (dealt > 0) {
            {
                const kb = caster.sheet.get('knockback', packet.tags, extra);
                if (kb > 0) {
                    const auth = packet.tags.has('melee' as Tag) ? 1
                        : ports.deliveryKnock[inst.def.delivery.type] ?? ports.deliveryKnockDefault;
                    if (auth > 0) {
                        const ang = caster.sheet.get('knockBuffet', packet.tags, extra) > 0
                            ? ports.randomDirection() : ports.direction(caster.pos, target.pos);
                        ports.push(target, ang, kb * auth, caster, inst);
                    }
                }
            }
            const force = caster.sheet.get('displaceForce', packet.tags, extra);
            if (force !== 0) {
                const dir = force > 0 ? ports.direction(caster.pos, target.pos) : ports.direction(target.pos, caster.pos);
                ports.push(target, dir, Math.abs(force), caster, inst);
            }
        }
        if (def.currentLifeDamage && !target.invulnerable && target.life > 1) {
            const elem = (['lightning', 'fire', 'cold', 'chaos'] as const)
                .find(e => def.tags.includes(e as Tag)) ?? 'lightning';
            let amt = target.life * def.currentLifeDamage * target.sheet.get('damageTaken');
            amt *= 1 - ports.resistance(target, elem);
            amt = Math.min(amt, target.life - 1);
            if (amt > 0) {
                target.life -= amt;
                target.hitFlash = 0.15;
                target.hitFlashType = elem;
                ports.currentLifeDamageCue(target, amt);
            }
        }
        const hitStatusFrame = ports.prepareStatuses(caster, inst, target, def, extra, packet, dealt, depth, afflictionCarry);
        const { tags } = hitStatusFrame;
        ports.applyRiders(hitStatusFrame);
        ports.beforeEffects(caster, inst, target, dealt, depth);
        ports.dispatchEffects(hitStatusFrame, dmgMult, hitEffects);
        ports.applyGrantedStatuses(hitStatusFrame);
        if (dealt > 0 && depth === 0) {
            const splash = caster.sheet.get('splashRadius', tags, extra)
                * caster.sheet.get('aoeRadius', tags, extra);
            if (splash > 0) {
                for (const e of ports.enemies(caster)) {
                    if (!ports.sameStory(e, target))
                        continue; // (the sovereignty gate)
                    if (e === target || ports.distance(target.pos, e.pos) - e.radius > splash)
                        continue;
                    ports.resolveHit(caster, inst, e, dmgMult * 0.5, depth + 1);
                }
                ports.flash(ports.copyPosition(target), splash, def.color, 0.15);
                // THE MALLET: the splash detonation strikes the surfaces around
                // the struck body too — on the STRUCK body's story (a rim-duel hit
                // detonates where the victim stands, not where the archer does).
                ports.strikeSurfaces(caster, target.pos, splash, target.tier);
            }
        }
        if (dealt > 0 && depth === 0 && ports.orbCount() < ports.orbCap) {
            const rate = caster.sheet.get('orbShedRate', tags, extra);
            for (const id of ports.orbKeys()) {
                const c = ports.orbHitChance(caster, id, caster.sheet.get(ports.orbOnHitStat(id), tags, extra) * rate, ports.time());
                if (c > 0 && ports.chance(c)) {
                    ports.shedOrb(id, target.pos, { scatter: 18, tier: target.tier });
                }
            }
        }
        if (dealt > 0 && depth === 0 && ports.remnantCount() < 14) {
            const rc = caster.sheet.get('remnantChance', tags, extra);
            if (rc > 0 && ports.chance(Math.min(0.4, rc))) {
                const elements = (['fire', 'cold', 'lightning'] as const)
                    .filter(el => def.tags.includes(el as Tag)
                    || (packet.amounts[el] ?? 0) > 0);
                if (elements.length) {
                    ports.appendRemnant({
                        pos: ports.clampPoint(ports.scatterPosition(target, 16), 8),
                        element: ports.pick(elements),
                        bob: ports.randomPhase(), life: 14,
                    });
                }
            }
        }
        if (dealt > 0 && target.construct?.castOnStruck && !target.dead) {
            ports.ringBell(target);
        }
        const lethal = target.life <= 0 && !target.dead;
        if (lethal && dealt > 0 && !caster.dead) {
            const lk = caster.sheet.get('lifeOnKill', tags, extra);
            if (lk > 0)
                caster.healBy(lk);
            const mk = caster.sheet.get('manaOnKill', tags, extra);
            if (mk > 0)
                caster.mana = Math.min(caster.availableMaxMana(), caster.mana + mk);
            const ek = caster.sheet.get('esOnKill', tags, extra);
            if (ek > 0)
                caster.es = Math.min(caster.maxEs(), caster.es + ek);
        }
        if (dealt > 0 && depth === 0)
            ports.throngOnHit(caster, target, wasCrit, lethal);
        if (dealt > 0 && depth === 0 && caster.summonInst?.def.throng) {
            const splash = ports.throngSplash(caster.summonInst);
            if (splash && tags.has('attack' as Tag))
                ports.throngBurst(caster, target.pos, 36, splash, target);
        }
        if (dealt > 0 && depth === 0 && !caster.dead) {
            for (const s of ports.sockets(inst)) {
                const spec = ports.spawnSpec(s);
                if (!spec)
                    continue;
                let due = false;
                if (spec.every)
                    due = true;
                else if (spec.pct !== undefined)
                    due = ports.chance(spec.pct);
                else if (spec.hits !== undefined) {
                    s.gauge = (s.gauge ?? 0) + 1;
                    if (s.gauge >= spec.hits) {
                        s.gauge = 0;
                        due = true;
                    }
                }
                if (!due)
                    continue;
                ports.birth(caster, {
                    type: 'birth', monsterId: spec.monsterId,
                    count: [spec.count, spec.count], cap: spec.cap,
                    duration: ports.spawnDuration,
                }, ports.copyPosition(target), { host: true, capKey: `__vein:${inst.def.id}:${s.def.id}` });
            }
        }
        const elite = target.rarity === 'rare' || target.rarity === 'champion'
            || target.rarity === 'crowned'
            || !!(target.defId && ports.monster(target.defId)?.boss);
        ports.hitProcs(caster, inst, target, packet, dealt, depth, wasCrit, lethal, elite, tags, extra);
        if (dealt > 0 && caster.owner && !caster.owner.dead) {
            const owner = caster.owner;
            const carryInst = caster.summonInst
                ?? owner.skills.find(s => s?.def.id === caster.sourceSkillId) ?? null;
            if (carryInst && ports.carryProcs(owner, carryInst, target, packet, dealt, depth, wasCrit, lethal, elite, tags, extra)) {
                // THE COURT'S KILL TAPS: a minion's TRUE kill fires the on-kill
                // charge taps riding the SUMMONING instance — Victor's Tempo
                // socketed in the contract feeds the keeper's tempo off the
                // court's kills. Kills are exclusive events (one death,
                // court-size-blind), so no normalization; the owner's own caps
                // and decay govern the bank as ever.
                if (lethal) {
                    for (const spec of ports.chargeGains(carryInst)) {
                        if (spec.on !== 'kill')
                            continue;
                        if (spec.chance !== undefined && !ports.chance(spec.chance))
                            continue;
                        owner.gainCharge(spec.charge, spec.amount, spec.max, carryInst);
                    }
                    // THE COURT'S SHED CARRY (2026-07-21 R5): the court's true kills
                    // roll the KEEPER's kill-sheds through the summoning instance —
                    // orbs and remnants alike. Kills are exclusive events (one death,
                    // court-size-blind), so no normalization; caps and shed rates on
                    // the owner's sheet govern as ever.
                    ports.rollKillOrbs(owner, carryInst, target);
                    ports.rollKillRemnants(owner, carryInst, target.pos);
                }
            }
        }
        ports.assaultAfterHit(caster, target, dealt, depth, hasDamage);
        ports.assaultDoomCull(target);
        ports.challengeAfterHit(caster, inst, target, dealt, depth, dmgMult);
        ports.sequenceLanded(caster, inst, target, dealt, packet.amounts.physical ?? 0, depth);
        if (dealt > 0) {
            if (depth === 0)
                ports.companionOnHit(caster, inst, target);
            const spentContext = [...ports.contextTags(inst)];
            caster.spendBuffs('hit', spentContext, def.id);
            if (wasCrit)
                caster.spendBuffs('crit', spentContext, def.id);
            if (lethal) {
                caster.noteRecent('kill');
                caster.spendBuffs('kill', spentContext, def.id);
            }
            // THE STRIDE's spend (THE LEGEND FABRIC): a real blow that landed
            // while 'strided' held marks the walk spent — the reset lands at the
            // caster's next timer tick, so every contact of this frame's swing
            // read the same stride. Chained consequences (procs, echoes at
            // depth) never spend it: the stride pays the hand, not the echo.
            if (depth === 0 && caster.strideDist > 0 && !caster.strideSpent && caster.conditionHolds('strided')) {
                caster.strideSpent = true;
                ports.strideCue(caster);
            }
            target.spendBuffs('hurt');
        }
        if (target.life <= 0 && !target.dead) {
            // Kill-fed taps + fragment sheds ride the killing HIT: support-granted
            // remnantDrop stats live in the skill's extra mods and are only
            // visible from a skill-context query — this is that site. The victim
            // rides along so elite-gated kill taps (and gauge feeds) can read it.
            ports.killCharges(caster, target);
            ports.rollKillRemnants(caster, inst, target.pos);
            ports.rollKillOrbs(caster, inst, target);
            // CAST-ON-KILL trigger gems ride the killing hit (chain depth from
            // the slaying instance's stamp, aimed at where the victim fell).
            ports.rollTriggers(caster, 'kill', {
                depth: inst.state?.trigDepth ?? 0,
                aim: ports.copyPosition(target), sourceInst: inst,
            });
            ports.kill(target, false, caster);
        }
        if (dealt > 0 && depth === 0 && !inst.state?.trigDepth
            && !ports.instanceTrigger(inst) && packet.tags.has('attack' as Tag) && packet.tags.has('melee' as Tag)) {
            ports.rollTriggers(caster, 'meleeHit', {
                aim: ports.copyPosition(target), sourceInst: inst,
            });
        }
    }
    return { apply };
}
