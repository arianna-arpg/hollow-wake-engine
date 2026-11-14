import type {CharacterDelivery} from './memory-delivery.js';
import {DurableCharacterOwner,type LocatedCharacterOptions,type LocatedCharacterGroup,type CharacterGroupStorage,type CharacterAction,type CharacterSubmission,type CharacterPublicationPreparation,type CharacterPublicationCommit} from './durable-character-located-owner.js';
import {RunCharacterSession,type RunState,type RunAction,type RunPreparedCommand} from './run-character-session.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionRecord as record,sessionInteger as integer,sessionText as text,sessionArray as array,type SessionJSON} from './session-json.js';

type JSONRecord=Record<string,SessionJSON>;
export interface RunCheckpoint {schemaVersion:1;capability:'run-character-checkpoint/diagnostic';run:RunState;group:LocatedCharacterGroup}
export interface RunCheckpointSnapshot {revision:number;body:RunCheckpoint}
export type RunBuildView=ReturnType<RunCharacterSession['build']>;
export interface RunPublication {readonly readBuild:(handle:object)=>RunBuildView;readonly current:RunState;readonly candidate:RunState;readonly journal:readonly RunPreparedCommand[]}
export type RunCheckpointAction=CharacterAction|{kind:'deliveries';characterKey:string;drops:readonly CharacterDelivery[] }|{kind:'account-counter';characterKey:string;key:string;amount:number;mode:'add'|'set'}|{kind:'vocation';characterKey:string;id:string}|{kind:'experience';characterKey:string;amount:number}|{kind:'points';characterKey:string;currency:'passive'|'vocation';amount:number}|{kind:'run-ledger';characterKey:string;key:string;amount:number};
type EarnedRunAction=Exclude<RunAction,{kind:'command'}>;
export interface DurableRunOptions<Lease extends object> extends Omit<LocatedCharacterOptions<Lease>,'createOwner'|'storage'|'live'> {
 createOwner(ports:Parameters<LocatedCharacterOptions<Lease>['createOwner']>[0]):RunCharacterSession;
 storage:{read(key:string):unknown|Promise<unknown>;commit(key:string,revision:number,body:RunCheckpoint):ReturnType<CharacterGroupStorage['commit']>};
 /** Current host selection is not inferred from transient saved handle IDs. */
 activeCharacterKey:string|null;
 initialRun?:unknown;
 live:{prepare(packet:CharacterPublicationPreparation&{run:RunPublication}):Lease&{readonly then?:never};
  publish(lease:Lease,packet:CharacterPublicationCommit&{run:RunPublication}):undefined;
  discard(lease:Lease):undefined;recoverRequired(packet:{groupKey:string;error:unknown;lease:Lease|undefined}):undefined};
}
type RunLease<L extends object>={host:L;run:RunPublication;close:()=>void};
const copy=<T>(value:T):T=>copySessionJSON(value) as T;
const obj=(value:unknown):JSONRecord=>{record(value);return value as JSONRecord;};
const ok=(value:unknown):JSONRecord=>{const r=obj(value);need(r.ok===true,typeof r.reason==='string'?r.reason:'run-owner-refused');return r;};
const sync=<T>(value:T):T=>{need(!value||typeof (value as {then?:unknown}).then!=='function','run-publication-must-be-synchronous');return value;};
const done=(value:unknown)=>{need(value===undefined,'run-publication-must-be-synchronous');};
const marker='trusted-run-experience';
function scopedBuildReader(read:((handle:object)=>RunBuildView)|undefined,journal:readonly RunPreparedCommand[]){
 let handles:WeakSet<object>|undefined=new WeakSet();
 for(const row of journal)for(const step of row.character.transitions){if(step.before)handles.add(step.before);if(step.after)handles.add(step.after);}
 return{read:(handle:object)=>{need(read&&handles,'run-build-view-expired');need(handles.has(handle),'foreign-run-build');return read(handle);},close:()=>{read=undefined;handles=undefined;}};
}

/** Optional explicit checkpoint boundary. The standalone run owner remains
 * synchronous and I/O-free. This wrapper atomically stores run + the existing
 * located group; it does not implement automatic per-frame saving or recovery
 * of a full combat actor. Its factory transfers sole access to the run owner. */
export class DurableRunOwner<L extends object> {
 #base?:DurableCharacterOwner<RunLease<L>>;#run?:RunCharacterSession;#published?:RunState;#pending=0;
 #trusted=false;#nextGrant=1;readonly #grants=new Map<number,{profile:number;action:EarnedRunAction}>();
 readonly #bindings:{key:string;handle:number}[];readonly #active:string|null;#openingRun:unknown;readonly #options:DurableRunOptions<L>;
 private constructor(options:DurableRunOptions<L>){
  for(const method of ['prepare','publish','discard','recoverRequired'] as const)need(typeof options.live?.[method]==='function','run-live-'+method+'-required');
  need(typeof options.createOwner==='function'&&typeof options.storage?.read==='function'&&typeof options.storage?.commit==='function','run-checkpoint-services-required');
  this.#bindings=copy(options.characters);this.#active=options.activeCharacterKey;
  const {live,storage}=options;
  this.#options={...options,characters:this.#bindings,createOwner:options.createOwner.bind(options),storage:{read:storage.read.bind(storage),commit:storage.commit.bind(storage)},
   live:{prepare:live.prepare.bind(live),publish:live.publish.bind(live),discard:live.discard.bind(live),recoverRequired:live.recoverRequired.bind(live)}};
  need(this.#active===null||this.#bindings.some(b=>b.key===this.#active),'foreign-run-active-character');this.#openingRun=options.initialRun===undefined?undefined:copy(options.initialRun);
 }
 static async open<L extends object>(options:DurableRunOptions<L>):Promise<DurableRunOwner<L>>{
  const host=new DurableRunOwner(options);await host.#open();return host;
 }
 get #engine(){need(this.#run,'run-recovery-required');return this.#run;}
 get #host(){need(this.#base,'run-checkpoint-not-ready');return this.#base;}
 get status(){return this.#base?.status??'opening';}
 #checkpoint(group:LocatedCharacterGroup,run:RunState):RunCheckpoint{return{schemaVersion:1,capability:'run-character-checkpoint/diagnostic',group,run:copy(run)};}
 #attach(){
  need(this.#openingRun,'run-checkpoint-missing');
  if(this.#active!==null){const selected=this.#bindings.find(b=>b.key===this.#active)!;ok(this.#engine.command({op:'activate-workshop',account:1,profile:selected.handle}));}
  this.#engine.attach(this.#openingRun,this.#bindings.map(b=>({key:b.key,profile:b.handle})));this.#published=this.#engine.read();this.#openingRun=undefined;
 }
 async #open(){
  const options=this.#options,restored=new Set<number>();
  const storage:CharacterGroupStorage={
   read:async key=>{
    const stored=await options.storage.read(key);if(!stored)return stored;
    fields(stored,['revision','body']);integer(stored.revision,1);fields(stored.body,['schemaVersion','capability','run','group']);
    need(stored.body.schemaVersion===1&&stored.body.capability==='run-character-checkpoint/diagnostic','unsupported-run-checkpoint');
    this.#openingRun=copy(stored.body.run);return{revision:stored.revision,body:stored.body.group};
   },
   commit:(key,revision,group)=>options.storage.commit(key,revision,this.#checkpoint(group,this.#pending?this.#engine.prepared(this.#pending).state:this.#engine.read()))
  };
  try{
   this.#base=await DurableCharacterOwner.open<RunLease<L>>({...options,storage,createOwner:ports=>{
    this.#run=options.createOwner(ports);
    return{command:input=>{
     const request=obj(input);let result:unknown;
     if(request.op==='prepare'){
      fields(request,['op','commands']);array(request.commands,16);
      const actions:RunAction[]=request.commands.map(c=>{
       const command=obj(c);
       if(command.op==='workshop'&&obj(command.command).op===marker){
        const inner=obj(command.command);fields(inner,['op','grant']);integer(inner.grant,1);const grant=this.#grants.get(inner.grant);
        need(this.#trusted&&grant&&grant.profile===command.profile,'unowned-checkpoint-experience');this.#grants.delete(inner.grant);
        return grant.action;
       }
       return{kind:'command',command};
      });
      result=this.#engine.prepareTrusted(actions);const reply=ok(result);integer(reply.token);this.#pending=reply.token;
     }else{
      result=this.#engine.command(request);const reply=obj(result);
      if(reply.ok===true&&(request.op==='commit-prepared'||request.op==='abort-prepared'))this.#pending=0;
      if(reply.ok===true&&(request.op==='open-workshop'||request.op==='restore-workshop')){
       integer(request.profile,0,0xffffffff);restored.add(request.profile);if(restored.size===this.#bindings.length)this.#attach();
      }
     }
     return result;
    },preparedJournal:token=>Object.freeze(this.#engine.prepared(token).journal.map(row=>row.character))};
   },live:{
    prepare:packet=>{
     need(this.#published&&this.#pending,'run-publication-not-prepared');const pending=this.#engine.prepared(this.#pending),reader=scopedBuildReader(this.#engine.build.bind(this.#engine),pending.journal);
     const run=Object.freeze({current:this.#published,candidate:pending.state,journal:pending.journal,readBuild:reader.read});
     try{const host=sync(options.live.prepare({...packet,run}));need(host&&typeof host==='object','invalid-run-publication-lease');return{host,run,close:reader.close};}
     catch(error){reader.close();throw error;}
    },
    publish:(lease,packet)=>{try{done(options.live.publish(lease.host,{...packet,run:lease.run}));this.#published=lease.run.candidate;}finally{lease.close();}},
    discard:lease=>{try{done(options.live.discard(lease.host));}finally{lease.close();}},
    recoverRequired:packet=>{packet.lease?.close();this.#run=undefined;done(options.live.recoverRequired({...packet,lease:packet.lease?.host}));}
   }});
  }catch(error){this.#run=undefined;throw error;}
 }
 read():RunCheckpointSnapshot{const current=this.#host.read();need(this.#published,'run-checkpoint-not-ready');return{revision:current.revision,body:this.#checkpoint(current.body,this.#published)};}
 async submit(actions:readonly CharacterAction[]):Promise<CharacterSubmission>{return this.#host.submit(actions);}
 async submitTrusted(actions:readonly RunCheckpointAction[]):Promise<CharacterSubmission>{
  need(this.status==='ready'&&!this.#trusted,'run-checkpoint-not-ready');const values=copy(actions);array(values,16);need(values.length>0,'invalid-command-batch');
  this.#trusted=true;
  try{
   const translated:CharacterAction[]=values.map(row=>{
    record(row);
    if(row.kind==='deliveries'){
     fields(row,['kind','characterKey','drops']);text(row.characterKey);array(row.drops,64);need(row.drops.length>0,'empty-reward-delivery');const binding=this.#bindings.find(b=>b.key===row.characterKey);need(binding,'foreign-run-character');integer(this.#nextGrant,1,Number.MAX_SAFE_INTEGER-1);
     const grant=this.#nextGrant++;this.#grants.set(grant,{profile:binding.handle,action:{kind:'deliveries',profile:binding.handle,drops:row.drops as unknown as CharacterDelivery[]}});return{kind:'character',characterKey:row.characterKey,command:{op:marker,grant}};
    }
    if(row.kind==='account-counter'||row.kind==='vocation'||row.kind==='experience'||row.kind==='points'||row.kind==='run-ledger'){
     fields(row,row.kind==='account-counter'?['kind','characterKey','key','amount','mode']:row.kind==='vocation'?['kind','characterKey','id']:row.kind==='points'?['kind','characterKey','currency','amount']:row.kind==='run-ledger'?['kind','characterKey','key','amount']:['kind','characterKey','amount']);text(row.characterKey);
     if(row.kind==='vocation')text(row.id);else if(row.kind==='experience')need(typeof row.amount==='number'&&Number.isFinite(row.amount),'invalid-experience-award');else integer(row.amount);
     const binding=this.#bindings.find(b=>b.key===row.characterKey);need(binding,'foreign-run-character');integer(this.#nextGrant,1,Number.MAX_SAFE_INTEGER-1);
     let action:EarnedRunAction;
     if(row.kind==='account-counter'){text(row.key);need(row.mode==='add'||row.mode==='set','invalid-account-counter-mode');action={kind:'account-counter',profile:binding.handle,key:row.key,amount:row.amount as number,mode:row.mode};}else if(row.kind==='vocation')action={kind:'vocation',profile:binding.handle,id:row.id as string};else if(row.kind==='experience')action={kind:'award',profile:binding.handle,amount:row.amount as number};
     else if(row.kind==='points'){need(row.currency==='passive'||row.currency==='vocation','invalid-point-currency');action={kind:'points',profile:binding.handle,currency:row.currency,amount:row.amount as number};}
     else{text(row.key);action={kind:'run-ledger',key:row.key,amount:row.amount as number};}
     const grant=this.#nextGrant++;this.#grants.set(grant,{profile:binding.handle,action});return{kind:'character',characterKey:row.characterKey,command:{op:marker,grant}};
    }
    if(row.kind==='character')need(obj(row.command).op!==marker,'unowned-checkpoint-experience');return row as unknown as CharacterAction;
   });
   return await this.#host.submit(translated);
  }finally{this.#trusted=false;this.#grants.clear();}
 }
}
