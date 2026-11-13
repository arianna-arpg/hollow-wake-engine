import type {WorkshopCharacterState} from './workshop-character.js';
import type {WorkshopBuildInput,WorkshopRelicGrantWrite} from './workshop-build-preparation.js';
import type {RelicState} from './relic-custody.js';
import type {ItemInstance} from './item-types.js';
import type {SessionJSON} from './session-json.js';

export type CharacterObjectJSON=Record<string,SessionJSON>;
export interface PreparedStepAccount {key:string;progression:CharacterObjectJSON;active?:number}
export interface PreparedStepAccess {
 workshop(profile:number):{account:number;character?:CompleteCharacterContext};
 account(id:number):PreparedStepAccount;
 relicBuilds:boolean;
}
export type PreparedCommand=(command:CharacterObjectJSON,execute:(command:CharacterObjectJSON)=>CharacterObjectJSON)=>CharacterObjectJSON;
export type PreparedStepInstaller=(access:PreparedStepAccess)=>PreparedCommand;
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
/** A command's private intermediate rebuilds, never serialized or caller-assigned identities. */
export interface CompleteBuildTransition {readonly before:object;readonly after:object}
export interface PrivateBuildTransition {readonly profile:number;readonly accountKey:string;readonly before?:object;readonly after?:object}
export interface AdmittedCompleteWorkshopResult {
 reply:SessionJSON;save:CharacterObjectJSON;continuation:object;character:CompleteCharacterContext;
 relicWrites?:readonly WorkshopRelicGrantWrite[];rebuilds?:readonly CompleteBuildTransition[];
}
export interface AccountJournalReference {readonly key:string;readonly version:number;readonly active?:number}
export type CharacterReadonlyJSON=null|boolean|number|string|readonly CharacterReadonlyJSON[]|{readonly [key:string]:CharacterReadonlyJSON};
export interface PreparedAccountView {readonly version:number;readonly activeProfile:number|null;readonly save:Readonly<Record<string,CharacterReadonlyJSON>>}
export interface PreparedAccountTransition {readonly account:number;readonly accountKey:string;readonly before:PreparedAccountView;readonly after:PreparedAccountView}
export interface PreparedCharacterCommand {readonly index:number;readonly command:SessionJSON;readonly reply:SessionJSON;readonly transitions:readonly PrivateBuildTransition[];readonly accounts:readonly PreparedAccountTransition[]}
export interface CompleteJournalBuilder {
 push(command:SessionJSON,reply:SessionJSON,transitions:PrivateBuildTransition[],before:ReadonlyMap<number,AccountJournalReference>,after:ReadonlyMap<number,AccountJournalReference>,save:(account:AccountJournalReference)=>CharacterObjectJSON):void;
 finish():readonly PreparedCharacterCommand[];
}
export interface CompleteWorkshopBoundary {
 journal():CompleteJournalBuilder;
 admit(raw:unknown,codec:CompleteCharacterCodec,previous:object|undefined,command:boolean,scope:WorkshopRuleScope):AdmittedCompleteWorkshopResult;
 extend(path:readonly CompleteBuildTransition[]|undefined,before:object,after:object):readonly CompleteBuildTransition[]|undefined;
 append(transitions:PrivateBuildTransition[],profile:number,accountKey:string,before:object|undefined,after:object|undefined,path?:readonly CompleteBuildTransition[]):void;
}
export interface CompleteWorkshopKernel {
 character:CompleteCharacterCodec;
 execute(previous:object|undefined,open:Readonly<CharacterObjectJSON>,command:Readonly<CharacterObjectJSON>|undefined,scope:WorkshopRuleScope):{
  reply:SessionJSON;save:CharacterObjectJSON;continuation:object;character:SessionJSON;relicWrites?:readonly WorkshopRelicGrantWrite[];rebuilds?:readonly CompleteBuildTransition[];
 };
}
