// Mechanically extracted carried combat controllers; see the source manifest.
import {pointSegDist} from './segment-geometry.js';import type {CombatPoint as Vec2} from './combat-geometry.js';
import type {SatelliteDef,SatelliteEmission,AuroraDef,GuardianDef,CreeperDef,SatelliteFlightVisual,SatelliteVisual,AuroraVisual,GuardianVisual,CreeperVisual} from './carried-effect-content.js';
import type {CarriedActor,CarriedRules,CarriedEffects,CarriedEffectContext as EffectContext} from './carried-effects-types.js';
export type * from './carried-effects-types.js';
export function createCarriedEffects<A extends CarriedActor<A>,I>(rules:CarriedRules):CarriedEffects<A,I>{
type Actor=A;type SkillInstance=I;type SkillTag=string;type CarriedEffectContext=EffectContext<A,I>;
const carriedAllegiance=(a:A):string=>`${a.team}:${a.faction}:${a.owner?.id ?? ''}`;
const SATELLITES=rules.satellites.definitions,SATELLITE_IDS=rules.satellites.ids,SATELLITE_CFG=rules.satellites.config;
const satelliteCountStat = (id: string): string => `satelliteCount_${id}`;
const AURORAS=rules.auroras.definitions,AURORA_IDS=rules.auroras.ids,AURORA_CFG=rules.auroras.config;
const auroraCapacityStat = (id: string): string => `auroraCapacity_${id}`;
const GUARDIANS=rules.guardians.definitions,GUARDIAN_IDS=rules.guardians.ids,GUARDIAN_CFG=rules.guardians.config;
const guardianCountStat = (id: string): string => `guardianCount_${id}`;
const CREEPERS=rules.creepers.definitions,CREEPER_IDS=rules.creepers.ids,CREEPER_CFG=rules.creepers.config;
const creeperCountStat = (id: string): string => `creeperCount_${id}`;
interface Flight {
    caster: Actor;
    def: SatelliteDef;
    spec: Extract<SatelliteEmission, {
        mode: 'lob';
    }>;
    inst: SkillInstance;
    slot: number;
    generation: number;
    from: Vec2;
    to: Vec2;
    radius: number;
    tier: number;
    allegiance: string;
    age: number;
    fresh: boolean;
    impacted: boolean;
}
class SatelliteFlights {
    visuals: SatelliteFlightVisual[] = [];
    private pending: Flight[] = [];
    clear(): void { this.pending = []; this.visuals = []; }
    retire(a: Actor): void {
        this.pending = this.pending.filter(f => f.caster !== a);
        this.visuals = this.visuals.filter(f => f.owner !== a.id);
    }
    launch(caster: Actor, def: SatelliteDef, inst: SkillInstance, slot: number, generation: number, from: Vec2, to: Vec2, radius: number): void {
        if (def.emit?.mode !== 'lob' || radius <= 0 || !Number.isFinite(radius)
            || this.pending.filter(f => f.caster === caster).length >= SATELLITE_CFG.maxFlightsPerActor)
            return;
        this.pending.push({ caster, def, spec: def.emit, inst, slot, generation, from: { ...from }, to: { ...to },
            radius, tier: caster.tier, allegiance: carriedAllegiance(caster), age: 0, fresh: true, impacted: false });
    }
    update(dt: number, ctx: CarriedEffectContext, live: (a: Actor, id: string, slot: number, generation: number) => boolean): void {
        const valid = (f: Flight) => live(f.caster, f.def.id, f.slot, f.generation)
            && !f.caster.dead && !f.caster.downed && ctx.active(f.caster)
            && f.caster.tier === f.tier && carriedAllegiance(f.caster) === f.allegiance;
        const visuals: SatelliteFlightVisual[] = [];
        for (const f of [...this.pending]) {
            if (!valid(f))
                continue;
            const spec = f.spec;
            if (f.fresh)
                f.fresh = false;
            else
                f.age += Math.max(0, Math.min(SATELLITE_CFG.maxFrame, dt));
            if (!f.impacted && f.age + 1e-9 >= spec.flight) {
                f.impacted = true;
                if (ctx.clear(f.from, f.to, f.tier)) {
                    for (const e of ctx.enemies(f.caster, f.radius, f.to)) {
                        if (!valid(f))
                            break;
                        if (e.dead || e.downed || e.untargetable || e.tier !== f.tier || !ctx.hostile(f.caster, e)
                            || Math.hypot(e.pos.x - f.to.x, e.pos.y - f.to.y) > f.radius + e.radius
                            || !ctx.clear(f.to, e.pos, f.tier))
                            continue;
                        ctx.hit(f.caster, f.inst, e);
                    }
                }
            }
            if (!valid(f) || f.age >= spec.flight + spec.flash)
                continue;
            visuals.push({ owner: f.caster.id, family: f.def.id, slot: f.slot, tier: f.tier,
                from: { ...f.from }, to: { ...f.to }, radius: f.radius, arc: spec.arc,
                phase: f.impacted ? 'impact' : 'flight',
                progress: f.impacted ? Math.min(1, (f.age - spec.flight) / spec.flash) : Math.min(1, f.age / spec.flight) });
        }
        this.pending = this.pending.filter(f => valid(f) && f.age < f.spec.flight + f.spec.flash);
        this.visuals = visuals.filter(v => this.pending.some(f => f.caster.id === v.owner && f.def.id === v.family && f.slot === v.slot));
    }
}
interface OrbitState {
    def: SatelliteDef;
    count: number;
    angle: number;
    age: number;
    center: Vec2;
    tier: number;
    allegiance: string;
    radius: number;
    inst: SkillInstance;
    level: number;
    hits: Map<number, number>[];
    nextShot: number[];
    generation: number;
    aims: ({
        at: Vec2;
        age: number;
        target: Actor;
    } | undefined)[];
}
const gap = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
const satellitestau = Math.PI * 2;
const satellitesalive = (a: Actor): boolean => !a.dead && !a.downed;
const allegiance = carriedAllegiance;
class Satellites {
    visuals: SatelliteVisual[] = [];
    readonly flights = new SatelliteFlights();
    private states = new Map<Actor, Map<string, OrbitState>>();
    reflectProjectiles(caster: Actor, tier: number, from: Vec2, to: Vec2, radius: number, ctx: CarriedEffectContext): {
        owner: Actor;
        power: number;
        at: Vec2;
        color: string;
        radius: number;
    } | undefined {
        let nearest: {
            owner: Actor;
            power: number;
            at: Vec2;
            along: number;
            color: string;
            radius: number;
        } | undefined;
        const dx = to.x - from.x, dy = to.y - from.y, len2 = dx * dx + dy * dy;
        for (const v of this.visuals) {
            const power = SATELLITES[v.family]?.projectileReflect;
            if (!power || !v.armed || v.blocked || v.tier !== tier)
                continue;
            const owner = [...this.states.keys()].find(a => a.id === v.owner);
            if (!owner || !satellitesalive(owner) || !ctx.active(owner) || !ctx.hostile(owner, caster)
                || owner.sheet.get(satelliteCountStat(v.family)) <= 0)
                continue;
            const along = len2 > 0 ? Math.max(0, Math.min(1, ((v.x - from.x) * dx + (v.y - from.y) * dy) / len2)) : 0;
            const at = { x: from.x + along * dx, y: from.y + along * dy };
            if (gap(at, v) > radius + v.radius || !ctx.clear(from, at, tier) || !ctx.clear(owner.pos, at, tier))
                continue;
            if (!nearest || along < nearest.along)
                nearest = { owner, power, at, along, color: SATELLITES[v.family].color, radius: v.radius };
        }
        return nearest;
    }
    clear(): void { this.states.clear(); this.visuals = []; this.flights.clear(); }
    retire(a: Actor): void {
        this.states.delete(a);
        this.flights.retire(a);
        this.visuals = this.visuals.filter(v => v.owner !== a.id);
    }
    update(actors: readonly Actor[], dt: number, ctx: CarriedEffectContext): void {
        const present = new Set(actors);
        const byId = new Map(actors.map(a => [a.id, a]));
        for (const a of this.states.keys())
            if (!present.has(a) || !satellitesalive(a) || !ctx.active(a))
                this.retire(a);
        const visuals: SatelliteVisual[] = [];
        for (const a of actors) {
            if (!satellitesalive(a) || !ctx.active(a))
                continue;
            const grants = a.sheet.armedFamily('satelliteCount_', SATELLITE_IDS);
            let families = this.states.get(a);
            if (!grants.length) {
                if (families)
                    this.retire(a);
                continue;
            }
            if (!families)
                this.states.set(a, families = new Map());
            const kept = new Set<string>();
            let budget = SATELLITE_CFG.maxPerActor;
            const stepDt = Math.max(0, Math.min(SATELLITE_CFG.maxFrame, ctx.elapsed(a, dt)));
            for (const id of grants) {
                const def = SATELLITES[id];
                if (!def || !satellitesalive(a) || !ctx.active(a))
                    continue;
                const tags = new Set(def.tags);
                const granted = a.sheet.get(satelliteCountStat(id), tags);
                const count = granted > 0 ? Math.min(budget, Math.floor(granted + a.sheet.get('satelliteCount', tags))) : 0;
                if (!Number.isFinite(count) || count <= 0)
                    continue;
                budget -= count;
                kept.add(id);
                const radius = a.radius + def.orbit * a.sheet.get('satelliteOrbit', tags);
                let state = families.get(id);
                const inst = !def.sourcePayload && state?.level === a.level && state.def === def ? state.inst : ctx.instance(a, def.skill);
                if (!inst)
                    continue;
                if (!state) {
                    state = { def, count, angle: (a.id * 2.399963229728653) % satellitestau, age: 0,
                        center: { ...a.pos }, tier: a.tier, allegiance: allegiance(a), radius, inst, level: a.level,
                        hits: Array.from({ length: count }, () => new Map()), generation: 0, aims: [],
                        nextShot: Array.from({ length: count }, (_, i) => def.armTime + i * (def.emit?.interval ?? 0) / count) };
                    families.set(id, state);
                }
                const reseat = state.def !== def || state.count !== count || state.tier !== a.tier
                    || state.allegiance !== allegiance(a) || Math.abs(state.radius - radius) > 0.01
                    || gap(state.center, a.pos) > SATELLITE_CFG.maxSweepDistance;
                if (reseat) {
                    state.age = 0;
                    state.center = { ...a.pos };
                    state.hits = Array.from({ length: count }, () => new Map());
                    state.generation++;
                    state.aims = [];
                    state.nextShot = Array.from({ length: count }, (_, i) => def.armTime + i * (def.emit?.interval ?? 0) / count);
                }
                state.inst = inst;
                state.level = a.level;
                state.def = def;
                state.count = count;
                state.radius = radius;
                state.tier = a.tier;
                state.allegiance = allegiance(a);
                const startAge = state.age, startAngle = state.angle;
                const turn = def.turnSpeed * a.sheet.get('satelliteSpeed', tags) * stepDt;
                const steps = !def.rehit ? 0 : Math.min(SATELLITE_CFG.maxSweepSteps, Math.max(1, Math.ceil(stepDt / SATELLITE_CFG.maxStep), Math.ceil((gap(state.center, a.pos) + Math.abs(turn) * radius) / SATELLITE_CFG.sweepSpacing)));
                const reach = radius + Math.max(def.radius, def.emit?.range ?? 0) + gap(state.center, a.pos);
                const enemies = stepDt > 0 && startAge + stepDt + 1e-9 >= def.armTime
                    ? ctx.enemies(a, reach).filter(e => e.tier === a.tier && gap(a.pos, e.pos) <= reach + e.radius) : [];
                for (let slot = 0; slot < count; slot++) {
                    const sourcePayload = def.sourcePayload ? ctx.instance(a, def.skill, slot) ?? inst : inst;
                    const hits = state.hits[slot], offset = slot * satellitestau / count;
                    let previous = { x: state.center.x + Math.cos(startAngle + offset) * radius,
                        y: state.center.y + Math.sin(startAngle + offset) * radius };
                    for (let s = 1; s <= steps; s++) {
                        const u = s / steps, age = startAge + stepDt * u, angle = startAngle + offset + turn * u;
                        const center = { x: state.center.x + (a.pos.x - state.center.x) * u,
                            y: state.center.y + (a.pos.y - state.center.y) * u };
                        const p = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
                        if (def.rehit && stepDt > 0 && age - stepDt / steps >= def.armTime && ctx.clear(center, p, a.tier)) {
                            for (const e of enemies) {
                                if (!satellitesalive(a) || !ctx.active(a) || a.sheet.get(satelliteCountStat(id), tags) <= 0)
                                    break;
                                if (!satellitesalive(e) || e.untargetable || e.tier !== a.tier || !ctx.hostile(a, e)
                                    || (hits.get(e.id) ?? -Infinity) > age + 1e-9
                                    || pointSegDist(e.pos.x, e.pos.y, previous.x, previous.y, p.x, p.y) > def.radius + e.radius
                                    || !ctx.clear(previous, p, a.tier) || !ctx.clear(p, e.pos, a.tier))
                                    continue;
                                hits.set(e.id, age + def.rehit);
                                ctx.hit(a, sourcePayload, e);
                            }
                        }
                        previous = p;
                    }
                    for (const [victim, until] of hits)
                        if (until <= startAge + stepDt)
                            hits.delete(victim);
                    const angle = startAngle + offset + turn;
                    const point = { x: a.pos.x + Math.cos(angle) * radius, y: a.pos.y + Math.sin(angle) * radius };
                    let aim = state.aims[slot];
                    if (aim && def.emit) {
                        if (!satellitesalive(a) || !ctx.active(a) || a.sheet.get(satelliteCountStat(id), tags) <= 0
                            || !present.has(aim.target) || !satellitesalive(aim.target) || aim.target.untargetable
                            || aim.target.tier !== a.tier || !ctx.hostile(a, aim.target)
                            || gap(point, aim.at) > def.emit.range || !ctx.clear(a.pos, point, a.tier)
                            || !ctx.clear(point, aim.at, a.tier)) {
                            state.aims[slot] = aim = undefined;
                        }
                        else if (stepDt > 0) {
                            aim.age += stepDt;
                            if (aim.age + 1e-9 >= def.emit.windup!) {
                                if (def.emit.mode === 'lob')
                                    this.flights.launch(a, def, inst, slot, state.generation, point, aim.at, ctx.radius(a, inst));
                                else
                                    ctx.launch(a, inst, point, Math.atan2(aim.at.y - point.y, aim.at.x - point.x));
                                state.aims[slot] = aim = undefined;
                            }
                        }
                    }
                    if (!aim && def.emit && stepDt > 0 && startAge + stepDt + 1e-9 >= state.nextShot[slot]
                        && satellitesalive(a) && ctx.active(a) && ctx.clear(a.pos, point, a.tier)) {
                        const target = enemies.filter(e => satellitesalive(e) && !e.untargetable && ctx.hostile(a, e)
                            && gap(point, e.pos) <= def.emit!.range && ctx.clear(point, e.pos, a.tier))
                            .sort((b, c) => (def.emit!.target === 'farthest' ? -1 : 1) * (gap(point, b.pos) - gap(point, c.pos)) || b.id - c.id)[0];
                        if (target) {
                            if (def.emit.windup)
                                state.aims[slot] = aim = { at: { ...target.pos }, age: 0, target };
                            else if (def.emit.mode === 'lob')
                                this.flights.launch(a, def, inst, slot, state.generation, point, target.pos, ctx.radius(a, inst));
                            else
                                ctx.launch(a, inst, point, Math.atan2(target.pos.y - point.y, target.pos.x - point.x));
                            const next = state.nextShot[slot] + def.emit.interval + (def.emit.windup ?? 0);
                            state.nextShot[slot] = next > startAge + stepDt ? next : startAge + stepDt + def.emit.interval + (def.emit.windup ?? 0);
                        }
                    }
                    visuals.push({ owner: a.id, family: id, slot, ...point,
                        ...(aim ? { aimX: aim.at.x, aimY: aim.at.y, aimProgress: Math.min(1, aim.age / def.emit!.windup!) } : {}), cx: a.pos.x, cy: a.pos.y,
                        orbit: radius, radius: def.radius, angle, tier: a.tier,
                        armed: startAge + stepDt >= def.armTime,
                        progress: Math.min(1, (startAge + stepDt) / def.armTime), blocked: !ctx.clear(a.pos, point, a.tier) });
                }
                state.age += stepDt;
                state.angle = (startAngle + turn) % satellitestau;
                state.center = { ...a.pos };
            }
            for (const id of families.keys())
                if (!kept.has(id))
                    families.delete(id);
            if (!families.size)
                this.states.delete(a);
        }
        this.visuals = visuals.filter(v => {
            const a = byId.get(v.owner);
            return a && satellitesalive(a) && ctx.active(a) && this.states.get(a)?.has(v.family)
                && a.sheet.get(satelliteCountStat(v.family), new Set(SATELLITES[v.family].tags)) > 0;
        });
        this.flights.update(dt, ctx, (a, id, slot, generation) => {
            const st = this.states.get(a)?.get(id);
            return present.has(a) && !!st && st.generation === generation && slot < st.count
                && a.sheet.get(satelliteCountStat(id), new Set(st.def.tags)) > 0;
        });
    }
}
type aurorasContext = Pick<CarriedEffectContext, 'active' | 'elapsed' | 'enemies' | 'hostile' | 'clear' | 'instance' | 'launch' | 'radius'>;
interface Reservoir {
    def: AuroraDef;
    capacity: number;
    charge: number;
    ready: number;
    angle: number;
    released: number;
    cascade: number;
    releasing: boolean;
    center: Vec2;
    tier: number;
    allegiance: string;
    inst: SkillInstance;
    level: number;
}
const aurorastau = Math.PI * 2;
const aurorasalive = (a: Actor): boolean => !a.dead && !a.downed;
class Auroras {
    visuals: AuroraVisual[] = [];
    private states = new Map<Actor, Map<string, Reservoir>>();
    clear(): void { this.states.clear(); this.visuals = []; }
    retire(a: Actor): void {
        this.states.delete(a);
        this.visuals = this.visuals.filter(v => v.owner !== a.id);
    }
    update(actors: readonly Actor[], dt: number, ctx: aurorasContext): void {
        const present = new Set(actors);
        for (const a of this.states.keys())
            if (!present.has(a) || !aurorasalive(a) || !ctx.active(a))
                this.retire(a);
        const visuals: AuroraVisual[] = [];
        for (const a of actors) {
            if (!aurorasalive(a) || !ctx.active(a))
                continue;
            const grants = a.sheet.armedFamily('auroraCapacity_', AURORA_IDS);
            let families = this.states.get(a);
            if (!grants.length) {
                if (families)
                    this.retire(a);
                continue;
            }
            if (!families)
                this.states.set(a, families = new Map());
            const kept = new Set<string>();
            let budget = AURORA_CFG.maxPerActor;
            const elapsed = Math.max(0, Math.min(AURORA_CFG.maxFrame, ctx.elapsed(a, dt)));
            for (const id of grants) {
                const def = AURORAS[id];
                if (!def)
                    continue;
                const tags = new Set(def.tags), grant = a.sheet.get(auroraCapacityStat(id), tags);
                const capacity = grant > 0 ? Math.min(budget, AURORA_CFG.maxCapacity, Math.floor(grant + a.sheet.get('auroraCapacity', tags))) : 0;
                if (!Number.isFinite(capacity) || capacity <= 0)
                    continue;
                budget -= capacity;
                kept.add(id);
                let s = families.get(id);
                const inst = s?.level === a.level && s.def === def ? s.inst : ctx.instance(a, def.skill);
                if (!inst)
                    continue;
                if (!s || s.def !== def || s.capacity !== capacity || s.tier !== a.tier
                    || s.allegiance !== carriedAllegiance(a)
                    || Math.hypot(s.center.x - a.pos.x, s.center.y - a.pos.y) > AURORA_CFG.teleport) {
                    s = { def, capacity, charge: 0, ready: 0, angle: a.id * 2.399963229728653 % aurorastau,
                        released: 0, cascade: 0, releasing: false, center: { ...a.pos }, tier: a.tier,
                        allegiance: carriedAllegiance(a), inst, level: a.level };
                    families.set(id, s);
                }
                s.inst = inst;
                s.level = a.level;
                s.center = { ...a.pos };
                const point = (slot: number) => {
                    const ring = Math.floor(slot / def.perRing), index = slot % def.perRing;
                    const count = Math.min(def.perRing, capacity - ring * def.perRing);
                    const angle = s!.angle + aurorastau * (index + ring * 0.5) / count;
                    const orbit = a.radius + def.orbit + ring * def.ringSpacing;
                    return { x: a.pos.x + Math.cos(angle) * orbit, y: a.pos.y + Math.sin(angle) * orbit, angle };
                };
                if (elapsed > 0 && s.releasing) {
                    s.cascade += elapsed;
                    while (s.released < capacity && s.cascade + 1e-9 >= def.cascade) {
                        s.cascade -= def.cascade;
                        const p = point(s.released++);
                        if (ctx.clear(a.pos, p, a.tier))
                            ctx.launch(a, inst, p, p.angle);
                    }
                    if (s.released >= capacity) {
                        s.releasing = false;
                        s.charge = 0;
                        s.ready = 0;
                        s.released = 0;
                        s.cascade = 0;
                    }
                }
                else if (elapsed > 0) {
                    s.angle = (s.angle + elapsed * def.turnSpeed) % aurorastau;
                    const wasFull = s.charge + 1e-9 >= capacity;
                    s.charge = Math.min(capacity, s.charge + elapsed * a.sheet.get('auroraRecharge', tags) / def.recharge);
                    if (wasFull)
                        s.ready += elapsed;
                    if (wasFull && s.ready + 1e-9 >= def.ready) {
                        const enemies = ctx.enemies(a, def.range);
                        if (enemies.some(e => aurorasalive(e) && !e.untargetable && e.tier === a.tier && ctx.hostile(a, e)
                            && Math.hypot(e.pos.x - a.pos.x, e.pos.y - a.pos.y) <= def.range && ctx.clear(a.pos, e.pos, a.tier))) {
                            s.releasing = true;
                            s.cascade = 0;
                            s.released = 0;
                        }
                    }
                }
                const radius = ctx.radius(a, inst);
                for (let slot = s.releasing ? s.released : 0; slot < capacity; slot++) {
                    const charge = s.releasing ? 1 : Math.max(0, Math.min(1, s.charge - slot));
                    if (charge <= 1e-9)
                        continue;
                    const p = point(slot);
                    if (!ctx.clear(a.pos, p, a.tier))
                        continue;
                    visuals.push({ owner: a.id, family: id, slot, tier: a.tier, x: p.x, y: p.y,
                        radius, charge, releasing: s.releasing });
                }
            }
            for (const id of families.keys())
                if (!kept.has(id))
                    families.delete(id);
            if (!families.size)
                this.states.delete(a);
        }
        this.visuals = visuals;
    }
}
type guardiansContext = Pick<CarriedEffectContext, 'active' | 'elapsed' | 'hostile' | 'clear'>;
interface Ward {
    def: GuardianDef;
    count: number;
    charge: number[];
    center: Vec2;
    tier: number;
    allegiance: string;
}
interface Catch {
    visual: GuardianVisual;
    remaining: number;
    duration: number;
}
const guardiansalive = (a: Actor) => !a.dead && !a.downed;
function entry(from: Vec2, to: Vec2, center: Vec2, radius: number): number | undefined {
    const x = from.x - center.x, y = from.y - center.y;
    const dx = to.x - from.x, dy = to.y - from.y, speed2 = dx * dx + dy * dy;
    const c = x * x + y * y - radius * radius, b = x * dx + y * dy;
    if (c <= 0 || speed2 <= 1e-12 || b >= 0)
        return;
    const disc = b * b - speed2 * c;
    if (disc < 0)
        return;
    const t = (-b - Math.sqrt(disc)) / speed2;
    return t >= 0 && t <= 1 ? t : undefined;
}
class Guardians {
    visuals: GuardianVisual[] = [];
    private states = new Map<Actor, Map<string, Ward>>();
    private catches: Catch[] = [];
    get active(): boolean { return this.states.size > 0; }
    clear(): void { this.states.clear(); this.catches = []; this.visuals = []; }
    retire(a: Actor): void {
        this.states.delete(a);
        this.catches = this.catches.filter(c => c.visual.owner !== a.id);
        this.visuals = this.visuals.filter(v => v.owner !== a.id);
    }
    update(actors: readonly Actor[], dt: number, ctx: guardiansContext): void {
        const present = new Set(actors);
        for (const a of this.states.keys())
            if (!present.has(a) || !guardiansalive(a) || !ctx.active(a))
                this.retire(a);
        this.catches = this.catches.filter(c => {
            c.remaining -= Math.max(0, Math.min(GUARDIAN_CFG.maxFrame, dt));
            c.visual.progress = 1 - c.remaining / c.duration;
            return c.remaining > 0;
        });
        const visuals: GuardianVisual[] = [];
        for (const a of actors) {
            if (!guardiansalive(a) || !ctx.active(a))
                continue;
            const grants = a.sheet.armedFamily('guardianCount_', GUARDIAN_IDS);
            let families = this.states.get(a);
            if (!grants.length) {
                if (families)
                    this.retire(a);
                continue;
            }
            if (!families)
                this.states.set(a, families = new Map());
            const kept = new Set<string>();
            let budget = GUARDIAN_CFG.maxPerActor;
            const elapsed = Math.max(0, Math.min(GUARDIAN_CFG.maxFrame, ctx.elapsed(a, dt)));
            for (const id of grants) {
                const def = GUARDIANS[id];
                if (!def)
                    continue;
                const tags = new Set<SkillTag>(['guardian', `guardian:${id}`]);
                const count = Math.min(budget, Math.floor(a.sheet.get(guardianCountStat(id), tags)));
                if (!Number.isFinite(count) || count <= 0)
                    continue;
                budget -= count;
                kept.add(id);
                let s = families.get(id);
                if (!s || s.def !== def || s.count !== count || s.tier !== a.tier || s.allegiance !== carriedAllegiance(a)
                    || Math.hypot(s.center.x - a.pos.x, s.center.y - a.pos.y) > GUARDIAN_CFG.teleport) {
                    s = { def, count, charge: Array(count).fill(0), center: { ...a.pos }, tier: a.tier, allegiance: carriedAllegiance(a) };
                    families.set(id, s);
                    this.catches = this.catches.filter(c => c.visual.owner !== a.id || c.visual.family !== id);
                }
                s.center = { ...a.pos };
                for (let slot = 0; slot < count; slot++) {
                    s.charge[slot] = Math.min(1, s.charge[slot] + elapsed * a.sheet.get('guardianRecharge', tags) / def.recharge);
                    if (s.charge[slot] + 1e-9 >= 1)
                        s.charge[slot] = 1;
                    const angle = -Math.PI / 2 + (slot - (count - 1) / 2) * def.moteSpread;
                    const r = a.radius + def.moteOffset;
                    visuals.push({ owner: a.id, family: id, slot, tier: a.tier,
                        x: a.pos.x + Math.cos(angle) * r, y: a.pos.y + Math.sin(angle) * r,
                        radius: def.moteRadius, angle, progress: s.charge[slot], kind: 'reserve' });
                }
            }
            for (const id of families.keys())
                if (!kept.has(id))
                    families.delete(id);
            if (!families.size)
                this.states.delete(a);
        }
        this.catches = this.catches.filter(c => [...this.states].some(([a, families]) => a.id === c.visual.owner && families.has(c.visual.family)));
        this.visuals = [...visuals, ...this.catches.map(c => c.visual)];
    }
    intercept(caster: Actor, tier: number, from: Vec2, to: Vec2, radius: number, ctx: guardiansContext): Vec2 | undefined {
        let best: {
            a: Actor;
            s: Ward;
            slot: number;
            at: Vec2;
            t: number;
        } | undefined;
        for (const [a, families] of this.states) {
            if (!guardiansalive(a) || !ctx.active(a) || a.tier !== tier || !ctx.hostile(caster, a) || ctx.elapsed(a, 1) <= 0)
                continue;
            for (const [id, s] of families) {
                if (s.tier !== a.tier || s.allegiance !== carriedAllegiance(a)
                    || a.sheet.get(guardianCountStat(id), new Set<SkillTag>(['guardian', `guardian:${id}`])) < s.count)
                    continue;
                const slot = s.charge.findIndex(c => c >= 1);
                if (slot < 0)
                    continue;
                const t = entry(from, to, a.pos, a.radius + s.def.reach + radius);
                if (t === undefined || (best && t >= best.t))
                    continue;
                const at = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
                if (!ctx.clear(from, at, tier) || !ctx.clear(a.pos, at, tier))
                    continue;
                best = { a, s, slot, at, t };
            }
        }
        if (!best)
            return;
        const { a, s, slot, at } = best;
        s.charge[slot] = 0;
        const reserve = this.visuals.find(v => v.kind === 'reserve' && v.owner === a.id && v.family === s.def.id && v.slot === slot);
        if (reserve)
            reserve.progress = 0;
        const visual: GuardianVisual = { owner: a.id, family: s.def.id, slot, tier,
            x: at.x, y: at.y, radius: s.def.moteRadius * 2.5,
            angle: Math.atan2(at.y - a.pos.y, at.x - a.pos.x), progress: 0, kind: 'catch' };
        this.catches.push({ visual, remaining: s.def.flash, duration: s.def.flash });
        this.visuals.push(visual);
        return at;
    }
}
interface CreeperContext extends Pick<CarriedEffectContext, 'active' | 'elapsed' | 'enemies' | 'hostile' | 'clear' | 'instance' | 'hit' | 'radius'> {
    move(a: Actor, from: Vec2, to: Vec2, radius: number, distance: number): Vec2;
}
interface Creep {
    pos: Vec2;
    angle: number;
    age: number;
    mode: 'roam' | 'hunt' | 'return';
    target?: Actor;
    goal: Vec2;
    offset: Vec2;
    wanderAt: number;
    rng: number;
    cooldown: number;
    bite?: {
        age: number;
        radius: number;
    };
    flash: number;
    strikeRadius: number;
    stuck: number;
    trail: {
        x: number;
        y: number;
        life: number;
    }[];
}
interface Brood {
    def: CreeperDef;
    count: number;
    center: Vec2;
    tier: number;
    allegiance: string;
    inst: SkillInstance;
    level: number;
    creeps: Creep[];
}
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const creepersalive = (a: Actor) => !a.dead && !a.downed;
function random(c: Creep): number {
    c.rng = (Math.imul(c.rng, 1664525) + 1013904223) >>> 0;
    return c.rng / 4294967296;
}
function fresh(a: Actor, id: string, slot: number): Creep {
    let seed = a.id ^ Math.imul(slot + 1, 2654435761);
    for (const char of id)
        seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
    return { pos: { ...a.pos }, angle: 0, age: 0, mode: 'roam', goal: { ...a.pos }, offset: { x: 0, y: 0 },
        wanderAt: 0, rng: seed >>> 0, cooldown: 0, flash: 0, strikeRadius: 0, stuck: 0, trail: [] };
}
class Creepers {
    visuals: CreeperVisual[] = [];
    private states = new Map<Actor, Map<string, Brood>>();
    clear(): void { this.states.clear(); this.visuals = []; }
    retire(a: Actor): void { this.states.delete(a); this.visuals = this.visuals.filter(v => v.owner !== a.id); }
    update(actors: readonly Actor[], dt: number, ctx: CreeperContext): void {
        const present = new Set(actors), visuals: CreeperVisual[] = [];
        for (const a of this.states.keys())
            if (!present.has(a) || !creepersalive(a) || !ctx.active(a))
                this.retire(a);
        for (const a of actors) {
            if (!creepersalive(a) || !ctx.active(a))
                continue;
            const grants = a.sheet.armedFamily('creeperCount_', CREEPER_IDS);
            let families = this.states.get(a);
            if (!grants.length) {
                if (families)
                    this.retire(a);
                continue;
            }
            if (!families)
                this.states.set(a, families = new Map());
            const kept = new Set<string>();
            let budget = CREEPER_CFG.maxPerActor;
            const elapsed = Math.max(0, Math.min(CREEPER_CFG.maxFrame, ctx.elapsed(a, dt)));
            for (const id of grants) {
                const def = CREEPERS[id];
                if (!def || !creepersalive(a))
                    continue;
                const tags = new Set(def.tags), count = Math.min(budget, Math.floor(a.sheet.get(creeperCountStat(id), tags)));
                if (!Number.isFinite(count) || count <= 0)
                    continue;
                budget -= count;
                kept.add(id);
                let s = families.get(id);
                const inst = s?.def === def && s.level === a.level ? s.inst : ctx.instance(a, def.skill);
                if (!inst)
                    continue;
                if (!s || s.def !== def || s.count !== count || s.tier !== a.tier || s.allegiance !== carriedAllegiance(a)
                    || distance(s.center, a.pos) > CREEPER_CFG.teleport) {
                    s = { def, count, center: { ...a.pos }, tier: a.tier, allegiance: carriedAllegiance(a), inst, level: a.level,
                        creeps: Array.from({ length: count }, (_, slot) => fresh(a, id, slot)) };
                    families.set(id, s);
                }
                s.inst = inst;
                s.level = a.level;
                s.center = { ...a.pos };
                const live = () => creepersalive(a) && ctx.active(a) && this.states.get(a)?.get(id) === s
                    && a.sheet.get(creeperCountStat(id), tags) >= count;
                const enemies = elapsed > 0 ? ctx.enemies(a, def.leash) : [];
                const eligible = (e: Actor) => creepersalive(e) && !e.untargetable && e.tier === a.tier && ctx.hostile(a, e)
                    && enemies.includes(e) && distance(a.pos, e.pos) <= def.leash;
                for (let slot = 0; slot < count && live(); slot++) {
                    let c = s.creeps[slot];
                    if (distance(c.pos, a.pos) > def.leash || (c.target && (!present.has(c.target) || !creepersalive(c.target)
                        || c.target.untargetable || c.target.tier !== a.tier || !ctx.hostile(a, c.target)
                        || distance(c.target.pos, a.pos) > def.leash))) {
                        c.mode = 'return';
                        c.target = undefined;
                        c.bite = undefined;
                        c.flash = 0;
                    }
                    if (elapsed > 0) {
                        c.age += elapsed;
                        c.cooldown = Math.max(0, c.cooldown - elapsed);
                        c.flash = Math.max(0, c.flash - elapsed);
                        c.trail = c.trail.filter(p => (p.life -= elapsed) > 0);
                        if (c.target && (!eligible(c.target) || !ctx.clear(c.pos, c.target.pos, a.tier))) {
                            c.mode = 'return';
                            c.target = undefined;
                            c.bite = undefined;
                            c.flash = 0;
                        }
                        if (c.mode === 'return' && distance(c.pos, a.pos) <= def.home) {
                            c.mode = 'roam';
                            c.wanderAt = 0;
                        }
                        if (c.age >= def.arm && c.mode !== 'return' && !c.target) {
                            c.target = enemies.filter(e => eligible(e) && distance(a.pos, e.pos) <= def.acquire
                                && ctx.clear(c.pos, e.pos, a.tier))
                                .sort((b, d) => distance(c.pos, b.pos) - distance(c.pos, d.pos) || b.id - d.id)[0];
                            if (c.target) {
                                c.mode = 'hunt';
                                c.wanderAt = 0;
                            }
                        }
                        if (c.bite) {
                            c.bite.age += elapsed;
                            if (c.bite.age + 1e-9 >= def.windup) {
                                c.strikeRadius = c.bite.radius;
                                c.bite = undefined;
                                c.flash = def.flash;
                                c.cooldown = def.recovery;
                                for (const e of ctx.enemies(a, c.strikeRadius, c.pos)) {
                                    if (!live())
                                        break;
                                    if (!creepersalive(e) || e.untargetable || e.tier !== a.tier || !ctx.hostile(a, e)
                                        || distance(c.pos, e.pos) > c.strikeRadius + e.radius
                                        || !ctx.clear(c.pos, e.pos, a.tier))
                                        continue;
                                    ctx.hit(a, inst, e);
                                }
                            }
                        }
                        else if (c.flash <= 0) {
                            if (c.age >= c.wanderAt || distance(c.pos, c.goal) < def.bodyRadius) {
                                const angle = random(c) * Math.PI * 2;
                                const reach = c.target ? def.bodyRadius * 2 : def.wander * (0.35 + random(c) * 0.65);
                                c.offset = { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach };
                                c.wanderAt = c.age + def.wanderMin + random(c) * (def.wanderMax - def.wanderMin);
                            }
                            const anchor = c.target?.pos ?? a.pos;
                            c.goal = c.mode === 'return' ? { ...a.pos } : { x: anchor.x + c.offset.x, y: anchor.y + c.offset.y };
                            const g = distance(a.pos, c.goal);
                            if (g > def.leash)
                                c.goal = { x: a.pos.x + (c.goal.x - a.pos.x) * def.leash / g,
                                    y: a.pos.y + (c.goal.y - a.pos.y) * def.leash / g };
                            const speed = (c.mode === 'return' ? def.returnSpeed : def.speed) * a.sheet.get('creeperSpeed', tags);
                            const next = ctx.move(a, c.pos, c.goal, def.bodyRadius, speed * elapsed);
                            const moved = distance(c.pos, next);
                            c.stuck = speed > 0 && moved < speed * elapsed * 0.1 && distance(c.pos, c.goal) > def.bodyRadius
                                ? c.stuck + elapsed : 0;
                            if (moved > 1e-6)
                                c.angle = Math.atan2(next.y - c.pos.y, next.x - c.pos.x);
                            c.pos = next;
                            const last = c.trail[c.trail.length - 1];
                            if (moved > 0 && (!last || distance(last, c.pos) >= def.trailSpacing)) {
                                c.trail.push({ ...c.pos, life: def.trailLife });
                                if (c.trail.length > CREEPER_CFG.maxTrail)
                                    c.trail.shift();
                            }
                            if (c.stuck >= def.recall) {
                                c = s.creeps[slot] = fresh(a, id, slot);
                            }
                            const radius = ctx.radius(a, inst);
                            if (c.target && c.age >= def.arm && c.mode === 'hunt' && c.cooldown <= 0 && radius > 0
                                && distance(c.pos, c.target.pos) <= radius * 0.5 + c.target.radius
                                && ctx.clear(c.pos, c.target.pos, a.tier))
                                c.bite = { age: 0, radius };
                        }
                    }
                    if (!live())
                        break;
                    const phase = c.age < def.arm ? 'arm' : c.bite ? 'windup' : c.flash > 0 ? 'strike' : c.mode;
                    visuals.push({ owner: a.id, family: id, slot, tier: a.tier, x: c.pos.x, y: c.pos.y,
                        angle: c.angle, radius: def.bodyRadius, phase,
                        progress: phase === 'arm' ? c.age / def.arm : c.bite ? c.bite.age / def.windup : c.flash > 0 ? 1 - c.flash / def.flash : 1,
                        strikeRadius: c.bite?.radius ?? c.strikeRadius, trail: c.trail.map(p => ({ ...p })) });
                }
            }
            for (const id of families.keys())
                if (!kept.has(id))
                    families.delete(id);
            if (!families.size)
                this.states.delete(a);
        }
        const byId = new Map(actors.map(a => [a.id, a]));
        this.visuals = visuals.filter(v => {
            const a = byId.get(v.owner);
            return a && creepersalive(a) && ctx.active(a) && this.states.get(a)?.has(v.family)
                && a.sheet.get(creeperCountStat(v.family), new Set(CREEPERS[v.family].tags)) > 0;
        });
    }
}
return {satellites:new Satellites(),auroras:new Auroras(),guardians:new Guardians(),creepers:new Creepers()};
}
