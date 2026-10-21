import {InventoryHost,type LiveInventoryBoard,type LiveInventoryItem,type InventoryFootprint} from './inventory-host.js';
import {StashPolicy,type StashDefinition,type StashState,type StashCell,type StashEntry} from './stash-policy.js';
import {finite,integer} from './validation.js';

export interface RelicItem extends LiveInventoryItem {uid:number;relicKey?:string}
export interface RelicState<T> {
  items:T[];seated:string[];carried:string[];released:string[];
  enabled:boolean;rank:number;invested:number;stash:StashState;
}
export interface RelicProgression {costBase:number;maxRank:number;powerPerRank:number;xpPenaltyPerCell:number}
export interface RelicPurse {credits:number}
export interface RelicCarry<T> {items:T[];equipped:Readonly<Partial<Record<string,T>>>;containers:Record<string,readonly T[]>}
export interface RelicLoot<T> {kind:string;item?:T}
export interface RelicPorts<T> {
  isRelic(item:T):boolean;
  footprint(item:T):InventoryFootprint;
  nextUid():number;
  bumpUidFloor(seen:number):void;
  /** Deep clone the selected opaque bodies, preserving their payload and aliases.
   * Called only on restore. The runtime never serializes host item payloads. */
  cloneItems(items:readonly T[]):T[];
  stash():StashDefinition<T>;
  bagBoard():LiveInventoryBoard;
  progression():RelicProgression;
}
const identity=(item:RelicItem,scope:string):string=>item.relicKey??`legacy:${scope}:${item.uid}`;

/** Canonical account custody over explicit host-owned state. No account, body,
 * key index or content registry is retained between calls. Mutating operations
 * are synchronous; ports must not throw or reenter after a transfer begins.
 * Authorization, durable saves and actor effects remain host responsibilities. */
export class RelicCustody<T extends RelicItem> {
  readonly #ports:RelicPorts<T>;
  readonly #storage:StashPolicy<T>;
  readonly #bag:InventoryHost<T>;
  #busy=false;
  constructor(ports:RelicPorts<T>){
    const bind=<K extends keyof RelicPorts<T>>(key:K):RelicPorts<T>[K]=>{
      if(typeof ports[key]!=='function')throw new Error(`Relic ${key} port is required`);
      return ports[key].bind(ports) as RelicPorts<T>[K];
    };
    this.#ports={isRelic:bind('isRelic'),footprint:bind('footprint'),nextUid:bind('nextUid'),bumpUidFloor:bind('bumpUidFloor'),cloneItems:bind('cloneItems'),stash:bind('stash'),bagBoard:bind('bagBoard'),progression:bind('progression')};
    this.#storage=new StashPolicy(item=>this.#ports.footprint(item));
    this.#bag=new InventoryHost(item=>this.#ports.footprint(item));
  }
  get scratchBytes():number{return this.#storage.scratchBytes+this.#bag.scratchBytes;}
  #run<R>(work:()=>R):R{if(this.#busy)throw new Error('Reentrant relic custody operation');this.#busy=true;try{return work();}finally{this.#busy=false;}}
  #config():RelicProgression{
    const c=this.#ports.progression();integer(c.maxRank,0,'Maximum relic rank');
    if(finite(c.costBase,'Relic cost base')<=0||c.costBase*(c.maxRank+1)**2>Number.MAX_SAFE_INTEGER)throw new Error('Relic cost exceeds safe bounds');
    if(finite(c.powerPerRank,'Relic power per rank')<0||finite(c.xpPenaltyPerCell,'Relic XP penalty')<0)throw new Error('Relic progression factors must be nonnegative');
    return c;
  }
  #empty():RelicState<T>{return {items:[],seated:[],carried:[],enabled:true,rank:0,invested:0,stash:this.#storage.empty(this.#ports.stash()),released:[]};}
  empty():RelicState<T>{return this.#run(()=>this.#empty());}
  #reserve(state:RelicState<T>):StashEntry<T>[]{
    const selected=new Set([...state.seated,...state.carried]);
    return state.items.filter(item=>!selected.has(item.relicKey!)).map(item=>({key:item.relicKey!,item}));
  }
  reserve(state:RelicState<T>):StashEntry<T>[]{return this.#run(()=>this.#reserve(state));}
  #board(state:RelicState<T>):T[]{const keys=new Set(state.seated);return state.items.filter(item=>keys.has(item.relicKey!));}
  board(state:RelicState<T>):T[]{return this.#run(()=>this.#board(state));}
  #reconcile(state:RelicState<T>):void{state.stash=this.#storage.restore(this.#ports.stash(),this.#reserve(state),state.stash);}
  reconcile(state:RelicState<T>):void{this.#run(()=>this.#reconcile(state));}
  planStorage(state:RelicState<T>,item:T,target?:StashCell,vacate?:string):StashState|undefined{
    return this.#run(()=>this.#storage.plan(this.#ports.stash(),this.#reserve(state),state.stash,{key:item.relicKey??'incoming',item},target,vacate));
  }
  /** Compatibility restoration: first body per nonempty key, released keys
   * excluded, board selection wins over bag selection. Caller decodes saves. */
  restore(value?:Partial<RelicState<T>>):RelicState<T>{return this.#run(()=>{
    const out=this.#empty();if(!value)return out;const config=this.#config();
    out.enabled=value.enabled!==false;
    out.released=[...new Set((Array.isArray(value.released)?value.released:[]).filter(key=>typeof key==='string'&&key.length>0))];
    const released=new Set(out.released),seen=new Set<string>();
    out.rank=Number.isSafeInteger(value.rank)?Math.max(0,Math.min(config.maxRank,value.rank!)):0;
    out.invested=Number.isSafeInteger(value.invested)?Math.max(0,Math.min(config.costBase*(out.rank+1)**2-1,value.invested!)):0;
    out.items=this.#ports.cloneItems((Array.isArray(value.items)?value.items:[]).filter(item=>{
      if(!item||typeof item.relicKey!=='string'||!item.relicKey||seen.has(item.relicKey)||released.has(item.relicKey))return false;
      seen.add(item.relicKey);return true;
    }));
    out.seated=[...new Set((Array.isArray(value.seated)?value.seated:[]).filter(key=>seen.has(key)))];
    const seated=new Set(out.seated);
    out.carried=[...new Set((Array.isArray(value.carried)?value.carried:[]).filter(key=>seen.has(key)&&!seated.has(key)))];
    for(const item of out.items)this.#ports.bumpUidFloor(item.uid);
    out.stash=this.#storage.restore(this.#ports.stash(),this.#reserve(out),value.stash);return out;
  });}
  cost(state:Pick<RelicState<T>,'rank'>):number{return this.#run(()=>this.#config().costBase*(state.rank+1)**2);}
  power(state:Pick<RelicState<T>,'rank'>):number{return this.#run(()=>finite(state.rank*this.#config().powerPerRank,'Relic power'));}
  investPower(state:RelicState<T>,purse:RelicPurse,authorized:boolean,amount=purse.credits):number{return this.#run(()=>{
    const config=this.#config();
    if(!authorized||state.rank>=config.maxRank||!Number.isSafeInteger(purse.credits)||purse.credits<=0||!Number.isFinite(amount)||amount<=0)return 0;
    const cost=config.costBase*(state.rank+1)**2,spent=Math.min(purse.credits,Math.floor(amount),cost-state.invested);
    purse.credits-=spent;state.invested+=spent;
    if(state.invested===cost){state.rank++;state.invested=0;}return spent;
  });}
  investStorage(state:RelicState<T>,purse:RelicPurse,authorized:boolean,amount=purse.credits):number{return this.#run(()=>{
    const def=this.#ports.stash(),stash=state.stash;
    if(!authorized||stash.pages>=def.maxPages||!Number.isSafeInteger(purse.credits)||purse.credits<=0||!Number.isFinite(amount)||amount<=0)return 0;
    const cost=this.#storage.pageCost(def,stash),spent=Math.min(purse.credits,Math.floor(amount),cost-stash.invested);
    purse.credits-=spent;stash.invested+=spent;
    if(stash.invested===cost){stash.pages++;stash.invested=0;state.stash=this.#storage.restore(def,this.#reserve(state),stash);}return spent;
  });}
  experience(items:readonly T[],enabled=true):number{return this.#run(()=>{
    let cells=0;for(const item of items){const size=this.#ports.footprint(item);integer(size.w,1,'Relic width');integer(size.h,1,'Relic height');cells+=size.w*size.h;}
    return enabled?Math.max(0,finite(1-cells*this.#config().xpPenaltyPerCell,'Relic experience factor')):1;
  });}
  #bank(state:RelicState<T>,item:T,scope:string):T|undefined{
    if(!this.#ports.isRelic(item))return;const key=identity(item,scope);
    if(state.released.includes(key))return;const existing=state.items.find(body=>body.relicKey===key);if(existing)return existing;
    let uid=item.uid;
    if(state.items.some(body=>body.uid===uid)){uid=this.#ports.nextUid();integer(uid,0,'Allocated item UID');if(state.items.some(body=>body.uid===uid))throw new Error('Item UID port returned an owned address');}
    item.relicKey=key;item.uid=uid;delete item.x;delete item.y;state.items.push(item);return item;
  }
  bank(state:RelicState<T>,item:T,scope:string):T|undefined{return this.#run(()=>this.#bank(state,item,scope));}
  loseCarried(state:RelicState<T>,bag:readonly T[],scope:string):number{return this.#run(()=>{
    const lost=new Set(bag.filter(item=>this.#ports.isRelic(item)).map(item=>identity(item,scope)));if(!lost.size)return 0;
    state.released=[...new Set([...state.released,...lost])];state.items=state.items.filter(item=>!lost.has(item.relicKey!));
    state.carried=state.carried.filter(key=>!lost.has(key));state.seated=state.seated.filter(key=>!lost.has(key));
    for(const key of lost)delete state.stash.cells[key];this.#reconcile(state);return lost.size;
  });}
  migrateCorpses<L extends RelicLoot<T>>(state:RelicState<T>,deaths:{owner:string;timestamp:number;loot:{items:L[]}}[]):void{this.#run(()=>{
    for(const death of deaths)death.loot.items=death.loot.items.filter(row=>{
      if(row.kind!=='gear'||!this.#ports.isRelic(row.item!))return true;
      this.#bank(state,row.item!,`corpse:${death.owner}:${death.timestamp}`);return false;
    });this.#reconcile(state);
  });}
  migrateCarry(state:RelicState<T>,carry:RelicCarry<T>,scope:string,legacy=true):void{this.#run(()=>{
    const old=carry.containers.reliquary??[];
    for(const item of [...(legacy?carry.items:[]),...old]){
      if(!this.#ports.isRelic(item))continue;const key=identity(item,scope),existed=state.items.some(body=>body.relicKey===key),x=item.x,y=item.y;
      const stored=this.#bank(state,item,scope);
      if(!existed&&stored&&old.includes(item)){stored.x=x;stored.y=y;state.seated.push(stored.relicKey!);}
    }
    const released=new Set(state.released),owned=new Set(state.items.map(item=>item.relicKey));
    carry.items=carry.items.filter(item=>!(legacy&&this.#ports.isRelic(item))&&!item.relicKey&&!released.has(`legacy:${scope}:${item.uid}`)&&!owned.has(`legacy:${scope}:${item.uid}`));
    const used=new Set([...carry.items,...Object.values(carry.equipped),...Object.entries(carry.containers).filter(([id])=>id!=='reliquary').flatMap(([,items])=>items)].filter((item):item is T=>!!item).map(item=>item.uid));
    let lastAllocated=-1;
    for(const item of state.items){
      while(used.has(item.uid)){
        const uid=this.#ports.nextUid();integer(uid,0,'Allocated item UID');
        if(uid<=lastAllocated)throw new Error('Item UID port must advance monotonically');lastAllocated=uid;item.uid=uid;
      }used.add(item.uid);
    }
    const carried=new Set(state.carried),board=this.#ports.bagBoard();
    for(const item of state.items)if(carried.has(item.relicKey!)){
      if(!(item.x!==undefined&&item.y!==undefined&&this.#bag.place(carry.items,item,item.x,item.y,board))&&!this.#bag.autoPlace(carry.items,item,board)){
        state.carried=state.carried.filter(key=>key!==item.relicKey);delete item.x;delete item.y;
      }
    }
    carry.containers.reliquary=this.#board(state);this.#reconcile(state);
  });}
}
