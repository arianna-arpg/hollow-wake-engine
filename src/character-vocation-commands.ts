import {grantVocation,vocationUnlockKey} from './vocation-grants.js';
import type {PassivePolicy} from './passive-policy.js';
import type {CharacterCommandDraft} from './character-command-types.js';
import type {CompleteBuildTransition} from './complete-character-contracts.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionInteger as integer,sessionText as text,sessionBoolean as bool} from './session-json.js';

export interface OwnedVocationGrant {readonly id:string;readonly maxPerCharacter:number;readonly accountWrites:boolean;readonly runCount:number}
export type OwnedVocationEvent={kind:'account-dirty'|'character-dirty'|'announce-vocation'|'announce-tree'}|{kind:'recalculate';rebuild:number};
export interface OwnedVocationPorts<T extends object> {
 policy:PassivePolicy;previous:T;current:CharacterCommandDraft;accountLedger:Readonly<Record<string,number>>;
 rebuild(previous:T,request:CharacterCommandDraft,accountLedger:Record<string,number>):T;
}
const copy=<T>(v:T):T=>copySessionJSON(v) as T;

/** Compose the existing grant rule over private investment. Live callbacks and
 * persistence stay outside this plan; account and run counters remain distinct. */
export function prepareOwnedVocation<T extends object>(ports:OwnedVocationPorts<T>,raw:OwnedVocationGrant){
 const grant=copy(raw);fields(grant,['id','maxPerCharacter','accountWrites','runCount']);text(grant.id);integer(grant.maxPerCharacter,0,256);bool(grant.accountWrites);integer(grant.runCount);
 const current=ports.current,passives=copy(current.character.passives),live={...passives,allocated:new Set(passives.allocated)};
 const key=vocationUnlockKey(grant.id),run:Record<string,number>={[key]:grant.runCount},accountLedger=copy(ports.accountLedger) as Record<string,number>;
 const events:OwnedVocationEvent[]=[],rebuilds:CompleteBuildTransition[]=[];let token=ports.previous;
 const accepted=grantVocation(grant.id,null,{
  definition:id=>ports.policy.hasVocation(id)?ports.policy.vocation(id):null,character:()=>live,maxPerCharacter:()=>grant.maxPerCharacter,
  runLedger:()=>run,accountWritesAllowed:()=>grant.accountWrites,accountLedger:()=>accountLedger,
  markAccountDirty:()=>{events.push({kind:'account-dirty'});},
  recalculate:()=>{
   integer(run[key]);const before=token;
   token=ports.rebuild(before,{state:current.state,nextUid:current.nextUid,character:{...current.character,passives:{...live,allocated:[...live.allocated]}}},accountLedger);
   need(token!==before,'vocation-rebuild-required');rebuilds.push(Object.freeze({before,after:token}));events.push({kind:'recalculate',rebuild:rebuilds.length-1});
  },
  markCharacterDirty:()=>{events.push({kind:'character-dirty'});},announceGrant:()=>{events.push({kind:'announce-vocation'});},announceTree:()=>{events.push({kind:'announce-tree'});}
 });
 return{token,rebuilds:Object.freeze(rebuilds),accepted,changed:accepted,needsSave:accepted,events,accountLedger,
  runCounter:accepted?{key,before:grant.runCount,after:run[key]}:null};
}
