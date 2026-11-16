import {healLife,refillLife,type HealingState,type HealingPorts,type RefillPorts} from './life-recovery.js';
export interface VitalActor<A,I,Tag,M> extends HealingState{
  name:string;mana:number;reservedLife:number;reservedMana:number;es:number;esJustFilled:boolean;esDelay:number;esRecharging:boolean;
  poise:number;poiseBroken:boolean;poiseCalm:number;poiseDelay:number;poiseJustBroke:boolean;poiseBracketHits:number[];insight:number;endurance:number;ward:number;idleFor:number;
  since:Float64Array;stagger?:{amount:number;perSec:number};casting?:{mode:string;inst:I}|null;
  sheet:{get(stat:string,tags?:ReadonlySet<Tag>,extra?:readonly M[]):number};stanceRead():{tags:ReadonlySet<Tag>;extra:M[]}|null|undefined;
  maxLife():number;maxMana():number;maxEs():number;maxPoise():number;maxInsight():number;maxEndurance():number;lifeCeiling():number;refillLife():void;
  applyStatus(id:string,dps:number,scale:number,source:string):unknown;noteRecent(kind:'heal'):void;onLifeHealed?:(amount:number,silent:boolean)=>void;
}
export interface VitalRules {insightGrace:number;weightMin:number;weightPerPoise:number;poiseBrackets:readonly number[];poiseBreakStatus:string}
export interface VitalPorts<A,I,Tag,M>{tags(skill:I):ReadonlySet<Tag>;modifiers(skill:I):M[];statusExists(id:string):boolean;healed?(actor:A,amount:number):void}
/** Shared actor pool operations used by damage, healing, procs and timers.
 * No second resource copy or host-specific body class is introduced. */
export class ActorVitals<A extends VitalActor<A,I,Tag,M>,I,Tag,M>{
  readonly #healing:HealingPorts<A>;readonly #refill:RefillPorts<A>;
  constructor(readonly rules:VitalRules,readonly ports:VitalPorts<A,I,Tag,M>){this.#healing={ceiling:a=>a.lifeCeiling(),rate:a=>a.sheet.get('healTaken'),tapped:(a,n)=>{ports.healed?.(a,n);},observed:(a,n,silent)=>{a.onLifeHealed?.(n,silent);},recent:a=>{a.noteRecent('heal');}};this.#refill={maximumLife:a=>a.maxLife(),observed:(a,n,silent)=>{a.onLifeHealed?.(n,silent);}};}
  maxLife(a:A){return a.sheet.get('life');}maxMana(a:A){return a.sheet.get('mana');}maxEs(a:A){return a.sheet.get('energyShield');}
  maxPoise(a:A){const sc=a.stanceRead();return a.sheet.get('poise',sc?.tags,sc?.extra);}maxInsight(a:A){return a.sheet.get('insight');}maxEndurance(a:A){return a.sheet.get('endurance');}
  availableMaxMana(a:A){return Math.max(0,a.maxMana()-a.reservedMana);}lifeCeiling(a:A){return Math.max(1,a.maxLife()-a.reservedLife);}
  stanceRead(a:A):{tags:ReadonlySet<Tag>;extra:M[]}|null{if(a.casting?.mode!=='channel'&&a.casting?.mode!=='guard')return null;const i=a.casting.inst;return{tags:this.ports.tags(i),extra:this.ports.modifiers(i)};}
  insightMomentum(a:A):number{
    const sap=Math.min(1,a.sheet.get('insightSap'));if(sap>=1)return 0;const idle=a.idleFor-this.rules.insightGrace;
    const moving=idle<=0?1:Math.max(0,1-idle/Math.max(.1,a.sheet.get('insightTaper'))),inv=Math.min(1,a.sheet.get('insightInversion'));if(inv<=0)return moving*(1-sap);
    const still=idle<=0?0:Math.min(1,idle/Math.max(.1,a.sheet.get('insightStillTaper')));return(moving*(1-inv)+still*inv)*(1-sap);
  }
  damagePoise(a:A,amount:number,breaker?:A,tags?:ReadonlySet<Tag>,extra?:readonly M[]):boolean{
    const max=a.maxPoise();if(amount<=0||max<=0)return false;a.poiseCalm=0;if(a.poiseBroken)return false;const before=a.poise;a.poise=Math.max(0,a.poise-amount);
    for(const frac of this.rules.poiseBrackets){const rung=max*frac;if(before>rung&&a.poise<=rung)a.poiseBracketHits.push(frac);}
    if(a.poise<=0&&before>0){a.poiseBroken=true;a.poiseJustBroke=true;a.poiseDelay=a.sheet.get('poiseRegenDelay');const id=this.rules.poiseBreakStatus;
      if(id&&this.ports.statusExists(id))a.applyStatus(id,0,breaker?breaker.sheet.get('sunderDuration',tags,extra):1,breaker?.name??'Poise Break');return true;}return false;
  }
  gainPoise(a:A,amount:number):number{if(amount<=0||a.dead)return 0;const max=a.maxPoise();if(max<=0)return 0;const cap=max*(1+a.sheet.get('poiseOvercharge')),before=a.poise;a.poise=Math.min(cap,a.poise+amount);return a.poise-before;}
  gainEs(a:A,amount:number):number{if(amount<=0||a.dead)return 0;const max=a.maxEs();if(max<=0)return 0;const before=a.es;a.es=Math.min(max,a.es+amount);if(before<max-.001&&a.es>=max-.001)a.esJustFilled=true;return a.es-before;}
  gainEndurance(a:A,amount:number):number{if(amount<=0||a.dead)return 0;const max=a.maxEndurance(),before=a.endurance;a.endurance=Math.min(max,a.endurance+amount);return a.endurance-before;}
  gainWard(a:A,amount:number):number{if(amount<=0||a.dead)return 0;const gain=amount*a.sheet.get('wardGain');a.ward+=gain;return gain;}
  effectiveWeight(a:A):number{let weight=a.sheet.get('weight');if(a.poise>0&&!a.poiseBroken)weight*=1+a.poise*this.rules.weightPerPoise;return Math.max(this.rules.weightMin,weight);}
  staggerDamage(a:A,amount:number):void{if(amount<=0)return;const s=a.stagger??={amount:0,perSec:0};s.amount+=amount;s.perSec=s.amount/a.sheet.get('staggerWindow');}
  healBy(a:A,amount:number,silent=false):number{return healLife(a,amount,this.#healing,silent);}
  refillLife(a:A):void{refillLife(a,this.#refill);}
  fillResources(a:A):void{a.refillLife();a.mana=a.maxMana();a.es=a.maxEs();a.poise=a.maxPoise();a.insight=a.maxInsight();a.endurance=a.maxEndurance();a.poiseBroken=false;a.poiseDelay=0;a.poiseCalm=0;a.esDelay=0;a.esRecharging=false;}
}
