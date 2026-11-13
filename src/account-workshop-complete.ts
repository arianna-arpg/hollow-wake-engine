import {AccountWorkshopSessionCore,type AccountWorkshopDefinitions,type AccountWorkshopLimits} from './account-workshop-core.js';
import type {CompleteWorkshopKernel} from './complete-character-contracts.js';
import {requireSession as need} from './session-json.js';
export type {PreparedCharacterCommand,PrivateBuildTransition} from './account-workshop-core.js';
export interface CompleteAccountWorkshopDefinitions extends AccountWorkshopDefinitions {completeKernel:CompleteWorkshopKernel}
/** Internal complete format. Selection belongs to this facade, never save data. */
export class CompleteAccountWorkshopSession extends AccountWorkshopSessionCore {
 constructor(definitions:CompleteAccountWorkshopDefinitions,limits:AccountWorkshopLimits={}) {
  const kernel=definitions.completeKernel;
  need(kernel!==null&&typeof kernel==='object'&&typeof kernel.execute==='function'&&
   kernel.character!==null&&typeof kernel.character==='object'&&typeof kernel.character.admit==='function'&&
   typeof kernel.character.checkInventory==='function'&&typeof kernel.character.uidFloor==='function','complete-kernel-required');
  super(definitions,limits,{completeKernel:kernel});
 }
 preparedJournal(token:number){return this.readPreparedJournal(token);}
}
