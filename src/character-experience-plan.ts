import {ProgressionHost,type CharacterProgression} from './character-progression.js';

export interface ExperienceCheckpoint {readonly level:number;readonly xp:number;readonly xpNeeded:number;readonly passivePoints:number}
export interface OwnedExperienceState extends ExperienceCheckpoint {readonly classId:string;readonly ledger:Readonly<Record<string,number>>}
export interface ExperienceObservation {readonly eligible:boolean;readonly blessing:number;readonly multiplier:number;readonly local:boolean;readonly accountOwned:boolean}
export type ExperienceEvent={readonly kind:'mark-dirty'|'recalculate';readonly state:ExperienceCheckpoint}|{readonly kind:'fill-if-not-downed'|'announce'|'resync-mercenary'};
export interface ExperiencePlan {readonly accepted:boolean;readonly before:ExperienceCheckpoint;readonly after:ExperienceCheckpoint;readonly ledgerBefore:Readonly<Record<string,number>>;readonly ledgerAfter:Readonly<Record<string,number>>;readonly events:readonly ExperienceEvent[]}
const checkpoint=(hero:{level:number},state:{xp:number;xpNeeded:number;passivePoints:number}):ExperienceCheckpoint=>Object.freeze({level:hero.level,xp:state.xp,xpNeeded:state.xpNeeded,passivePoints:state.passivePoints});
const same=(a:ExperienceCheckpoint,b:ExperienceCheckpoint)=>a.level===b.level&&a.xp===b.xp&&a.xpNeeded===b.xpNeeded&&a.passivePoints===b.passivePoints;

/** Internal planning over already admitted owned run data. No clock, actor,
 * inventory, account save or I/O is captured. Award authority and ownership of
 * the shared run ledger belong to the composing transaction, not this helper. */
export function planExperience(rules:CharacterProgression,input:OwnedExperienceState,amount:number,observation:ExperienceObservation,maxLevels=256):ExperiencePlan {
 if(!Object.isFrozen(input.ledger))throw Error('Experience planning requires an owned immutable ledger');
 for(const flag of [observation.eligible,observation.local,observation.accountOwned])if(typeof flag!=='boolean')throw Error('Invalid experience observation');
 const hero={level:input.level},state={xp:input.xp,xpNeeded:input.xpNeeded,passivePoints:input.passivePoints},before=checkpoint(hero,state),events:ExperienceEvent[]=[];
 let ledger=input.ledger;
 const mutableLedger=():Record<string,number>=>{
  // Most XP awards add no milestone. Retain the admitted immutable ledger in
  // that case; copy once only when the existing rule will actually stamp it.
  const missing=(rows:readonly {level:number;key:string}[])=>rows.some(row=>hero.level>=row.level&&(!Object.hasOwn(input.ledger,row.key)||!input.ledger[row.key]));
  if(missing(rules.pack.milestones)||missing(rules.classMilestones(input.classId)))ledger=Object.assign(Object.create(null),input.ledger);
  return ledger as Record<string,number>;
 };
 new ProgressionHost<null,typeof hero>({
  state:()=>state,hero:()=>hero,classId:()=>input.classId,eligible:()=>observation.eligible,rules:()=>rules,
  blessing:()=>observation.blessing,experienceMultiplier:()=>observation.multiplier,
  markDirty:()=>{events.push(Object.freeze({kind:'mark-dirty',state:checkpoint(hero,state)}));},
  recalculate:()=>{events.push(Object.freeze({kind:'recalculate',state:checkpoint(hero,state)}));},
  // The private hero deliberately has no downed observation. Every level plans
  // a conditional fill that the live publisher evaluates after its rebuild.
  fillResources:()=>{events.push(Object.freeze({kind:'fill-if-not-downed'}));},
  announce:()=>{events.push(Object.freeze({kind:'announce'}));},local:()=>observation.local,
  resyncMercenary:()=>{events.push(Object.freeze({kind:'resync-mercenary'}));},accountOwned:()=>observation.accountOwned,ledger:mutableLedger
 },maxLevels).grant(null,amount);
 Object.freeze(ledger);
 return Object.freeze({accepted:observation.eligible,before,after:checkpoint(hero,state),ledgerBefore:input.ledger,ledgerAfter:ledger,events:Object.freeze(events)});
}

export interface ExperienceEffectPorts {
 read():ExperienceCheckpoint;ledger():Readonly<Record<string,number>>;
 write(state:ExperienceCheckpoint):undefined;writeLedger(ledger:Readonly<Record<string,number>>):undefined;
 markDirty():undefined;recalculate():undefined;downed():boolean;fillResources():undefined;announce():undefined;resyncMercenary():undefined;
}
/** Trusted prepared effects only. Exceptions leave preceding effects applied;
 * the composing owner must require recovery, as with other live publication. */
export class ExperiencePlanEffects {
 readonly #ports:ExperienceEffectPorts;#busy=false;
 constructor(ports:ExperienceEffectPorts){
  const bound={} as ExperienceEffectPorts;
  for(const key of ['read','ledger','write','writeLedger','markDirty','recalculate','downed','fillResources','announce','resyncMercenary'] as const){
   const fn=ports[key];if(typeof fn!=='function')throw Error('Missing experience '+key+' port');Object.defineProperty(bound,key,{value:fn.bind(ports)});
  }
  this.#ports=bound;
 }
 play(plan:ExperiencePlan):void{
  if(this.#busy)throw Error('Reentrant experience publication');this.#busy=true;
  try{
   const p=this.#ports,complete=(value:unknown)=>{if(value!==undefined)throw Error('Experience publication must complete synchronously');};
   if(!same(p.read(),plan.before)||JSON.stringify(p.ledger())!==JSON.stringify(plan.ledgerBefore))throw Error('Stale experience investment');
   for(const event of plan.events){
    if(event.kind==='mark-dirty'||event.kind==='recalculate'){
     complete(p.write(event.state));complete(event.kind==='mark-dirty'?p.markDirty():p.recalculate());
     if(!same(p.read(),event.state))throw Error('Experience callback changed investment');
    }else if(event.kind==='fill-if-not-downed'){
     const downed=p.downed();if(typeof downed!=='boolean')throw Error('Invalid current downed observation');if(!downed)complete(p.fillResources());
    }else if(event.kind==='announce')complete(p.announce());
    else if(event.kind==='resync-mercenary')complete(p.resyncMercenary());
    else throw Error('Unknown experience publication event');
   }
   if(!same(p.read(),plan.after)||JSON.stringify(p.ledger())!==JSON.stringify(plan.ledgerBefore))throw Error('Experience publication changed investment');
   if(plan.ledgerAfter!==plan.ledgerBefore)complete(p.writeLedger(plan.ledgerAfter));
  }finally{this.#busy=false;}
 }
}
