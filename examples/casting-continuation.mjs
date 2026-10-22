import {SkillRequest} from '@hollow-wake/engine/casting/request';
import {SkillDispatch} from '@hollow-wake/engine/casting/dispatch';
import {CastingContinuation} from '@hollow-wake/engine/casting/continuation';

/** A deliberately small 3D host with one authored ordinary skill. This is a
 * request/update/delivery example, not a native engine adapter or a full damage model.
 * The real Hollow Wake adapter binds every service to its existing game system. */
export function continuationCycle() {
  const inst={def:{id:'example-bolt',tags:['spell'],delivery:{type:'projectile'},
    effects:[],useTime:.5,cooldown:0,color:'blue'},sockets:[]};
  const actor={id:'hero',dead:false,pos:{x:0,y:0,z:0},radius:1,skills:[inst],statuses:[],overdrive:{},
    activeAuras:new Map(),summonToggles:new Map(),strobes:new Map(),hexToggles:new Map(),
    cooldowns:new Map(),cooldownTotals:new Map(),reservedMana:0,useLock:0,reflexLock:0,
    casting:null,facing:{yaw:0,pitch:0},mana:20,life:100};
  const target={id:'recipient',life:50},aim={x:4,y:2,z:9},events=[];
  const tags=new Set(['spell']),mods=[],cost={mana:4,life:0};
  let sealed=false,scramble=false,dispatcher;
  const absent=()=>undefined,unexpected=()=>{throw new Error('Unconfigured example capability');};
  const noEffect=()=>{};
  const request=new SkillRequest({
    castSealed:()=>sealed?{line:'closed'}:undefined,hivecallMeta:absent,
    throngTravelProtected:()=>false,replenishingDelivery:absent,
    forgetReplenishment:unexpected,seatOf:absent,triggerSeat:absent,
    markMetaDirty:unexpected,markCharacterDirty:unexpected,replenishmentFeedback:unexpected,
    markSeatActed:()=>events.push('acted'),isReflex:()=>false,actorById:absent,mashPress:()=>0,
    failNote:(a,key)=>events.push(key),maxLife:()=>100,trigger:absent,triggerArmed:()=>false,
    requirementRefusal:absent,conversion:absent,definition:id=>id===inst.def.id?inst.def:undefined,
    conversionHolds:()=>false,mint:unexpected,dispatch:(...args)=>dispatcher.request(...args),
    time:()=>1,mimicSelected:()=>null,mimicPowerMods:unexpected,unmetGate:absent,
    effects:()=>[],relocationTarget:absent,
    canUse:a=>!a.dead&&!a.casting&&a.useLock<=0&&a.mana>=cost.mana&&a.life>cost.life,
  });
  const ammunition={bank:unexpected,spend:unexpected,finalRoundDamage:unexpected,stampCooldown:unexpected};
  const deliver=(a,i,point,payload)=>{
    // This tiny host owns its effect rule. The SDK does not invent projectile
    // travel or collision from a request; a real host resolves those separately.
    target.life-=12*payload.dmgMult;events.push('delivered');
  };
  dispatcher=new SkillDispatch({
    preflight:(...args)=>request.preflight(...args),time:()=>1,
    failNote:(a,key)=>events.push(key),canAct:a=>!a.casting&&a.useLock<=0,
    canUse:()=>false,comboCursor:unexpected,definition:absent,comboStep:absent,
    dispatch:(...args)=>dispatcher.request(...args),copyAim:point=>({...point}),
    facingTo:(a,point)=>({yaw:Math.atan2(point.x,point.z),pitch:Math.atan2(point.y,Math.hypot(point.x,point.z))}),
    status:absent,random:unexpected,applyStatus:unexpected,
    scrambleLatch:()=>scramble,setScrambleLatch:value=>{scramble=value;},trigger:absent,
    feedback:unexpected,deactivateAura:unexpected,dismissSummon:unexpected,maxMana:()=>20,
    cost:()=>cost,pay:(a,i,c)=>{a.mana-=c.mana;a.life-=c.life;events.push('paid');},
    curseOnHit:absent,curseField:absent,zones:()=>[],expireZone:unexpected,
    castMode:()=> 'cast',tags:()=>tags,modifiers:()=>mods,stat:()=>0,useTime:()=>.5,
    targeting:()=>({fallback:'refuse'}),resolveTarget:()=>({actor:target}),
    lightweightCount:()=>0,promoteTarget:unexpected,useCharges:absent,ammunition:()=>ammunition,
    channel:absent,gather:absent,speed:()=>1,consumeCharges:()=>({mult:1,consumed:0}),
    spendGauge:unexpected,stampCooldown:unexpected,opening:()=>events.push('opening'),
    quarry:resolved=>resolved.actor,guardCapacity:unexpected,refreshGuard:unexpected,
    guardRaised:unexpected,shellGraft:absent,overcharge:absent,strikeTiming:absent,
    assaultLock:noEffect,primedPourOpen:()=>false,execute:deliver,isReflex:()=>false,reflexRecovery:()=>.1,
  });
  const continuation=new CastingContinuation({
    stunned:()=>false,lowerGuard:unexpected,feedback:unexpected,updateAim:noEffect,
    seated:()=>true,primary:()=>true,actor:absent,assignAim:Object.assign,copyAim:point=>({...point}),
    channel:absent,random:unexpected,hold:unexpected,needsFireLine:unexpected,lineOfFire:unexpected,
    finesse:absent,click:a=>continuation.press(a),distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),
    tags:()=>tags,mods:()=>mods,stat:unexpected,target:(pos,a)=>a?{pos,actor:a}:{pos},deliver,
    advanceGuard:unexpected,advanceChannel:unexpected,advanceCharged:unexpected,
    plantTotem:unexpected,spawnChannelVessel:unexpected,acted:()=>events.push('clicked'),
    timingBonus:absent,timingCue:unexpected,flawless:unexpected,
  },{channelGrace:.9,focusSlack:30});
  const started=dispatcher.request(actor,inst,aim,true),cast=actor.casting;
  const ownedAim=cast.aim!==aim&&cast.aim.z===9;
  continuation.advance(actor,.2);const early=actor.casting===null;
  continuation.advance(actor,.3);const completed=actor.casting===null;
  continuation.press(actor); // Even an idle click remains an input occurrence.
  sealed=true;
  const refused=dispatcher.request(actor,inst,aim,true);
  return {started,ownedAim,early,completed,refused,mana:actor.mana,targetLife:target.life,recovery:actor.useLock,events};
}
