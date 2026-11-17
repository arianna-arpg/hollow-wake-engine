import {VestigeInlays} from './vestige-inlays.js';
import {matchEpitaph} from './vestige-rules.js';
import {InventoryHost} from './inventory-host.js';
import {EquipmentActions,equipOnBoard,unequipOnBoard,equipmentTierLevel,type EquipmentSlots} from './equipment-actions.js';
import type {ContainerDefinition,ContainerBoard} from './container-policy.js';
import {CraftingOperations,type SalvageLane,type SalvageCategory} from './crafting-actions.js';
import {createGemCargo,type GemSkill,type GemSupport} from './gem-residence.js';
import {Random} from './random.js';
import type {InventoryDataDefinitions} from './inventory-data.js';
import type {CharacterCommandDraft} from './character-command-types.js';
import type {CraftLore} from './crafting.js';
import type {ItemInstance} from './item-types.js';
import type {RandomState} from './types.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionRecord as record,sessionText as text,sessionInteger as integer,sessionBoolean as bool} from './session-json.js';

export interface CharacterInventoryEdit extends CharacterCommandDraft {craftLore:CraftLore;random:RandomState}
export interface CharacterInventoryAccess {salvage:boolean;oracle:boolean;bench:boolean;counter:boolean;study:boolean}
export type CharacterEditEvent={kind:string;[key:string]:unknown};
export interface CharacterContainerRules {
  definitions:readonly (ContainerDefinition&{id:string})[];
  board(id:string,features:readonly string[]):ContainerBoard|null;
}
export function characterInlays(defs:InventoryDataDefinitions){
  const pack=defs.crafting.items.pack;
  return new VestigeInlays({vestige:(id:string)=>pack.vestiges[id],word:(item:ItemInstance,sockets:readonly(string|null)[])=>matchEpitaph(pack.epitaphs,item.rarity,pack.bases[item.baseId].category,sockets)});
}
/** Preparation only: all custody, wallet and random writes belong to this detached
 * candidate. The owner discards the entire candidate on refusal. */
export function editCharacterInventory(defs:InventoryDataDefinitions,equipment:EquipmentSlots,input:CharacterInventoryEdit,
  raw:unknown,rawAccess:unknown,features:readonly string[],containers?:CharacterContainerRules,canRetireRelics=false){
  const request=copySessionJSON(raw);record(request);text(request.op);
  const access=copySessionJSON(rawAccess);fields(access,['salvage','oracle','bench','counter','study']);for(const value of Object.values(access))bool(value);
  const draft=copySessionJSON(input) as unknown as CharacterInventoryEdit,state=draft.state,events:CharacterEditEvent[]=[];
  const grid=new InventoryHost<ItemInstance>(item=>defs.crafting.items.pack.bases[item.baseId]);
  const b=state.board,board={w:b.w,h:b.h,...(b.rows?{open:(x:number,y:number)=>b.rows![y][x]==='#'}:{})};
  let refusal:string|undefined;
  if(request.op==='equip'||request.op==='unequip'){
    const equip=request.op==='equip';fields(request,equip?['op','uid','slot']:['op','uid','slot','x','y']);integer(request.uid,1);
    if(!equip||request.slot!==undefined)text(request.slot);
    if(request.x!==undefined||request.y!==undefined){integer(request.x);integer(request.y);}
    if(!equip&&state.equipped[request.slot as string]?.uid!==request.uid)return{accepted:false,events:[],refusal:'stale-equipment'};
    const action=equip?equipOnBoard(grid,{slots:()=>equipment.slots(),slot:id=>equipment.slot(id),
      base:item=>defs.crafting.items.pack.bases[item.baseId],level:item=>{
        const category=defs.crafting.items.pack.bases[item.baseId].category;
        return category==='relic'?1:equipmentTierLevel(item.tier,defs.crafting.items.pack.config.tierBreaks);
      }},{carry:state,bagBoard:board,level:draft.character.level,drop:item=>{state.overflow.push(item);}},request.uid,request.slot as string|undefined)
      :unequipOnBoard(grid,{carry:state,bagBoard:board},request.slot as string,request.x as number|undefined,request.y as number|undefined);
    if(!action.changed)return{accepted:false,events:[],refusal:action.refusal?.reason??'unchanged-equipment'};
    events.push({kind:'recalculate'},{kind:'dirty'});
  }else if(request.op==='move'||request.op==='place'||request.op==='take'){
    fields(request,request.op==='move'?['op','uid','x','y']:['op','uid','container','x','y']);integer(request.uid,1);
    if(request.x!==undefined||request.y!==undefined||request.op==='move'){integer(request.x);integer(request.y);}
    const pack=defs.crafting.items.pack,actions=new EquipmentActions<ItemInstance>({slots:()=>equipment.slots(),slot:id=>equipment.slot(id),
      footprint:item=>pack.bases[item.baseId],base:item=>pack.bases[item.baseId],unique:item=>item.uniqueId?pack.uniques[item.uniqueId]:undefined,
      level:item=>pack.bases[item.baseId].category==='relic'?1:equipmentTierLevel(item.tier,pack.config.tierBreaks)});
    if(request.op==='move')need(actions.move(state.items,request.uid,board,request.x as number,request.y as number),'inventory-placement-refused');
    else{
      text(request.container);const definition=containers?.definitions.find(row=>row.id===request.container);need(definition&&!definition.accountStorage,'external-container-authority-required');
      const context={carry:{...state,containers:draft.character.containers},bagBoard:board,level:draft.character.level,drop:(item:ItemInstance)=>{state.overflow.push(item);}};
      const result=request.op==='place'?actions.place({...context,id:request.container,definition,board:containers!.board(request.container,features)},request.uid,request.x as number|undefined,request.y as number|undefined):
        actions.take(context,request.container,request.uid,request.x as number|undefined,request.y as number|undefined);
      need(result.changed,result.refusal?.reason??'container-placement-refused');events.push({kind:'recalculate'});
    }
    events.push({kind:'dirty'});
   }else if(request.op==='inlay'){
    fields(request,['op','uid','id','socket']);integer(request.uid,1);text(request.id);if(request.socket!==undefined)integer(request.socket);
    const result=characterInlays(defs).inlay(state,request.uid,request.socket as number|undefined,request.id,{
      crumbled:id=>events.push({kind:'vestige-crumbled',id}),inlaid:def=>events.push({kind:'vestige-inlaid',id:def.id}),
      awakened:word=>events.push({kind:'epitaph-awakened',id:word.id}),recalculate:()=>events.push({kind:'recalculate'}),dirty:()=>events.push({kind:'dirty'})});
    need(result.changed,result.changed?'':'reason'in result?result.reason:'inlay-refused');
  }else if(request.op==='recover'){
    fields(request,['op','uid']);integer(request.uid,1);const index=state.overflow.findIndex(item=>item.uid===request.uid);
    if(index<0||!grid.autoPlace(state.items,state.overflow[index],board))return{accepted:false,events:[],refusal:'recovery-unavailable'};
    state.overflow.splice(index,1);events.push({kind:'dirty'});
  }else{
    const args:Record<string,string[]>={craft:['uid','affixId','score'],socket:['uid'],reroll:['uid','index','score'],salvage:['uid','lane'],'salvage-bulk':['category','rarity','lane'],lock:['uid','on']};
    need(Object.hasOwn(args,request.op),'unknown-inventory-command');fields(request,['op',...args[request.op]]);
    if(request.op!=='salvage-bulk')integer(request.uid,1);
    if(request.op==='craft')text(request.affixId);
    if(request.op==='craft'||request.op==='reroll')need(typeof request.score==='number'&&Number.isFinite(request.score),'invalid-score');
    if(request.op==='reroll')integer(request.index);if(request.op==='lock')bool(request.on);
    if(request.lane!==undefined)need(request.lane==='break'||request.lane==='sell','invalid-lane');
    if(request.op==='salvage-bulk'){need(['item','skill','support'].includes(request.category as string),'invalid-category');
      if(request.rarity!==undefined){text(request.rarity);need((request.category==='skill'?Object.keys(defs.crafting.rules.ports.gemEssences):['common','magic','rare','unique']).includes(request.rarity),'invalid-rarity');}}
    const random=Random.restore(draft.random),skills=defs.skills;
    type D=ReturnType<typeof skills.skill>;type U=ReturnType<typeof skills.support>;
    const cargo=createGemCargo({skill:(id:string)=>{try{return skills.skill(id);}catch{return undefined;}},support:(id:string)=>{try{return skills.support(id);}catch{return undefined;}},
      hasForm:()=>true,makeSkill:(def:D,level:number,sockets:number):GemSkill<D,U>=>({def,level,sockets:Array<GemSupport<U>|null>(sockets).fill(null)}),
      validTreeNodes:(def,ids,level,inst)=>skills.tree(def.id).restore(ids,level,inst),nextUid:()=>{integer(draft.nextUid,1,Number.MAX_SAFE_INTEGER-1);return draft.nextUid++;},
      bagWidth:()=>b.w,bagHeight:()=>b.h,itemGridSize:(item:ItemInstance)=>defs.crafting.items.pack.bases[item.baseId]});
    const actions=new CraftingOperations(defs.crafting.rules,{
      ...(canRetireRelics?{canRetireRelics:()=>true,retireRelic:(_ctx:null,item:ItemInstance)=>events.push({kind:'retire-relic',item:copySessionJSON(item)})}:{}),
      carry:()=>state,lore:()=>draft.craftLore,learned:study=>{events.push({kind:'craft-study',study});},studyChanged:()=>{},
      hasFeature:id=>features.includes(id),progression:()=>access.study as boolean,reach:(_ctx:null,station)=>access[station] as boolean,
      nearBench:()=>access.bench as boolean,nearCounter:()=>access.counter as boolean,
      bagItem:(_ctx:null,uid)=>state.items.find(item=>item.uid===uid),findCarried:(_ctx:null,uid)=>state.items.find(item=>item.uid===uid)??Object.values(state.equipped).find(item=>item.uid===uid),
      remove:(items,uid)=>{grid.remove(items,uid);},spend:(_ctx:null,cost)=>{const have=state.essences[cost.essence]??0;if(have<cost.count){refusal='insufficient-essence';return false;}state.essences[cost.essence]=have-cost.count;return true;},
      grant:(_ctx:null,gain)=>{state.essences[gain.essence]=(state.essences[gain.essence]??0)+gain.count;},
      random:()=>{integer(random.draws,0,Number.MAX_SAFE_INTEGER-1);return random.next();},recalc:()=>events.push({kind:'recalculate'}),dirty:()=>events.push({kind:'dirty'}),
      refuse:(_ctx:null,reason)=>{refusal=reason;},cue:(_ctx:null,cue)=>events.push({kind:'craft-cue',cue}),
      skill:item=>cargo.skillOfGemItem(item),support:item=>cargo.supportOfGemItem(item),skillPayload:item=>item.gem?.kind==='skill'?item.gem:null,
      grantSupport:(_ctx:null,support)=>{const item=cargo.makeSupportGemItem(support);if(!grid.autoPlace(state.items,item,board))state.overflow.push(item);},
      memoryKind:item=>Object.hasOwn(defs.memoryKinds,item.baseId)?defs.memoryKinds[item.baseId]:null,
    });
    const uid=request.uid as number;
    switch(request.op){
      case 'craft':actions.craftAffix(null,uid,request.affixId as string,request.score as number);break;
      case 'socket':actions.craftSocket(null,uid);break;
      case 'reroll':actions.rerollAffix(null,uid,request.index as number,request.score as number);break;
      case 'salvage':actions.salvageItem(null,uid,request.lane as SalvageLane|undefined);break;
      case 'salvage-bulk':actions.salvageBulk(null,request.category as SalvageCategory,request.rarity as string|undefined,request.lane as SalvageLane|undefined);break;
      case 'lock':actions.salvageLockSet(null,uid,request.on as boolean);break;
    }
    draft.random=random.snapshot();
  }
  const changed=JSON.stringify(draft)!==JSON.stringify(input);
  return refusal||!changed?{accepted:false,events:[],refusal:refusal??'unchanged-inventory'}:{accepted:true,events,draft};
}
