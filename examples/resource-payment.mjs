import {ResourcePayment} from '@hollow-wake/engine/resources/payment';

/** A host explicitly installs loan records, admits payments, applies regeneration,
 * then advances debt. A real game supplies its own live stat/content resolver. */
export function paymentCycle() {
  const events=[];
  const policy=new ResourcePayment({
    maxMana:a=>a.maxMana,maxLife:a=>a.maxLife,esToMana:a=>a.esFraction,
    spec:loan=>loan.spec,context:loan=>loan,
    stat:(_a,loan,key,base)=>loan.modifiers[key]??base??0,
    attackSpeed:a=>a.speed,
    lifeSpent:(a,amount)=>events.push({actor:a.id,amount,remaining:a.life}),
  });
  const make=id=>({id,mana:10,life:100,es:40,maxMana:100,maxLife:100,
    esFraction:.5,speed:1,reservedMana:0,reservedLife:0,overdrive:{}});
  const mage=make('mage'),fighter=make('fighter');
  mage.overdrive.mana={debt:0,idle:0,spec:{cap:.5,idleDelay:2.5,recoveryPct:.2,recoveryFlat:2},modifiers:{}};
  fighter.overdrive.life={debt:0,idle:0,spec:{cap:.4,idleDelay:2.5,regenFactor:.75},modifiers:{}};
  const cast=(actor,cost)=>{if(!policy.canAfford(actor,cost))return false;policy.pay(actor,cost);return true;};
  const admitted=[cast(mage,{mana:50,life:0}),cast(fighter,{mana:0,life:10})];
  fighter.life=20;admitted.push(cast(fighter,{mana:0,life:20}));
  const refused=!cast(mage,{mana:100,life:0});
  const frame=(actor,dt,regen)=>{
    actor.life=Math.min(policy.lifeCeiling(actor),actor.life+regen*dt);
    actor.mana=Math.min(policy.availableMana(actor),actor.mana);
    policy.advanceDebt(actor,dt,regen);
  };
  frame(mage,2.5,0);frame(fighter,2.5,8);
  return {admitted,refused,events,mage:{mana:mage.mana,es:mage.es,debt:mage.overdrive.mana.debt,reserved:mage.reservedMana},
    fighter:{life:fighter.life,debt:fighter.overdrive.life.debt,reserved:fighter.reservedLife}};
}
