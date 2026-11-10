// Host-independent guard discipline lifecycle; original behavior is pinned in baseline/source-lock.json.
export interface GuardArtPoint {x:number;y:number}
export interface GuardArtProjectile {type:'projectile';range:number;speed:number;radius:number}
export type GuardArtDelivery<D extends GuardArtProjectile> = D | {type:'self'} | {type:'ground';radius:number;castRange:number;delay:number};
export type GuardArtDamage = Partial<Record<string,number>>;
export interface GuardArtSkill {
  def:{id:string;color:string;guard?:{arcDeg?:number;shieldLife?:number};tags:readonly string[]};
  treeNodes?:readonly string[];level:number;bonusLevels?:number;
  sockets:readonly ({def:{id:string};level:number}|null)[];
}
export interface GuardArtAbsorbLayer<S> {
  amount:number;remaining:number;source:S;ended:(reason:'broken'|'expired')=>void;
}
export interface GuardArtActor<S> {
  id:number;dead:boolean;downed:boolean;life:number;invulnerable:boolean;
  pos:GuardArtPoint;radius:number;tier:number;team:string;facing:number;
  skills:(S|null)[];casting?:{inst:S;mode:string;held?:boolean}|null;construct?:unknown;
  guardIntervention:Record<string,number>;lifeDamageInterceptors?:Map<string,(amount:number)=>number>;
  absorbLayers:Map<string,GuardArtAbsorbLayer<S>>;
}
export interface GuardArtFlash {pos:GuardArtPoint;radius:number;color:string;life:number;maxLife:number}
export interface GuardArtsLimits {pendingBlasts:number;promotePerFrame:number;maximumReduction:number}
export const GUARD_ARTS_LIMITS:Readonly<GuardArtsLimits>=Object.freeze({pendingBlasts:16,promotePerFrame:8,maximumReduction:.95});
export interface GuardArtsState<A,S,D extends GuardArtProjectile> {
  owners:Map<A,Map<S,GuardArtState<A,S,D>>>;nextSource:number;visuals:GuardArtVisual[];
}
export function createGuardArtsState<A,S,D extends GuardArtProjectile>():GuardArtsState<A,S,D> {
  return{owners:new Map(),nextSource:1,visuals:[]};
}
/** Trusted synchronous services over the caller's complete actor/skill graph.
 * Reads preserve source order; sinks may affect later reads. A private build
 * must supply detached graphs and private effects, not callbacks into a live World.
 * Exceptions retain preceding borrowed writes, as in the original lifecycle. */
export interface GuardArtsPorts<A,S,D extends GuardArtProjectile,B,Tag extends string,M> {
  actors():readonly A[];contains(actor:A):boolean;client():boolean;time():number;scale(actor:A):number;
  spec(inst:S):GuardArtsSpec<D>|undefined;bashSpec(inst:S):B|undefined;
  capacity(actor:A,inst:S):number;absorb(actor:A,inst:S,power:number):{amount:number;duration:number}|undefined;
  tags(inst:S,extra?:Tag[]):Set<Tag>;grantedTags(inst:S):Tag[];modifiers(inst:S):M[];
  stat(actor:A,id:string,tags:Set<Tag>,mods:M[]):number;modifier(stat:string,kind:'flat'|'more',value:number):M;
  setSource(actor:A,key:string,mods:M[]):void;removeSource(actor:A,key:string):void;
  addBuff(actor:A,buff:{type:'buff';id:string;label:string;duration:number;mods:M[]}):void;removeBuff(actor:A,key:string):void;
  spendAbsorb(actor:A,amount:number):number;cooldown(actor:A,inst:S):void;
  bash(actor:A,inst:S,spec:B,power:number):void;
  payload(inst:S,delivery:GuardArtDelivery<D>,flat?:GuardArtDamage):S;
  appendTags(inst:S,tags:string[]):void;
  enemies(actor:A):readonly A[];lineOfSight(from:A,to:A):boolean;
  hit(actor:A,inst:S,target:A,flat:GuardArtDamage,push?:number):void;
  execute(actor:A,inst:S,aim:GuardArtPoint,options:{keepFacing:true;noCooldown:true;noRepeat:true;componentUse:true}):void;
  retireProjectiles(actor:A,host:S):void;flash(value:GuardArtFlash):void;
  hasLite():boolean;promote(actor:A,within:number,max:number):void;
  weight(actor:A):number;maxLife(actor:A):number;heal(actor:A,amount:number):void;
  satellite(family:string):{skill:string;radius:number}|undefined;random():number;
}
const dist=(a:GuardArtPoint,b:GuardArtPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const angleTo=(a:GuardArtPoint,b:GuardArtPoint)=>Math.atan2(b.y-a.y,b.x-a.x);
function angleDiff(a:number,b:number):number {let d=b-a;while(d>Math.PI)d-=Math.PI*2;while(d< -Math.PI)d+=Math.PI*2;return d;}

export interface GuardArtsSpec<D extends GuardArtProjectile=GuardArtProjectile> {
  armorRatio?: number;
  passiveBlockReduction?: number;
  plates?: { interval: number; max: number; reduction: number; label: string };
  plateRestore?: number;
  plateHeal?: { radius: number; lifeFraction: number };
  ram?: { base: number; thorns: number; weight: number; interval: number; repeat: number; reset: number; reach: number; arc: number; push: number };
  raiseBash?: number;
  bashWave?: { power: number; delivery: D };
  absorb?: { fraction: number; duration: number; cooldown: number };
  patience?: { seconds: number; multiplier: number };
  intactSatellite?: { family: string; max: number; duration: number };
  brokenSatellite?: { family: string; max: number; duration: number; power: number };
  intervention?: { cooldown: number; label: string };
  detonation?: { delay: number; radius: number; power: number };
  breakBurst?: { radius: number; power: number };
}

interface Outcome { expires: number; power: number }
export interface GuardArtVisual {
  owner: number; x: number; y: number; tier: number; radius: number; progress: number; color: string;
  plates?: number; slots?: number; facing?: number; arc?: number;
}
export interface GuardArtState<A,S,D extends GuardArtProjectile> {
  owner: A; host: S; spec: GuardArtsSpec<D>; policy: string; key: string;
  plates: number; plateClock: number; lastCast: number;
  contacts: Map<number, { next: number; seen: number }>;
  intact: Outcome[]; broken: Outcome[];
  blasts: { remaining: number; duration: number; power: number; radius: number }[];
}

export class GuardArts<A extends GuardArtActor<S>,S extends GuardArtSkill,D extends GuardArtProjectile,B extends {mult?:number},Tag extends string,M> {
  constructor(private readonly p:GuardArtsPorts<A,S,D,B,Tag,M>,readonly state:GuardArtsState<A,S,D>=createGuardArtsState(),private readonly limits:Readonly<GuardArtsLimits>=GUARD_ARTS_LIMITS) {}
  get visuals():GuardArtVisual[]{return this.state.visuals;}
  set visuals(value:GuardArtVisual[]){this.state.visuals=value;}
  private get states(){return this.state.owners;}
  private policy(inst: S): string {
    return JSON.stringify([inst.treeNodes, inst.level, inst.bonusLevels, inst.sockets.map(s => s && [s.def.id, s.level]), this.p.spec(inst)]);
  }
  private live(s: GuardArtState<A,S,D>): boolean {
    return !s.owner.dead && !s.owner.downed && this.p.contains(s.owner)
      && s.owner.skills.includes(s.host) && s.policy === this.policy(s.host);
  }
  private ensure(a: A, inst: S): GuardArtState<A,S,D> | undefined {
    const spec = this.p.spec(inst);
    if (!spec) return undefined;
    let family = this.states.get(a);
    if (!family) this.states.set(a, family = new Map());
    let state = family.get(inst);
    const policy = this.policy(inst);
    if (state && state.policy !== policy) { this.clear(a, inst); state = undefined; }
    if (!state) {
      state = { owner: a, host: inst, spec, policy, key: `guardArts:${inst.def.id}:${this.state.nextSource++}`,
        plates: 0, plateClock: 0, lastCast: -Infinity, contacts: new Map(), intact: [], broken: [], blasts: [] };
      family.set(inst, state);
    }
    return state;
  }
  sync(a: A): void {
    if (this.p.client()) return;
    for (const [inst, s] of this.states.get(a) ?? []) if (!this.live(s)) this.clear(a, inst);
    if (a.dead || a.downed) return;
    for (const inst of a.skills) {
      if (!inst || !this.p.spec(inst)) continue;
      const s = this.ensure(a, inst)!;
      if (s.spec.intervention && s.spec.absorb) (a.lifeDamageInterceptors ??= new Map()).set(s.key, (amount: number) => {
        if (amount < a.life || a.life <= 0 || !this.live(s) || (a.guardIntervention[inst.def.id] ?? 0) > 0
          || a.invulnerable) return amount;
        // Stamp first: the resulting break burst may itself resolve retaliation.
        a.guardIntervention[inst.def.id] = s.spec.intervention!.cooldown;
        this.p.addBuff(a,{ type: 'buff', id: `guardIntervention:${inst.def.id}`, label: s.spec.intervention!.label,
          duration: s.spec.intervention!.cooldown, mods: [] });
        this.cast(a, inst);
        this.p.cooldown(a, inst);
        return this.p.spendAbsorb(a, amount);
      });
    }
  }
  clear(a: A, inst?: S): void {
    const family = this.states.get(a); if (!family) return;
    for (const [host, s] of [...family]) {
      if (inst && inst !== host) continue;
      a.absorbLayers.delete(s.key);
      a.lifeDamageInterceptors?.delete(s.key);
      this.p.removeBuff(a,`${s.key}:plates`);
      this.p.removeSource(a,`${s.key}:satellites`);
      s.blasts = []; s.intact = []; s.broken = [];
      family.delete(host);
      this.visuals = this.visuals.filter(v => v.owner !== a.id);
      this.p.retireProjectiles(a,host);
    }
  }
  clearAll(): void { for (const a of this.states.keys()) this.clear(a); this.states.clear(); this.visuals = []; }

  /** Rebind surviving bodies at zone boundaries before the next AI/input phase. */
  rebind(): void { for (const a of this.p.actors()) this.sync(a); }

  raised(a: A, inst: S): void {
    const s = this.ensure(a, inst); if (!s) return;
    s.plates = 0; s.plateClock = 0; this.plateBuff(s);
    const bash = this.p.bashSpec(inst);
    if (bash && s.spec.raiseBash) this.p.bash(a, inst, bash, this.p.capacity(a, inst) * s.spec.raiseBash);
  }
  private plateBuff(s: GuardArtState<A,S,D>): void {
    const id = `${s.key}:plates`, p = s.spec.plates;
    this.p.removeBuff(s.owner,id);
    if (p && s.plates > 0) this.p.addBuff(s.owner,{ type: 'buff', id, label: `${p.label} (${s.plates})`, duration: 999999,
      mods: [this.p.modifier('damageTaken', 'more', -Math.min(this.limits.maximumReduction, p.reduction * s.plates))] });
  }
  /** Called only for a damaging guard interception, after the parry gate. */
  guardHit(a: A, inst: S, amount: number): { damage: number; restore: number } {
    const s = this.ensure(a, inst);
    if (!s || amount <= 0) return { damage: amount, restore: 0 };
    const spec = s.spec;
    if (spec.passiveBlockReduction && this.p.random() < this.p.stat(a,'blockChance', this.p.tags(inst), this.p.modifiers(inst))) {
      amount *= 1 - spec.passiveBlockReduction;
    }
    let restore = 0;
    if (spec.plates && s.plates > 0) {
      amount *= 1 - Math.min(this.limits.maximumReduction, spec.plates.reduction * s.plates);
      s.plates--; restore = spec.plateRestore ?? 0; this.plateBuff(s);
    }
    return { damage: amount, restore };
  }
  lower(a: A, inst: S): void {
    const s = this.states.get(a)?.get(inst); if (!s) return;
    s.plates = 0; s.plateClock = 0; this.plateBuff(s);
    // Contact cooldowns intentionally survive quick re-raises.
  }

  /** Normal execution and emergency intervention share this exact payload. */
  cast(a: A, inst: S): boolean {
    const s = this.ensure(a, inst), absorb = s?.spec.absorb;
    if (!s || !absorb) return false;
    const patience = s.spec.patience;
    const power = patience && this.p.time() - s.lastCast + 1e-9 >= patience.seconds ? patience.multiplier : 1;
    s.lastCast = this.p.time();
    const { duration, amount } = this.p.absorb(a, inst, power)!;
    if (amount > 0 && duration > 0) a.absorbLayers.set(s.key, { amount, remaining: duration, source: inst,
      ended: reason => {
        if (!this.live(s)) return;
        const rule = reason === 'broken' ? s.spec.brokenSatellite : s.spec.intactSatellite;
        if (rule) {
          const bank = reason === 'broken' ? s.broken : s.intact;
          bank.push({ expires: this.p.time() + rule.duration, power });
          while (bank.length > rule.max) bank.shift();
          this.satelliteGrants(s);
        }
        if (reason === 'broken' && s.spec.breakBurst) this.burst(s, s.spec.breakBurst.radius, s.spec.breakBurst.power * power);
      } });
    if (s.spec.detonation) {
      const d = s.spec.detonation;
      // Casts are bounded even with extreme cooldown investment.
      if (s.blasts.length < this.limits.pendingBlasts) s.blasts.push({ remaining: d.delay, duration: d.delay, power: d.power * power, radius: d.radius });
    }
    this.p.flash({ pos: { ...a.pos }, radius: a.radius + 12, color: inst.def.color, life: 0.35, maxLife: 0.35 });
    return true;
  }
  private bashFlat(a: A, inst: S, power: number): Partial<Record<string, number>> {
    const bash = this.p.bashSpec(inst);
    const tags = this.p.tags(inst, this.p.grantedTags(inst));
    const element = (['fire', 'cold', 'lightning', 'chaos'] as const).find(t => (tags as ReadonlySet<string>).has(t)) ?? 'physical';
    return { [element]: this.p.capacity(a, inst) * (bash?.mult ?? 0) * power * this.p.stat(a,'bashPower', tags, this.p.modifiers(inst)) };
  }
  private payload(inst:S,delivery:GuardArtDelivery<D>,flat?:GuardArtDamage):S {return this.p.payload(inst,delivery,flat);}
  private burst(s: GuardArtState<A,S,D>, radius: number, power: number): void {
    if (!this.live(s)) return;
    const a = s.owner, inst = s.host;
    radius *= this.p.stat(a,'aoeRadius', this.p.tags(inst), this.p.modifiers(inst));
    const payload = this.payload(inst, { type: 'ground', radius, castRange: 0, delay: 0 });
    for (const e of this.p.enemies(a)) {
      if (a.dead) break;
      if (e.tier === a.tier && dist(a.pos, e.pos) <= radius + e.radius
        && this.p.lineOfSight(a,e)) this.p.hit(a, payload, e, this.bashFlat(a, inst, power));
    }
    this.p.flash({ pos: { ...a.pos }, radius, color: inst.def.color, life: 0.3, maxLife: 0.3 });
  }
  bashWave(a: A, inst: S, flat: Partial<Record<string, number>>): void {
    const wave = this.p.spec(inst)?.bashWave; if (!wave || a.dead) return;
    const scaled = Object.fromEntries(Object.entries(flat).map(([t, v]) => [t, v! * wave.power]));
    const payload = this.payload(inst, wave.delivery, scaled);
    this.p.execute(a, payload, { x: a.pos.x + Math.cos(a.facing) * wave.delivery.range,
      y: a.pos.y + Math.sin(a.facing) * wave.delivery.range },
      { keepFacing: true, noCooldown: true, noRepeat: true, componentUse: true });
  }
  /** Volitional movement only. Physics pushes never enter this seam. */
  ram(a: A, dx: number, dy: number): void {
    if (this.p.client()) return;
    const cs = a.casting;
    if (cs?.mode !== 'guard' || !cs.held || a.dead || a.downed || Math.hypot(dx, dy) < 0.001) return;
    const s = this.ensure(a, cs.inst), r = s?.spec.ram; if (!s || !r) return;
    const heading = Math.atan2(dy, dx), now = this.p.time();
    if (this.p.hasLite()) this.p.promote(a,a.radius+r.reach,this.limits.promotePerFrame);
    for (const e of this.p.enemies(a)) {
      if (a.dead || a.casting !== cs) break;
      const bearing = angleTo(a.pos, e.pos);
      if (e.tier !== a.tier || dist(a.pos, e.pos) > a.radius + e.radius + r.reach
        || Math.abs(angleDiff(a.facing, bearing)) > r.arc * Math.PI / 360
        || Math.abs(angleDiff(heading, bearing)) > Math.PI / 3
        || !this.p.lineOfSight(a,e)) continue;
      const old = s.contacts.get(e.id), opening = !old || now - old.seen >= r.reset;
      if (old) old.seen = now;
      if (old && now + 1e-9 < old.next) continue;
      s.contacts.set(e.id, { next: now + r.interval, seen: now });
      const base = r.base + this.p.stat(a,'thorns', this.p.tags(cs.inst), this.p.modifiers(cs.inst)) * r.thorns + this.p.weight(a) * r.weight;
      const payload = this.payload(cs.inst, { type: 'self' });
      this.p.hit(a, payload, e, { physical: base * (opening ? 1 : r.repeat) }, r.push);
      this.p.flash({ pos: { ...e.pos }, radius: e.radius + 3, color: cs.inst.def.color, life: 0.12, maxLife: 0.12 });
    }
    for (const [id, hit] of s.contacts) if (now - hit.seen > r.reset + r.interval) s.contacts.delete(id);
  }
  private satelliteGrants(s: GuardArtState<A,S,D>): void {
    const mods = [];
    for (const [bank, rule] of [[s.intact, s.spec.intactSatellite], [s.broken, s.spec.brokenSatellite]] as const) {
      if (rule && bank.length) mods.push(this.p.modifier(`satelliteCount_${rule.family}`, 'flat', bank.length));
    }
    if (mods.length) this.p.setSource(s.owner,`${s.key}:satellites`, mods);
    else this.p.removeSource(s.owner,`${s.key}:satellites`);
  }
  /** The existing satellite conductor receives its source skill and bash scale. */
  satellitePayload(a: A, skill: string, slot = 0): S | undefined {
    const sources: { s: GuardArtState<A,S,D>; power: number }[] = [];
    for (const s of this.states.get(a)?.values() ?? []) {
      const rule = s.spec.brokenSatellite;
      if (rule && skill === this.p.satellite(rule.family)?.skill && s.broken.length && this.live(s)) {
        for (const outcome of s.broken) sources.push({ s, power: outcome.power * rule.power });
      }
    }
    if (!sources.length) return undefined;
    const { s, power } = sources[slot % sources.length];
    const def = this.p.satellite(s.spec.brokenSatellite!.family)!;
    const payload = this.payload(s.host, { type: 'ground', radius: def.radius, castRange: 0, delay: 0 }, this.bashFlat(a, s.host, power));
    this.p.appendTags(payload,['satellite',`satellite:${s.spec.brokenSatellite!.family}`]);
    return payload;
  }
  update(dt: number): void {
    for (const a of this.states.keys()) if (!this.p.contains(a)) { this.clear(a); this.states.delete(a); }
    for (const a of this.p.actors()) this.sync(a);
    for (const family of this.states.values()) for (const s of family.values()) {
      if (!this.live(s)) continue;
      const a = s.owner, held = a.casting?.inst === s.host && a.casting.mode === 'guard' && a.casting.held;
      const elapsed = Math.max(0, dt * this.p.scale(a));
      if (held && s.spec.plates) {
        const p = s.spec.plates;
        s.plateClock += elapsed;
        if (s.plateClock + 1e-9 >= p.interval) {
          s.plateClock = Math.max(0, s.plateClock - p.interval) % p.interval;
          s.plates = Math.min(p.max, s.plates + 1); this.plateBuff(s);
          const heal = s.spec.plateHeal;
          if (heal) {
            const radius = heal.radius * this.p.stat(a,'aoeRadius', this.p.tags(s.host), this.p.modifiers(s.host));
            for (const ally of this.p.actors()) if (!ally.dead && !ally.downed && !ally.construct && ally.team === a.team && ally.tier === a.tier
              && dist(a.pos, ally.pos) <= radius + ally.radius && this.p.lineOfSight(a,ally)) {
              this.p.heal(ally,this.p.maxLife(ally) * heal.lifeFraction);
            }
            this.p.flash({ pos: { ...a.pos }, radius, color: '#a8d7b3', life: 0.3, maxLife: 0.3 });
          }
        }
      } else if (s.plates || s.plateClock) this.lower(a, s.host);
      for (const blast of [...s.blasts]) {
        blast.remaining -= elapsed;
        if (blast.remaining <= 1e-9) { s.blasts.splice(s.blasts.indexOf(blast), 1); this.burst(s, blast.radius, blast.power); }
      }
      const count = s.intact.length + s.broken.length;
      s.intact = s.intact.filter(o => o.expires > this.p.time());
      s.broken = s.broken.filter(o => o.expires > this.p.time());
      if (s.intact.length + s.broken.length !== count) this.satelliteGrants(s);
    }
    this.refreshVisuals();
  }
  refreshVisuals(): void {
    this.visuals = this.warnings().map(v => ({ owner: v.owner.id, x: v.owner.pos.x, y: v.owner.pos.y,
      tier: v.owner.tier, radius: v.radius, progress: v.progress, color: v.color }));
    for (const family of this.states.values()) for (const s of family.values()) {
      if (!this.live(s) || !s.plates || s.owner.casting?.inst !== s.host) continue;
      const a = s.owner;
      this.visuals.push({ owner: a.id, x: a.pos.x, y: a.pos.y, tier: a.tier, radius: a.radius + 16,
        progress: s.plates / s.spec.plates!.max, color: s.host.def.color, plates: s.plates, slots: s.spec.plates!.max,
        facing: a.facing, arc: (s.host.def.guard?.arcDeg ?? 120) * Math.PI / 180
          * Math.sqrt(this.p.stat(a,'aoeRadius', this.p.tags(s.host), this.p.modifiers(s.host))) });
    }
  }
  /** Visible charge geometry follows the caster and uses the actual blast reach. */
  warnings(): { owner: A; radius: number; progress: number; color: string }[] {
    return [...this.states.values()].flatMap(f => [...f.values()].filter(s => this.live(s)).flatMap(s => s.blasts.map(b => ({
      owner: s.owner, radius: b.radius * this.p.stat(s.owner,'aoeRadius', this.p.tags(s.host), this.p.modifiers(s.host)),
      progress: 1 - b.remaining / b.duration, color: s.host.def.color,
    }))));
  }
}

export function guardArtsErrors(spec: GuardArtsSpec): string[] {
  const errors: string[] = [];
  const positive = (name: string, ...values: number[]) => {
    if (values.some(v => !Number.isFinite(v) || v <= 0)) errors.push(`guardArts ${name}: values must be finite and positive`);
  };
  for (const key of ['armorRatio', 'plateRestore', 'passiveBlockReduction', 'raiseBash'] as const) {
    if (spec[key] !== undefined && (!Number.isFinite(spec[key]) || spec[key]! < 0)) errors.push(`guardArts ${key}: invalid value`);
  }
  if ((spec.plateRestore ?? 0) > 1 || (spec.passiveBlockReduction ?? 0) > 1) errors.push('guardArts: mitigation/restoration fractions exceed one');
  if (spec.plates) {
    positive('plates', spec.plates.interval, spec.plates.max, spec.plates.reduction);
    if (!Number.isInteger(spec.plates.max) || spec.plates.reduction >= 1 || !spec.plates.label) errors.push('guardArts: invalid plate cap, reduction or label');
  }
  if (spec.plateHeal) positive('plateHeal', spec.plateHeal.radius, spec.plateHeal.lifeFraction);
  if (spec.ram) {
    positive('ram', spec.ram.interval, spec.ram.reset, spec.ram.reach, spec.ram.arc, spec.ram.repeat);
    if ([spec.ram.base, spec.ram.thorns, spec.ram.weight, spec.ram.push].some(v => !Number.isFinite(v) || v < 0)
      || spec.ram.reset < spec.ram.interval) errors.push('guardArts: invalid ram payload or reset');
  }
  if (spec.bashWave) positive('bashWave', spec.bashWave.power, spec.bashWave.delivery.speed, spec.bashWave.delivery.radius, spec.bashWave.delivery.range);
  if (spec.absorb) positive('absorb', spec.absorb.fraction, spec.absorb.duration, spec.absorb.cooldown);
  if (spec.patience) positive('patience', spec.patience.seconds, spec.patience.multiplier);
  for (const rule of [spec.intactSatellite, spec.brokenSatellite]) if (rule) {
    positive('satellite', rule.max, rule.duration);
    if (!Number.isInteger(rule.max) || !rule.family) errors.push('guardArts: invalid satellite family/cap');
  }
  if (spec.brokenSatellite) positive('brokenSatellite', spec.brokenSatellite.power);
  if (spec.intervention) positive('intervention', spec.intervention.cooldown);
  if (spec.detonation) positive('detonation', spec.detonation.delay, spec.detonation.radius, spec.detonation.power);
  if (spec.breakBurst) positive('breakBurst', spec.breakBurst.radius, spec.breakBurst.power);
  return errors;
}

/** Shallow authored patches merge once per distinct node in lexical order.
 * The caller supplies tree lookup; definitions and nested rule records remain
 * borrowed. A payload cannot recursively acquire guard disciplines. */
export function resolveGuardArts<D extends GuardArtProjectile>(inst:{guardArtsPayload?:boolean;treeNodes?:readonly string[];def:{guardArts?:GuardArtsSpec<D>}},node:(id:string)=>GuardArtsSpec<D>|undefined):GuardArtsSpec<D>|undefined {
  if(inst.guardArtsPayload)return undefined;
  let out=inst.def.guardArts;
  for(const id of [...new Set(inst.treeNodes??[])].sort()){
    const patch=node(id);if(patch)out={...out,...patch};
  }
  return out;
}
export interface GuardArtValuePorts<A,S,D extends GuardArtProjectile,Tag extends string,M> {
  spec(inst:S):GuardArtsSpec<D>|undefined;
  tags(inst:S,extra?:Tag[]):Set<Tag>;modifiers(inst:S):M[];
  stat(actor:A,id:string,tags:Set<Tag>,mods:M[]):number;
}
export function guardArtCapacity<A,S extends GuardArtSkill,D extends GuardArtProjectile,Tag extends string,M>(actor:A,inst:S,p:GuardArtValuePorts<A,S,D,Tag,M>):number {
  const tags=p.tags(inst),mods=p.modifiers(inst);
  return Math.max(0,((inst.def.guard?.shieldLife??0)+p.stat(actor,'armor',tags,mods)*(p.spec(inst)?.armorRatio??0))*p.stat(actor,'guardStrength',tags,mods));
}
export function guardArtAbsorb<A,S extends GuardArtSkill,D extends GuardArtProjectile,Tag extends string,M>(actor:A,inst:S,p:GuardArtValuePorts<A,S,D,Tag,M>,power=1):{amount:number;duration:number}|undefined {
  const spec=p.spec(inst)?.absorb;
  return spec?{
    amount:Math.max(0,guardArtCapacity(actor,inst,p)*spec.fraction*power*p.stat(actor,'absorbPower',p.tags(inst),p.modifiers(inst))),
    duration:spec.duration*power*p.stat(actor,'effectDuration',p.tags(inst),p.modifiers(inst)),
  }:undefined;
}
