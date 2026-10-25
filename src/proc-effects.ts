/** Minimum fields used by the magnitude fold, not a full executable effect schema. */
export interface WardEffect {readonly type:'ward';readonly flat?:number;readonly pctMaxLife?:number}
export interface LevelMagnitude {readonly base:number;readonly perLevel:number}
export type ProcMagnitudeEffect =
  | {readonly type:'extraHit'|'collisionDamage'|'explosion'|'arc';readonly damageScale:number}
  | {readonly type:'displace';readonly force:number}
  | {readonly type:'status';readonly magnitude?:number}
  | {readonly type:'heal'|'restore';readonly flat?:number;readonly pctMax?:number}
  | ({readonly type:'burst'} & LevelMagnitude)
  | {readonly type:'delayedBurst';readonly damage?:LevelMagnitude;readonly healAllies?:LevelMagnitude}
  | WardEffect
  | {readonly type:'cast';readonly cast:{readonly mult?:number}}
  | {readonly type:'gainCharge'|'buff'|'fortify'|'cooldown'|'removeBuff'|'cleanse'|'kindle'|'vent'|'summon'|'birth'};

/** Keeps the discriminator without falsely retaining literal numeric types or
 * promising arbitrary nested metadata that the original fold may omit. */
export type ProcMagnitudeResult<K extends ProcMagnitudeEffect['type']> = ProcMagnitudeEffect & {readonly type:K};
export function scaleProcEffect<E extends ProcMagnitudeEffect>(fx:E,pw:number):ProcMagnitudeResult<E['type']>;
export function scaleProcEffect(fx:ProcMagnitudeEffect,pw:number):ProcMagnitudeEffect {
  if(pw===1||!(pw>0))return fx;
  switch(fx.type){
    case 'extraHit':case 'collisionDamage':case 'explosion':case 'arc':return {...fx,damageScale:fx.damageScale*pw};
    case 'displace':return {...fx,force:fx.force*pw};
    case 'status':return {...fx,magnitude:(fx.magnitude??1)*pw};
    case 'heal':case 'restore':return {...fx,flat:fx.flat===undefined?undefined:fx.flat*pw,pctMax:fx.pctMax===undefined?undefined:fx.pctMax*pw};
    case 'burst':return {...fx,base:fx.base*pw,perLevel:fx.perLevel*pw};
    case 'delayedBurst':return {...fx,
      damage:fx.damage?{...fx.damage,base:fx.damage.base*pw,perLevel:fx.damage.perLevel*pw}:undefined,
      healAllies:fx.healAllies?{base:fx.healAllies.base*pw,perLevel:fx.healAllies.perLevel*pw}:undefined};
    case 'ward':return {...fx,flat:fx.flat===undefined?undefined:fx.flat*pw,pctMaxLife:fx.pctMaxLife===undefined?undefined:fx.pctMaxLife*pw};
    case 'cast':return {...fx,cast:{...fx.cast,mult:(fx.cast.mult??1)*pw}};
    default:return fx;
  }
}

export interface WardState {readonly dead:boolean;ward:number}
export interface WardResourcePorts<A extends WardState> {readonly rate:(actor:A)=>number}
/** Uncapped native resource arithmetic over borrowed state. The rate lookup is
 * deliberately lazy; nested changes during it precede the outer addition. */
export function gainWard<A extends WardState>(actor:A,amount:number,ports:WardResourcePorts<A>):number {
  if(amount<=0||actor.dead)return 0;
  const gained=amount*ports.rate(actor);
  actor.ward+=gained;
  return gained;
}

export interface WardEffectPorts<A> {readonly maximumLife:(actor:A)=>number;readonly gain:(actor:A,amount:number)=>number}
/** Apply an already-scaled ward effect and report observed pool growth.
 * The caller delivers its cue and rider tail after this returns. */
export function applyWardEffect<A extends {readonly ward:number}>(actor:A,fx:WardEffect,ports:WardEffectPorts<A>):boolean {
  const amount=(fx.flat??0)+(fx.pctMaxLife??0)*ports.maximumLife(actor);
  const before=actor.ward;
  if(amount>0)ports.gain(actor,amount);
  return actor.ward>before;
}
