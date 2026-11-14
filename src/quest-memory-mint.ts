import {Random} from './random.js';
import type {RandomState} from './types.js';
import {GemDropLifecycle,type GemDropPorts,type GemDropPoint,type MemoryKind} from './gem-drop.js';
import type {CharacterMemoryDelivery} from './memory-delivery.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionInteger as integer,sessionText as text,type SessionJSON} from './session-json.js';
export interface QuestMemoryPlacement {worldKey:string;pos:GemDropPoint;at:GemDropPoint;bob:number;tier?:number}
export type QuestMemoryRoll=object&{readonly then?:never};
export type QuestMemoryServices=Pick<GemDropPorts<QuestMemoryRoll,QuestMemoryRoll,string>,'clamp'|'floor'|'level'|'tileset'|'config'|'rollSkill'|'rollSupport'>&{presentation(at:GemDropPoint,kind:MemoryKind):SessionJSON};
export interface QuestMemoryContext {worldKey:string;at:GemDropPoint;tier?:number;services:QuestMemoryServices;readonly then?:never}
/** Host roll/clamp services must be synchronous and have no external effects.
 * The supplied stream is the only randomness they may consume. It expires when
 * preparation exits; no live World object or process-wide RNG is required. */
export type QuestMemoryFactory=(scope:Readonly<{random():number}>)=>QuestMemoryContext;
export interface PreparedQuestMemories {random:RandomState;drops:CharacterMemoryDelivery[];placements:QuestMemoryPlacement[];presentations:SessionJSON[]}
const copy=<T>(value:T):T=>copySessionJSON(value) as T;
function point(raw:unknown):GemDropPoint{const value=copy(raw);fields(value,['x','y']);need(typeof value.x==='number'&&Number.isFinite(value.x)&&typeof value.y==='number'&&Number.isFinite(value.y),'invalid-quest-mint-point');return{x:value.x,y:value.y};}
/** Prepare an owed, Memory-only payout against a detached stream. The returned
 * continuation and ground obligations must join the same storage transaction.
 * No recipient item IDs are allocated here. */
export function prepareQuestMemories(snapshot:RandomState,count:number,factory:QuestMemoryFactory):PreparedQuestMemories{
 const admitted=copy(snapshot);fields(admitted,['algorithm','state','draws']);const random=Random.restore(admitted);integer(count,0,64);
 const drops:CharacterMemoryDelivery[]=[],placements:QuestMemoryPlacement[]=[],presentations:SessionJSON[]=[];if(count===0)return{random:random.snapshot(),drops,placements,presentations};
 let active=true;
 const draw=()=>{need(active,'expired-quest-mint-stream');need(random.draws<Number.MAX_SAFE_INTEGER,'quest-mint-stream-exhausted');return random.next();};
 try{
  const context=factory(Object.freeze({random:draw}));need(context&&typeof context==='object'&&typeof (context as {then?:unknown}).then!=='function','quest-mint-factory-must-be-synchronous');
  text(context.worldKey);need(context.tier===undefined||Number.isFinite(context.tier),'invalid-quest-mint-tier');const at=point(context.at),worldKey=context.worldKey,tier=context.tier,p=context.services;
  const config=copy(p.config());fields(config,['skillShare','memoryShare','preformedShare','foundProvenance']);need(config.memoryShare===1,'quest-memory-policy-required');text(config.foundProvenance);
  for(const share of [config.skillShare,config.preformedShare])need(typeof share==='number'&&Number.isFinite(share)&&share>=0&&share<=1,'invalid-quest-memory-share');
  const unsupported=():never=>{throw Error('quest-mint-produced-bare-gem');};
  const runtime=new GemDropLifecycle<QuestMemoryRoll,QuestMemoryRoll,string>({sealed:()=>false,random:draw,clamp:position=>point(p.clamp(position)),floor:()=>p.floor(),level:()=>p.level(),tileset:()=>p.tileset(),config:()=>config,
   rollSkill:(bias,level,floor)=>p.rollSkill(bias,level,floor),rollSupport:(bias,level,floor)=>p.rollSupport(bias,level,floor),skill:unsupported,support:unsupported,pinned:unsupported,
   memory:(pos,origin,kind,unit,bob)=>{need(active,'expired-quest-mint-stream');drops.push({kind:'memory',memoryKind:kind,units:[copy(unit)]});placements.push({worldKey,pos:point(pos),at:point(origin),bob:bob*Math.PI*2,...(tier===undefined?{}:{tier})});presentations.push(copy(p.presentation(point(origin),kind)));}
  });
  for(let i=0;i<count;i++)runtime.drop({at,owed:true,from:'quest'});
  need(drops.length===count&&placements.length===count,'quest-mint-count');return{random:random.snapshot(),drops,placements,presentations};
 }finally{active=false;}
}
