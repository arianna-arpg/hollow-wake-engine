import type {WorkshopCharacterState} from './workshop-character.js';
import type {CraftingSessionState} from './crafting-session-data.js';
import type {SkillProgression} from './skill-progression.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionRecord as record} from './session-json.js';

/** Workspace protocol candidate. Ability currency is independent of crafting.
 * No implicit legacy migration and no permission flags in saved data. */
export interface ProgressionCharacterState extends Omit<WorkshopCharacterState,'schemaVersion'|'capability'> {
  schemaVersion:2;
  capability:'workshop-character/progression-diagnostic';
  abilityEssences:Record<string,number>;
}
interface CharacterAdmission {
  admit(input:unknown,inventory:CraftingSessionState):WorkshopCharacterState;
  checkInventory(state:WorkshopCharacterState,inventory:CraftingSessionState):void;
}
export class ProgressionCharacterData {
  readonly #ids:Set<string>;
  constructor(readonly base:CharacterAdmission,skills:SkillProgression){
    need(skills.pack.services,'missing-ability-services');
    this.#ids=new Set(skills.pack.services.essences.map(row=>row.id));
  }
  admit(input:unknown,inventory:CraftingSessionState):ProgressionCharacterState {
    const value=copySessionJSON(input);
    fields(value,['schemaVersion','capability','contentId','level','baseAttrs','passives','containers','abilityEssences']);
    need(value.schemaVersion===2&&value.capability==='workshop-character/progression-diagnostic','unsupported-progression-character');
    record(value.abilityEssences);
    for(const[id,n]of Object.entries(value.abilityEssences))need(this.#ids.has(id)&&typeof n==='number'&&Number.isFinite(n)&&n>=0,'invalid-ability-wallet');
    const {abilityEssences,...rest}=value;
    const admitted=this.base.admit({...rest,schemaVersion:1,capability:'workshop-character/v1'},inventory);
    return {...admitted,schemaVersion:2,capability:'workshop-character/progression-diagnostic',abilityEssences:abilityEssences as Record<string,number>};
  }
  checkInventory(state:ProgressionCharacterState,inventory:CraftingSessionState):void {
    this.base.checkInventory({...state,schemaVersion:1,capability:'workshop-character/v1'},inventory);
  }
}
