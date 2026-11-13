import {SkillRackActions,type RackBody} from './skill-rack.js';
import {createGemCargo,packSkillGemPayload,type GemDefinition,type GemSkill} from './gem-residence.js';
import type {CraftingSessionDefinitions} from './crafting-session-data.js';
import type {CharacterBuild,CharacterBuildService} from './character-builds.js';
import type {ItemInstance} from './item-types.js';
import type {InventoryHost,LiveInventoryBoard} from './inventory-host.js';
import type {CharacterCommandDraft} from './character-command-types.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionText as text,
 sessionInteger as integer,sessionRecord as record,sessionBoolean as bool,type SessionJSON} from './session-json.js';

type RackGem=GemSkill<GemDefinition,GemDefinition>;
type RackRequest={op:'learn';uid:number;slot?:number}|{op:'unlearn';skillId:string;x?:number;y?:number};
export interface CharacterRackPorts {
 builds:Pick<CharacterBuildService,'read'>;build:CharacterBuild;saved:CharacterCommandDraft;
 inventory:Pick<InventoryHost<ItemInstance>,'remove'|'autoPlace'|'place'>;
 definitions:{workshop:CraftingSessionDefinitions;catalogue:{skills:Readonly<Record<string,GemDefinition>>;
  supports:Readonly<Record<string,GemDefinition>>;monsters:Readonly<Record<string,unknown>>}};
}
export type CharacterRackEvent={kind:'dirty'}|{kind:'learn'|'unlearn';skillId:string}|{kind:'remember-skill-slot';skillId:string;slot:number};
export interface CharacterRackResult {
 changed:boolean;needsSave:boolean;events:CharacterRackEvent[];refusal?:string;
 request?:CharacterCommandDraft&{capability:'character-workshop/residence-diagnostic'};
 bar?:(string|null)[];replaceLearned?:string[];
}
function parseRequest(request:SessionJSON):RackRequest {
 record(request);const learn=request.op==='learn';need(learn||request.op==='unlearn','unsupported-rack-command');
 fields(request,learn?['op','uid','slot']:['op','skillId','x','y']);
 if(learn){integer(request.uid,1);if(request.slot!==undefined)integer(request.slot,0,7);}
 else{text(request.skillId);if(request.x!==undefined)integer(request.x);if(request.y!==undefined)integer(request.y);need((request.x===undefined)===(request.y===undefined),'partial-placement');}
 return request as unknown as RackRequest;
}
const own=<T>(rows:Readonly<Record<string,T>>,id:string):T|undefined=>Object.hasOwn(rows,id)?rows[id]:undefined;

/** Detached custody preparation. Conditions belong to the trusted host, never
 * to a save or player-selected permission flag. Live cleanup is not executed. */
export function changeCharacterRack(ports:CharacterRackPorts,rawRequest:unknown,rawConditions:unknown):CharacterRackResult {
 const detached=copySessionJSON(rawRequest),conditions=copySessionJSON(rawConditions),request=parseRequest(detached);
 fields(conditions,['meets','blocked']);bool(conditions.meets);record(conditions.blocked);
 need(Object.keys(conditions.blocked).length<=16,'invalid-rack-holds');for(const[id,reason]of Object.entries(conditions.blocked)){text(id);text(reason);}
 const meets=conditions.meets,blocked=conditions.blocked as Record<string,string>;
 const saved=copySessionJSON(ports.saved) as unknown as CharacterCommandDraft,state=saved.state,view=ports.builds.read(ports.build),events:CharacterRackEvent[]=[];
 const next=()=>{integer(saved.nextUid,1,Number.MAX_SAFE_INTEGER-1);return saved.nextUid++;};
 const catalogue=ports.definitions.catalogue;
 const cargo=createGemCargo<GemDefinition,GemDefinition,RackGem,ItemInstance>({skill:id=>own(catalogue.skills,id),support:id=>own(catalogue.supports,id),hasForm:id=>!!own(catalogue.monsters,id),
  makeSkill:(def,level,count)=>({def,level,sockets:Array(count).fill(null)}),
  validTreeNodes:(def,ids,level,inst)=>ports.definitions.workshop.skills.tree(def.id).restore(ids,level,inst),nextUid:next,
  bagWidth:()=>state.board.w,bagHeight:()=>state.board.h,itemGridSize:item=>ports.definitions.workshop.crafting.items.pack.bases[item.baseId]});
 const known=new Map<string,RackGem>();for(const row of state.skillBook.known){
  const skill=cargo.skillOfGemItem(row);need(skill,'unresolved-owned-skill');
  // Existing learned investment is admitted; preserve it on temporary reopen.
  if(row.gem.treeNodes!==undefined)skill.treeNodes=[...row.gem.treeNodes];
  known.set(skill.def.id,skill);
 }
 const grants=new Map<string,RackGem>(view.grants.map(([id,row])=>[id,{def:catalogue.skills[id],level:row.level,sockets:[]}]));
 const body:RackBody<RackGem>={skills:state.skillBook.bar.map(id=>id===null?null:known.get(id)??grants.get(id)??null)};
 const rows=state.board.rows,board:LiveInventoryBoard={w:state.board.w,h:state.board.h,...(rows?{open:(x:number,y:number)=>rows[y][x]==='#'}:{})};
 const before=state.items.findIndex(item=>item.uid===(request.op==='learn'?request.uid:undefined)),oldKnown=new Set(known.keys()),departed:string[]=[];
 let refusal:string|undefined;
 const actions=new SkillRackActions<null,RackBody<RackGem>,RackGem,ItemInstance>({maxLearned:8,hero:()=>body,actor:()=>body,known:()=>known,granted:(_seat,id)=>grants.has(id),
  bagItem:(_seat,uid)=>state.items.find(item=>item.uid===uid),unpack:cargo.skillOfGemItem,pack:cargo.makeSkillGemItem,meets:()=>meets,
  refusal:(_seat,skill)=>Object.hasOwn(blocked,skill.def.id)?{key:'hold',why:blocked[skill.def.id]}:null,
  fail:(_body,_key,why)=>{refusal=why;},remove:(_seat,uid)=>ports.inventory.remove(state.items,uid),
  freeCells:()=>{let count=cargo.freeCellCount(state.items);for(const row of state.board.rows??[])for(const cell of row)if(cell==='.')count--;return count;},
  place:(_seat,item,x,y)=>x===undefined?ports.inventory.autoPlace(state.items,item,board):ports.inventory.place(state.items,item,x,y!,board),
  beforeForget:(_seat,_body,skill)=>events.push({kind:'remember-skill-slot',skillId:skill.def.id,slot:body.skills.indexOf(skill)}),
  afterForget:(_seat,_body,id)=>{departed.push(id);events.push({kind:'unlearn',skillId:id});},
  afterLearn:(_seat,skill)=>events.push({kind:'learn',skillId:skill.def.id}),dirty:()=>events.push({kind:'dirty'}),afterUnlearn:()=>{}
 });
 const changed=request.op==='learn'?actions.learn(null,request.uid,request.slot):actions.unlearn(null,request.skillId,request.x,request.y);
 const reordered=request.op==='learn'&&!changed&&before!==state.items.findIndex(item=>item.uid===request.uid);
 const needsSave=changed||reordered||saved.nextUid!==ports.saved.nextUid,bar=body.skills.map(skill=>skill?.def.id??null);
 if(changed)state.skillBook.known=[...known.values()].map(skill=>({gem:packSkillGemPayload(skill),...(skill.locked?{locked:true}:{})}));
 const replaceLearned=departed.filter(id=>oldKnown.has(id)&&known.has(id));
 return{changed,needsSave,events,...(refusal?{refusal}:{}),...(needsSave?{
  request:{capability:'character-workshop/residence-diagnostic' as const,state,character:saved.character,nextUid:saved.nextUid},bar,replaceLearned}:{})};
}
