import {CraftingSessionData,type CraftingSessionDefinitions,type CraftingSessionState} from './crafting-session-data.js';
import type {PassivePolicy,PassiveBuildState} from './passive-policy.js';
import type {ItemInstance} from './item-types.js';
import {copySessionJSON,SessionInputError,requireSession as need,sessionFields as fields,
  sessionRecord as record,sessionArray as array,sessionText as text,sessionInteger as integer} from './session-json.js';

/** Durable source inputs, never cached attributes, a sheet or a live actor.
 * Learned skills remain in the inventory skill book; account relic bodies
 * remain in the account. This record does not authorize character edits. */
export interface WorkshopCharacterState {
  schemaVersion:1;
  capability:'workshop-character/v1';
  contentId:string;
  level:number;
  baseAttrs:Record<string,number>;
  passives:PassiveBuildState;
  containers:Record<string,ItemInstance[]>;
}
export interface WorkshopCharacterDefinitions {
  /** Identity of the complete source-context projection (attributes, passive
   * policy and container declarations). Change it when that content changes. */
  contentId:string;
  passives:PassivePolicy;
  attributes:readonly string[];
  containers:readonly {id:string;accountStorage?:boolean;accepts:{categories?:readonly string[];tags?:readonly string[]}}[];
}

/** Same-content strict admission. Legacy repair and account carry projection
 * are separate operations; neither silently runs during a workshop command. */
export class WorkshopCharacterData {
  readonly #data:CraftingSessionData;
  readonly #attributes:Set<string>;
  readonly #containers:Map<string,WorkshopCharacterDefinitions['containers'][number]>;
  readonly #contentId:string;
  readonly #passives:PassivePolicy;
  constructor(definitions:WorkshopCharacterDefinitions,readonly workshop:CraftingSessionDefinitions) {
    text(definitions.contentId);this.#contentId=definitions.contentId;this.#passives=definitions.passives;
    const attrs=copySessionJSON(definitions.attributes);array(attrs);attrs.forEach(text);
    this.#attributes=new Set(attrs as string[]);need(attrs.length>0&&this.#attributes.size===attrs.length,'invalid-character-attributes');
    const containers=copySessionJSON(definitions.containers);array(containers,64);
    this.#containers=new Map();
    for(const row of containers){
      fields(row,['id','accountStorage','accepts']);text(row.id);need(!this.#containers.has(row.id),'duplicate-container');
      need(row.accountStorage===undefined||typeof row.accountStorage==='boolean','invalid-container-owner');
      fields(row.accepts,['categories','tags']);
      for(const values of Object.values(row.accepts)){array(values);values.forEach(text);}
      this.#containers.set(row.id,row as unknown as WorkshopCharacterDefinitions['containers'][number]);
    }
    this.#data=new CraftingSessionData(workshop);
  }
  admit(input:unknown,inventory:CraftingSessionState):WorkshopCharacterState {
    const value=copySessionJSON(input);
    fields(value,['schemaVersion','capability','contentId','level','baseAttrs','passives','containers']);
    need(value.schemaVersion===1&&value.capability==='workshop-character/v1','unsupported-character');
    need(value.contentId===this.#contentId,'character-content-mismatch');integer(value.level,1);
    record(value.baseAttrs);need(Object.keys(value.baseAttrs).length===this.#attributes.size,'invalid-character-attributes');
    for(const [id,n]of Object.entries(value.baseAttrs))need(this.#attributes.has(id)&&typeof n==='number','invalid-character-attributes');
    const p=value.passives;
    fields(p,['classId','allocated','choices','grafts','vocations','passivePoints','vocationPoints','realmPoints']);
    text(p.classId);array(p.allocated);p.allocated.forEach(text);array(p.vocations);p.vocations.forEach(text);
    record(p.choices);for(const picks of Object.values(p.choices)){array(picks);picks.forEach(text);}
    record(p.grafts);record(p.realmPoints);integer(p.passivePoints);integer(p.vocationPoints);
    for(const n of Object.values(p.realmPoints))integer(n);
    for(const target of Object.values(p.grafts))need(target===null||typeof target==='string','unknown-graft-carrier');
    try{this.#passives.create(p as unknown as PassiveBuildState);}catch{throw new SessionInputError('invalid-character-passives');}
    record(value.containers);
    for(const[id,rows]of Object.entries(value.containers)){
      const def=this.#containers.get(id);need(def,'unknown-character-container');array(rows);
      need(!def.accountStorage||rows.length===0,'account-container-in-character');
      for(const row of rows){
        const item=this.#data.item(row);integer(item.x);integer(item.y);
        const base=this.workshop.crafting.items.pack.bases[item.baseId];
        need(def.accepts.categories?.includes(base.category)||def.accepts.tags?.some(tag=>base.tags.includes(tag)),'wrong-character-container');
      }
    }
    const state=value as unknown as WorkshopCharacterState;this.checkInventory(state,inventory);return state;
  }
  /** Recheck links to a changed inventory using an already admitted, unchanged
   * context. No graph compilation, passive traversal, item copy or repair. */
  checkInventory(state:WorkshopCharacterState,inventory:CraftingSessionState):void {
    const known=new Set((inventory.skillBook?.known.map(row=>row.gem)??inventory.rack?.flatMap(row=>row?[row.gem]:[])??[]).map(gem=>gem.skillId));
    for(const target of Object.values(state.passives.grafts))need(target===null||known.has(target),'unknown-graft-carrier');
    const seen=new Set<number>();
    const claim=(item:ItemInstance)=>{
      need(item.relicKey===undefined,'account-item-in-character');need(!seen.has(item.uid),'duplicate-character-uid');seen.add(item.uid);
    };
    for(const item of inventory.items)claim(item);
    for(const item of Object.values(inventory.equipped))claim(item);
    for(const item of inventory.overflow)claim(item);
    for(const rows of Object.values(state.containers))for(const item of rows)claim(item);
  }
  /** Include inactive/misfitting bodies: all owned items reserve an address. */
  uidFloor(state:WorkshopCharacterState):number {
    let floor=1;for(const rows of Object.values(state.containers))for(const item of rows)floor=Math.max(floor,item.uid+1);return floor;
  }
}
