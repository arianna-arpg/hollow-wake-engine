import {InventoryHost,type LiveInventoryBoard} from './inventory-host.js';
import {ContainerPolicy,type ContainerItem,type ContainerPorts,type ContainerDefinition} from './container-policy.js';
import {containerBoardDimensions,type ContainerBoard} from './container-layout.js';
import {copy,freeze,finite,integer} from './validation.js';

/** Tier requirement over explicit content; category exceptions belong to the
 * supplied level port. Invalid tiers/tables fail rather than become executable. */
export function equipmentTierLevel(tier:number,breaks:readonly number[]):number{
  integer(tier,1,'Equipment tier');if(!breaks.length)throw new Error('Equipment tier table is empty');
  return integer(breaks[Math.min(tier,breaks.length)-1],1,'Equipment level requirement');
}

export interface EquipmentSlot {id:string;label?:string;accepts:readonly string[];enabled:boolean}
export interface EquipmentSlotPack {schemaVersion:1;capability:'equipment-slots/v1';contentId:string;slots:readonly EquipmentSlot[]}
/** Immutable, ordered slot definitions; lookup never reads object prototypes. */
export class EquipmentSlots {
  readonly pack:EquipmentSlotPack;
  readonly #byId=new Map<string,EquipmentSlot>();
  constructor(input:EquipmentSlotPack){
    const pack=copy(input);
    if(!pack||pack.schemaVersion!==1||pack.capability!=='equipment-slots/v1'||typeof pack.contentId!=='string'||!pack.contentId||!Array.isArray(pack.slots)||pack.slots.length>128)throw new Error('Invalid equipment slot pack');
    for(const slot of pack.slots){
      if(!slot||typeof slot.id!=='string'||!slot.id||this.#byId.has(slot.id)||typeof slot.enabled!=='boolean'||(slot.label!==undefined&&typeof slot.label!=='string')||!Array.isArray(slot.accepts)||!slot.accepts.length||slot.accepts.some((id:unknown)=>typeof id!=='string'||!id)||new Set(slot.accepts).size!==slot.accepts.length)throw new Error('Invalid or duplicate equipment slot');
      this.#byId.set(slot.id,slot);
    }
    this.pack=freeze(pack);Object.freeze(this);
  }
  slots():readonly EquipmentSlot[]{return this.pack.slots;}
  slot(id:string):EquipmentSlot|undefined{return this.#byId.get(id);}
}
export interface EquipmentCarry<T> {items:T[];equipped:Partial<Record<string,T>>;containers:Record<string,T[]>}
export interface EquipmentContext<T> {
  carry:EquipmentCarry<T>;level:number;bagBoard:LiveInventoryBoard;
  /** Nonthrowing transfer to host ground/recovery ownership. Invoked at the
   * original commit point; must not reenter or mutate this action's records. */
  drop(item:T):void;
}
export interface ContainerActionContext<T> extends EquipmentContext<T> {id:string;definition:ContainerDefinition|undefined;board:ContainerBoard|null}
export interface EquipmentPorts<T> extends ContainerPorts<T> {slots():readonly EquipmentSlot[];slot(id:string):EquipmentSlot|undefined}
export type EquipmentActionResult<T>=Readonly<{changed:boolean;item?:T;refusal?:Readonly<{key:string;reason:string}>}>;
const unchanged=Object.freeze({changed:false});
const refused=(key:string,reason:string)=>({changed:false,refusal:{key,reason}});
const own=<T>(record:Partial<Record<string,T>>,key:string):T|undefined=>Object.hasOwn(record,key)?record[key]:undefined;
const put=<T>(record:Partial<Record<string,T>>,key:string,value:T)=>{Object.defineProperty(record,key,{value,enumerable:true,configurable:true,writable:true});};
type Cell={x:number;y:number};

type WearContext<T>=Omit<EquipmentContext<T>,'carry'>&{carry:Pick<EquipmentCarry<T>,'items'|'equipped'>};
type WearPorts<T>=Pick<EquipmentPorts<T>,'slots'|'slot'|'level'> & {base(item:T):{category:string}|undefined};
function land<T extends ContainerItem>(items:T[],item:T,cell:Cell):void{
  item.x=cell.x;item.y=cell.y;if(!items.some(other=>other.uid===item.uid))items.push(item);
}
function dropPort<T>(ctx:WearContext<T>,needed:boolean){
  if(!needed)return;
  const port=ctx.drop;
  if(typeof port!=='function')throw new Error('Displaced equipment requires a host ownership sink');
  return port.bind(ctx);
}

/** The synchronous commit shared by live host actions and isolated session
 * drafts. Ports must be non-reentrant. Plan displacement before moving any UID. */
export function equipOnBoard<T extends ContainerItem>(grid:InventoryHost<T>,ports:WearPorts<T>,ctx:WearContext<T>,
  uid:T['uid'],requested?:string):EquipmentActionResult<T>{
  const {items,equipped}=ctx.carry;
  const from=Object.keys(equipped).find(id=>equipped[id]?.uid===uid);
  const item=items.find(other=>other.uid===uid)??(from?own(equipped,from):undefined);
  if(!item)return unchanged;
  const base=ports.base(item);if(!base)return unchanged;
  let slot=requested?ports.slot(requested):undefined;
  if(!slot?.enabled||!slot.accepts.includes(base.category)){
    slot=undefined;
    for(const option of ports.slots()){
      if(!option.enabled||!option.accepts.includes(base.category))continue;
      slot??=option;
      if(!own(equipped,option.id)){slot=option;break;}
    }
  }
  if(!slot||from===slot.id)return unchanged;
  const required=finite(ports.level(item),'Equipment level requirement');
  if(finite(ctx.level,'Character level')<required)return refused('equip:'+uid,'requires level '+required);
  const previous=own(equipped,slot.id);
  let back:EquipmentSlot|undefined,cell:Cell|null=null;
  if(previous){
    const source=from?ports.slot(from):undefined,previousBase=ports.base(previous);
    if(source?.enabled&&previousBase&&source.accepts.includes(previousBase.category)&&(source.id===from||!own(equipped,source.id)))back=source;
    else cell=grid.firstFit(from?items:items.filter(other=>other!==item),previous,ctx.bagBoard);
  }
  const drop=dropPort(ctx,!!previous&&!back&&!cell);
  if(from)delete equipped[from];else grid.remove(items,uid);
  put(equipped,slot.id,item);delete item.x;delete item.y;
  if(previous){
    if(back)put(equipped,back.id,previous);
    else if(cell)land(items,previous,cell);
    else drop!(previous);
  }
  return {changed:true,item};
}

export function unequipOnBoard<T extends ContainerItem>(grid:InventoryHost<T>,ctx:Pick<WearContext<T>,'carry'|'bagBoard'>,
  slot:string,x?:number,y?:number):EquipmentActionResult<T>{
  const carry=ctx.carry;
  const item=own(carry.equipped,slot);if(!item)return unchanged;
  const board=ctx.bagBoard;
  const exact=x!==undefined&&y!==undefined;
  const cell=exact?(grid.canPlace(carry.items,item,x,y,board)?{x,y}:null):grid.firstFit(carry.items,item,board);
  if(!cell)return refused('unequip:'+slot,exact?'no room there':'no room in the bag');
  land(carry.items,item,cell);delete carry.equipped[slot];return {changed:true,item};
}

/** Live host-owned equipment and container commits. Pure reads plan all
 * geometry before writes; no item payload copies or retained carry records.
 * Original array ordering on refused container operations is intentional. */
export class EquipmentActions<T extends ContainerItem> {
  readonly #ports:EquipmentPorts<T>;
  readonly #grid:InventoryHost<T>;
  readonly #containers:ContainerPolicy<T>;
  #busy=false;
  constructor(ports:EquipmentPorts<T>){
    for(const name of ['slots','slot','footprint','base','level','unique'] as const)if(typeof ports[name]!=='function')throw new Error(`Equipment ${name} port is required`);
    this.#ports={slots:ports.slots.bind(ports),slot:ports.slot.bind(ports),footprint:ports.footprint.bind(ports),base:ports.base.bind(ports),level:ports.level.bind(ports),unique:ports.unique.bind(ports)};
    this.#grid=new InventoryHost(this.#ports.footprint);this.#containers=new ContainerPolicy(this.#ports);
  }
  get scratchBytes():number{return this.#grid.scratchBytes+this.#containers.scratchBytes;}
  #run<R>(work:()=>R):R{if(this.#busy)throw new Error('Reentrant equipment action');this.#busy=true;try{return work();}finally{this.#busy=false;}}
  #destination(items:readonly T[],item:T,board:LiveInventoryBoard,x?:number,y?:number):Cell|null{
    return x!==undefined&&y!==undefined?(this.#grid.canPlace(items,item,x,y,board)?{x,y}:null):this.#grid.firstFit(items,item,board);
  }
  equip(ctx:EquipmentContext<T>,uid:T['uid'],requested?:string):EquipmentActionResult<T>{
    return this.#run(()=>equipOnBoard(this.#grid,this.#ports,ctx,uid,requested));
  }
  unequip(ctx:EquipmentContext<T>,slot:string,x?:number,y?:number):EquipmentActionResult<T>{
    return this.#run(()=>unequipOnBoard(this.#grid,ctx,slot,x,y));
  }
  move(items:T[],uid:T['uid'],board:LiveInventoryBoard,x:number,y:number):boolean{return this.#run(()=>{
    const item=items.find(item=>item.uid===uid);if(!item)return false;
    if(this.#grid.canPlace(items,item,x,y,board)){item.x=x;item.y=y;return true;}
    const other=this.#grid.swapBlocker(items,item,x,y,board);if(!other||item.x===undefined||item.y===undefined)return false;
    const fromX=item.x,fromY=item.y;item.x=x;item.y=y;other.x=fromX;other.y=fromY;return true;
  });}
  place(ctx:ContainerActionContext<T>,uid:T['uid'],x?:number,y?:number):EquipmentActionResult<T>{return this.#run(()=>{
    const {carry,definition:def}=ctx;if(!def)return unchanged;const item=carry.items.find(item=>item.uid===uid);if(!item)return unchanged;
    const board=ctx.board,reason=this.#containers.seatRefusal(def,board,item,ctx.level);if(reason||!board)return refused('seat:'+uid,reason??'refused');
    const existing=own(carry.containers,ctx.id),held=existing??[],dims=containerBoardDimensions(board),from={x:item.x,y:item.y};
    let cell:Cell|null,displaced:T|undefined,bagReturn:Cell|null=null,restore:Cell|null=null;
    const exact=x!==undefined&&y!==undefined;
    if(exact){const landing=this.#containers.landing(def,board,held,item,'bag',x,y,ctx.level,carry.items,ctx.bagBoard);
      if(landing.verdict==='blocked'){if(!existing)put(carry.containers,ctx.id,held);return refused('seat:'+uid,landing.why??'no room there');}
      displaced=landing.with;cell={x,y};
      if(displaced){const rest=carry.items.filter(other=>other!==item);bagReturn=from.x!==undefined&&from.y!==undefined?this.#destination(rest,displaced,ctx.bagBoard,from.x,from.y):null;bagReturn??=this.#grid.firstFit(rest,displaced,ctx.bagBoard);}
    }else{
      const unique=this.#containers.uniqueRefusal(held,item);if(unique){if(!existing)put(carry.containers,ctx.id,held);return refused('seat:'+uid,unique);}
      cell=this.#grid.firstFit(held,item,dims);
      if(!cell){const rest=carry.items.filter(other=>other!==item);restore=from.x!==undefined&&from.y!==undefined?this.#destination(rest,item,ctx.bagBoard,from.x,from.y):null;restore??=this.#grid.firstFit(rest,item,ctx.bagBoard);}
    }
    if(!cell&&!restore)throw new Error('Cannot restore source bag placement');
    const drop=dropPort(ctx,!!displaced&&!bagReturn);if(!existing)put(carry.containers,ctx.id,held);this.#grid.remove(carry.items,uid);
    if(!cell){if(restore)land(carry.items,item,restore);return refused('seat:'+uid,`no open seat in the ${def.label}`);}
    if(displaced){held.splice(held.indexOf(displaced),1);delete displaced.x;delete displaced.y;if(bagReturn)land(carry.items,displaced,bagReturn);else drop!(displaced);}
    land(held,item,cell);return {changed:true,item};
  });}
  take(ctx:EquipmentContext<T>,container:string,uid:T['uid'],x?:number,y?:number):EquipmentActionResult<T>{return this.#run(()=>{
    const held=own(ctx.carry.containers,container),item=held?.find(item=>item.uid===uid);if(!held||!item)return unchanged;
    const cell=this.#destination(ctx.carry.items,item,ctx.bagBoard,x,y),index=held.indexOf(item);held.splice(index,1);
    if(!cell){held.push(item);return refused('unseat:'+uid,x!==undefined?'no room there':'no room in the bag');}
    land(ctx.carry.items,item,cell);if(!held.length)delete ctx.carry.containers[container];return {changed:true,item};
  });}
}
