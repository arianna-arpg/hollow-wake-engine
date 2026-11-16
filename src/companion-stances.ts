export interface StanceSkill {readonly def:{readonly id:string;readonly effects:readonly {readonly type:string}[]}}
export interface StanceActor<I>{readonly skills:readonly (I|null|undefined)[]}
export interface StanceController<A>{readonly actor:A;readonly home?:A}
export interface StanceDefinition {readonly id:string;readonly order:number;readonly lunges:boolean;readonly conduct:string}
export interface StancePorts<A,C>{
  choices(controller:C):Map<string,string>;
  learned(controller:C,skillId:string):boolean;
  refresh():void;
  shifted(hero:A,skillId:string,stanceId:string):void;
  changed(controller:C):void;
}
/** Character-controlled companion stance choice, separated from general AI
 * conduct and optional persistence. Definitions are copied at setup; choices
 * live in the host's in-memory character/controller state. */
export class CompanionStances<A extends StanceActor<I>,I extends StanceSkill,C extends StanceController<A>,D extends StanceDefinition=StanceDefinition>{
  readonly #definitions:ReadonlyMap<string,Readonly<D>>;
  readonly #cycle:readonly string[];
  readonly #default:string;
  constructor(definitions:readonly D[],defaultId:string,readonly prefix:string,readonly ports:StancePorts<A,C>){
    if(!definitions.length)throw Error('At least one companion stance is required');
    const map=new Map<string,Readonly<D>>();
    for(const row of definitions){
      if(!row.id||map.has(row.id)||!Number.isFinite(row.order)||!row.conduct)throw Error('Invalid or duplicate companion stance');
      map.set(row.id,Object.freeze({...row}));
    }
    this.#definitions=map;this.#cycle=Object.freeze([...map.values()].sort((a,b)=>a.order-b.order).map(row=>row.id));
    this.#default=map.has(defaultId)?defaultId:this.#cycle[0];
  }
  id(controller:C,skillId:string):string{const id=this.ports.choices(controller).get(skillId);return id&&this.#definitions.has(id)?id:this.#default;}
  definition(id:string):Readonly<D>{return this.#definitions.get(id)??this.#definitions.get(this.#default)!;}
  next(id:string):string{return this.#cycle[(this.#cycle.indexOf(id)+1)%this.#cycle.length];}
  order(id:string):{kind:string;pos:{x:number;y:number};until:number;autonomous:true}{return{kind:this.prefix+id,pos:{x:0,y:0},until:Infinity,autonomous:true};}
  fromOrder(order?:{readonly kind:string}):string|undefined{
    if(!order?.kind.startsWith(this.prefix))return;const id=order.kind.slice(this.prefix.length);return this.#definitions.has(id)?id:undefined;
  }
  set(controller:C,skillId:string,stanceId:string):boolean{
    if(!this.#definitions.has(stanceId))return false;
    if(!this.ports.learned(controller,skillId)&&!controller.actor.skills.some(skill=>skill?.def.id===skillId))return false;
    const previous=this.id(controller,skillId);this.ports.choices(controller).set(skillId,stanceId);this.ports.refresh();
    if(previous!==stanceId)this.ports.shifted(controller.home??controller.actor,skillId,stanceId);
    this.ports.changed(controller);return previous!==stanceId;
  }
  cycle(controller:C,skillId?:string,stanceId?:string):boolean{
    const ids=skillId?[skillId]:controller.actor.skills.filter(skill=>skill&&skill.def.effects.some(effect=>effect.type==='tame')).map(skill=>skill!.def.id);
    let moved=false;
    for(const id of new Set(ids)){const to=stanceId??this.next(this.id(controller,id));moved=this.set(controller,id,to)||moved;}
    return moved;
  }
}
