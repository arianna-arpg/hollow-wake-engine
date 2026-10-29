import {lockSequenceRecovery,settleSequenceRecoveries} from '@hollow-wake/engine/combat/sequence-recovery';

/** The host supplies flight/queue/pickup observations after its movement phase. */
export function runSequenceRecoveryCycle(){
  const owner={skillRecoveryLocks:new Set(),cooldowns:new Map(),cooldownTotals:new Map()};
  const state={owner,host:{def:{id:'axe'}},spec:{recovery:{missCooldown:1},catchBuff:true},caught:2};
  const cast={state,connected:true,caught:0,done:false},active=new Set([cast]);
  let flight=true,objects=[],removed=0;
  const ports={flying:()=>flight,pending:()=>false,objects:()=>objects,clearCatch:()=>{removed++;}};
  lockSequenceRecovery(state);settleSequenceRecoveries(active,ports);
  const flyingHeld=owner.skillRecoveryLocks.has('axe');
  flight=false;objects=[{airborne:true}];settleSequenceRecoveries(active,ports);
  const airborneHeld=owner.skillRecoveryLocks.has('axe');
  objects[0].airborne=false;settleSequenceRecoveries(active,ports);
  const groundedHeld=owner.skillRecoveryLocks.has('axe');
  objects=[];settleSequenceRecoveries(active,ports);
  const returnedReady=!owner.skillRecoveryLocks.has('axe')&&!owner.cooldowns.has('axe');
  active.add({...cast,connected:false,done:false});lockSequenceRecovery(state);settleSequenceRecoveries(active,ports);
  return {flyingHeld,airborneHeld,groundedHeld,returnedReady,caught:state.caught,removed,done:cast.done,
    clocks:[...owner.cooldowns],totals:[...owner.cooldownTotals],active:active.size};
}
