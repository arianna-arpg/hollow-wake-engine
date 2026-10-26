export interface BurstPoint {readonly x:number;readonly y:number}
export interface BurstMagnitude {readonly base:number;readonly perLevel:number}
export interface DelayedBurstEffect<D extends string=string> {
  readonly type:'delayedBurst';
  readonly at:'self'|'target';
  readonly delay:number;
  readonly radius:number;
  readonly damage?:BurstMagnitude & {readonly type:D};
  readonly healAllies?:BurstMagnitude;
}
export interface DelayedBurstOwner {
  readonly pos:BurstPoint;readonly tier:number;readonly team:unknown;readonly level:number;
}
export interface DelayedBurstActor<D extends string=string> {
  readonly pos:BurstPoint;readonly tier:number;readonly team:unknown;readonly radius:number;
  readonly dead:boolean;readonly untargetable:boolean;readonly invulnerable:boolean;
  life:number;esBroke:boolean;hitFlash:number;hitFlashType?:D;
}
export interface PendingBurst<O,D extends string=string> {
  readonly at:BurstPoint;readonly when:number;readonly owner:O;readonly color:string;
  readonly depth:number;readonly tier:number;readonly fx:DelayedBurstEffect<D>;
}
/** Read ports are coherent, synchronous observations over plain host records.
 * Sinks return undefined so an asynchronous sink is rejected by TypeScript.
 * Keep this table immutable; it may be shared across independent schedulers. */
export interface DelayedBurstPorts<H,O,A,D extends string=string> {
  readonly queue:(host:H)=>PendingBurst<O,D>[];
  readonly time:(host:H)=>number;
  readonly actors:(host:H)=>readonly A[];
  readonly clearQueue:(host:H)=>undefined;
  readonly warning:(host:H,burst:PendingBurst<O,D>)=>undefined;
  readonly flash:(host:H,burst:PendingBurst<O,D>)=>undefined;
  readonly heal:(host:H,actor:A,amount:number)=>number;
  readonly mitigate:(host:H,actor:A,type:D,amount:number)=>number;
  readonly text:(host:H,at:BurstPoint,text:string,color:string,size:number)=>undefined;
  readonly shieldBreak:(host:H,actor:A,depth:number)=>undefined;
  readonly sweepDefenses:(host:H,actor:A,depth:number)=>undefined;
  readonly kill:(host:H,actor:A)=>undefined;
}

/** One instance per independent queue. Host queues retain all pending work;
 * this object retains only its ports, active guard and cancellation token. */
export class DelayedBursts<H,O extends DelayedBurstOwner,A extends DelayedBurstActor<D>,D extends string=string> {
  private active=false;
  private generation:object={};
  constructor(private readonly ports:DelayedBurstPorts<H,O,A,D>) {
    for(const key of ['queue','time','actors','clearQueue','warning','flash','heal','mitigate','text','shieldBreak','sweepDefenses','kill'] as const){
      if(typeof ports?.[key]!=='function')throw new Error(`Missing delayed burst port: ${key}`);
    }
  }

  /** Typed native inputs are borrowed and already scaled. Use the compiler
   * below when accepting serialized definitions or requiring owned content. */
  schedule(host:H,owner:O,fx:DelayedBurstEffect<D>,color:string,depth=0,target?:{readonly pos:BurstPoint}|null):void {
    const spot=fx.at==='self'||!target?owner.pos:target.pos;
    const queue=this.ports.queue(host);
    const burst:PendingBurst<O,D>={at:{x:spot.x,y:spot.y},when:this.ports.time(host)+fx.delay,owner,fx,color,depth:depth+1,tier:owner.tier};
    queue.push(burst);
    this.ports.warning(host,burst);
  }

  /** Invalidate first, even if the host later restores an old array reference
   * or its clear callback fails after committing part of the reset. */
  reset(host:H):void {
    this.generation={};
    this.ports.clearQueue(host);
  }

  private cancelled(host:H,queue:PendingBurst<O,D>[],generation:object):boolean {
    return generation!==this.generation||queue!==this.ports.queue(host);
  }

  /** Call at the host's delayed-effect phase using its already-scaled clock.
   * Effects are removed before delivery; failures keep prior commits. */
  advance(host:H):void {
    if(this.active)throw new Error('Delayed burst advance is already active');
    this.active=true;
    try {
      const ports=this.ports,generation=this.generation,queue=ports.queue(host);
      for(let i=queue.length-1;i>=0;i--){
        // Pure reads cannot cancel; check every delivery callback below.
        const burst=queue[i];
        if(ports.time(host)<burst.when)continue;
        queue.splice(i,1);
        const level=Math.max(0,burst.owner.level-1);
        ports.flash(host,burst);
        if(this.cancelled(host,queue,generation))return;
        for(const actor of ports.actors(host)){
          if(actor.dead||actor.untargetable)continue;
          if(actor.tier!==burst.tier)continue;
          if(Math.hypot(burst.at.x-actor.pos.x,burst.at.y-actor.pos.y)-actor.radius>burst.fx.radius)continue;
          if(actor.team===burst.owner.team){
            if(burst.fx.healAllies){
              const healed=ports.heal(host,actor,burst.fx.healAllies.base+burst.fx.healAllies.perLevel*level);
              if(this.cancelled(host,queue,generation))return;
              if(healed>0.5){
                ports.text(host,actor.pos,'+'+Math.round(healed),'#8ae0a8',11);
                if(this.cancelled(host,queue,generation))return;
              }
            }
          }else if(burst.fx.damage){
            const landed=ports.mitigate(host,actor,burst.fx.damage.type,burst.fx.damage.base+burst.fx.damage.perLevel*level);
            if(this.cancelled(host,queue,generation))return;
            if(landed<=0||actor.invulnerable)continue;
            actor.life-=landed;
            actor.hitFlash=0.15;
            actor.hitFlashType=burst.fx.damage.type;
            ports.text(host,actor.pos,Math.round(landed).toString(),burst.color,12);
            if(this.cancelled(host,queue,generation))return;
            if(actor.esBroke){
              actor.esBroke=false;
              ports.shieldBreak(host,actor,burst.depth);
              if(this.cancelled(host,queue,generation))return;
            }
            ports.sweepDefenses(host,actor,burst.depth);
            if(this.cancelled(host,queue,generation))return;
            if(actor.life<=0&&!actor.dead){
              ports.kill(host,actor);
              if(this.cancelled(host,queue,generation))return;
            }
          }
        }
      }
    }finally{this.active=false;}
  }
}

function record(value:unknown,keys:readonly string[],label:string):Record<string,unknown> {
  if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} must be an object`);
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==null&&prototype!==Object.prototype)throw new Error(`${label} must be a plain object`);
  const out:Record<string,unknown>=Object.create(null);
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||!keys.includes(key))throw new Error(`Unknown ${label} field: ${String(key)}`);
    const descriptor=Object.getOwnPropertyDescriptor(value,key)!;
    if(!('value' in descriptor)||!descriptor.enumerable)throw new Error(`${label} fields must be enumerable data`);
    out[key]=descriptor.value;
  }
  return out;
}
function number(value:unknown,label:string):number {
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`${label} must be a finite number`);
  return value;
}

/** Validate and copy the complete serialized shape once, outside the hot path.
 * Unknown fields are rejected. Allowed damage names are supplied by the host;
 * this module does not impose a game's damage catalogue. */
export function compileDelayedBurstEffect<D extends string>(input:unknown,damageTypes:readonly D[]):DelayedBurstEffect<D> {
  if(!Array.isArray(damageTypes))throw new Error('Allowed damage types must be an array');
  for(const type of damageTypes)if(typeof type!=='string'||!type.length)throw new Error('Allowed damage types must be nonempty strings');
  const value=record(input,['type','at','delay','radius','damage','healAllies'],'delayed effect');
  if(value.type!=='delayedBurst')throw new Error('Expected delayedBurst effect');
  if(value.at!=='self'&&value.at!=='target')throw new Error('Delayed effect at must be self or target');
  const delay=number(value.delay,'Delay'),radius=number(value.radius,'Radius');
  if(delay<0||radius<0)throw new Error('Delay and radius must be nonnegative');
  let damage:DelayedBurstEffect<D>['damage'],healAllies:BurstMagnitude|undefined;
  if(value.damage!==undefined){
    const d=record(value.damage,['type','base','perLevel'],'damage');
    if(typeof d.type!=='string'||!damageTypes.includes(d.type as D))throw new Error('Unknown delayed damage type');
    damage=Object.freeze({type:d.type as D,base:number(d.base,'Damage base'),perLevel:number(d.perLevel,'Damage perLevel')});
  }
  if(value.healAllies!==undefined){
    const h=record(value.healAllies,['base','perLevel'],'healing');
    healAllies=Object.freeze({base:number(h.base,'Healing base'),perLevel:number(h.perLevel,'Healing perLevel')});
  }
  return Object.freeze({type:'delayedBurst',at:value.at,delay,radius,...(damage===undefined?{}:{damage}),...(healAllies===undefined?{}:{healAllies})});
}
