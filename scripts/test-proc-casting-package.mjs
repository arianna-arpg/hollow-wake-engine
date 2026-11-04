import {verifyProcConsumer} from './proc-package-consumer.mjs';

await verifyProcConsumer({
  name:'proc-casting', exports:['createProcCasting','heldProcSkill'], count:27, browserLimit:5000,
  types:`import {createProcCasting, heldProcSkill, type ProcCastingPorts, type ProcCastActor, type ProcCastInstance, type ProcCastSkill, type ProcHeldSkillPorts} from '@hollow-wake/engine/combat/proc-casting';
type Position={coordinates:[number,number,number]};type Direction={quaternion:[number,number,number,number]};
interface Instance extends ProcCastInstance {customSocketState:Map<string,number>}
interface Skill extends ProcCastSkill {hostPrefab:string}
interface Actor extends ProcCastActor<Position> {hostEntity:bigint}
interface Seat {account:string}
declare const ports:ProcCastingPorts<Actor,Instance,Skill,Position,Direction>, held:ProcHeldSkillPorts<Actor,Instance,Seat>, actor:Actor, inst:Instance;
const service=createProcCasting<Instance,Skill,Position,Direction,Actor>(ports);
const fired:boolean=service.cast(actor,inst,null,3,{skillId:'bolt',count:[2,3],own:true},actor.pos);
const own:Instance|null=heldProcSkill(actor,'bolt',held);
declare const numericPorts:ProcCastingPorts<Actor,number,Skill,Position,Direction>;
const numeric=createProcCasting<number,Skill,Position,Direction,Actor>(numericPorts);
numeric.cast(actor,42,null,3,{skillId:'bolt',count:[1,1]});
declare const gridActor:ProcCastActor<number>,gridPorts:ProcCastingPorts<ProcCastActor<number>,number,Skill,number,Direction>;
createProcCasting<number,Skill,number,Direction,ProcCastActor<number>>(gridPorts).cast(gridActor,0,null,3,{skillId:'bolt',count:[1,1]},0);
ports.spawnProjectile=(a,i,p,d,options)=>{const identity:bigint=a.hostEntity;const sockets:Map<string,number>=i.customSocketState;const position:Position=p;const direction:Direction=d;};
// @ts-expect-error Missing authored count is not an executable cast.
service.cast(actor,null,null,0,{skillId:'bolt'});
// @ts-expect-error Positions retain the host shape.
service.cast(actor,null,null,0,{skillId:'bolt',count:[1,1]},{x:0,y:0});
// @ts-expect-error Directions retain the host shape.
ports.spawnProjectile(actor,inst,actor.pos,0,{depth:0,mult:1});
`,
});
