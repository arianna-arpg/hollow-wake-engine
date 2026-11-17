export interface FieldPoint {x: number; y: number}
export interface FieldActor<Tags, M> {
  readonly id: number; readonly tier: number; readonly facing: number;
  readonly sheet: {get(stat: string, tags: Tags, extra: readonly M[]): number};
}
export interface FieldSkill {readonly def: {readonly id: string}}
export interface FieldZone<A, I> {
  tier?:number;
  pos: FieldPoint; radius: number; caster: A; inst: I; color: string; delay: number; exploded: boolean;
  linger: number; tickInterval: number; tickTimer: number; shape: number; facing: number; dmgMult: number; depth: number;
}
export type CastFieldEffect<Grant> =
  | {readonly type:'terrain';readonly kind:string;readonly radius:number;readonly duration:number}
  | {readonly type:'conjure';readonly radius:number;readonly duration:number;readonly grants?:readonly Grant[];readonly look?:string;readonly follow?:boolean;readonly line?:true}
  | {readonly type:'kindle';readonly kind:string}
  | {readonly type:'vent';readonly bank:string;readonly radius:number;readonly duration:number}
  | {readonly type:'lure';readonly radius:number;readonly pace?:number;readonly standoff?:number;readonly sec:number}
  | {readonly type:'spawnZone';readonly radius:number;readonly duration:number;readonly tickInterval?:number;readonly damageScale?:number}
  | {readonly type:'townPortal'};
export interface CastFieldFrame<A, I, Tags, M> {
  readonly effectTier?:number;
  readonly caster:A;readonly skill:I;readonly origin:FieldPoint;readonly delivery:string;
  readonly areaScale:number;readonly durationScale:number;readonly multiplier:number;
  readonly color:string;readonly tags:Tags;readonly modifiers:readonly M[];
}
export interface CastFieldPorts<A, Grant> {
  random():number;
  terrain(at:FieldPoint,kind:string,radius:number,duration:number,options?:{tier:number}):void;
  conjure(x:number,y:number,radius:number,duration:number,options:{caster:A;grants:readonly Grant[];look?:string;follow?:true}):void;
  /** Ground providers own availability and are required by content admission.
   * A provider can refuse placement, but cannot silently omit an implementation. */
  kindle(kind:string,at:FieldPoint,options:{radius:number;poolMul:number}):boolean;
  kindled(at:FieldPoint):void;
  vent(bank:string,at:FieldPoint,radius:number,duration:number,layer:number):{reach:number;color?:string}|null;
  vented(at:FieldPoint,radius:number,color:string):void;
  lure(id:string,at:FieldPoint,radius:number,pace:number,standoff:number,seconds:number,layer:number):void;
  /** Host-owned travel policy. No town, account or campaign reference enters SDK state. */
  portal(caster:A):void;
}

/** Caster-side field formulas. Delayed/contact versions call the same helpers
 * at their delivery point. Combat zones remain borrowed SDK records; geography,
 * light resources, fog and travel are explicit replaceable host services. */
export class CastFields<A extends FieldActor<Tags, M>, I extends FieldSkill, Tags, M, Grant> {
  constructor(private readonly zoneOwner:FieldZone<A,I>[]|{zones:FieldZone<A,I>[]},readonly riders:readonly {readonly stat:string;readonly grant:Grant}[],readonly ports:CastFieldPorts<A,Grant>){}
  /** The simulation may replace its active array while retiring fields. */
  get zones():FieldZone<A,I>[]{return Array.isArray(this.zoneOwner)?this.zoneOwner:this.zoneOwner.zones;}
  grants(caster:A,tags:Tags,extra:readonly M[],base?:readonly Grant[]):Grant[]{
    let out=base?[...base]:undefined;
    for(const rider of this.riders)if(caster.sheet.get(rider.stat,tags,extra)>0)(out??=[]).push(rider.grant);
    return out??[];
  }
  kindle(caster:A,kind:string,at:FieldPoint,areaScale:number,durationScale:number):void{
    if(this.ports.kindle(kind,at,{radius:(11+this.ports.random()*3)*Math.sqrt(Math.max(.01,areaScale)),poolMul:Math.max(.1,durationScale)}))
      this.ports.kindled(at);
  }
  vent(bank:string,at:FieldPoint,radius:number,duration:number,areaScale:number,durationScale:number,layer:number):void{
    const planted=this.ports.vent(bank,at,radius*Math.sqrt(Math.max(.01,areaScale)),duration*Math.max(.1,durationScale),layer);
    if(planted)this.ports.vented(at,planted.reach*.6,planted.color??'#eef6f8');
  }
  apply(frame:CastFieldFrame<A,I,Tags,M>,effect:CastFieldEffect<Grant>):void{
    const {caster,skill,origin,delivery,areaScale,durationScale,multiplier,color,tags,modifiers}=frame;
    switch(effect.type){
      case 'terrain':this.ports.terrain(origin,effect.kind,effect.radius*areaScale,effect.duration*durationScale,...(frame.effectTier!==undefined?[{tier:frame.effectTier}]:[]));return;
      case 'conjure':
        if(delivery!=='ground')this.ports.conjure(origin.x,origin.y,effect.radius*areaScale,effect.duration*durationScale,
          {caster,grants:this.grants(caster,tags,modifiers,effect.grants),...(effect.look!==undefined?{look:effect.look}:{}),...(effect.follow?{follow:true}: {})});
        return;
      case 'kindle':if(delivery!=='ground')this.kindle(caster,effect.kind,origin,areaScale,durationScale);return;
      case 'vent':if(delivery!=='ground')this.vent(effect.bank,origin,effect.radius,effect.duration,areaScale,durationScale,frame.effectTier??caster.tier);return;
      case 'lure':if(delivery!=='projectile')this.ports.lure(`skill#${caster.id}#${skill.def.id}`,origin,effect.radius,effect.pace??.5,effect.standoff??90,effect.sec,frame.effectTier??caster.tier);return;
      case 'townPortal':this.ports.portal(caster);return;
      case 'spawnZone':
        if(delivery!=='projectile')this.zones.push({...(frame.effectTier!==undefined?{tier:frame.effectTier}:{}),pos:{...origin},radius:effect.radius*areaScale,caster,inst:skill,color,delay:0,exploded:true,
          linger:effect.duration*durationScale,tickInterval:effect.tickInterval??.5,tickTimer:0,shape:caster.sheet.get('aoeShape',tags,modifiers),
          facing:caster.facing,dmgMult:(effect.damageScale??.5)*multiplier,depth:1});
    }
  }
}
