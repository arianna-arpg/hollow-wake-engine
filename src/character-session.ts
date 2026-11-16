import {copy as copyView} from './validation.js';
import {InventoryData,type InventoryDataDefinitions} from './inventory-data.js';
import {InventoryHost} from './inventory-host.js';
import {WorkshopCharacterData,type WorkshopCharacterDefinitions,type WorkshopCharacterState} from './character-context.js';
import {ProgressionCharacterData} from './character-context-progression.js';
import {changeCharacterBar} from './character-bar-commands.js';
import {changeCharacterSupport} from './character-support-commands.js';
import {changeCharacterRack} from './character-rack-commands.js';
import {changeCharacterProgression,type CharacterProgressionPorts} from './character-progression-commands.js';
import {changeCharacterPassive} from './character-passive-commands.js';
import {changeCharacterMerge} from './character-merge-commands.js';
import {characterInlays,editCharacterInventory,type CharacterInventoryEdit,type CharacterEditEvent,type CharacterContainerRules} from './character-inventory-edit.js';
import {findCarried} from './container-policy.js';
import {ItemRules} from './item-rules.js';
import {prepareExperience,type CharacterProgression} from './character-progression.js';
import {takeVocation} from './character-vocation.js';
import {Random} from './random.js';
import type {CharacterBuild,CharacterBuildService,CharacterBuildEdits,CharacterBuildInput,CharacterBuildView} from './character-builds.js';
import type {CharacterCommandDraft} from './character-command-types.js';
import {equipmentTierLevel,type EquipmentSlots} from './equipment-actions.js';
import type {ItemInstance} from './item-types.js';
import {copySessionJSON,SessionInputError,requireSession as need,sessionFields as fields,sessionArray as array,sessionRecord as record,sessionText as text,sessionInteger as integer,sessionBoolean as bool} from './session-json.js';

export interface CharacterData extends CharacterInventoryEdit {
  schemaVersion:1;capability:'character/v1';contentId:string;xp:number;sourceOrder:string[];
}
/** Host-authorized observations. Never recovered from portable character data.
 * External container bodies are copied; accepted grant investment is returned
 * in publication.projection for the host that owns those bodies. */
export interface CharacterProjection {
  features:string[];
  relics:{enabled:boolean;power:number;containers:Record<string,ItemInstance[]>};
}
export interface CharacterSessionDefinitions {
  contentId:string;workshop:InventoryDataDefinitions;equipment:EquipmentSlots;
  character:WorkshopCharacterDefinitions;builds:CharacterBuildService;
  catalogue:CharacterProgressionPorts['definitions']['catalogue'];trigger:CharacterProgressionPorts['trigger'];
  progression:CharacterProgression;maxVocations:number;
  containers?:CharacterContainerRules;
}
export type CharacterCommandKind='inventory'|'bar'|'support'|'rack'|'skill'|'passive'|'merge';
export interface CharacterCommand {kind:CharacterCommandKind;request:unknown}
export type CharacterGrant=
  |{kind:'points';currency:'passive'|'vocation';amount:number}
  |{kind:'xp';amount:number;blessing?:number;multiplier?:number}
  |{kind:'vocation';id:string}
  |{kind:'items';items:ItemInstance[]}
  |{kind:'ability';tier:number;amount:number}
  |{kind:'materials';essence:string;amount:number}
  |{kind:'vestige';id:string;amount:number}
  |{kind:'realm-points';currency:string;amount:number}
  |{kind:'projection';projection:CharacterProjection};
declare const changeBrand:unique symbol;
export interface CharacterChange {readonly [changeBrand]:true;readonly accepted:boolean;readonly changed:boolean;readonly refusal?:string}
export interface CharacterPublication {
  readonly data:CharacterData;readonly projection:CharacterProjection;readonly input:CharacterBuildInput;
  readonly build:CharacterBuildView;readonly edits:CharacterBuildEdits;readonly events:CharacterEditEvent[];
}
export interface CharacterPublisher {
  /** Called synchronously only after admission. Must complete without throwing
   * or reentering this owner. On failure the owner is quarantined, never retried. */
  publish(change:CharacterPublication):void;
}
type Entry={data:CharacterData;projection:CharacterProjection;input:CharacterBuildInput;build:CharacterBuild};
type Step={entry:Entry;edits:CharacterBuildEdits;events:CharacterEditEvent[]};
type Pending={before:Entry;after:Entry;steps:Step[]};
const copy=<T>(value:T):T=>copySessionJSON(value) as unknown as T;
class RetainedInventory extends InventoryData {override item(value:unknown){return this.retainedItem(value);}newItem(value:unknown){return super.item(value);}}
class CharacterContext extends WorkshopCharacterData {
  protected override checkGraftCarriers(state:WorkshopCharacterState):void {
    for(const id of Object.values(state.passives.grafts))if(id!==null){try{this.workshop.skills.skill(id);}catch{throw new SessionInputError('unknown-graft-carrier');}}
  }
}
function bookShape(book:unknown,data:InventoryData,retained:ReadonlySet<string>|true){
  fields(book,['known','bar']);array(book.known,8);array(book.bar,8);need(book.bar.length===8,'invalid-bar-size');
  const seen=new Set<string>();for(const row of book.known){fields(row,['gem','locked']);need(row.locked===undefined||row.locked===true,'invalid-lock');record(row.gem);
    const id=row.gem.skillId;need(typeof id==='string'&&!seen.has(id),'duplicate-learned-skill');seen.add(id);
    if(retained===true||retained.has(id))data.retainedSkillPayload(row.gem);else data.skillPayload(row.gem);
  }
  seen.clear();for(const id of book.bar)if(id!==null){text(id);need(!seen.has(id),'duplicate-bar-skill');seen.add(id);}
}

/** Single-writer, memory-only character ownership. Preparation mutates private
 * candidates. Publication is explicit, synchronous and independent of storage.
 * This class performs no work on the per-frame combat path. */
export class CharacterSession {
  readonly #d:CharacterSessionDefinitions;readonly #data:RetainedInventory;readonly #context:ProgressionCharacterData;
  readonly #inventory:InventoryHost<ItemInstance>;readonly #items:ItemRules;readonly #pending=new WeakMap<CharacterChange,Pending>();
  #current:Entry;#busy=false;#failed=false;
  constructor(definitions:CharacterSessionDefinitions,data:unknown,projection:CharacterProjection){
    text(definitions.contentId);integer(definitions.maxVocations,1,64);this.#d=definitions;
    this.#data=new RetainedInventory(definitions.workshop);
    this.#context=new ProgressionCharacterData(new CharacterContext(definitions.character,definitions.workshop),definitions.workshop.skills);
    this.#inventory=new InventoryHost(item=>definitions.workshop.crafting.items.pack.bases[item.baseId]);
    this.#items=new ItemRules(definitions.workshop.crafting.items);
    this.#current=this.#derive(data,projection);
  }
  #available(){need(!this.#busy,'reentrant-character-command');need(!this.#failed,'character-publication-failed');}
  export():CharacterData {this.#available();return copy(this.#current.data);}
  inspect():CharacterBuildView {this.#available();return this.#d.builds.read(this.#current.build);}
  stat(id:string):number {this.#available();return this.#d.builds.stat(this.#current.build,id);}
  item(uid:number){
    this.#available();integer(uid,1);const current=this.#current,{state}=current.data;
    const found=findCarried({items:state.items,equipped:state.equipped,containers:current.input.containers as Record<string,ItemInstance[]>},uid);
    const item=found?.item??state.overflow.find(row=>row.uid===uid);if(!item)return undefined;
    const rules=this.#d.workshop.crafting.rules;
    return{item:copy(item),where:found?.where??{kind:'overflow' as const},modifiers:copyView(this.#items.compile(item)),ownStats:copyView(this.#items.ownStats(item)),
      crafting:rules.craftableAffixesFor(item,current.data.craftLore).map(row=>({id:row.def.id,name:row.def.names.at(-1)??row.def.id,rank:row.rank,cost:copy(rules.ports.cost(row.rank))}))};
  }
  canSocket(skillId:string,supportId:string,rolled?:Readonly<Record<string,string>>):boolean {
    this.#available();return this.#d.builds.canSocket(this.#current.build,skillId,supportId,rolled);
  }
  /** Detached current inputs for initial live creation. Importing these inputs
   * does not import casts, clocks, resources or host permissions. */
  current():CharacterPublication {this.#available();return this.#publication({entry:this.#current,edits:{},events:[]});}
  preview(change:CharacterChange):CharacterPublication {
    this.#available();const held=this.#pending.get(change);need(held&&held.before===this.#current,'stale-character-change');
    return this.#publication({entry:held.after,edits:held.steps.at(-1)?.edits??{},events:held.steps.flatMap(step=>step.events)});
  }
  /** Detached ordered publications for a host's pre-commit capability check.
   * Checking only the final build can miss an intermediate progression step. */
  previewSteps(change:CharacterChange):CharacterPublication[] {
    this.#available();const held=this.#pending.get(change);need(held&&held.before===this.#current,'stale-character-change');
    return held.steps.map(step=>this.#publication(step));
  }
  #publication(step:Step):CharacterPublication {
    return{data:copy(step.entry.data),projection:copy(step.entry.projection),input:copy(step.entry.input),build:this.#d.builds.read(step.entry.build),edits:copy(step.edits),events:copy(step.events)};
  }
  #refuse(reason:string):CharacterChange{return Object.freeze({accepted:false,changed:false,refusal:reason}) as CharacterChange;}
  #offer(after:Entry,steps:Step[]):CharacterChange {
    const changed=JSON.stringify(after.data)!==JSON.stringify(this.#current.data)||JSON.stringify(after.projection)!==JSON.stringify(this.#current.projection);
    const token=Object.freeze({accepted:true,changed}) as CharacterChange;this.#pending.set(token,{before:this.#current,after,steps});return token;
  }
  /** Host station/hold/realm observations are a separate argument. They cannot
   * be supplied through imported data or hidden inside a player command. */
  prepare(raw:CharacterCommand,conditions:unknown={}):CharacterChange {
    this.#available();this.#busy=true;
    try{
      const command=copySessionJSON(raw);fields(command,['kind','request']);text(command.kind);
      const held=this.#current,common={builds:this.#d.builds,build:held.build,saved:held.data,inventory:this.#inventory,definitions:this.#d};
      if(command.kind==='passive'){
        const steps:Step[]=[];
        const result=changeCharacterPassive({policy:this.#d.character.passives,previous:held,
          read:entry=>({...copy(entry.data),projection:this.#d.builds.read(entry.build)}),
          rebuild:(entry,request)=>{const next=this.#derive({...entry.data,...this.#draft(request)},entry.projection,entry);steps.push({entry:next,edits:{},events:[]});return next;}
        },command.request,conditions);
        if(!result.accepted)return this.#refuse('passive-refused');
        // Keep the original effect ordering around each intermediate rebuild.
        let events:CharacterEditEvent[]=[];const ordered:Step[]=[];
        for(const event of result.events){events.push(event);if(event.kind==='recalculate'){const step=steps[event.rebuild];need(step,'missing-passive-rebuild');ordered.push({...step,events});events=[];}}
        if(events.length||!ordered.length)ordered.push({entry:result.token,edits:{},events});
        return this.#offer(result.token,ordered);
      }
      if(command.kind==='inventory'){
        const result=editCharacterInventory(this.#d.workshop,this.#d.equipment,held.data,command.request,conditions,held.projection.features,this.#d.containers);
        if(!result.accepted||!result.draft)return this.#refuse(result.refusal??'inventory-refused');
        const next=this.#derive({...held.data,...result.draft},held.projection,held);
        return this.#offer(next,[{entry:next,edits:{},events:result.events}]);
      }
      const result=command.kind==='bar'?changeCharacterBar(common,command.request):command.kind==='support'?changeCharacterSupport(common,command.request,conditions):
        command.kind==='rack'?changeCharacterRack(common,command.request,conditions):command.kind==='skill'?changeCharacterProgression({...common,trigger:this.#d.trigger},command.request,conditions):
        command.kind==='merge'?changeCharacterMerge(common,command.request,conditions):undefined;
      need(result,'unknown-character-command');
      if(('accepted'in result&&!result.accepted)||('refusal'in result&&result.refusal)||!result.changed)return this.#refuse('refusal'in result&&result.refusal?result.refusal:'character-edit-refused');
      // This bounded owner refuses a merge that needs external delivery custody.
      if('worldDrops'in result)need(!result.worldDrops.length,'merge-requires-inventory-space');
      const edits:CharacterBuildEdits={...('bar'in result?{bar:result.bar}:{}),...('grants'in result&&result.grants?{grants:result.grants}:{}),...('replaceLearned'in result&&result.replaceLearned?{replaceLearned:result.replaceLearned}:{})};
      const next=this.#derive({...held.data,...('request'in result&&result.request?this.#draft(result.request):{})},held.projection,held,edits);
      const events:CharacterEditEvent[]=result.events.flatMap(event=>event.kind==='bar-rebound'||event.kind==='learn'||event.kind==='unlearn'?[{kind:'recalculate'},event]:[event]);
      return this.#offer(next,[{entry:next,edits,events}]);
    }catch(error){if(error instanceof SessionInputError)return this.#refuse(error.message);throw error;}finally{this.#busy=false;}
  }
  #draft(value:CharacterCommandDraft):CharacterCommandDraft{return{state:value.state,character:value.character,nextUid:value.nextUid};}
  /** Trusted host API, deliberately separate from player-edit dispatch. A game
   * decides why XP/points/vocations are earned; no campaign engine is involved. */
  authorize(raw:CharacterGrant):CharacterChange {
    this.#available();this.#busy=true;
    try{
      const grant=copySessionJSON(raw);record(grant);text(grant.kind);let entry=this.#current;const steps:Step[]=[];
      if(grant.kind==='projection'){
        fields(grant,['kind','projection']);const data=copy(entry.data);record(grant.projection);record(grant.projection.relics);record(grant.projection.relics.containers);
        for(const rows of Object.values(grant.projection.relics.containers)){array(rows);for(const row of rows){record(row);integer(row.uid,1,Number.MAX_SAFE_INTEGER-1);data.nextUid=Math.max(data.nextUid,row.uid+1);}}
        entry=this.#derive(data,grant.projection as unknown as CharacterProjection,entry);steps.push({entry,edits:{},events:[{kind:'recalculate'}]});
      }else{
        let data=copy(entry.data);
        if(grant.kind==='points'){
          fields(grant,['kind','currency','amount']);integer(grant.amount,1);need(grant.currency==='passive'||grant.currency==='vocation','invalid-point-currency');
          const field=grant.currency==='passive'?'passivePoints':'vocationPoints';integer(data.character.passives[field]+grant.amount);data.character.passives[field]+=grant.amount;
        }else if(grant.kind==='items'){
          fields(grant,['kind','items']);array(grant.items,64);need(grant.items.length>0,'empty-item-grant');const board=data.state.board,firstUid=data.nextUid,received=new Set<number>();
          for(const rawItem of grant.items){const item=this.#data.newItem(rawItem);need(item.uid>=firstUid&&!received.has(item.uid),'duplicate-item-grant');received.add(item.uid);delete item.x;delete item.y;need(item.relicKey===undefined,'external-relic-authority-required');
            data.nextUid=Math.max(data.nextUid,item.uid+1);integer(data.nextUid,1);
            if(!this.#inventory.autoPlace(data.state.items,item,{w:board.w,h:board.h,...(board.rows?{open:(x:number,y:number)=>board.rows![y][x]==='#'}:{})}))data.state.overflow.push(item);
          }
         }else if(grant.kind==='vestige'){
          fields(grant,['kind','id','amount']);text(grant.id);integer(grant.amount,1);
          const result=characterInlays(this.#d.workshop).grant(data.state,grant.id,grant.amount);need(result.changed,result.changed?'':result.reason);
        }else if(grant.kind==='ability'||grant.kind==='materials'||grant.kind==='realm-points'){
          fields(grant,['kind',grant.kind==='ability'?'tier':grant.kind==='materials'?'essence':'currency','amount']);integer(grant.amount,1);
          if(grant.kind==='ability'){
            integer(grant.tier,1);const row=this.#d.workshop.skills.pack.services?.essences.find(row=>row.tier===grant.tier);need(row,'unknown-ability-tier');
            const next=(data.character.abilityEssences[row.id]??0)+grant.amount;need(Number.isFinite(next)&&next<=Number.MAX_SAFE_INTEGER,'ability-wallet-overflow');data.character.abilityEssences[row.id]=next;
          }else if(grant.kind==='materials'){
            text(grant.essence);need(this.#d.workshop.crafting.pack.essences.some(row=>row.id===grant.essence),'unknown-material');
            const next=(data.state.essences[grant.essence]??0)+grant.amount;integer(next);data.state.essences[grant.essence]=next;
          }else{
            text(grant.currency);need(this.#d.character.passives.pack.realms.some(row=>row.currency===grant.currency),'unknown-realm-currency');
            const passive=this.#d.character.passives.create(data.character.passives);need(passive.grantRealmPoints(grant.currency,grant.amount),'realm-grant-refused');
            data.character.passives.realmPoints=passive.snapshot().realmPoints;
          }
        }else if(grant.kind==='vocation'){
          fields(grant,['kind','id']);text(grant.id);need(this.#d.character.passives.pack.vocations.some(row=>row.id===grant.id),'unknown-vocation');
          const p=data.character.passives,allocated=new Set(p.allocated);
          need(takeVocation(grant.id,{vocations:p.vocations,allocated},this.#d.maxVocations),'vocation-refused');p.allocated=[...allocated];
        }else if(grant.kind==='xp'){
          fields(grant,['kind','amount','blessing','multiplier']);need(typeof grant.amount==='number'&&Number.isFinite(grant.amount)&&grant.amount>=0,'invalid-experience-award');
          for(const key of ['blessing','multiplier'])if(grant[key]!==undefined)need(typeof grant[key]==='number'&&Number.isFinite(grant[key])&&(grant[key] as number)>=0,'invalid-experience-factor');
          const rules=this.#d.progression;let plan:ReturnType<typeof prepareExperience>;
          try{plan=prepareExperience(rules,data.character.level,{xp:data.xp,xpNeeded:rules.experienceForLevel(data.character.level),passivePoints:data.character.passives.passivePoints},grant.amount,grant.blessing as number|undefined,grant.multiplier as number|undefined,32);}catch(error){throw new SessionInputError(error instanceof Error?error.message:'invalid-experience-award');}
          data.xp=plan.banked;
          for(let i=0;i<plan.levels;i++){
            data.xp-=rules.experienceForLevel(data.character.level);data.character.level++;data.character.passives.passivePoints+=rules.pack.tuning.passivePointsPerLevel;
            entry=this.#derive(data,entry.projection,entry);steps.push({entry,edits:{},events:[{kind:'recalculate'},{kind:'level-up'}]});data=copy(entry.data);
          }
        }else need(false,'unknown-character-grant');
        entry=this.#derive(data,entry.projection,entry);
        if(!steps.length)steps.push({entry,edits:{},events:grant.kind==='vocation'?[{kind:'recalculate'},{kind:'vocation-granted',id:grant.id}]:[{kind:'dirty'}]});
      }
      return this.#offer(entry,steps);
    }catch(error){if(error instanceof SessionInputError)return this.#refuse(error.message);throw error;}finally{this.#busy=false;}
  }
  /** No callback runs for an unaccepted, foreign, stale or already used change.
   * Call at the host's chosen simulation boundary; no storage acknowledgement. */
  commit(change:CharacterChange,publisher?:CharacterPublisher):void {
    this.#available();const pending=this.#pending.get(change);need(pending&&pending.before===this.#current,'stale-character-change');
    this.#pending.delete(change);this.#busy=true;
    try{if(publisher)for(const step of pending.steps)publisher.publish(this.#publication(step));this.#current=pending.after;}
    catch(error){this.#failed=true;throw error;}finally{this.#busy=false;}
  }
  #derive(raw:unknown,rawProjection:CharacterProjection,previous?:Entry,edits:CharacterBuildEdits={}):Entry {
    const data=copySessionJSON(raw);fields(data,['schemaVersion','capability','contentId','state','character','nextUid','random','xp','craftLore','sourceOrder']);
    need(data.schemaVersion===1&&data.capability==='character/v1'&&data.contentId===this.#d.contentId,'character-content-mismatch');integer(data.nextUid,1);
    if(previous)need(JSON.stringify(data.sourceOrder)===JSON.stringify(previous.data.sourceOrder),'implicit-source-order-change');
    need(typeof data.xp==='number'&&Number.isFinite(data.xp)&&data.xp>=0,'invalid-character-experience');Random.restore(data.random as never);
    const retained=previous?new Set(previous.data.state.skillBook.known.map(row=>row.gem.skillId).filter(id=>!edits.replaceLearned?.includes(id))):true;
    const validateBook=(book:unknown,validator:InventoryData)=>bookShape(book,validator,retained);
    fields(data.state,['board','items','equipped','overflow','essences','vestiges','skillBook']);need(data.state.skillBook,'skill-book-required');
    const state=this.#data.inventory(data.state,undefined,validateBook);need(state.skillBook,'skill-book-required');
    if(previous)need(JSON.stringify(state.skillBook.bar)===JSON.stringify(previous.data.state.skillBook.bar),'implicit-bar-change');
    if(edits.bar)validateBook({...state.skillBook,bar:edits.bar},this.#data);
    const character=this.#context.admit(data.character,state);need(character.passives.vocations.length<=this.#d.maxVocations,'character-vocation-limit');
    this.#d.progression.classMilestones(character.passives.classId);
    if(!previous){const ids=new Set(state.skillBook.known.map(row=>row.gem.skillId));for(const[key,id]of Object.entries(character.passives.grafts))if(id!==null&&!ids.has(id))delete character.passives.grafts[key];}
    record(data.craftLore);const families=new Set(Object.values(this.#d.workshop.crafting.items.pack.affixes).map(row=>row.family)),steps=this.#d.workshop.crafting.pack.craft.stepsPerRank;
    for(const[id,row]of Object.entries(data.craftLore)){need(families.has(id),'unknown-craft-family');fields(row,['rank','progress']);integer(row.rank,0,steps.length);integer(row.progress,0,(steps[row.rank]??1)-1);}
    const local=[...state.items,...Object.values(state.equipped),...state.overflow,...Object.values(character.containers).flat()],ids=new Set(local.map(item=>item.uid));
    for(const item of local)need(item.uid<data.nextUid,'character-uid-floor');
    for(const[slot,item]of Object.entries(state.equipped)){const def=this.#d.equipment.slot(slot),base=this.#d.workshop.crafting.items.pack.bases[item.baseId];need(def?.enabled&&def.accepts.includes(base.category),'invalid-worn-slot');
      need(character.level>=(base.category==='relic'?1:equipmentTierLevel(item.tier,this.#d.workshop.crafting.items.pack.config.tierBreaks)),'worn-item-level');}
    const projection=copy(rawProjection);fields(projection,['features','relics']);array(projection.features);projection.features.forEach(text);need(new Set(projection.features).size===projection.features.length,'duplicate-feature');
    fields(projection.relics,['enabled','power','containers']);bool(projection.relics.enabled);need(Number.isFinite(projection.relics.power)&&projection.relics.power>=0,'invalid-relic-power');record(projection.relics.containers);
    const containers={...character.containers},relicKeys=new Set<string>();
    for(const[id,rows]of Object.entries(projection.relics.containers)){
      const def=this.#d.character.containers.find(row=>row.id===id);need(def?.accountStorage,'foreign-external-container');array(rows);
      for(const value of rows){const item=this.#data.retainedItem(value);integer(item.x);integer(item.y);text(item.relicKey);need(!ids.has(item.uid)&&!relicKeys.has(item.relicKey),'relic-address-collision');ids.add(item.uid);relicKeys.add(item.relicKey);need(item.uid<data.nextUid,'relic-uid-floor');
        const base=this.#d.workshop.crafting.items.pack.bases[item.baseId];need(def.accepts.categories?.includes(base.category)||def.accepts.tags?.some(tag=>base.tags.includes(tag)),'wrong-external-container');}
      containers[id]=rows;
    }
    const p=character.passives,input:CharacterBuildInput={level:character.level,classId:p.classId,baseAttrs:character.baseAttrs,allocated:p.allocated,choices:p.choices,grafts:p.grafts,
      equipped:state.equipped,containers,features:projection.features,relicEnabled:projection.relics.enabled,relicEmpowerment:projection.relics.power,learned:state.skillBook.known};
    if(edits.grants){need(previous,'cold-grant-edit');const current=new Map(this.#d.builds.read(previous.build).grants);for(const edit of edits.grants){this.#data.grantState(edit.skillId,edit.state);const old=current.get(edit.skillId);need(old&&old.host===edit.hostUid&&old.sockets.length===edit.state.sockets.length,'foreign-grant-edit');}}
    let build=previous?this.#d.builds.rebuild(previous.build,input,edits):this.#d.builds.open(input,state.skillBook.bar);
    const view=this.#d.builds.read(build),investment=this.#d.builds.investment(build);
    if(!previous)need(view.bar.every((inst,i)=>(inst?.id??null)===state.skillBook!.bar[i]),'unresolved-character-bar');
    state.skillBook={known:investment.learned,bar:view.bar.map(inst=>inst?.id??null)};
    const bodies=new Map([...local,...Object.values(projection.relics.containers).flat()].map(item=>[item.uid,item]));
    for(const row of investment.grants){const item=bodies.get(row.uid);need(item&&item.relicKey===row.relicKey,'foreign-character-grant');for(const[id,value]of Object.entries(row.grantState))this.#data.grantState(id,value);item.grantState=row.grantState;}
    this.#data.inventory(state,undefined,validateBook);this.#context.checkInventory(character,state);
    const owned=copy({...data,state,character}) as unknown as CharacterData;
    // Normalized investment feeds live publication, never the preview graph.
    input.learned=owned.state.skillBook.known;input.equipped=owned.state.equipped;input.containers={...owned.character.containers,...projection.relics.containers};
    if(!previous&&data.sourceOrder!==undefined){
      array(data.sourceOrder);data.sourceOrder.forEach(text);
      const available=new Set(view.sources.map(([id])=>id));
      need(data.sourceOrder.length===available.size&&new Set(data.sourceOrder).size===available.size&&data.sourceOrder.every(id=>available.has(id as string)),'invalid-character-source-order');
      // Restore only ordering of admitted durable sources, never caller-supplied
      // modifiers or live effects. Cold investment repair has already run above.
      build=this.#d.builds.adopt(input,owned.state.skillBook.bar,{sourceOrder:data.sourceOrder as string[],
        grants:view.grants.map(([skillId,row])=>({skillId,hostUid:row.host,level:row.level,state:{sockets:row.sockets.map(socket=>socket?{supportId:socket.id,level:socket.level,...(socket.locked?{locked:true}:{}),...(socket.rolled?{rolled:socket.rolled}:{})}:null),...(row.tree?{treeNodes:row.tree}:{})}})),
        companions:view.companions.map(([skillId,row])=>({skillId,level:row.level}))});
    }
    owned.sourceOrder=this.#d.builds.read(build).sources.map(([id])=>id);
    return{data:owned,projection,input,build};
  }
}
