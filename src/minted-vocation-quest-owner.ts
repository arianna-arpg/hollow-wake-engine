import {DurableRunOwner,type DurableRunOptions,type RunCheckpoint,type RunCheckpointSnapshot,type RunCheckpointAction} from './durable-run-owner.js';
import type {CharacterAction,CharacterStorageResult} from './durable-character-located-owner.js';
import {planVocationQuestProgression} from './vocation-quest-plan.js';
import type {QuestRewardDefinition} from './quest-rewards.js';
import {prepareQuestMemories,type QuestMemoryFactory,type PreparedQuestMemories} from './quest-memory-mint.js';
import {Random} from './random.js';import type {RandomState} from './types.js';import type {SessionJSON} from './session-json.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionText as text,sessionInteger as integer,sessionArray as array} from './session-json.js';
export interface VocationQuestEntry {questId:string;zoneId:string;fieldDone:boolean;directionsKnown?:boolean}
export interface VocationQuestBook {active:VocationQuestEntry[];completed:string[]}
export interface MintedVocationQuestCheckpoint {schemaVersion:2;capability:'minted-vocation-quest-checkpoint/diagnostic';contentId:string;run:RunCheckpoint;quests:VocationQuestBook;mint:RandomState}
export interface VocationQuestPublication {questId:string|null;current:VocationQuestBook;candidate:VocationQuestBook;presentations:SessionJSON[]}
type RunLive<L extends object>=DurableRunOptions<L>['live'];
export interface MintedVocationQuestOptions<L extends object> {
 run:Omit<DurableRunOptions<L>,'storage'|'live'|'initial'|'initialRun'>;
 contentId:string;characterKey:string;quests:readonly QuestRewardDefinition[];questKey(id:string):string;
 accountWrites():boolean;authorize(entry:Readonly<VocationQuestEntry>):boolean;mint:QuestMemoryFactory;
 storage:{read(key:string):unknown|Promise<unknown>;commit(key:string,revision:number,body:MintedVocationQuestCheckpoint):CharacterStorageResult|Promise<CharacterStorageResult>};
 live:{prepare(packet:Parameters<RunLive<L>['prepare']>[0]&{quests:VocationQuestPublication}):ReturnType<RunLive<L>['prepare']>;
  publish(lease:L,packet:Parameters<RunLive<L>['publish']>[1]&{quests:VocationQuestPublication}):undefined;
  discard:RunLive<L>['discard'];recoverRequired:RunLive<L>['recoverRequired']};
}
const copy=<T>(value:T):T=>copySessionJSON(value) as T;
/** Nonrepeatable, authored vocation quests only. Completion stamps, progression,
 * Memory obligations, and the mint stream use one compare-and-swap. Roll policy
 * and world eligibility are synchronous host services. This does not own general
 * quest choices, generated postings, the combat RNG, or a full world save. */
export class DurableMintedVocationQuestOwner<L extends object> {
 readonly #options:MintedVocationQuestOptions<L>;readonly #catalog=new Map<string,QuestRewardDefinition>();
 #base?:DurableRunOwner<L>;#book?:VocationQuestBook;#mint?:RandomState;#pending?:{questId:string;book:VocationQuestBook;mint:PreparedQuestMemories};#busy=false;
 private constructor(options:MintedVocationQuestOptions<L>){
  text(options.contentId);text(options.characterKey);array(options.quests,4096);need(options.quests.length>0,'empty-vocation-quest-content');
  need(options.run.characters.some(row=>row.key===options.characterKey),'foreign-quest-character');
  need(typeof options.mint==='function','quest-mint-required');
  this.#options={...options,mint:options.mint.bind(options),questKey:options.questKey.bind(options),accountWrites:options.accountWrites.bind(options),authorize:options.authorize.bind(options),
   storage:{read:options.storage.read.bind(options.storage),commit:options.storage.commit.bind(options.storage)},live:{prepare:options.live.prepare.bind(options.live),publish:options.live.publish.bind(options.live),discard:options.live.discard.bind(options.live),recoverRequired:options.live.recoverRequired.bind(options.live)}};
  for(const quest of copy(options.quests)){text(quest.id);need(!this.#catalog.has(quest.id),'duplicate-vocation-quest');planVocationQuestProgression(quest,options.characterKey,false,this.#options.questKey);this.#catalog.set(quest.id,quest);}
 }
 #admitBook(raw:unknown):VocationQuestBook{
  const value=copy(raw);fields(value,['active','completed']);array(value.active,this.#catalog.size);array(value.completed,this.#catalog.size);const seen=new Set<string>();
  const admitId=(id:unknown)=>{text(id);need(this.#catalog.has(id)&&!seen.has(id),'invalid-quest-book-id');seen.add(id);};
  for(const row of value.active){fields(row,['questId','zoneId','fieldDone','directionsKnown']);admitId(row.questId);text(row.zoneId);need(typeof row.fieldDone==='boolean','invalid-quest-readiness');need(row.directionsKnown===undefined||typeof row.directionsKnown==='boolean','invalid-quest-directions');}
  for(const id of value.completed)admitId(id);return value as unknown as VocationQuestBook;
 }
 #transition():VocationQuestPublication{need(this.#book,'quest-owner-not-ready');return{questId:this.#pending?.questId??null,current:copy(this.#book),candidate:copy(this.#pending?.book??this.#book),presentations:copy(this.#pending?.mint.presentations??[])};}
 #checkpoint(run:RunCheckpoint,quests:VocationQuestBook,mint:RandomState):MintedVocationQuestCheckpoint{return{schemaVersion:2,capability:'minted-vocation-quest-checkpoint/diagnostic',contentId:this.#options.contentId,run,quests:copy(quests),mint:copy(mint)};}
 static async open<L extends object>(options:MintedVocationQuestOptions<L>):Promise<DurableMintedVocationQuestOwner<L>>{
  const owner=new DurableMintedVocationQuestOwner(options),p=owner.#options;
  const delivery=p.run.delivery,prepareDelivery=delivery.prepare.bind(delivery);
  owner.#base=await DurableRunOwner.open({...p.run,delivery:{admitState:delivery.admitState.bind(delivery),admitPlacement:delivery.admitPlacement.bind(delivery),authorizePickup:delivery.authorizePickup.bind(delivery),prepare:packet=>{
   const mint=owner.#pending?.mint;if(!mint)return prepareDelivery(packet);
   need(packet.rows.length===mint.drops.length,'quest-mint-delivery-count');
   return{state:packet.state,placements:packet.rows.map((row,index)=>{need(JSON.stringify(row.drop)===JSON.stringify(mint.drops[index]),'quest-mint-delivery-order');return{id:row.id,placement:copy(mint.placements[index]) as unknown as SessionJSON};})};
  }},storage:{
   read:async key=>{const stored=await p.storage.read(key);fields(stored,['revision','body']);integer(stored.revision,1);fields(stored.body,['schemaVersion','capability','contentId','run','quests','mint']);need(stored.body.schemaVersion===2&&stored.body.capability==='minted-vocation-quest-checkpoint/diagnostic'&&stored.body.contentId===p.contentId,'unsupported-vocation-quest-checkpoint');owner.#book=owner.#admitBook(stored.body.quests);fields(stored.body.mint,['algorithm','state','draws']);owner.#mint=Random.restore(stored.body.mint as unknown as RandomState).snapshot();return{revision:stored.revision,body:stored.body.run};},
   commit:(key,revision,run)=>{need(owner.#book&&owner.#mint,'quest-owner-not-ready');return p.storage.commit(key,revision,owner.#checkpoint(run,owner.#pending?.book??owner.#book,owner.#pending?.mint.random??owner.#mint));}
  },live:{prepare:packet=>p.live.prepare({...packet,quests:owner.#transition()}),publish:(lease,packet)=>{
   const result=p.live.publish(lease,{...packet,quests:owner.#transition()});need(result===undefined,'quest-publication-must-be-synchronous');
   // Publish in the same synchronous boundary as the enclosing run and group.
   // Waiting for submit's promise would let queued UI observers see a split view.
   if(owner.#pending){owner.#book=owner.#pending.book;owner.#mint=owner.#pending.mint.random;}
   return undefined;
  },discard:lease=>p.live.discard(lease),recoverRequired:packet=>p.live.recoverRequired(packet)}});
  owner.#checkBook();return owner;
 }
 #checkBook(){
  need(this.#book,'quest-owner-not-ready');const ledger=this.#host.read().body.run.ledger;
  for(const id of this.#book.completed){const key=this.#options.questKey(id);text(key);need(Number.isSafeInteger(ledger[key])&&ledger[key]>=1,'quest-book-run-mismatch');}
  for(const entry of this.#book.active){const key=this.#options.questKey(entry.questId);text(key);need(!Object.hasOwn(ledger,key)||ledger[key]===0,'quest-book-run-mismatch');}
 }
 get #host(){need(this.#base,'quest-owner-not-ready');return this.#base;}
 get status(){return this.#busy&&this.#host.status==='ready'?'pending':this.#host.status;}
 read():{revision:number;body:MintedVocationQuestCheckpoint}{const saved:RunCheckpointSnapshot=this.#host.read();need(this.#book&&this.#mint,'quest-owner-not-ready');return{revision:saved.revision,body:this.#checkpoint(saved.body,this.#book,this.#mint)};}
 async submit(actions:readonly CharacterAction[]){need(!this.#busy&&this.status==='ready','quest-owner-not-ready');this.#busy=true;try{return await this.#host.submit(actions);}finally{this.#busy=false;}}
 async settleTrusted(questId:string){
  need(!this.#busy&&this.status==='ready'&&this.#book&&this.#mint,'quest-owner-not-ready');text(questId);
  const quest=this.#catalog.get(questId);need(quest,'unknown-vocation-quest');
  if(this.#book.completed.includes(questId))return{status:'already-completed' as const,revision:this.#host.read().revision};
  const entry=this.#book.active.find(row=>row.questId===questId);need(entry?.fieldDone,'quest-not-ready');
  this.#busy=true;
  try{
   need(this.#options.authorize(copy(entry))===true,'quest-not-authorized');const accountWrites=this.#options.accountWrites();need(typeof accountWrites==='boolean','invalid-quest-account-policy');
   const plan=planVocationQuestProgression(quest,this.#options.characterKey,accountWrites,this.#options.questKey),mint=prepareQuestMemories(this.#mint,plan.owedGems,this.#options.mint),drops=mint.drops;
   const book=copy(this.#book);book.completed.push(questId);book.active.splice(book.active.findIndex(row=>row.questId===questId),1);this.#pending={questId,book,mint};
   const actions:RunCheckpointAction[]=[...plan.actions];if(drops.length){const at=actions[0]?.kind==='experience'?1:0;actions.splice(at,0,{kind:'deliveries',characterKey:this.#options.characterKey,drops});}
   return await this.#host.submitTrusted(actions);
  }finally{this.#pending=undefined;this.#busy=false;}
 }
}
