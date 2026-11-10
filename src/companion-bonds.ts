import type {CompanionBondSpec,CompanionSaved} from './companion-bond-rules.js';
export {resolveCompanionBond,companionLevelOf,companionRecoverySeconds,DEFAULT_COMPANION_RULES} from './companion-bond-rules.js';
export type {CompanionBondSpec,CompanionSaved,CompanionRules} from './companion-bond-rules.js';

export interface CompanionPoint {x:number;y:number}
export interface CompanionBondSkill {
  def:{id:string;tags:readonly string[];delivery:{type:string};effects:readonly {type:string}[];
    targeting?:unknown;channel?:unknown;guard?:unknown;chargeCost?:unknown;pool?:unknown;concentration?:unknown;comboChain?:unknown};
  treeNodes?:readonly string[];level:number;hostSkillId?:string;
  sockets:readonly ({def:{id:string};level:number}|null)[];
}
export interface CompanionBondActor<A,S,R extends string=string> {
  id:number;owner?:A;sourceSkillId?:string;skills:(S|null)[];
  radius:number;level:number;life:number;pliesMax:number;plies:number;pos:CompanionPoint;
  dead:boolean;downed:boolean;companion:boolean;companionDormant:boolean;companionReviveRemaining?:number;
  brain?:unknown;casting:{inst:S}|null;passive:boolean;ambushArmed:boolean;untargetable:boolean;aiAwakened:boolean;
  bequestSignature?:string;guardMode:boolean;cooldowns:Map<string,number>;buffs:ReadonlyMap<string,{stacks:number}>;
  bondGroup?:string;defId?:string;rarity?:R;name:string;spawnScale?:number;
}
export interface CompanionInherited<M> {ownerMods:M[];combatMods:M[];size:number;guard:boolean;plyBonus:number}
export interface CompanionBondState<A,S,M> {
  inst:S;native:(S|null)[];granted:Map<string,S>;spec:CompanionBondSpec<M>;policy:string;sheet:string;
  baseRadius:number;claimedLevel:number;stanceId:string;orbAt:number;chargeAt:number;echoAt:number;dreadAt:number;
  exposure:Map<A,number>;pulseUntil:number;pulseAt:number;issued:Set<S>;
}
export interface CompanionBondsState<A,S extends object,M> {bodies:Map<A,CompanionBondState<A,S,M>>;copies:WeakSet<S>}
export function createCompanionBondsState<A,S extends object,M>():CompanionBondsState<A,S,M>{return{bodies:new Map(),copies:new WeakSet()};}
export interface CompanionRepeat<A,S> {caster:A;inst:S;aim:CompanionPoint;n:number;k:number;timer:number;interval:number;dmgMult:number;aoeMult:number;scaleStep:number;retarget:boolean}
/** Trusted synchronous operations on one complete actor/skill graph. Effects may
 * change later reads. Exceptions retain preceding writes; no transactional graph
 * clone or live-publication authority is supplied by this controller. */
export interface CompanionBondPorts<A,S,M,I extends CompanionInherited<M>,C> {
  actors():readonly A[];contains(actor:A):boolean;time():number;random():number;
  spec(inst:S):CompanionBondSpec<M>;level(keeper:number,claimed:number):number;capacity(inst:S):number;
  relevel(actor:A,level:number):void;recoveryStatus():string;endStatus(actor:A,id:string):void;
  stanceId(owner:A,inst:S):string;stance(id:string):{lunges:boolean;cue?:C};setStance(actor:A,id:string):void;
  inherit(owner:A,inst:S,bodyId?:string):I;plyBonus(actor:A,amount:number):void;bequests(actor:A,inherited:I):void;
  maxLife(actor:A):number;setSource(actor:A,key:string,mods:M[]):void;removeSource(actor:A,key:string):void;
  sourceNames(actor:A):string[];sourceMods(actor:A,key:string):M[]|undefined;
  hasSkill(id:string):boolean;makeSkill(id:string,level:number):S;familySkill(bodyId?:string):string;
  dreadSkill(damage:number,level:number):S;copyForMimic(inst:S):S;
  retirePayloads(actor:A,owned:ReadonlySet<S>):void;payloadActive(actor:A,inst:S):boolean;
  removeBuff(actor:A,key:string):void;addBuff(actor:A,buff:{type:'buff';id:string;label:string;duration:number;maxStacks?:number;mods:M[]}):void;
  modifier(stat:string,kind:'increased',value:number,tags?:string[]):M;
  revive(actor:A,power:number):void;enemies(actor:A):readonly A[];
  flash(value:{pos:CompanionPoint;radius:number;color:string;life:number;maxLife:number}):void;
  pulseHit(actor:A,inst:S,target:A,power:number):void;
  execute(actor:A,inst:S,aim:CompanionPoint,options:{noRepeat:true;noCooldown?:true}):void;
  use(actor:A,inst:S,aim:CompanionPoint):void;repeat(value:CompanionRepeat<A,S>):void;
  orb(kind:string,pos:CompanionPoint):void;charge(actor:A,id:string,amount:number,tier:number):void;
  command(actor:A,command:{kind:'assault';targetId?:number;pos:CompanionPoint;until:number}):void;
  cue(actor:A,owner:A,spec:C|undefined):void;
}
const dist=(a:CompanionPoint,b:CompanionPoint)=>Math.hypot(a.x-b.x,a.y-b.y);

/** Ordinary melee copies cannot duplicate resource banks, summons or held casts. */
export function companionCanMimic(inst: CompanionBondSkill): boolean {
  const d = inst.def;
  return d.tags.includes('melee') && d.tags.includes('attack')
    && ['melee', 'cone', 'nova'].includes(d.delivery.type)
    && !d.targeting && !d.channel && !d.guard && !d.chargeCost && !d.pool
    && !d.concentration && !d.comboChain
    && d.effects.every(f => ['damage', 'status', 'knockback', 'buff', 'heal', 'charge'].includes(f.type));
}

/** Complete identity maps include effect queues and external skill handles. */
export interface CompanionBondForkMapping<A,S,M> {
  actors:ReadonlyMap<A,A>;
  skills:ReadonlyMap<S,S>;
  spec(source:CompanionBondSpec<M>):CompanionBondSpec<M>;
}

/** Per-world, per-owner companion state. Only the saved revival countdown is
 * durable; skills, stats, preparations and pending copies rebuild from data. */
export class CompanionBonds<A extends CompanionBondActor<A,S,R>,S extends CompanionBondSkill,M,I extends CompanionInherited<M>,R extends string,C> {
  constructor(private readonly p:CompanionBondPorts<A,S,M,I,C>,readonly state:CompanionBondsState<A,S,M>=createCompanionBondsState()) {}
  /** Maps cover every actor/skill reachable from the private graph,
   * including queues and external handles. The operation cannot enumerate a
   * WeakSet to discover skills the graph owner omitted. */
  forkOwnedState(ports:CompanionBondPorts<A,S,M,I,C>,mapping:CompanionBondForkMapping<A,S,M>):CompanionBonds<A,S,M,I,R,C> {
    return this.copyOwnedStateTo(new CompanionBonds(ports),mapping);
  }
  /** The destination belongs to a detached graph and has no body state.
   * Replace its copy history with the source history for the complete supplied
   * skill map; old destination graph handles must not enter the new graph. */
  copyOwnedStateTo(runtime:CompanionBonds<A,S,M,I,R,C>,mapping:CompanionBondForkMapping<A,S,M>):CompanionBonds<A,S,M,I,R,C> {
    if(runtime===this||runtime.state===this.state||runtime.state.bodies===this.state.bodies||runtime.state.bodies.size)throw Error('Companion continuation requires an empty private controller');
    const sourceActors=new Set(mapping.actors.keys()),sourceSkills=new Set(mapping.skills.keys()),actorTargets=new Set<A>(),skillTargets=new Set<S>();
    const actor=(source:A):A=>{const target=mapping.actors.get(source);if(!target)throw Error('Missing companion actor mapping');return target;};
    const skill=(source:S):S=>{const target=mapping.skills.get(source);if(!target)throw Error('Missing companion skill mapping');return target;};
    for(const[source,target]of mapping.skills){
      if(sourceSkills.has(target)||skillTargets.has(target))throw Error('Companion continuation requires detached skill identities');
      if(target.def.id!==source.def.id)throw Error('Companion continuation requires stable skill definitions');
      skillTargets.add(target);
    }
    for(const[source,target]of mapping.actors){
      if(sourceActors.has(target)||actorTargets.has(target)||target.skills===source.skills||target.pos===source.pos||target.cooldowns===source.cooldowns||target.buffs===source.buffs)throw Error('Companion continuation requires detached actor ownership');
      if(target.id!==source.id||target.sourceSkillId!==source.sourceSkillId)throw Error('Companion continuation requires stable actor identities');
      actorTargets.add(target);
      if(target.owner!==(source.owner?actor(source.owner):undefined))throw Error('Companion continuation lost owner identity');
      if(target.skills.length!==source.skills.length||source.skills.some((s,index)=>(s?skill(s):null)!==target.skills[index]))throw Error('Companion continuation lost bar identity');
      if(source.casting?(!target.casting||target.casting===source.casting||target.casting.inst!==skill(source.casting.inst)):!!target.casting)throw Error('Companion continuation lost cast identity');
    }
    const plans:[A,CompanionBondState<A,S,M>][]=[];
    for(const[beast,s]of this.states){
      const target=actor(beast);
      plans.push([target,{inst:skill(s.inst),native:s.native.map(i=>i&&skill(i)),granted:new Map([...s.granted].map(([key,i])=>[key,skill(i)])),
        spec:mapping.spec(s.spec),policy:s.policy,sheet:s.sheet,baseRadius:s.baseRadius,claimedLevel:s.claimedLevel,stanceId:s.stanceId,
        orbAt:s.orbAt,chargeAt:s.chargeAt,echoAt:s.echoAt,dreadAt:s.dreadAt,pulseUntil:s.pulseUntil,pulseAt:s.pulseAt,
        exposure:new Map([...s.exposure].map(([a,n])=>[actor(a),n])),issued:new Set([...s.issued].map(skill))}]);
    }
    const copies=new WeakSet<S>();
    for(const[source,target]of mapping.skills)if(this.copies.has(source))copies.add(target);
    // No acquisition, refresh, clock step or host effect runs during copying.
    runtime.state.copies=copies;
    for(const[beast,s]of plans)runtime.state.bodies.set(beast,s);
    return runtime;
  }

  private get states(){return this.state.bodies;}
  private get copies(){return this.state.copies;}

  host(beast: A): S | undefined {
    const id = beast.sourceSkillId?.replace('__companion:', '');
    return beast.owner?.skills.find(s => s?.def.id === id) ?? undefined;
  }
  private key(beast: A) { return `companion_bond:${beast.owner!.id}:${this.host(beast)?.def.id ?? ''}`; }
  private rallyId(beast: A) { return this.key(beast) + ':rally'; }
  private frenzyId(beast: A) { return this.key(beast) + ':frenzy'; }

  adopt(beast: A): void {
    const inst = this.host(beast);
    if (!inst || !beast.owner) return;
    this.states.set(beast, { inst, native: [...beast.skills], granted: new Map(), spec: {}, policy: '', sheet: '',
      baseRadius: beast.radius, claimedLevel: Math.max(1, beast.level), stanceId: '',
      orbAt: 0, chargeAt: 0, echoAt: 0, dreadAt: 0, exposure: new Map(), pulseUntil: 0, pulseAt: 0, issued: new Set() });
    // Owned animals accept orders instead of retaining a wild hunger/flee script.
    beast.brain = {};
    beast.casting = null;
    beast.passive = false;
    beast.ambushArmed = false;
    this.p.removeSource(beast,'ambush');
    beast.untargetable = false;
    beast.aiAwakened = true;
    this.refreshBeast(beast, inst, false);
  }

  private clearPayloads(beast: A, state: CompanionBondState<A,S,M>): void {
    const owned = new Set([...state.issued, ...state.granted.values()]);
    this.p.retirePayloads(beast,owned);
    if (beast.casting && (state.issued.has(beast.casting.inst) || [...state.granted.values()].includes(beast.casting.inst))) beast.casting = null;
    state.issued.clear(); state.exposure.clear(); state.pulseUntil = 0;
    state.echoAt = this.p.time() + (state.spec.mimicMelee?.cooldown ?? 0);
    for (const actor of [beast, beast.owner!]) if (actor) {
      this.p.removeBuff(actor,this.rallyId(beast)); this.p.removeBuff(actor,this.frenzyId(beast));
    }
  }

  private refreshBeast(beast: A, inst: S, dormant: boolean): void {
    if (!this.states.has(beast)) this.adopt(beast);
    const state = this.states.get(beast)!;
    const spec = this.p.spec(inst), owner = beast.owner!;
    const policy = JSON.stringify([inst.treeNodes, inst.sockets.map(s => s && [s.def.id, s.level]), dormant]);
    if (state.policy && state.policy !== policy) this.clearPayloads(beast, state);
    state.policy = policy; state.spec = spec; state.inst = inst;
    beast.companionDormant = dormant;
    if (dormant) {
      beast.downed = true; beast.life = 0; beast.companionReviveRemaining = undefined;
      this.p.endStatus(beast,this.p.recoveryStatus());
    }
    // THE GROWING BOND (COMPANION_CFG.level): the body's level follows its
    // keeper — re-stamped in place through the one monster level fold
    // (host relevel: life kept as a fraction, the native kit on the
    // monster ladder; the granted arts re-mint at body level below).
    const level = this.p.level(owner.level, state.claimedLevel);
    const grew = beast.level !== level;
    const plyFraction = beast.pliesMax > 0 ? beast.plies / beast.pliesMax : 1;
    if (grew) this.p.relevel(beast, level);
    // THE STANCE (engine/companionStances.ts): the keeper's held conduct for
    // this bond becomes the beast's standing order — the order beneath every
    // issued one; a dormant body wears none. Re-stamped only on change.
    const stanceId = dormant ? '' : this.p.stanceId(owner,inst);
    if (state.stanceId !== stanceId) {
      state.stanceId = stanceId;
      this.p.setStance(beast,stanceId);
    }
    const inherited = this.p.inherit(owner, inst, beast.defId);
    const mods = dormant ? [] : [...inherited.ownerMods, ...(spec.beastMods ?? [])];
    const combatMods = dormant ? [] : inherited.combatMods;
    const sig = JSON.stringify([mods, combatMods]);
    if (state.sheet !== sig) {
      const fraction = beast.life / Math.max(1, this.p.maxLife(beast));
      this.p.setSource(beast,'companionBond', mods); state.sheet = sig;
      this.p.setSource(beast,'minionCombat', combatMods);
      beast.life = Math.min(this.p.maxLife(beast), this.p.maxLife(beast) * fraction);
    }
    beast.radius = dormant ? state.baseRadius : Math.max(5, state.baseRadius * inherited.size);
    beast.guardMode = !dormant && inherited.guard;
    this.p.plyBonus(beast, dormant ? 0 : inherited.plyBonus);
    if (grew) beast.plies = Math.round(beast.pliesMax * plyFraction);
    // Bequests query the same host/body context, including socket-local grants.
    // Dormant bonds are downed and cannot benefit until capacity returns.
    if (dormant) { this.p.removeSource(beast,'bequest'); beast.bequestSignature = undefined; }
    else this.p.bequests(beast,inherited);
    const arts = new Set(dormant ? [] : (spec.beastSkills ?? []));
    if (!dormant && spec.familyArt) {
      arts.add(this.p.familySkill(beast.defId));
    }
    if (!dormant && beast.buffs.has(this.frenzyId(beast)) && spec.frenzy) arts.add(spec.frenzy.gapCloser);
    // Even a naturally peaceful animal needs an ordinary attack once bonded.
    if (!dormant && !state.native.some(s => s?.def.effects.some(f => f.type === 'damage'))) arts.add('claw');
    // Granted arts mint at BODY level and re-mint when the bond grows (a
    // stale instance would keep yesterday's damage ladder); a cast in flight
    // on the old instance yields — the cooldown ledger is keyed by id and
    // survives the swap.
    const artLevel = Math.max(1, beast.level);
    for (const id of arts) {
      const held = state.granted.get(id);
      if ((held && held.level === artLevel) || !this.p.hasSkill(id)) continue;
      if (held && beast.casting?.inst === held) beast.casting = null;
      state.granted.set(id, this.p.makeSkill(id, artLevel));
    }
    for (const [id, granted] of state.granted) if (!arts.has(id)) {
      if (beast.casting?.inst === granted) beast.casting = null;
      state.granted.delete(id); beast.cooldowns.delete(id);
    }
    beast.skills = [...state.native, ...[...state.granted].filter(([id]) => !state.native.some(s => s?.def.id === id)).map(([, s]) => s)];
  }

  refresh(): void {
    for (const [beast, state] of this.states) if (beast.dead || !beast.companion || !this.host(beast) || !this.p.contains(beast)) {
      this.clearPayloads(beast, state); this.p.removeSource(beast,'companionBond'); beast.skills = state.native;
      this.p.removeSource(beast,'minionCombat'); this.p.removeSource(beast,'bequest'); beast.bequestSignature = undefined;
      beast.radius = state.baseRadius; beast.guardMode = false; this.p.plyBonus(beast, 0);
      this.p.setStance(beast,'');
      this.p.endStatus(beast,this.p.recoveryStatus());
      this.states.delete(beast);
    }
    const groups = new Map<S, A[]>();
    for (const beast of this.p.actors()) if (!beast.dead && beast.companion && beast.owner) {
      const inst = this.host(beast); if (!inst) continue;
      const list = groups.get(inst) ?? []; list.push(beast); groups.set(inst, list);
    }
    for (const [inst, beasts] of groups) {
      const active = new Set([...new Set(beasts.map(b => b.bondGroup ?? String(b.id)))].slice(0, this.p.capacity(inst)));
      for (const beast of beasts) this.refreshBeast(beast, inst, !active.has(beast.bondGroup ?? String(beast.id)));
    }
  }

  update(dt: number): void {
    this.refresh();
    for (const [beast, state] of this.states) {
      const owner = beast.owner!, spec = state.spec;
      if (beast.companionDormant || owner.dead || owner.downed) continue;
      if (beast.downed) {
        if (spec.reviveSeconds) {
          beast.companionReviveRemaining ??= spec.reviveSeconds;
          beast.companionReviveRemaining = Math.max(0, beast.companionReviveRemaining - dt);
          if (beast.companionReviveRemaining <= 0) this.p.revive(beast, 1);
        } else beast.companionReviveRemaining = undefined;
        continue;
      }
      beast.companionReviveRemaining = undefined;
      // Completed instant copies need no persistent ownership entry. Retain
      // only payloads still in flight so a long-lived bond stays bounded.
      for (const issued of state.issued) if (!this.p.payloadActive(beast,issued)) state.issued.delete(issued);
      if (spec.dread) {
        const dread = spec.dread;
        const nearby = this.p.enemies(beast).filter(a => !a.dead && !a.untargetable && !a.passive && dist(a.pos, beast.pos) <= dread.radius);
        for (const victim of state.exposure.keys()) if (!nearby.includes(victim)) state.exposure.delete(victim);
        if (this.p.time() >= state.dreadAt) {
          state.dreadAt = this.p.time() + dread.interval;
          this.p.flash({ pos: { ...beast.pos }, radius: dread.radius, color: '#796092', life: 0.25, maxLife: 0.25 });
          for (const victim of nearby) {
            const stacks = Math.min(dread.maxStacks, (state.exposure.get(victim) ?? 0) + 1); state.exposure.set(victim, stacks);
            const pulse = this.p.dreadSkill(dread.damage,beast.level);
            this.p.pulseHit(beast, pulse, victim, 1 + (stacks - 1) * dread.ramp);
          }
        }
      }
      if (spec.whistle && state.pulseUntil > this.p.time() && this.p.time() >= state.pulseAt) {
        state.pulseAt = this.p.time() + spec.whistle.interval;
        const pulse = this.p.makeSkill(spec.whistle.pulseSkill, beast.level);
        this.p.execute(beast, pulse, beast.pos, { noRepeat: true, noCooldown: true });
      }
    }
  }

  /** Called after a landed top-level hit, before ordinary consumed buffs clear. */
  down(beast: A): void {
    this.p.endStatus(beast,this.p.recoveryStatus());
    const state = this.states.get(beast);
    if (state) this.clearPayloads(beast, state);
    beast.companionReviveRemaining = state?.spec.reviveSeconds;
  }

  onHit(caster: A, inst: S, target: A): void {
    if (this.copies.has(inst) || !inst.def.tags.includes('attack')) return;
    const state = this.states.get(caster);
    if (state && !caster.downed && !caster.companionDormant) {
      const spec = state.spec;
      if (spec.attackOrb && this.p.time() >= state.orbAt && this.p.random() < spec.attackOrb.chance) {
        state.orbAt = this.p.time() + spec.attackOrb.cooldown;
        this.p.orb(spec.attackOrb.kind, target.pos);
      }
      if (spec.attackCharge && this.p.time() >= state.chargeAt && this.p.random() < spec.attackCharge.chance) {
        state.chargeAt = this.p.time() + spec.attackCharge.cooldown;
        this.p.charge(caster,spec.attackCharge.id, 1, 3);
      }
      this.partnerHit(caster, target, caster, state, [caster.owner!]);
    } else {
      const groups = new Map<S, [A, CompanionBondState<A,S,M>][]>();
      for (const [beast, s] of this.states) if (beast.owner === caster && !beast.dead && !beast.downed && !beast.companionDormant) {
        const members = groups.get(s.inst) ?? []; members.push([beast, s]); groups.set(s.inst, members);
      }
      for (const members of groups.values()) this.partnerHit(caster, target, members[0][0], members[0][1], members.map(([b]) => b));
    }
  }

  private partnerHit(caster: A, target: A, beast: A, state: CompanionBondState<A,S,M>, recipients: A[]): void {
    const spec = state.spec, rally = spec.rally;
    if (!rally || caster.dead || caster.downed) return;
    const id = this.rallyId(beast), cap = rally.maxStacks + (spec.rallyCapAdd ?? 0);
    const stacks = caster.buffs.get(id)?.stacks ?? 0;
    this.p.removeBuff(caster,id);
    for (const recipient of recipients) if (!recipient.dead && !recipient.downed) {
      this.p.addBuff(recipient,{ type: 'buff', id, label: 'Hunting Partners', duration: rally.duration, maxStacks: cap, mods: [this.p.modifier('damage', 'increased', rally.damagePerStack, ['attack'])] });
      if (stacks >= cap && spec.frenzy) {
        this.p.addBuff(recipient,{ type: 'buff', id: this.frenzyId(beast), label: 'Pack Crescendo', duration: spec.frenzy.duration, mods: [this.p.modifier('attackSpeed', 'increased', spec.frenzy.attackSpeed)] });
        if (recipient.companion) {
          this.refreshBeast(recipient, state.inst, false);
          // THE LUNGE obeys the stance (CompanionStanceDef.lunges): a passive
          // beast keeps the crescendo's haste and its heel — only a stance
          // that lunges takes the bond-driven charge.
          if (this.lunges(recipient)) {
            this.p.command(recipient,{ kind: 'assault', targetId: target.id, pos: { ...target.pos }, until: this.p.time() + spec.frenzy.duration });
            const pursuit = recipient.skills.find(s => s?.def.id === spec.frenzy!.gapCloser);
            if (pursuit) this.p.use(recipient, pursuit, target.pos);
          }
        }
      }
    }
  }

  onCast(owner: A, inst: S, aim: CompanionPoint): void {
    if (!companionCanMimic(inst) || this.copies.has(inst) || owner.companion) return;
    for (const [beast, state] of this.states) {
      const spec = state.spec.mimicMelee;
      if (!spec || beast.owner !== owner || beast.dead || beast.downed || beast.companionDormant || this.p.time() < state.echoAt) continue;
      state.echoAt = this.p.time() + spec.cooldown;
      const copy = this.p.copyForMimic(inst);
      this.copies.add(copy); state.issued.add(copy);
      this.p.repeat({ caster: beast, inst: copy, aim: { ...aim }, n: 1, k: 0, timer: 0.15, interval: 0.15, dmgMult: spec.power, aoeMult: 1, scaleStep: 0, retarget: false });
    }
  }

  whistle(owner: A, inst: S, aim: CompanionPoint): void {
    for (const [beast, state] of this.states) if (beast.owner === owner && (!inst.hostSkillId || state.inst.def.id === inst.hostSkillId) && !beast.downed && !beast.companionDormant && state.spec.whistle) {
      const spec = state.spec.whistle;
      state.pulseUntil = this.p.time() + spec.duration; state.pulseAt = this.p.time();
      // The rally's charge toward the aim is a bond-driven order: it obeys the
      // stance's `lunges` — a passive pack is revived, healed and recalled
      // and pulses at heel; it does not charge.
      if (this.lunges(beast)) this.p.command(beast,{ kind: 'assault', pos: { ...aim }, until: state.pulseUntil });
    }
  }

  /** Does this beast's stance take bond-driven charges (CompanionStanceDef.lunges)? */
  private lunges(beast: A): boolean {
    return this.p.stance(this.states.get(beast)?.stanceId ?? '').lunges;
  }

  /** The passive revival clock a downed beast counts down on
   *  (CompanionBondSpec.reviveSeconds), or undefined when the bond has none —
   *  THE LITTER'S CLOCK ring (World.dwellRingsView) reads it. */
  reviveClock(beast: A): number | undefined {
    return this.states.get(beast)?.spec.reviveSeconds;
  }

  /** THE SHIFT SHOWS: each living beast of the bond wears the stance and
   *  casts the tree's stance art (CompanionBondSpec.stanceArt) at its own
   *  feet — the hook a tree node hangs on a behavioral change. Returns the
   *  beasts reached. */
  stanceShift(owner: A, skillId: string, stanceId: string): number {
    const st = this.p.stance(stanceId);
    let reached = 0;
    for (const [beast, state] of this.states) {
      if (beast.owner !== owner || state.inst.def.id !== skillId
        || beast.dead || beast.downed || beast.companionDormant) continue;
      reached++;
      this.p.cue(beast, owner, st.cue);
      const artId = state.spec.stanceArt;
      if (artId && this.p.hasSkill(artId)) {
        const art = this.p.makeSkill(artId, Math.max(1, beast.level));
        state.issued.add(art);
        this.p.execute(beast, art, beast.pos, { noRepeat: true });
      }
    }
    return reached;
  }

  saved(beast: A): CompanionSaved<M,R> {
    return { defId: beast.defId!, level: beast.level, skillId: beast.sourceSkillId!.replace('__companion:', ''),
      radius: this.states.get(beast)?.baseRadius ?? beast.radius,
      ...(beast.spawnScale !== undefined ? { spawnScale: beast.spawnScale } : {}),
      ...(beast.downed ? { downed: true } : {}), ...(beast.rarity ? { rarity: beast.rarity, name: beast.name,
        raritySources: this.p.sourceNames(beast).filter(s => s === 'rarity' || s.startsWith('rarityStack')).map(s => [s, this.p.sourceMods(beast,s)!] as [string, M[]]) } : {}),
      ...(beast.companionReviveRemaining !== undefined ? { reviveRemaining: beast.companionReviveRemaining } : {}) };
  }
}
