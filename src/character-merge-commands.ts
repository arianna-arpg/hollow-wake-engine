import {planSkillMerge} from './skill-actions.js';
import {executeSkillMerge,type SkillMergeExecutionPorts} from './skill-merge-execution.js';
import {empowermentNumeral} from './skill-progression.js';
import {createGemCargo,packSkillGemPayload,packSupportGemPayload,type GemDefinition,type GemSkill,type GemSupport} from './gem-residence.js';
import type {CraftingSessionDefinitions} from './crafting-session-data.js';
import type {ItemInstance,SkillGemPayload} from './item-types.js';
import type {InventoryHost,LiveInventoryBoard} from './inventory-host.js';
import type {CharacterCommandDraft} from './character-command-types.js';
import type {CharacterGemDelivery} from './character-delivery-types.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionText as text,sessionInteger as integer,sessionBoolean as bool} from './session-json.js';

type MergeSkill=GemSkill<GemDefinition,GemDefinition>;
type MergeSupport=GemSupport<GemDefinition>;
/** Internal merge-only adapter. Kept with the unpublished character commands
 * so installed legacy consumers only ship the shared execution function. */
export class SkillMergeActions<S,T,I,G> {
  readonly #ports:SkillMergeExecutionPorts<S,T,I,G>;#busy=false;
  constructor(ports:SkillMergeExecutionPorts<S,T,I,G>){
    const names=['nearFont','mergePlan','fail','sockets','remove','grantSkill','grantSupport','markCharacterDirty','announceMerge'] as const;
    for(const name of names)if(typeof ports[name]!=='function')throw Error('Skill merge '+name+' port is required');
    this.#ports=Object.fromEntries(names.map(name=>[name,ports[name].bind(ports)])) as unknown as SkillMergeExecutionPorts<S,T,I,G>;
  }
  merge(seat:S,skillId:string,rarity:string):boolean {
    if(this.#busy)throw Error('Reentrant skill action');this.#busy=true;
    try{return executeSkillMerge(this.#ports,seat,skillId,rarity);}finally{this.#busy=false;}
  }
}
export interface CharacterMergePorts {
  saved:CharacterCommandDraft;inventory:Pick<InventoryHost<ItemInstance>,'autoPlace'|'remove'>;
  definitions:{workshop:CraftingSessionDefinitions;catalogue:{skills:Readonly<Record<string,GemDefinition>>;
    supports:Readonly<Record<string,GemDefinition>>;monsters:Readonly<Record<string,unknown>>}};
}
export type CharacterMergeEvent=
  | {kind:'meta-dirty'|'character-dirty'}
  | {kind:'world-drop-required';index:number}
  | {kind:'text';offset:{x:number;y:number};message:string;color:string;size:number}
  | {kind:'refusal';key:string;reason:string};
export interface CharacterMergeResult {
  accepted:boolean;changed:boolean;needsSave:boolean;events:CharacterMergeEvent[];worldDrops:CharacterGemDelivery[];refusal?:string;
  preview:{need:number;available:number;barred:number;taken:number[];returnSockets:number[];result:SkillGemPayload|null;refusal:string|null};
  request?:CharacterCommandDraft&{capability:'character-workshop/residence-diagnostic'};
}
const own=<T>(rows:Readonly<Record<string,T>>,id:string):T|undefined=>Object.hasOwn(rows,id)?rows[id]:undefined;

/** Detached merge preparation. Unplaced wrappers consume their UIDs and become
 * bare-gem obligations in the same future durable group, never bag overflow. */
export function changeCharacterMerge(ports:CharacterMergePorts,rawRequest:unknown,rawConditions:unknown):CharacterMergeResult {
  const request=copySessionJSON(rawRequest),conditions=copySessionJSON(rawConditions);
  fields(request,['op','skillId','rarity']);need(request.op==='merge','unsupported-merge-command');text(request.skillId);text(request.rarity);
  fields(conditions,['nearFont']);bool(conditions.nearFont);
  const saved=copySessionJSON(ports.saved) as unknown as CharacterCommandDraft,state=saved.state,events:CharacterMergeEvent[]=[],worldDrops:CharacterGemDelivery[]=[];
  const catalogue=ports.definitions.catalogue,progression=ports.definitions.workshop.skills,services=progression.pack.services;need(services,'missing-skill-services');
  const next=()=>{integer(saved.nextUid,1,Number.MAX_SAFE_INTEGER-1);return saved.nextUid++;};
  const cargo=createGemCargo<GemDefinition,GemDefinition,MergeSkill,ItemInstance>({skill:id=>own(catalogue.skills,id),support:id=>own(catalogue.supports,id),hasForm:id=>!!own(catalogue.monsters,id),
    makeSkill:(def,level,count)=>({def,level,sockets:Array(count).fill(null)}),validTreeNodes:(def,ids,level,inst)=>progression.tree(def.id).restore(ids,level,inst),
    nextUid:next,bagWidth:()=>state.board.w,bagHeight:()=>state.board.h,itemGridSize:item=>ports.definitions.workshop.crafting.items.pack.bases[item.baseId]});
  const rarity=new Map(services.rarities.map(row=>[row.id,row]));
  const plan=planSkillMerge<ItemInstance,MergeSkill>(state.items,request.skillId,request.rarity,{merge:services.font.merge,rarities:services.rarities.map(row=>row.id),empowerment:services.empowerment},{
    payload:item=>item.gem?.kind==='skill'?item.gem:undefined,locked:item=>!!item.locked,known:id=>!!own(catalogue.skills,id),restore:item=>cargo.skillOfGemItem(item)??undefined,
    create:(id,level,grade)=>({def:catalogue.skills[id],level,rarity:grade,sockets:Array(rarity.get(grade)!.sockets).fill(null)})});
  const preview={need:plan.need,available:plan.available,barred:plan.barred,taken:plan.taken.map(item=>item.uid),returnSockets:plan.returnSockets.map(item=>item.uid),result:plan.result?packSkillGemPayload(plan.result):null,refusal:plan.refusal};
  const rows=state.board.rows,board:LiveInventoryBoard={w:state.board.w,h:state.board.h,...(rows?{open:(x:number,y:number)=>rows[y][x]==='#'}:{})};
  function grant(kind:'skill',inst:MergeSkill):void;
  function grant(kind:'support',inst:MergeSupport):void;
  function grant(kind:'skill'|'support',inst:MergeSkill|MergeSupport):void {
    const item=kind==='skill'?cargo.makeSkillGemItem(inst as MergeSkill):cargo.makeSupportGemItem(inst);
    if(ports.inventory.autoPlace(state.items,item,board)){events.push({kind:'meta-dirty'});return;}
    const locked=inst.locked?{locked:true}:{};
    worldDrops.push(kind==='skill'?{kind,gem:packSkillGemPayload(inst as MergeSkill),...locked}:{kind,gem:packSupportGemPayload(inst),...locked});
    events.push({kind:'world-drop-required',index:worldDrops.length-1},{kind:'text',offset:{x:0,y:0},message:'your pack is full — it falls at your feet',color:'#c08a68',size:12});
  }
  let refusal:string|undefined;
  const actions=new SkillMergeActions<null,ItemInstance,MergeSkill,MergeSupport>({nearFont:()=>conditions.nearFont as boolean,
    fail:(_seat,key,reason)=>{refusal=reason;events.push({kind:'refusal',key,reason});},markCharacterDirty:()=>events.push({kind:'character-dirty'}),
    mergePlan:()=>plan,sockets:item=>cargo.skillOfGemItem(item)?.sockets,remove:(_seat,item)=>ports.inventory.remove(state.items,item.uid),
    grantSkill:(_seat,inst)=>grant('skill',inst),grantSupport:(_seat,inst)=>grant('support',inst),announceMerge:(_seat,inst)=>{
      const numeral=empowermentNumeral(inst.empowermentRank??0),grade=rarity.get(inst.rarity!);need(grade,'unknown-merge-rarity');
      events.push({kind:'text',offset:{x:0,y:-40},message:inst.def.name+(numeral?' '+numeral:'')+' reforged — '+grade.label,color:grade.color,size:14});
    }});
  const accepted=actions.merge(null,request.skillId,request.rarity),changed=accepted||saved.nextUid!==ports.saved.nextUid;
  need(worldDrops.length<=64,'merge-delivery-limit');
  return{accepted,changed,needsSave:changed,preview,events,worldDrops,...(refusal?{refusal}:{}),...(changed?{request:{capability:'character-workshop/residence-diagnostic' as const,state,character:saved.character,nextUid:saved.nextUid}}:{})};
}
