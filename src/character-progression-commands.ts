import {SkillActions,type ActionSkill} from './skill-actions.js';
import {createGemCargo,packSkillGemPayload,packGrantState,writeBackSupportGem,type GemDefinition,type GemSkill,type GemSupport} from './gem-residence.js';
import type {CharacterBuild,CharacterBuildService,CharacterBuildSkillView} from './character-builds.js';
import type {CraftingSessionDefinitions} from './crafting-session-data.js';
import type {ItemInstance,GrantedSkillState} from './item-types.js';
import type {CharacterCommandDraft} from './character-command-types.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionText as text,sessionInteger as integer,
 sessionRecord as record,sessionBoolean as bool,type SessionJSON} from './session-json.js';

type Definition=GemDefinition&ActionSkill['def'];
export type ProgressionSkill=GemSkill<Definition,GemDefinition>&ActionSkill&{grafts?:(GemSupport|null)[];bonusLevels?:number};
type ProgressionRequest={op:'levelSkill'|'reset';skillId:string}|{op:'pick';skillId:string;nodeId:string}
 |{op:'levelSupportInv';uid:number}|{op:'levelSupportSocket';skillId:string;index:number}|{op:'convert';tier:number;direction:'up'|'down'};
export interface CharacterProgressionPorts {
 builds:Pick<CharacterBuildService,'read'>;build:CharacterBuild;saved:CharacterCommandDraft;
 definitions:{workshop:CraftingSessionDefinitions;catalogue:{skills:Readonly<Record<string,Definition>>;
  supports:Readonly<Record<string,GemDefinition>>;monsters:Readonly<Record<string,unknown>>}};
 /** Pure, synchronous current-instance query over this detached skill. */
 trigger(skill:ProgressionSkill):Readonly<{on:string;then?:never}>|undefined;
}
export type CharacterProgressionEvent=
 |{kind:'meta-dirty'|'character-dirty'|'recalculate'}
 |{kind:'awaken'|'dismiss'|'clear-summons'|'clear-fields'|'resync-supports';skillId:string}
 |{kind:'reset-trigger';skillId:string;changed:boolean}
 |{kind:'refusal';key:string;reason:string}
 |{kind:'text';offset:{x:number;y:number};message:string;color:string;size:number;category?:'gains'};
export interface CharacterProgressionResult {
 accepted:boolean;changed:boolean;needsSave:boolean;events:CharacterProgressionEvent[];refusal?:string;
 request?:CharacterCommandDraft&{capability:'character-workshop/residence-diagnostic'};
 grants?:{skillId:string;hostUid?:number;state:GrantedSkillState}[];
}
function parseRequest(request:SessionJSON):ProgressionRequest {
 record(request);switch(request.op){
  case 'levelSkill':case 'reset':fields(request,['op','skillId']);text(request.skillId);break;
  case 'pick':fields(request,['op','skillId','nodeId']);text(request.skillId);text(request.nodeId);break;
  case 'levelSupportInv':fields(request,['op','uid']);integer(request.uid,1);break;
  case 'levelSupportSocket':fields(request,['op','skillId','index']);text(request.skillId);integer(request.index,0,1023);break;
  case 'convert':fields(request,['op','tier','direction']);integer(request.tier,1);need(request.direction==='up'||request.direction==='down','invalid-conversion-direction');break;
  default:need(false,'unsupported-progression-command');
 }
 return request as unknown as ProgressionRequest;
}
const own=<T>(rows:Readonly<Record<string,T>>,id:string):T|undefined=>Object.hasOwn(rows,id)?rows[id]:undefined;

/** Private preparation over admitted ownership. Host conditions and emitted
 * acknowledgement work confer no authority to mutate a live actor or save. */
export function changeCharacterProgression(ports:CharacterProgressionPorts,rawRequest:unknown,rawConditions:unknown):CharacterProgressionResult {
 const detached=copySessionJSON(rawRequest),conditions=copySessionJSON(rawConditions),request=parseRequest(detached);
 fields(conditions,['nearFont','memory','hold']);bool(conditions.nearFont);record(conditions.memory);
 need(Object.keys(conditions.memory).length<=16,'invalid-memory-holds');for(const[id,why]of Object.entries(conditions.memory)){text(id);text(why);}
 if(conditions.hold!==null)text(conditions.hold);
 const nearFont=conditions.nearFont,memory=conditions.memory as Record<string,string>,hold=conditions.hold;
 const saved=copySessionJSON(ports.saved) as unknown as CharacterCommandDraft,state=saved.state,view=ports.builds.read(ports.build),events:CharacterProgressionEvent[]=[];
 const progression=ports.definitions.workshop.skills,catalogue=ports.definitions.catalogue,services=progression.pack.services;need(services,'missing-skill-services');
 const unavailable=():never=>{throw Error('Progression preparation cannot mint or move cargo');};
 const cargo=createGemCargo<Definition,GemDefinition,ProgressionSkill,ItemInstance>({skill:id=>own(catalogue.skills,id),support:id=>own(catalogue.supports,id),hasForm:id=>!!own(catalogue.monsters,id),
  makeSkill:(def,level,count)=>({def,level,sockets:Array(count).fill(null)}),validTreeNodes:(_def,ids)=>ids?.slice(),
  nextUid:unavailable,bagWidth:()=>state.board.w,bagHeight:()=>state.board.h,itemGridSize:unavailable});
 const socket=(row:CharacterBuildSkillView['sockets'][number]):GemSupport|null=>row?{def:catalogue.supports[row.id],level:row.level,...(row.locked?{locked:true}:{}),...(row.rolled?{rolled:row.rolled}:{})}:null;
 const known=new Map<string,ProgressionSkill>(state.skillBook.known.map(row=>{const inst=cargo.skillOfGemItem(row);need(inst,'unresolved-owned-skill');return[inst.def.id,inst];}));
 const grants=new Map<string,ProgressionSkill>(view.grants.map(([id,row])=>[id,{def:catalogue.skills[id],level:row.level,sockets:row.sockets.map(socket),...(row.tree?{treeNodes:row.tree}:{})}]));
 for(const[instances,rows]of [[known,view.known],[grants,view.grants]] as const)for(const[id,row]of rows){const inst=instances.get(id);need(inst,'unresolved-owned-skill');inst.grafts=(row.grafts??[]).map(socket);inst.bonusLevels=row.bonus;}
 let refusal:string|undefined,accepted=false,triggerBefore:unknown,triggerCalls=0;
 type SkillEvent='awaken'|'dismiss'|'clear-summons'|'clear-fields'|'resync-supports';
 const skillEvent=(kind:SkillEvent,inst:ProgressionSkill|string)=>events.push({kind,skillId:typeof inst==='string'?inst:inst.def.id});
 const actions=new SkillActions<null,ProgressionSkill,GemSupport,ItemInstance>({ability:()=>progression.ability,tree:inst=>progression.tree(inst.def.id),essences:()=>services.essences,font:()=>services.font,
  wallet:()=>saved.character.abilityEssences,known:(_seat,id)=>known.get(id),granted:(_seat,id)=>grants.get(id),
  skillMax:inst=>progression.skill(inst.def.id).maxLevel,supportMax:gem=>progression.support(gem.def.id).maxLevel,
  nearFont:()=>nearFont,memoryRefusal:(_seat,id)=>Object.hasOwn(memory,id)?memory[id]:null,swapRefusal:()=>hold,
  position:()=>({x:0,y:0}),text:(offset,message,color,size,category)=>events.push({kind:'text',offset,message,color,size,...(category?{category}:{})}),
  fail:(_seat,key,reason)=>{refusal=reason;events.push({kind:'refusal',key,reason});},
  markMetaDirty:()=>events.push({kind:'meta-dirty'}),markCharacterDirty:()=>events.push({kind:'character-dirty'}),
  awaken:(_seat,inst)=>skillEvent('awaken',inst),dismiss:(_seat,id)=>skillEvent('dismiss',id),clearSummons:(_seat,inst)=>skillEvent('clear-summons',inst),clearFields:(_seat,inst)=>skillEvent('clear-fields',inst),
  trigger:inst=>{const value=ports.trigger(inst);need(value===undefined||value!==null&&typeof value==='object'&&typeof value.then!=='function','invalid-trigger-query');if(triggerCalls++===0)triggerBefore=value;else events.push({kind:'reset-trigger',skillId:inst.def.id,changed:triggerBefore!==value});return value;},
  recalculate:()=>events.push({kind:'recalculate'}),pickup:unavailable,mergePlan:unavailable,sockets:unavailable,remove:unavailable,grantSkill:unavailable,grantSupport:unavailable,announceMerge:unavailable
 });
 if(request.op==='levelSkill')accepted=actions.levelSkill(null,request.skillId);
 else if(request.op==='reset')accepted=actions.reset(null,request.skillId);
 else if(request.op==='convert')accepted=actions.convert(null,request.tier,request.direction);
 else if(request.op==='pick'){
  const inst=known.get(request.skillId)??grants.get(request.skillId),before=inst?.treeNodes?.length??0;
  actions.pick(null,request.skillId,request.nodeId);accepted=(inst?.treeNodes?.length??0)!==before;
 }else if(request.op==='levelSupportInv'){
  const item=state.items.find(item=>item.uid===request.uid),gem=item?cargo.supportOfGemItem(item):null;
  if(gem&&item){accepted=actions.levelSupport(null,gem);writeBackSupportGem(item,gem);}
 }else if(request.op==='levelSupportSocket'){
  // Original UI socket-leveling resolves only learned skills, even for bound grants.
  const gem=known.get(request.skillId)?.sockets[request.index];
  if(gem){accepted=actions.levelSupport(null,gem);skillEvent('resync-supports',request.skillId);}
 }
 state.skillBook.known=[...known.values()].map(inst=>({gem:packSkillGemPayload(inst),...(inst.locked?{locked:true}:{})}));
 const grantEdits:NonNullable<CharacterProgressionResult['grants']>=[],grantViews=new Map(view.grants);
 for(const[id,inst]of grants){const before=grantViews.get(id);need(before,'unresolved-grant');const after=packGrantState(inst),old={sockets:before.sockets.map(row=>row?{supportId:row.id,level:row.level,...(row.locked?{locked:true}:{}),...(row.rolled?{rolled:row.rolled}:{})}:null),...(before.tree?.length?{treeNodes:before.tree}:{})};
  if(JSON.stringify(after)!==JSON.stringify(old))grantEdits.push({skillId:id,hostUid:before.host,state:after});
 }
 const changed=JSON.stringify(state)!==JSON.stringify(ports.saved.state)||JSON.stringify(saved.character)!==JSON.stringify(ports.saved.character)||grantEdits.length>0;
 return{accepted,changed,needsSave:changed,events,...(refusal?{refusal}:{}),...(changed?{request:{capability:'character-workshop/residence-diagnostic' as const,state,character:saved.character,nextUid:saved.nextUid},grants:grantEdits}:{})};
}
