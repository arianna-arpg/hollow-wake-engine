import {changeCharacterSupport as changeGrantedSupport} from 'diagnostic/support-operation';
import {InventoryHost} from '../../dist/inventory-host.js';
// Diagnostic composition only. The account owner supplies admitted scope;
// neither a saved character nor its bar can authorize account relic access.
import {CraftingSessionData} from 'diagnostic/grant-data';
import {WorkshopCharacterData} from '../../dist/workshop-character.js';
import {WorkshopRack} from '../../dist/workshop-rack.js';
import {copySessionJSON,cloneOwnedJSON,requireSession as need,sessionFields as fields,sessionArray as array,sessionText as text,sessionInteger as integer} from '../../dist/session-json.js';

// Structural admission is private to the complete operation below. It never
// returns a partially admitted save or weakens the existing v4 skill book.
function bookShape(book,data,retained){
  fields(book,['known','bar']);array(book.known,8);array(book.bar,8);need(book.bar.length===8,'invalid-bar-size');
  need(book.known.every(row=>row!==null),'invalid-learned-book');
  WorkshopRack.prototype.validate([...book.known,...Array(8-book.known.length).fill(null)],{
    skillPayload:gem=>retained===true||retained?.has(gem?.skillId)?data.retainedSkillPayload(gem):data.skillPayload(gem)
  });
  const seen=new Set();for(const id of book.bar)if(id!==null){text(id);need(!seen.has(id),'duplicate-bar-skill');seen.add(id);}
}

export class CharacterWorkshopAdmission {
  #data;#character;#builds;#defs;#inventory;#entries=new WeakMap();
  constructor(definitions){
    this.#inventory=new InventoryHost(item=>definitions.workshop.crafting.items.pack.bases[item.baseId]);
    this.#defs=definitions;this.#data=new CraftingSessionData(definitions.workshop);
    this.#character=new WorkshopCharacterData(definitions.character,definitions.workshop);this.#builds=definitions.builds;
  }
  /** Cold admission. Scope is a trusted account-owner port, never part of the
   * save request. Running-character adoption remains a separate operation. */
  admit(request,scope){return this.#derive(undefined,request,scope);}
  /** Host-only coherent live observations, never a flag supplied by a save. */
  adopt(request,scope,observations){return this.#derive(undefined,request,scope,undefined,undefined,copySessionJSON(observations));}
  /** Trusted post-command input. This does not authorize custody, purchases or
   * point spending. Explicit grant surgery and live acknowledgement are later
   * integration steps; this path preserves existing investment during rebuilds. */
  rebuild(previous,request,scope,bar,grants){
    const held=this.#scoped(previous,scope);
    return this.#derive(held,request,scope,bar===undefined?undefined:copySessionJSON(bar),grants===undefined?undefined:copySessionJSON(grants));
  }
  #scoped(previous,scope){
    const held=this.#entries.get(previous);need(held,'foreign-character-workshop');
    need(held.accountKey===scope.accountKey&&held.profile===scope.profile,'foreign-workshop-scope');return held;
  }
  support(previous,scope,request,conditions){
    const held=this.#scoped(previous,scope);
    const result=changeGrantedSupport({builds:this.#builds,build:held.build,saved:held.saved,inventory:this.#inventory,definitions:this.#defs},request,conditions);
    const {request:next,grants,...reply}=result;
    const token=result.needsSave?this.rebuild(previous,next,scope,undefined,grants):previous;
    return {token,...reply};
  }
  #derive(previous,request,scope,bar,grants,adoption){
    const raw=copySessionJSON(request),account=copySessionJSON(scope.account);
    text(scope.accountKey);integer(scope.profile,0,0xffffffff);
    fields(raw,['capability','state','character','nextUid']);need(raw.capability==='character-workshop/diagnostic','unsupported-character-workshop');integer(raw.nextUid,1);
    fields(raw.state,['board','items','equipped','overflow','essences','vestiges','skillBook']);need(raw.state.skillBook,'skill-book-required');
    const retained=adoption?true:previous?new Set(previous.saved.state.skillBook.known.map(row=>row.gem.skillId)):undefined;
    const validateBook=(book,data)=>bookShape(book,data,retained);
    const state=this.#data.state({...raw.state,account},undefined,undefined,validateBook);
    if(previous)need(JSON.stringify(state.skillBook.bar)===JSON.stringify(previous.saved.state.skillBook.bar),'implicit-bar-change');
    if(bar!==undefined)validateBook({...state.skillBook,bar},this.#data);
    const character=this.#character.admit(raw.character,state),local=[...state.items,...Object.values(state.equipped),...state.overflow,...Object.values(character.containers).flat()];
    for(const item of local)need(item.uid<raw.nextUid,'character-uid-floor');
    for(const[slot,item]of Object.entries(state.equipped)){
      const definition=this.#defs.equipment.slot(slot),base=this.#defs.workshop.crafting.items.pack.bases[item.baseId];
      need(definition?.enabled&&definition.accepts.includes(base.category),'invalid-worn-slot');
    }
    const containers={...character.containers},canonical=new Map();let relicEnabled=false,relicEmpowerment=0;
    need(scope.relics?.role==='active'||scope.relics?.role==='inactive','missing-relic-role');
    if(scope.relics.role==='active'){
      // Complete canonical bodies/custody have already passed the account owner.
      // Check address overlap here before granting any derived ownership.
      const relics=copySessionJSON(scope.relics.state),localIds=new Set(local.map(item=>item.uid));
      for(const item of relics.items){need(!localIds.has(item.uid),'relic-address-collision');need(item.uid<raw.nextUid,'relic-uid-floor');canonical.set(item.relicKey,item);}
      const selected=new Set(relics.seated);
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
    const build=previous?this.#builds.rebuild(previous.build,input,{...(bar===undefined?{}:{bar}),...(grants===undefined?{}:{grants})}):adoption?this.#builds.adopt(input,state.skillBook.bar,adoption):this.#builds.open(input,state.skillBook.bar);
    const view=this.#builds.read(build),investment=this.#builds.investment(build);
    const originalBindings=state.skillBook.bar;
    if(!previous)need(view.bar.every((inst,index)=>(inst?.id??null)===originalBindings[index]),'unresolved-character-bar');
    state.skillBook={known:investment.learned,bar:view.bar.map(inst=>inst?.id??null)};
    const localById=new Map(local.map(item=>[item.uid,item])),relicWrites=[];
    for(const row of investment.grants){
      for(const[id,value]of Object.entries(row.grantState))this.#data.grantState(id,value);
      if(row.relicKey!==undefined){const item=canonical.get(row.relicKey);need(item&&item.uid===row.uid,'foreign-canonical-grant');relicWrites.push(row);}
      else {const item=localById.get(row.uid);need(item,'foreign-character-grant');item.grantState=row.grantState;}
    }
    // Admit normalized investment before publishing an opaque continuation.
    this.#data.state(state,undefined,undefined,validateBook);this.#character.checkInventory(character,state);
    const body={...state};delete body.account;
    const saved=copySessionJSON({state:body,character,nextUid:raw.nextUid,relicWrites});
    const token=Object.freeze({});this.#entries.set(token,{saved,build,accountKey:scope.accountKey,profile:scope.profile});return token;
  }
  read(token){const entry=this.#entries.get(token);need(entry,'foreign-character-workshop');return {...cloneOwnedJSON(entry.saved),projection:this.#builds.read(entry.build)};}
  lineages(token){const entry=this.#entries.get(token);need(entry,'foreign-character-workshop');return this.#builds.lineages(entry.build);}
}
