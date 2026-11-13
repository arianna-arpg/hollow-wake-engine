// Qualification composition only. Production entry points keep fixed formats.
import assert from 'node:assert/strict';
import {AccountWorkshopSession as Legacy} from '../../dist/account-workshop-session.js';
import {CompleteAccountWorkshopSession as Complete} from '../../dist/account-workshop-complete.js';
import {AccountWorkshopSessionCore as Core} from '../../dist/account-workshop-core.js';
import {CompleteAccountKernel as AccountBase} from '../../dist/complete-account-commands.js';
import {CharacterWorkshopAdmission as WorkshopBase} from '../../dist/character-workshop-commands.js';
import {instanceTrigger} from 'diagnostic/trigger-query';
export {CompleteWorkshopCharacterData as WorkshopCharacterData} from '../../dist/workshop-character-complete.js';
export function AccountWorkshopSession(definitions,limits){
 if(definitions.completeKernel)return new Complete(definitions,limits);
 if(definitions.ruleKernel)return new Core(definitions,limits,{ruleKernel:definitions.ruleKernel});
 return new Legacy(definitions,limits);
}
export class CharacterWorkshopAdmission extends WorkshopBase {
 constructor(definitions){super({...definitions,trigger:instanceTrigger});}
}
export const accountContracts={identity:false,stale:false,delivery:false};
export class CompleteAccountKernel extends AccountBase {
 constructor(definitions,ports){super({...definitions,trigger:instanceTrigger},ports);}
 execute(previous,open,command,scope){
  const result=super.execute(previous,open,command,scope);
  if(!accountContracts.identity){
   assert.throws(()=>super.execute(previous,open,command,{...scope,accountKey:scope.accountKey+':foreign'}),/account-scope-mismatch/);accountContracts.identity=true;
  }
  if(!accountContracts.stale&&previous&&command&&open.op==='restore'){
   const stale=JSON.parse(JSON.stringify(open));stale.save.nextUid+=1;
   assert.throws(()=>super.execute(previous,stale,command,scope),/stale-character-continuation/);accountContracts.stale=true;
  }
  if(!accountContracts.delivery&&command?.op==='character-pickup'){
   assert.throws(()=>super.execute(previous,open,command,{...scope,delivery:undefined}),/durable-pickup-required/);accountContracts.delivery=true;
  }
  return result;
 }
}
