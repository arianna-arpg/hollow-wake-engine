import {finite} from './validation.js';

export interface ActorGaugeSources {
  statuses:readonly {id:string;stacks:number}[];
  charges:ReadonlyMap<string,number>;
  brims?:ReadonlyMap<string,{fill:number}>;
  reserves?:ReadonlyMap<string,{pips:number}>;
  derivedGauges?:ReadonlyMap<string,number>|null;
}
export interface ActorGaugeSink {setGauges(entries:[string,number][]):void}
type Kind='status'|'charge'|'brim'|'reserve'|'derived';
// Four cells per positive entry: kind, raw id, value, publication key. One
// compact array avoids retaining a separate object for every sampled gauge.
type Cells=(string|number)[];

/** One publisher owns one sink's gauge slot. Source records are borrowed and
 * sampled synchronously; no actor is retained. The host owns integer counts,
 * sampling cadence and condition masks. Only brim fill is rounded (five pips).
 * Exact ordered comparisons replace probabilistic fingerprints.
 *
 * Stable calls create no entry arrays or prefixed keys. Changed calls deliver
 * detached tuples: sinks may retain them without aliasing the publisher cache.
 * This is not a claim about the engine's map-iteration or GC allocations. */
export class ActorGaugePublisher {
  private cells:Cells|undefined;
  private sink:ActorGaugeSink|undefined;
  private invalid=true;
  private active=false;
  private requestedInvalidation=false;
  private cursor=0;
  private changed=false;

  /** Request another full publication after external mutation of the sink.
   * Calling this during publication schedules a refresh on the next call. */
  invalidate():void {
    this.invalid=true;
    if(this.active)this.requestedInvalidation=true;
  }

  /** Release cached keys and the sink reference. Not allowed during a sample. */
  reset():void {
    if(this.active)throw new Error('Cannot reset an active actor gauge publisher');
    this.cells=undefined;this.sink=undefined;this.invalid=true;
  }

  /** Returns whether a complete replacement was published. Reentry is rejected
   * before reading sources. Sampling or sink failure propagates and forces a
   * fresh publication next time, including after a sink partially applied it. */
  refresh(source:ActorGaugeSources,sink:ActorGaugeSink):boolean {
    if(this.active)throw new Error('Actor gauge publication cannot reenter');
    this.active=true;
    const force=this.invalid||this.sink!==sink;
    this.invalid=true;this.requestedInvalidation=false;this.cursor=0;this.changed=false;
    try{
      for(const status of source.statuses)this.observe('status',status.id,status.stacks);
      for(const [id,value]of source.charges)this.observe('charge',id,value);
      if(source.brims)for(const [id,bank]of source.brims)this.observe('brim',id,Math.round(finite(bank.fill,'Brim fill')*5));
      if(source.reserves)for(const [id,reserve]of source.reserves)this.observe('reserve',id,reserve.pips);
      if(source.derivedGauges)for(const [id,value]of source.derivedGauges)this.observe('derived',id,value);
      if(this.cursor!==(this.cells?.length??0)){
        if(this.cursor===0)this.cells=undefined;else this.cells!.length=this.cursor;
        this.changed=true;
      }
      if(!force&&!this.changed){this.invalid=this.requestedInvalidation;return false;}
      const entries:[string,number][]=new Array(this.cursor/4),cells=this.cells;
      for(let i=0;i<this.cursor;i+=4)entries[i/4]=[cells![i+3] as string,cells![i+2] as number];
      sink.setGauges(entries);
      this.sink=sink;
      this.invalid=this.requestedInvalidation;
      return true;
    }finally{this.active=false;}
  }

  private observe(kind:Kind,id:string,value:number):void {
    finite(value,'Actor gauge value');
    if(value<=0)return;
    const at=this.cursor,cells=this.cells??= [];
    this.cursor+=4;
    if(at===cells.length){cells.push(kind,id,value,kind==='derived'?id:kind+':'+id);this.changed=true;return;}
    if(cells[at]!==kind||cells[at+1]!==id){cells[at]=kind;cells[at+1]=id;cells[at+3]=kind==='derived'?id:kind+':'+id;this.changed=true;}
    if(cells[at+2]!==value){cells[at+2]=value;this.changed=true;}
  }
}
