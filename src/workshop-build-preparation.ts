import type {CraftingSessionState} from './crafting-session-data.js';
import type {ItemInstance} from './item-types.js';
import type {WorkshopCharacterState} from './workshop-character.js';
import {copySessionJSON,requireSession as need,sessionArray as array,sessionFields as fields,sessionRecord as record,
  sessionInteger as integer,type SessionJSON} from './session-json.js';

export interface WorkshopBuildInput {
  profile:number;
  phase:'open'|'restore'|'command'|'account';
  /** Detached post-command state. Edits to this input are never published. */
  state:CraftingSessionState;
  /** Complete authoritative account save, including progression/reliquary and
   * opaque host context. This detached read is not a second account authority. */
  account:Readonly<Record<string,SessionJSON>>;
  /** Admitted durable source context when the owner uses inventory v2.
   * Read-only authority: returned grant writes still address inventory only. */
  character?:WorkshopCharacterState;
  command?:Readonly<Record<string,SessionJSON>>;
}
export interface WorkshopGrantWrite {
  uid:number;
  /** Null removes the item-resident investment field. */
  grantState:NonNullable<ItemInstance['grantState']>|null;
}
export interface WorkshopBuildServices<B extends object> {
  /** Cold admission only. Capture complete authorized class/passive/container
   * context here; command-time kernel reopening never calls this service. */
  initialize(input:WorkshopBuildInput):B;
  /** Pure complete fork, preserving build ownership. Never restore an existing
   * skill through a cold save path. Immutable definitions may be shared. */
  fork(source:Readonly<B>,input:WorkshopBuildInput):B;
  /** Derive the complete private build. Return only item investment writeback;
   * this port cannot publish wallet, account, bar or custody changes. Services
   * must not retain or later mutate owned graphs or call live World effects. */
  derive(candidate:B,input:WorkshopBuildInput):readonly WorkshopGrantWrite[];
}
export interface WorkshopBuildPort {
  prepare(previous:object|undefined,input:WorkshopBuildInput):{
    state:CraftingSessionState;continuation:object;
  };
}

/** Optional trusted build composition for AccountWorkshopSession. Opaque tokens
 * keep private continuation graphs out of JSON saves and external reads. The
 * account owner promotes/discards tokens together with their normalized saves.
 * It remains responsible for complete state/reply admission before publication. */
export class WorkshopBuildPreparation<B extends object> implements WorkshopBuildPort {
  readonly #builds=new WeakMap<object,{profile:number;build:B}>();
  constructor(readonly services:WorkshopBuildServices<B>) {}
  prepare(previous:object|undefined,input:WorkshopBuildInput) {
    const state=copySessionJSON(input.state) as unknown as CraftingSessionState;
    const privateInput={...input,state:copySessionJSON(state) as unknown as CraftingSessionState,
      account:copySessionJSON(input.account) as Record<string,SessionJSON>,
      ...(input.character?{character:copySessionJSON(input.character) as unknown as WorkshopCharacterState}:{}),
      ...(input.command?{command:copySessionJSON(input.command) as Record<string,SessionJSON>}:{})};
    const held=previous===undefined?undefined:this.#builds.get(previous);
    need(previous===undefined||held?.profile===input.profile,'foreign-build-continuation');
    const source=held?.build;
    const candidate=source===undefined?this.services.initialize(privateInput):this.services.fork(source,privateInput);
    need(candidate!==null&&typeof candidate==='object'&&candidate!==source,'invalid-build-candidate');
    const writes=copySessionJSON(this.services.derive(candidate,privateInput));array(writes);
    const items=new Map([...state.items,...Object.values(state.equipped),...state.overflow].map(item=>[item.uid,item]));
    const touched=new Set<number>();
    for(const row of writes){
      fields(row,['uid','grantState']);integer(row.uid,1);need(!touched.has(row.uid),'duplicate-grant-write');touched.add(row.uid);
      const item=items.get(row.uid);need(item,'unknown-grant-item');
      need(row.grantState!==undefined,'missing-grant-write');
      if(row.grantState===null)delete item.grantState;
      else {record(row.grantState);item.grantState=row.grantState as unknown as NonNullable<ItemInstance['grantState']>;}
    }
    const continuation=Object.freeze({});this.#builds.set(continuation,{profile:input.profile,build:candidate});
    return {state,continuation};
  }
}
