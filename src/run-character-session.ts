import type {CharacterDelivery} from './memory-delivery.js';
import type {OwnedVocationGrant} from './character-vocation-commands.js';
import {vocationUnlockKey} from './vocation-keys.js';
import {relicExperienceFactor} from './relic-experience.js';
import {CompleteAccountWorkshopSession} from './account-workshop-complete.js';
import {CompleteAccountKernel,type CompleteAccountPorts} from './complete-account-commands.js';
import type {AccountWorkshopDefinitions,AccountWorkshopLimits} from './account-workshop-core.js';
import type {PreparedStepScope} from './account-prepared-step.js';
import type {CharacterWorkshopDefinitions,CharacterWorkshopHandle,CharacterPointGrant} from './character-workshop-commands.js';
import type {PreparedCharacterCommand} from './complete-character-contracts.js';
import type {CharacterProgression} from './character-progression.js';
import {planExperience,type ExperiencePlan,type ExperienceObservation} from './character-experience-plan.js';
import {copySessionJSON,SessionInputError,requireSession as need,sessionFields as fields,sessionRecord as record,sessionText as text,sessionInteger as integer,sessionArray as array,type SessionJSON} from './session-json.js';

type JSONRecord=Record<string,SessionJSON>;
export interface RunCharacter {readonly key:string;readonly accountKey:string;readonly xp:number;readonly xpNeeded:number}
export interface RunState {readonly schemaVersion:1;readonly capability:'run-progression/diagnostic';readonly key:string;readonly ledger:Readonly<Record<string,number>>;readonly characters:readonly RunCharacter[]}
export type RunAction={readonly kind:'deliveries';readonly profile:number;readonly drops:readonly CharacterDelivery[]}|{readonly kind:'account-counter';readonly profile:number;readonly key:string;readonly amount:number;readonly mode:'add'|'set'}|{readonly kind:'vocation';readonly profile:number;readonly id:string}|{readonly kind:'award';readonly profile:number;readonly amount:number}|{readonly kind:'points';readonly profile:number;readonly currency:'passive'|'vocation';readonly amount:number}|{readonly kind:'run-ledger';readonly key:string;readonly amount:number}|{readonly kind:'command';readonly command:JSONRecord};
export interface RunPreparedCommand {readonly character:PreparedCharacterCommand;readonly before:RunState;readonly after:RunState;readonly experience?:ExperiencePlan}
export interface RunCharacterDefinitions {account:AccountWorkshopDefinitions;character:CharacterWorkshopDefinitions;experience:CharacterProgression}
export interface RunExperienceObservation extends Omit<ExperienceObservation,'multiplier'> {readonly relicSuppressed:boolean}
export interface RunCharacterPorts extends Omit<CompleteAccountPorts,'experience'|'points'|'vocation'|'rewards'|'reuseAccountBuilds'> {vocation?(request:Readonly<{profile:number;accountKey:string;id:string}>):Readonly<{maxPerCharacter:number;accountWrites:boolean}>;experience(request:Readonly<{profile:number;accountKey:string;amount:number}>):RunExperienceObservation}
const raw=(value:unknown):JSONRecord=>{record(value);return value as JSONRecord;};
const passed=(value:unknown):JSONRecord=>{const r=raw(value);need(r.ok===true,typeof r.reason==='string'?r.reason:'run-command-refused');return r;};
const internal=(value:JSONRecord)=>['character-reward-delivery','run-account-counter','run-vocation','character-vocation-grant','run-experience','run-points','run-ledger','character-experience-levels','character-point-grant'].includes(String(value.op))||
 value.op==='workshop'&&value.command!==null&&typeof value.command==='object'&&!Array.isArray(value.command)&&['character-reward-delivery','character-vocation-grant','character-experience-levels','character-point-grant'].includes(String(value.command.op));

/** Internal synchronous preparation/commit owner. Persistence,
 * player admission and live actor publication are NOT provided by this class.
 * Level and passive currency remain exclusively in the character owner. */
export class RunCharacterSession {
 readonly #rewardGrants=new Map<number,{profile:number;drops:readonly CharacterDelivery[]}>();
 #rewardPlan?:{grant:number;profile:number;accountKey:string;drops:readonly CharacterDelivery[]};
 readonly #counterGrants=new Map<number,{profile:number;key:string;amount:number;mode:'add'|'set'}>();
 readonly #vocationGrants=new Map<number,{profile:number;id:string}>();readonly #observeVocation;
 #vocationPlan?:{grant:number;profile:number;accountKey:string;value:OwnedVocationGrant};
 readonly #owner;readonly #kernel;readonly #rules;readonly #observe;readonly #relicPenalty;
 #run?:RunState;#staged?:RunState;#pending?:{token:number;state:RunState;journal:readonly RunPreparedCommand[]};
 #bindings=new Map<number,string>();#busy=false;#grants=new Map<number,{profile:number;amount:number}>();
 #pointGrants=new Map<number,{profile:number;value:CharacterPointGrant}>();#ledgerGrants=new Map<number,{key:string;amount:number}>();
 #point?:{grant:number;profile:number;accountKey:string;value:CharacterPointGrant};
 #plan?:{grant:number;profile:number;accountKey:string;plan:ExperiencePlan};
 #rows:{before:RunState;after:RunState;experience?:ExperiencePlan}[]=[];
 constructor(definitions:RunCharacterDefinitions,ports:RunCharacterPorts,limits:AccountWorkshopLimits={}){
  need(typeof ports.experience==='function','experience-observation-required');this.#rules=definitions.experience;this.#observe=ports.experience.bind(ports);
  this.#relicPenalty=definitions.account.progression.unlocks.reliquaryConfig.xpPenaltyPerCell;
  relicExperienceFactor(0,this.#relicPenalty,true);
  this.#observeVocation=ports.vocation?.bind(ports);
  const conditions=ports.conditions.bind(ports);
  this.#kernel=new CompleteAccountKernel(definitions.character,{reuseAccountBuilds:true,trace:ports.trace?.bind(ports),
   conditions:request=>{
    const observed=raw(copySessionJSON(conditions(request)));
    if(raw(request.command).op==='character-passive'){need(this.#staged||this.#run,'run-not-attached');return{...observed,runLedger:(this.#staged??this.#run)!.ledger};}
    return observed;
   },
   rewards:request=>{const held=this.#rewardPlan;need(held&&held.grant===request.grant&&held.profile===request.profile&&held.accountKey===request.accountKey,'unowned-reward-delivery');this.#rewardPlan=undefined;return held.drops;},
   vocation:request=>{const held=this.#vocationPlan;need(held&&held.grant===request.grant&&held.profile===request.profile&&held.accountKey===request.accountKey,'unowned-vocation-grant');this.#vocationPlan=undefined;return held.value;},
   points:request=>{const held=this.#point;need(held&&held.grant===request.grant&&held.profile===request.profile&&held.accountKey===request.accountKey,'unowned-point-grant');this.#point=undefined;return held.value;},
   experience:request=>{
    const held=this.#plan;need(held&&held.grant===request.grant&&held.profile===request.profile&&held.accountKey===request.accountKey,'unowned-experience-grant');
    this.#plan=undefined;return held.plan;
   }
  });
  this.#owner=new CompleteAccountWorkshopSession({...definitions.account,completeKernel:this.#kernel,preparedStep:(command,scope)=>this.#step(command,scope)},limits);
 }
 #step(command:JSONRecord,scope:PreparedStepScope):JSONRecord|undefined{
  const before=this.#staged;need(before,'run-preparation-required');
  if(command.op==='workshop'&&raw(command.command).op==='character-reward-delivery'){
   fields(command,['op','profile','command']);integer(command.profile,0,0xffffffff);const request=raw(command.command);fields(request,['op','grant']);integer(request.grant,1);
   const grant=this.#rewardGrants.get(request.grant);need(grant&&grant.profile===command.profile,'unowned-reward-delivery');this.#rewardGrants.delete(request.grant);
   const key=this.#bindings.get(grant.profile),row=before.characters.find(r=>r.key===key);need(row,'character-not-in-run');const current=scope.read(grant.profile);need(current.accountKey===row.accountKey,'run-account-mismatch');
   this.#rewardPlan={grant:request.grant,profile:grant.profile,accountKey:row.accountKey,drops:grant.drops};const reply=passed(scope.execute(command));need(!this.#rewardPlan,'reward-delivery-not-consumed');this.#rows.push({before,after:before});return reply;
  }
  if(command.op==='run-account-counter'){
   fields(command,['op','profile','grant']);integer(command.profile,0,0xffffffff);integer(command.grant,1);const grant=this.#counterGrants.get(command.grant);need(grant&&grant.profile===command.profile,'unowned-account-counter');this.#counterGrants.delete(command.grant);
   const key=this.#bindings.get(grant.profile),row=before.characters.find(r=>r.key===key);need(row,'character-not-in-run');need(scope.read(grant.profile).accountKey===row.accountKey,'run-account-mismatch');
   const result=scope.counter(grant.profile,grant.key,grant.amount,grant.mode);this.#rows.push({before,after:before});return result;
  }
  if(command.op==='run-vocation'){
   fields(command,['op','profile','grant']);integer(command.profile,0,0xffffffff);integer(command.grant,1);const grant=this.#vocationGrants.get(command.grant);need(grant&&grant.profile===command.profile,'unowned-vocation-grant');this.#vocationGrants.delete(command.grant);
   const key=this.#bindings.get(grant.profile),row=before.characters.find(r=>r.key===key);need(row,'character-not-in-run');const current=scope.read(grant.profile);need(current.accountKey===row.accountKey,'run-account-mismatch');need(this.#observeVocation,'vocation-observation-required');
   const observed=copySessionJSON(this.#observeVocation(Object.freeze({profile:grant.profile,accountKey:row.accountKey,id:grant.id})));fields(observed,['maxPerCharacter','accountWrites']);integer(observed.maxPerCharacter,0,256);need(typeof observed.accountWrites==='boolean','invalid-vocation-account-policy');
   const counterKey=vocationUnlockKey(grant.id),present=Object.hasOwn(before.ledger,counterKey),runCount=present?before.ledger[counterKey]:0;
   this.#vocationPlan={grant:command.grant,profile:grant.profile,accountKey:row.accountKey,value:{id:grant.id,runCount,maxPerCharacter:observed.maxPerCharacter,accountWrites:observed.accountWrites}};
   const reply=passed(scope.execute({op:'workshop',profile:grant.profile,command:{op:'character-vocation-grant',grant:command.grant}}));need(!this.#vocationPlan,'vocation-grant-not-consumed');const result=raw(reply.reply);let after=before;
   if(result.runCounter!==null){const counter=raw(result.runCounter);need(counter.key===counterKey&&counter.before===runCount,'vocation-counter-mismatch');integer(counter.after);if(!present)need(Object.keys(before.ledger).length<4096,'run-ledger-limit');
    after=Object.freeze({...before,ledger:Object.freeze({...before.ledger,[counterKey]:counter.after})});}
   this.#staged=after;this.#rows.push({before,after});return reply;
  }
  if(command.op==='run-ledger'){
   fields(command,['op','grant']);integer(command.grant,1);const grant=this.#ledgerGrants.get(command.grant);need(grant,'unowned-run-ledger');this.#ledgerGrants.delete(command.grant);
   const present=Object.hasOwn(before.ledger,grant.key),old=present?before.ledger[grant.key]:0,next=old+grant.amount;integer(next);if(!present)need(Object.keys(before.ledger).length<4096,'run-ledger-limit');const changed=!present||next!==old;
   const after=changed?Object.freeze({...before,ledger:Object.freeze({...before.ledger,[grant.key]:next})}):before;this.#staged=after;this.#rows.push({before,after});
   return{ok:true,reply:{ok:true,events:[{kind:'run-ledger',key:grant.key,before:old,after:next}]}};
  }
  if(command.op==='run-points'){
   fields(command,['op','profile','grant']);integer(command.profile,0,0xffffffff);integer(command.grant,1);const grant=this.#pointGrants.get(command.grant);need(grant&&grant.profile===command.profile,'unowned-point-grant');this.#pointGrants.delete(command.grant);
   const key=this.#bindings.get(grant.profile),row=before.characters.find(r=>r.key===key);need(row,'character-not-in-run');const current=scope.read(grant.profile);need(current.accountKey===row.accountKey,'run-account-mismatch');
   this.#point={grant:command.grant,profile:grant.profile,accountKey:row.accountKey,value:grant.value};const reply=passed(scope.execute({op:'workshop',profile:grant.profile,command:{op:'character-point-grant',grant:command.grant}}));need(!this.#point,'point-grant-not-consumed');
   this.#rows.push({before,after:before});return reply;
  }
  if(command.op!=='run-experience'){
   need(!internal(command),'unowned-experience-grant');
   if(command.op==='workshop'){integer(command.profile,0,0xffffffff);need(this.#bindings.has(command.profile),'character-not-in-run');}
   this.#rows.push({before,after:before});return undefined;
  }
  fields(command,['op','profile','grant']);integer(command.profile,0,0xffffffff);integer(command.grant,1);
  const grant=this.#grants.get(command.grant);need(grant&&grant.profile===command.profile,'unowned-experience-grant');this.#grants.delete(command.grant);
  const key=this.#bindings.get(grant.profile),row=before.characters.find(r=>r.key===key);need(row,'character-not-in-run');
  const current=scope.read(grant.profile);need(current.accountKey===row.accountKey,'run-account-mismatch');
  const observed=copySessionJSON(this.#observe(Object.freeze({profile:grant.profile,accountKey:row.accountKey,amount:grant.amount})));
  fields(observed,['eligible','blessing','relicSuppressed','local','accountOwned']);need(typeof observed.relicSuppressed==='boolean','invalid-relic-suppression');
  const multiplier=relicExperienceFactor(current.relicCells,this.#relicPenalty,current.relicEnabled&&!observed.relicSuppressed);
  const plan=planExperience(this.#rules,{...current,xp:row.xp,xpNeeded:row.xpNeeded,ledger:before.ledger},grant.amount,{...observed,multiplier} as unknown as ExperienceObservation);
  if(plan.ledgerAfter!==before.ledger)need(Object.keys(plan.ledgerAfter).length<=4096,'run-ledger-limit');
  let result:JSONRecord={ok:true,reply:{ok:true,accepted:plan.accepted,events:plan.events as unknown as SessionJSON}};
  if(plan.after.level!==plan.before.level){
   this.#plan={grant:command.grant,profile:grant.profile,accountKey:row.accountKey,plan};
   result=passed(scope.execute({op:'workshop',profile:grant.profile,command:{op:'character-experience-levels',grant:command.grant}}));
   need(!this.#plan,'experience-plan-not-consumed');
  }
  const changed=row.xp!==plan.after.xp||row.xpNeeded!==plan.after.xpNeeded||before.ledger!==plan.ledgerAfter;
  const after=changed?Object.freeze({...before,ledger:plan.ledgerAfter,characters:Object.freeze(before.characters.map(r=>r===row?Object.freeze({...r,xp:plan.after.xp,xpNeeded:plan.after.xpNeeded}):r))}):before;
  this.#staged=after;this.#rows.push({before,after,experience:plan});return result;
 }
 #guard<T>(work:()=>T):T{need(!this.#busy,'reentrant-run-command');this.#busy=true;try{return work();}finally{this.#busy=false;}}
 attach(input:unknown,bindings:readonly {profile:number;key:string}[]):void{this.#guard(()=>{
  need(!this.#run&&!this.#pending,'run-already-attached');const v=copySessionJSON(input);fields(v,['schemaVersion','capability','key','ledger','characters']);
  need(v.schemaVersion===1&&v.capability==='run-progression/diagnostic','unsupported-run');text(v.key);record(v.ledger);array(v.characters,256);
  need(v.characters.length>0&&Object.keys(v.ledger).length<=4096,'invalid-run-size');
  for(const[k,n]of Object.entries(v.ledger)){text(k);integer(n);}
  const keys=new Set<string>(),characters:RunCharacter[]=[];
  for(const r of v.characters){fields(r,['key','accountKey','xp','xpNeeded']);text(r.key);text(r.accountKey);need(!keys.has(r.key),'duplicate-run-character');keys.add(r.key);
   need(typeof r.xp==='number'&&Number.isFinite(r.xp),'invalid-run-experience');integer(r.xpNeeded,1);characters.push(Object.freeze(r as unknown as RunCharacter));}
  const admitted=new Map<number,string>(),seen=new Set<string>();need(bindings.length===characters.length,'incomplete-run-bindings');
  for(const b of bindings){fields(b,['profile','key']);integer(b.profile,0,0xffffffff);text(b.key);need(!admitted.has(b.profile)&&!seen.has(b.key),'duplicate-run-binding');
   const r=characters.find(r=>r.key===b.key);need(r,'unknown-run-character');const saved=raw(passed(this.#owner.command({op:'workshop-save',profile:b.profile})).save);
   need(saved.accountKey===r.accountKey,'run-account-mismatch');admitted.set(b.profile,b.key);seen.add(b.key);}
  this.#bindings=admitted;this.#run=Object.freeze({schemaVersion:1,capability:'run-progression/diagnostic',key:v.key,ledger:Object.freeze(v.ledger as Record<string,number>),characters:Object.freeze(characters)});
 });}
 read():RunState{need(!this.#busy,'reentrant-run-command');need(this.#run,'run-not-attached');return this.#run;}
 prepared(token:number){need(!this.#busy,'reentrant-run-command');integer(token,1);const p=this.#pending;need(p&&p.token===token,'stale-run-preparation');return Object.freeze({state:p.state,journal:p.journal});}
 /** Detached build diagnostics; no mutable continuation or owner escapes. */
 build(handle:object){need(!this.#busy,'reentrant-run-command');return this.#kernel.read(handle as CharacterWorkshopHandle);}
 prepareTrusted(actions:readonly RunAction[]):unknown{return this.#guard(()=>this.#prepare(actions));}
 #prepare(input:unknown):unknown{
  need(this.#run,'run-not-attached');need(!this.#pending,'prepared-change-pending');const actions=copySessionJSON(input);array(actions,16);need(actions.length>0,'invalid-command-batch');
  this.#staged=this.#run;this.#rows=[];let pendingToken=0;
  try{
   const commands=actions.map((a,i)=>{record(a);
    if(a.kind==='deliveries'){
     fields(a,['kind','profile','drops']);integer(a.profile,0,0xffffffff);array(a.drops,64);need(a.drops.length>0,'empty-reward-delivery');const grant=i+1;this.#rewardGrants.set(grant,{profile:a.profile,drops:a.drops as unknown as CharacterDelivery[]});return{op:'workshop',profile:a.profile,command:{op:'character-reward-delivery',grant}};
    }
    if(a.kind==='account-counter'){
     fields(a,['kind','profile','key','amount','mode']);integer(a.profile,0,0xffffffff);text(a.key);integer(a.amount);need(a.mode==='add'||a.mode==='set','invalid-account-counter-mode');
     const grant=i+1;this.#counterGrants.set(grant,{profile:a.profile,key:a.key,amount:a.amount,mode:a.mode});return{op:'run-account-counter',profile:a.profile,grant};
    }
    if(a.kind==='vocation'){
     fields(a,['kind','profile','id']);integer(a.profile,0,0xffffffff);text(a.id);const grant=i+1;this.#vocationGrants.set(grant,{profile:a.profile,id:a.id});return{op:'run-vocation',profile:a.profile,grant};
    }
    if(a.kind==='points'){
     fields(a,['kind','profile','currency','amount']);integer(a.profile,0,0xffffffff);need(a.currency==='passive'||a.currency==='vocation','invalid-point-currency');integer(a.amount);const grant=i+1;this.#pointGrants.set(grant,{profile:a.profile,value:{currency:a.currency,amount:a.amount}});return{op:'run-points',profile:a.profile,grant};
    }
    if(a.kind==='run-ledger'){
     fields(a,['kind','key','amount']);text(a.key);integer(a.amount);const grant=i+1;this.#ledgerGrants.set(grant,{key:a.key,amount:a.amount});return{op:'run-ledger',grant};
    }
    if(a.kind==='award'){fields(a,['kind','profile','amount']);integer(a.profile,0,0xffffffff);need(typeof a.amount==='number'&&Number.isFinite(a.amount),'invalid-experience-award');
     const grant=i+1;this.#grants.set(grant,{profile:a.profile,amount:a.amount});return{op:'run-experience',profile:a.profile,grant};}
    fields(a,['kind','command']);need(a.kind==='command','invalid-run-action');const c=raw(a.command);need(!internal(c),'unowned-experience-grant');return c;
   });
   const result=passed(this.#owner.command({op:'prepare',commands}));integer(result.token);pendingToken=result.token;
   if(pendingToken){
    const rows=this.#owner.preparedJournal(pendingToken);need(rows.length===this.#rows.length,'run-journal-mismatch');
    const journal=Object.freeze(rows.map((character,index)=>Object.freeze({character,...this.#rows[index]})));
    this.#pending={token:pendingToken,state:this.#staged,journal};
   }else need(this.#staged===this.#run,'run-change-without-preparation');
   return result;
  }catch(error){if(pendingToken)this.#owner.command({op:'abort-prepared',token:pendingToken});throw error;}
  finally{this.#staged=undefined;this.#grants.clear();this.#plan=undefined;this.#pointGrants.clear();this.#ledgerGrants.clear();this.#point=undefined;this.#vocationPlan=undefined;this.#vocationGrants.clear();this.#counterGrants.clear();this.#rewardPlan=undefined;this.#rewardGrants.clear();this.#rows=[];}
 }
 command(input:unknown):unknown{
  try{return this.#guard(()=>{
   const c=raw(copySessionJSON(input));need(!internal(c),'unowned-experience-grant');
   if(c.op==='prepare'){fields(c,['op','commands']);array(c.commands,16);return this.#prepare(c.commands.map(command=>({kind:'command',command})));}
   if(c.op==='commit-prepared'||c.op==='abort-prepared'){
    fields(c,['op','token']);integer(c.token,1);const p=this.#pending;need(p&&p.token===c.token,'stale-run-preparation');const result=passed(this.#owner.command(c));
    if(c.op==='commit-prepared')this.#run=p.state;this.#pending=undefined;return result;
   }
   // Setup is allowed before attachment. Once attached, all investment writes
   // must use this owner's single preparation fence.
   if(this.#run)need(['account-save','workshop-save','account-relic-items','active-workshop','prepared-save','workshop-equipment-text','prepared-workshop-equipment-text'].includes(String(c.op)),'run-command-requires-preparation');
   return this.#owner.command(c);
  });}catch(error){if(error instanceof SessionInputError)return{ok:false,reason:error.message};throw error;}
 }
}
