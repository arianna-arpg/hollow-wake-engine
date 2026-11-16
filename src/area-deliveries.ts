// Mechanically extracted delivery rules; regenerate only into an absent file.
import {dist,angleTo,angleDiff,inAoe,bandSwingGeo,AOE_SHAPE,type CombatPoint} from './combat-geometry.js';
import type {AreaActor,AreaSkill,AreaSpecs,AreaFrame,AreaDeliveryPorts,AreaBody,AreaProjectile} from './area-delivery-types.js';
export type * from './area-delivery-types.js';
const vec=(x:number,y:number):CombatPoint=>({x,y});
const sameStory=(a:{tier?:number},b:{tier?:number})=>(a.tier??0)===(b.tier??0);
export class AreaDeliveries<A extends AreaActor<A>,I extends AreaSkill,F>{
constructor(readonly ports:AreaDeliveryPorts<A,I,F>){}
melee(frame:AreaFrame<A,I,F,AreaSpecs['melee']>):CombatPoint|null{
const sdk=this.ports,{caster,inst,d,tags,extra,useMult,flatBonus,aoeScale,arcScale,cosmeticColor}=frame;let fieldAt:CombatPoint|null=null;
const sweeping = caster.sheet.get('meleeSweep', tags, extra) > 0;
const reach = (caster.radius + d.range)
    * caster.sheet.get('meleeReach', tags, extra);
const arcRad = Math.min(Math.PI * 2, (d.arcDeg * Math.PI / 180) * Math.sqrt(aoeScale) * arcScale);
const swingShape = caster.sheet.get('aoeShape', tags, extra, AOE_SHAPE[d.shape ?? 'circle']);
const banded = swingShape === AOE_SHAPE.band;
const bandGeo = banded ? bandSwingGeo(reach, arcRad) : null;
const bandC = bandGeo
    ? vec(caster.pos.x + Math.cos(caster.facing) * bandGeo.standoff, caster.pos.y + Math.sin(caster.facing) * bandGeo.standoff)
    : caster.pos;
const struck = new Set<number>();
const assaultLockedTarget = sdk.assaultLocked(caster, inst);
if (assaultLockedTarget) {
    struck.add(assaultLockedTarget.id);
    sdk.resolveHit(caster, inst, assaultLockedTarget, useMult, 0, flatBonus);
    sdk.flash({ pos: { ...assaultLockedTarget.pos }, radius: 18, color: cosmeticColor, life: 0.18, maxLife: 0.18 });
}
let sweepR = 0, sweepArc = 0;
if (sweeping) {
    sweepR = Math.min(140, Math.max(70, (caster.radius + d.range) * 1.35));
    sweepArc = (d.arcDeg * Math.PI / 180) * Math.sqrt(aoeScale) * arcScale;
    const speed = 480 * caster.sheet.get('sweepSpeed', tags, extra);
    const travel = 210 * caster.sheet.get('sweepRange', tags, extra)
        * Math.min(2, caster.sheet.get('effectDuration', tags, extra));
    sdk.zone({
        pos: vec(caster.pos.x, caster.pos.y), radius: sweepR,
        caster, inst, color: cosmeticColor,
        delay: 0, exploded: true,
        linger: travel / speed,
        tickInterval: 0, tickTimer: 0,
        shape: AOE_SHAPE.crescent, facing: caster.facing,
        dmgMult: useMult, depth: 0,
        drift: speed, arcRad: sweepArc,
        struck,
        flatBonus,
    });
    sdk.flash({
        pos: vec(caster.pos.x, caster.pos.y), radius: sweepR * 0.6, color: cosmeticColor,
        life: 0.2, maxLife: 0.2, arc: { facing: caster.facing, arcRad: sweepArc }, fx: d.fx ?? sdk.skillStrikeVoice(inst.def.id),
    });
    fieldAt = vec(caster.pos.x, caster.pos.y);
}
else {
    sdk.releaseStruckSummons(caster, inst, body => {
        if (banded)
            return inAoe(bandC, bandGeo!.halfWidth, AOE_SHAPE.band, caster.facing, body.pos, body.radius);
        if (swingShape >= 1 && swingShape <= 2)
            return inAoe(caster.pos, reach, swingShape, caster.facing, body.pos, body.radius);
        return dist(caster.pos, body.pos) - body.radius <= reach
            && Math.abs(angleDiff(caster.facing, angleTo(caster.pos, body.pos))) <= arcRad / 2;
    });
    for (const enemy of sdk.enemiesOf(caster)) {
        if (!sameStory(caster, enemy))
            continue;
        if (struck.has(enemy.id))
            continue;
        const nb = sdk.nearestBody(enemy, caster.pos);
        if (banded) {
            if (!inAoe(bandC, bandGeo!.halfWidth, AOE_SHAPE.band, caster.facing, nb.pos, nb.r))
                continue;
        }
        else if (swingShape >= 1 && swingShape <= 2) {
            if (!inAoe(caster.pos, reach, swingShape, caster.facing, nb.pos, nb.r))
                continue;
        }
        else {
            if (dist(caster.pos, nb.pos) - nb.r > reach)
                continue;
            if (Math.abs(angleDiff(caster.facing, angleTo(caster.pos, nb.pos))) > arcRad / 2)
                continue;
        }
        struck.add(enemy.id);
        sdk.noteBodyHit(enemy, nb.seg);
        sdk.resolveHit(caster, inst, enemy, useMult, 0, flatBonus);
    }
}
const reverb = Math.round(caster.sheet.get('meleeReverb', tags, extra));
for (let r = 0; r < reverb; r++) {
    let next: A | null = null, bd = reach + 140;
    for (const e of sdk.enemiesOf(caster)) {
        if (struck.has(e.id))
            continue;
        const dd = dist(caster.pos, e.pos);
        if (dd < bd) {
            bd = dd;
            next = e;
        }
    }
    if (!next)
        break;
    struck.add(next.id);
    sdk.resolveHit(caster, inst, next, useMult, 0, flatBonus);
    sdk.flash({ pos: vec(next.pos.x, next.pos.y), radius: 18, color: cosmeticColor, life: 0.15, maxLife: 0.15 });
}
if (!sweeping) {
    sdk.flash(banded
        ? {
            pos: vec(bandC.x, bandC.y), radius: bandGeo!.halfWidth, color: cosmeticColor,
            life: 0.18, maxLife: 0.18, shape: AOE_SHAPE.band, facing: caster.facing, fx: d.fx ?? sdk.skillStrikeVoice(inst.def.id),
        }
        : swingShape >= 1 && swingShape <= 2
            ? {
                pos: vec(caster.pos.x, caster.pos.y), radius: reach, color: cosmeticColor,
                life: 0.18, maxLife: 0.18, shape: swingShape, facing: caster.facing, fx: d.fx ?? sdk.skillStrikeVoice(inst.def.id),
            }
            : {
                pos: vec(caster.pos.x, caster.pos.y), radius: reach, color: cosmeticColor,
                life: 0.18, maxLife: 0.18, arc: { facing: caster.facing, arcRad }, fx: d.fx ?? sdk.skillStrikeVoice(inst.def.id),
            });
    fieldAt = banded ? vec(bandC.x, bandC.y)
        : swingShape === 1
            ? vec(caster.pos.x, caster.pos.y)
            : vec(caster.pos.x + Math.cos(caster.facing) * reach * 0.6, caster.pos.y + Math.sin(caster.facing) * reach * 0.6);
}
sdk.mintAftermath(caster, inst, banded && !sweeping ? vec(bandC.x, bandC.y) : vec(caster.pos.x, caster.pos.y), sweeping ? sweepR : banded ? bandGeo!.halfWidth : reach, sweeping ? AOE_SHAPE.crescent
    : banded ? AOE_SHAPE.band
        : swingShape >= 1 && swingShape <= 2 ? swingShape : AOE_SHAPE.sector, caster.facing, useMult, tags, extra, sweeping ? sweepArc
    : banded || (swingShape >= 1 && swingShape <= 2) ? undefined : arcRad);
if (!sweeping) {
    sdk.healAlliesInArea(caster, inst, a => banded
        ? inAoe(bandC, bandGeo!.halfWidth, AOE_SHAPE.band, caster.facing, a.pos, a.radius)
        : dist(caster.pos, a.pos) - a.radius <= reach
            && Math.abs(angleDiff(caster.facing, angleTo(caster.pos, a.pos))) <= arcRad / 2, useMult);
    sdk.frontSplash(caster, inst, caster.pos, reach);
    sdk.strikeSurfaces(caster, banded ? bandC : caster.pos, banded ? bandGeo!.halfWidth : reach, (p, r) => banded
        ? inAoe(bandC, bandGeo!.halfWidth, AOE_SHAPE.band, caster.facing, p, r)
        : dist(caster.pos, p) - r <= reach
            && Math.abs(angleDiff(caster.facing, angleTo(caster.pos, p))) <= arcRad / 2, undefined, undefined, sdk.skillContextTags(inst).has('aoe'));
}
return fieldAt;
}
cone(frame:AreaFrame<A,I,F,AreaSpecs['cone']>):CombatPoint|null{
const sdk=this.ports,{caster,inst,d,tags,extra,useMult,flatBonus,aoeScale,arcScale,cosmeticColor}=frame;let fieldAt:CombatPoint|null=null;
const range = d.range * aoeScale
    * caster.sheet.get('meleeReach', tags, extra);
const arcRad = Math.min(Math.PI * 2, (d.arcDeg * Math.PI / 180) * arcScale);
const coneSigil = Math.round(caster.sheet.get('aoeShape', tags, extra));
const sigiled = coneSigil === 1 || coneSigil === 2;
const sigilC = coneSigil === 2
    ? vec(caster.pos.x + Math.cos(caster.facing) * range / 3, caster.pos.y + Math.sin(caster.facing) * range / 3)
    : vec(caster.pos.x + Math.cos(caster.facing) * range / 2, caster.pos.y + Math.sin(caster.facing) * range / 2);
const sigilR = coneSigil === 2 ? range * (8 / 15) : range / 2;
const sigilF = caster.facing;
const phase = sdk.skillOcclusion(caster, inst) === 'free';
for (const enemy of sdk.enemiesOf(caster)) {
    const nb = sdk.nearestBody(enemy, caster.pos);
    if (sigiled) {
        if (!inAoe(sigilC, sigilR, coneSigil, sigilF, nb.pos, nb.r))
            continue;
    }
    else {
        const dd = dist(caster.pos, nb.pos);
        if (dd - nb.r > range)
            continue;
        if (d.edgeOnly && dd + nb.r < range * d.edgeOnly)
            continue;
        if (Math.abs(angleDiff(caster.facing, angleTo(caster.pos, nb.pos))) > arcRad / 2)
            continue;
    }
    if (!phase && !sdk.lineOfFire(caster.pos, nb.pos, caster.tier))
        continue;
    sdk.noteBodyHit(enemy, nb.seg);
    sdk.resolveHit(caster, inst, enemy, useMult, 0, flatBonus);
}
if (d.beamFx && !sigiled) {
    const beamLen = phase ? range : dist(caster.pos, sdk.clipShot(caster.pos, vec(caster.pos.x + Math.cos(caster.facing) * range, caster.pos.y + Math.sin(caster.facing) * range), caster.tier));
    sdk.flash({
        pos: vec(caster.pos.x, caster.pos.y), radius: beamLen, color: cosmeticColor,
        life: 0.22, maxLife: 0.22, beam: true, facing: caster.facing,
        fx: sdk.skillBeamVoice(inst.def.id), arc: { facing: caster.facing, arcRad },
    });
}
else if (sigiled) {
    sdk.flash({
        pos: vec(sigilC.x, sigilC.y), radius: sigilR, color: cosmeticColor,
        life: 0.25, maxLife: 0.25, shape: coneSigil, facing: sigilF, fx: sdk.skillStrikeVoice(inst.def.id),
    });
}
else {
    sdk.flash({
        pos: vec(caster.pos.x, caster.pos.y), radius: range, color: cosmeticColor,
        life: 0.25, maxLife: 0.25, arc: { facing: caster.facing, arcRad },
        edgeFrac: d.edgeOnly, fx: sdk.skillStrikeVoice(inst.def.id),
    });
}
fieldAt = sigiled && coneSigil === 2
    ? vec(caster.pos.x + Math.cos(caster.facing) * range * 0.33, caster.pos.y + Math.sin(caster.facing) * range * 0.33)
    : vec(caster.pos.x + Math.cos(caster.facing) * range * 0.55, caster.pos.y + Math.sin(caster.facing) * range * 0.55);
sdk.healAlliesInArea(caster, inst, a => {
    if (sigiled)
        return inAoe(sigilC, sigilR, coneSigil, sigilF, a.pos, a.radius);
    const dd = dist(caster.pos, a.pos);
    return dd - a.radius <= range
        && !(d.edgeOnly && dd + a.radius < range * d.edgeOnly)
        && Math.abs(angleDiff(caster.facing, angleTo(caster.pos, a.pos))) <= arcRad / 2;
}, useMult);
sdk.frontSplash(caster, inst, caster.pos, range);
sdk.strikeSurfaces(caster, caster.pos, range, (p, r) => {
    if (sigiled) {
        return inAoe(sigilC, sigilR, coneSigil, sigilF, p, r)
            && (phase || sdk.lineOfFire(caster.pos, p, caster.tier));
    }
    const dd = dist(caster.pos, p);
    return dd - r <= range
        && !(d.edgeOnly && dd + r < range * d.edgeOnly)
        && Math.abs(angleDiff(caster.facing, angleTo(caster.pos, p))) <= arcRad / 2
        && (phase || sdk.lineOfFire(caster.pos, p, caster.tier));
});
sdk.mintAftermath(caster, inst, sigiled ? sigilC : vec(caster.pos.x, caster.pos.y), sigiled ? sigilR : range, sigiled ? coneSigil : AOE_SHAPE.sector, sigiled ? sigilF : caster.facing, useMult, tags, extra, sigiled ? undefined : arcRad, sigiled ? undefined : d.edgeOnly, caster.facing);
return fieldAt;
}
nova(frame:AreaFrame<A,I,F,AreaSpecs['nova']>):CombatPoint|null{
const sdk=this.ports,{caster,inst,d,origin,tags,extra,useMult,flatBonus,aoeScale,cosmeticColor}=frame;let fieldAt:CombatPoint|null=null;
const radius = d.radius * aoeScale;
const shape = caster.sheet.get('aoeShape', tags, extra);
const phase = sdk.skillOcclusion(caster, inst) === 'free';
let pool = d.affects === 'all'
    ? sdk.actors().filter(a => !a.dead && !a.untargetable)
    : d.affects === 'allies'
        ? sdk.actors().filter(a => !a.dead && a.team === caster.team)
        : sdk.enemiesOf(caster);
if (d.spareCaster)
    pool = pool.filter(a => a !== caster && a.partLink?.root !== caster);
pool = pool.filter(v => sameStory(v, caster));
const novaBody = (v: A): AreaBody | null => sdk.inAoeBody(origin, radius, shape, caster.facing, v, undefined, (bp, br) => !(d.edgeOnly && dist(origin, bp) + br < radius * d.edgeOnly)
    && (phase || v === caster || sdk.lineOfFire(origin, bp, caster.tier)));
if (d.maxTargets !== undefined) {
    pool = pool
        .filter(v => novaBody(v) !== null)
        .sort((a, b) => dist(origin, a.pos) - dist(origin, b.pos))
        .slice(0, Math.max(1, d.maxTargets));
}
for (const victim of pool) {
    if (d.requiresStatus
        && !victim.statuses.some(s => d.requiresStatus!.includes(s.id)))
        continue;
    const nb = novaBody(victim);
    if (!nb)
        continue;
    sdk.noteBodyHit(victim, nb.seg);
    sdk.resolveHit(caster, inst, victim, useMult, 0, flatBonus);
    if (d.lanceFx) {
        sdk.flash({
            pos: vec(origin.x, origin.y),
            radius: dist(origin, nb.pos) + nb.r,
            color: cosmeticColor, life: 0.22, maxLife: 0.22,
            beam: true, facing: angleTo(origin, nb.pos),
        });
    }
}
sdk.flash({
    pos: vec(origin.x, origin.y), radius, color: cosmeticColor,
    life: 0.3, maxLife: 0.3, shape, facing: caster.facing,
    edgeFrac: d.edgeOnly,
    fx: d.fx ?? sdk.skillBurstVoice(inst.def.id),
});
sdk.spawnAftershocks(caster, inst, origin, radius, shape);
sdk.mintAftermath(caster, inst, origin, radius, shape, caster.facing, useMult, tags, extra, undefined, d.edgeOnly);
fieldAt = vec(origin.x, origin.y);
if (d.affects === undefined) {
    sdk.healAlliesInArea(caster, inst, a => inAoe(origin, radius, shape, caster.facing, a.pos, a.radius)
        && !(d.edgeOnly && dist(origin, a.pos) + a.radius < radius * d.edgeOnly), useMult);
    sdk.frontSplash(caster, inst, origin, radius);
    sdk.strikeSurfaces(caster, origin, radius, (p, r) => inAoe(origin, radius, shape, caster.facing, p, r)
        && !(d.edgeOnly && dist(origin, p) + r < radius * d.edgeOnly)
        && (phase || sdk.lineOfFire(origin, p, caster.tier)));
}
return fieldAt;
}
detonateProjectile(frame:AreaFrame<A,I,F,AreaSpecs['detonateProjectile']>):CombatPoint|null{
const sdk=this.ports,{caster,inst,d,aim,tags,extra,useMult,flatBonus,aoeScale,cosmeticColor}=frame;let fieldAt:CombatPoint|null=null;
const def=inst.def;
let best: AreaProjectile<A, I> | null = null;
let bd = Infinity;
for (const pr of sdk.projectiles()) {
    if (pr.caster !== caster)
        continue;
    if (d.requireTag && !pr.inst.def.tags.includes(d.requireTag))
        continue;
    const dd = dist(pr.pos, aim);
    if (dd < bd) {
        bd = dd;
        best = pr;
    }
}
const at = best ? vec(best.pos.x, best.pos.y) : vec(caster.pos.x, caster.pos.y);
if (best)
    sdk.projectiles().splice(sdk.projectiles().indexOf(best), 1);
const mult = (best ? (d.consumeBonus ?? 1.5) : 1) * useMult;
const radius = d.radius * aoeScale;
const shape = caster.sheet.get('aoeShape', tags, extra);
for (const victim of sdk.enemiesOf(caster)) {
    if (!inAoe(at, radius, shape, caster.facing, victim.pos, victim.radius))
        continue;
    sdk.resolveHit(caster, inst, victim, mult, 0, flatBonus);
}
sdk.frontSplash(caster, inst, at, radius);
sdk.strikeSurfaces(caster, at, radius, (p, r) => inAoe(at, radius, shape, caster.facing, p, r));
sdk.flash({
    pos: at, radius, color: cosmeticColor,
    life: 0.35, maxLife: 0.35, shape, facing: caster.facing,
    fx: sdk.skillSelfVoice(def.id, 'burst'), recoveryCueTier: caster.tier,
});
sdk.spawnAftershocks(caster, inst, at, radius, shape);
sdk.mintAftermath(caster, inst, at, radius, shape, caster.facing, useMult, tags, extra);
fieldAt = at;
return fieldAt;
}
}
