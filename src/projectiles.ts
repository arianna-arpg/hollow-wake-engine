// Mechanically extracted creation, flight, contact and retirement policy.
import {dist,angleTo,angleDiff,inAoe,type CombatPoint} from './combat-geometry.js';
import {spinOffset,weaveOffset,erraticTurn,projFormTouches,projFormNose,frameReflect,speedLingerMul} from './projectile-math.js';
import {resolveSizeOver} from './combat-fields.js';import {parryCounter} from './parry-damage.js';
import type {DamageType} from './damage-pipeline-types.js';
import type {ProjectileDelivery} from './projectile-specs.js';
import type {CombatProjectile,InheritedFlight,ProjectileActor,ProjectileSkill,ProjectilePorts,ProjectileState,ProjectileRules,SegBody} from './projectile-types.js';
export type * from './projectile-types.js';
const vec=(x:number,y:number):CombatPoint=>({x,y});
export class Projectiles<A extends ProjectileActor<A,I>,I extends ProjectileSkill,B extends {onHit?:boolean}>{
private readonly flightScratch=vec(0,0);
constructor(readonly state:ProjectileState<A,I,B>,readonly rules:ProjectileRules,readonly ports:ProjectilePorts<A,I,B>){}
spawnProjectile(caster: A, inst: I, origin: CombatPoint, dir: number, opts?: {
    inherit?: InheritedFlight;
    depth?: number;
    mult?: number;
    flat?: Partial<Record<DamageType, number>>;
    dest?: CombatPoint;
    patrol?: CombatPoint[];
}): void {
const {ports:sdk,state,rules}=this;
const chance=(value:number)=>sdk.random()<value;

    const def = inst.def;
    const cosmeticPaint = sdk.cosmetic(caster, def.id);
    if (def.delivery.type !== 'projectile')
        return;
    const d: ProjectileDelivery = def.delivery;
    const tags = sdk.skillContextTags(def);
    const extra = sdk.instanceMods(inst);
    const depth = opts?.depth ?? 0;
    const inh = opts?.inherit;
    const speed = d.speed * caster.sheet.get('projectileSpeed', tags, extra);
    const size = caster.sheet.get('projectileSize', tags, extra);
    const maxAge = d.duration !== undefined
        ? d.duration * caster.sheet.get('effectDuration', tags, extra)
        : undefined;
    const t = d.trajectory;
    let auraAmounts: Partial<Record<DamageType, number>> | undefined;
    if (d.aura) {
        const aType: DamageType = d.aura.damageType ?? 'chaos';
        const aTags = sdk.skillContextTags(def, [aType]);
        auraAmounts = { [aType]: d.aura.dps * caster.sheet.get('damage', aTags, extra) };
        sdk.applyConversion(caster, auraAmounts, aTags, extra);
    }
    const homing = caster.sheet.get('homingPower', tags, extra, t?.homing ?? 0) + (inh?.homing ?? 0);
    const guide = caster.sheet.get('guidePower', tags, extra, t?.guide ?? 0);
    const erratic = caster.sheet.get('erraticPower', tags, extra, t?.erratic ?? 0) + (inh?.erratic ?? 0);
    const spiral = caster.sheet.get('spiralPower', tags, extra, t?.spiral ?? 0) + (inh?.spiral ?? 0);
    const orbit = caster.sheet.get('orbitPower', tags, extra, t?.orbit ?? 0) + (inh?.orbit ?? 0);
    const spin = caster.sheet.get('spinPower', tags, extra, t?.spin ?? 0) + (inh?.spin ?? 0);
    const weave = caster.sheet.get('weavePower', tags, extra, t?.weave ?? 0) + (inh?.weave ?? 0);
    const accel = caster.sheet.get('projAccel', tags, extra, t?.accel ?? 0);
    const pulse = caster.sheet.get('projPulse', tags, extra);
    const nativeReturn = d.returns === 'origin' ? 1 : d.returns === 'caster' ? 2 : 0;
    const grantedReturn = Math.round(caster.sheet.get('projReturn', tags, extra));
    state.projectiles.push({
        pos: vec(origin.x, origin.y),
        orbPaint: d.orbPaint,
        tier: caster.tier,
        dir, guideDir: dir,
        guided: spiral > 0 || orbit > 0 || spin > 0 || weave > 0,
        speed,
        radius: d.radius * size,
        pulse: pulse > 0 ? pulse : undefined,
        radius0: pulse > 0 ? d.radius * size : undefined,
        traveled: 0, range: maxAge !== undefined ? 1e9 : d.range, age: 0,
        maxAge,
        pierce: (d.pierce ?? 0) + Math.round(caster.sheet.get('pierceCount', tags, extra)),
        chains: Math.round(caster.sheet.get('chainCount', tags, extra)),
        hits: new Map(),
        caster, inst, color: cosmeticPaint.color ?? def.color,
        cosmeticMotif: cosmeticPaint.motif,
        cosmeticProjectile: cosmeticPaint.projectile,
        shape: d.shape ?? 'circle',
        mult: opts?.mult ?? 1,
        flat: opts?.flat,
        rehit: d.rehit,
        conductive: caster.sheet.get('conduction', tags, extra) > 0,
        forks: (d.forks ?? 0) + Math.round(caster.sheet.get('forkCount', tags, extra)),
        returnMode: nativeReturn > 0 ? nativeReturn : Math.min(2, Math.max(0, grantedReturn)),
        returnPasses: nativeReturn > 0 && grantedReturn > 0 ? 2 : 1,
        returnPhase: false,
        origin: vec(origin.x, origin.y),
        anchor: vec(origin.x, origin.y),
        angle: dir,
        orbRadius: orbit > 0 ? (t?.orbitRadius ?? inh?.orbitR0 ?? 50) : 0,
        accel: accel !== 0 ? accel : undefined,
        homing, guide, erratic, spiral, orbit, spin, weave,
        amp: t?.amplitude ?? inh?.amp ?? (weave > 0 ? 45 : 35),
        orbitR0: t?.orbitRadius ?? inh?.orbitR0 ?? 50,
        hitDetonate: caster.sheet.get('projHitDetonate', tags, extra) > 0,
        shrapnel: Math.round(caster.sheet.get('projShrapnel', tags, extra)),
        trailSpec: sdk.instanceTrail(inst),
        trailNext: sdk.instanceTrail(inst)?.every ?? Infinity,
        fisSpec: sdk.instanceFissureTrail(inst),
        fisNext: 0,
        auraAmounts,
        auraRadius: d.aura ? d.aura.radius * caster.sheet.get('aoeRadius', tags, extra) : undefined,
        auraTick: d.aura ? rules.auraTick : undefined,
        inheritFrac: Math.min(1, caster.sheet.get('projInherit', tags, extra)),
        reShatter: caster.sheet.get('projReShatter', tags, extra) > 0,
        depth,
        emit: d.emit && depth < rules.childDepthMax ? {
            inst: sdk.makeSkill(sdk.skill(d.emit.skillId)!, sdk.effectiveSkillLevel(inst)),
            interval: d.emit.interval, timer: d.emit.interval,
            angle: dir, pattern: d.emit.pattern ?? 'rotating',
        } : undefined,
        zig: t?.zigzag ? { timer: t.zigzag.interval, sign: chance(0.5) ? 1 : -1 } : undefined,
        bounces: opts?.patrol?.length ? undefined
            : Math.round(caster.sheet.get('projBounce', tags, extra, t?.bounce ?? 0)) || undefined,
        frameBounces: opts?.patrol?.length ? undefined
            : Math.round(caster.sheet.get('projFrameBounce', tags, extra, t?.frameBounce ?? 0)) || undefined,
        phase: sdk.skillOcclusion(caster, inst) === 'free' || undefined,
        caromLock: t?.caromOnHit,
        recurveChance: (() => {
            const rc = caster.sheet.get('projRecurve', tags, extra, t?.recurve?.chance ?? 0);
            return rc > 0 ? rc : undefined;
        })(),
        preyId: t?.selectivePierce
            ? (() => {
                let best: A | null = null, bd = 700;
                for (const e of sdk.enemiesOf(caster)) {
                    const dd = dist(origin, e.pos);
                    if (dd < bd) {
                        bd = dd;
                        best = e;
                    }
                }
                return best?.id;
            })()
            : undefined,
        destAt: t?.arcTo && (opts?.dest || caster.aimPos)
            ? vec((opts?.dest ?? caster.aimPos!).x, (opts?.dest ?? caster.aimPos!).y)
            : undefined,
        arcRate: t?.arcTo,
        patrol: opts?.patrol?.length ? { points: opts.patrol.map(p2 => vec(p2.x, p2.y)), idx: 0 } : undefined,
    });
}
inheritedFlight(p: CombatProjectile<A, I>, specInherit?: number): InheritedFlight | undefined {
    const frac = Math.min(1, p.inheritFrac + (specInherit ?? 0));
    if (frac <= 0)
        return undefined;
    return {
        homing: p.homing * frac, erratic: p.erratic * frac,
        spiral: p.spiral * frac, orbit: p.orbit * frac,
        spin: p.spin * frac, weave: p.weave * frac,
        amp: p.amp * frac, orbitR0: p.orbitR0 * frac,
    };
}
returnTarget(p: CombatProjectile<A, I>): CombatPoint {
    return p.returnMode === 2 && !p.caster.dead ? p.caster.pos : p.origin;
}
enterReturn(p: CombatProjectile<A, I>): boolean {
    if (p.returnMode <= 0 || p.returnPhase)
        return false;
    p.returnPhase = true;
    p.hits.clear();
    p.traveled = 0;
    p.range0 ??= p.range;
    p.range = 4000;
    return true;
}
forkProjectile(p: CombatProjectile<A, I>): void {
const {state}=this;

    for (const off of [-0.45, 0.45]) {
        const dir = p.dir + off;
        state.projectiles.push({
            ...p,
            pos: vec(p.pos.x, p.pos.y),
            dir, guideDir: dir, angle: dir,
            hits: new Map(p.hits),
            shattered: p.reShatter ? false : p.shattered,
            forks: p.forks - 1,
            traveled: 0,
            range: Math.max(200, p.range * 0.6),
            age: 0,
            anchor: vec(p.pos.x, p.pos.y),
            origin: vec(p.origin.x, p.origin.y),
            orbRadius: 0,
            emit: undefined,
            returnPhase: false,
        });
    }
}
guidePointOf(p: CombatProjectile<A, I>): CombatPoint | null {
    return p.caster.aimPos ?? p.caster.owner?.aimPos ?? null;
}
nearestProjTarget(p: CombatProjectile<A, I>): A | null {
const {ports:sdk}=this;

    if (p.preyId !== undefined) {
        const prey = sdk.actorById(p.preyId);
        return prey && !prey.dead ? prey : null;
    }
    let target: A | null = null, bestD = 500;
    for (const e of sdk.enemiesOf(p.caster)) {
        if (e.passive || (e.construct?.breakable !== undefined && e.owner === p.caster))
            continue;
        const until = p.hits.get(e.id);
        if (until !== undefined && p.age < until)
            continue;
        const dd = dist(p.pos, e.pos);
        if (dd < bestD) {
            bestD = dd;
            target = e;
        }
    }
    return target;
}
kinkProjectile(p: CombatProjectile<A, I>, zz: {
    angleDeg: number;
    shed?: number;
}): void {
const {ports:sdk,rules}=this;
const rand=(min:number,max:number)=>min+sdk.random()*(max-min);

    if (!p.zig)
        return;
    const abandoned = p.guideDir;
    p.guideDir += (zz.angleDeg * Math.PI / 180) * p.zig.sign;
    p.dir = p.guideDir;
    p.zig.sign *= -1;
    const shed = zz.shed ?? 0;
    if (shed > 0 && p.depth < rules.childDepthMax && sdk.skill(rules.shrapnelSkill)) {
        for (let i = 0; i < shed; i++) {
            this.spawnProjectile(p.caster, sdk.makeSkill(sdk.skill(rules.shrapnelSkill)!, sdk.effectiveSkillLevel(p.inst)), vec(p.pos.x, p.pos.y), abandoned + rand(-0.12, 0.12), { depth: p.depth + 1, mult: p.mult * 0.6 });
        }
    }
}
advanceProjectile(p: CombatProjectile<A, I>, dt: number): CombatPoint {
const {ports:sdk}=this;
const rand=(min:number,max:number)=>min+sdk.random()*(max-min);

    if (p.accel)
        p.speed = Math.max(40, p.speed * (1 + p.accel * dt));
    const step = p.speed * (p.stall ?? 1) * dt;
    p.stall = undefined;
    p.age += dt;
    p.traveled += step;
    if (p.pulse && p.radius0) {
        p.radius = p.radius0 * (1 + p.pulse * Math.sin(p.age * Math.PI * 2 / 0.7));
    }
    if (p.landAt) {
        p.dir = p.guideDir = angleTo(p.pos, p.landAt);
        return vec(p.pos.x + Math.cos(p.dir) * step, p.pos.y + Math.sin(p.dir) * step);
    }
    if (p.returnPhase) {
        p.dir = p.guideDir = angleTo(p.pos, this.returnTarget(p));
        return vec(p.pos.x + Math.cos(p.dir) * step, p.pos.y + Math.sin(p.dir) * step);
    }
    let gx: number, gy: number;
    const polar = p.orbit > 0 || p.spiral > 0;
    if (polar) {
        if (p.orbit > 0) {
            const orbitAnchor = p.orbitAnchorId !== undefined ? sdk.actorById(p.orbitAnchorId) : p.caster;
            if (orbitAnchor && !orbitAnchor.dead) {
                p.anchor.x = orbitAnchor.pos.x;
                p.anchor.y = orbitAnchor.pos.y;
            }
        }
        else {
            let want: CombatPoint | null = null;
            if (p.guide > 0)
                want = this.guidePointOf(p);
            if (!want && p.homing > 0)
                want = this.nearestProjTarget(p)?.pos ?? null;
            if (want) {
                const rate = Math.max(p.homing, p.guide);
                const drift = Math.min(rate * 24, p.speed * 0.5) * dt;
                const ang = angleTo(p.anchor, want);
                p.anchor.x += Math.cos(ang) * drift;
                p.anchor.y += Math.sin(ang) * drift;
            }
        }
        let angVel = p.orbit > 0 ? p.orbit * (p.speed / Math.max(30, p.orbRadius)) : p.spiral;
        if (p.erratic > 0)
            angVel += rand(-p.erratic, p.erratic) * 2.5;
        p.angle += angVel * dt;
        if (p.spiral > 0) {
            p.orbRadius += p.spiral * p.speed * 0.1 * dt;
        }
        else if (p.orbRadius < p.orbitR0) {
            p.orbRadius = Math.min(p.orbitR0, p.orbRadius + p.speed * 0.6 * dt);
        }
        if (p.erratic > 0)
            p.orbRadius = Math.max(0, p.orbRadius + rand(-p.erratic, p.erratic) * 10 * dt);
        gx = p.anchor.x + Math.cos(p.angle) * p.orbRadius;
        gy = p.anchor.y + Math.sin(p.angle) * p.orbRadius;
    }
    else {
        if (p.patrol) {
            const wp = p.patrol.points[p.patrol.idx];
            if (dist(p.pos, wp) < 20) {
                p.patrol.idx = (p.patrol.idx + 1) % p.patrol.points.length;
            }
            p.guideDir = angleTo(p.pos, p.patrol.points[p.patrol.idx]);
        }
        if (p.destAt && p.arcRate) {
            const want = angleTo(p.pos, p.destAt);
            const diff = angleDiff(p.guideDir, want);
            const rate = p.arcRate * (1 + p.age * 2.2);
            p.guideDir += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
        }
        if (p.zig) {
            const zz = (p.inst.def.delivery as ProjectileDelivery).trajectory?.zigzag;
            p.zig.timer -= dt;
            if (p.zig.timer <= 0 && zz) {
                p.zig.timer += zz.interval;
                this.kinkProjectile(p, zz);
            }
        }
        if (p.guide > 0) {
            const pt = this.guidePointOf(p);
            if (pt && dist(p.pos, pt) > 14) {
                const want = angleTo(p.pos, pt);
                const diff = angleDiff(p.guideDir, want);
                p.guideDir += Math.sign(diff) * Math.min(Math.abs(diff), p.guide * dt);
            }
        }
        if (p.homing > 0) {
            const target = this.nearestProjTarget(p);
            if (target) {
                const want = angleTo(p.pos, target.pos);
                const diff = angleDiff(p.guideDir, want);
                p.guideDir += Math.sign(diff) * Math.min(Math.abs(diff), p.homing * dt);
            }
        }
        if (p.erratic > 0)
            p.guideDir += erraticTurn(p.erratic, dt, sdk.random);
        p.anchor.x += Math.cos(p.guideDir) * step;
        p.anchor.y += Math.sin(p.guideDir) * step;
        gx = p.anchor.x;
        gy = p.anchor.y;
        if (!p.guided)
            p.dir = p.guideDir;
    }
    if (p.spin > 0) {
        spinOffset(p.spin, p.amp, p.age, this.flightScratch);
        gx += this.flightScratch.x;
        gy += this.flightScratch.y;
    }
    if (p.weave > 0) {
        const head = polar ? p.angle + Math.PI / 2 : p.guideDir;
        weaveOffset(p.weave, p.amp, p.age, head, this.flightScratch);
        gx += this.flightScratch.x;
        gy += this.flightScratch.y;
    }
    return vec(gx, gy);
}
explodeProjectile(p: CombatProjectile<A, I>, exceptId?: number): void {
const {ports:sdk}=this;

    const d = p.inst.def.delivery;
    if (d.type !== 'projectile' || !d.explode || p.dissolved)
        return;
    const tags = sdk.skillContextTags(p.inst.def);
    const extra = sdk.instanceMods(p.inst);
    const radius = d.explode.radius * p.caster.sheet.get('aoeRadius', tags, extra);
    const scale = d.explode.damageScale ?? 0.6;
    const bSigil = Math.round(p.caster.sheet.get('aoeShape', tags, extra));
    const bShape = bSigil === 1 || bSigil === 2 ? bSigil : 0;
    for (const e of sdk.enemiesOf(p.caster)) {
        if (e.id === exceptId)
            continue;
        if (e.tier !== (p.tier ?? 0))
            continue;
        if (bShape
            ? !inAoe(p.pos, radius, bShape, p.dir, e.pos, e.radius)
            : dist(p.pos, e.pos) - e.radius > radius)
            continue;
        if (p.parryDamage)
            sdk.resolveParryDamage(p.caster, e, p.parryDamage, scale, p.pos);
        else
            sdk.resolveHit(p.caster, p.inst, e, scale * p.mult, 1, undefined, false, false, undefined, p.origin, p.tier);
    }
    sdk.flash({
        pos: vec(p.pos.x, p.pos.y), radius, color: p.inst.def.color,
        life: 0.3, maxLife: 0.3,
        shape: bShape, facing: p.dir,
    });
}
projTouches(p: CombatProjectile<A, I>, cx: number, cy: number, cr: number): boolean {
    if ((p.inst.def.delivery as ProjectileDelivery).hitForm === 'circle') {
        const dx = cx - p.pos.x, dy = cy - p.pos.y;
        return dx * dx + dy * dy <= (p.radius + cr) * (p.radius + cr);
    }
    return projFormTouches(p.shape, p.pos.x, p.pos.y, p.dir, p.radius, p.age, cx, cy, cr);
}
projTouchesBody(p: CombatProjectile<A, I>, a: A): SegBody | null {
const {ports:sdk,rules}=this;

    if (this.projTouches(p, a.pos.x, a.pos.y, a.radius)) {
        return { pos: a.pos, r: a.radius, seg: rules.headSegment };
    }
    if (sdk.segsHittable(a)) {
        const segs = a.worm!.segments;
        for (let i = 0; i < segs.length; i++) {
            const r = sdk.segR(a, i);
            if (this.projTouches(p, segs[i].x, segs[i].y, r))
                return { pos: segs[i], r, seg: i };
        }
    }
    return null;
}
projNose(p: CombatProjectile<A, I>): number {
    if ((p.inst.def.delivery as ProjectileDelivery).hitForm === 'circle')
        return p.radius;
    return p.radius * projFormNose(p.shape);
}
shedFlightShrapnel(p: CombatProjectile<A, I>): boolean {
const {ports:sdk,rules}=this;

    if (p.caster.dead || p.depth >= rules.childDepthMax || !sdk.skill(rules.shrapnelSkill))
        return false;
    const shed = Math.round(p.caster.sheet.get('returnShrapnel', sdk.skillContextTags(p.inst.def), sdk.instanceMods(p.inst)));
    if (shed <= 0)
        return false;
    for (let s = 0; s < shed; s++) {
        this.spawnProjectile(p.caster, sdk.makeSkill(sdk.skill(rules.shrapnelSkill)!, sdk.effectiveSkillLevel(p.inst)), vec(p.pos.x, p.pos.y), (s / shed) * Math.PI * 2, { depth: p.depth + 1, mult: p.mult * 0.7 });
    }
    return true;
}
interceptProjectileDomes(p: CombatProjectile<A, I>): boolean {
const {ports:sdk}=this;

    for (const d of sdk.actors()) {
        const c = d.construct;
        if (!c || c.kind !== 'dome' || d.dead)
            continue;
        if (d.team === p.caster.team)
            continue;
        if (d.tier !== (p.tier ?? 0))
            continue;
        if (dist(p.pos, d.pos) > (c.domeRadius ?? 100))
            continue;
        if (c.domeMode === 'slow') {
            p.stall = Math.min(p.stall ?? 1, c.domeSlow ?? 0.35);
            continue;
        }
        sdk.flash({ pos: vec(p.pos.x, p.pos.y), radius: 14, color: d.color, life: 0.2, maxLife: 0.2 });
        if (c.domeMode === 'deflect') {
            p.dir += Math.PI;
            p.guideDir = p.dir;
            p.caster = d.owner ?? d;
            p.hits.clear();
            p.traveled = 0;
        }
        else {
            p.dissolved = true;
            return true;
        }
        break;
    }
    return false;
}
updateProjectiles(dt: number): void {
const {ports:sdk,state,rules}=this;
const rand=(min:number,max:number)=>min+sdk.random()*(max-min);
const chance=(value:number)=>sdk.random()<value;

    const guardianContext = sdk.guardiansActive() ? sdk.carriedEffectContext() : undefined;
    const flowDt = dt;
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const p = state.projectiles[i];
        const ptf = sdk.actorScale(p.caster);
        if (ptf <= 0)
            continue;
        const dt = ptf === 1 ? flowDt : flowDt * ptf;
        sdk.sequenceFlight(p);
        const prev = vec(p.pos.x, p.pos.y);
        p.pos = this.advanceProjectile(p, dt);
        if (p.guided && dist(prev, p.pos) > 0.5)
            p.dir = angleTo(prev, p.pos);
        if (p.frameBounces && p.frameBounces > 0
            && !(p.orbit > 0) && !(p.spiral > 0) && !p.returnPhase
            && !p.destAt && !p.patrol && !p.landAt) {
            const fw = frameReflect(p.pos.x, p.pos.y, p.guideDir, p.radius, sdk.viewRectFor(p.caster), rules.frameEdgePad);
            if (fw) {
                p.frameBounces--;
                p.pos.x = fw.x;
                p.pos.y = fw.y;
                p.guideDir = p.dir = fw.dir;
                p.anchor.x = fw.x;
                p.anchor.y = fw.y;
                p.traveled = 0;
                p.hits.clear();
                sdk.flash({
                    pos: vec(fw.x, fw.y), radius: p.radius + rules.frameFlashPad,
                    color: p.color, life: 0.18, maxLife: 0.18,
                });
            }
        }
        if (p.landAt && dist(p.pos, p.landAt) < 16) {
            const cspec = (p.inst.def.delivery as ProjectileDelivery).catchSpot;
            if (cspec && !p.caster.dead) {
                sdk.spawnConstruct(p.caster, p.inst, {
                    type: 'construct', kind: 'embed',
                    look: cspec.look ?? rules.catchSpotLook,
                    range: 0, duration: cspec.duration ?? 5, maxActive: 4,
                    invulnerable: true, placeRange: 9999,
                    embed: {
                        runOver: 'collect',
                        collect: { charge: cspec.charge, amount: cspec.amount, max: cspec.max },
                    },
                }, p.pos, undefined, vec(p.landAt.x, p.landAt.y));
            }
            p.dissolved = true;
            state.projectiles.splice(i, 1);
            continue;
        }
        const tethered = p.orbit > 0 || p.spiral > 0 || p.returnPhase;
        let dead = p.traveled >= p.range
            || (p.maxAge !== undefined && p.age >= p.maxAge)
            || (!tethered && !sdk.arena().boundless
                && (p.pos.x < 0 || p.pos.x > sdk.arena().w || p.pos.y < 0 || p.pos.y > sdk.arena().h));
        let diedOnBody = false;
        let shrapnelBloomed = false;
        if (dead && this.enterReturn(p))
            dead = false;
        if (!dead && p.returnPhase && dist(p.pos, this.returnTarget(p)) < 26) {
            if ((p.returnPasses ?? 1) > 1) {
                p.returnPasses = (p.returnPasses ?? 1) - 1;
                p.returnPhase = false;
                p.traveled = 0;
                p.range = p.range0 ?? p.range;
                p.origin = vec(p.pos.x, p.pos.y);
                p.hits.clear();
                sdk.flash({ pos: vec(p.pos.x, p.pos.y), radius: p.radius + 6, color: p.color, life: 0.18, maxLife: 0.18 });
            }
            else {
                const ct = (p.inst.def.delivery as ProjectileDelivery).catch;
                if (ct && !p.caster.dead) {
                    p.caster.gainCharge(ct.charge, ct.amount, ct.max, p.inst);
                    sdk.flash({
                        pos: vec(p.caster.pos.x, p.caster.pos.y), radius: p.caster.radius + 8,
                        color: p.color, life: 0.2, maxLife: 0.2,
                    });
                }
                if (this.shedFlightShrapnel(p))
                    shrapnelBloomed = true;
                dead = true;
            }
        }
        if (!dead && p.destAt && p.arcRate && dist(p.pos, p.destAt) < 16)
            dead = true;
        if (!dead && !p.phase) {
            for (const o of sdk.doodadsAt(p.pos.x, p.pos.y)) {
                if ((o.tier ?? 0) !== (p.tier ?? 0))
                    continue;
                const br = sdk.doodadRuleOf(o.kind).brittle;
                if (br && !o.gone && br.on.includes('hit')
                    && this.projTouches(p, o.pos.x, o.pos.y, o.radius)) {
                    sdk.popBrittle(o, p.caster ?? null, p.pos);
                }
                if (!sdk.blocksProjectiles(o))
                    continue;
                if (o.gone)
                    continue;
                if (sdk.shapeContains(sdk.hitSurfaceOf(o, 'shot'), o.pos.x, o.pos.y, p.pos.x, p.pos.y, this.projNose(p) + 1e-9)) {
                    sdk.flash({ pos: vec(p.pos.x, p.pos.y), radius: p.radius + 6, color: p.color, life: 0.18, maxLife: 0.18, fx: sdk.hitVoiceOf(p.conductElem ?? sdk.skillBaseTypeOf(p.inst.def.baseDamage), 'wall') });
                    if (p.bounces && p.bounces > 0) {
                        p.bounces--;
                        const surf = sdk.hitSurfaceOf(o, 'shot');
                        if (surf.kind === 'circle') {
                            const nx = Math.cos(angleTo(o.pos, p.pos)), ny = Math.sin(angleTo(o.pos, p.pos));
                            const dx = Math.cos(p.guideDir), dy = Math.sin(p.guideDir);
                            const dot2 = 2 * (dx * nx + dy * ny);
                            p.guideDir = p.dir = Math.atan2(dy - dot2 * ny, dx - dot2 * nx);
                            p.pos.x = o.pos.x + nx * (o.radius + p.radius + 2);
                            p.pos.y = o.pos.y + ny * (o.radius + p.radius + 2);
                        }
                        else {
                            const push = sdk.pushOutOfShape(surf, o.pos.x, o.pos.y, p.pos.x, p.pos.y, p.radius + 2);
                            if (push) {
                                const dx = Math.cos(p.guideDir), dy = Math.sin(p.guideDir);
                                const dot2 = 2 * (dx * push.nx + dy * push.ny);
                                p.guideDir = p.dir = Math.atan2(dy - dot2 * push.ny, dx - dot2 * push.nx);
                                p.pos.x = push.x;
                                p.pos.y = push.y;
                            }
                        }
                        p.anchor.x = p.pos.x;
                        p.anchor.y = p.pos.y;
                    }
                    else {
                        dead = true;
                        sdk.occluded('proj');
                    }
                    break;
                }
            }
        }
        if (!dead && !p.phase && sdk.shotGrid() !== undefined) {
            const sdx = p.pos.x - prev.x, sdy = p.pos.y - prev.y;
            const elev = sdk.shotElev(prev, p.tier ?? 0);
            const hitT = sdk.castGridRay(prev, p.pos, 'shot', elev);
            if (hitT !== null) {
                const sx = prev.x + sdx * hitT, sy = prev.y + sdy * hitT;
                sdk.flash({ pos: vec(sx, sy), radius: p.radius + 6, color: p.color, life: 0.18, maxLife: 0.18, fx: sdk.hitVoiceOf(p.conductElem ?? sdk.skillBaseTypeOf(p.inst.def.baseDamage), 'wall') });
                if (p.bounces && p.bounces > 0) {
                    p.bounces--;
                    const step = sdk.shotGrid()!.cellSize / 2;
                    const safeT = Math.max(0, hitT - 1 / Math.max(1, Math.ceil(Math.hypot(sdx, sdy) / step)));
                    const safe = vec(prev.x + sdx * safeT, prev.y + sdy * safeT);
                    const blockedX = sdk.castGridRay(safe, vec(safe.x + Math.sign(sdx) * step, safe.y), 'shot', elev) !== null;
                    const blockedY = sdk.castGridRay(safe, vec(safe.x, safe.y + Math.sign(sdy) * step), 'shot', elev) !== null;
                    const dx = Math.cos(p.guideDir), dy = Math.sin(p.guideDir);
                    p.guideDir = p.dir = Math.atan2(blockedY || !blockedX ? -dy : dy, blockedX || !blockedY ? -dx : dx);
                    p.pos.x = safe.x;
                    p.pos.y = safe.y;
                    p.anchor.x = safe.x;
                    p.anchor.y = safe.y;
                }
                else {
                    p.pos.x = sx;
                    p.pos.y = sy;
                    dead = true;
                    sdk.occluded('proj');
                }
            }
        }
        if (!dead && p.preyId !== undefined) {
            const prey = sdk.actorById(p.preyId);
            if (!prey || prey.dead) {
                let best: A | null = null, bd = 700;
                for (const e of sdk.enemiesOf(p.caster)) {
                    const dd = dist(p.pos, e.pos);
                    if (dd < bd) {
                        bd = dd;
                        best = e;
                    }
                }
                p.preyId = best?.id ?? -1;
            }
        }
        if (!dead && sdk.satellitesCount()) {
            const reflected = sdk.reflectSatellites(p.caster, p.tier ?? 0, prev, p.pos, p.radius, sdk.carriedEffectContext());
            if (reflected) {
                p.pos = reflected.at;
                sdk.reflectParriedProjectile(p, reflected.owner, reflected.power);
                sdk.flash({ pos: { ...p.pos }, radius: reflected.radius, color: reflected.color, life: 0.18, maxLife: 0.18 });
                if (p.dissolved)
                    state.projectiles.splice(i, 1);
                continue;
            }
        }
        if (!dead && guardianContext) {
            const caught = sdk.interceptGuardians(p.caster, p.tier ?? 0, prev, p.pos, p.radius, guardianContext);
            if (caught) {
                p.pos = caught;
                p.dissolved = true;
                dead = true;
            }
        }
        if (p.parryDamage) {
            let parryTurned = false;
            if (!dead)
                dead = this.interceptProjectileDomes(p);
            if (!dead) {
                for (const enemy of sdk.enemiesOf(p.caster)) {
                    if (p.age < (p.hits.get(enemy.id) ?? -Infinity))
                        continue;
                    const touch = this.projTouchesBody(p, enemy);
                    if (!touch)
                        continue;
                    const raw = Object.values(parryCounter(p.parryDamage).amounts).reduce((s, v) => s + (v ?? 0), 0);
                    const reflections = p.parryDamage.reflections;
                    if (sdk.tryGuardBlock(enemy, p.caster, p.pos, raw, p)) {
                        dead = p.parryDamage.reflections === reflections || !!p.dissolved;
                        parryTurned = !dead;
                        if (dead)
                            p.dissolved = true;
                        break;
                    }
                    p.hits.set(enemy.id, p.rehit ? p.age + p.rehit : Infinity);
                    p.lastHitId = enemy.id;
                    sdk.noteBodyHit(enemy, touch.seg);
                    sdk.resolveParryDamage(p.caster, enemy, p.parryDamage, 1, p.pos);
                    if (!p.rehit && --p.pierce < 0)
                        dead = true;
                    if (!dead && p.hitDetonate)
                        this.explodeProjectile(p, enemy.id);
                    break;
                }
            }
            if (!dead && !parryTurned && sdk.liteCount() && sdk.liteProjectileSweep(p, prev.x, prev.y))
                dead = true;
            if (dead) {
                this.explodeProjectile(p, p.lastHitId);
                state.projectiles.splice(i, 1);
            }
            continue;
        }
        if (!dead && p.trailSpec && p.traveled >= p.trailNext && !p.returnPhase) {
            p.trailNext += p.trailSpec.every;
            const ts = p.trailSpec;
            const tTags = sdk.skillContextTags(p.inst.def);
            const tExtra = sdk.instanceMods(p.inst);
            const aoeMul = p.caster.sheet.get('aoeRadius', tTags, tExtra);
            if (ts.blast) {
                const radius = ts.blast.radius * aoeMul;
                for (const e of sdk.enemiesOf(p.caster)) {
                    if (e.id === p.lastHitId)
                        continue;
                    if (dist(p.pos, e.pos) - e.radius > radius)
                        continue;
                    sdk.resolveHit(p.caster, p.inst, e, (ts.blast.damageScale ?? 0.35) * p.mult, 1, p.flat, false, false, undefined, p.origin, p.tier);
                }
                sdk.flash({ pos: vec(p.pos.x, p.pos.y), radius, color: p.color, life: 0.22, maxLife: 0.22 });
                sdk.frontSplash(p.caster, p.inst, p.pos, radius);
                sdk.strikeSurfaces(p.caster, p.pos, radius, undefined, undefined, p.tier ?? 0);
            }
            if (ts.zone) {
                const tso = resolveSizeOver(ts.zone.sizeOver);
                const tLinger = ts.zone.duration
                    * speedLingerMul(ts.zone.durationBySpeed, p.speed)
                    * p.caster.sheet.get('effectDuration', tTags, tExtra);
                state.zones.push({
                    pos: vec(p.pos.x, p.pos.y),
                    radius: ts.zone.radius * aoeMul * (tso?.from ?? 1),
                    caster: p.caster, inst: p.inst, color: p.color,
                    delay: 0, exploded: true,
                    linger: tLinger, linger0: tLinger,
                    tickInterval: ts.zone.tickInterval ?? 0.5, tickTimer: ts.zone.tickInterval ?? 0.5,
                    shape: 0, facing: p.dir,
                    dmgMult: (ts.zone.damageScale ?? 0.3) * p.mult, depth: 1,
                    forceDamage: true,
                    sizeOver: tso,
                    radius0: tso ? ts.zone.radius * aoeMul : undefined,
                    flatBonus: p.flat,
                });
            }
        }
        if (!dead && p.fisSpec && p.traveled >= (p.fisNext ?? 0) && !p.returnPhase) {
            const fs = p.fisSpec;
            p.fisNext = (p.fisNext ?? 0) + fs.radius * 1.1;
            (p.fisChain ??= []).push(vec(p.pos.x, p.pos.y));
            const fTags = sdk.skillContextTags(p.inst.def, sdk.grantedTags(p.inst));
            const fExtra = sdk.instanceMods(p.inst);
            const volatile = sdk.socketSpec(p.inst, 'fissureVolatile');
            const aftershock = sdk.socketSpec(p.inst, 'fissureAftershock');
            const roulette = sdk.socketSpec(p.inst, 'fissureRoulette');
            const baseLinger = (volatile || aftershock || roulette)
                ? Math.max(fs.linger, 5) : fs.linger;
            const linger = baseLinger * p.caster.sheet.get('effectDuration', fTags, fExtra);
            state.zones.push({
                pos: vec(p.pos.x, p.pos.y),
                radius: fs.radius * p.caster.sheet.get('aoeRadius', fTags, fExtra),
                caster: p.caster, inst: p.inst, color: p.color,
                delay: 0.05, exploded: false,
                linger,
                tickInterval: fs.tickInterval ?? 0.4, tickTimer: 0,
                shape: 0, facing: p.dir,
                dmgMult: (fs.damageScale ?? 0.7) * p.mult, depth: 1,
                volatile: volatile
                    ? { ...volatile, next: sdk.time() + 0.05 + volatile.interval } : undefined,
                aftershock: aftershock
                    ? { ...aftershock, readyAt: sdk.time() + 0.05 } : undefined,
                roulette: roulette
                    ? { ...roulette, next: sdk.time() + 0.05 + roulette.interval, armedUntil: 0 } : undefined,
                flatBonus: p.flat,
            });
        }
        if (!dead && p.auraAmounts && p.auraRadius) {
            p.auraTick = (p.auraTick ?? rules.auraTick) - dt;
            if (p.auraTick <= 0) {
                p.auraTick += rules.auraTick;
                for (const e of sdk.enemiesOf(p.caster)) {
                    if (dist(p.pos, e.pos) - e.radius > p.auraRadius)
                        continue;
                    const tick: Partial<Record<DamageType, number>> = {};
                    for (const [k, v] of Object.entries(p.auraAmounts)) {
                        tick[k as DamageType] = (v ?? 0) * rules.auraTick;
                    }
                    const taken = sdk.mitigateTyped(e, tick);
                    if (taken > 0) {
                        e.life -= taken;
                        e.hitFlash = 0.1;
                        e.hitFlashType = sdk.dominantTypeOf(tick);
                        sdk.accumulateDotText(e, taken, rules.auraTick);
                        if (e.life <= 0 && !e.dead)
                            sdk.kill(e, false, p.caster);
                    }
                }
            }
        }
        if (!dead && p.emit) {
            p.emit.timer -= dt;
            if (p.emit.timer <= 0) {
                p.emit.timer = p.emit.interval;
                const ang = p.emit.pattern === 'random' ? rand(0, Math.PI * 2)
                    : p.emit.pattern === 'forward' ? p.dir
                        : (p.emit.angle += 2.39996);
                const espec = (p.inst.def.delivery as ProjectileDelivery).emit;
                this.spawnProjectile(p.caster, p.emit.inst, p.pos, ang, { inherit: this.inheritedFlight(p, espec?.inherit), depth: p.depth + 1, mult: p.mult });
            }
        }
        if (!dead)
            dead = this.interceptProjectileDomes(p);
        if (!dead && !p.caster.construct) {
            for (const c of sdk.actors()) {
                if (c.dead || !c.construct?.castOnStruck || c.team !== p.caster.team)
                    continue;
                if (c.tier !== (p.tier ?? 0))
                    continue;
                const until = p.hits.get(c.id);
                if (until !== undefined && p.age < until)
                    continue;
                if (!this.projTouches(p, c.pos.x, c.pos.y, c.radius))
                    continue;
                p.hits.set(c.id, p.rehit ? p.age + p.rehit : Infinity);
                if (sdk.ringBell(c)) {
                    sdk.flash({ pos: vec(p.pos.x, p.pos.y), radius: 14, color: p.color, life: 0.15, maxLife: 0.15 });
                }
            }
        }
        if (!dead) {
            for (const enemy of sdk.enemiesOf(p.caster)) {
                const until = p.hits.get(enemy.id);
                if (until !== undefined && p.age < until)
                    continue;
                if (p.preyId !== undefined && enemy.id !== p.preyId)
                    continue;
                const bodyTouch = this.projTouchesBody(p, enemy);
                if (bodyTouch) {
                    const parryPacket = sdk.rollSkillDamage(p.caster, p.inst, p.flat);
                    const guardRaw = Object.values(parryPacket.amounts)
                        .reduce((s, v) => s + (v ?? 0), 0) * p.mult;
                    if (guardRaw > 0 && sdk.tryGuardBlock(enemy, p.caster, p.pos, guardRaw, p, parryPacket)) {
                        dead = !p.parryDamage || !!p.dissolved;
                        diedOnBody = true;
                        break;
                    }
                    p.hits.set(enemy.id, p.rehit ? p.age + p.rehit : Infinity);
                    p.lastHitId = enemy.id;
                    let condFlat: Partial<Record<DamageType, number>> | undefined;
                    if (p.conductElem) {
                        const amt = 5 + p.inst.level * 2;
                        condFlat = { [p.conductElem]: amt };
                        if (chance(0.35)) {
                            const STATUS_OF = { fire: 'burn', cold: 'chill', lightning: 'shock', chaos: 'poison' } as const;
                            enemy.applyStatus(STATUS_OF[p.conductElem], p.conductElem === 'fire' || p.conductElem === 'chaos' ? amt * 0.4 : 0, 1, 'conduction');
                        }
                    }
                    let hitFlat = condFlat;
                    if (p.flat) {
                        hitFlat = { ...p.flat };
                        if (condFlat) {
                            for (const [k, v] of Object.entries(condFlat)) {
                                hitFlat[k as DamageType] = (hitFlat[k as DamageType] ?? 0) + (v ?? 0);
                            }
                        }
                    }
                    sdk.noteBodyHit(enemy, bodyTouch.seg);
                    sdk.sequenceBeforeContact(p);
                    sdk.resolveHit(p.caster, p.inst, enemy, p.mult, 0, hitFlat, false, false, undefined, p.origin, p.tier);
                    sdk.flash({ pos: vec(p.pos.x, p.pos.y), radius: 14, color: p.color, life: 0.18, maxLife: 0.18, fx: sdk.hitVoiceOf(enemy.hitFlashType ?? p.conductElem ?? sdk.skillBaseTypeOf(p.inst.def.baseDamage), 'body') });
                    const shat = (p.inst.def.delivery as ProjectileDelivery).shatter;
                    const innate = shat && sdk.skill(shat.skillId) ? shat : undefined;
                    const shardCount = (innate?.count ?? 0) + p.shrapnel;
                    const shardSkill = sdk.skill(innate?.skillId ?? rules.shrapnelSkill);
                    if (shardCount > 0 && !p.shattered && shardSkill && p.depth < rules.childDepthMax) {
                        p.shattered = true;
                        const spread = (innate?.spreadDeg ?? 70) * Math.PI / 180;
                        const inherit = this.inheritedFlight(p, innate?.inherit);
                        for (let s = 0; s < shardCount; s++) {
                            const off = shardCount === 1 ? 0 : (s / (shardCount - 1) - 0.5) * spread;
                            this.spawnProjectile(p.caster, sdk.makeSkill(shardSkill!, sdk.effectiveSkillLevel(p.inst)), vec(p.pos.x, p.pos.y), p.dir + off, { inherit, depth: p.depth + 1, mult: p.mult });
                            state.projectiles[state.projectiles.length - 1].hits.set(enemy.id, Infinity);
                        }
                    }
                    if (sdk.sequenceContact(p, enemy)) {
                        dead = true;
                        diedOnBody = true;
                        break;
                    }
                    if (p.recurveChance && p.recurveChance > 0 && chance(p.recurveChance)) {
                        const rc = (p.inst.def.delivery as ProjectileDelivery).trajectory?.recurve;
                        p.recurveChance *= rc?.decay ?? 0.8;
                        p.hits.set(enemy.id, p.age + 0.3);
                        p.dir = p.guideDir = p.dir + Math.PI + rand(-0.5, 0.5);
                        p.traveled = 0;
                        if (p.hitDetonate)
                            this.explodeProjectile(p, enemy.id);
                        break;
                    }
                    if (p.caromLock !== undefined) {
                        p.hits.set(enemy.id, p.age + Math.max(0.2, p.caromLock));
                        p.dir = p.guideDir = angleTo(enemy.pos, p.pos) + rand(-0.9, 0.9);
                        p.traveled = 0;
                        if (p.hitDetonate)
                            this.explodeProjectile(p, enemy.id);
                        break;
                    }
                    {
                        const zz = (p.inst.def.delivery as ProjectileDelivery).trajectory?.zigzag;
                        if (p.zig && zz?.onHit)
                            this.kinkProjectile(p, zz);
                    }
                    {
                        const cspec = (p.inst.def.delivery as ProjectileDelivery).catchSpot;
                        if (cspec && !p.landAt && !p.caster.dead) {
                            const ang = rand(0, Math.PI * 2);
                            const r = rand(70, cspec.nearRadius ?? 115);
                            p.landAt = sdk.clampPos(vec(p.caster.pos.x + Math.cos(ang) * r, p.caster.pos.y + Math.sin(ang) * r), 12);
                            p.traveled = 0;
                            p.range = 1e9;
                            p.maxAge = undefined;
                            sdk.flash({
                                pos: vec(p.landAt.x, p.landAt.y), radius: 26, color: p.color,
                                life: 0.9, maxLife: 0.9, edgeFrac: 0.8,
                            });
                            if (p.hitDetonate)
                                this.explodeProjectile(p, enemy.id);
                            break;
                        }
                    }
                    if (p.rehit) {
                        if (p.hitDetonate)
                            this.explodeProjectile(p, enemy.id);
                        if (p.chains > 0) {
                            let next: A | null = null;
                            let bestD = 280;
                            for (const cand of sdk.enemiesOf(p.caster)) {
                                if (cand === enemy || cand.dead)
                                    continue;
                                const until = p.hits.get(cand.id);
                                if (until !== undefined && p.age < until)
                                    continue;
                                const dd = dist(p.pos, cand.pos);
                                if (dd >= bestD)
                                    continue;
                                if (!p.phase && !sdk.lineOfFire(p.pos, cand.pos, p.tier))
                                    continue;
                                bestD = dd;
                                next = cand;
                            }
                            if (next) {
                                p.chains--;
                                if (p.orbit > 0 || p.spiral > 0) {
                                    p.orbit = 0;
                                    p.spiral = 0;
                                    p.orbRadius = 0;
                                    p.orbitR0 = 0;
                                    p.anchor = vec(p.pos.x, p.pos.y);
                                    p.guided = p.spin > 0 || p.weave > 0;
                                }
                                p.dir = p.guideDir = angleTo(p.pos, next.pos);
                                p.traveled = 0;
                                if (p.reShatter)
                                    p.shattered = false;
                            }
                        }
                        else if (p.forks > 0) {
                            this.forkProjectile(p);
                            dead = true;
                            diedOnBody = true;
                        }
                        break;
                    }
                    if (p.pierce > 0) {
                        p.pierce--;
                        if (p.hitDetonate)
                            this.explodeProjectile(p, enemy.id);
                    }
                    else if (p.chains > 0) {
                        let next: A | null = null;
                        let bestD = 280;
                        for (const cand of sdk.enemiesOf(p.caster)) {
                            if (p.hits.has(cand.id))
                                continue;
                            const dd = dist(p.pos, cand.pos);
                            if (dd >= bestD)
                                continue;
                            if (!p.phase && !sdk.lineOfFire(p.pos, cand.pos, p.tier))
                                continue;
                            bestD = dd;
                            next = cand;
                        }
                        if (next) {
                            p.chains--;
                            p.dir = p.guideDir = angleTo(p.pos, next.pos);
                            p.traveled = 0;
                            if (p.reShatter)
                                p.shattered = false;
                            if (p.hitDetonate)
                                this.explodeProjectile(p, enemy.id);
                        }
                        else if (p.forks > 0 && !p.returnPhase) {
                            this.forkProjectile(p);
                            dead = true;
                        }
                        else if (this.enterReturn(p)) {
                        }
                        else {
                            dead = true;
                        }
                    }
                    else if (p.forks > 0 && !p.returnPhase) {
                        this.forkProjectile(p);
                        dead = true;
                    }
                    else if (this.enterReturn(p)) {
                    }
                    else {
                        dead = true;
                    }
                    if (dead)
                        diedOnBody = true;
                    break;
                }
            }
        }
        sdk.noteLightningTravel(p, prev);
        if (p.parryDamage) {
            if (dead)
                state.projectiles.splice(i, 1);
            continue;
        }
        if (!dead && sdk.liteCount() && sdk.liteProjectileSweep(p, prev.x, prev.y)) {
            dead = true;
            diedOnBody = true;
        }
        const zap = (p.inst.def.delivery as ProjectileDelivery).zap;
        if (!dead && zap) {
            p.zapTimer = (p.zapTimer ?? zap.interval) - dt;
            if (p.zapTimer <= 0) {
                p.zapTimer = zap.interval;
                let zapped = false;
                for (const e of sdk.enemiesOf(p.caster)) {
                    if (dist(p.pos, e.pos) - e.radius > zap.radius)
                        continue;
                    sdk.resolveHit(p.caster, p.inst, e, (zap.damageScale ?? 0.5) * p.mult, 1, undefined, false, false, undefined, p.origin, p.tier);
                    zapped = true;
                }
                if (zapped) {
                    sdk.flash({ pos: vec(p.pos.x, p.pos.y), radius: zap.radius, color: p.color, life: 0.15, maxLife: 0.15 });
                }
            }
        }
        if (!dead && !p.suffuse) {
            const suf = p.caster.sheet.get('suffusion', sdk.skillContextTags(p.inst.def), sdk.instanceMods(p.inst));
            if (suf > 0) {
                for (const z of state.zones) {
                    if (!z.exploded || z.linger <= 0 || z.caster.team !== p.caster.team || (z.tier ?? z.caster.tier) !== (p.tier ?? 0))
                        continue;
                    if (z.inst.def.id === p.inst.def.id)
                        continue;
                    if (dist(p.pos, z.pos) > z.radius + p.radius)
                        continue;
                    p.suffuse = {
                        inst: z.inst, radius: Math.max(30, z.radius * 0.75),
                        linger: Math.min(2.5, Math.max(0.8, z.linger)),
                        dmgMult: z.dmgMult * 0.6,
                    };
                    sdk.flash({ pos: vec(p.pos.x, p.pos.y), radius: p.radius + 8, color: z.color, life: 0.2, maxLife: 0.2 });
                    break;
                }
            }
        }
        if (!dead && p.conductive && !p.conductElem) {
            for (const z of state.zones) {
                if (!z.exploded || z.caster.team !== p.caster.team || (z.tier ?? z.caster.tier) !== (p.tier ?? 0))
                    continue;
                if (dist(p.pos, z.pos) > z.radius + p.radius)
                    continue;
                const elem = (['fire', 'cold', 'lightning'] as const)
                    .find(e => z.inst.def.tags.includes(e));
                if (elem) {
                    p.conductElem = elem;
                    break;
                }
            }
            if (!p.conductElem) {
                const ground = sdk.groundAt(p.pos);
                if (ground?.kind === 'bog' || ground?.kind === 'swamp')
                    p.conductElem = 'chaos';
                else if (ground?.kind === 'ice')
                    p.conductElem = 'cold';
            }
            if (p.conductElem) {
                sdk.flash({ pos: vec(p.pos.x, p.pos.y), radius: p.radius + 6, color: rules.elementColors[p.conductElem as DamageType] ?? '#9ec83a', life: 0.2, maxLife: 0.2 });
            }
        }
        if (dead) {
            this.explodeProjectile(p, p.lastHitId);
            if (!diedOnBody && !shrapnelBloomed && !p.dissolved) {
                this.shedFlightShrapnel(p);
            }
            if (p.suffuse && !p.dissolved) {
                state.zones.push({
                    pos: vec(p.pos.x, p.pos.y), radius: p.suffuse.radius,
                    caster: p.caster, inst: p.suffuse.inst, color: p.suffuse.inst.def.color,
                    delay: 0, exploded: true,
                    linger: p.suffuse.linger,
                    tickInterval: 0.4, tickTimer: 0,
                    shape: 0, facing: p.dir,
                    dmgMult: p.suffuse.dmgMult, depth: 1,
                });
            }
            {
                const ez = (p.inst.def.delivery as ProjectileDelivery).endZone;
                if (ez && !p.dissolved && !p.caster.dead) {
                    const zTags = sdk.skillContextTags(p.inst.def, sdk.grantedTags(p.inst));
                    const zExtra = sdk.instanceMods(p.inst);
                    const ezo = resolveSizeOver(ez.sizeOver);
                    const ezRadius = ez.radius * p.caster.sheet.get('aoeRadius', zTags, zExtra);
                    const ezLinger = ez.duration
                        * speedLingerMul(ez.durationBySpeed, p.speed)
                        * p.caster.sheet.get('effectDuration', zTags, zExtra);
                    state.zones.push({
                        pos: vec(p.pos.x, p.pos.y),
                        radius: ezRadius * (ezo?.from ?? 1),
                        caster: p.caster, inst: p.inst, color: p.color,
                        delay: 0, exploded: true,
                        linger: ezLinger, linger0: ezLinger,
                        tickInterval: ez.tickInterval ?? 0.5, tickTimer: 0,
                        shape: 0, facing: p.dir,
                        dmgMult: (ez.damageScale ?? 0.5) * p.mult, depth: 1,
                        seek: ez.seek ? { speed: ez.seek.speed, range: ez.seek.range ?? 420 } : undefined,
                        sizeOver: ezo,
                        radius0: ezo ? ezRadius : undefined,
                        flatBonus: p.flat,
                    });
                }
            }
            {
                const sq = sdk.instanceSequel(p.inst);
                const seqDepth = p.inst.state?.seqDepth ?? 0;
                if (sq && !p.dissolved && !p.caster.dead && sdk.skill(sq.skillId)
                    && seqDepth < rules.sequelMaxDepth
                    && (sq.on ?? 'any') !== (diedOnBody ? 'expire' : 'hit')
                    && chance(sq.chance ?? 1)) {
                    const sdef = sdk.skill(sq.skillId);
                    const minted = sdk.makeSkill(sdef!, sdk.effectiveSkillLevel(p.inst));
                    (minted.state ??= {}).seqDepth = seqDepth + 1;
                    sdk.executeSkill(p.caster, minted, vec(p.pos.x + Math.cos(p.dir) * 60, p.pos.y + Math.sin(p.dir) * 60), {
                        targetInfo: { pos: vec(p.pos.x, p.pos.y) },
                        dmgMult: (sq.damageScale ?? 1) * p.mult,
                        noCooldown: true, noRepeat: true, noFollowUp: true, keepFacing: true,
                    });
                }
            }
            const freclose = sdk.socketSpec(p.inst, 'fissureReclose');
            const fclose = p.fisSpec?.close
                ?? (freclose ? { delay: freclose.interval, damageScale: freclose.damageScale } : undefined);
            if (fclose && p.fisSpec && p.fisChain?.length && !p.caster.dead) {
                const fs = p.fisSpec;
                const fTags = sdk.skillContextTags(p.inst.def, sdk.grantedTags(p.inst));
                const fExtra = sdk.instanceMods(p.inst);
                const closeRadius = fs.radius * p.caster.sheet.get('aoeRadius', fTags, fExtra);
                const beat = (fs.radius * 1.1) / (Math.max(60, p.speed) * 1.4);
                const n = p.fisChain.length;
                let passes = 1;
                if (freclose) {
                    for (let k = 0; k < freclose.times && chance(freclose.chance); k++)
                        passes++;
                }
                for (let pass = 0; pass < passes; pass++) {
                    const start = fclose.delay + pass * (beat * n + (freclose?.interval ?? 0.8));
                    const scale = pass === 0 ? fclose.damageScale : freclose!.damageScale;
                    for (let k = 0; k < n; k++) {
                        const pt = p.fisChain[n - 1 - k];
                        state.zones.push({
                            pos: vec(pt.x, pt.y), radius: closeRadius,
                            caster: p.caster, inst: p.inst, color: p.color,
                            delay: start + beat * k, exploded: false,
                            linger: 0, tickInterval: 0.5, tickTimer: 0,
                            shape: 0, facing: p.dir,
                            dmgMult: scale * p.mult, depth: 1,
                            flatBonus: p.flat,
                        });
                    }
                }
            }
            if (!p.caster.dead) {
                for (const fx of sdk.instanceEffects(p.inst)) {
                    if (fx.type === 'litePour')
                        sdk.litePourAt(p.caster, fx, p.pos);
                    if (fx.type === 'lure') {
                        sdk.setLure(`skill#${p.caster.id}#${p.inst.def.id}`, p.pos, fx.radius, fx.pace ?? 0.5, fx.standoff ?? 90, fx.sec, p.tier ?? 0);
                    }
                    if (fx.type === 'spawnZone') {
                        const zTags = sdk.skillContextTags(p.inst.def, sdk.grantedTags(p.inst));
                        const zExtra = sdk.instanceMods(p.inst);
                        state.zones.push({
                            pos: vec(p.pos.x, p.pos.y),
                            radius: fx.radius * p.caster.sheet.get('aoeRadius', zTags, zExtra),
                            caster: p.caster, inst: p.inst, color: p.color,
                            delay: 0, exploded: true,
                            linger: fx.duration * p.caster.sheet.get('effectDuration', zTags, zExtra),
                            tickInterval: fx.tickInterval ?? 0.5, tickTimer: 0,
                            shape: p.caster.sheet.get('aoeShape', zTags, zExtra),
                            facing: p.dir,
                            dmgMult: (fx.damageScale ?? 0.5) * p.mult, depth: 1,
                        });
                    }
                }
                {
                    const fb = sdk.instanceBirth(p.inst);
                    if (fb && !fb.onHit && !p.dissolved)
                        sdk.birthAt(p.caster, p.inst, fb, p.pos);
                }
                const din = p.caster.sheet.get('noiseOnHit', sdk.skillContextTags(p.inst.def), sdk.instanceMods(p.inst));
                if (din > 0)
                    sdk.noiseAt(vec(p.pos.x, p.pos.y), din, p.caster);
            }
            const pd = p.inst.def.delivery;
            if (pd.type === 'projectile' && pd.plantOnLand && !p.caster.dead) {
                sdk.spawnConstruct(p.caster, p.inst, {
                    type: 'construct', kind: pd.plantOnLand.embed ? 'embed' : 'barrier',
                    range: 0, duration: pd.plantOnLand.duration,
                    maxActive: pd.plantOnLand.embed ? 8 : 6,
                    life: pd.plantOnLand.life ?? 25,
                    placeRange: 9999,
                    embed: pd.plantOnLand.embed,
                }, vec(p.pos.x, p.pos.y), undefined, vec(p.pos.x, p.pos.y));
            }
            state.projectiles.splice(i, 1);
        }
    }
}
}
