import {InventoryHost,type LiveInventoryBoard} from './inventory-host.js';
import {ContainerPolicy,type ContainerPorts,type ContainerDefinition} from './container-policy.js';
import {containerBoardDimensions,type ContainerBoard} from './container-layout.js';
import {StashPolicy,type StashDefinition,type StashState,type StashCell} from './stash-policy.js';
import {RelicCustody,type RelicItem,type RelicState} from './relic-custody.js';

/** Trusted host observations, sampled lazily in original refusal order. */
export interface RelicAccess {
  ownHosted:boolean;featureOwned:boolean;fallen:boolean;
  casting():boolean;oracleReach():boolean;foeNear():boolean;
  elapsedSinceCombat:number;calmSeconds:number;
}
export function relicCanManage(access:RelicAccess):boolean{
  return access.ownHosted&&!access.fallen&&access.oracleReach();
}
export function relicEquipmentRefusal(access:RelicAccess):string|null{
  if(!access.ownHosted||!access.featureOwned)return 'Available in your own hosted journey.';
  if(access.fallen)return 'Unavailable while fallen.';
  if(access.casting())return 'Finish casting before changing the Reliquary.';
  if(access.elapsedSinceCombat<access.calmSeconds||access.foeNear())return 'Leave combat before changing the Reliquary.';
  return null;
}
export interface RelicActionItem extends RelicItem {uniqueId?:string;questId?:string;locked?:boolean}
export interface PersonalStorage<T> {items:T[];layout:StashState}
export interface RelicActionCarry<T> {
  items:T[];equipped:Readonly<Partial<Record<string,T>>>;
  containers:Record<string,T[]>;stash?:PersonalStorage<T>;
}
export interface RelicActionContext<T> {
  state:RelicState<T>;carry:RelicActionCarry<T>;scope:string;
  access:RelicAccess;definition:ContainerDefinition;board:ContainerBoard|null;
  bagBoard:LiveInventoryBoard;level:number;lesson:boolean;
}
export type RelicActionResult=Readonly<{changed:boolean;refusal?:Readonly<{key:string;reason:string}>;lessonCompleted?:boolean}>;
const unchanged:RelicActionResult=Object.freeze({changed:false});
const changed:RelicActionResult=Object.freeze({changed:true});
const learned:RelicActionResult=Object.freeze({changed:true,lessonCompleted:true});
const refused=(key:string,reason:string):RelicActionResult=>({changed:false,refusal:{key,reason}});
type Cell={x:number;y:number};

/** Synchronous ownership commits after complete destination planning. Payloads
 * are never copied for geometry. The host maps outcomes to actor recalculation,
 * notifications and durable saves in its original order. No context is retained.
 * All supplied read ports are pure and nonreentrant; custody UID ports retain
 * their documented nonthrowing contract during mutation. */
export class RelicActions<T extends RelicActionItem> {
  readonly #custody:RelicCustody<T>;
  readonly #grid:InventoryHost<T>;
  readonly #containers:ContainerPolicy<T>;
  readonly #storage:StashPolicy<T>;
  readonly #isRelic:(item:T)=>boolean;
  #busy=false;
  constructor(custody:RelicCustody<T>,ports:ContainerPorts<T>&{isRelic(item:T):boolean}){
    if(typeof ports.isRelic!=='function')throw new Error('Relic classification port is required');
    this.#custody=custody;this.#isRelic=ports.isRelic.bind(ports);
    const footprint=ports.footprint.bind(ports);
    this.#grid=new InventoryHost(footprint);this.#containers=new ContainerPolicy(ports);this.#storage=new StashPolicy(footprint);
  }
  get scratchBytes():number{return this.#grid.scratchBytes+this.#containers.scratchBytes+this.#storage.scratchBytes;}
  #run<R>(work:()=>R):R{if(this.#busy)throw new Error('Reentrant relic action');this.#busy=true;try{return work();}finally{this.#busy=false;}}
  #destination(bag:readonly T[],item:T,board:LiveInventoryBoard,x?:number,y?:number):Cell|null{
    return x!==undefined&&y!==undefined?(this.#grid.canPlace(bag,item,x,y,board)?{x,y}:null):this.#grid.firstFit(bag,item,board);
  }
  toggle(state:RelicState<T>,access:RelicAccess,enabled:boolean):RelicActionResult{return this.#run(()=>{
    const reason=relicEquipmentRefusal(access);if(reason)return refused('reliquaryToggle',reason);
    if(state.enabled===enabled)return unchanged;state.enabled=enabled;return changed;
  });}
  withdraw(ctx:RelicActionContext<T>,uid:number,x?:number,y?:number):RelicActionResult{return this.#run(()=>{
    const {state,carry}=ctx,item=state.items.find(item=>item.uid===uid);
    if(!item||state.carried.includes(item.relicKey!))return unchanged;
    const equipped=(carry.containers.reliquary??[]).includes(item);
    if(equipped?!!relicEquipmentRefusal(ctx.access):!relicCanManage(ctx.access))return unchanged;
    const destination=this.#destination(carry.items,item,ctx.bagBoard,x,y);
    if(!destination)return refused('relicBag','No room in your pack.');
    carry.containers.reliquary=(carry.containers.reliquary??[]).filter(other=>other!==item);
    delete state.stash.cells[item.relicKey!];item.x=destination.x;item.y=destination.y;carry.items.push(item);return changed;
  });}
  store(ctx:RelicActionContext<T>,uid:number,target?:StashCell):RelicActionResult{return this.#run(()=>{
    const {state,carry}=ctx;if(!relicCanManage(ctx.access)||!ctx.access.featureOwned)return unchanged;
    const bagged=carry.items.find(item=>item.uid===uid),item=bagged??state.items.find(item=>item.uid===uid);
    if(!item||!this.#isRelic(item)||item.questId)return unchanged;
    if((carry.containers.reliquary??[]).includes(item)&&relicEquipmentRefusal(ctx.access))return unchanged;
    const plan=this.#custody.planStorage(state,item,target);
    if(!plan)return refused('stash:'+uid,'No room in the Relic stash. Make space or unlock another page in the Vault.');
    const incoming=!item.relicKey,stored=this.#custody.bank(state,item,ctx.scope);if(!stored)return unchanged;
    if(incoming){Object.defineProperty(plan.cells,stored.relicKey!,{value:plan.cells.incoming,enumerable:true,writable:true,configurable:true});delete plan.cells.incoming;}
    if(bagged)this.#grid.remove(carry.items,uid);
    carry.containers.reliquary=(carry.containers.reliquary??[]).filter(item=>item!==stored);
    delete stored.x;delete stored.y;state.stash=plan;return changed;
  });}
  release(ctx:RelicActionContext<T>,uid:number):RelicActionResult{return this.#run(()=>{
    const state=ctx.state;if(!relicCanManage(ctx.access)||!ctx.access.featureOwned)return unchanged;
    const item=state.items.find(item=>item.uid===uid);
    if(!item||item.locked||state.seated.includes(item.relicKey!)||state.carried.includes(item.relicKey!))return unchanged;
    state.released.push(item.relicKey!);state.items=state.items.filter(other=>other!==item);delete state.stash.cells[item.relicKey!];return changed;
  });}
  place(ctx:RelicActionContext<T>,uid:number,x?:number,y?:number):RelicActionResult{return this.#run(()=>{
    const {access,state,carry}=ctx;
    if(!access.ownHosted||access.fallen||(!ctx.lesson&&!!relicEquipmentRefusal(access)))return unchanged;
    const board=ctx.board;if(!board)return unchanged;
    const bagged=carry.items.find(item=>item.uid===uid),item=bagged??state.items.find(item=>item.uid===uid);
    if(!bagged&&!relicCanManage(access))return unchanged;
    // The original host creates this empty container view before item refusal.
    const held=carry.containers.reliquary??(carry.containers.reliquary=[]);
    if(!item||!this.#isRelic(item)||item.questId||held.includes(item))return unchanged;
    let displaced:T|undefined,destination:Cell|null;
    if(x!==undefined&&y!==undefined){
      const landing=this.#containers.landing(ctx.definition,board,held,item,'bag',x,y,ctx.level);
      if(landing.verdict==='blocked')return landing.why?refused('seat:'+uid,landing.why):unchanged;
      displaced=landing.with;destination={x,y};
    }else{
      const reason=this.#containers.uniqueRefusal(held,item);if(reason)return refused('seat:'+uid,reason);
      destination=this.#grid.firstFit(held,item,containerBoardDimensions(board));
      if(!destination)return refused('seat:'+uid,'No open seat. Return a Relic to your pack first.');
    }
    let bagReturn:Cell|null|undefined;
    if(displaced&&bagged){
      const rest=carry.items.filter(item=>item!==bagged);
      bagReturn=bagged.x!==undefined&&bagged.y!==undefined?this.#destination(rest,displaced,ctx.bagBoard,bagged.x,bagged.y):null;
      if(!bagReturn)bagReturn=this.#destination(rest,displaced,ctx.bagBoard);if(!bagReturn)return unchanged;
    }
    const stashPlan=displaced&&!bagged?this.#custody.planStorage(state,displaced,undefined,item.relicKey):undefined;
    if(displaced&&!bagged&&!stashPlan)return refused('stash:'+uid,'No room for the exchanged Relic in storage.');
    const stored=this.#custody.bank(state,item,ctx.scope);if(!stored)return unchanged;
    if(bagged)this.#grid.remove(carry.items,uid);
    if(displaced){held.splice(held.indexOf(displaced),1);delete displaced.x;delete displaced.y;}
    if(displaced&&bagReturn){displaced.x=bagReturn.x;displaced.y=bagReturn.y;carry.items.push(displaced);}
    if(stashPlan)state.stash=stashPlan;delete state.stash.cells[stored.relicKey!];
    stored.x=destination.x;stored.y=destination.y;held.push(stored);return ctx.lesson?learned:changed;
  });}
  /** Mirror selection references before the host persists; this is not a save. */
  sync(ctx:Pick<RelicActionContext<T>,'state'|'carry'|'access'>):boolean{return this.#run(()=>{
    if(!ctx.access.ownHosted)return false;
    ctx.state.seated=(ctx.carry.containers.reliquary??[]).flatMap(item=>item.relicKey?[item.relicKey]:[]);
    ctx.state.carried=ctx.carry.items.flatMap(item=>item.relicKey?[item.relicKey]:[]);this.#custody.reconcile(ctx.state);return true;
  });}
  reconcile(ctx:RelicActionContext<T>):boolean{return this.#run(()=>{
    if(!ctx.access.ownHosted)return false;
    this.#custody.migrateCarry(ctx.state,ctx.carry,ctx.scope,false);
    const held=this.#custody.board(ctx.state),misfits=new Set(this.#containers.misfits(ctx.board,held));
    ctx.carry.containers.reliquary=held.filter(item=>!misfits.has(item));ctx.state.seated=ctx.carry.containers.reliquary.map(item=>item.relicKey!);
    for(const item of misfits){delete item.x;delete item.y;}this.#custody.reconcile(ctx.state);return true;
  });}
  attune(access:RelicAccess,ledger:Record<string,number>,key:string):boolean{return this.#run(()=>{
    if(!relicCanManage(access)||!access.featureOwned||ledger[key])return false;
    Object.defineProperty(ledger,key,{value:1,enumerable:true,writable:true,configurable:true});return true;
  });}
  personal(carry:RelicActionCarry<T>,access:RelicAccess,definition:StashDefinition<T>|undefined,bagBoard:LiveInventoryBoard,uid:number,operation:'store'|'take'|'move',x?:number,y?:number):RelicActionResult{return this.#run(()=>{
    if(!definition||!relicCanManage(access))return unchanged;
    const stash=carry.stash??{items:[],layout:this.#storage.empty(definition)},item=(operation==='store'?carry.items:stash.items).find(item=>item.uid===uid);
    if(!item||!definition.accepts(item))return unchanged;
    if(operation==='take'){
      const destination=this.#destination(carry.items,item,bagBoard,x,y);if(!destination)return refused('stash:'+uid,'No room in your pack.');
      stash.items=stash.items.filter(other=>other!==item);delete stash.layout.cells[String(uid)];item.x=destination.x;item.y=destination.y;carry.items.push(item);
    }else{
      const target=x!==undefined&&y!==undefined?{page:0,x,y}:undefined;
      const plan=this.#storage.plan(definition,stash.items.map(item=>({key:String(item.uid),item})),stash.layout,{key:String(uid),item},target);
      if(!plan)return refused('stash:'+uid,'No room in this personal locker.');
      if(operation==='store'){this.#grid.remove(carry.items,uid);stash.items.push(item);}delete item.x;delete item.y;stash.layout=plan;
    }
    carry.stash=stash;return changed;
  });}
}
