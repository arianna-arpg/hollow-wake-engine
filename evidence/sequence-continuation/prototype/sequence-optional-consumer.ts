import {AttackSequences,type AttackSequencePorts,type SequenceActor,type SequenceSkill,type SequenceProjectile,type SequenceBuff,type AttackSequenceSpec} from '@hollow-wake/engine/combat/attack-sequences';
import {copyAttackSequenceState} from '@hollow-wake/engine/combat/attack-sequence-continuation';
type Position={x:number;y:number;z:number};type Mod={stat:string;value:number};type Delivery={type:'melee';range:number;arcDeg:number}|{type:'projectile';speed:number;range:number;radius:number};
interface Skill extends SequenceSkill<Skill,Mod,string,Delivery>{customSkill:string}
interface Actor extends SequenceActor<Actor,Skill,Position,Mod,string>{customActor:string}
interface Projectile extends SequenceProjectile<Actor,Skill,Position>{customProjectile:string}
declare const ports:AttackSequencePorts<Actor,Skill,Projectile,Position,Mod,string,Delivery>;
declare const actors:ReadonlyMap<Actor,Actor>,skills:ReadonlyMap<Skill,Skill>,projectiles:ReadonlyMap<Projectile,Projectile>,buffs:ReadonlyMap<SequenceBuff<Mod>,SequenceBuff<Mod>>;
declare const cloneSpec:(s:AttackSequenceSpec<Mod,Delivery>)=>AttackSequenceSpec<Mod,Delivery>;
const source=new AttackSequences(ports),destination=new AttackSequences(ports),mapping={actors,skills,projectiles,buffs,spec:cloneSpec,aim:(p:Position)=>({...p})};
const returned:typeof destination=copyAttackSequenceState(source,destination,mapping);void returned;
// @ts-expect-error The complete host position survives the continuation boundary.
copyAttackSequenceState(source,destination,{...mapping,aim:p=>({x:p.x,y:p.y})});
// @ts-expect-error Preparation callbacks must return synchronously.
copyAttackSequenceState(source,destination,{...mapping,aim:async p=>({...p})});
// @ts-expect-error Policy snapshots cannot be promises.
copyAttackSequenceState(source,destination,{...mapping,spec:async s=>s});
// @ts-expect-error Identity maps contain full host actors, not numeric IDs.
copyAttackSequenceState(source,destination,{...mapping,actors:new Map<number,number>()});
// @ts-expect-error Skill identity is distinct from actor identity.
copyAttackSequenceState(source,destination,{...mapping,skills:actors});
// @ts-expect-error Projectile identity maps cannot substitute skills.
copyAttackSequenceState(source,destination,{...mapping,projectiles:skills});
// @ts-expect-error Buff definitions retain the host modifier shape.
copyAttackSequenceState(source,destination,{...mapping,buffs:new Map<SequenceBuff<string>,SequenceBuff<string>>()});
// @ts-expect-error Every map is explicit, even when it is empty.
copyAttackSequenceState(source,destination,{actors,skills,projectiles,spec:cloneSpec,aim:(p:Position)=>p});
// @ts-expect-error Ordinary controllers do not eagerly expose the optional service.
source.copyOwnedStateTo(destination,mapping);
