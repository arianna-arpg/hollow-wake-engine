import type {CharacterDelivery} from './memory-delivery.js';
import type {OwnedVocationGrant} from './character-vocation-commands.js';
import type {ExperiencePlan} from './character-experience-plan.js';
import {CharacterWorkshopAdmission,type CharacterWorkshopDefinitions,type CharacterWorkshopHandle,type CharacterWorkshopScope,type CharacterPointGrant} from './character-workshop-commands.js';
import type {CompleteCharacterCodec,CompleteWorkshopKernel,CharacterObjectJSON,WorkshopRuleScope,CompleteBuildTransition} from './complete-character-contracts.js';
import {ProgressionCharacterData,type ProgressionCharacterState} from './workshop-character-progression.js';
import {CompleteWorkshopCharacterData as WorkshopCharacterData} from './workshop-character-complete.js';
import type {WorkshopCharacterState} from './workshop-character.js';
import type {CraftingSessionState} from './crafting-session-data.js';
import type {RandomState} from './types.js';
import {Random} from './random.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionInteger as integer,sessionArray as array,sessionRecord as record,sessionBoolean as bool,type SessionJSON} from './session-json.js';

type AccountProjection={key:string;craftLore:CraftingSessionState['account']['craftLore'];progression:{account:Pick<CraftingSessionState['account'],'features'|'ledger'>}};
export interface CompleteAccountTrace {
 profile:number;accountKey:string;stage:WorkshopRuleScope['stage'];previous?:object;continuation:CharacterWorkshopHandle;
 role:WorkshopRuleScope['relics']['role'];reply:SessionJSON;
}
export interface CompleteAccountPorts {
 /** Explicit opt-in for hosts that consume the account journal directly. */
 reuseAccountBuilds?:true;
 rewards?(request:{profile:number;accountKey:string;grant:number}):readonly CharacterDelivery[];
 vocation?(request:{profile:number;accountKey:string;grant:number}):OwnedVocationGrant;
 points?(request:{profile:number;accountKey:string;grant:number}):CharacterPointGrant;
 experience?(request:{profile:number;accountKey:string;grant:number}):ExperiencePlan;
 conditions(request:{profile:number;accountKey:string;command:SessionJSON}):unknown;
 trace?(packet:CompleteAccountTrace):unknown;
}
const equal=(a:unknown,b:unknown):boolean=>JSON.stringify(a)===JSON.stringify(b);
/** Read only the identity-bearing shape needed to choose the initial counter.
 * Full item, ownership and content admission still belongs to the workshop. */
function initialUid(value:unknown,context:unknown):number {
 record(value);array(value.items);record(value.equipped);array(value.overflow);
 record(context);record(context.containers);let floor=1;
 const visit=(item:unknown)=>{record(item);integer(item.uid,1,Number.MAX_SAFE_INTEGER-1);floor=Math.max(floor,item.uid+1);};
 for(const item of value.items)visit(item);
 for(const item of Object.values(value.equipped))visit(item);
 for(const item of value.overflow)visit(item);
 for(const rows of Object.values(context.containers)){array(rows);for(const item of rows)visit(item);}
 return floor;
}
const wrapped:Readonly<Record<string,'bar'|'rack'|'support'|'progression'|'merge'|'pickup'>>=Object.freeze({
 'character-bar':'bar','character-rack':'rack','character-support':'support','character-progression':'progression','character-merge':'merge','character-pickup':'pickup'
});

/** One private command router. Its input scope is supplied by the account
 * owner; the owner still admits replies and atomically commits the group. */
export class CompleteAccountKernel implements CompleteWorkshopKernel {
 readonly #service;readonly #content;readonly #conditions;readonly #trace;readonly #experience;readonly #points;readonly #vocation;readonly #rewards;readonly #reuseAccountBuilds;
 readonly character:CompleteCharacterCodec;
 constructor(definitions:CharacterWorkshopDefinitions,{conditions,trace=()=>{},experience,points,vocation,rewards,reuseAccountBuilds}:CompleteAccountPorts){
  need(typeof conditions==='function','trusted-character-conditions-required');
  this.#service=new CharacterWorkshopAdmission(definitions);this.#conditions=conditions;this.#trace=trace;this.#experience=experience;this.#points=points;this.#vocation=vocation;this.#rewards=rewards;this.#reuseAccountBuilds=reuseAccountBuilds===true;
  const base=new WorkshopCharacterData(definitions.character,definitions.workshop),codec=new ProgressionCharacterData(base,definitions.workshop.skills);
  this.character={admit:(value,state)=>codec.admit(value,state),
   // The account owner pairs these operations with this codec's admitted context.
   checkInventory:(value,state)=>codec.checkInventory(value as ProgressionCharacterState,state),
   // Shared helper reads only containers; the complete context has a new format tag.
   uidFloor:value=>base.uidFloor(value as WorkshopCharacterState)};
  this.#content={character:definitions.character.contentId,items:definitions.workshop.crafting.items.id,
   crafting:definitions.workshop.crafting.pack.contentId,skills:definitions.workshop.skills.pack.contentId};
 }
 execute(previous:object|undefined,rawOpen:Readonly<CharacterObjectJSON>,rawCommand:Readonly<CharacterObjectJSON>|undefined,scope:WorkshopRuleScope):ReturnType<CompleteWorkshopKernel['execute']>{
  const open=copySessionJSON(rawOpen),command=rawCommand===undefined?undefined:copySessionJSON(rawCommand);record(open);if(command!==undefined)record(command);
  // Scope has already passed the owning account's admission, never a player command.
  const account=scope.account as unknown as AccountProjection,progression=account.progression.account;
  need(account.key===scope.accountKey,'account-scope-mismatch');
  let state:CraftingSessionState,random:RandomState,nextUid:unknown;
  if(open.op==='open'){
   fields(open,['op','seed','state','nextUid']);need(!previous,'cold-with-continuation');integer(open.seed,0,0xffffffff);
   state=open.state as unknown as CraftingSessionState;random=new Random(open.seed).snapshot();
   nextUid=open.nextUid??initialUid(state,scope.characterInput);
  }else{
   fields(open,['op','save']);need(open.op==='restore','invalid-workshop-entry');const save=open.save;
   fields(save,['schemaVersion','capability','content','random','nextUid','state']);
   need(save.schemaVersion===1&&save.capability==='complete-workshop/diagnostic','unsupported-complete-workshop');
   need(equal(save.content,this.#content),'complete-content-mismatch');
   fields(save.random,['algorithm','state','draws']);need(save.random.algorithm==='mulberry32/v1','invalid-random');
   integer(save.random.state,0,0xffffffff);integer(save.random.draws,0);
   random=Random.restore({algorithm:'mulberry32/v1',state:save.random.state,draws:save.random.draws}).snapshot();
   state=save.state as unknown as CraftingSessionState;nextUid=save.nextUid;
  }
  integer(nextUid,1);record(state);record(state.account);bool(state.account.progression);
  const {account:projected,...inventory}=state;
  const trusted={craftLore:account.craftLore,features:progression.features,ledger:progression.ledger,progression:projected.progression};
  need(equal(projected,trusted),'conflicting-account-projection');
  const localScope:CharacterWorkshopScope={profile:scope.profile,accountKey:scope.accountKey,account:trusted,relics:scope.relics};
  const request={capability:'character-workshop/residence-diagnostic',state:inventory,character:scope.characterInput,nextUid};
  let token:CharacterWorkshopHandle,reply:SessionJSON=null,rebuilds:readonly CompleteBuildTransition[]|undefined;
  if(command!==undefined){
   need(previous,'missing-character-continuation');const handle=previous as CharacterWorkshopHandle,held=this.#service.read(handle);
   need(equal(inventory,held.state)&&equal(scope.characterInput,held.character)&&nextUid===held.nextUid,'stale-character-continuation');
   const method=typeof command.op==='string'&&Object.hasOwn(wrapped,command.op)?wrapped[command.op]:undefined;
   if(command.op==='character-reward-delivery'){
    fields(command,['op','grant']);integer(command.grant,1);need(scope.delivery==='prepare'&&this.#rewards,'owned-reward-delivery-required');
    const drops=this.#rewards({profile:scope.profile,accountKey:scope.accountKey,grant:command.grant}),result=this.#service.grantDeliveries(handle,localScope,drops);token=result.token;
    reply={ok:true,worldDrops:result.worldDrops,events:[{kind:'reward-delivery',count:result.worldDrops.length}]};
   }else if(command.op==='character-vocation-grant'){
    fields(command,['op','grant']);integer(command.grant,1);need(scope.delivery==='prepare'&&this.#vocation,'owned-vocation-grant-required');
    const grant=this.#vocation({profile:scope.profile,accountKey:scope.accountKey,grant:command.grant}),result=this.#service.vocation(handle,localScope,grant);
    token=result.token;localScope.account=result.account;if(result.rebuilds.length)rebuilds=result.rebuilds;
    reply={ok:true,accepted:result.accepted,changed:result.changed,needsSave:result.needsSave,events:result.events,runCounter:result.runCounter};
   }else if(command.op==='character-point-grant'){
    fields(command,['op','grant']);integer(command.grant,1);need(scope.delivery==='prepare'&&this.#points,'owned-point-grant-required');
    const grant=this.#points({profile:scope.profile,accountKey:scope.accountKey,grant:command.grant}),result=this.#service.grantPoints(handle,localScope,grant);token=result.token;
    reply={ok:true,events:[{kind:'point-grant',currency:grant.currency,before:result.before,after:result.after}]};
   }else if(command.op==='character-experience-levels'){
    fields(command,['op','grant']);integer(command.grant,1);need(scope.delivery==='prepare'&&this.#experience,'owned-experience-required');
    const plan=this.#experience({profile:scope.profile,accountKey:scope.accountKey,grant:command.grant});
    const result=this.#service.experienceLevels(handle,localScope,plan);token=result.token;rebuilds=result.rebuilds;
    reply={ok:true,events:plan.events as unknown as SessionJSON};
   }else if(command.op==='character-passive'){
    fields(command,['op','command']);
    const conditions=copySessionJSON(this.#conditions({profile:scope.profile,accountKey:scope.accountKey,command:copySessionJSON(command)}));
    const {token:next,rebuilds:path,...details}=this.#service.passive(handle,localScope,command.command,conditions);
    token=next;if(path.length)rebuilds=path;reply={ok:true,...details};
   }else if(method){
    fields(command,['op','command']);need(method!=='pickup'||scope.delivery==='prepare','durable-pickup-required');
    const conditions=copySessionJSON(this.#conditions({profile:scope.profile,accountKey:scope.accountKey,command:copySessionJSON(command)}));
    const result=this.#service[method](handle,localScope,command.command,conditions);
    need(!('worldDrops'in result)||!result.worldDrops.length||scope.delivery==='prepare','world-delivery-outbox-required');
    const {token:next,...details}=result;token=next;reply={ok:true,...details} as unknown as CharacterObjectJSON;
   }else{
    const result=this.#service.inventory(handle,localScope,command,random);reply=result.reply;token=result.token;
    if(result.random)random=result.random;if(result.account)localScope.account=result.account;
   }
   record(reply);if(reply.events!==undefined)array(reply.events,1024);
  }else token=previous?((this.#reuseAccountBuilds&&scope.retainUnchangedBuild?this.#service.retain(previous as CharacterWorkshopHandle,request,localScope):undefined)??this.#service.rebuild(previous as CharacterWorkshopHandle,request,localScope)):this.#service.admit(request,localScope);
  const held=this.#service.read(token),save={schemaVersion:1,capability:'complete-workshop/diagnostic',content:this.#content,
   state:{...held.state,account:localScope.account},random,nextUid:held.nextUid};
  this.#trace({profile:scope.profile,accountKey:scope.accountKey,stage:scope.stage,previous,continuation:token,role:scope.relics.role,reply});
  // These values are constructed from admitted JSON; the account owner performs
  // its complete reply/save admission before it promotes the continuation.
  return{reply,save:save as unknown as CharacterObjectJSON,character:held.character as unknown as SessionJSON,continuation:token,relicWrites:held.relicWrites,...(rebuilds?{rebuilds}:{})};
 }
 read(token:CharacterWorkshopHandle){return this.#service.read(token);}
 inventoryItems(token:CharacterWorkshopHandle){return this.#service.inventoryItems(token);}
 lineages(token:CharacterWorkshopHandle){return this.#service.lineages(token);}
}
