import {Random} from './random.js';
import {rollSupportCut, type SupportCut} from './support-rules.js';
import {copy, freeze, integer} from './validation.js';
import {gemItemRarityOf} from './gem-residence.js';
import {InventoryHost, type LiveInventoryBoard} from './inventory-host.js';
import {pouchGroups, pouchGroupKey} from './cargo-display.js';
import type {GemPayload, ItemInstance, RoughMemoryUnit} from './item-types.js';

type Weights = Record<string, number>;
interface Drop {id:string; name:string; color:string; tags:string[]; weight:number; min:number}
interface Skill extends Drop {requirements?:Weights; noDrop?:boolean}
interface Support extends Drop {cut?:SupportCut}
interface Monster {name:string; skills?:string[]; gemBias?:string[]; boss?:boolean}
export interface PouchContent {
  skills:Skill[]; supports:Support[]; skillPool:string[]; supportPool:string[]; starters:string[];
  monsters:Record<string,Monster>; floors:Record<string,{skills:string[];supports:string[]}>;
  facets:{id:string;label:string;attrs:{id:string;label:string;short:string}[]}[];
  kinds:Record<string,{base:string;facets:boolean}>;
  rarities:Record<string,{weight:number;sockets:number}>;
  found:Record<string,string>; traded:string;
  rules:{skillShare:number; tagWeights:Weights; biasMult:number; floorMult:number; kitMult:number;
    boss:Weights; tiers:Record<string,Weights>; strings:{sealed:string;noRoom:string;noFacet:string;tradedName:string};
    lesson:string;dropPrefix:string;total:string;legendary:string;threshold:number;awaken:boolean};
}
export interface RecallAccess {level:number; all:boolean; skills:Iterable<string>; supports:Iterable<string>}
export interface RecallBag {
  items:readonly ItemInstance[]; board:LiveInventoryBoard; inventory:InventoryHost<ItemInstance>; sealed:boolean;
}
export interface RecallLedger {
  ledger:Readonly<Record<string,number>>;
  seatLedger:Readonly<Record<string,number>>;
  skills:readonly string[];
  secondary:readonly string[];
  progression:boolean;
  local:boolean;
}
type Cut = {name:string; gem:GemPayload};
const own = <T>(rows:Record<string,T>,id:string) => Object.hasOwn(rows,id)?rows[id]:undefined;
function index<T extends {id:string}>(rows:readonly T[]) {
  const map=new Map(rows.map(row=>[row.id,row]));
  if(map.size!==rows.length)throw new Error('Duplicate recall definition');
  return map;
}
function ordered<T>(ids:readonly string[],defs:ReadonlyMap<string,T>):T[] {
  return ids.map(id=>{const row=defs.get(id);if(!row)throw new Error('Missing recall definition '+id);return row;});
}
function choose<T>(rows:readonly T[],weight:(row:T)=>number,rng:Random):T {
  if(!rows.length)throw new Error('Empty recall pool');
  const weights=rows.map(weight);
  let total=0;
  for(const w of weights)total+=w;
  if(total<=0)return rows[0];
  let roll=rng.next()*total;
  for(let i=0;i<rows.length;i++)if((roll-=weights[i])<=0)return rows[i];
  return rows[rows.length-1];
}
function facetSeed(seed:number,facet:string) {
  let hash=2166136261;
  const word='facet:'+facet;
  for(let i=0;i<word.length;i++)hash=Math.imul(hash^word.charCodeAt(i),16777619);
  return (seed^hash)>>>0;
}

/** Load authenticated authored content once. Each actor gets its own snapshot
 * of eligibility; replacing it after an unlock reprices existing pouches. */
export class PouchRecall {
  readonly #content:PouchContent;
  get content():PouchContent {return this.#content;}
  readonly #skills;
  readonly #supports;
  readonly #skillList;
  readonly #supportList;
  readonly #starters;
  readonly #facets;
  readonly #kinds;
  readonly #rarities;
  constructor(content:PouchContent|string){
    // Text already gives us a privately owned JSON tree. Object callers keep
    // ownership of every source record and can edit them independently.
    this.#content=freeze(typeof content==='string'?JSON.parse(content) as PouchContent:copy(content));
    const c=this.content;
    this.#skills=index(c.skills);this.#supports=index(c.supports);
    this.#skillList=ordered(c.skillPool,this.#skills);this.#supportList=ordered(c.supportPool,this.#supports);
    const starters=new Set(c.starters);
    this.#starters=this.#skillList.filter(s=>!s.noDrop&&starters.has(s.id));
    if(!this.#starters.length)throw new Error('Missing recall fallback');
    this.#facets=index(c.facets);this.#kinds=new Map(Object.entries(c.kinds).map(([id,v])=>[v.base,{id,...v}]));
    this.#rarities=Object.keys(c.rarities);
  }
  /** Original genuine-mint and local lesson receipts. Compute them without
   * publishing a reward, modifying the input or advancing another stream. */
  receipts(result:{id:string;rarity?:string},state:RecallLedger){
    const rules=this.content.rules;
    const ledger={...state.ledger},seatLedger={...state.seatLedger};
    let skills=state.skills,secondary=state.secondary,dirty=false;
    if(state.progression){
      const key=rules.dropPrefix+result.id;
      const count=(own(ledger,key)??0)+1;
      ledger[key]=count;
      ledger[rules.total]=(own(ledger,rules.total)??0)+1;
      dirty=count===rules.threshold;
      if(result.rarity==='legendary'){
        const s=this.#skills.get(result.id),award='skill:'+result.id;
        if(rules.awaken&&s&&!s.noDrop&&!secondary.includes(award)){
          if(!skills.includes(s.id))skills=[...skills,s.id];
          secondary=[...secondary,award];
          dirty=true;
        }
        if(!own(ledger,rules.legendary)){ledger[rules.legendary]=1;dirty=true;}
      }
    }
    if(state.local){
      seatLedger[rules.lesson]=1;
      if(state.progression){ledger[rules.lesson]=1;dirty=true;}
    }
    return {ledger,seatLedger,skills,secondary,dirty};
  }
  forActor(access:RecallAccess){
    const c=this.content,r=c.rules,level=integer(access.level,0,'Recall level'),all=access.all;
    const unlockedSkills=new Set(access.skills),unlockedSupports=new Set(access.supports);
    const prepare=(floor:typeof c.floors[string]|undefined)=>{
      const skills=new Set(floor?.skills),supports=new Set(floor?.supports);
      const pool=this.#skillList.filter(s=>!s.noDrop&&s.min<=level&&(all||unlockedSkills.has(s.id)||skills.has(s.id)));
      const skillPool=pool.length?pool:this.#starters;
      return {skillPool,skillIds:new Set(skillPool.map(s=>s.id)),skills,supports,
        supportPool:this.#supportList.filter(s=>s.min<=level&&(all||unlockedSupports.has(s.id)||supports.has(s.id)))};
    };
    // The common pool is shared across all groups. Keep only the last visited
    // authored floor in addition, even on a save containing many tilesets.
    const ordinary=prepare(undefined);
    let lastFloor:typeof c.floors[string]|undefined,lastPool=ordinary;
    function pools(tileset:string|undefined){
      const floor=tileset&&own(c.floors,tileset);
      if(!floor)return ordinary;
      if(floor!==lastFloor){lastPool=prepare(floor);lastFloor=floor;}
      return lastPool;
    }
    const lean=(monster:Monster|undefined,pool:typeof ordinary)=>{
      const kit=[...new Set(monster?.skills)].filter(id=>pool.skillIds.has(id));
      return {kit,rung:kit.length?'kit':monster?.gemBias?.length?'bias':'wide'};
    };
    function weight(d:Drop,base:number,bias?:readonly string[]){
      for(const tag of d.tags)base*=own(r.tagWeights,tag)??1;
      if(bias&&d.tags.some(t=>bias.includes(t)))base*=r.biasMult;
      return Math.max(0,base);
    }
    const cut=(unit:RoughMemoryUnit,facet?:string):Cut=>{
      integer(unit.s,0,'Recall seed');
      if(unit.s>0xffffffff)throw new Error('Recall seed exceeds uint32');
      const monster=own(c.monsters,unit.d),attributes=facet===undefined?undefined:this.#facets.get(facet);
      if(facet!==undefined&&!attributes)throw new Error('Unknown recall facet');
      const pin=unit.g;
      const pinnedSkill=pin?.k==='skill'?this.#skills.get(pin.id):undefined;
      const pinnedSupport=pin?.k==='support'?this.#supports.get(pin.id):undefined;
      const rng=new Random(attributes&&!pinnedSkill&&!pinnedSupport?facetSeed(unit.s,attributes.id):unit.s);
      const skill=(s:Skill,level:number,grade?:string):Cut=>{
        const tier=unit.e&&own(r.tiers,unit.e);
        const ids=unit.ceiling?this.#rarities.slice(0,this.#rarities.indexOf(unit.ceiling)+1):this.#rarities;
        const rarity=grade??(ids.length?choose(ids,id=>{
          const multiplier=(monster?.boss?r.boss[id]:1)*(tier?tier[id]??1:1);
          return c.rarities[id].weight*multiplier;
        },rng):'common');
        const row=own(c.rarities,rarity);
        if(!row)throw new Error('Unknown pinned rarity');
        return {name:s.name,gem:{kind:'skill',skillId:s.id,level,rarity,sockets:Array(row.sockets).fill(null)}};
      };
      const support=(s:Support,level:number):Cut=>({name:s.name,gem:{kind:'support',supportId:s.id,level,
        ...(s.cut?{rolled:rollSupportCut(s.cut,()=>rng.next())}:{})}});
      if(pinnedSkill)return skill(pinnedSkill,pin!.l??1,pin!.r);
      if(pinnedSupport)return support(pinnedSupport,pin!.l??1);
      const p=pools(unit.t);
      const skillWeight=(s:Skill)=>s.weight*(p.skills.has(s.id)?r.floorMult:1);
      if(attributes){
        const banner=p.skillPool.filter(s=>attributes.attrs.some(a=>(s.requirements?.[a.id]??0)>0));
        return skill(choose(banner.length?banner:p.skillPool,s=>weight(s,skillWeight(s)),rng),1);
      }
      if(rng.next()>=r.skillShare&&p.supportPool.length)
        return support(choose(p.supportPool,s=>weight(s,s.weight*(p.supports.has(s.id)?r.floorMult:1),monster?.gemBias),rng),1);
      const {kit,rung}=lean(monster,p);
      return skill(choose(p.skillPool,s=>weight(s,skillWeight(s)*(kit.includes(s.id)?r.kitMult:1),rung==='bias'?monster?.gemBias:undefined),rng),1);
    };
    const lookup=(bag:RecallBag,uid:number)=>{
      const pouch=bag.items.find(i=>i.uid===uid),kind=pouch&&this.#kinds.get(pouch.baseId);
      return pouch?.mem?.length&&kind?{pouch,units:pouch.mem,kind}:undefined;
    };
    const room=(bag:RecallBag,pouch:ItemInstance,units:RoughMemoryUnit[])=>{
      // Both gem kinds and the pouch occupy one cell. A fresh probe UID
      // prevents firstFit from treating an existing bag item as movable.
      const remaining=units.length===1?bag.items.filter(i=>i!==pouch):bag.items;
      return bag.inventory.firstFit(remaining,{...pouch,baseId:'skill_gem',uid:0},bag.board);
    };
    const view=(bag:RecallBag,uid:number)=>{
      const entry=lookup(bag,uid);if(!entry)return null;
      const {pouch,units,kind}=entry;
      const groups=pouchGroups(units,units.length).rows.map(({unit,key,count})=>{
        const m=own(c.monsters,unit.d),pin=unit.g;
        const name=m?.name??(unit.d===c.traded?r.strings.tradedName:own(c.found,unit.d)??unit.d);
        const base={key,d:unit.d,name,count};
        const pinned=pin&&(pin.k==='skill'?this.#skills:this.#supports).get(pin.id);
        if(pin&&pinned)return {...base,rung:'pinned',kit:[],tags:[],pin:{kind:pin.k,id:pin.id,name:pinned.name,color:pinned.color,
          ...(pin.r?{rarity:pin.r}:{})}};
        const face=kind.facets?{rung:'wide',kit:[]}:lean(m,ordinary);
        return {...base,rung:face.rung,kit:face.kit.map(id=>{const s=this.#skills.get(id)!;return {id,name:s.name,color:s.color,mult:r.kitMult};}),
          tags:face.rung==='bias'?[...(m?.gemBias??[])]:[]};
      });
      return {uid,kind:kind.id,total:units.length,groups,refusal:bag.sealed?r.strings.sealed:room(bag,pouch,units)?null:r.strings.noRoom};
    };
    /** Prepare the next bag and reveal on a detached path. Hosts commit the
     * bag, UID advance and mint receipts together against the observed save. */
    const recall=(bag:RecallBag,uid:number,group:string,nextUid:number,facet?:string)=>{
      const entry=lookup(bag,uid);
      const refuse=(reason:string|null)=>({ok:false as const,reason});
      if(!entry)return refuse(null);
      const {pouch,units,kind}=entry,at=units.findIndex(u=>pouchGroupKey(u)===group);
      if(at<0)return refuse(null);
      if(kind.facets&&(facet===undefined||!this.#facets.has(facet)))return refuse(r.strings.noFacet);
      if(bag.sealed)return refuse(r.strings.sealed);
      const cell=room(bag,pouch,units);if(!cell)return refuse(r.strings.noRoom);
      integer(nextUid,1,'Mint UID');
      if(nextUid>=Number.MAX_SAFE_INTEGER||bag.items.some(i=>i.uid===nextUid))throw new Error('Invalid mint UID');
      const {gem,name}=cut(units[at],kind.facets?facet:undefined);
      const id=gem.kind==='skill'?gem.skillId:gem.supportId;
      const item:ItemInstance={uid:nextUid,baseId:gem.kind+'_gem',ilvl:1,tier:1,rarity:gemItemRarityOf(gem),name,
        baseRoll:0,implicitRolls:[],affixes:[],gem,...cell};
      const items=bag.items.slice(),index=items.indexOf(pouch);
      if(units.length===1)items.splice(index,1);
      else items[index]={...pouch,mem:units.filter((_,i)=>i!==at)};
      items.push(item);
      const result={kind:gem.kind,id,name,itemUid:nextUid,...(gem.kind==='skill'?{rarity:gem.rarity}:{})};
      return {ok:true as const,items,nextUid:nextUid+1,result};
    };
    return {cut,view,recall};
  }
}
