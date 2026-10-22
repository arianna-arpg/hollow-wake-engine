import {SkillAdmission} from '@hollow-wake/engine/casting/admission';
import {chargeCostReady} from '@hollow-wake/engine/resources/charges';

// A small host owns its actors and skill definitions. Admission does not spend
// resources or dispatch effects; a real host still authorizes the actual press.
export function admissionCycle(){
 const shot={def:{id:'shot',useTime:0,delivery:{type:'self'},effects:[]},ammo:true,gates:[]};
 const refill={def:{id:'refill',useTime:0,delivery:{type:'self'},effects:[],reflex:true},gates:[{missing:{kind:'life',amount:10}}]};
 const actor={dead:false,useLock:0,reflexLock:0,statuses:[],skillRecoveryLocks:new Set(),cooldowns:new Map(),
  activeAuras:new Map(),summonToggles:new Map(),strobes:new Map(),overdrive:{},runes:[],charges:new Map(),
  pools:new Map(),venting:new Set(),buffs:new Map(),primedPours:[],recentHurt:0,life:100,mana:10,es:0,ward:0,
  reservedMana:0,manaReserved:0,banks:new Map()};
 const admission=new SkillAdmission({
  replenishing:()=>false,stunned:()=>false,statusForbids:()=>undefined,contextTags:()=>new Set(),
  castMode:()=> 'cast',useTime:(_actor,skill)=>skill.def.useTime,reflexStat:()=>0,reflexDuring:()=>({}),
  guardCast:()=>false,gather:()=>undefined,requiresUseCharge:skill=>!!skill.ammo,
  useChargeBank:(a,skill)=>{if(!a.banks.has(skill.def.id))a.banks.set(skill.def.id,{count:3});return a.banks.get(skill.def.id);},
  cost:(_actor,skill)=>({mana:skill===shot?5:0,life:0}),canAfford:(a,cost)=>a.mana>=cost.mana&&a.life>=cost.life,
  gates:skill=>skill.gates,gaugeRefusal:()=>null,thirstless:()=>0,primeCapacity:()=>0,
  chargeCost:()=>undefined,chargeCostReady,delivery:skill=>skill.def.delivery,
  summonSlots:()=>1,summonReservation:()=>0,maxLife:()=>100,maxMana:()=>10,availableMana:()=>10,maxShield:()=>0,
 });
 actor.useLock=1;
 const busy=admission.canUse(actor,shot),banksWhileBusy=actor.banks.size;
 actor.useLock=0;
 const ready=admission.canUse(actor,shot),ammo=actor.banks.get('shot').count;
 actor.mana=0;
 const broke=admission.canUse(actor,shot);
 actor.casting={mode:'cast',inst:shot};actor.life=90;
 const reflex=admission.canUse(actor,refill);
 return {busy,banksWhileBusy,ready,ammo,broke,reflex,castPreserved:actor.casting.inst===shot,life:actor.life,mana:actor.mana};
}
