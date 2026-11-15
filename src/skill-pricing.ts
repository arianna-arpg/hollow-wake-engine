export interface PricedSkill {
  def:{id:string;useTime:number;manaCost:number;lifeCost?:number;costScaling?:{pricedFrom?:string;manaPctMax?:number;lifePctMax?:number;lifePctCur?:number}};
}
export interface PricingActor<M,Tag extends string> {
  life:number;sheet:{get(id:string,tags?:Set<Tag>,extra?:M[]):number};
  maxLife():number;maxMana():number;lifeCeiling():number;availableMaxMana():number;
}
export interface SkillPricingPorts<I,M,Tag extends string> {
  tags(skill:I):Set<Tag>;mods(skill:I):M[];guarded(skill:I):boolean;replenishing(skill:I):boolean;
  cooldown(actor:PricingActor<M,Tag>,skill:I):number;
}
/** Original Actor pricing, over the same live sheet and instance queried by
 * combat. Pool prices use raw maxima unless authored as reservation-aware. */
export class SkillPricing<I extends PricedSkill,M,Tag extends string> {
  constructor(readonly ports:SkillPricingPorts<I,M,Tag>){}
  speed(actor:PricingActor<M,Tag>,skill:I):number {
    const tags=this.ports.tags(skill),extra=this.ports.mods(skill);
    const base=actor.sheet.get(tags.has('attack' as Tag)?'attackSpeed':'castSpeed',tags,extra);
    return tags.has('reload' as Tag)?base*actor.sheet.get('reloadSpeed',tags,extra):base;
  }
  useTime(actor:PricingActor<M,Tag>,skill:I):number {return this.ports.guarded(skill)?0:skill.def.useTime/this.speed(actor,skill);}
  cost(actor:PricingActor<M,Tag>,skill:I):{mana:number;life:number}{
    if(this.ports.replenishing(skill))return{mana:0,life:0};
    const tags=this.ports.tags(skill),extra=this.ports.mods(skill),cs=skill.def.costScaling,available=cs?.pricedFrom==='available';
    const baseMana=skill.def.manaCost+actor.sheet.get('addedManaCost',tags,extra)+(cs?.manaPctMax?(available?actor.availableMaxMana():actor.maxMana())*cs.manaPctMax:0);
    const baseLife=(skill.def.lifeCost??0)+actor.sheet.get('addedLifeCost',tags,extra)+(cs?.lifePctMax?(available?actor.lifeCeiling():actor.maxLife())*cs.lifePctMax:0)+(cs?.lifePctCur?Math.max(1,actor.life*cs.lifePctCur):0);
    if(baseMana<=0&&baseLife<=0)return{mana:0,life:0};
    const mult=actor.sheet.get('manaCost',tags,extra),toLife=actor.sheet.get('costToLife',tags,extra),toMana=actor.sheet.get('costToMana',tags,extra);
    const mana=(baseMana*mult*(1-toLife)+baseLife*mult*toMana)*actor.sheet.get('manaUseCost',tags,extra),life=baseLife*mult*(1-toMana)+baseMana*mult*toLife;
    return{mana:mana>0?Math.ceil(mana):0,life:life>0?Math.ceil(life):0};
  }
  profile(actor:PricingActor<M,Tag>,skill:I){
    return{skillId:skill.def.id,useTime:this.useTime(actor,skill),cost:this.cost(actor,skill),cooldown:this.ports.cooldown(actor,skill),cooldownAt:'completion' as const};
  }
}
