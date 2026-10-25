import {copy,freeze,finite,readonlySet} from './validation.js';
import {procConfiguration,type ProcConfiguration,type ProcDefinition,type ProcRiderDefinition,type ProcSource,type ProcTrigger} from './proc-types.js';
export type {ProcConfiguration,ProcDefinition,ProcRiderDefinition,ProcSource,ProcTrigger} from './proc-types.js';

const triggers:readonly ProcTrigger[]=Object.freeze(['hit','kill','collision','statusApply','block','evade','esBreak','esRechargeStart','esFilled',
  'poiseBreakDealt','poiseBroken','poiseBracket','poiseRearmed','chargeGain','buffGain','orbPickup','surface','hurt','miss','foiled','cast','condition','pulse','minionDeath','heal','lastGasp','struck']);
const empty=Object.freeze([]);
function name(value:unknown):asserts value is string {if(typeof value!=='string'||!value||value.length>256)throw new Error('Invalid proc identity/filter');}
function list(value:unknown):asserts value is unknown[] {if(!Array.isArray(value)||value.length>65536)throw new Error('Invalid proc list');}
function names(value:unknown):void {list(value);for(const item of value)name(item);}
function namedFilter(value:unknown):void {if(typeof value==='string')name(value);else names(value);}
function object(value:unknown):asserts value is Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid proc record');}
function portable(value:unknown,depth=0):void {
  if(depth>128)throw new Error('Proc payload is too deeply nested');
  if(value&&typeof value==='object'){
    if(Array.isArray(value)){list(value);for(let i=0;i<value.length;i++){if(!Object.hasOwn(value,i)||value[i]===undefined)throw new Error('Sparse proc payload');portable(value[i],depth+1);}}
    else {if(Object.getOwnPropertySymbols(value).length)throw new Error('Symbol proc payload key');for(const child of Object.values(value))portable(child,depth+1);}
  }
  // copy() subsequently rejects cycles, nonplain objects and unsupported scalar types.
}
export interface ProcContentPack<D extends ProcDefinition=ProcDefinition,R extends ProcRiderDefinition=ProcRiderDefinition> {
  readonly schemaVersion:1;readonly capability:'proc-dispatch/v1';readonly contentId:string;readonly rules:ProcConfiguration;
  readonly procs:readonly D[];readonly riders:readonly R[];
}
/** Detached, immutable dispatch data. Payload mechanics require their own executor. */
export class ProcContent<D extends ProcDefinition=ProcDefinition,R extends ProcRiderDefinition=ProcRiderDefinition> implements ProcSource<D,R> {
  readonly pack:ProcContentPack<D,R>;readonly configuration:ProcConfiguration;
  readonly #definitions=new Map<string,D>();readonly #candidates=new Map<ProcTrigger,readonly D[]>();
  readonly #membership=new Map<ProcTrigger,ReadonlySet<string>>();readonly #ids:readonly string[];readonly #hits:readonly D[];
  constructor(input:ProcContentPack<D,R>){
    portable(input);const pack=copy(input);object(pack);
    if(pack.schemaVersion!==1||pack.capability!=='proc-dispatch/v1')throw new Error('Unsupported proc content schema');
    name(pack.contentId);list(pack.procs);list(pack.riders);this.configuration=procConfiguration(pack.rules);
    const grouped=new Map<ProcTrigger,D[]>(),hits:D[]=[];
    for(const row of pack.procs){
      object(row);name(row.id);if(this.#definitions.has(row.id))throw new Error('Duplicate proc identity');
      if(!triggers.includes(row.trigger))throw new Error('Unknown proc trigger');
      object(row.effect);name(row.effect.type);
      for(const key of ['skills','tags','receivedTypes','vs'] as const)if(row[key]!==undefined)names(row[key]);
      for(const key of ['requireBuff','requireStatus','charge','buff','orb','status'] as const)if(row[key]!==undefined)namedFilter(row[key]);
      for(const key of ['when','unless','condition','hitType'] as const)if(row[key]!==undefined)name(row[key]);
      for(const key of ['oncePerCast','crit','noCrit','minionCarry'] as const)if(row[key]!==undefined&&row[key]!==true)throw new Error('Invalid proc flag');
      for(const key of ['icd','ppm','rollTop','every'] as const)if(row[key]!==undefined)finite(row[key],'Proc '+key);
      if(row.bracket!==undefined){if(typeof row.bracket==='number')finite(row.bracket,'Proc bracket');else{list(row.bracket);for(const n of row.bracket)finite(n as number,'Proc bracket');}}
      this.#definitions.set(row.id,row);let group=grouped.get(row.trigger);if(!group)grouped.set(row.trigger,group=[]);group.push(row);
      if(row.trigger==='hit'||row.trigger==='kill')hits.push(row);
    }
    const riderIds=new Set<string>();
    for(const rider of pack.riders){
      object(rider);name(rider.id);if(riderIds.has(rider.id))throw new Error('Duplicate proc rider');riderIds.add(rider.id);namedFilter(rider.proc);object(rider.cast);
      for(const id of typeof rider.proc==='string'?[rider.proc]:rider.proc)if(!this.#definitions.has(id))throw new Error('Unknown proc rider host');
    }
    this.pack=freeze(pack);this.#ids=Object.freeze(pack.procs.map(row=>row.id));this.#hits=Object.freeze(hits);
    for(const [trigger,group]of grouped){this.#candidates.set(trigger,Object.freeze(group));this.#membership.set(trigger,readonlySet(group.map(row=>row.id)));}
    Object.freeze(this);
  }
  allIds():readonly string[]{return this.#ids;}
  triggerIds(trigger:ProcTrigger):ReadonlySet<string>|undefined{return this.#membership.get(trigger);}
  candidates(trigger:ProcTrigger):readonly D[]{return this.#candidates.get(trigger)??empty;}
  hitCandidates():readonly D[]{return this.#hits;}
  definition(id:string):D|undefined{return this.#definitions.get(id);}
  riders():readonly R[]{return this.pack.riders;}
}

export interface BorrowedProcPorts<D,R> {definitions():readonly D[];definition(id:string):D|undefined;riders():readonly R[]}
/** Explicit compatibility source: native row identities, live iteration and
 * length-keyed index behavior. Never a process-global SDK registry. */
export class BorrowedProcRegistry<D extends ProcDefinition,R extends ProcRiderDefinition> implements ProcSource<D,R> {
  readonly configuration:ProcConfiguration;readonly #ports:BorrowedProcPorts<D,R>;
  #rows:readonly D[]|undefined;#length=-1;#ids:readonly string[]=empty;#membership=new Map<ProcTrigger,ReadonlySet<string>>();
  constructor(ports:BorrowedProcPorts<D,R>,configuration:ProcConfiguration){
    this.configuration=procConfiguration(configuration);
    this.#ports=Object.freeze({definitions:ports.definitions.bind(ports),definition:ports.definition.bind(ports),riders:ports.riders.bind(ports)});
    Object.freeze(this);
  }
  #index():void {
    const rows=this.#ports.definitions();if(rows===this.#rows&&rows.length===this.#length)return;
    const groups=new Map<ProcTrigger,string[]>();
    for(const row of rows){let group=groups.get(row.trigger);if(!group)groups.set(row.trigger,group=[]);group.push(row.id);}
    this.#membership=new Map([...groups].map(([key,ids])=>[key,readonlySet(ids)]));
    this.#ids=Object.freeze(rows.map(row=>row.id));this.#rows=rows;this.#length=rows.length;
  }
  allIds():readonly string[]{this.#index();return this.#ids;}
  triggerIds(trigger:ProcTrigger):ReadonlySet<string>|undefined{this.#index();return this.#membership.get(trigger);}
  candidates(_trigger:ProcTrigger):readonly D[]{return this.#ports.definitions();}
  hitCandidates():readonly D[]{return this.#ports.definitions();}
  definition(id:string):D|undefined{return this.#ports.definition(id);}
  riders():readonly R[]{return this.#ports.riders();}
}
