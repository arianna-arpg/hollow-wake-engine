// Candidate: ordered body construction over synchronous host services.
export interface FactorySkill {
 def:{id:string};level:number;
 sockets:({def:unknown;level:number}|null)[];
 grafts?:{def:unknown;level:number}[];treeNodes?:string[];
}
export interface FactorySheet<M> {
 setBase(stat:string,value:number):void;setSource(key:string,mods:M[]):void;get(stat:string):number;
}
export interface FactoryWorm {
 length:number;spacing:number;taper:number;segments:{x:number;y:number}[];
 hittable?:boolean;looks?:unknown;wounds?:unknown;
}
export interface FactoryShell {
 side:'rear'|'front'|'all';arcDeg:number;max:number;pool:number;regenDelay:number;regenRate:number;
 lastHitAt:number;broken:boolean;color:string;shellVisual?:string;breathe?:unknown;
}
export interface FactoryBody<S extends FactorySkill,M,R> {
 sheet:FactorySheet<M>;skills:(S|null)[];owner?:unknown;kind:string;
 defId?:string;color:string;shape:unknown;radius:number;level:number;facing:number;facingPrev?:number;
 invulnerable:boolean;untargetable:boolean;levitates:boolean;stationary?:boolean;plies:number;pliesMax:number;
 brain?:unknown;brainVariant?:number;tellSpecs?:unknown;watch?:unknown;tag?:unknown;postSpec?:unknown;
 passive:boolean;driven:boolean;aims:boolean;spawnScale?:number;juvenile?:boolean;breathes:boolean;
 fromZoneGen?:boolean;anchored:boolean;movementTetherSpec?:unknown;faction?:unknown;adorn?:unknown;
 material?:unknown;look?:string;worm?:FactoryWorm;explodeOnDeath?:number;deathBurst?:unknown;
 cling?:unknown;grabbable?:unknown;refuge?:unknown;squish?:unknown;habitat?:unknown;wake?:unknown;
 reserves?:Map<string,R>;reserveSpecs?:{id:string}[];rootedSpec?:unknown;volatile?:unknown;
 onHitByType?:unknown;onHitTypeIcd?:number;tune?:unknown;tone?:unknown;carriedGear?:unknown;
 immuneGround?:unknown;pathCosts?:unknown;shellGuard?:FactoryShell;turnSpeed:number;
 flying:boolean;flyingBase:boolean;spawnedAt:number;wornConduits?:unknown[];xpValue:number;
 statusRelay?:unknown;fillResources():void;
}
type FactoryActorFields=FactoryBody<FactorySkill,unknown,unknown>;
type WormOf<A extends FactoryActorFields>=NonNullable<A['worm']>;
type ShellOf<A extends FactoryActorFields>=NonNullable<A['shellGuard']>;
export interface FactoryDefinition<A extends FactoryActorFields,M> {
 name:string;color:string;shape:A['shape'];radius:number;base:Record<string,number>;xp:number;skills:string[];
 mods?:M[];detection?:number;sympathy?:string[];bombard?:unknown;
 invulnerable?:boolean;untargetable?:boolean;levitates?:boolean;
 cling?:A['cling'];grabbable?:A['grabbable'];brain?:A['brain'];
 brainVariants?:{weight:number;brain:A['brain']}[];watch?:A['watch'];tag?:A['tag'];post?:A['postSpec']|true;
 passive?:boolean;driven?:boolean;aims?:boolean;spawnFacing?:number;
 scaleVariance?:[number,number];scaleStats?:boolean;juvenileBelow?:number;juvenileBrain?:A['brain'];heft?:number;
 orbDrops?:number;movementTether?:A['movementTetherSpec'];faction?:A['faction'];adorn?:A['adorn'];material?:A['material'];look?:string;
 worm?:{length:number;spacing?:number;taper?:number;hittable?:boolean;looks?:WormOf<A>['looks'];wounds?:WormOf<A>['wounds']};
 explodeOnDeath?:number;deathBurst?:A['deathBurst'];refuge?:A['refuge'];habitat?:A['habitat'];wake?:A['wake'];
 reserves?:A['reserveSpecs'];rooted?:A['rootedSpec'];volatile?:A['volatile'];onHitByType?:A['onHitByType'];onHitTypeIcd?:number;tune?:A['tune'];
 carry?:{chance?:number;rarity?:unknown;category?:unknown};immuneGround?:A['immuneGround'];pathCosts?:A['pathCosts'];ambush?:unknown;
 shellGuard?:{side:ShellOf<A>['side'];max:number;arcDeg?:number;regenDelay?:number;regenRate?:number;color?:string;shellVisual?:string;breathe?:ShellOf<A>['breathe']};
 flier?:boolean;grants?:{atLevel:number;chance?:number;skill?:string;support?:string;on?:string}[];
 skillTrees?:Record<string,string[]>;boons?:{group:string;pick?:number;chance?:number;minLevel?:number}[];
}
type SupportOf<S extends FactorySkill>=NonNullable<S['sockets'][number]>['def'];
type CarryOf<D extends {carry?:{rarity?:unknown;category?:unknown}}>=NonNullable<D['carry']>;
export interface BodyFactoryPorts<A extends FactoryBody<S,M,R>,D extends FactoryDefinition<A,M>,S extends FactorySkill,M,R,T> {
 definition(id:string):D;allocate(name:string,team:T,position:{x:number;y:number}):A;
 statusRelay():A['statusRelay'];bombardMinted():void;enemyTeam:T;
 modifier(stat:string,kind:'flat'|'more',value:number):M;sympathyStat(link:string):string;
 stampLevel(a:A,def:D,level:number):void;applyPartyScale(a:A):void;
 random():number;randomBetween(min:number,max:number):number;chance(value:number):boolean;
 tellSpecs(def:D,variant:number|undefined):A['tellSpecs'];weight():{refRadius:number;radiusPow:number};
 density(def:D):number;breathes(def:D):boolean;zoneTagging():boolean;appearance(id:string):string|undefined;
 squishSpec(def:D):A['squish'];makeReserve(spec:NonNullable<D['reserves']>[number]):R;
 startTone(spec:NonNullable<D['tune']>,random:()=>number):NonNullable<A['tone']>;applyAttunement(a:A):void;
 rollItem(options:{ilvl:number;rarity?:CarryOf<D>['rarity'];category?:CarryOf<D>['category']}):A['carriedGear'];
 armAmbush(a:A,spec:NonNullable<D['ambush']>):void;turnSpeed(def:D):number;time():number;skillLevel(level:number):number;
 skills:Readonly<Record<string,S['def']>>;supports:Readonly<Record<string,SupportOf<S>>>;
 makeSkill(def:S['def'],level:number):S;validTreeNodes(def:S['def'],pins:readonly string[]):string[]|undefined;
 choices:Readonly<Record<string,{id:string;options:{mods?:M[];graft?:{support:string;level?:number};conduit?:NonNullable<A['wornConduits']>[number]}[]}>>;
 xpScale:number;
}
/** Constructs and returns a body without publishing world membership. Content
 * records and nested metadata remain borrowed. Pools, skills and mutable shell/
 * segment state are newly allocated. Exceptions retain preceding host writes.
 * The host must provide synchronous services and preserve the declared field
 * contracts; the allocation service still owns identity and body defaults. */
export class BodyFactory<A extends FactoryBody<S,M,R>,D extends FactoryDefinition<A,M>,S extends FactorySkill,M,R,T> {
 constructor(private readonly p:BodyFactoryPorts<A,D,S,M,R,T>){}

create(defId: string, level: number, team: T, owner?: A, spawn?: {
    scale?: number;
}): A {
    const def = this.p.definition(defId);
    const a = this.p.allocate(def.name, team, { x: 0, y: 0 });
    a.statusRelay = this.p.statusRelay();
    a.defId = defId;
    if (def.bombard)
        this.p.bombardMinted();
    a.color = def.color;
    a.shape = def.shape;
    a.radius = def.radius;
    a.level = level;
    a.invulnerable = !!def.invulnerable;
    a.untargetable = !!def.untargetable;
    a.levitates = !!def.levitates;
    for (const [stat, value] of Object.entries(def.base))
        a.sheet.setBase(stat, value);
    const innate = def.mods ? [...def.mods] : [];
    if (def.detection !== undefined && def.detection !== 1) {
        innate.push(this.p.modifier('detectionRange', 'more', def.detection - 1));
    }
    if (def.sympathy) {
        for (const link of def.sympathy)
            innate.push(this.p.modifier(this.p.sympathyStat(link), 'flat', 1));
    }
    if (innate.length)
        a.sheet.setSource('innate', innate);
    if (def.cling)
        a.cling = def.cling;
    if (def.grabbable !== undefined)
        a.grabbable = def.grabbable;
    if (def.base.moveSpeed === 0)
        a.stationary = true;
    const lv = level - 1;
    this.p.stampLevel(a, def, level);
    a.plies = a.pliesMax;
    if (team === this.p.enemyTeam && !owner)
        this.p.applyPartyScale(a);
    if (owner) {
        a.owner = owner;
        a.kind = 'minion';
        a.sheet.setSource('owner', [
            this.p.modifier('damage', 'more', owner.sheet.get('minionDamage') - 1),
            this.p.modifier('life', 'more', owner.sheet.get('minionLife') - 1),
        ]);
    }
    a.brain = def.brain;
    if (def.brainVariants?.length) {
        let total = 0;
        for (const v of def.brainVariants)
            total += v.weight;
        let roll = this.p.randomBetween(0, total);
        for (let vi = 0; vi < def.brainVariants.length; vi++) {
            const v = def.brainVariants[vi];
            roll -= v.weight;
            if (roll <= 0) {
                a.brain = v.brain;
                a.brainVariant = vi;
                break;
            }
        }
    }
    a.tellSpecs = this.p.tellSpecs(def, a.brainVariant);
    a.watch = def.watch;
    if (def.tag)
        a.tag = def.tag;
    if (def.post)
        a.postSpec = def.post === true ? {} : def.post;
    a.passive = !!def.passive;
    a.driven = !!def.driven;
    if (def.aims === false)
        a.aims = false;
    if (def.spawnFacing !== undefined)
        a.facing = def.spawnFacing;
    if (def.scaleVariance) {
        const s = spawn?.scale !== undefined && Number.isFinite(spawn.scale) && spawn.scale > 0
            ? spawn.scale : this.p.randomBetween(def.scaleVariance[0], def.scaleVariance[1]);
        a.spawnScale = s;
        a.radius = def.radius * s;
        if (def.scaleStats)
            a.sheet.setSource('scaleVar', [this.p.modifier('life', 'more', s - 1), this.p.modifier('damage', 'more', s - 1)]);
        if (def.juvenileBelow !== undefined && s <= def.juvenileBelow) {
            a.juvenile = true;
            if (def.juvenileBrain)
                a.brain = def.juvenileBrain;
        }
    }
    if (def.base.weight === undefined) {
        a.sheet.setBase('weight', Math.pow(a.radius / this.p.weight().refRadius, this.p.weight().radiusPow)
            * this.p.density(def) * (def.heft ?? 1));
    }
    a.breathes = this.p.breathes(def);
    if (this.p.zoneTagging() && team === this.p.enemyTeam && !owner)
        a.fromZoneGen = true;
    a.anchored = (def.base.moveSpeed ?? 1) <= 0 && !def.orbDrops;
    a.movementTetherSpec = def.movementTether;
    a.faction = def.faction;
    a.adorn = def.adorn;
    a.material = def.material;
    a.look = this.p.appearance(a.defId!) ?? def.look;
    if (def.worm) {
        a.worm = {
            length: def.worm.length,
            spacing: def.worm.spacing ?? def.radius * 1.1,
            taper: def.worm.taper ?? 0.88,
            segments: [],
            ...(def.worm.hittable ? { hittable: true } : {}),
            ...(def.worm.looks ? { looks: def.worm.looks } : {}),
            ...(def.worm.wounds ? { wounds: def.worm.wounds } : {}),
        };
    }
    if (def.explodeOnDeath)
        a.explodeOnDeath = def.explodeOnDeath;
    if (def.deathBurst)
        a.deathBurst = def.deathBurst;
    if (def.refuge)
        a.refuge = def.refuge;
    const squishSpec = this.p.squishSpec(def);
    if (squishSpec)
        a.squish = squishSpec;
    if (def.habitat)
        a.habitat = def.habitat;
    if (def.wake)
        a.wake = def.wake;
    if (def.reserves?.length) {
        a.reserves = new Map(def.reserves.map(r => [r.id, this.p.makeReserve(r)]));
        a.reserveSpecs = def.reserves;
    }
    if (def.rooted)
        a.rootedSpec = def.rooted;
    if (def.volatile)
        a.volatile = def.volatile;
    if (def.onHitByType) {
        a.onHitByType = def.onHitByType;
        a.onHitTypeIcd = def.onHitTypeIcd;
    }
    if (def.tune) {
        a.tune = def.tune;
        a.tone = this.p.startTone(def.tune, () => this.p.randomBetween(0, 1));
        this.p.applyAttunement(a);
    }
    if (def.carry && (def.carry.chance === undefined || this.p.chance(def.carry.chance))) {
        const worn = this.p.rollItem({
            ilvl: Math.max(1, level),
            ...(def.carry.rarity !== undefined ? { rarity: def.carry.rarity } : {}),
            ...(def.carry.category !== undefined ? { category: def.carry.category } : {}),
        });
        if (worn)
            a.carriedGear = worn;
    }
    if (def.immuneGround)
        a.immuneGround = def.immuneGround;
    if (def.pathCosts)
        a.pathCosts = def.pathCosts;
    if (def.ambush)
        this.p.armAmbush(a, def.ambush);
    if (def.shellGuard) {
        const sg = def.shellGuard;
        a.shellGuard = {
            side: sg.side, arcDeg: sg.arcDeg ?? 180,
            max: sg.max, pool: sg.max,
            regenDelay: sg.regenDelay ?? 4,
            regenRate: sg.regenRate ?? sg.max / 6,
            lastHitAt: -999, broken: false,
            color: sg.color ?? '#c8b87a',
            shellVisual: sg.shellVisual,
            breathe: sg.breathe,
        };
    }
    a.turnSpeed = this.p.turnSpeed(def);
    a.facingPrev = a.facing;
    if (def.flier) {
        a.flying = true;
        a.flyingBase = true;
    }
    a.spawnedAt = this.p.time();
    const skillLevel = this.p.skillLevel(level);
    a.skills = def.skills.map(id => this.p.makeSkill(this.p.skills[id], skillLevel));
    if (def.grants) {
        const supLevel = 1 + Math.floor(lv / 5);
        for (const g of def.grants) {
            if (level < g.atLevel)
                continue;
            if (g.chance !== undefined && this.p.random() >= g.chance)
                continue;
            if (g.skill && this.p.skills[g.skill])
                a.skills.push(this.p.makeSkill(this.p.skills[g.skill], skillLevel));
            if (g.support && this.p.supports[g.support]) {
                const target = g.on ? a.skills.find(s => s?.def.id === g.on) : a.skills[0];
                if (target) {
                    const slot = target.sockets.findIndex(x => x === null);
                    if (slot >= 0)
                        target.sockets[slot] = { def: this.p.supports[g.support], level: supLevel };
                }
            }
        }
    }
    if (def.skillTrees) {
        for (const inst of a.skills) {
            const pin = inst ? def.skillTrees[inst.def.id] : undefined;
            if (inst && pin?.length)
                inst.treeNodes = this.p.validTreeNodes(inst.def, pin);
        }
    }
    for (const b of def.boons ?? []) {
        if (level < (b.minLevel ?? 1))
            continue;
        const group = this.p.choices[b.group];
        if (!group)
            continue;
        if (b.chance !== undefined && this.p.random() >= b.chance)
            continue;
        const pool = [...group.options];
        const picks = Math.min(Math.max(1, b.pick ?? 1), pool.length);
        const mods: M[] = [];
        for (let i = 0; i < picks; i++) {
            const opt = pool.splice(Math.floor(this.p.random() * pool.length), 1)[0];
            if (opt.mods)
                mods.push(...opt.mods);
            if (opt.graft && this.p.supports[opt.graft.support] && a.skills[0]) {
                (a.skills[0].grafts ??= []).push({ def: this.p.supports[opt.graft.support], level: opt.graft.level ?? 1 });
            }
            if (opt.conduit)
                (a.wornConduits ??= []).push(opt.conduit);
        }
        if (mods.length)
            a.sheet.setSource(`boon:${group.id}`, mods);
    }
    a.xpValue = Math.round(def.xp * this.p.xpScale * (1 + 0.15 * lv));
    a.fillResources();
    return a;
}
}
