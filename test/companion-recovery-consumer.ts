import {CompanionRecovery,type CompanionRecoveryActor,type CompanionRecoveryPorts,type CompanionRecoveryStatus} from '@hollow-wake/engine/companions/recovery';
interface Pending extends CompanionRecoveryStatus {payload:{power:number}}
interface Pet extends CompanionRecoveryActor<Pet,Pending> {team:number}
declare const pet:Pet;
const ports:CompanionRecoveryPorts<Pet>={
 rules:()=>({seconds:3,divideByPack:true,cleanse:true,status:'recovery'}),actors:()=>[pet],
 status:id=>id==='recovery'?{duration:1,beneficial:true}:undefined,
 cleanse:actor=>{actor.team+=0;},endStatus:(actor,id)=>{void actor.team;void id;},
 applyStatus:(actor,id,dps,scale,name)=>{void actor.team;void id;void dps;void scale;void name;},
 maxLife:actor=>actor.team+100,revivalCue:actor=>{void actor.team;},
};
new CompanionRecovery<Pet,Pending>(ports).revive(pet,.4);
const inferred=new CompanionRecovery(ports);inferred.recover(pet);inferred.revive(pet);
// @ts-expect-error Not a complete host actor.
inferred.recover({life:100});
// @ts-expect-error Fractions are numeric host policy inputs.
inferred.revive(pet,'half');
// @ts-expect-error The pending-status payload needs an explicit status id.
new CompanionRecovery<Pet,{payload:number}>(ports);
