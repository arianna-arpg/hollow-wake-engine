import {finite,integer} from './validation.js';
import type {Modifier} from './types.js';
import type {InventoryFootprint,LiveInventoryItem} from './inventory-host.js';
import {containerBoardDimensions,containerBoardOpen,type ContainerBoard} from './container-layout.js';

export type SeatAmplifierMode='outward'|'solitude'|'communion';
export type SeatModePort=(stat:string)=>SeatAmplifierMode|undefined;
export type RelicCapPort=(stat:string)=>number|undefined;
export function seatPowerOf(mods:readonly Modifier[],mode:SeatAmplifierMode,modeOf:SeatModePort):number{
  let value=0;for(const mod of mods)if(mod.kind==='flat'&&modeOf(mod.stat)===mode)value+=finite(mod.value,'Seat power');
  return finite(value,'Total seat power');
}
/** Pure live ports avoid rebuilding an immutable pack just to sample one line. */
export function amplifySeatMods<M extends Modifier>(mods:M[],factor:number,modeOf:SeatModePort):M[]{
  finite(factor,'Seat factor');if(factor===1&&!mods.some(mod=>modeOf(mod.stat)!==undefined))return mods;
  const out:M[]=[];for(const mod of mods)if(modeOf(mod.stat)===undefined)out.push(factor===1?mod:{...mod,value:finite(mod.value*factor,'Amplified line')});return out;
}
type NumericLine=Pick<Modifier,'stat'|'kind'|'value'|'fromStat'>;
const eligible=(mod:NumericLine)=> (mod.kind==='flat'||mod.kind==='increased')&&!mod.fromStat&&Number.isFinite(mod.value)&&mod.value>0;
function readCap(stat:string,capOf:RelicCapPort):number|undefined{
  const cap=capOf(stat);if(cap!==undefined&&cap!==Infinity&&(!Number.isFinite(cap)||cap<0))throw new Error('Relic cap must be nonnegative or unbounded');return cap;
}
export function relicNumeric(mod:NumericLine,capOf:RelicCapPort):boolean{return !!eligible(mod)&&readCap(mod.stat,capOf)!==undefined;}
export function empowerRelicMods<M extends Modifier>(mods:readonly M[],power:number,seatFactor:number,capOf:RelicCapPort):M[]{
  const factor=finite((1+Math.max(0,finite(power,'Relic power')))*Math.max(0,finite(seatFactor,'Seat factor')),'Relic factor'),out:M[]=[];
  for(const mod of mods)if(!mod.stat.startsWith('seatPower_')){
    const cap=eligible(mod)?readCap(mod.stat,capOf):undefined;
    out.push(cap!==undefined?{...mod,value:finite(Math.min(cap,mod.value*factor),'Empowered line')}:mod);
  }
  return out;
}
export function relicUniqueValue(mod:NumericLine,baseline:number,capOf:RelicCapPort):number{
  if(finite(baseline,'Relic baseline')<0)throw new Error('Relic baseline must be nonnegative');
  return relicNumeric(mod,capOf)?finite(mod.value*baseline,'Relic unique value'):mod.value;
}
export interface SeatRulePack {
  amplifiers: readonly {stat:string;mode:SeatAmplifierMode}[];
  /** null explicitly means uncapped; JSON Infinity would silently become null. */
  relicCaps: readonly {stat:string;cap:number|null}[];
  relicBaseline: number;
}
export class SeatRules {
  readonly #modes=new Map<string,SeatAmplifierMode>();
  readonly #caps=new Map<string,number>();
  readonly #modeOf:SeatModePort=stat=>this.#modes.get(stat);
  readonly #capOf:RelicCapPort=stat=>this.#caps.get(stat);
  readonly #baseline:number;
  constructor(pack:SeatRulePack){
    for(const row of pack.amplifiers){
      if(typeof row.stat!=='string'||!row.stat||this.#modes.has(row.stat)||!['outward','solitude','communion'].includes(row.mode))throw new Error('Invalid or duplicate seat amplifier');
      this.#modes.set(row.stat,row.mode);
    }
    for(const row of pack.relicCaps){
      if(typeof row.stat!=='string'||!row.stat||this.#caps.has(row.stat))throw new Error('Invalid or duplicate relic cap');
      if(row.cap!==null&&(finite(row.cap,'Relic cap')<0))throw new Error('Relic cap must be nonnegative');
      this.#caps.set(row.stat,row.cap??Infinity);
    }
    this.#baseline=finite(pack.relicBaseline,'Relic baseline');if(this.#baseline<0)throw new Error('Relic baseline must be nonnegative');
    Object.freeze(this);
  }
  mode(stat:string): SeatAmplifierMode|undefined {return this.#modes.get(stat);}
  power(mods:readonly Modifier[],mode:SeatAmplifierMode): number {
    return seatPowerOf(mods,mode,this.#modeOf);
  }
  /** Compatibility ownership: unchanged arrays/lines retain their identities. */
  amplify<M extends Modifier>(mods:M[],factor:number): M[] {
    return amplifySeatMods(mods,factor,this.#modeOf);
  }
  numeric(mod:Pick<Modifier,'stat'|'kind'|'value'|'fromStat'>): boolean {
    return relicNumeric(mod,this.#capOf);
  }
  empower<M extends Modifier>(mods:readonly M[],power:number,seatFactor=1): M[] {
    return empowerRelicMods(mods,power,seatFactor,this.#capOf);
  }
  uniqueValue(mod:Pick<Modifier,'stat'|'kind'|'value'|'fromStat'>): number {
    return relicUniqueValue(mod,this.#baseline,this.#capOf);
  }
}
export const relicPowerActive=(suppressed:boolean|undefined,enabled=true): boolean=>enabled&&!suppressed;
export interface SeatNeighbourhood<T> {pieces:T[];empty:number}
const DX=[1,-1,0,0],DY=[0,0,1,-1];

/** Per-operation geometry over host-owned pieces. The only retained scratch is
 * bounded integer occupancy; no item, modifier or neighbourhood survives a call.
 * Pure ports may be sampled once per object instead of once per touching edge. */
export class SeatGeometry<T extends LiveInventoryItem, M extends Modifier = Modifier> {
  #occupied=new Int32Array(0);
  #busy=false;
  constructor(private readonly sizeOf:(item:T)=>InventoryFootprint,
    private readonly powerOf:(mods:readonly M[],mode:SeatAmplifierMode)=>number){
    if(typeof sizeOf!=='function'||typeof powerOf!=='function')throw new Error('Seat footprint and raw power ports are required');
  }
  get scratchBytes():number {return this.#occupied.byteLength;}
  #run<R>(board:ContainerBoard,work:()=>R):R{
    if(this.#busy)throw new Error('Reentrant seat operation');this.#busy=true;
    try{containerBoardDimensions(board);return work();}finally{this.#busy=false;}
  }
  #hood(board:ContainerBoard,seated:readonly T[]):Map<T,SeatNeighbourhood<T>>{
    const count=board.w*board.h;if(this.#occupied.length<count)this.#occupied=new Int32Array(count);
    const occupied=this.#occupied;occupied.fill(0,0,count);const shapes=new Map<T,InventoryFootprint>();
    for(let i=0;i<seated.length;i++){
      const item=seated[i];if(item.x===undefined||item.y===undefined)continue;
      if(!Number.isSafeInteger(item.x)||!Number.isSafeInteger(item.y))throw new Error('Seat coordinates must be safe integers');
      let shape=shapes.get(item);
      if(!shape){const value=this.sizeOf(item);integer(value.w,1,'Seat width');integer(value.h,1,'Seat height');if(value.w>256||value.h>256||value.w*value.h>4096)throw new Error('Seat footprint exceeds inventory bounds');shape={w:value.w,h:value.h};shapes.set(item,shape);}
      for(let dy=0;dy<shape.h;dy++)for(let dx=0;dx<shape.w;dx++){
        const x=item.x+dx,y=item.y+dy;if(containerBoardOpen(board,x,y))occupied[y*board.w+x]=i+1;
      }
    }
    const out=new Map<T,SeatNeighbourhood<T>>();
    for(const item of seated){
      const touching=new Set<T>();let empty=0;const shape=shapes.get(item);
      if(shape)for(let cy=0;cy<shape.h;cy++)for(let cx=0;cx<shape.w;cx++)for(let dir=0;dir<4;dir++){
        const x=item.x!+cx+DX[dir],y=item.y!+cy+DY[dir];if(!containerBoardOpen(board,x,y))continue;
        const index=occupied[y*board.w+x],other=index?seated[index-1]:undefined;
        if(other===item)continue;if(other)touching.add(other);else empty++;
      }
      out.set(item,{pieces:[...touching],empty});
    }
    return out;
  }
  neighbourhood(board:ContainerBoard,seated:readonly T[]):Map<T,SeatNeighbourhood<T>>{
    return this.#run(board,()=>this.#hood(board,seated));
  }
  amplification(board:ContainerBoard,seated:readonly T[],modsOf:(item:T)=>readonly M[]):Map<T,number>{
    return this.#run(board,()=>{
      const hood=this.#hood(board,seated),powers=new Map<T,readonly [number,number,number]>(),out=new Map<T,number>();
      for(const item of seated)if(!powers.has(item)){const mods=modsOf(item);powers.set(item,[finite(this.powerOf(mods,'outward'),'Outward power'),finite(this.powerOf(mods,'solitude'),'Solitude power'),finite(this.powerOf(mods,'communion'),'Communion power')]);}
      for(const item of seated){
        const neighbours=hood.get(item)!,own=powers.get(item)!;let factor=1;
        for(const other of neighbours.pieces)factor+=powers.get(other)![0];
        factor+=own[1]*neighbours.empty;factor+=own[2]*neighbours.pieces.length;
        out.set(item,Math.max(0,finite(factor,'Seat amplification')));
      }
      return out;
    });
  }
}
