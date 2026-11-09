// Optional, host-independent persistent companion lifecycle.
export interface CompanionOwner {dead:boolean;downed:boolean}
export interface CompanionBody {dead:boolean}
export interface CompanionDefinition {id:string}
export interface CompanionSkill<D> {def:D;level:number;companionGrant?:boolean;grantedBy?:string;relicSource?:string}
export interface CompanionSummon {
  type:'summon';persistent?:{respawnTime:number;reserve?:number};
  poolGroup?:string;exclusiveGroup?:string;count?:number;maxActive?:number;
}
export type CompanionSpawn<L> = Omit<L,'persistent'|'poolGroup'|'exclusiveGroup'|'count'|'maxActive'> & {
  persistent:undefined;poolGroup:undefined;exclusiveGroup:undefined;count:1;maxActive:1;
};
export interface CompanionGrant<S,B> {inst:S;body?:B;remaining:number}
export interface CompanionGrantState<S,B> {grants?:Map<string,CompanionGrant<S,B>>}
export interface CompanionGrantPorts<O,D,S,L> {
  /** Return the original summon delivery, or undefined for another mode. */
  summon(def:D):L|undefined;
  maxLevel(def:D):number;
  grantedLevel(owner:O,def:D):number;
  makeSkill(def:D,level:number,sockets:0):S;
  respawnScale(owner:O,inst:S):number;
}

/** Borrowed per-owner state, with no hidden actor registry. Definitions may be
 * shared, while callers own complete row/instance/body graphs. Ports observe
 * current state in source order. Exceptions retain preceding borrowed writes;
 * private preparation must supply detached state and defer live effects. */
export class CompanionGrants<O extends CompanionOwner,D extends CompanionDefinition,
  S extends CompanionSkill<D>,B extends CompanionBody,L extends CompanionSummon> {
  constructor(readonly ports:CompanionGrantPorts<O,D,S,L>){}
  derive(state:CompanionGrantState<S,B>,owner:O,defs:readonly D[],source:(id:string)=>string,
    retire:(body:B)=>void,refresh:(body:B,inst:S)=>void,relicSource:(id:string)=>string|undefined=()=>undefined):void {
    const previous=state.grants??new Map<string,CompanionGrant<S,B>>(),next=new Map<string,CompanionGrant<S,B>>(),p=this.ports;
    for(const def of defs){
      const delivery=p.summon(def);if(!delivery?.persistent)continue;
      const level=Math.min(p.maxLevel(def),Math.floor(p.grantedLevel(owner,def)));if(level<1)continue;
      let row=previous.get(def.id);
      if(!row){const inst=p.makeSkill(def,level,0);inst.companionGrant=true;row={inst,remaining:0};}
      row.inst.level=level;row.inst.relicSource=relicSource(def.id);
      if(row.body&&!row.body.dead)refresh(row.body,row.inst);
      row.inst.grantedBy=source(def.id);next.set(def.id,row);
    }
    for(const[id,row]of previous)if(!next.has(id)&&row.body&&!row.body.dead)retire(row.body);
    state.grants=next.size?next:undefined;
  }
  /** Body presence is a lazy host observation. A host may supply an existing
   * roster index; this runtime neither allocates a frame index nor scans actors. */
  update(state:CompanionGrantState<S,B>,owner:O,dt:number,contains:(body:B)=>boolean,
    spawn:(inst:S,delivery:CompanionSpawn<L>)=>B|null,retire:(body:B)=>void):void {
    const p=this.ports;
    for(const row of state.grants?.values()??[]){
      const d=p.summon(row.inst.def);if(!d?.persistent)continue;
      if(owner.dead){
        if(row.body&&!row.body.dead)retire(row.body);
        row.body=undefined;row.remaining=d.persistent.respawnTime;continue;
      }
      if(row.body?.dead){row.remaining=d.persistent.respawnTime*p.respawnScale(owner,row.inst);row.body=undefined;}
      else if(row.body&&!contains(row.body))row.body=undefined;
      if(row.body||owner.downed)continue;
      row.remaining=Math.max(0,row.remaining-dt);if(row.remaining>0)continue;
      row.body=spawn(row.inst,{...d,persistent:undefined,poolGroup:undefined,exclusiveGroup:undefined,count:1,maxActive:1})??undefined;
    }
  }
}

export interface CompanionReservationPorts<O,S,T,M> {
  tags(inst:S):T;modifiers(inst:S):M;
  manaCost(owner:O,tags:T,mods:M):number;
  reservationMultiplier(owner:O,inst:S,tags:T,mods:M):number;
}
/** Retains tag/modifier capture and both live price queries even at zero base. */
export function companionReservationUnit<O,S,T,M>(owner:O,inst:S,delivery:{persistent?:{reserve?:number}},ports:CompanionReservationPorts<O,S,T,M>):number {
  const tags=ports.tags(inst),mods=ports.modifiers(inst);
  return (delivery.persistent?.reserve??0)*ports.manaCost(owner,tags,mods)*ports.reservationMultiplier(owner,inst,tags,mods);
}
