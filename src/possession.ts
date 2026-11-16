import type {PossessionActor,PossessionSkill,PossessionPoint,PossessionController,PossessionRules,PossessionPorts,PossessSpec,ShiftSpec,PossessRide,EjectReason} from './possession-types.js';
import type {Modifier} from './types.js';
export type * from './possession-types.js';
const vec=(x:number,y:number):PossessionPoint=>({x,y});
const mod=(stat:string,kind:Modifier['kind'],value:number):Modifier=>({stat,kind,value});
/** Transient controller/body ownership for possession and shapeshifting. The
 * host owns controller indices and body allocation; the SDK owns restoration,
 * interruption, expiry, cooldown and guest-skill rules. No account or save
 * coordinator participates. Ordered callbacks retain original prefix writes. */
export class Possessions<A extends PossessionActor<I>,I extends PossessionSkill,C extends PossessionController<A>>{
  constructor(readonly rules:PossessionRules,readonly ports:PossessionPorts<A,I,C>){}
structuralRefusal(target: A): string | null {
    if (target.construct)
        return 'nothing dwells in it';
    if (target.doorId !== undefined)
        return 'it is a door';
    if (target.partLink || target.partActors?.length || target.worm)
        return 'too vast to hold';
    if (target.companion)
        return 'the bond refuses';
    if (target.owner)
        return 'already another\'s creature';
    if (target.defId && this.ports.definition(target.defId)?.driven)
        return 'nothing dwells in it';
    return null;
}
refusal(target: A, spec: PossessSpec | undefined): string | null {
    if (target.possession)
        return 'already ridden';
    if (target.vacated)
        return 'that flesh is yours';
    const structural = this.structuralRefusal(target);
    if (structural)
        return structural;
    const def = target.defId ? this.ports.definition(target.defId) : undefined;
    const allow = def?.possessable;
    if (allow === false)
        return 'the will inside refuses';
    if (def && (def.bossBar ?? def.boss) && allow !== true)
        return 'the will inside refuses';
    if (allow === true)
        return null;
    if (def?.tags?.some(t => this.rules.denyTags.includes(t)))
        return 'the will inside refuses';
    const tier = this.rules.policy[target.rarity ?? 'normal'] ?? 1;
    if (tier <= 0)
        return 'the will inside refuses';
    const frac = (spec?.lifeFrac ?? this.rules.lifeFrac) * tier;
    const maxLife = target.maxLife();
    if (maxLife > 0 && target.life / maxLife > frac)
        return 'not weakened enough';
    return null;
}
riderRefusal(target: A): string | null {
    if (target.possession)
        return 'already ridden';
    if (target.vacated)
        return 'a seat holds it';
    const structural = this.structuralRefusal(target);
    if (structural)
        return structural;
    const def = target.defId ? this.ports.definition(target.defId) : undefined;
    const allow = def?.possessable;
    if (allow === false)
        return 'the will inside refuses';
    if (def && (def.bossBar ?? def.boss) && allow !== true)
        return 'the will inside refuses';
    if (allow === true)
        return null;
    if (def?.tags?.some(t => this.rules.denyTags.includes(t)))
        return 'the will inside refuses';
    return null;
}
powerFactor(spec: {
    powerFactor?: number;
} | undefined, kind: 'possess' | 'shift', statBonus = 0): number {
    const base = spec?.powerFactor
        ?? (kind === 'shift' ? this.rules.shiftPowerFactor : this.rules.powerFactor);
    return Math.max(0.1, base + statBonus);
}
embody(seat: C, body: A, ride: PossessRide, powerFactor: number, huskGuard: number, gemInst: I): void {
    const hero = seat.actor;
    hero.casting = null;
    body.casting = null;
    body.aiTargetId = undefined;
    hero.vacated = { seatId: seat.id };
    seat.home = hero;
    body.possession = ride;
    body.team = 'player';
    body.kind = 'player';
    seat.actor = body;
    this.ports.reindex();
    if (powerFactor !== 1) {
        body.sheet.setSource('possessed', [mod('damage', 'more', powerFactor - 1)]);
    }
    ride.guestSlot = body.skills.length;
    ride.gemId = gemInst.def.id;
    body.skills.push(gemInst);
    if (ride.huskMode === 'stands') {
        hero.applyStatus('entranced', 0, 1, 'Possession');
        if (huskGuard > 0) {
            hero.sheet.setSource('vacated', [mod('damageTaken', 'more', -huskGuard)]);
        }
    }
    else {
        const i = this.ports.actors().indexOf(hero);
        if (i >= 0)
            this.ports.actors().splice(i, 1);
    }
    this.ports.changed(seat);
    this.ports.embodied( { seat: seat.id, body, hero, kind: ride.kind });
}
eject(seat: C, reason: EjectReason): void {
    const hero = seat.home;
    if (!hero)
        return;
    const body = seat.actor;
    const hiveForm = body.hiveForm;
    const ride = body.possession;
    seat.home = undefined;
    seat.actor = hero;
    hero.vacated = undefined;
    this.ports.reindex();
    if (ride?.huskMode === 'carried') {
        hero.pos = this.ports.clamp(vec(body.pos.x, body.pos.y), hero.radius);
        if (!this.ports.actors().includes(hero))
            this.ports.actors().push(hero);
    }
    for (let i = hero.statuses.length - 1; i >= 0; i--) {
        if (hero.statuses[i].id !== 'entranced')
            continue;
        hero.statuses.splice(i, 1);
        hero.sheet.removeSource('status:entranced');
    }
    hero.sheet.removeSource('vacated');
    if (ride) {
        body.possession = undefined;
        body.team = ride.prevTeam;
        body.kind = ride.prevKind;
        body.sheet.removeSource('possessed');
        if (ride.guestSlot >= 0 && body.skills[ride.guestSlot]?.def.id === ride.gemId) {
            body.skills.splice(ride.guestSlot, 1);
        }
        if (ride.mintedForm) {
            if (!body.dead && reason !== 'bodyDied') {
                body.dead = true;
                this.ports.flash({
                    pos: vec(body.pos.x, body.pos.y), radius: body.radius + 10,
                    color: body.color, life: 0.35, maxLife: 0.35,
                });
            }
        }
        else if (!body.dead && (reason === 'press' || reason === 'duration' || reason === 'travel')) {
            const stunBase = this.ports.status('stun')?.duration ?? 1;
            if (this.rules.eject.bodyStun > 0) {
                body.applyStatus('stun', 0, this.rules.eject.bodyStun / stunBase, 'Relinquished');
            }
        }
        if (this.rules.eject.cooldown > 0 && ride.gemId) {
            const cd = Math.max(hero.cooldowns.get(ride.gemId) ?? 0, this.rules.eject.cooldown);
            hero.cooldowns.set(ride.gemId, cd);
            hero.cooldownTotals.set(ride.gemId, Math.max(hero.cooldownTotals.get(ride.gemId) ?? 0, cd));
        }
    }
    if (reason === 'bodyDied' && this.rules.eject.selfStun > 0 && !hero.dead) {
        const stunBase = this.ports.status('stun')?.duration ?? 1;
        hero.applyStatus('stun', 0, this.rules.eject.selfStun / stunBase, 'Backlash');
    }
    if (!hero.dead && reason !== 'travel') {
        this.ports.text(vec(hero.pos.x, hero.pos.y - hero.radius - 12), reason === 'huskPain' ? 'the pain calls you home'
            : reason === 'huskSeized' ? 'torn back to your flesh'
                : reason === 'bodyDied' ? 'the body fails you'
                    : 'you return to yourself', '#b8a8e8', 12);
    }
    this.ports.changed(seat);
    if (hiveForm)
        this.ports.returnSwarmForm(body, reason);
    this.ports.ejected( { seat: seat.id, body, hero, reason });
}
seize(caster: A, inst: I, target: A, spec: PossessSpec | undefined): void {
    const seat = this.ports.controllerFor(caster);
    if (!seat || seat.home)
        return;
    if (target.team !== 'enemy' || target.dead)
        return;
    const why = this.refusal(target, spec);
    if (why) {
        this.ports.fail(caster, inst.def.id + ':possess', why);
        return;
    }
    const tags = this.ports.tags(inst, this.ports.grantedTags(inst));
    const extra = this.ports.modifiers(inst);
    const durMul = caster.sheet.get('possessDuration', tags, extra);
    const powBonus = caster.sheet.get('possessPower', tags, extra);
    const guard = caster.sheet.get('huskGuard', tags, extra);
    const duration = (spec?.duration ?? this.rules.duration) * durMul;
    const ride: PossessRide = {
        seatId: seat.id, kind: 'possess',
        prevTeam: target.team, prevKind: target.kind,
        guiseFaction: (spec?.guise ?? true) ? target.faction : undefined,
        guiseBroken: false,
        until: this.ports.time() + Math.max(1, duration),
        huskLifeAt: caster.life,
        huskLostFrac: spec?.huskLostFrac ?? this.rules.endOn.huskLostFrac,
        huskMode: spec?.husk ?? 'stands',
        guestSlot: -1, gemId: inst.def.id,
    };
    this.embody(seat, target, ride, this.powerFactor(spec, 'possess', powBonus), guard, inst);
    this.ports.flash({
        pos: vec(target.pos.x, target.pos.y), radius: target.radius + 14,
        color: '#b8a8e8', life: 0.35, maxLife: 0.35,
    });
}
shift(caster: A, inst: I, shift: ShiftSpec): void {
    const seat = this.ports.controllerFor(caster);
    if (!seat || seat.home)
        return;
    const def = this.ports.definition(shift.form);
    if (!def)
        return;
    const form = this.ports.createBody(shift.form, caster.level, 'player');
    form.noBounty = true;
    form.pos = this.ports.clamp(vec(caster.pos.x, caster.pos.y), form.radius);
    this.ports.actors().push(form);
    const tags = this.ports.tags(inst, this.ports.grantedTags(inst));
    const extra = this.ports.modifiers(inst);
    const powBonus = caster.sheet.get('possessPower', tags, extra);
    const durMul = caster.sheet.get('possessDuration', tags, extra);
    const ride: PossessRide = {
        seatId: seat.id, kind: 'shift',
        prevTeam: 'player', prevKind: form.kind,
        until: shift.duration ? this.ports.time() + shift.duration * durMul : undefined,
        huskLifeAt: caster.life,
        huskLostFrac: 0,
        huskMode: 'carried',
        guestSlot: -1, gemId: inst.def.id,
        mintedForm: true,
    };
    this.embody(seat, form, ride, this.powerFactor(shift, 'shift', powBonus), 0, inst);
    this.ports.text(vec(form.pos.x, form.pos.y - form.radius - 12), def.name + '!', '#b8d8a8', 14);
    this.ports.flash({
        pos: vec(form.pos.x, form.pos.y), radius: form.radius + 14,
        color: '#b8d8a8', life: 0.35, maxLife: 0.35,
    });
}
advance(dt: number): void {
    void dt;
    for (const seat of this.ports.controllers()) {
        const hero = seat.home;
        if (!hero)
            continue;
        const body = seat.actor;
        const ride = body.possession;
        if (!ride) {
            this.eject(seat, 'released');
            continue;
        }
        if (body.dead) {
            this.eject(seat, 'released');
            continue;
        }
        if (ride.huskMode === 'stands') {
            hero.applyStatus('entranced', 0, 1, 'Possession');
            if (ride.huskLostFrac > 0
                && hero.life <= ride.huskLifeAt - hero.maxLife() * ride.huskLostFrac) {
                this.eject(seat, 'huskPain');
                continue;
            }
            if (this.rules.endOn.huskSeized && hero.heldBy !== undefined) {
                this.eject(seat, 'huskSeized');
                continue;
            }
        }
        else {
            hero.pos.x = body.pos.x;
            hero.pos.y = body.pos.y;
        }
        if (ride.until !== undefined && this.ports.time() >= ride.until) {
            this.eject(seat, 'duration');
        }
    }
}
}
