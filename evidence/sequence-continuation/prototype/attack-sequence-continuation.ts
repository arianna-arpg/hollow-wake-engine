import type {AttackSequences} from './attack-sequences.js';
import {sequenceContinuationState,type SequenceState,type SequenceCast} from './attack-sequence-owned.js';
import type {SequenceActor,SequenceSkill,SequenceProjectile,SequenceBuff,AttackSequenceSpec} from './attack-sequence-types.js';
  /** Continue this controller in an already detached, complete host graph.
   * The enumerable skill/projectile maps must include every retained external
   * handle, including completed casts and retired payloads. Weak keys absent
   * from those maps cannot be discovered. No cast, world replay, clock step,
   * host effect or live-publication operation runs here.
   *
   * Mapping callbacks are trusted synchronous copies: preserve aliases,
   * detach mutable state and never mutate either controller or the live graph.
   * A failed preparation leaves the destination controller unchanged; external
   * effects performed by a caller's mapping callbacks cannot be rolled back. */
  export function copyAttackSequenceState<A extends SequenceActor<A,I,Aim,M,Tag>,I extends SequenceSkill<I,M,Tag,D>,P extends SequenceProjectile<A,I,Aim>,Aim,M,Tag extends string,D extends {type:string}>(source:AttackSequences<A,I,P,Aim,M,Tag,D>,destination:AttackSequences<A,I,P,Aim,M,Tag,D>,mapping: {
    actors: ReadonlyMap<A,A>;
    skills: ReadonlyMap<I,I>;
    projectiles: ReadonlyMap<P,P>;
    buffs: ReadonlyMap<SequenceBuff<M>,SequenceBuff<M>>;
    spec(source: AttackSequenceSpec<M,D>): AttackSequenceSpec<M,D>;
    aim(source: Aim): Aim;
  }): AttackSequences<A,I,P,Aim,M,Tag,D> {
    const owned=source[sequenceContinuationState](),runtime=destination[sequenceContinuationState]();
    if (destination===source || runtime.serial!==0 || runtime.continuationImported
      || runtime.states.size || runtime.active.size || runtime.recoveries.length
      || runtime.scheduled.length || runtime.deferredContacts.length)
      throw Error('Sequence continuation requires a fresh private controller');
    const checkIdentities=<T extends object>(map:ReadonlyMap<T,T>,label:string)=>{
      const originals=new Set(map.keys()),targets=new Set<T>();
      for(const target of map.values()){
        if(!target || typeof target!=='object' || originals.has(target) || targets.has(target))
          throw Error('Sequence continuation requires detached '+label+' identities');
        targets.add(target);
      }
    };
    checkIdentities(mapping.actors,'actor');checkIdentities(mapping.skills,'skill');
    checkIdentities(mapping.projectiles,'projectile');checkIdentities(mapping.buffs,'buff');
    const get=<T>(map:ReadonlyMap<T,T>,source:T,label:string):T=>{
      if(!map.has(source))throw Error('Missing sequence '+label+' mapping');
      return map.get(source)!;
    };
    const actor=(a:A)=>get(mapping.actors,a,'actor'),skill=(i:I)=>get(mapping.skills,i,'skill');
    const projectile=(p:P)=>get(mapping.projectiles,p,'projectile'),buff=(b:SequenceBuff<M>)=>get(mapping.buffs,b,'buff');
    for(const[source,target]of mapping.skills){
      if(source.def.id!==target.def.id)throw Error('Sequence continuation changed skill definition identity');
      if(target.sequenceHost!==(source.sequenceHost?skill(source.sequenceHost):undefined)
        || target.sequenceRole!==source.sequenceRole)throw Error('Sequence continuation lost payload provenance');
    }
    for(const[source,target]of mapping.actors){
      if(target.id!==source.id || target.owner!==(source.owner?actor(source.owner):undefined))
        throw Error('Sequence continuation changed actor identity');
      if(target.skills===source.skills || target.buffs===source.buffs || target.statuses===source.statuses
        || target.skillRecoveryLocks===source.skillRecoveryLocks)
        throw Error('Sequence continuation shares mutable actor state');
      if(target.skills.length!==source.skills.length || source.skills.some((s,n)=>(s?skill(s):null)!==target.skills[n]))
        throw Error('Sequence continuation lost bar identity');
    }
    for(const[source,target]of mapping.projectiles){
      if(target.caster!==actor(source.caster) || target.inst!==skill(source.inst))
        throw Error('Sequence continuation lost projectile ownership');
    }
    const aims=new Map<Aim,Aim>(),specs=new Map<AttackSequenceSpec<M,D>,AttackSequenceSpec<M,D>>();
    const aim=(source:Aim):Aim=>{
      if(aims.has(source))return aims.get(source)!;
      const target=mapping.aim(source);
      if(source!==null && typeof source==='object' && target===source)throw Error('Sequence continuation shares mutable aim');
      aims.set(source,target);return target;
    };
    const spec=(source:AttackSequenceSpec<M,D>)=>{
      if(specs.has(source))return specs.get(source)!;
      const target=mapping.spec(source);
      if(!target || target===source)throw Error('Sequence continuation requires an owned policy snapshot');
      specs.set(source,target);return target;
    };
    const states=new Map<SequenceState<A,I,M,D>,SequenceState<A,I,M,D>>();
    const state=(source:SequenceState<A,I,M,D>):SequenceState<A,I,M,D>=>{
      const found=states.get(source);if(found)return found;
      const ownedBuffs=new Map<A,SequenceBuff<M>>();
      for(const[a,b]of source.buffs){
        const mappedActor=actor(a),mappedBuff=buff(b);
        if(a.buffs.get(b.id)?.def===b && mappedActor.buffs.get(b.id)?.def!==mappedBuff)
          throw Error('Sequence continuation lost actor buff identity');
        ownedBuffs.set(mappedActor,mappedBuff);
      }
      const target:SequenceState<A,I,M,D>={owner:actor(source.owner),host:skill(source.host),spec:spec(source.spec),
        policy:source.policy,key:source.key,stacks:new Map([...source.stacks].map(([a,n])=>[actor(a),n])),
        caught:source.caught,retired:source.retired,buffs:ownedBuffs};
      states.set(source,target);return target;
    };
    const casts=new Map<SequenceCast<A,I,M,D>,SequenceCast<A,I,M,D>>();
    const cast=(source:SequenceCast<A,I,M,D>):SequenceCast<A,I,M,D>=>{
      const found=casts.get(source);if(found)return found;
      const target:SequenceCast<A,I,M,D>={state:state(source.state),inst:skill(source.inst),caught:source.caught,
        connected:source.connected,done:source.done,...(Object.hasOwn(source,'receipt')?{receipt:source.receipt?{...source.receipt,target:actor(source.receipt.target)}:undefined}:{})};
      casts.set(source,target);return target;
    };
    const ownedStates=new Set([...owned.states].map(state)),ownedCasts=new WeakMap<I,SequenceCast<A,I,M,D>>();
    for(const[source,target]of mapping.skills){const known=owned.casts.get(source);if(known)ownedCasts.set(target,cast(known));}
    const active=new Set([...owned.active].map(cast));
    const recoveries=owned.recoveries.map(r=>({...r,cast:cast(r.cast),projectile:projectile(r.projectile),
      ...(Object.hasOwn(r,'target')?{target:r.target?actor(r.target):undefined}:{}),...(Object.hasOwn(r,'marker')?{marker:r.marker?actor(r.marker):undefined}:{}),at:aim(r.at),from:aim(r.from)}));
    const scheduled=owned.scheduled.map(j=>({...j,state:state(j.state),inst:skill(j.inst),aim:aim(j.aim)}));
    const rainAt=new WeakMap<P,number>();
    for(const[source,target]of mapping.projectiles)if(owned.rainAt.has(source))rainAt.set(target,owned.rainAt.get(source)!);
    const deferredContacts=owned.deferredContacts.map(c=>({projectile:projectile(c.projectile),target:actor(c.target)}));
    // Publish controller-owned data only after every mapping and validation.
    destination[sequenceContinuationState]({states:ownedStates,casts:ownedCasts,active,recoveries,scheduled,
      rainAt,deferredContacts,serial:owned.serial,continuationImported:true});return destination;
  }

