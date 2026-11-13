import type {PreparedStepAccount as Account,PreparedStepInstaller} from './complete-character-contracts.js';
import type {ProgressionRelic} from './progression-session.js';
import type {RelicState} from './relic-custody.js';
import {requireSession as need,type SessionJSON} from './session-json.js';

type JSONRecord=Record<string,SessionJSON>;
export interface PreparedStepScope {
 read(profile:number):Readonly<{accountKey:string;level:number;classId:string;passivePoints:number;relicCells:number;relicEnabled:boolean}>;
 execute(command:JSONRecord):JSONRecord;
}
export type PreparedStep=(command:JSONRecord,scope:PreparedStepScope)=>JSONRecord|undefined;

/** Internal adapter only. Raw owner access stays in this closure; the injected
 * rule receives primitive metadata and a command writer, both revoked on exit.
 * Immutable account identity invalidates the seated-area cache after any write. */
export function installPreparedStep(step:PreparedStep):PreparedStepInstaller {
 return access=>{
  const cellCache=new WeakMap<Account,number>();
  const state=(account:Account)=>(account.progression.account as JSONRecord).reliquary as unknown as RelicState<ProgressionRelic>;
  const read=(profile:number)=>{
   const workshop=access.workshop(profile),character=workshop.character;
   need(character,'character-context-required');
   const account=access.account(workshop.account),selected=access.relicBuilds&&account.active===profile;
   let cells=selected?cellCache.get(account):0;
   if(cells===undefined){
    const relics=state(account),seated=new Set(relics.seated);cells=0;
    for(const item of relics.items)if(seated.has(item.relicKey))cells+=item.w*item.h;
    cellCache.set(account,cells);
   }
   return Object.freeze({accountKey:account.key,level:character.level,classId:character.passives.classId,passivePoints:character.passives.passivePoints,
    relicCells:cells,relicEnabled:selected?state(account).enabled:false});
  };
  return(command,execute)=>{
   let active=true;
   const scope:PreparedStepScope={read:profile=>{need(active,'expired-prepared-step');return read(profile);},
    execute:value=>{need(active,'expired-prepared-step');return execute(value);}};
   try{return step(command,scope)??execute(command);}finally{active=false;}
  };
 };
}
