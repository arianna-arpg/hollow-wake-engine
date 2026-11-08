import {ProgressionSession,type ProgressionSessionContent} from './progression-session.js';
import {CraftingSession} from './crafting-session.js';
import {CraftingSessionData,type CraftingSessionDefinitions} from './crafting-session-data.js';
import type {WorkshopRack} from './workshop-rack.js';
import type {EquipmentSlots} from './equipment-actions.js';
import {copySessionJSON,SessionInputError,requireSession as need,sessionFields as fields,
  sessionRecord as record,sessionInteger as integer,sessionText as text,sessionBoolean as bool,type SessionJSON} from './session-json.js';

type ObjectJSON=Record<string,SessionJSON>;
type Account={key:string;progression:ObjectJSON;craftLore:SessionJSON;extra:SessionJSON;version:number};
type Workshop={account:number;body:ObjectJSON;progression:boolean;version:number};
type OwnerState={accounts:Map<number,Account>;keys:Set<string>;workshops:Map<number,Workshop>};
type PreparedWrite={kind:'account'|'workshop';handle:number};
type PreparedChange={token:number;state:OwnerState;writes:PreparedWrite[]};
export interface AccountWorkshopDefinitions {
  progression:ProgressionSessionContent;
  workshop:CraftingSessionDefinitions;
  rack?:WorkshopRack;
  equipment?:EquipmentSlots;
}
export interface AccountWorkshopLimits {accounts?:number;workshops?:number}
const refuse=(reason:string)=>({ok:false as const,reason});
const object=(value:unknown):ObjectJSON=>{record(value);return value as ObjectJSON;};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const accountOps=new Set(['buy','invest','acknowledge','observe','relics','settle','catalogue']);
const lifecycleOps=new Set(['open','restore','close','save']);

/** One authority for account progression, knowledge and counters, with multiple
 * character inventories. Rule kernels see short-lived projections; workshop
 * saves contain an account key, never a competing copy of shared fields.
 * Commands are synchronous UI transactions. Persistence and authorization are
 * host-owned; no engine callbacks or I/O run between validated publications. */
export class AccountWorkshopSession {
  readonly #progression:ProgressionSession;
  readonly #crafting:CraftingSession;
  readonly #data:CraftingSessionData;
  #state:OwnerState={accounts:new Map(),keys:new Set(),workshops:new Map()};
  get #accounts(){return this.#state.accounts;}
  get #keys(){return this.#state.keys;}
  get #workshops(){return this.#state.workshops;}
  #prepared?:PreparedChange;
  #nextToken=1;
  readonly #limits:{accounts:number;workshops:number};
  #busy=false;
  constructor(definitions:AccountWorkshopDefinitions,limits:AccountWorkshopLimits={}) {
    const accounts=limits.accounts===undefined?8:limits.accounts,workshops=limits.workshops===undefined?32:limits.workshops;
    integer(accounts,1,64);integer(workshops,1,256);
    this.#limits={accounts,workshops};
    // Content is compiled once and reused. Only private temporary handle zero
    // enters each existing rule kernel; public handles belong to this owner.
    this.#progression=new ProgressionSession(definitions.progression,1);
    this.#crafting=new CraftingSession(definitions.workshop,1,definitions.rack);
    if(definitions.equipment)this.#crafting.configureEquipment(definitions.equipment);
    this.#data=new CraftingSessionData(definitions.workshop);
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
    return {schemaVersion:1,capability:'account-workshop-account/v1',key:account.key,
      progression:account.progression,craftLore:account.craftLore,extra:account.extra};
  }
  #workshopSave(workshop:Workshop,account:Account):ObjectJSON {
    return {schemaVersion:1,capability:'account-workshop-inventory/v1',accountKey:account.key,
      progression:workshop.progression,workshop:workshop.body};
  }
  #checkAccount(account:Account) {
    // Reuse the established lore/family/ledger validator. No inventory is
    // created: this empty carrier supplies its required account context.
    this.#data.state({board:{w:1,h:1},items:[],equipped:{},overflow:[],essences:{},account:this.#project(account,true)});
    copySessionJSON({op:'restore-account',account:0xffffffff,save:this.#accountSave(account)});
  }
  #checkWorkshop(workshop:Workshop,account:Account) {
    copySessionJSON({op:'restore-workshop',profile:0xffffffff,account:0xffffffff,save:this.#workshopSave(workshop,account)});
    // Reserve the largest future save reply as well as the restore request.
    // Two maximum-width version counters make that reply five bytes larger.
    copySessionJSON({ok:true,version:Number.MAX_SAFE_INTEGER,accountVersion:Number.MAX_SAFE_INTEGER,
      save:this.#workshopSave(workshop,account)});
  }
  #checkBindings(id:number,account:Account,profile?:number,replacement?:Workshop) {
    // A shared-account update must not make another character's next command
    // impossible to admit. Validate the complete legacy kernel envelope for
    // every attached inventory before publishing either owner.
    for(const [handle,workshop] of this.#workshops)if(workshop.account===id) {
      const current=handle===profile&&replacement?replacement:workshop;
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
  #withWorkshop(open:ObjectJSON,command?:ObjectJSON) {
    this.#require(this.#crafting.command({...open,profile:0}));
    try {
      const reply=command===undefined?null:this.#crafting.command({...command,profile:0});
      const save=object(this.#require(this.#crafting.command({op:'save',profile:0})).save);
      return {reply,save};
    }finally{this.#require(this.#crafting.command({op:'close',profile:0}));}
  }
  #body(save:ObjectJSON):ObjectJSON {
    const state={...object(save.state)};delete state.account;return {...save,state};
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
    const replies:ObjectJSON[]=[],writes:PreparedWrite[]=[];
    // Existing commands publish by replacing complete admitted records. A
    // shallow map fork therefore shares unchanged records and compiled rules.
    // Always restore the committed view, including validation/callback errors.
    try{
      this.#state=staged;
      for(const command of request.commands){
        record(command);need(command.op==='account'||command.op==='workshop','invalid-prepared-operation');
        replies.push(this.#require(this.#command(command)));
      }
      for(const[handle,account]of staged.accounts)if(account!==committed.accounts.get(handle))writes.push({kind:'account',handle});
      for(const[handle,workshop]of staged.workshops)if(workshop!==committed.workshops.get(handle))writes.push({kind:'workshop',handle});
      need(writes.length<=8,'prepared-record-limit');
      // Every exported candidate uses the same already admitted save envelope.
      // Saving never executes further rules or consumes either random stream.
      for(const write of writes)this.#require(this.#command(write.kind==='account'?
        {op:'account-save',account:write.handle}:{op:'workshop-save',profile:write.handle}));
      const token=writes.length?this.#nextToken:0;
      const reply=copySessionJSON({ok:true,token,writes,replies});
      if(writes.length){this.#prepared={token,state:staged,writes};this.#nextToken++;}
      return reply;
    }finally{this.#state=committed;}
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
  #command(request:unknown):unknown {
    record(request);text(request.op);
    if(['prepared-save','commit-prepared','abort-prepared'].includes(request.op))return this.#preparedCommand(request);
    // Committed saves remain readable while storage owns a pending write.
    // All other commands wait, including queries that use mutable rule kernels.
    if(this.#prepared&&request.op!=='account-save'&&request.op!=='workshop-save')return refuse('prepared-change-pending');
    if(request.op==='prepare')return this.#prepare(request);
    if(request.op==='open-account' || request.op==='restore-account') {
      const restore=request.op==='restore-account';
      fields(request,restore?['op','account','save']:['op','account','key','seed','state','craftLore','extra']);
      integer(request.account,0,0xffffffff);
      need(!this.#accounts.has(request.account),'already-open');need(this.#accounts.size<this.#limits.accounts,'account-limit');
      let key:unknown,progression:ObjectJSON,lore:unknown,extra:unknown;
      if(restore) {
        const save=request.save;fields(save,['schemaVersion','capability','key','progression','craftLore','extra']);
        need(save.schemaVersion===1 && save.capability==='account-workshop-account/v1','unsupported-save');
        key=save.key;lore=save.craftLore;extra=save.extra;
        progression=this.#withAccount({op:'restore',save:object(save.progression)}).save;
      }else {
        key=request.key;lore=request.craftLore===undefined?{}:request.craftLore;extra=request.extra===undefined?{}:request.extra;
        integer(request.seed,0,0xffffffff);
        progression=this.#withAccount({op:'open',seed:request.seed,...(request.state===undefined?{}:{account:request.state as SessionJSON})}).save;
      }
      text(key);need(!this.#keys.has(key),'duplicate-account-key');
      const account={key,progression,craftLore:lore as SessionJSON,extra:extra as SessionJSON,version:1};
      this.#checkAccount(account);
      this.#accounts.set(request.account,account);this.#keys.add(key);return {ok:true,version:1};
    }
    if(request.op==='open-workshop' || request.op==='restore-workshop') {
      const restore=request.op==='restore-workshop';
      fields(request,restore?['op','profile','account','save']:['op','profile','account','seed','state','progression','nextUid']);
      integer(request.profile,0,0xffffffff);const account=this.#account(request.account);
      need(!this.#workshops.has(request.profile),'already-open');need(this.#workshops.size<this.#limits.workshops,'workshop-limit');
      let progression:boolean,save:ObjectJSON;
      if(restore) {
        const saved=request.save;fields(saved,['schemaVersion','capability','accountKey','progression','workshop']);
        need(saved.schemaVersion===1 && saved.capability==='account-workshop-inventory/v1','unsupported-save');
        need(saved.accountKey===account.key,'account-mismatch');bool(saved.progression);progression=saved.progression;
        const body=object(saved.workshop),state=object(body.state);need(!Object.hasOwn(state,'account'),'duplicate-account-authority');
        save=this.#withWorkshop({op:'restore',save:{...body,state:{...state,account:this.#project(account,progression)}}}).save;
      }else {
        const enabled=request.progression===undefined?true:request.progression;bool(enabled);progression=enabled;integer(request.seed,0,0xffffffff);
        if(request.nextUid!==undefined)integer(request.nextUid,1);
        const state=object(request.state);need(!Object.hasOwn(state,'account'),'duplicate-account-authority');
        save=this.#withWorkshop({op:'open',seed:request.seed,state:{...state,account:this.#project(account,progression)},
          ...(request.nextUid===undefined?{}:{nextUid:request.nextUid as SessionJSON})}).save;
      }
      const workshop={account:request.account as number,body:this.#body(save),progression,version:1};
      this.#checkWorkshop(workshop,account);this.#workshops.set(request.profile,workshop);
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
      fields(request,['op','profile']);this.#workshop(request.profile);this.#workshops.delete(request.profile as number);return {ok:true};
    }
    if(request.op==='close-account') {
      fields(request,['op','account']);const account=this.#account(request.account);
      need(![...this.#workshops.values()].some(row=>row.account===request.account),'account-in-use');
      this.#accounts.delete(request.account as number);this.#keys.delete(account.key);return {ok:true};
    }
    if(request.op==='account') {
      fields(request,['op','account','command']);const account=this.#account(request.account),command=this.#commandInput(request.command,true);
      const result=this.#withAccount({op:'restore',save:account.progression},command),reply=object(result.reply);
      if(reply.ok!==true)return reply;
      const changed=!same(result.save,account.progression);
      const next={...account,progression:result.save,version:changed?this.#next(account.version):account.version};
      this.#checkAccount(next);
      if(changed)this.#checkBindings(request.account as number,next);
      const answer=copySessionJSON({ok:true,reply,changed,version:next.version});
      if(changed)this.#accounts.set(request.account as number,next);
      return answer;
    }
    if(request.op==='workshop') {
      fields(request,['op','profile','command']);const workshop=this.#workshop(request.profile),account=this.#account(workshop.account);
      const command=this.#commandInput(request.command,false);
      const result=this.#withWorkshop({op:'restore',save:this.#join(workshop,account)},command),reply=object(result.reply);
      if(reply.ok!==true)return reply;
      const shared=object(object(result.save.state).account),oldShared=this.#project(account,workshop.progression);
      need(same(shared.features,oldShared.features) && shared.progression===oldShared.progression,'account-owner-violation');
      let progression=account.progression;
      if(!same(shared.ledger,oldShared.ledger)) {
        progression=this.#withAccount({op:'restore',save:{...progression,account:{...object(progression.account),ledger:shared.ledger}}}).save;
      }
      const accountChanged=!same(progression,account.progression) || !same(shared.craftLore,account.craftLore);
      const nextAccount={...account,progression,craftLore:shared.craftLore,version:accountChanged?this.#next(account.version):account.version};
      const body=this.#body(result.save),changed=!same(body,workshop.body);
      const nextWorkshop={...workshop,body,version:changed?this.#next(workshop.version):workshop.version};
      this.#checkAccount(nextAccount);this.#checkWorkshop(nextWorkshop,nextAccount);
      if(accountChanged)this.#checkBindings(workshop.account,nextAccount,request.profile as number,nextWorkshop);
      const answer=copySessionJSON({ok:true,reply,changed,accountChanged,version:nextWorkshop.version,accountVersion:nextAccount.version});
      // All allocations, reply admission and rule callbacks finish before either
      // reference is promoted. The account and inventory become visible together.
      if(accountChanged)this.#accounts.set(workshop.account,nextAccount);
      if(changed)this.#workshops.set(request.profile as number,nextWorkshop);
      return answer;
    }
    return refuse('unknown-operation');
  }
}
