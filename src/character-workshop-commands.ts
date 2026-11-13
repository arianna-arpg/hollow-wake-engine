import {changeCharacterPassive} from './character-passive-commands.js';
import type {CharacterBuild,CharacterBuildService,CharacterBuildAdoption,CharacterBuildEdits} from './character-builds.js';
import type {CraftingSessionData as BaseInventoryData,CraftingSessionState} from './crafting-session-data.js';
import type {CharacterInventoryDefinitions} from './character-inventory-commands.js';
import type {WorkshopCharacterDefinitions} from './workshop-character.js';
import type {WorkshopRelicGrantWrite} from './workshop-build-preparation.js';
import type {RelicState} from './relic-custody.js';
import type {ItemInstance} from './item-types.js';
import type {RandomState} from './types.js';
import type {CharacterCommandDraft} from './character-command-types.js';
import type {CharacterProgressionPorts} from './character-progression-commands.js';
import type {CharacterGemDelivery} from './character-delivery-types.js';
import type {SessionJSON} from './session-json.js';

declare const workshopBrand:unique symbol;
export interface CharacterWorkshopHandle {readonly [workshopBrand]:true}
export interface CharacterWorkshopScope {
 accountKey:string;profile:number;account:CraftingSessionState['account'];
 relics:{role:'inactive'}|{role:'active';state:RelicState<ItemInstance>};
}
export interface CharacterWorkshopDefinitions extends CharacterInventoryDefinitions {
 character:WorkshopCharacterDefinitions;builds:CharacterBuildService;
 catalogue:CharacterProgressionPorts['definitions']['catalogue'];
 trigger:CharacterProgressionPorts['trigger'];relicPowerPerRank:number;
}
export interface CharacterWorkshopSnapshot extends CharacterCommandDraft {relicWrites:WorkshopRelicGrantWrite[]}
type Entry={saved:CharacterWorkshopSnapshot;build:CharacterBuild;accountKey:string;profile:number};
type GrantEdits=NonNullable<CharacterBuildEdits['grants']>;
type InventorySave={state:CraftingSessionState;nextUid:number;random:RandomState};
// Use only for typed, already admitted values. Raw request admission is below.
const copyTrusted=<T>(value:T):T=>copySessionJSON(value) as unknown as T;
const cloneTrusted=<T>(value:T):T=>cloneOwnedJSON(value as unknown as SessionJSON) as unknown as T;
import {createCharacterDeliveryCodec} from './character-delivery-codec.js';
import {changeCharacterPickup} from './character-pickup-commands.js';
import {CharacterInventoryCommands} from './character-inventory-commands.js';
import {changeCharacterMerge} from './character-merge-commands.js';
import {ProgressionCharacterData} from './workshop-character-progression.js';
import {changeCharacterProgression} from './character-progression-commands.js';
import {changeCharacterBar} from './character-bar-commands.js';
import {changeCharacterRack} from './character-rack-commands.js';
import {changeCharacterSupport as changeGrantedSupport} from './character-support-commands.js';
import {InventoryHost} from './inventory-host.js';
// Diagnostic composition only. The account owner supplies admitted scope;
// neither a saved character nor its bar can authorize account relic access.
import {CharacterResidenceData as CraftingSessionData} from './character-residence-data.js';
import {CompleteWorkshopCharacterData as WorkshopCharacterData} from './workshop-character-complete.js';
import {WorkshopRack} from './workshop-rack.js';
import {copySessionJSON,cloneOwnedJSON,requireSession as need,sessionFields as fields,sessionArray as array,sessionText as text,sessionInteger as integer} from './session-json.js';

// Structural admission is private to the complete operation below. It never
// returns a partially admitted save or weakens the existing v4 skill book.
function bookShape(book:unknown,data:Pick<BaseInventoryData,'skillPayload'|'retainedSkillPayload'>,retained:true|ReadonlySet<string>):void{
  fields(book,['known','bar']);array(book.known,8);array(book.bar,8);need(book.bar.length===8,'invalid-bar-size');
  need(book.known.every(row=>row!==null),'invalid-learned-book');
  WorkshopRack.prototype.validate([...book.known,...Array(8-book.known.length).fill(null)],{
    skillPayload:gem=>{const id=(gem as {skillId?:unknown}|null)?.skillId;return retained===true||typeof id==='string'&&retained.has(id)?data.retainedSkillPayload(gem):data.skillPayload(gem);}
  });
  const seen=new Set();for(const id of book.bar)if(id!==null){text(id);need(!seen.has(id),'duplicate-bar-skill');seen.add(id);}
}

export class CharacterWorkshopAdmission {
  readonly #dropCodec;readonly #cargoCommands;readonly #data;readonly #character;readonly #builds;readonly #defs;readonly #inventory;
  readonly #entries=new WeakMap<CharacterWorkshopHandle,Entry>();
  constructor(definitions:CharacterWorkshopDefinitions){
    this.#dropCodec=createCharacterDeliveryCodec(definitions.workshop);
    this.#cargoCommands=new CharacterInventoryCommands(definitions);
    this.#inventory=new InventoryHost<ItemInstance>(item=>definitions.workshop.crafting.items.pack.bases[item.baseId]);
    this.#defs=definitions;this.#data=new CraftingSessionData(definitions.workshop);
    this.#character=new ProgressionCharacterData(new WorkshopCharacterData(definitions.character,definitions.workshop),definitions.workshop.skills);this.#builds=definitions.builds;
  }
  /** New complete-format cold admission structurally admits retained cargo,
   * then restores learned investment through the original cold policy.
   * Scope is a trusted account-owner port, never part of the
   * save request. Running-character adoption remains a separate operation. */
  admit(request:unknown,scope:CharacterWorkshopScope):CharacterWorkshopHandle{return this.#derive(undefined,request,scope);}
  /** Host-only coherent live observations, never a flag supplied by a save. */
  adopt(request:unknown,scope:CharacterWorkshopScope,observations:CharacterBuildAdoption):CharacterWorkshopHandle{return this.#derive(undefined,request,scope,undefined,undefined,copyTrusted(observations));}
  /** Trusted post-command input. This does not authorize custody, purchases or
   * point spending. Explicit grant surgery and live acknowledgement are later
   * integration steps; this path preserves existing investment during rebuilds. */
  rebuild(previous:CharacterWorkshopHandle,request:unknown,scope:CharacterWorkshopScope,bar?:readonly(string|null)[],grants?:GrantEdits,replaceLearned?:readonly string[]):CharacterWorkshopHandle{
    const held=this.#scoped(previous,scope);
    return this.#derive(held,request,scope,bar===undefined?undefined:copyTrusted(bar),grants===undefined?undefined:copyTrusted(grants),undefined,replaceLearned===undefined?undefined:copyTrusted(replaceLearned));
  }
  #scoped(previous:CharacterWorkshopHandle,scope:CharacterWorkshopScope):Entry{
    const held=this.#entries.get(previous);need(held,'foreign-character-workshop');
    need(held.accountKey===scope.accountKey&&held.profile===scope.profile,'foreign-workshop-scope');return held;
  }
  support(previous:CharacterWorkshopHandle,scope:CharacterWorkshopScope,request:unknown,conditions:unknown){
    const held=this.#scoped(previous,scope);
    const result=changeGrantedSupport({builds:this.#builds,build:held.build,saved:held.saved,inventory:this.#inventory,definitions:this.#defs},request,conditions);
    const {request:next,grants,...reply}=result;
    const token=result.needsSave?this.rebuild(previous,{...next,capability:'character-workshop/residence-diagnostic'},scope,undefined,grants):previous;
    return {token,...reply};
  }
  bar(previous:CharacterWorkshopHandle,scope:CharacterWorkshopScope,request:unknown){
    const held=this.#scoped(previous,scope),result=changeCharacterBar({builds:this.#builds,build:held.build},request),{bar,...reply}=result;
    const saved=held.saved,next={capability:'character-workshop/residence-diagnostic',state:saved.state,character:saved.character,nextUid:saved.nextUid};
    const token=result.needsSave?this.rebuild(previous,next,scope,bar):previous;
    return {token,...reply};
  }
  rack(previous:CharacterWorkshopHandle,scope:CharacterWorkshopScope,request:unknown,conditions:unknown){
    const held=this.#scoped(previous,scope);
    const result=changeCharacterRack({builds:this.#builds,build:held.build,saved:held.saved,inventory:this.#inventory,definitions:this.#defs},request,conditions);
    const {request:next,bar,replaceLearned,...reply}=result;
    const token=result.needsSave?this.rebuild(previous,next,scope,bar,undefined,replaceLearned):previous;
    return {token,...reply};
  }
  progression(previous:CharacterWorkshopHandle,scope:CharacterWorkshopScope,request:unknown,conditions:unknown){
    const held=this.#scoped(previous,scope);
    const result=changeCharacterProgression({trigger:this.#defs.trigger,builds:this.#builds,build:held.build,saved:held.saved,definitions:this.#defs},request,conditions);
    const {request:next,grants,...reply}=result;
    const token=result.needsSave?this.rebuild(previous,next,scope,undefined,grants):previous;
    return {token,...reply};
  }
  merge(previous:CharacterWorkshopHandle,scope:CharacterWorkshopScope,request:unknown,conditions:unknown){
    const held=this.#scoped(previous,scope);
    const result=changeCharacterMerge({saved:held.saved,definitions:this.#defs,inventory:this.#inventory},request,conditions);
    const {request:next,...reply}=result;
    const token=result.needsSave?this.rebuild(previous,next,scope):previous;
    return {token,...reply};
  }
  pickup(previous:CharacterWorkshopHandle,scope:CharacterWorkshopScope,request:unknown,conditions:unknown){
    const held=this.#scoped(previous,scope),result=changeCharacterPickup({saved:held.saved,definitions:this.#defs,inventory:this.#inventory,admitDrop:raw=>this.#dropCodec(raw) as unknown as CharacterGemDelivery},request,conditions);
    const {request:next,...reply}=result;
    return {token:this.rebuild(previous,next,scope),...reply};
  }
  passive(previous:CharacterWorkshopHandle,scope:CharacterWorkshopScope,request:unknown,conditions:unknown){
    this.#scoped(previous,scope);
    return changeCharacterPassive({policy:this.#defs.character.passives,previous,
      read:token=>this.read(token),rebuild:(token,next)=>this.rebuild(token,next,scope)},request,conditions);
  }
  inventory(previous:CharacterWorkshopHandle,scope:CharacterWorkshopScope,request:unknown,random:RandomState){
    const held=this.#scoped(previous,scope),result=this.#cargoCommands.execute(held.saved,scope,request,random);
    if(!result.reply.ok)return{token:previous,reply:result.reply};
    // This carrier is privately constructed above; a successful save is admitted
    // by that exact kernel. The complete build below still owns final admission.
    need(result.save,'inventory-save-required');const saved=result.save as unknown as InventorySave;
    const {account,...state}=saved.state,nextScope={...scope,account};
    const next={capability:'character-workshop/residence-diagnostic',state,character:held.saved.character,nextUid:saved.nextUid};
    const stateChanged=JSON.stringify(state)!==JSON.stringify(held.saved.state)||JSON.stringify(account)!==JSON.stringify(scope.account)||saved.nextUid!==held.saved.nextUid;
    const changed=stateChanged||saved.random.state!==random.state||saved.random.draws!==random.draws;
    const token=stateChanged?this.rebuild(previous,next,nextScope):previous;
    return{token,reply:result.reply,random:saved.random,account,changed};
  }
  #derive(previous:Entry|undefined,request:unknown,scope:CharacterWorkshopScope,bar?:readonly(string|null)[],grants?:GrantEdits,adoption?:CharacterBuildAdoption,replaceLearned?:readonly string[]):CharacterWorkshopHandle{
    const raw=copySessionJSON(request),account=copyTrusted(scope.account);
    text(scope.accountKey);integer(scope.profile,0,0xffffffff);
    fields(raw,['capability','state','character','nextUid']);need(raw.capability==='character-workshop/residence-diagnostic','unsupported-character-workshop');integer(raw.nextUid,1);
    fields(raw.state,['board','items','equipped','overflow','essences','vestiges','skillBook']);need(raw.state.skillBook,'skill-book-required');
    const retained=adoption||!previous?true:new Set(previous.saved.state.skillBook.known.map(row=>row.gem.skillId).filter(id=>!replaceLearned?.includes(id)));
    const validateBook=(book:unknown,data:Pick<BaseInventoryData,'skillPayload'|'retainedSkillPayload'>)=>bookShape(book,data,retained);
    const state=this.#data.state({...raw.state,account},undefined,undefined,validateBook);need(state.skillBook,'skill-book-required');
    if(previous)need(JSON.stringify(state.skillBook.bar)===JSON.stringify(previous.saved.state.skillBook.bar),'implicit-bar-change');
    if(bar!==undefined)validateBook({...state.skillBook,bar},this.#data);
    const character=this.#character.admit(raw.character,state);
    if(!previous&&!adoption){
      const learnedIds=new Set(state.skillBook.known.map(row=>row.gem.skillId));
      for(const[key,target]of Object.entries(character.passives.grafts))if(target!==null&&!learnedIds.has(target))delete character.passives.grafts[key];
    }
    const local=[...state.items,...Object.values(state.equipped),...state.overflow,...Object.values(character.containers).flat()];
    for(const item of local)need(item.uid<raw.nextUid,'character-uid-floor');
    for(const[slot,item]of Object.entries(state.equipped)){
      const definition=this.#defs.equipment.slot(slot),base=this.#defs.workshop.crafting.items.pack.bases[item.baseId];
      need(definition?.enabled&&definition.accepts.includes(base.category),'invalid-worn-slot');
    }
    const containers={...character.containers},canonical=new Map<string|undefined,ItemInstance>();let relicEnabled=false,relicEmpowerment=0;
    need(scope.relics?.role==='active'||scope.relics?.role==='inactive','missing-relic-role');
    if(scope.relics.role==='active'){
      // Complete canonical bodies/custody have already passed the account owner.
      // Check address overlap here before granting any derived ownership.
      const relics=copyTrusted(scope.relics.state),localIds=new Set(local.map(item=>item.uid));
      for(const item of relics.items){need(!localIds.has(item.uid),'relic-address-collision');need(item.uid<raw.nextUid,'relic-uid-floor');canonical.set(item.relicKey,item);}
      const selected=new Set<string|undefined>(relics.seated);
      for(const def of this.#defs.character.containers)if(def.accountStorage)containers[def.id]=relics.items.filter(item=>selected.has(item.relicKey));
      relicEnabled=relics.enabled;relicEmpowerment=relics.rank*this.#defs.relicPowerPerRank;
    }
    const p=character.passives,input={level:character.level,classId:p.classId,baseAttrs:character.baseAttrs,allocated:p.allocated,choices:p.choices,grafts:p.grafts,
      equipped:state.equipped,containers,features:account.features,relicEnabled,relicEmpowerment,learned:state.skillBook.known};
    // A syntactically valid ID becomes a binding only after complete derivation.
    if(grants!==undefined){
      need(previous,'cold-grant-edit');array(grants,1024);
      const current=new Map(this.#builds.read(previous.build).grants);
      for(const edit of grants){
        fields(edit,['skillId','hostUid','state']);text(edit.skillId);if(edit.hostUid!==undefined)integer(edit.hostUid,1);
        this.#data.grantState(edit.skillId,edit.state);
        const held=current.get(edit.skillId);need(held&&held.host===edit.hostUid,'foreign-grant-edit');
        need(edit.state.sockets.length===held.sockets.length,'grant-socket-count');
      }
    }
    const build=previous?this.#builds.rebuild(previous.build,input,{...(bar===undefined?{}:{bar}),...(grants===undefined?{}:{grants}),...(replaceLearned===undefined?{}:{replaceLearned})}):adoption?this.#builds.adopt(input,state.skillBook.bar,adoption):this.#builds.open(input,state.skillBook.bar);
    const view=this.#builds.read(build),investment=this.#builds.investment(build);
    const originalBindings=state.skillBook.bar;
    if(!previous)need(view.bar.every((inst,index)=>(inst?.id??null)===originalBindings[index]),'unresolved-character-bar');
    state.skillBook={known:investment.learned,bar:view.bar.map(inst=>inst?.id??null)};
    const localById=new Map(local.map(item=>[item.uid,item])),relicWrites:WorkshopRelicGrantWrite[]=[];
    for(const row of investment.grants){
      for(const[id,value]of Object.entries(row.grantState))this.#data.grantState(id,value);
      if(row.relicKey!==undefined){const item=canonical.get(row.relicKey);need(item&&item.uid===row.uid,'foreign-canonical-grant');relicWrites.push(row as WorkshopRelicGrantWrite);}
      else {const item=localById.get(row.uid);need(item,'foreign-character-grant');item.grantState=row.grantState;}
    }
    // Admit normalized investment before publishing an opaque continuation.
    this.#data.state(state,undefined,undefined,validateBook);this.#character.checkInventory(character,state);
    const {account:ignoredAccount,...body}=state;void ignoredAccount;
    const saved=copySessionJSON({state:body,character,nextUid:raw.nextUid,relicWrites}) as unknown as CharacterWorkshopSnapshot;
    const token=Object.freeze({}) as CharacterWorkshopHandle;this.#entries.set(token,{saved,build,accountKey:scope.accountKey,profile:scope.profile});return token;
  }
  read(token:CharacterWorkshopHandle){const entry=this.#entries.get(token);need(entry,'foreign-character-workshop');return {...cloneTrusted(entry.saved),projection:this.#builds.read(entry.build)};}
  inventoryItems(token:CharacterWorkshopHandle){const entry=this.#entries.get(token);need(entry,'foreign-character-workshop');return cloneTrusted(entry.saved.state.items);}
  lineages(token:CharacterWorkshopHandle){const entry=this.#entries.get(token);need(entry,'foreign-character-workshop');return this.#builds.lineages(entry.build);}
}
