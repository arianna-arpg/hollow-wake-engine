import {WorkshopCharacterData,type WorkshopCharacterState} from './workshop-character.js';
import {SessionInputError} from './session-json.js';

/** Internal complete-character format. Earned assignments can survive a
 * temporarily unlearned skill; item custody and all other admission stay shared. */
export class CompleteWorkshopCharacterData extends WorkshopCharacterData {
  protected override checkGraftCarriers(state:WorkshopCharacterState):void {
    for(const target of Object.values(state.passives.grafts))if(target!==null){
      try{this.workshop.skills.skill(target);}catch{throw new SessionInputError('unknown-graft-carrier');}
    }
  }
}
