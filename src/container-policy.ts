import {InventoryHost,type LiveInventoryItem,type InventoryFootprint,type LiveInventoryBoard} from './inventory-host.js';
import {containerBoardDimensions,containerBoardOpen,type ContainerBoard} from './container-layout.js';
import {finite,integer} from './validation.js';
export {ContainerLayout,containerBoardOpen,containerBoardDimensions,packContainerBoard,unpackContainerBoard} from './container-layout.js';
export type {ContainerBoard,ContainerBoardWire,ContainerRungShape} from './container-layout.js';
export {SeatRules,SeatGeometry,relicPowerActive,seatPowerOf,amplifySeatMods,relicNumeric,empowerRelicMods,relicUniqueValue} from './seat-rules.js';
export type {SeatRulePack,SeatAmplifierMode,SeatNeighbourhood,SeatModePort,RelicCapPort} from './seat-rules.js';

export interface ContainerItem extends LiveInventoryItem {uniqueId?:string}
export interface ContainerUnique {name:string;maxPerContainer?:number}
export function uniqueContainerLimit(info:ContainerUnique|undefined):number|undefined{
  const limit=info?.maxPerContainer;return limit!==undefined&&Number.isFinite(limit)?Math.max(0,Math.floor(limit)):undefined;
}
export function uniqueContainerRefusal<T extends ContainerItem>(held:readonly T[],item:T,info:ContainerUnique|undefined,replacing?:T):string|null{
  const limit=uniqueContainerLimit(info);if(limit===undefined)return null;let copies=0;
  for(const other of held)if(other!==item&&other!==replacing&&other.uniqueId===item.uniqueId)copies++;
  return copies>=limit?`Only ${limit} ${limit===1?'copy':'copies'} of ${info!.name} may be equipped.`:null;
}
export interface ContainerDefinition {
  label:string; accepts:{categories?:readonly string[];tags?:readonly string[]};levelGate?:boolean;accountStorage?:boolean;
}
export interface ContainerPorts<T> {
  footprint(item:T):InventoryFootprint;
  base(item:T):{category:string;tags:readonly string[]}|undefined;
  level(item:T):number;
  unique(item:T):ContainerUnique|undefined;
}
export interface ContainerLanding<T> {verdict:'place'|'swap'|'blocked';x:number;y:number;w:number;h:number;with?:T;why?:string}
export interface CarrySlice<T> {items:readonly T[];equipped:Readonly<Partial<Record<string,T>>>;containers:Readonly<Record<string,readonly T[]>>}
export type CarriedWhere={kind:'bag'}|{kind:'worn';slot:string}|{kind:'container';container:string};
export function findCarried<T extends LiveInventoryItem>(carry:CarrySlice<T>,uid:T['uid']):{item:T;where:CarriedWhere}|undefined{
  const bagged=carry.items.find(item=>item.uid===uid);if(bagged)return {item:bagged,where:{kind:'bag'}};
  for(const slot of Object.keys(carry.equipped)){const item=carry.equipped[slot];if(item?.uid===uid)return {item,where:{kind:'worn',slot}};}
  for(const container of Object.keys(carry.containers)){const item=carry.containers[container].find(it=>it.uid===uid);if(item)return {item,where:{kind:'container',container}};}
}
export function containerOriginOf<T extends LiveInventoryItem>(carry:CarrySlice<T>,uid:T['uid']):string{
  const found=findCarried(carry,uid);if(!found||found.where.kind==='bag')return 'bag';
  return found.where.kind==='worn'?found.where.slot:'c:'+found.where.container;
}
export const originContainerId=(origin:string):string|null=>origin.startsWith('c:')?origin.slice(2):null;

/** Synchronous eligibility/landing policy over live host-owned records. Pure
 * ports are explicit. Refusals and successful plans never transfer item bodies.
 * Registry order, account authorization and final commits remain with the host. */
export class ContainerPolicy<T extends ContainerItem> {
  readonly #ports:ContainerPorts<T>;
  readonly #grid:InventoryHost<T>;
  #occupied=new Uint8Array(0);
  #busy=false;
  constructor(ports:ContainerPorts<T>){
    for(const name of ['footprint','base','level','unique'] as const)if(typeof ports[name]!=='function')throw new Error(`Container ${name} port is required`);
    this.#ports={footprint:ports.footprint.bind(ports),base:ports.base.bind(ports),level:ports.level.bind(ports),unique:ports.unique.bind(ports)};
    this.#grid=new InventoryHost(item=>this.#ports.footprint(item));
  }
  get scratchBytes():number{return this.#occupied.byteLength+this.#grid.scratchBytes;}
  #run<R>(work:()=>R):R{if(this.#busy)throw new Error('Reentrant container operation');this.#busy=true;try{return work();}finally{this.#busy=false;}}
  #size(item:T):InventoryFootprint{
    const size=this.#ports.footprint(item);integer(size.w,1,'Container item width');integer(size.h,1,'Container item height');
    if(size.w>256||size.h>256||size.w*size.h>4096)throw new Error('Container item exceeds inventory bounds');return size;
  }
  #accepts(def:ContainerDefinition,item:T):boolean{
    const base=this.#ports.base(item);if(!base)return false;
    return !!(def.accepts.categories?.includes(base.category)||def.accepts.tags?.some(tag=>base.tags.includes(tag)));
  }
  accepts(def:ContainerDefinition,item:T):boolean{return this.#run(()=>this.#accepts(def,item));}
  #limit(item:T):number|undefined{
    return uniqueContainerLimit(this.#ports.unique(item));
  }
  uniqueLimit(item:T):number|undefined{return this.#run(()=>this.#limit(item));}
  #uniqueRefusal(held:readonly T[],item:T,replacing?:T):string|null{
    return uniqueContainerRefusal(held,item,this.#ports.unique(item),replacing);
  }
  uniqueRefusal(held:readonly T[],item:T,replacing?:T):string|null{return this.#run(()=>this.#uniqueRefusal(held,item,replacing));}
  #seatRefusal(def:ContainerDefinition,board:ContainerBoard|null,item:T,level:number):string|null{
    if(!board)return `the ${def.label} is not yours yet`;
    if(!this.#accepts(def,item))return `the ${def.label} does not take that`;
    if(def.levelGate!==false){const required=finite(this.#ports.level(item),'Item level requirement');if(finite(level,'Character level')<required)return `requires level ${required}`;}
    return null;
  }
  seatRefusal(def:ContainerDefinition,board:ContainerBoard|null,item:T,level:number):string|null{return this.#run(()=>this.#seatRefusal(def,board,item,level));}
  landing(def:ContainerDefinition,board:ContainerBoard|null,held:readonly T[],item:T,from:'bag'|'self'|'other',x:number,y:number,level:number,bag?:readonly T[],bagBoard?:LiveInventoryBoard):ContainerLanding<T>{
    return this.#run(()=>{
      const size=this.#size(item),base:ContainerLanding<T>={verdict:'blocked',x,y,w:size.w,h:size.h},refusal=this.#seatRefusal(def,board,item,level);
      if(refusal||!board)return {...base,why:refusal??undefined};
      if(from==='other')return {...base,why:'move it to the bag first'};
      const dims=containerBoardDimensions(board);
      if(this.#grid.canPlace(held,item,x,y,dims)){const why=this.#uniqueRefusal(held,item);return why?{...base,why}:{...base,verdict:'place'};}
      if(from==='self'){
        const why=this.#uniqueRefusal(held,item);if(why)return {...base,why};const other=this.#grid.swapBlocker(held,item,x,y,dims);
        return other?{...base,verdict:'swap',with:other}:base;
      }
      if(!def.accountStorage&&(!bag||!bagBoard||item.x===undefined||item.y===undefined))return base;
      if(!this.#grid.footprintOpen(dims,x,y,size.w,size.h))return base;
      // This original cross-board branch considers every occupant, including a
      // repeated UID. InventoryHost.overlapping intentionally has another law.
      let blocker:T|undefined;
      for(const other of held)if(other.x!==undefined&&other.y!==undefined){
        const shape=this.#size(other);
        if(other.x<x+size.w&&x<other.x+shape.w&&other.y<y+size.h&&y<other.y+shape.h){if(blocker)return base;blocker=other;}
      }
      if(!blocker)return base;const why=this.#uniqueRefusal(held,item,blocker);if(why)return {...base,why};
      if(def.accountStorage)return {...base,verdict:'swap',with:blocker};
      if(!this.#accepts(def,blocker))return base;
      return this.#grid.canPlace(bag!.filter(it=>it.uid!==item.uid),blocker,item.x!,item.y!,bagBoard!)?{...base,verdict:'swap',with:blocker}:base;
    });
  }
  /** Sequential first-survivor law; duplicate UIDs do not bypass occupancy.
   * The host decides where evicted items go. No body is lost or changed here. */
  misfits(board:ContainerBoard|null,held:readonly T[]):T[]{
    return this.#run(()=>{
      if(!board)return [...held];containerBoardDimensions(board);
      const count=board.w*board.h;if(this.#occupied.length<count)this.#occupied=new Uint8Array(count);const occupied=this.#occupied;occupied.fill(0,0,count);
      const out:T[]=[],placed:T[]=[];
      for(const item of held){
        if(this.#uniqueRefusal(placed,item)||item.x===undefined||item.y===undefined){out.push(item);continue;}
        if(!Number.isSafeInteger(item.x)||!Number.isSafeInteger(item.y))throw new Error('Container coordinates must be safe integers');
        const size=this.#size(item);let fits=true;
        for(let dy=0;dy<size.h&&fits;dy++)for(let dx=0;dx<size.w;dx++){
          const x=item.x+dx,y=item.y+dy;if(!containerBoardOpen(board,x,y)||occupied[y*board.w+x]){fits=false;break;}
        }
        if(!fits){out.push(item);continue;}placed.push(item);
        for(let dy=0;dy<size.h;dy++)for(let dx=0;dx<size.w;dx++)occupied[(item.y+dy)*board.w+item.x+dx]=1;
      }
      return out;
    });
  }
}
