import type {WorkshopCharacterState} from './workshop-character.js';
import type {WorkshopBuildInput,WorkshopRelicGrantWrite} from './workshop-build-preparation.js';
import type {RelicState} from './relic-custody.js';
import type {ItemInstance} from './item-types.js';
import type {SessionJSON} from './session-json.js';

export type CharacterObjectJSON=Record<string,SessionJSON>;
export interface CompleteCharacterContext extends Omit<WorkshopCharacterState,'schemaVersion'|'capability'> {schemaVersion:number;capability:string}
export interface CompleteCharacterCodec {
 admit(input:unknown,inventory:WorkshopBuildInput['state']):CompleteCharacterContext;
 checkInventory(state:CompleteCharacterContext,inventory:WorkshopBuildInput['state']):void;
 uidFloor(state:CompleteCharacterContext):number;
}
export interface WorkshopRuleScope {
 profile:number;accountKey:string;stage:'open'|'restore'|'command'|'normalized';
 /** Only the account owner can authorize preparation of world deliveries. */
 delivery?:'prepare';account:Readonly<CharacterObjectJSON>;characterInput?:SessionJSON;
 relics:{role:'inactive'}|{role:'active';state:RelicState<ItemInstance>};
}
export interface CompleteWorkshopKernel {
 character:CompleteCharacterCodec;
 execute(previous:object|undefined,open:Readonly<CharacterObjectJSON>,command:Readonly<CharacterObjectJSON>|undefined,scope:WorkshopRuleScope):{
  reply:SessionJSON;save:CharacterObjectJSON;continuation:object;character:SessionJSON;relicWrites?:readonly WorkshopRelicGrantWrite[];
 };
}
