import {finite} from './validation.js';

/** A view of the persistent terms; the host retains its complete authored spec. */
export interface BankDecaySpec {decay?:number;bankAt?:number}
export interface ChannelBank<I,S extends BankDecaySpec=BankDecaySpec> {
  fill:number;
  inst:I;
  spec:S;
}
export interface ChannelBankOwner<I,S extends BankDecaySpec=BankDecaySpec> {
  brims?:Map<string,ChannelBank<I,S>>;
  casting?:{mode:string;held:boolean;inst:I}|null;
}
export interface ChannelBankPorts<A,I,S extends BankDecaySpec> {
  key(instance:I):string;
  /** Live, contextual query. Called only for a nonempty, unheld, draining bank
   * below its kept plateau. Must not structurally mutate the bank map. */
  decayMultiplier(actor:A,bank:ChannelBank<I,S>):number;
}

/** Stateless policy over host-owned records. One service may serve many actors.
 * The host calls decay at its existing frame phase with already scaled time.
 * This service neither advances a clock nor publishes stat gauges. */
export class ChannelBanks<A extends ChannelBankOwner<I,S>,I,S extends BankDecaySpec=BankDecaySpec> {
  constructor(private readonly ports:ChannelBankPorts<A,I,S>) {}

  /** Preserve a retained record and fill; refresh both live bindings. */
  bind(actor:A,instance:I,spec:S):ChannelBank<I,S> {
    const map=actor.brims??=new Map<string,ChannelBank<I,S>>();
    const key=this.ports.key(instance);
    let bank=map.get(key);
    if(!bank){bank={fill:0,inst:instance,spec};map.set(key,bank);}
    bank.inst=instance;
    bank.spec=spec;
    return bank;
  }

  /** A release lookup never creates storage or evaluates an absent map's key. */
  lookup(actor:A,instance:I):ChannelBank<I,S>|undefined {
    return actor.brims?.get(this.ports.key(instance));
  }

  /** Ordered sweep. A zero delta still performs the sweep; a paused host must
   * skip the call, as it skips its other actor work. Detached records retain
   * their final fill, including a negative value after a large decay step.
   * A throwing query preserves completed earlier entries and the current fill. */
  decay(actor:A,dt:number):void {
    if(finite(dt,'Bank elapsed time')<0)throw new Error('Bank elapsed time must be nonnegative');
    if(!actor.brims?.size)return;
    for(const [key,bank]of actor.brims){
      const cast=actor.casting;
      if(cast?.mode==='channel'&&cast.held&&this.ports.key(cast.inst)===key)continue;
      if(bank.fill<=0){actor.brims.delete(key);continue;}
      const spec=bank.spec;
      if(!spec.decay)continue;
      if(spec.bankAt!==undefined&&bank.fill>=spec.bankAt)continue;
      // Match compound-assignment ordering: capture the left-hand fill and
      // authored rate before evaluating the host's contextual query.
      const fill=bank.fill,rate=spec.decay;
      const multiplier=finite(this.ports.decayMultiplier(actor,bank),'Bank decay multiplier');
      const next=finite(fill-rate*multiplier*dt,'Remaining bank fill');
      bank.fill=next;
      if(next<=0)actor.brims.delete(key);
    }
  }
}
