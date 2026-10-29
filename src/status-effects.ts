import {bankFracOf, statusBaselineDps, statusRuptureRadius} from './status-lifecycle.js';
import type {EffectStatus, ProcStatusEffect, TransplantOptions, StatusEffectActor, StatusEffectDefinition, StatusEffectPorts} from './status-effects-types.js';
export type * from './status-effects-types.js';

/** Ordered policy over borrowed actors. Ports are synchronous and may reenter.
 * A thrown port retains all earlier writes; there is no implicit transaction. */
export function createStatusEffects<
  A extends StatusEffectActor<P,M,Tag>, I, P, M extends {value: number},
  Tag extends string, D extends StatusEffectDefinition<M>,
>(ports: StatusEffectPorts<A,I,P,M,Tag,D>) {
  const baseline=(id:string)=>{const level=ports.zoneLevel();return statusBaselineDps(ports.definition(id),level);};
  function transplantStatus(to:A,s:EffectStatus,sourceName:string,o?:TransplantOptions):void {
    if(s.challengeField!==undefined)return;
    const def=ports.definition(s.id);if(!def||to.dead)return;
    const duration=(o?.durationScale??1)*((o?.duration??'remaining')==='remaining'?Math.max(.05,s.remaining)/(def.duration||1):1);
    const n=Math.max(1,s.stacks);
    for(let i=0;i<n;i++)to.applyStatus(s.id,s.dps*(o?.strengthScale??1),duration,sourceName,
      {casterId:s.casterId,rupture:s.rupture,ruptureType:s.ruptureType,ruptureRadius:s.ruptureRadius});
  }
  function cleanseActor(target:A,count=2):number {
    const stripped=target.cleanseDebuffs(count);
    if(stripped>0)ports.text(target.pos,'cleansed','#a8e8d8',12,'combat');
    return stripped;
  }
  function ringAfflictions(target:A,portion:number):number {
    if(portion<=0)return 0;let rung=0;
    for(let i=target.statuses.length-1;i>=0;i--){
      const s=target.statuses[i],def=ports.definition(s.id);if(def?.beneficial)continue;
      if(s.stacks>1){
        s.stacks-=Math.max(1,Math.round(s.stacks*portion));
        if(s.stacks<=0){target.statuses.splice(i,1);if(!target.statuses.some(o=>o.id===s.id))target.sheet.removeSource('status:'+s.id);}
        else if(def?.mods&&def.modsPerStack)target.sheet.setSource('status:'+s.id,def.mods.map(m=>({...m,value:m.value*s.stacks})));
      }else s.remaining*=1-portion;
      rung++;
    }
    if(rung>0)ports.text(target.pos,'rung clean','#d8c8a0',12,'combat');return rung;
  }
  function shedStatusStack(actor:A,status:EffectStatus):void {
    status.stacks--;const def=ports.definition(status.id);
    // Preserve the legacy stale-reference splice and modifier resynchronization.
    if(status.stacks<=0){actor.statuses.splice(actor.statuses.indexOf(status),1);actor.sheet.removeSource('status:'+status.id);}
    else if(def?.mods)actor.sheet.setSource('status:'+status.id,def.mods.map(m=>({...m,value:m.value*(def.modsPerStack?status.stacks:1)})));
  }
  function ruptureBank(caster:A,victim:A,statusId:string,fraction:number,mul:number,tags?:Set<Tag>,extra?:M[]):number {
    const s=victim.statuses.find(x=>x.id===statusId),def=ports.definition(statusId);
    if(!s||!def||victim.dead||victim.invulnerable)return 0;
    const f=Math.max(0,Math.min(1,fraction)),banked=s.dps*s.stacks*Math.max(0,s.remaining);
    if(f<=0||banked<=0)return 0;
    const el=def.dotType??def.element??'fire',burst=banked*f*Math.max(0,mul);
    s.dps*=1-f;
    if(f>=1||s.dps<.05)victim.endStatus(statusId);else s.bankFrac=bankFracOf(s,def);
    const taken=ports.mitigateTyped(victim,{[el]:burst},{attacker:caster,tags,extra});
    ports.flash(victim.pos,victim.radius+18,def.color,.3);
    if(taken<=0)return 0;
    victim.life-=taken;victim.hitFlash=.15;victim.hitFlashType=el;
    ports.text(victim.pos,Math.round(taken).toString(),def.color,13,undefined,14);
    if(victim.life<=0&&!victim.dead)ports.kill(victim,false,caster);return taken;
  }
  function ruptureStatus(victim:A,s:EffectStatus):void {
    const type=s.ruptureType??'chaos',radius=statusRuptureRadius(s);
    ports.ruptureCue(victim,s,radius);
    for(const e of ports.actors()){
      if(e.dead||e.team!==victim.team||e.untargetable||!ports.sameStory(e,victim))continue;
      if(ports.distance(victim.pos,e.pos)-e.radius>radius)continue;
      let amount=s.rupture!*e.sheet.get('damageTaken');amount*=1-ports.resistValue(e,type);
      if(e.invulnerable||amount<=0)continue;
      const before=e.life;e.life-=amount;
      ports.recordIndirectDamage(e,s.casterId===undefined?undefined:ports.actorById(s.casterId),before);
      e.hitFlash=.15;e.hitFlashType=type;ports.text(e.pos,Math.round(amount).toString(),'#b06bd4',12);
      if(e.life<=0&&!e.dead)ports.kill(e,false,s.casterId===undefined?undefined:ports.actorById(s.casterId));
    }
  }
  function assaultDoomCull(target:A):void {
    if(!target.dead&&target.life>0){
      let armed=0;for(const s of target.statuses)if(s.rupture&&ports.definition(s.id)?.cullsAtLethal)armed+=s.rupture;
      if(armed>0&&armed>=target.life)for(let i=target.statuses.length-1;i>=0;i--){
        const s=target.statuses[i];if(!s.rupture||!ports.definition(s.id)?.cullsAtLethal)continue;
        target.statuses.splice(i,1);if(!target.statuses.some(o=>o.id===s.id))target.sheet.removeSource('status:'+s.id);
        ruptureStatus(target,s);
      }
    }
  }
  function applyProcStatus(effect:ProcStatusEffect,sourceName:string,caster:A,inst:I|null,target?:A|null):void {
    if(!target||target.dead)return;const def=ports.definition(effect.status);if(!def)return;
    const tags=inst?ports.skillContextTags(inst):undefined,extra=inst?ports.instanceMods(inst):undefined;
    const dps=def.dotType?baseline(effect.status)*(effect.magnitude??1)*caster.sheet.get('statusMagnitude',
      def.dotType&&inst?ports.skillContextTags(inst,[def.dotType as Tag]):tags,extra):0;
    target.applyStatus(effect.status,dps,caster.sheet.get('effectDuration',tags,extra),sourceName,{
      casterId:caster.id,leech:caster.sheet.get('dotLeech_'+effect.status,tags,extra)||undefined,
      popBonus:caster.sheet.get('popPower_'+effect.status,tags,extra)||undefined,
      power:def.dotType?undefined:caster.sheet.get('statusMagnitude',tags,extra),
    });
  }
  function expireStatuses(actor:A):void {
    if(actor.expiredStatuses.length){
      for(const s of actor.expiredStatuses)if(s.rupture&&s.rupture>0&&!actor.dead&&!ports.definition(s.id)?.dischargeMatchingType)ruptureStatus(actor,s);
      actor.expiredStatuses.length=0;
    }
  }
  function zapStatuses(actor:A):void {
    for(const s of actor.statuses){
      const zn=ports.definition(s.id)?.zapNearby;if(!zn||actor.dead)continue;
      s.zapAt??=ports.time()+zn.interval;if(ports.time()<s.zapAt)continue;s.zapAt=ports.time()+zn.interval;
      const damage=baseline(s.id)*zn.factor*s.stacks,el=ports.definition(s.id)?.element??'lightning';let lashed=false;
      for(const kin of ports.actors()){
        if(kin===actor||kin.dead||kin.untargetable||kin.passive)continue;
        if(kin.team!==actor.team||kin.invulnerable)continue;
        if(ports.distance(actor.pos,kin.pos)>zn.radius)continue;
        const taken=ports.mitigateTyped(kin,{[el]:damage});
        if(taken>0){kin.life-=taken;kin.hitFlash=.1;kin.hitFlashType=el;ports.accumulateDotText(kin,taken,zn.interval);if(kin.life<=0&&!kin.dead)ports.kill(kin);lashed=true;}
      }
      if(lashed)ports.flash(actor.pos,zn.radius,ports.definition(s.id)?.color??'#e8e05a',.15);
    }
  }
  function lashStatuses(actor:A):void {
    for(const s of actor.statuses){
      const lo=ports.definition(s.id)?.lashOut;if(!lo||actor.dead||actor.isStunned())continue;
      s.lashAt??=ports.time()+lo.interval;if(ports.time()<s.lashAt)continue;s.lashAt=ports.time()+lo.interval;
      let prey:A|null=null,best=lo.radius;
      for(const other of ports.actors()){
        if(other===actor||other.dead||other.untargetable||other.passive||other.invulnerable||other.construct)continue;
        const distance=ports.distance(actor.pos,other.pos);if(distance<=best){best=distance;prey=other;}
      }
      if(!prey)continue;const damage=baseline(s.id)*lo.factor,taken=ports.mitigateTyped(prey,{physical:damage});
      if(taken>0){prey.life-=taken;prey.hitFlash=.12;prey.hitFlashType='physical';ports.text(prey.pos,Math.round(taken).toString(),'#d84a9a',12);if(prey.life<=0&&!prey.dead)ports.kill(prey);}
      ports.flash(actor.pos,actor.radius+10,'#d84a9a',.15);
    }
  }
  /** Retain actual status references before death detonation removes them. The
   * host must run propagation at its later death phase, after intervening work. */
  function capturePropagation(actor:A,silent:boolean):EffectStatus[]{return silent?[]:actor.statuses.filter(s=>s.propagates&&s.dps>0);}
  function detonateDeathStatuses(actor:A,silent:boolean):void {
    if(!silent)for(let i=actor.statuses.length-1;i>=0;i--){
      const s=actor.statuses[i];if(!s.rupture||s.rupture<=0)continue;
      actor.statuses.splice(i,1);if(!actor.statuses.some(o=>o.id===s.id))actor.sheet.removeSource('status:'+s.id);
      if(!ports.definition(s.id)?.dischargeMatchingType)ruptureStatus(actor,s);
    }
  }
  function propagateDeathStatuses(actor:A,statuses:readonly EffectStatus[],silent:boolean):void {
    if(!silent)for(const s of statuses){
      let spread=0;for(const e of ports.actors()){
        if(e.dead||e===actor||e.team!==actor.team||e.untargetable)continue;
        if(ports.distance(actor.pos,e.pos)>170||spread>=6)continue;
        const span=s.total??ports.definition(s.id)?.duration??1;
        e.applyStatus(s.id,s.dps,span/(ports.definition(s.id)?.duration||1),s.sourceName,
          {propagates:true,rupture:s.rupture,ruptureType:s.ruptureType,casterId:s.casterId,leech:s.leech,brood:s.brood,power:s.power});
        spread++;
      }
      if(spread>0)ports.flash(actor.pos,170,'#78c878',.25);
    }
  }
  return {transplantStatus,cleanseActor,ringAfflictions,shedStatusStack,ruptureBank,ruptureStatus,assaultDoomCull,
    applyProcStatus,expireStatuses,zapStatuses,lashStatuses,capturePropagation,detonateDeathStatuses,propagateDeathStatuses};
}
