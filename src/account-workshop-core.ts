import type {CompleteCharacterContext,CompleteCharacterCodec,CompleteWorkshopKernel,WorkshopRuleScope,CompleteBuildTransition,PrivateBuildTransition,CompleteWorkshopBoundary,PreparedCharacterCommand} from './complete-character-contracts.js';
export type {CompleteCharacterContext,CompleteCharacterCodec,CompleteWorkshopKernel,WorkshopRuleScope,CompleteBuildTransition,PrivateBuildTransition,CompleteWorkshopBoundary,PreparedCharacterCommand} from './complete-character-contracts.js';
import {ProgressionSession,type ProgressionSessionContent} from './progression-session.js';
import {CraftingSession} from './crafting-session.js';
import {CraftingSessionData,type CraftingSessionDefinitions} from './crafting-session-data.js';
import type {WorkshopRack} from './workshop-rack.js';
import type {EquipmentSlots} from './equipment-actions.js';
import type {AccountRelicItems} from './account-relic-items.js';
import type {RelicState} from './relic-custody.js';
import type {ProgressionRelic} from './progression-session.js';
import type {PreparedCommand,PreparedStepInstaller} from './complete-character-contracts.js';
import type {ItemInstance} from './item-types.js';
import type {WorkshopBuildPort,WorkshopBuildInput,WorkshopRelicGrantWrite} from './workshop-build-preparation.js';
import {WorkshopCharacterData,type WorkshopCharacterDefinitions,type WorkshopCharacterState} from './workshop-character.js';
import {copySessionJSON,SessionInputError,requireSession as need,sessionFields as fields,
  sessionRecord as record,sessionInteger as integer,sessionText as text,sessionBoolean as bool,sessionArray as array,type SessionJSON} from './session-json.js';

type ObjectJSON=Record<string,SessionJSON>;
type KernelResult={reply:SessionJSON;save:ObjectJSON;continuation?:object;character?:CompleteCharacterContext;relicWrites?:readonly WorkshopRelicGrantWrite[];owner?:Account;rebuilds?:readonly CompleteBuildTransition[]};
type Account={key:string;progression:ObjectJSON;craftLore:SessionJSON;extra:SessionJSON;version:number;relicItems?:SessionJSON;
  active?:number;relicState?:RelicState<ItemInstance>};
type Workshop={account:number;body:ObjectJSON;progression:boolean;version:number;build?:object;buildAccount?:Account;character?:CompleteCharacterContext};
type OwnerState={accounts:Map<number,Account>;keys:Set<string>;workshops:Map<number,Workshop>};
type PreparedWrite={kind:'account'|'workshop';handle:number};
type PreparedChange={token:number;state:OwnerState;writes:PreparedWrite[];journal:readonly PreparedCharacterCommand[]};
export interface WorkshopRuleKernel {
  execute(open:Readonly<Record<string,SessionJSON>>,command:Readonly<Record<string,SessionJSON>>|undefined,
    scope:WorkshopRuleScope):{reply:SessionJSON;save:Record<string,SessionJSON>};
}
export interface AccountWorkshopKernelOptions {
  preparedStep?:PreparedStepInstaller;
  ruleKernel?:WorkshopRuleKernel;
  completeKernel?:CompleteWorkshopKernel;
  completeBoundary?:CompleteWorkshopBoundary;
}
export interface AccountWorkshopDefinitions {
  progression:ProgressionSessionContent;
  workshop:CraftingSessionDefinitions;
  rack?:WorkshopRack;
  equipment?:EquipmentSlots;
  /** Optional private build normalization. No live actor publication occurs. */
  preparation?:WorkshopBuildPort;
  /** Opt-in durable source context. Legacy v1 inventories keep their format. */
  character?:WorkshopCharacterDefinitions;
  /** Optional typed account bodies, sharing this owner's workshop content. */
  relicItems?:AccountRelicItems;
  /** Host-selected character authority and canonical grant writeback. Requires
   * typed relics, durable character context and private build preparation. */
  relicBuilds?:boolean;
}
export interface AccountWorkshopLimits {accounts?:number;workshops?:number}
const refuse=(reason:string)=>({ok:false as const,reason});
const object=(value:unknown):ObjectJSON=>{record(value);return value as ObjectJSON;};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const accountOps=new Set(['buy','invest','acknowledge','observe','relics','relic-items','settle','catalogue']);
const lifecycleOps=new Set(['open','restore','close','save']);

/** One authority for account progression, knowledge and counters, with multiple
 * character inventories. Rule kernels see short-lived projections; workshop
 * saves contain an account key, never a competing copy of shared fields.
 * Commands are synchronous UI transactions. Persistence and authorization are
 * host-owned; no engine callbacks or I/O run between validated publications. */
export class AccountWorkshopSessionCore {
  readonly #progression:ProgressionSession;
  readonly #crafting?:CraftingSession;
  readonly #ruleKernel?:WorkshopRuleKernel;
  readonly #completeKernel?:CompleteWorkshopKernel;
  readonly #completeBoundary?:CompleteWorkshopBoundary;
  readonly #preparedStep?:PreparedCommand;
  readonly #data:CraftingSessionData;
  readonly #preparation?:WorkshopBuildPort;
  readonly #character?:CompleteCharacterCodec;
  readonly #relicItems?:AccountRelicItems;
  readonly #relicBuilds:boolean;
  #state:OwnerState={accounts:new Map(),keys:new Set(),workshops:new Map()};
  get #accounts(){return this.#state.accounts;}
  get #keys(){return this.#state.keys;}
  get #workshops(){return this.#state.workshops;}
  #prepared?:PreparedChange;
  #nextToken=1;
  readonly #limits:{accounts:number;workshops:number};
  #busy=false;
  constructor(definitions:AccountWorkshopDefinitions,limits:AccountWorkshopLimits={},kernels:AccountWorkshopKernelOptions={}) {
    const accounts=limits.accounts===undefined?8:limits.accounts,workshops=limits.workshops===undefined?32:limits.workshops;
    integer(accounts,1,64);integer(workshops,1,256);
    this.#limits={accounts,workshops};
    need(!kernels.completeKernel||(!kernels.ruleKernel&&!definitions.preparation),'conflicting-workshop-kernels');
    need(!kernels.completeKernel||kernels.completeBoundary,'complete-boundary-required');
    this.#ruleKernel=kernels.ruleKernel;this.#completeKernel=kernels.completeKernel;this.#completeBoundary=kernels.completeBoundary;
    // Content is compiled once and reused. Only private temporary handle zero
    // enters each existing rule kernel; public handles belong to this owner.
    this.#progression=new ProgressionSession(definitions.progression,1);
    // The optional complete kernel replaces the default operation kernel.
    // Avoid allocating an unused second session for every owner.
    if(!this.#ruleKernel&&!this.#completeKernel){
      this.#crafting=new CraftingSession(definitions.workshop,1,definitions.rack);
      if(definitions.equipment)this.#crafting.configureEquipment(definitions.equipment);
    }
    this.#data=new CraftingSessionData(definitions.workshop);
    this.#preparation=definitions.preparation;
    if(this.#completeKernel)this.#character=this.#completeKernel.character;
    else if(definitions.character)this.#character=new WorkshopCharacterData(definitions.character,definitions.workshop);
    if(definitions.relicItems){
      need(definitions.relicItems.matchesDefinitions(definitions.workshop),'relic-content-mismatch');
      this.#relicItems=definitions.relicItems;
    }
    this.#relicBuilds=definitions.relicBuilds===true;
    need(!this.#relicBuilds||(this.#relicItems&&this.#character&&(this.#preparation||this.#completeKernel)),'relic-build-services-required');
    this.#preparedStep=kernels.preparedStep?.({workshop:id=>this.#workshop(id),account:id=>this.#account(id),relicBuilds:this.#relicBuilds});
  }
  #account(id:unknown):Account {
    integer(id,0,0xffffffff);const account=this.#accounts.get(id);
    need(account,'account-not-open');return account;
  }
  #workshop(id:unknown):Workshop {
    integer(id,0,0xffffffff);const workshop=this.#workshops.get(id);
    need(workshop,'workshop-not-open');return workshop;
  }
  #require(reply:unknown):ObjectJSON {
    const value=object(reply);need(value.ok===true,typeof value.reason==='string'?value.reason:'rule-refused');return value;
  }
  #project(account:Account,progression:boolean) {
    const state=object(account.progression.account);
    return {craftLore:account.craftLore,features:state.features,ledger:state.ledger,progression};
  }
  #accountSave(account:Account):ObjectJSON {
    const version=account.relicItems===undefined?1:2;
    return {schemaVersion:version,capability:'account-workshop-account/v'+version,key:account.key,
      progression:account.progression,craftLore:account.craftLore,extra:account.extra,
      ...(account.relicItems===undefined?{}:{relicItems:account.relicItems})};
  }
  #workshopSave(workshop:Workshop,account:Account):ObjectJSON {
    const version=this.#completeKernel?3:workshop.character?2:1;
    return {schemaVersion:version,capability:'account-workshop-inventory/v'+version,accountKey:account.key,
      progression:workshop.progression,workshop:workshop.body,
      ...(workshop.character?{character:workshop.character as unknown as SessionJSON}:{})};
  }
  #checkAccount(account:Account) {
    if(account.relicItems!==undefined){
      const state=this.#relicItems!.decode(this.#relicState(account));
      if(this.#relicBuilds)account.relicState=state;
    }
    // Reuse the established lore/family/ledger validator. No inventory is
    // created: this empty carrier supplies its required account context.
    this.#data.state({board:{w:1,h:1},items:[],equipped:{},overflow:[],essences:{},account:this.#project(account,true)});
    copySessionJSON({op:'restore-account',account:0xffffffff,save:this.#accountSave(account)});
  }
  #relicState(account:Account):RelicState<ProgressionRelic> {
    return object(account.progression.account).reliquary as unknown as RelicState<ProgressionRelic>;
  }
  #checkWorkshop(workshop:Workshop,account:Account) {
    if(account.relicItems!==undefined){
      const state=object(workshop.body.state);
      for(const item of [...state.items as SessionJSON[],...state.overflow as SessionJSON[],...Object.values(object(state.equipped))])
        need(object(item).relicKey===undefined,'account-item-in-character');
    }
    if(workshop.character){
      const state=object(this.#join(workshop,account).state) as unknown as WorkshopBuildInput['state'];
      this.#character!.checkInventory(workshop.character,state);
      need((workshop.body.nextUid as number)>=this.#character!.uidFloor(workshop.character),'character-uid-floor');
    }
    copySessionJSON({op:'restore-workshop',profile:0xffffffff,account:0xffffffff,save:this.#workshopSave(workshop,account)});
    // Reserve the largest future save reply as well as the restore request.
    // Two maximum-width version counters make that reply five bytes larger.
    copySessionJSON({ok:true,version:Number.MAX_SAFE_INTEGER,accountVersion:Number.MAX_SAFE_INTEGER,
      save:this.#workshopSave(workshop,account)});
  }
  #checkBindings(id:number,account:Account,replacements?:ReadonlyMap<number,Workshop>) {
    // A shared-account update must not make another character's next command
    // impossible to admit. Validate the complete legacy kernel envelope for
    // every attached inventory before publishing either owner.
    for(const [handle,workshop] of this.#workshops)if(workshop.account===id) {
      const current=replacements?.get(handle)??workshop;
      copySessionJSON({op:'restore',profile:0xffffffff,save:this.#join(current,account)});
    }
  }
  #withAccount(open:ObjectJSON,command?:ObjectJSON) {
    this.#require(this.#progression.command({...open,profile:0}));
    try {
      const reply=command===undefined?null:this.#progression.command({...command,profile:0});
      const save=object(this.#require(this.#progression.command({op:'save',profile:0})).save);
      return {reply,save};
    }finally{this.#require(this.#progression.command({op:'close',profile:0}));}
  }
  #withWorkshop(profile:number,owner:Account,characterInput:unknown,stage:WorkshopRuleScope['stage'],open:ObjectJSON,command?:ObjectJSON,previous?:object,delivery=false):KernelResult {
    if(this.#ruleKernel||this.#completeKernel){
      const scope:WorkshopRuleScope={profile,accountKey:owner.key,stage,...(delivery?{delivery:'prepare' as const}:{}),
        account:copySessionJSON(this.#accountSave(owner)) as ObjectJSON,
        ...(characterInput===undefined?{}:{characterInput:copySessionJSON(characterInput)}),
        relics:this.#relicBuilds&&owner.active===profile?
          {role:'active',state:copySessionJSON(owner.relicState) as unknown as RelicState<ItemInstance>}:{role:'inactive'}};
      if(this.#completeKernel){
        const result=this.#completeKernel.execute(previous,copySessionJSON(open) as ObjectJSON,
          command===undefined?undefined:copySessionJSON(command) as ObjectJSON,scope);
        return{...this.#completeBoundary!.admit(result,this.#character!,previous,stage==='command'&&command!==undefined,scope),owner};
      }
      const result=this.#ruleKernel!.execute(copySessionJSON(open) as ObjectJSON,
        command===undefined?undefined:copySessionJSON(command) as ObjectJSON,scope);
      fields(result,['reply','save']);record(result.save);
      return {reply:copySessionJSON(result.reply),save:copySessionJSON(result.save) as ObjectJSON};
    }
    this.#require(this.#crafting!.command({...open,profile:0}));
    try {
      const reply=command===undefined?null:this.#crafting!.command({...command,profile:0});
      const save=object(this.#require(this.#crafting!.command({op:'save',profile:0})).save);
      return {reply:copySessionJSON(reply),save};
    }finally{this.#require(this.#crafting!.command({op:'close',profile:0}));}
  }
  #body(save:ObjectJSON):ObjectJSON {
    const state={...object(save.state)};delete state.account;return {...save,state};
  }
  #prepareBuild(profile:number,save:ObjectJSON,owner:Account,phase:WorkshopBuildInput['phase'],previous?:Workshop,command?:ObjectJSON,character=previous?.character,executed?:KernelResult) {
    if(this.#completeKernel){
      // Reuse the already admitted command graph when account authority is unchanged.
      // A changed canonical account rebuilds from that command candidate, never from
      // the committed graph or a cold save.
      const result=executed?.owner===owner?executed:this.#withWorkshop(profile,owner,executed?.character??character,'normalized',
        {op:'restore',save},undefined,executed?.continuation??previous?.build);
      const rebuilds=executed?.rebuilds;
      // Canonical-account normalization follows every command rebuild; never discard the intermediate path.
      const path=rebuilds&&result!==executed?this.#completeBoundary!.extend(rebuilds,executed!.continuation!,result.continuation!):rebuilds;
      return{save:result.save,build:result.continuation,buildAccount:owner,character:result.character,relicWrites:result.relicWrites,rebuilds:path};
    }
    const preparation=this.#preparation;
    if(!preparation)return {save,build:undefined,buildAccount:undefined,character};
    if(previous&&owner===previous.buildAccount&&same(this.#body(save),previous.body))return {save,build:previous.build,buildAccount:owner,character};
    const account=JSON.stringify(object(save.state).account);
    const result=preparation.prepare(previous?.build,{profile,phase,
      state:copySessionJSON(save.state) as unknown as WorkshopBuildInput['state'],
      account:copySessionJSON(this.#accountSave(owner)) as ObjectJSON,
      command:command===undefined?undefined:copySessionJSON(command) as ObjectJSON,
      ...(this.#relicBuilds?{relics:owner.active===profile?
        {role:'active' as const,state:copySessionJSON(owner.relicState) as unknown as RelicState<ItemInstance>}:{role:'inactive' as const}}:{}),
      ...(character?{character:copySessionJSON(character) as unknown as WorkshopCharacterState}:{})});
    need(result.continuation!==null&&typeof result.continuation==='object'&&result.continuation!==previous?.build,'invalid-build-continuation');
    need(JSON.stringify(result.state.account)===account,'build-account-owner-violation');
    const relicWrites=result.relicWrites===undefined?undefined:copySessionJSON(result.relicWrites);
    if(relicWrites!==undefined){
      array(relicWrites,512);need(relicWrites.length===0||(this.#relicBuilds&&owner.active===profile),'inactive-relic-write');
    }
    // Re-admit the complete normalized state with the existing rule kernel.
    // This reads no live build and consumes neither random stream nor item IDs.
    const checked=this.#withWorkshop(profile,owner,character,'normalized',{op:'restore',save:{...save,state:result.state as unknown as SessionJSON}}).save;
    return {save:checked,build:result.continuation,buildAccount:owner,character,relicWrites:relicWrites as unknown as WorkshopRelicGrantWrite[]|undefined};
  }
  #alignRelics(save:ObjectJSON,character:CompleteCharacterContext|undefined,account:Account):ObjectJSON {
    need(character,'character-context-required');need(account.relicState,'relic-items-not-enabled');
    const state=object(save.state),used=new Set<number>();
    for(const item of [...state.items as SessionJSON[],...Object.values(object(state.equipped)),...state.overflow as SessionJSON[],
      ...Object.values(character.containers).flat()])used.add(object(item).uid as number);
    let floor=save.nextUid as number;
    for(const item of account.relicState.items){
      need(!used.has(item.uid),'relic-address-collision');floor=Math.max(floor,item.uid+1);
    }
    return floor===save.nextUid?save:{...save,nextUid:floor};
  }
  #writeRelicGrants(account:Account,base:Account,writes:readonly WorkshopRelicGrantWrite[]|undefined):Account {
    if(!writes?.length)return account;
    const state=copySessionJSON(account.relicState) as unknown as RelicState<ItemInstance>;
    const items=new Map(state.items.map(item=>[item.relicKey,item])),seen=new Set<string>();
    for(const row of writes){
      fields(row,['uid','relicKey','grantState']);text(row.relicKey);integer(row.uid,1,0xffffffff);
      need(!seen.has(row.relicKey),'duplicate-relic-grant-write');seen.add(row.relicKey);
      const item=items.get(row.relicKey);need(item&&item.uid===row.uid,'stale-relic-grant-write');
      need(row.grantState!==undefined,'missing-grant-write');
      if(row.grantState===null)delete item.grantState;
      else {record(row.grantState);item.grantState=row.grantState as unknown as NonNullable<ItemInstance['grantState']>;}
    }
    const relics=this.#relicItems!.encode(state) as unknown as SessionJSON;
    if(same(relics,this.#relicState(account)))return account;
    const progression={...account.progression,account:{...object(account.progression.account),reliquary:relics}};
    const next={...account,progression,version:account.version===base.version?this.#next(base.version):account.version};
    this.#checkAccount(next);return next;
  }
  /** Active build normalizes account bodies first; every sibling then sees that
   * final account. No candidate becomes visible until all admissions succeed. */
  #coordinateRelicBuilds(id:number,account:Account,base:Account,command:ObjectJSON,
    edited?:{profile:number;save:ObjectJSON;phase:WorkshopBuildInput['phase'];executed?:KernelResult}) {
    const replacements=new Map<number,Workshop>(),paths=new Map<number,readonly CompleteBuildTransition[]>();
    const order:number[]=[];
    if(account.active!==undefined)order.push(account.active);
    if(edited&&edited.profile!==account.active)order.push(edited.profile);
    for(const[profile,current]of this.#workshops)if(current.account===id&&profile!==account.active&&profile!==edited?.profile)order.push(profile);
    for(const profile of order){
      const current=this.#workshop(profile);need(current.account===id,'account-mismatch');
      if(profile!==edited?.profile&&current.buildAccount===account)continue;
      const active=account.active===profile;
      let save=edited?.profile===profile?{...edited.save,state:{...object(edited.save.state),account:this.#project(account,current.progression)}}:this.#join(current,account);
      if(active)save=this.#alignRelics(save,current.character,account);
      const phase=edited?.profile===profile?edited.phase:command.op==='activate-workshop'?'activation':'account';
      const prepared=this.#prepareBuild(profile,save,account,phase,current,command,edited?.profile===profile?edited.executed?.character??current.character:current.character,edited?.profile===profile?edited.executed:undefined);
      account=this.#writeRelicGrants(account,base,prepared.relicWrites);
      if(active)need(this.#alignRelics(prepared.save,current.character,account)===prepared.save,'relic-uid-floor');
      const body=this.#body(prepared.save),changed=!same(body,current.body)||!same(prepared.character,current.character);
      if(prepared.build===current.build&&!changed)continue;
      const next={...current,body,character:prepared.character,build:prepared.build,buildAccount:account,version:changed?this.#next(current.version):current.version};
      this.#checkWorkshop(next,account);replacements.set(profile,next);if(prepared.rebuilds)paths.set(profile,prepared.rebuilds);
    }
    this.#checkBindings(id,account,replacements);return {account,replacements,paths};
  }
  #refreshBuilds(id:number,account:Account,command:ObjectJSON,except?:number) {
    const replacements=new Map<number,Workshop>();
    if(this.#preparation||this.#completeKernel)for(const[profile,current]of this.#workshops)if(current.account===id&&profile!==except){
      const prepared=this.#prepareBuild(profile,this.#join(current,account),account,'account',current,command);
      const body=this.#body(prepared.save),changed=!same(body,current.body)||!same(prepared.character,current.character);
      if(prepared.build===current.build&&!changed)continue;
      const next={...current,body,character:prepared.character,build:prepared.build,buildAccount:prepared.buildAccount,
        version:changed?this.#next(current.version):current.version};
      this.#checkWorkshop(next,account);replacements.set(profile,next);
    }
    return replacements;
  }
  #join(workshop:Workshop,account:Account):ObjectJSON {
    return {...workshop.body,state:{...object(workshop.body.state),account:this.#project(account,workshop.progression)}};
  }
  #next(version:number) {integer(version,1,Number.MAX_SAFE_INTEGER-1);return version+1;}
  #commandInput(value:unknown,account:boolean):ObjectJSON {
    record(value);text(value.op);
    need(!Object.hasOwn(value,'profile') && (account?accountOps.has(value.op):!lifecycleOps.has(value.op)),'invalid-profile-command');
    return value as ObjectJSON;
  }
  #prepare(request:Record<string,unknown>) {
    fields(request,['op','commands']);
    need(Array.isArray(request.commands)&&request.commands.length>0&&request.commands.length<=16,'invalid-command-batch');
    integer(this.#nextToken,1,Number.MAX_SAFE_INTEGER);
    const committed=this.#state;
    const staged:OwnerState={accounts:new Map(committed.accounts),keys:new Set(committed.keys),workshops:new Map(committed.workshops)};
    const replies:ObjectJSON[]=[],writes:PreparedWrite[]=[],journal=this.#completeKernel?this.#completeBoundary!.journal():undefined;
    // Existing commands publish by replacing complete admitted records. A
    // shallow map fork therefore shares unchanged records and compiled rules.
    // Always restore the committed view, including validation/callback errors.
    try{
      this.#state=staged;
      for(const command of request.commands){
        record(command);
        const beforeAccounts=journal?new Map(this.#accounts):undefined;
        const transitions:PrivateBuildTransition[]|undefined=journal?[]:undefined;
        const execute=(value:ObjectJSON):ObjectJSON=>{
          need(value.op==='account'||value.op==='workshop'||value.op==='activate-workshop','invalid-prepared-operation');
          return this.#require(this.#command(value,transitions));
        };
        const reply=this.#preparedStep?this.#require(this.#preparedStep(command as ObjectJSON,execute)):execute(command as ObjectJSON);
        replies.push(reply);
        if(journal)journal.push(command as SessionJSON,reply,transitions!,beforeAccounts!,this.#accounts,account=>this.#accountSave(account as Account));
      }
      for(const[handle,account]of staged.accounts)if(account!==committed.accounts.get(handle))writes.push({kind:'account',handle});
      for(const[handle,workshop]of staged.workshops)if(workshop!==committed.workshops.get(handle))writes.push({kind:'workshop',handle});
      need(writes.length<=8,'prepared-record-limit');
      // Every exported candidate uses the same already admitted save envelope.
      // Saving never executes further rules or consumes either random stream.
      for(const write of writes)this.#require(this.#command(write.kind==='account'?
        {op:'account-save',account:write.handle}:{op:'workshop-save',profile:write.handle}));
      const effects=this.#completeKernel&&replies.some(row=>{const reply=row.reply;return reply!==null&&typeof reply==='object'&&!Array.isArray(reply)&&Array.isArray(reply.events)&&reply.events.length>0;});
      const token=writes.length||effects?this.#nextToken:0;
      const reply=copySessionJSON({ok:true,token,writes,replies});
      if(token){this.#prepared={token,state:staged,writes,journal:journal?.finish()??[]};this.#nextToken++;}
      return reply;
    }finally{this.#state=committed;}
  }
  #setWorkshop(profile:number,workshop:Workshop,transitions?:PrivateBuildTransition[],path?:readonly CompleteBuildTransition[]) {
    if(transitions)this.#completeBoundary!.append(transitions,profile,this.#account(workshop.account).key,this.#workshops.get(profile)?.build,workshop.build,path);
    this.#workshops.set(profile,workshop);
  }
  /** Trusted read-only acknowledgement plan. Opaque continuations never enter
   * JSON saves. The caller owns no mutable state through this frozen journal. */
  protected readPreparedJournal(token:number):readonly PreparedCharacterCommand[] {
    need(!this.#busy,'reentrant-command');need(this.#completeKernel,'complete-journal-unavailable');integer(token,1);
    const pending=this.#prepared;need(pending,'no-prepared-change');need(pending.token===token,'stale-prepared-change');return pending.journal;
  }
  #preparedCommand(request:Record<string,unknown>) {
    const saving=request.op==='prepared-save';
    fields(request,saving?['op','token','kind','handle']:['op','token']);integer(request.token,1);
    const pending=this.#prepared;need(pending,'no-prepared-change');need(request.token===pending.token,'stale-prepared-change');
    if(saving){
      need(request.kind==='account'||request.kind==='workshop','invalid-prepared-kind');integer(request.handle,0,0xffffffff);
      need(pending.writes.some(row=>row.kind===request.kind&&row.handle===request.handle),'record-not-prepared');
      const committed=this.#state;
      try{
        this.#state=pending.state;
        return this.#command(request.kind==='account'?{op:'account-save',account:request.handle}:{op:'workshop-save',profile:request.handle});
      }finally{this.#state=committed;}
    }
    // Admit the reply before publishing. A native failure still poisons the
    // runtime; durable callers recover from their acknowledged storage record.
    const reply=copySessionJSON({ok:true,token:pending.token});
    if(request.op==='commit-prepared')this.#state=pending.state;
    this.#prepared=undefined;return reply;
  }
  /** Plain JSON only. Invalid input refuses before publication. Complete saves
   * retain independent random streams, item IDs and opaque host account data.
   * A processed workshop no-op retains its original event/RNG semantics. */
  command(input:unknown):unknown {
    if(this.#busy)return refuse('reentrant-command');
    this.#busy=true;
    try{return this.#command(copySessionJSON(input));}
    catch(error){if(error instanceof SessionInputError)return refuse(error.message);throw error;}
    finally{this.#busy=false;}
  }
  #command(request:unknown,transitions?:PrivateBuildTransition[]):unknown {
    record(request);text(request.op);
    if(request.op==='workshop-equipment-text'||request.op==='prepared-workshop-equipment-text'){
      const prepared=request.op==='prepared-workshop-equipment-text';
      fields(request,prepared?['op','profile','token']:['op','profile']);integer(request.profile,0,0xffffffff);
      let state=this.#state;
      if(prepared){
        integer(request.token,1);const pending=this.#prepared;need(pending,'no-prepared-change');
        need(pending.token===request.token,'stale-prepared-change');state=pending.state;
      }
      const workshop=state.workshops.get(request.profile);need(workshop,'workshop-not-open');
      // Read only the owned worn map. No bag/account copy, rule execution,
      // temporary kernel or publication occurs, even for unchanged dependencies.
      return {ok:true,text:JSON.stringify(object(workshop.body.state).equipped)};
    }
    if(['prepared-save','commit-prepared','abort-prepared'].includes(request.op))return this.#preparedCommand(request);
    // Committed saves remain readable while storage owns a pending write.
    // All other commands wait, including queries that use mutable rule kernels.
    if(this.#prepared&&!['account-save','workshop-save','account-relic-items','active-workshop'].includes(request.op))return refuse('prepared-change-pending');
    if(request.op==='prepare')return this.#prepare(request);
    if(request.op==='active-workshop'){
      fields(request,['op','account']);need(this.#relicBuilds,'relic-builds-unavailable');
      const account=this.#account(request.account);return {ok:true,profile:account.active??null};
    }
    if(request.op==='activate-workshop'){
      fields(request,['op','account','profile']);need(this.#relicBuilds,'relic-builds-unavailable');
      const account=this.#account(request.account);need(account.relicItems!==undefined,'relic-items-not-enabled');
      let active:number|undefined;
      if(request.profile!==null){
        integer(request.profile,0,0xffffffff);const workshop=this.#workshop(request.profile);
        need(workshop.account===request.account,'account-mismatch');need(workshop.character,'character-context-required');active=request.profile;
      }
      if(account.active===active)return {ok:true,changed:false,profile:active??null,version:account.version};
      const result=this.#coordinateRelicBuilds(request.account as number,{...account,active},account,request as ObjectJSON);
      const reply=copySessionJSON({ok:true,changed:true,profile:active??null,version:result.account.version});
      this.#accounts.set(request.account as number,result.account);
      for(const[profile,workshop]of result.replacements)this.#setWorkshop(profile,workshop,transitions,result.paths.get(profile));
      return reply;
    }
    if(request.op==='open-account' || request.op==='restore-account') {
      const restore=request.op==='restore-account';
      fields(request,restore?['op','account','save']:['op','account','key','seed','state','craftLore','extra','relicItems']);
      integer(request.account,0,0xffffffff);
      need(!this.#accounts.has(request.account),'already-open');need(this.#accounts.size<this.#limits.accounts,'account-limit');
      let key:unknown,progression:ObjectJSON,lore:unknown,extra:unknown,relicItems:SessionJSON|undefined;
      if(restore) {
        const save=request.save;fields(save,['schemaVersion','capability','key','progression','craftLore','extra','relicItems']);
        const version=save.relicItems===undefined?1:2;
        need(save.schemaVersion===version && save.capability==='account-workshop-account/v'+version,'unsupported-save');
        if(version===2){
          need(this.#relicItems,'relic-items-unavailable');need(this.#relicItems.matchesContent(save.relicItems),'relic-content-mismatch');
          relicItems=this.#relicItems.content;
        }
        key=save.key;lore=save.craftLore;extra=save.extra;
        progression=this.#withAccount({op:'restore',save:object(save.progression)}).save;
      }else {
        if(request.relicItems!==undefined)bool(request.relicItems);
        if(request.relicItems){need(this.#relicItems,'relic-items-unavailable');relicItems=this.#relicItems.content;}
        key=request.key;lore=request.craftLore===undefined?{}:request.craftLore;extra=request.extra===undefined?{}:request.extra;
        integer(request.seed,0,0xffffffff);
        progression=this.#withAccount({op:'open',seed:request.seed,...(request.state===undefined?{}:{account:request.state as SessionJSON})}).save;
      }
      text(key);need(!this.#keys.has(key),'duplicate-account-key');
      const account={key,progression,craftLore:lore as SessionJSON,extra:extra as SessionJSON,version:1,relicItems};
      this.#checkAccount(account);
      this.#accounts.set(request.account,account);this.#keys.add(key);return {ok:true,version:1};
    }
    if(request.op==='open-workshop' || request.op==='restore-workshop') {
      const restore=request.op==='restore-workshop';
      fields(request,restore?['op','profile','account','save']:['op','profile','account','seed','state','progression','nextUid','character']);
      integer(request.profile,0,0xffffffff);const account=this.#account(request.account);
      need(!this.#workshops.has(request.profile),'already-open');need(this.#workshops.size<this.#limits.workshops,'workshop-limit');
      let progression:boolean,save:ObjectJSON,context:unknown,executed:KernelResult;
      if(restore) {
        const saved=request.save;fields(saved,['schemaVersion','capability','accountKey','progression','workshop','character']);
        const version=this.#completeKernel?3:saved.character===undefined?1:2;
        need(saved.schemaVersion===version && saved.capability==='account-workshop-inventory/v'+version,'unsupported-save');
        context=saved.character;
        need(saved.accountKey===account.key,'account-mismatch');bool(saved.progression);progression=saved.progression;
        const body=object(saved.workshop),state=object(body.state);need(!Object.hasOwn(state,'account'),'duplicate-account-authority');
        executed=this.#withWorkshop(request.profile,account,context,'restore',{op:'restore',save:{...body,state:{...state,account:this.#project(account,progression)}}});save=executed.save;
      }else {
        context=request.character;
        const enabled=request.progression===undefined?true:request.progression;bool(enabled);progression=enabled;integer(request.seed,0,0xffffffff);
        if(request.nextUid!==undefined)integer(request.nextUid,1);
        const state=object(request.state);need(!Object.hasOwn(state,'account'),'duplicate-account-authority');
        executed=this.#withWorkshop(request.profile,account,context,'open',{op:'open',seed:request.seed,state:{...state,account:this.#project(account,progression)},
          ...(request.nextUid===undefined?{}:{nextUid:request.nextUid as SessionJSON})});save=executed.save;
      }
      let character:CompleteCharacterContext|undefined;
      if(executed.character!==undefined)context=executed.character;
      if(context!==undefined){
        need(this.#character,'character-context-unavailable');
        character=this.#character.admit(context,save.state as unknown as WorkshopBuildInput['state']);
        const floor=this.#character.uidFloor(character);
        if(!restore&&request.nextUid===undefined)save={...save,nextUid:Math.max(save.nextUid as number,floor)};
        else need((save.nextUid as number)>=floor,'character-uid-floor');
      }
      const prepared=this.#prepareBuild(request.profile,save,account,restore?'restore':'open',undefined,undefined,character,executed);
      const workshop={account:request.account as number,body:this.#body(prepared.save),progression,version:1,build:prepared.build,buildAccount:prepared.buildAccount,character:prepared.character};
      this.#checkWorkshop(workshop,account);this.#setWorkshop(request.profile,workshop,transitions);
      return {ok:true,version:1,accountVersion:account.version};
    }
    if(request.op==='account-save') {
      fields(request,['op','account']);const account=this.#account(request.account);
      return copySessionJSON({ok:true,version:account.version,save:this.#accountSave(account)});
    }
    if(request.op==='workshop-save') {
      fields(request,['op','profile']);const workshop=this.#workshop(request.profile),account=this.#account(workshop.account);
      return copySessionJSON({ok:true,version:workshop.version,accountVersion:account.version,save:this.#workshopSave(workshop,account)});
    }
    if(request.op==='close-workshop') {
      fields(request,['op','profile']);const workshop=this.#workshop(request.profile);
      need(this.#account(workshop.account).active!==request.profile,'active-workshop-in-use');
      this.#workshops.delete(request.profile as number);return {ok:true};
    }
    if(request.op==='close-account') {
      fields(request,['op','account']);const account=this.#account(request.account);
      need(![...this.#workshops.values()].some(row=>row.account===request.account),'account-in-use');
      this.#accounts.delete(request.account as number);this.#keys.delete(account.key);return {ok:true};
    }
    if(request.op==='account-relic-items') {
      fields(request,['op','account']);const account=this.#account(request.account);
      need(account.relicItems!==undefined,'relic-items-not-enabled');
      return copySessionJSON({ok:true,version:account.version,state:this.#relicItems!.decode(this.#relicState(account))});
    }
    if(request.op==='account') {
      fields(request,['op','account','command']);const account=this.#account(request.account),command=this.#commandInput(request.command,true);
      let admitted=command;
      if(command.op==='relic-items'){
        fields(command,['op','state']);need(account.relicItems!==undefined,'relic-items-not-enabled');
        admitted={op:'relics',state:this.#relicItems!.encode(command.state as unknown as RelicState<ItemInstance>) as unknown as SessionJSON};
      }
      const result=this.#withAccount({op:'restore',save:account.progression},admitted),reply=object(result.reply);
      if(reply.ok!==true)return reply;
      const changed=!same(result.save,account.progression);
      const next={...account,progression:result.save,version:changed?this.#next(account.version):account.version};
      if(account.relicItems!==undefined){
        const released=new Set(this.#relicState(next).released);
        need(this.#relicState(account).released.every(key=>released.has(key)),'released-relic-forgotten');
      }
      this.#checkAccount(next);
      if(changed&&this.#relicBuilds&&account.relicItems!==undefined){
        const result=this.#coordinateRelicBuilds(request.account as number,next,account,command);
        const answer=copySessionJSON({ok:true,reply,changed:!same(result.account.progression,account.progression),version:result.account.version});
        this.#accounts.set(request.account as number,result.account);
        for(const[profile,workshop]of result.replacements)this.#setWorkshop(profile,workshop,transitions,result.paths.get(profile));
        return answer;
      }
      const replacements=changed?this.#refreshBuilds(request.account as number,next,command):new Map<number,Workshop>();
      if(changed)this.#checkBindings(request.account as number,next,replacements);
      const answer=copySessionJSON({ok:true,reply,changed,version:next.version});
      if(changed)this.#accounts.set(request.account as number,next);
      for(const[profile,replacement]of replacements)this.#setWorkshop(profile,replacement,transitions);
      return answer;
    }
    if(request.op==='workshop') {
      fields(request,['op','profile','command']);const workshop=this.#workshop(request.profile),account=this.#account(workshop.account);
      const command=this.#commandInput(request.command,false);
      const result=this.#withWorkshop(request.profile as number,account,workshop.character,'command',{op:'restore',save:this.#join(workshop,account)},command,workshop.build,transitions!==undefined),reply=object(result.reply);
      if(reply.ok!==true)return reply;
      const shared=object(object(result.save.state).account),oldShared=this.#project(account,workshop.progression);
      need(same(shared.features,oldShared.features) && shared.progression===oldShared.progression,'account-owner-violation');
      let progression=account.progression;
      if(!same(shared.ledger,oldShared.ledger)) {
        progression=this.#withAccount({op:'restore',save:{...progression,account:{...object(progression.account),ledger:shared.ledger}}}).save;
      }
      const accountChanged=!same(progression,account.progression) || !same(shared.craftLore,account.craftLore);
      const nextAccount=accountChanged?{...account,progression,craftLore:shared.craftLore,version:this.#next(account.version)}:account;
      if(this.#relicBuilds&&account.relicItems!==undefined){
        if(accountChanged)this.#checkAccount(nextAccount);
        const coordinated=this.#coordinateRelicBuilds(workshop.account,nextAccount,account,command,
          {profile:request.profile as number,save:result.save,phase:'command',executed:result});
        const next=coordinated.replacements.get(request.profile as number)??workshop;
        const changed=!same(next.body,workshop.body)||!same(next.character,workshop.character),sharedChanged=coordinated.account!==account;
        const answer=copySessionJSON({ok:true,reply,changed,accountChanged:sharedChanged,version:next.version,accountVersion:coordinated.account.version});
        if(sharedChanged)this.#accounts.set(workshop.account,coordinated.account);
        for(const[profile,replacement]of coordinated.replacements)this.#setWorkshop(profile,replacement,transitions,coordinated.paths.get(profile));
        return answer;
      }
      const prepared=this.#prepareBuild(request.profile as number,result.save,nextAccount,'command',workshop,command,result.character??workshop.character,result);
      result.save=prepared.save;
      const body=this.#body(result.save),changed=!same(body,workshop.body)||!same(prepared.character,workshop.character);
      const nextWorkshop={...workshop,body,character:prepared.character,build:prepared.build,buildAccount:prepared.buildAccount,version:changed?this.#next(workshop.version):workshop.version};
      if(accountChanged)this.#checkAccount(nextAccount);this.#checkWorkshop(nextWorkshop,nextAccount);
      const replacements=accountChanged?this.#refreshBuilds(workshop.account,nextAccount,command,request.profile as number):new Map<number,Workshop>();
      if(changed||prepared.build!==workshop.build)replacements.set(request.profile as number,nextWorkshop);
      if(accountChanged)this.#checkBindings(workshop.account,nextAccount,replacements);
      const answer=copySessionJSON({ok:true,reply,changed,accountChanged,version:nextWorkshop.version,accountVersion:nextAccount.version});
      // All allocations, reply admission and rule callbacks finish before either
      // reference is promoted. The account and inventory become visible together.
      if(accountChanged)this.#accounts.set(workshop.account,nextAccount);
      for(const[profile,replacement]of replacements)this.#setWorkshop(profile,replacement,transitions,profile===request.profile?prepared.rebuilds:undefined);
      return answer;
    }
    return refuse('unknown-operation');
  }
}
