export interface TameEffect {
  readonly type:'tame';readonly tags:readonly string[];readonly allowRares?:boolean;readonly sureBelow?:number;
  readonly maxLifeFrac?:number;readonly wildChance?:number;readonly slots?:number;
}
export interface ClaimSkill<Cue>{readonly def:{readonly id:string;readonly companionCue?:Cue;readonly effects:readonly ({readonly type:string;readonly slots?:number})[]}}
export interface ClaimActor<A,Part>{
  readonly id:number;readonly dead:boolean;readonly defId?:string;readonly rarity?:string;readonly tier:number;
  readonly sheet:{removeSource(id:string):void};readonly threat:Map<number,number>;
  owner?:A;team:string;kind?:string;companion:boolean;sourceSkillId?:string;bondGroup?:string;noBounty?:boolean;lifelineId?:unknown;
  standingOrder?:unknown;squadId?:number;squadLeader?:boolean;tag?:string;aiCommand?:unknown;aiTargetId?:number;aggroed:boolean;aiFleeing:boolean;
  life:number;extraParts?:Part[];maxLife():number;
}
export interface ClaimPorts<A,I,Cue>{
  actors():readonly A[];monster(id:string):{readonly boss?:boolean;readonly tags?:readonly string[]}|undefined;
  adjustments(skill:I):{readonly slotsAdd:number;readonly sureBelowAdd:number;readonly wildChanceAdd:number;readonly allowRares?:boolean};
  bond(skill:I):{readonly bossSure?:number;readonly rareSure?:number;readonly normalSure?:number};
  random():number;sameLayer(a:A,b:A):boolean;
  cue(target:A,event:'reject'|'bind',caster:A,spec?:Cue):void;
  /** Optional encounter/campaign consequence, called before allegiance changes.
   * No death burst, corpse or loot is implied by a successful claim. */
  defeated?(target:A,caster:A):void;
  clearEncounter(actor:A):void;
  clearEnemyRules?(actor:A):void;
  /** Bind CompanionBonds.adopt so investments use the shared inheritance fold. */
  adopt(actor:A):void;
}
const clamp=(value:number):number=>Math.max(0,Math.min(1,value));

/** Claim admission and allegiance conversion. The court remains in memory;
 * campaign bookkeeping and AI agendas are explicit host responsibilities. */
export class CompanionClaims<A extends ClaimActor<A,Part>,I extends ClaimSkill<Cue>,Part extends {kind:string},Cue>{
  constructor(readonly parts:readonly Part[],readonly ports:ClaimPorts<A,I,Cue>){}
  companions(keeper:A,skillId:string):A[]{
    return this.ports.actors().filter(actor=>actor.companion&&!actor.dead&&actor.owner===keeper&&actor.sourceSkillId==='__companion:'+skillId);
  }
  bonds(keeper:A,skillId:string):number{
    const groups=new Set<string>();for(const actor of this.companions(keeper,skillId))groups.add(actor.bondGroup??String(actor.id));return groups.size;
  }
  capacity(skill:I):number{
    const effect=skill.def.effects.find(effect=>effect.type==='tame');return Math.max(1,(effect?.slots??1)+this.ports.adjustments(skill).slotsAdd);
  }
  attempt(caster:A,skill:I,target:A,effect:TameEffect):void{
    const definition=skill.def,monster=target.defId?this.ports.monster(target.defId):undefined;
    const adjustments=this.ports.adjustments(skill),bond=this.ports.bond(skill);
    if(this.bonds(caster,definition.id)>=this.capacity(skill)){this.ports.cue(target,'reject',caster,definition.companionCue);return;}
    if(!monster||target.owner||target.companion||target.team===caster.team||!this.ports.sameLayer(target,caster)
      ||(monster.boss&&bond.bossSure===undefined)
      ||(!monster.boss&&target.rarity&&target.rarity!=='normal'&&!(effect.allowRares||adjustments.allowRares||bond.rareSure!==undefined))
      ||!(monster.tags??[]).some(tag=>effect.tags.includes(tag))){this.ports.cue(target,'reject',caster,definition.companionCue);return;}
    const fraction=target.life/Math.max(1,target.maxLife());
    const base=monster.boss?bond.bossSure:target.rarity&&target.rarity!=='normal'?bond.rareSure??effect.sureBelow??effect.maxLifeFrac
      :bond.normalSure??effect.sureBelow??effect.maxLifeFrac;
    const sure=base===undefined?undefined:clamp(base+adjustments.sureBelowAdd);
    if(sure!==undefined&&fraction>sure){
      const wild=monster.boss?0:clamp((effect.wildChance??0)+adjustments.wildChanceAdd);
      if(wild<=0){this.ports.cue(target,'reject',caster,definition.companionCue);return;}
      const probability=wild+(1-wild)*Math.max(0,Math.min(1,(1-fraction)/Math.max(.001,1-sure)));
      if(!(this.ports.random()<probability)){this.ports.cue(target,'reject',caster,definition.companionCue);return;}
    }
    this.ports.defeated?.(target,caster);
    this.claim(caster,target,definition.id);
  }
  claim(keeper:A,beast:A,skillId:string):void{
    beast.team=keeper.team;beast.owner=keeper;beast.kind='companion';beast.companion=true;
    beast.sourceSkillId='__companion:'+skillId;beast.bondGroup=String(beast.id);beast.noBounty=true;beast.lifelineId=undefined;
    beast.sheet.removeSource('owner');this.ports.clearEnemyRules?.(beast);beast.standingOrder=undefined;beast.squadId=undefined;beast.squadLeader=undefined;
    this.ports.clearEncounter(beast);beast.tag=undefined;beast.aiCommand=undefined;beast.aiTargetId=undefined;beast.threat.clear();
    beast.aggroed=false;beast.aiFleeing=false;beast.life=beast.maxLife();this.ports.adopt(beast);
    if(this.parts.length){const worn=beast.extraParts??[];beast.extraParts=[...worn,...this.parts.filter(part=>!worn.some(w=>w.kind===part.kind))];}
    this.ports.cue(beast,'bind',keeper);
  }
}
