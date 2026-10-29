import {statusBaselineDps} from './status-lifecycle.js';
import type {StatusDamageType,HitStatusActor,HitStatusBuff,HitStatusDefinition,HitStatusEffect,
  HitStatusFrame,HitStatusPacket,HitStatusPorts,HitStatusSkill} from './hit-status-types.js';
export type * from './hit-status-types.js';

/** Ordered hit/status policy. Ports are synchronous and can reenter; exceptions
 * retain earlier writes. No global current-hit state or hidden clock/randomness. */
export function createHitStatuses<
  A extends HitStatusActor<I,M,Tag,B>,I extends {def:S},S extends HitStatusSkill<Tag>,
  M,Tag extends string,D extends HitStatusDefinition,B extends HitStatusBuff<Tag>,Q,
>(ports:HitStatusPorts<A,I,S,M,Tag,D,B,Q>){
  type Frame=HitStatusFrame<A,I,S,M,Tag>;
  const chance=(value:number)=>ports.random()<value;
  const baseline=(id:string)=>{const level=ports.zoneLevel();return statusBaselineDps(ports.definition(id),level);};
  function potencyFor(f:Frame,id:string):number{
    const dt=ports.definition(id)?.dotType;
    return f.caster.sheet.get('statusMagnitude',dt?ports.skillContextTags(f.def,[dt as Tag]):f.tags,f.extra);
  }
  function stacksBonusFor(f:Frame,id:string):number{
    const def=ports.definition(id);if(!def?.stacking)return 0;const dt=def.dotType;
    return Math.round(f.caster.sheet.get('ailmentStacks',dt?ports.skillContextTags(f.def,[dt as Tag]):f.tags,f.extra));
  }
  function prepare(caster:A,inst:I,target:A,def:S,extra:M[],packet:HitStatusPacket<Tag>,dealt:number,depth:number,afflictionCarry:number):Frame{
    const tags=ports.skillContextTags(def),durScale=caster.sheet.get('effectDuration',tags,extra),bonusChance=caster.sheet.get('statusChance',tags,extra);
    let hexLink=0;
    if(def.linkedHexes&&dealt>0){
      for(const other of caster.skills){
        if(!other||other.def.id===def.id||!other.def.tags.includes('curse' as Tag))continue;
        const sfx=other.def.effects.find(f=>f.type==='status');if(!sfx||sfx.type!=='status')continue;
        const sdd=ports.definition(sfx.status!);
        target.applyStatus(sfx.status!,sdd?.dotType?baseline(sfx.status!):0,durScale,other.def.name);hexLink++;
      }
      if(hexLink>0)ports.text(target,16,`${hexLink} hexes!`,def.color,12);
    }
    const hexDmg=1+(def.linkedHexes?.dmgPerHex??0)*hexLink,hexDur=1+(def.linkedHexes?.durPerHex??0)*hexLink;
    return {caster,inst,target,def,extra,packet,dealt,depth,afflictionCarry,tags,durScale,bonusChance,hexDmg,hexDur};
  }
  function applyRiders(f:Frame):void{
    const {caster,inst,target,packet,extra,durScale,dealt,depth}=f;
    if(dealt>0&&depth===0&&caster.buffs.size){
      for(const[bid,b]of [...caster.buffs]){
        const rider=b.def.nextHit;if(!rider)continue;
        if(rider.tags&&!rider.tags.every(t=>packet.tags.has(t)))continue;
        if(rider.status){
          const sdef=ports.definition(rider.status);
          const dps=sdef?.dotType?baseline(rider.status)*(rider.statusScale??1.5)*potencyFor(f,rider.status):0;
          target.applyStatus(rider.status,dps,durScale,caster.name,{
            casterId:caster.id,stacksBonus:stacksBonusFor(f,rider.status),power:sdef?.dotType?undefined:potencyFor(f,rider.status),
          });
        }
        if(rider.addedDamage&&!target.invulnerable){
          const landed=ports.mitigateTyped(target,{...rider.addedDamage},{attacker:caster,tags:packet.tags,extra});
          if(landed>0){target.life-=landed;ports.text(target,10,Math.round(landed).toString(),'#e8d44a',12);}
        }
        if(rider.procId&&ports.procDefinition(rider.procId))ports.executeProc(ports.procDefinition(rider.procId)!,caster,inst,target,1);
        caster.consumeBuffStacks(bid,1);ports.riderCue(target,b.def,bid);
      }
    }
  }
  function applyAuthored(f:Frame,fx:HitStatusEffect):void{
    const {caster,inst,target,def,extra,packet,tags,durScale,bonusChance,hexDmg,hexDur,dealt,depth,afflictionCarry}=f;
    const el=ports.definition(fx.status)?.element;
    const shrug=target.sheet.get('ailmentResist',el?new Set<Tag>([el as Tag]):undefined);
    if(shrug>0&&chance(shrug)){ports.statusCue('resist',target,caster,ports.definition(fx.status)?.color);return;}
    const rule=ports.tuning(fx.status),tuned=!rule||fx.chance>=rule.identityThreshold?fx.chance:fx.chance*rule.incidentalScale;
    if(chance(Math.min(1,tuned+bonusChance))){
      const derived=(fx.magnitude??0)*(dealt+afflictionCarry),floor=fx.magnitude?baseline(fx.status):0;
      const dps=Math.max(derived,floor)*potencyFor(f,fx.status)*hexDmg/Math.max(.5,durScale);
      const sdef=ports.definition(fx.status);
      const fxScale=(fx.durationOverride!==undefined?fx.durationOverride/(ports.definition(fx.status)?.duration||1):durScale)*hexDur;
      const afflictionSpan=(sdef?.duration??0)*fxScale;
      let rupture:number|undefined,ruptureType:StatusDamageType|undefined,dpsOut=dps;
      if(sdef?.cullsAtLethal&&dps>0){rupture=dps*afflictionSpan;ruptureType='chaos';dpsOut=rupture*caster.sheet.get('doomDot',tags,extra);}
      else if(sdef?.dotType&&dps>0){
        const bombFrac=caster.sheet.get('igniteToBomb',tags,extra);
        if(fx.status==='burn'&&bombFrac>0){rupture=dps*afflictionSpan*bombFrac;ruptureType='fire';dpsOut=dps*(1-bombFrac);}
        else{const r=caster.sheet.get('dotRupture',tags,extra);if(r>0){rupture=dps*afflictionSpan*r;ruptureType=sdef.dotType;}}
      }else if(sdef&&!sdef.dotType){
        const r=caster.sheet.get('curseRupture',tags,extra);
        if(r>0){const rolled=Object.values(packet.amounts).reduce((sum,v)=>sum+(v??0),0);if(rolled>0){rupture=rolled*r;ruptureType=(['fire','cold','lightning'] as const).find(e=>def.tags.includes(e as Tag))??'chaos';}}
      }
      if(dpsOut>0){
        const dc=caster.sheet.get('dotCrit',tags,extra);
        if(dc>0&&chance(dc*caster.sheet.get('critChance',tags,extra))){
          const cm=caster.sheet.get('critMulti',tags,extra);dpsOut*=cm;if(rupture!==undefined)rupture*=cm;
          ports.statusCue('affliction',target,caster,sdef?.color);
        }
      }
      target.applyStatus(fx.status,dpsOut,fxScale,caster.name,{
        propagates:chance(caster.sheet.get('dotPropagates',tags,extra))||undefined,rupture,ruptureType,
        ruptureRadius:rupture!==undefined?90*caster.sheet.get('aoeRadius',tags,extra):undefined,
        stacksBonus:stacksBonusFor(f,fx.status),casterId:fx.status==='taunted'&&caster.summonShell&&caster.owner?caster.owner.id:caster.id,
        brood:ports.instanceBrood(inst),leech:caster.sheet.get('dotLeech_'+fx.status,tags,extra)||undefined,
        popBonus:caster.sheet.get('popPower_'+fx.status,tags,extra)||undefined,power:ports.definition(fx.status)?.dotType?undefined:potencyFor(f,fx.status),
      });
      ports.rollStatusProcs(caster,inst,target,fx.status,tags,extra,depth);
      if(dpsOut>0)ports.bankPools(caster,{status:fx.status},dpsOut*(ports.definition(fx.status)?.duration??0)*fxScale);
      if(def.tags.includes('curse' as Tag)&&caster.sheet.get('hedonism',tags,extra)>0)target.applyStatus('hedonism',0,durScale,caster.name);
    }
  }
  function applyGranted(f:Frame):void{
    const {caster,inst,target,def,extra,packet,tags,durScale,bonusChance,dealt,depth}=f;
    const wetHere=dealt>0&&target.isWet();
    if(dealt>0){
      const wetArmed=wetHere?caster.sheet.armedFamily('applyWet_',ports.statusIds(),extra):[];
      const applyArmed=caster.sheet.armedFamily('apply_',ports.statusIds(),extra);
      const armedIds=wetArmed.length?ports.statusIds().filter(id=>applyArmed.includes(id)||wetArmed.includes(id)):applyArmed;
      for(const sid of armedIds){
        const ch=caster.sheet.get('apply_'+sid,tags,extra)+(wetHere?caster.sheet.get('applyWet_'+sid,tags,extra):0);
        if(ch<=0||!chance(Math.min(1,ch+bonusChance)))continue;
        const sdef=ports.definition(sid)!;
        const dps=sdef.dotType?Math.max((sdef.hitMagnitude??0)*dealt,baseline(sid))*potencyFor(f,sid)/Math.max(.5,durScale):0;
        let armed:number|undefined,armedType:StatusDamageType|undefined,dpsOut2=dps;
        if(sdef.cullsAtLethal){armed=Math.max((sdef.hitMagnitude??.4)*dealt,baseline(sid))*potencyFor(f,sid);armedType='chaos';dpsOut2=armed*caster.sheet.get('doomDot',tags,extra);}
        else if(sdef.dotType&&dps>0){
          const bombFrac=caster.sheet.get('igniteToBomb',tags,extra);
          if(sid==='burn'&&bombFrac>0){armed=dps*sdef.duration*durScale*bombFrac;armedType='fire';dpsOut2=dps*(1-bombFrac);}
          else{const r=caster.sheet.get('dotRupture',tags,extra);if(r>0){armed=dps*sdef.duration*durScale*r;armedType=sdef.dotType;}}
        }else if(!sdef.dotType){
          const r=caster.sheet.get('curseRupture',tags,extra);
          if(r>0){const rolled=Object.values(packet.amounts).reduce((sum,v)=>sum+(v??0),0);if(rolled>0){armed=rolled*r;armedType=(['fire','cold','lightning'] as const).find(e=>def.tags.includes(e as Tag))??'chaos';}}
        }
        target.applyStatus(sid,dpsOut2,durScale,caster.name,{
          propagates:chance(caster.sheet.get('dotPropagates',tags,extra))||undefined,stacksBonus:stacksBonusFor(f,sid),casterId:caster.id,
          brood:ports.instanceBrood(inst),leech:caster.sheet.get('dotLeech_'+sid,tags,extra)||undefined,rupture:armed,ruptureType:armedType,
          ruptureRadius:armed!==undefined?90*caster.sheet.get('aoeRadius',tags,extra):undefined,popBonus:caster.sheet.get('popPower_'+sid,tags,extra)||undefined,
        });
        ports.rollStatusProcs(caster,inst,target,sid,tags,extra,depth);
        if(dps>0)ports.bankPools(caster,{status:sid},dps*(ports.definition(sid)?.duration??0)*durScale);
      }
    }
  }
  function dischargeOnHit(caster:A,target:A,packet:HitStatusPacket<Tag>,dealt:number,depth:number):void{
    if(dealt>0&&depth===0&&!target.dead)for(let si=target.statuses.length-1;si>=0;si--){
      const s=target.statuses[si];
      if(s.holdDischarge||!ports.definition(s.id)?.dischargeOnHit||!s.rupture||s.rupture<=0)continue;
      if(ports.definition(s.id)?.dischargeMatchingType&&(packet.amounts[s.ruptureType??'physical']??0)<=0)continue;
      target.statuses.splice(si,1);target.sheet.removeSource('status:'+s.id);
      const taken=ports.mitigateTyped(target,{[s.ruptureType??'physical']:s.rupture});
      if(taken>0){
        ports.landLifeDamage(target,taken);target.hitFlash=.12;target.hitFlashType=s.ruptureType??'physical';
        ports.text(target,26,'IMPALED '+Math.round(taken),ports.definition(s.id)?.color??'#c8ccd8',13,'combat');
        if(target.life<=0&&!target.dead)ports.kill(target,false,caster);
      }
    }
  }
  function plantImpale(caster:A,target:A,def:S,packet:HitStatusPacket<Tag>,extra:M[],dealt:number,depth:number):void{
    if(dealt>0&&depth===0&&!target.dead){
      const ip=caster.sheet.get('impalePower',packet.tags,extra),phys=packet.amounts.physical??0;
      if(ip>0&&phys>0){
        target.applyStatus('impaled',0,1,def.name,{casterId:caster.id});
        const lodged=target.statuses.find(x=>x.id==='impaled'&&!x.sourceKey);
        if(lodged){lodged.rupture=(lodged.rupture??0)+phys*ip;lodged.ruptureType='physical';}
      }
    }
  }
  return {prepare,applyRiders,applyAuthored,applyGranted,dischargeOnHit,plantImpale};
}
