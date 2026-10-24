import {finite} from './validation.js';

/** Native policy identifiers; the core stat engine still accepts any string. */
export const ACTOR_CONDITION_IDS=Object.freeze([
  'lowLife','fullLife','lowMana','fullMana','hasEs','fullEs','lowEs','guarding',
  'poised','poiseBroken','esRecharging','stationary','moving','comboVaried',
  'comboRepeated','recentlyHit','recentlyCrit','recentlyKilled','recentlyHurt',
  'notHurtRecently','recentlyBlocked','recentlyEvaded','recentlyMoved','recentlyHealed','strided',
] as const);
export type ActorConditionId=typeof ACTOR_CONDITION_IDS[number];
const bits=Object.freeze(Object.fromEntries(ACTOR_CONDITION_IDS.map((id,i)=>[id,1<<i]))) as Readonly<Record<ActorConditionId,number>>;
const sampling=Symbol('actor condition sample');
export interface ActorConditionSink {setConditions(active:ActorConditionId[]):void}
/** Opaque confirmation slot: initialize to null and let the policy own it. */
export type ActorConditionPublication=ActorConditionSink|typeof sampling|null;
export interface ActorConditionState {
  condMask:number;
  condSheet:ActorConditionPublication;
  condRose:ActorConditionId[];
}
export interface ActorConditionOwner extends ActorConditionState {
  sheet:ActorConditionSink;
  life:number;mana:number;es:number;poise:number;poiseBroken:boolean;esRecharging:boolean;
  casting?:{mode:string}|null;
  plantFor:number;idleFor:number;strideDist:number;
  comboWatch:boolean;comboCondLeft:number;comboCondBits:number;
  /** Native order: hit, crit, kill, hurt, critHurt, block, evade, move, heal. */
  since:ArrayLike<number>;
}
export interface ActorConditionPorts<A> {
  maxLife(actor:A):number;
  maxMana(actor:A):number;
  maxEs(actor:A):number;
  lowLifeFraction(actor:A):number;
  strideReach(actor:A):number;
}
export interface ActorConditionConfig {
  readonly fullLifeFraction:number;
  readonly lowManaFraction:number;
  readonly fullManaFraction:number;
  readonly fullEsFraction:number;
  readonly lowEsFraction:number;
  readonly plantSeconds:number;
  readonly movingSeconds:number;
  readonly recentWindows:readonly number[];
}
export const DEFAULT_ACTOR_CONDITIONS:ActorConditionConfig=Object.freeze({
  fullLifeFraction:.95,lowManaFraction:.25,fullManaFraction:.95,fullEsFraction:.99,lowEsFraction:.35,
  plantSeconds:1,movingSeconds:.15,recentWindows:Object.freeze([4,4,4,4,4,4,4,4,4]),
});
const recentRows=Object.freeze([
  [bits.recentlyHit,0,true],[bits.recentlyCrit,1,true],[bits.recentlyKilled,2,true],
  [bits.recentlyHurt,3,true],[bits.notHurtRecently,3,false],
  [bits.recentlyBlocked,5,true],[bits.recentlyEvaded,6,true],
  [bits.recentlyMoved,7,true],[bits.recentlyHealed,8,true],
].map(row=>Object.freeze(row as [number,number,boolean])));

function configuration(input:ActorConditionConfig):ActorConditionConfig {
  const fraction=(value:number,name:string)=>{
    if(finite(value,name)<0||value>1)throw new Error(name+' must be between zero and one');
    return value;
  };
  const seconds=(value:number,name:string)=>{
    if(finite(value,name)<0)throw new Error(name+' must be nonnegative');
    return value;
  };
  if(!Array.isArray(input.recentWindows)||input.recentWindows.length!==9)throw new Error('Actor conditions require nine recency windows');
  // Array.from visits sparse holes, which must be rejected like explicit undefined.
  const recentWindows=Object.freeze(Array.from(input.recentWindows,(value,i)=>seconds(value,'Recency window '+i)));
  return Object.freeze({
    fullLifeFraction:fraction(input.fullLifeFraction,'Full life fraction'),
    lowManaFraction:fraction(input.lowManaFraction,'Low mana fraction'),
    fullManaFraction:fraction(input.fullManaFraction,'Full mana fraction'),
    fullEsFraction:fraction(input.fullEsFraction,'Full shield fraction'),
    lowEsFraction:fraction(input.lowEsFraction,'Low shield fraction'),
    plantSeconds:seconds(input.plantSeconds,'Plant time'),movingSeconds:seconds(input.movingSeconds,'Moving time'),recentWindows,
  });
}

/** Shared policy over borrowed actor state. Host values and read ports must be
 * coherent and finite. Reads may not mutate the sampled actor. Configuration
 * is validated once; the hot path does not revalidate the entire host record.
 * See docs/actor-conditions.md for phase, queue and callback ownership. */
export class ActorConditions<A extends ActorConditionOwner> {
  private readonly config:ActorConditionConfig;
  constructor(private readonly ports:ActorConditionPorts<A>,config:ActorConditionConfig=DEFAULT_ACTOR_CONDITIONS) {
    this.config=configuration(config);
  }

  /** Last sampled state, including during publication; never a fresh query. */
  holds(actor:ActorConditionState,id:string):boolean {
    return actor.condMask!==-1&&Object.hasOwn(bits,id)&&(actor.condMask&bits[id as ActorConditionId])!==0;
  }

  /** Force replacement after an external sink edit without manufacturing edges. */
  invalidate(actor:ActorConditionState):void {
    if(actor.condSheet===sampling)throw new Error('Actor condition publication cannot reenter');
    actor.condSheet=null;
  }

  /** Returns true when a full replacement was published. Same-actor re-entry
   * is refused before reads, including across policy instances. Different actors
   * can nest. A failure clears confirmation but retains already committed edges. */
  refresh(actor:A):boolean {
    const previous=actor.condSheet;
    if(previous===sampling)throw new Error('Actor condition publication cannot reenter');
    actor.condSheet=sampling;
    try {
      const maxLife=this.ports.maxLife(actor),maxMana=this.ports.maxMana(actor),maxEs=this.ports.maxEs(actor),cfg=this.config;
      let mask=0;
      if(actor.life<maxLife*this.ports.lowLifeFraction(actor))mask|=bits.lowLife;
      if(actor.life>=maxLife*cfg.fullLifeFraction)mask|=bits.fullLife;
      if(maxMana>0&&actor.mana<maxMana*cfg.lowManaFraction)mask|=bits.lowMana;
      if(maxMana>0&&actor.mana>=maxMana*cfg.fullManaFraction)mask|=bits.fullMana;
      if(actor.es>.5)mask|=bits.hasEs;
      if(maxEs>0&&actor.es>=maxEs*cfg.fullEsFraction)mask|=bits.fullEs;
      if(maxEs>0&&actor.es<maxEs*cfg.lowEsFraction)mask|=bits.lowEs;
      if(actor.casting?.mode==='guard')mask|=bits.guarding;
      if(actor.poise>.5&&!actor.poiseBroken)mask|=bits.poised;
      if(actor.poiseBroken)mask|=bits.poiseBroken;
      if(actor.esRecharging)mask|=bits.esRecharging;
      if(actor.plantFor>cfg.plantSeconds)mask|=bits.stationary;
      else if(actor.idleFor<cfg.movingSeconds)mask|=bits.moving;
      if(actor.strideDist>0){
        const reach=this.ports.strideReach(actor);
        if(reach>0&&actor.strideDist>=reach)mask|=bits.strided;
      }
      if(actor.comboWatch&&actor.comboCondLeft>0){
        if(actor.comboCondBits&1)mask|=bits.comboVaried;
        if(actor.comboCondBits&2)mask|=bits.comboRepeated;
      }
      for(const [bit,index,within]of recentRows)if((actor.since[index]<cfg.recentWindows[index])===within)mask|=bit;
      const sink=actor.sheet;
      if(mask===actor.condMask&&previous===sink){actor.condSheet=sink;return false;}
      const rose=actor.condMask===-1?0:mask&~actor.condMask;
      actor.condMask=mask;
      const active:ActorConditionId[]=[];
      for(let i=0;i<ACTOR_CONDITION_IDS.length;i++){
        const bit=1<<i,id=ACTOR_CONDITION_IDS[i];
        if(mask&bit)active.push(id);
        if((rose&bit)&&actor.condRose.length<16)actor.condRose.push(id);
      }
      sink.setConditions(active);
      actor.condSheet=sink;
      return true;
    }finally{
      if(actor.condSheet===sampling)actor.condSheet=null;
    }
  }
}
