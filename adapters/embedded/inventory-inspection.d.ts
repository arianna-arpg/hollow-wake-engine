import type {Modifier} from '@hollow-wake/engine';
import type {ItemInspector} from '@hollow-wake/engine/items/inspection';
export type InspectionCategory='skills'|'supports'|'passives'|'choices'|'classes'|'vocations';
export type InspectionDetail='compact'|'full';
export interface InspectionReference {name:string;text:string}
export interface InspectionCard {name:string;description:string;hasFullDetail:boolean;references:InspectionReference[]}
export interface InventoryInspector {
 readonly sourceCommit:string;
 card(category:InspectionCategory,id:string,detail?:InspectionDetail):InspectionCard|null;
 treeNode(skillId:string,nodeId:string,detail?:InspectionDetail):InspectionCard|null;
 stat(id:string,detail?:InspectionDetail):{name:string;description:string;base:number;percent:boolean;hasFullDetail:boolean;detail:string|null}|null;
 triggerReferences(modifiers:readonly Modifier[]):InspectionReference[];
 item(input:unknown):ReturnType<ItemInspector['inspect']>;
 compare(candidate:unknown,worn:unknown):ReturnType<ItemInspector['compare']>;
}
/** Both inputs come from the same authored distribution. Results are detached. */
export declare function createInventoryInspector(builds:unknown,inspection:unknown):InventoryInspector;
