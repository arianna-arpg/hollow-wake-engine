import {copy,finite,freeze} from './validation.js';
import type {Modifier,StatDefinition} from './types.js';
import type {ChargeCost,ChargeDefinition,ChargeTap} from './charge-runtime.js';
import type {GaugeSpec,GaugeTuning} from './resource-gauges.js';

/** Event eligibility and delivery are host responsibilities. These fields are
 * preserved and validated authoring data, not an event-dispatch implementation. */
export interface ResourceFeed {
  on:'hit'|'kill'|'takeHit'|'block'|'enemyDeath'|'allyDeath'|'second'|'move'|'orbPickup'|'channelSecond'|'channelFinish'|'use';
  amount:number;radius?:number;perDistance?:number;everySeconds?:number;
  orbKind?:string;eliteVictim?:boolean;chance?:number;whileToggled?:boolean;
}
export interface ResourceTap extends Omit<ChargeTap,'on'>,ResourceFeed {}
export interface ResourceGauge extends GaugeSpec {feeds?:ResourceFeed[]}
export interface ResourceNode {id:string;chargeGain?:ResourceTap[];chargeCost?:ChargeCost}
export interface ResourceSkill {
  id:string;chargeGain?:ResourceTap[];chargeCost?:ChargeCost;gauge?:ResourceGauge;
  /** Resource payload projection only. Use the skill-tree capability for graph
   * admission and ranks; chargeCost here is the node's authored override. */
  nodes?:ResourceNode[];
}
export interface ResourceContentPack {
  schemaVersion:1;capability:'resource-runtime/v1';contentId:string;
  charges:({id:string}&ChargeDefinition<Modifier>)[];gaugeTuning:GaugeTuning;
  stats:Record<string,StatDefinition>;skills:ResourceSkill[];supports:ResourceNode[];
}
const EVENTS=new Set(['hit','kill','takeHit','block','enemyDeath','allyDeath','second','move','orbPickup','channelSecond','channelFinish','use']);
function record(v:unknown,label:string):asserts v is Record<string,unknown>{
  if(!v||typeof v!=='object'||Array.isArray(v))throw new Error(`Invalid resource ${label}`);
}
function fields(v:unknown,keys:readonly string[],label:string):void{
  record(v,label);for(const k of Object.keys(v))if(!keys.includes(k))throw new Error(`Unknown resource ${label} field: ${k}`);
}
function rows(v:unknown,label:string):asserts v is unknown[]{if(!Array.isArray(v)||v.length>4096)throw new Error(`Invalid resource ${label} rows`);}
function name(v:unknown,label:string):asserts v is string{if(typeof v!=='string'||!v||v.length>256)throw new Error(`Invalid resource ${label}`);}
function chargeId(v:string):void{name(v,'charge id');if(v==='__regen'||v.includes(':'))throw new Error('Reserved charge clock namespace');}
function nonnegative(v:number,label:string):void{if(finite(v,label)<0)throw new Error(`${label} must be nonnegative`);}
function positive(v:number,label:string):void{if(finite(v,label)<=0)throw new Error(`${label} must be positive`);}
function fraction(v:number,label:string):void{nonnegative(v,label);if(v>1)throw new Error(`${label} exceeds one`);}
const FEED_KEYS=['on','amount','radius','perDistance','everySeconds','orbKind','eliteVictim','chance','whileToggled'];

/** Owns one validated immutable content revision. Ordered registry tuples are
 * created once and can be shared by every actor; lookups do not rebuild arrays.
 * Unregistered counters remain supported by ChargeRuntime's borrowed ports. */
export class ResourceContent {
  readonly pack:ResourceContentPack;
  readonly entries:readonly (readonly [string,ChargeDefinition<Modifier>])[];
  readonly #charges=new Map<string,ChargeDefinition<Modifier>>();
  readonly #skills=new Map<string,ResourceSkill>();
  readonly #supports=new Map<string,ResourceNode>();
  readonly #nodes=new Map<string,Map<string,ResourceNode>>();
  constructor(input:ResourceContentPack){
    const pack=copy(input);
    fields(pack,['schemaVersion','capability','contentId','charges','gaugeTuning','stats','skills','supports'],'pack');
    if(pack.schemaVersion!==1||pack.capability!=='resource-runtime/v1')throw new Error('Unsupported resource content schema');
    name(pack.contentId,'content identity');
    fields(pack.gaugeTuning,['defaultLockoutSec','defaultBankMult','noteGathering','noteLocked'],'gauge tuning');
    nonnegative(pack.gaugeTuning.defaultLockoutSec,'Default gauge lockout');positive(pack.gaugeTuning.defaultBankMult,'Default gauge bank');
    name(pack.gaugeTuning.noteGathering,'gathering note');name(pack.gaugeTuning.noteLocked,'locked note');
    record(pack.stats,'stats');
    if(Object.keys(pack.stats).length>4096)throw new Error('Too many resource stats');
    const stat=(id:string):void=>{name(id,'stat id');if(!Object.hasOwn(pack.stats,id))throw new Error(`Unknown resource stat: ${id}`);};
    for(const [id,s] of Object.entries(pack.stats)){
      name(id,'stat id');if(['__proto__','constructor','prototype'].includes(id))throw new Error('Reserved resource stat id');
      record(s,'stat definition');finite(s.base,'Resource stat base');
      if(s.min!==undefined)finite(s.min,'Resource stat minimum');if(s.max!==undefined)finite(s.max,'Resource stat maximum');
      if(s.min!==undefined&&s.max!==undefined&&s.min>s.max)throw new Error('Reversed resource stat bounds');
    }
    for(const id of ['chargeCap','gaugeNeed','gaugeGain','gaugeLockout'])stat(id);
    rows(pack.charges,'charge');
    for(const def of pack.charges){
      fields(def,['id','label','color','perCharge','modsWhileDraining','decay','baseCap','regen','regenNeedsSpender','hud'],'charge');
      chargeId(def.id);if(this.#charges.has(def.id))throw new Error('Duplicate resource charge');
      name(def.label,'charge label');name(def.color,'charge color');
      for(const key of ['baseCap','regen'] as const)if(def[key]!==undefined)nonnegative(def[key],'Charge '+key);
      for(const key of ['modsWhileDraining','regenNeedsSpender'] as const)if(def[key]!==undefined&&def[key]!==true)throw new Error('Invalid charge flag');
      if(def.hud!==undefined&&def.hud!=='slot')throw new Error('Invalid charge HUD lane');
      if(def.decay!==undefined){fields(def.decay,['perSec','delay'],'decay');nonnegative(def.decay.perSec,'Charge decay');if(def.decay.delay!==undefined)nonnegative(def.decay.delay,'Charge decay delay');}
      if(def.perCharge!==undefined){rows(def.perCharge,'modifier');for(const m of def.perCharge){
        fields(m,['stat','kind','value','fromStat','tags','when','gauge','gaugeAt'],'modifier');stat(m.stat);finite(m.value,'Resource modifier');
        if(!['flat','increased','more','override','link'].includes(m.kind))throw new Error('Unknown resource modifier kind');
        if(m.fromStat!==undefined||m.kind==='link')stat(m.fromStat!);
        if(m.tags!==undefined){rows(m.tags,'modifier tag');for(const tag of m.tags)name(tag,'modifier tag');}
        for(const key of ['when','gauge'] as const)if(m[key]!==undefined)name(m[key],'modifier '+key);
        if(m.gaugeAt!==undefined){finite(m.gaugeAt,'Resource modifier gauge');name(m.gauge,'modifier gauge');}
      }}
      stat('chargeCap_'+def.id);stat('chargeRegen_'+def.id);this.#charges.set(def.id,def);
    }
    const charge=(id:string):void=>{chargeId(id);if(!this.#charges.has(id))throw new Error(`Unknown resource charge: ${id}`);};
    const feed=(f:ResourceFeed,tap=false):void=>{
      fields(f,tap?[...FEED_KEYS,'charge','max']:FEED_KEYS,'feed');
      if(!EVENTS.has(f.on))throw new Error('Unknown resource feed event');nonnegative(f.amount,'Resource feed amount');
      for(const k of ['perDistance','everySeconds'] as const)if(f[k]!==undefined)positive(f[k],'Resource feed interval');
      if(f.radius!==undefined)nonnegative(f.radius,'Resource feed radius');if(f.chance!==undefined)fraction(f.chance,'Resource feed chance');
      if(f.orbKind!==undefined)name(f.orbKind,'feed orb kind');
      for(const k of ['eliteVictim','whileToggled'] as const)if(f[k]!==undefined&&typeof f[k]!=='boolean')throw new Error('Invalid resource feed flag');
    };
    const cost=(c:ChargeCost):void=>{
      fields(c,['charge','amount','minimum','damagePerCharge','projectilesPerCharge','repeatsPerCharge','optional'],'cost');charge(c.charge);
      if(c.amount!=='all')nonnegative(c.amount,'Charge cost');
      for(const k of ['minimum','damagePerCharge','projectilesPerCharge','repeatsPerCharge'] as const)if(c[k]!==undefined)nonnegative(c[k],'Charge cost '+k);
      if(c.optional!==undefined&&typeof c.optional!=='boolean')throw new Error('Invalid optional charge cost');
    };
    const payload=(r:ResourceNode):void=>{
      name(r.id,'payload id');
      if(r.chargeGain!==undefined){rows(r.chargeGain,'tap');for(const t of r.chargeGain){feed(t,true);charge(t.charge);nonnegative(t.max,'Charge tap maximum');}}
      if(r.chargeCost!==undefined)cost(r.chargeCost);
    };
    rows(pack.skills,'skill');rows(pack.supports,'support');
    for(const skill of pack.skills){
      fields(skill,['id','chargeGain','chargeCost','gauge','nodes'],'skill');payload(skill);
      if(skill.id.includes(':'))throw new Error('Resource skill id overlaps tree clock namespaces');
      if(this.#skills.has(skill.id))throw new Error('Duplicate resource skill');this.#skills.set(skill.id,skill);
      if(skill.gauge!==undefined){const g=skill.gauge;
        fields(g,['need','feeds','regen','lockoutSec','bankMult','unit','partial','overflow','cooldownPer'],'gauge');positive(g.need,'Gauge need');
        for(const k of ['regen','lockoutSec','cooldownPer'] as const)if(g[k]!==undefined)nonnegative(g[k],'Gauge '+k);
        if(g.bankMult!==undefined)positive(g.bankMult,'Gauge bank multiplier');if(g.unit!==undefined)name(g.unit,'gauge unit');
        if(g.overflow!==undefined&&g.overflow!==true)throw new Error('Invalid gauge overflow flag');
        if(g.partial!==undefined){fields(g.partial,['minFrac','floorPower'],'partial gauge');for(const k of ['minFrac','floorPower'] as const)if(g.partial[k]!==undefined)fraction(g.partial[k],'Partial gauge '+k);}
        if(g.feeds!==undefined){rows(g.feeds,'gauge feed');for(const f of g.feeds)feed(f);}
      }
      if(skill.nodes!==undefined){rows(skill.nodes,'tree node');const nodes=new Map<string,ResourceNode>();
        for(const n of skill.nodes){fields(n,['id','chargeGain','chargeCost'],'tree node');payload(n);if(nodes.has(n.id))throw new Error('Duplicate resource tree node');nodes.set(n.id,n);}this.#nodes.set(skill.id,nodes);
      }
    }
    for(const support of pack.supports){fields(support,['id','chargeGain','chargeCost'],'support');payload(support);if(this.#supports.has(support.id))throw new Error('Duplicate resource support');this.#supports.set(support.id,support);}
    this.pack=freeze(pack);this.entries=freeze([...this.#charges]);Object.freeze(this);
  }
  definition(id:string):ChargeDefinition<Modifier>|undefined{return this.#charges.get(id);}
  skill(id:string):ResourceSkill|undefined{return this.#skills.get(id);}
  support(id:string):ResourceNode|undefined{return this.#supports.get(id);}
  node(skillId:string,nodeId:string):ResourceNode|undefined{return this.#nodes.get(skillId)?.get(nodeId);}
}
