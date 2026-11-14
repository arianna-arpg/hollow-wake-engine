import {Random} from './random.js';
import type {MemoryPin,RoughMemoryUnit} from './item-types.js';
export type {RoughMemoryUnit} from './item-types.js';

export type MemoryKind='rough'|'preformed';
export interface GemDropPoint {x:number;y:number}
export interface GemDropFloor {skills:ReadonlySet<string>;supports:ReadonlySet<string>}
export interface GemDropProvenance {d:string;e?:RoughMemoryUnit['e']}
export interface GemDropRequest<Tag extends string> {
 at:GemDropPoint;bias?:Tag[];owed?:boolean;from?:string|GemDropProvenance;memoryKind?:MemoryKind;pin?:MemoryPin;
}
export interface GemDropPorts<Skill,Support,Tag extends string> {
 sealed():boolean;random():number;clamp(point:GemDropPoint):GemDropPoint;
 floor():GemDropFloor|undefined;level():number;tileset():string|undefined;
 config():{skillShare:number;memoryShare:number;preformedShare:number;foundProvenance:string};
 rollSkill(bias:Tag[]|undefined,level:number,floor:GemDropFloor|undefined):Skill;
 rollSupport(bias:Tag[]|undefined,level:number,floor:GemDropFloor|undefined):Support|null|undefined;
 memory(pos:GemDropPoint,at:GemDropPoint,kind:MemoryKind,unit:RoughMemoryUnit,bob:number):undefined;
 skill(pos:GemDropPoint,at:GemDropPoint,value:Skill,bob:number):undefined;
 support(pos:GemDropPoint,at:GemDropPoint,value:Support,bob:number):undefined;
 pinned(pos:GemDropPoint,at:GemDropPoint,pin:MemoryPin,bob:number):undefined;
}
function hash(word:string){let hash=2166136261;for(let i=0;i<word.length;i++)hash=Math.imul(hash^word.charCodeAt(i),16777619);return hash>>>0;}
const formLane=hash('lane:form'),kindLane=hash('lane:kind');
const lane=(seed:number,salt:number)=>new Random((seed^salt)>>>0).next();
const selected=(seed:number,share:number,salt:number)=>share>=1||share>0&&lane(seed,salt)<share;
const synchronous=<T>(value:T):T=>{if(value&&typeof (value as {then?:unknown}).then==='function')throw Error('gem-drop-port-must-be-synchronous');return value;};
const done=(value:unknown)=>{if(value!==undefined)throw Error('gem-drop-effect-must-return-undefined');};

/** Exact seed/provenance capture. No registry, item address or global stream is owned here. */
export function sealMemoryUnit(provenance:GemDropProvenance,seed:number,pin?:MemoryPin,tileset?:string):RoughMemoryUnit {
 return{d:provenance.d,s:seed,...(provenance.e&&provenance.e!=='normal'?{e:provenance.e}:{}),...(tileset?{t:tileset}:{}),...(pin?{g:{...pin}}:{})};
}
export function mintMemoryPouch<Unit extends RoughMemoryUnit>(definition:{base:string;name:string},uid:number,units:Unit[]) {
 return{uid,baseId:definition.base,ilvl:1,tier:1,rarity:'common' as const,name:definition.name,baseRoll:0,implicitRolls:[],affixes:[],mem:units};
}

/** Original gem-drop ordering over explicit synchronous host services. Rolling
 * still precedes the Memory decision, retaining the original stream position.
 * Persistence and world placement authority belong to the enclosing owner. */
export class GemDropLifecycle<Skill,Support,Tag extends string> {
 constructor(readonly ports:GemDropPorts<Skill,Support,Tag>){}
 #draw(){const value=synchronous(this.ports.random());if(!Number.isFinite(value)||value<0||value>=1)throw Error('invalid-gem-drop-random');return value;}
 #land(pos:GemDropPoint,request:GemDropRequest<Tag>,floor:GemDropFloor|undefined,provenance:GemDropProvenance,bob:number):boolean {
  const p=this.ports,seed=(bob*4294967296)>>>0,config=synchronous(p.config());
  if(request.memoryKind===undefined&&!selected(seed,config.memoryShare,formLane))return false;
  const kind=request.pin?'rough':request.memoryKind??(selected(seed,config.preformedShare,kindLane)?'preformed':'rough');
  const tileset=floor&&(floor.skills.size>0||floor.supports.size>0)?synchronous(p.tileset()):undefined;
  done(p.memory(pos,request.at,kind,sealMemoryUnit(provenance,seed,request.pin,tileset),bob));return true;
 }
 drop(request:GemDropRequest<Tag>):void {
  const p=this.ports;if(!request.owed&&synchronous(p.sealed()))return;
  const pos=synchronous(p.clamp({x:request.at.x+(-20+this.#draw()*40),y:request.at.y+(-20+this.#draw()*40)})),floor=synchronous(p.floor());
  const config=synchronous(p.config());
  const provenance=typeof request.from==='string'?{d:request.from}:request.from??{d:config.foundProvenance};
  if(request.pin){const bob=this.#draw();if(!this.#land(pos,request,floor,provenance,bob))done(p.pinned(pos,request.at,request.pin,bob));return;}
  if(!(this.#draw()<config.skillShare)){
   const value=synchronous(p.rollSupport(request.bias,synchronous(p.level()),floor));
   if(value){const bob=this.#draw();if(!this.#land(pos,request,floor,provenance,bob))done(p.support(pos,request.at,value,bob));return;}
  }
  const value=synchronous(p.rollSkill(request.bias,synchronous(p.level()),floor)),bob=this.#draw();
  if(!this.#land(pos,request,floor,provenance,bob))done(p.skill(pos,request.at,value,bob));
 }
}
