import {PassiveActions} from './passive-actions.js';
import type {PassivePolicy,PassiveBuildState} from './passive-policy.js';
import type {CharacterCommandDraft} from './character-command-types.js';
import type {CharacterBuildView} from './character-builds.js';
import type {CompleteBuildTransition} from './complete-character-contracts.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionRecord as record,sessionText as text,sessionBoolean as bool} from './session-json.js';

type SkillReference={origin:'learned';skillId:string};
export type CharacterPassiveEvent=
 |{kind:'recalculate';rebuild:number}
 |{kind:'refresh-company'|'meta-dirty'|'character-dirty'|'capture-summons'|'refresh-captured-summons'|'resync-owned-supports'}
 |({kind:'resync-supports'}&SkillReference)
 |{kind:'refusal';key:string;reason:string};
export interface CharacterPassivePorts<T extends object> {
 policy:PassivePolicy;previous:T;
 read(token:T):CharacterCommandDraft&{projection:CharacterBuildView};
 rebuild(previous:T,request:CharacterCommandDraft&{capability:'character-workshop/residence-diagnostic'}):T;
}
export interface CharacterPassiveConditions {refundRefusal:string|null;openAllRealms:boolean;runLedger:Readonly<Record<string,number>>}

type Request={op:'allocate';nodeId:string;option?:string}|{op:'refund';nodeId:string}|{op:'bindGraft';key:string;skillId:string|null}|{op:'ensureOpenRoots'};
const copy=<T>(value:T):T=>copySessionJSON(value) as unknown as T;
function parse(raw:unknown):Request {
 const value=copySessionJSON(raw);record(value);
 switch(value.op){
  case 'allocate':fields(value,['op','nodeId','option']);text(value.nodeId);if(value.option!==undefined)text(value.option);break;
  case 'refund':fields(value,['op','nodeId']);text(value.nodeId);break;
  case 'bindGraft':fields(value,['op','key','skillId']);text(value.key);if(value.skillId!==null)text(value.skillId);break;
  case 'ensureOpenRoots':fields(value,['op']);break;
  default:need(false,'unsupported-passive-command');
 }
 return value as unknown as Request;
}

/** Private investment preparation. Summon effects are a deferred group: capture
 * current eligible bodies at publication, rebuild, then refresh captured survivors.
 * The host supplies a coherent run-ledger observation, separate from account
 * progress. No body snapshot, clock, resource or live actor enters this plan. */
export function changeCharacterPassive<T extends object>(ports:CharacterPassivePorts<T>,raw:unknown,rawConditions:unknown){
 const request=parse(raw),conditions=copySessionJSON(rawConditions);fields(conditions,['refundRefusal','openAllRealms','runLedger']);bool(conditions.openAllRealms);
 record(conditions.runLedger);for(const value of Object.values(conditions.runLedger))need(typeof value==='number','invalid-passive-run-ledger');
 if(conditions.refundRefusal!==null)text(conditions.refundRefusal);
 let token=ports.previous,current=ports.read(token);const initial=copy(current.character.passives);
 const live={...copy(initial),allocated:new Set(initial.allocated)},session=ports.policy.attach(live);
 const events:CharacterPassiveEvent[]=[],rebuilds:CompleteBuildTransition[]=[];
 const passives=():PassiveBuildState=>copy({...live,allocated:[...live.allocated]});
 const known=(id:string):SkillReference|undefined=>current.projection.known.some(([key])=>key===id)?{origin:'learned',skillId:id}:undefined;
 // One sentinel describes the whole captured set. The live publisher expands it
 // against current world identities; preparation never retains old summon bodies.
 const captured=Object.freeze({});
 const actions=new PassiveActions<null,SkillReference,typeof captured>({
  session:()=>session,access:()=>({ledger:conditions.runLedger as Record<string,number>,openAllRealms:conditions.openAllRealms as boolean}),
  refundRefusal:()=>conditions.refundRefusal as string|null,graft:(_,key)=>live.grafts[key]??null,
  knownIds:()=>new Set(current.projection.known.map(([id])=>id)),known:(_,id)=>known(id),
  // Refund enumerates current instances after the acknowledged rebuild. A
  // temporary combat source may change granted skills while storage is pending.
  skills:()=>{events.push({kind:'resync-owned-supports'});return[];},
  summons:()=>{events.push({kind:'capture-summons'});return[captured];},alive:()=>true,
  recalculate:()=>{
   const before=token;
   token=ports.rebuild(before,{capability:'character-workshop/residence-diagnostic',state:current.state,
    character:{...current.character,passives:passives()},nextUid:current.nextUid});
   need(token!==before,'passive-rebuild-required');current=ports.read(token);
   rebuilds.push(Object.freeze({before,after:token}));events.push({kind:'recalculate',rebuild:rebuilds.length-1});
  },
  refreshCompany:()=>{events.push({kind:'refresh-company'});},resyncSupports:skill=>{events.push({kind:'resync-supports',...skill});},
  refreshSummon:()=>{events.push({kind:'refresh-captured-summons'});},markMetaDirty:()=>{events.push({kind:'meta-dirty'});},
  markCharacterDirty:()=>{events.push({kind:'character-dirty'});},fail:(_,key,reason)=>{events.push({kind:'refusal',key,reason});}
 });
 let accepted=true;
 if(request.op==='allocate')accepted=actions.allocate(null,request.nodeId,request.option);
 else if(request.op==='refund')accepted=actions.refund(null,request.nodeId);
 else if(request.op==='bindGraft')accepted=actions.bindGraft(null,request.key,request.skillId);
 else actions.ensureOpenRoots(null);
 const changed=JSON.stringify(initial)!==JSON.stringify(passives());
 return{token,rebuilds:Object.freeze(rebuilds),accepted,changed,needsSave:changed,events:copy(events)};
}
