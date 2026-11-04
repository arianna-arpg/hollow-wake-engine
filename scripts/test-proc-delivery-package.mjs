import {verifyProcConsumer} from './proc-package-consumer.mjs';

await verifyProcConsumer({
  name:'proc-delivery',exports:['createProcDelivery','countProcSummons'],count:20,modules:['proc-effects'],browserLimit:12*1024,
  types:`import {createProcDelivery, countProcSummons, type ProcDeliveryActor, type ProcDeliveryDefinition, type ProcDeliveryPorts, type DeliveryBuff} from '@hollow-wake/engine/combat/proc-delivery';
type Position = {coordinates:[number,number,number]};
type Direction = {quaternion:[number,number,number,number]};
type Damage = 'fire' | 'ice';
interface Buff extends DeliveryBuff { hostModifier:string }
interface Birth { prefab:string }
interface Actor extends ProcDeliveryActor<Actor,number,Position,Buff,Damage,bigint> { entity:bigint }
interface Definition extends ProcDeliveryDefinition<Buff,Birth,Damage> { registryOrdinal:number }
declare const actor:Actor, target:Actor, definition:Definition;
declare const ports:ProcDeliveryPorts<Actor,number,Position,Direction,Buff,Birth,Damage,bigint,Definition>;
const service=createProcDelivery<number,Position,Direction,Buff,Birth,Damage,bigint,Actor,Definition>(ports);
service.execute(definition,actor,0,target,2,actor.pos);
service.execute({...definition,effect:{type:'birth',birth:{prefab:'wyvern'}}},actor,null,target);
const count:number=countProcSummons([actor,target],actor,'key');
const numericOwner:number=countProcSummons([{owner:0,dead:false,sourceSkillId:'key'}],0,'key');
const extraHit:Extract<Definition['effect'],{type:'extraHit'}>={type:'extraHit',damageScale:1};
const collision:Extract<Definition['effect'],{type:'collisionDamage'}>={type:'collisionDamage',damageScale:0.5};
ports.arcTrail=(from,to,def)=>{const id:bigint=from.entity;const ordinal:number=def.registryOrdinal;};
ports.forwardSockets=(inst,summon)=>{const handle:number=inst;};
// @ts-expect-error Damage types are owned by the host.
service.execute({...definition,effect:{type:'burst',damage:'unknown',radius:1,base:1,perLevel:1}},actor,0,target);
// @ts-expect-error Birth definitions retain their host schema.
service.execute({...definition,effect:{type:'birth',birth:{wrong:1}}},actor,null,target);
// @ts-expect-error Directions retain the host's quaternion representation.
ports.push(actor,0,10);
// @ts-expect-error A magnitude-only explosion lacks its execution radius.
service.execute({...definition,effect:{type:'explosion',damageScale:1}},actor,0,target);
`,
});
