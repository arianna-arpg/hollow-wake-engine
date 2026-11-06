import {CraftingContent} from './crafting-content.js';
import {SkillProgression,empowermentRank,empowermentNumeral} from './skill-progression.js';
import {SKILL_GEM_BASE,SUPPORT_GEM_BASE} from './gem-residence.js';
import type {MaterialAmount} from './crafting.js';
import type {SupportCrew,SupportModifier,SupportRules,SupportSkill,SupportSkillDefinition,SupportSocket} from './support-rules.js';
import type {ItemInstance,SkillGemPayload,SupportGemPayload} from './item-types.js';
import {copySessionJSON,requireSession as need,sessionArray,sessionInteger,sessionRecord,sessionText} from './session-json.js';
import {cargoReference,pouchGroups,provenance,readDisplayConfig,skillFace,supportFace,
  type CargoDisplayConfig,type CargoReader,type CargoReference} from './cargo-display.js';
export {CargoAtlas,cargoReference} from './cargo-display.js';
export type {CargoReader,CargoReference,CargoDisplayConfig,CargoPageLoader,CargoRange} from './cargo-display.js';

export interface CargoView {
  inBag?:boolean; lane?:'sell'|'break'|null; confirmMemorySale?:boolean;
  attributes?:Record<string,number>;
}
export interface SupportFitRow {slot:number; skillId:string; fits:boolean; sockets:number; occupied:number}
/** The host supplies its actual bar and the verdict of its live socket gate for
 * this specific support and cut. Omit this port when no hero context is known. */
export type CargoFitReader=(gem:SupportGemPayload)=>readonly SupportFitRow[];
export function createCargoFitReader<M extends SupportModifier,D extends SupportSkillDefinition<M>,S extends SupportSocket<M>,I extends SupportSkill<M,D,S>>(
  rules:SupportRules<M,D,S,I>, support:(id:string)=>S['def'], bar:()=>readonly (I|null)[], crew:(skill:I)=>SupportCrew<D>,
):CargoFitReader {
  return gem=>{
    const def=support(gem.supportId),slots=bar();
    return slots.flatMap((inst,slot)=>inst?[{slot,skillId:inst.def.id,
      fits:rules.fitsOrCrew(def,inst,crew(inst),gem.rolled),sockets:inst.sockets.length,
      occupied:inst.sockets.filter(s=>s!==null).length}]:[]);
  };
}
export interface CargoQuote {action:'sell'|'break'; amount:MaterialAmount|null; material?:{label:string;glyph:string;color:string}; reason?:'granted'|'memory'; confirm:boolean}
export interface CargoCard {
  kind:'skill'|'support'|'memory';title:string;color:string;meta:string;lines:string[];locked:boolean;
  gesture:'learn'|'socket'|'recall'|null;quote:CargoQuote|null;
  showcase?:{skillId:string;level:number;supports:{id:string;level:number}[]};
  requirements?:{id:string;label:string;need:number;met:boolean|null}[];
  compatibility?: (SupportFitRow & {name:string;capacity:'full'|'none'|null})[]|null;
  pouch?:{kind:string;count:number;hidden:number;newest:string;groups:{key:string;source:string;count:number;pin?:{name:string;color:string}}[]};
}
function ownItem(input:unknown):ItemInstance {
  const item=copySessionJSON(input);sessionRecord(item);sessionText(item.baseId);
  need(item.locked===undefined||typeof item.locked==='boolean','invalid-lock');
  need(item.gem===undefined||item.mem===undefined,'ambiguous-cargo');
  if(item.gem!==undefined){
    const g=item.gem;sessionRecord(g);sessionInteger(g.level,1);
    if(g.kind==='skill'){
      need(item.baseId===SKILL_GEM_BASE,'gem-base');sessionText(g.skillId);sessionText(g.rarity);sessionArray(g.sockets,1024);
      for(const s of g.sockets)if(s!==null){sessionRecord(s);sessionText(s.supportId);sessionInteger(s.level,1);}
      if(g.empowermentRank!==undefined)sessionInteger(g.empowermentRank);
      need(g.granted===undefined||typeof g.granted==='boolean','invalid-granted');
    }else{
      need(g.kind==='support'&&item.baseId===SUPPORT_GEM_BASE,'gem-base');sessionText(g.supportId);
      if(g.rolled!==undefined){sessionRecord(g.rolled);for(const [k,v] of Object.entries(g.rolled)){sessionText(k);sessionText(v);}}
    }
  }else{
    sessionArray(item.mem);need(item.mem.length>0,'empty-memory');
    for(const u of item.mem){
      sessionRecord(u);sessionText(u.d);sessionInteger(u.s,0,0xffffffff);
      if(u.g!==undefined){sessionRecord(u.g);need(u.g.k==='skill'||u.g.k==='support','invalid-memory-pin');sessionText(u.g.id);}
    }
  }
  return item as unknown as ItemInstance;
}
function ownView(input:CargoView):CargoView {
  const v=copySessionJSON(input);sessionRecord(v);
  need(Object.keys(v).every(k=>['inBag','lane','confirmMemorySale','attributes'].includes(k)),'unknown-view-field');
  for(const b of [v.inBag,v.confirmMemorySale])need(b===undefined||typeof b==='boolean','invalid-view-flag');
  need(v.lane==null||v.lane==='sell'||v.lane==='break','invalid-lane');
  if(v.attributes!==undefined){sessionRecord(v.attributes);for(const n of Object.values(v.attributes))need(typeof n==='number','invalid-attribute');}
  return v as CargoView;
}
export class CargoInspector {
  readonly #skills:SkillProgression;
  readonly #craft:CraftingContent;
  readonly #config:CargoDisplayConfig;
  readonly #kinds=new Map<string,string>();
  constructor(skills:SkillProgression,crafting:CraftingContent,config:unknown){
    need(skills instanceof SkillProgression&&crafting instanceof CraftingContent&&skills.pack.services,'missing-cargo-rules');
    this.#skills=skills;this.#craft=crafting;
    this.#config=readDisplayConfig(config,skills.pack.contentId,crafting.pack.contentId);
    for(const [id,k] of Object.entries(this.#config.kinds)){
      need(Object.hasOwn(crafting.pack.sell.memoryUnit,id),'missing-pouch-price');this.#kinds.set(k.base,id);
    }
  }
  /** A range-based host can fetch only the referenced display records, then
   * call inspect. No source lookup is needed for hidden provenance groups. */
  references(input:unknown):CargoReference[]{
    const item=ownItem(input),gem=item.gem;
    if(gem)return [gem.kind==='skill'?cargoReference('skills',gem.skillId):cargoReference('supports',gem.supportId)];
    need(this.#kinds.has(item.baseId),'unknown-pouch');
    const units=item.mem!,refs=new Map<string,CargoReference>();
    function add(table:CargoReference['table'],id:string){refs.set(table+'/'+id,cargoReference(table,id));}
    for(const {unit} of pouchGroups(units,this.#config.maxGroups).rows){
      add('monsters',unit.d);if(unit.g?.k==='support')add('supports',unit.g.id);
    }
    add('monsters',units[units.length-1].d);return [...refs.values()];
  }
  inspect(input:unknown,context:CargoView,read:CargoReader,fit?:CargoFitReader):CargoCard|null {
    const item=ownItem(input),view=ownView(context),locked=item.locked??false;
    need(typeof read==='function'&&(fit===undefined||typeof fit==='function'),'invalid-card-reader');
    const card=item.gem?.kind==='skill'?this.#skillCard(item.gem,view,locked,read)
      :item.gem?.kind==='support'?this.#supportCard(item.gem,view,locked,read,fit):this.#pouch(item,view,read);
    const quote=card?.quote;
    if(quote?.amount){
      const mat=this.#craft.pack.essences.find(e=>e.id===quote.amount!.essence);need(mat,'unknown-quote-material');
      quote.material={label:mat.label,glyph:mat.glyph,color:mat.color};
    }
    return card;
  }
  #skillCard(g:SkillGemPayload,v:CargoView,locked:boolean,read:CargoReader):CargoCard|null {
    const face=skillFace(read,g.skillId);if(!face)return null;
    const def=this.#skills.skill(g.skillId),r=this.#skills.pack.services!.rarities.find(r=>r.id===g.rarity);
    need(r,'unknown-gem-rarity');
    const rank=empowermentRank(g),suffix=empowermentNumeral(rank),meta='Skill Memory · '+r.label;
    const title=def.name+(suffix?' '+suffix:'')+' Lv '+g.level;
    const supports=g.sockets.flatMap(s=>s?[{id:s.supportId,level:s.level}]:[]);
    const lines=[meta+' · '+g.sockets.length+' socket'+(g.sockets.length===1?'':'s')+(g.granted?' · granted':''),face.tags.join(' · '),face.description];
    if(rank){
      const points=this.#skills.ability.empowermentPoints(g);
      lines.push(points+' passive-only point'+(points===1?'':'s')+' from empowerment'+(this.#skills.tree(g.skillId).hasPassive()?'':' · banked until this skill has a passive slot'));
    }
    if(supports.length)lines.push('Socketed: '+supports.map(s=>this.#supportName(s.id)+' L'+s.level).join(' · '));
    const requirements=Object.entries(face.requirements??{}).map(([id,n])=>({id,label:this.#config.attributes[id]??id,need:n,met:v.attributes?(v.attributes[id]??0)>=n:null}));
    lines.push('Requires: '+(face.requirements?requirements.map(q=>q.label+' '+q.need).join(', '):'none'));
    const lane=v.inBag&&!locked?v.lane:null;
    const amount=lane==='sell'?this.#craft.rules.sellSkillYield(g):lane==='break'?this.#craft.rules.salvageSkillYield(g):null;
    return {kind:'skill',title,color:r.color,meta,lines,locked,requirements,showcase:{skillId:g.skillId,level:g.level,supports},
      gesture:v.inBag&&!v.lane?'learn':null,quote:lane?{action:lane,amount,...(amount?{}:{reason:'granted' as const}),confirm:false}:null};
  }
  #supportName(id:string):string {
    try{return this.#skills.support(id).name;}catch{return id;}
  }
  #supportCard(g:SupportGemPayload,v:CargoView,locked:boolean,read:CargoReader,fit?:CargoFitReader):CargoCard|null {
    const face=supportFace(read,g.supportId);if(!face)return null;
    const def=this.#skills.support(g.supportId),lines=['Support Memory',face.description];
    if(face.axes){
      for(const axis of face.axes){
        const row=axis.rows.find(r=>r.id===g.rolled?.[axis.id])??axis.rows[0];
        if(row)lines.push('◈ '+row.line);
      }
      lines.push('Cut once at the vein — fixed forever. Read it before you choose its skill.');
    }
    let compatibility:CargoCard['compatibility']=null;
    if(fit){
      const query:SupportGemPayload={kind:'support',supportId:g.supportId,level:g.level,...(g.rolled?{rolled:{...g.rolled}}:{})};
      const rows=copySessionJSON(fit(query));sessionArray(rows,128);let last=-1;
      compatibility=rows.map(row=>{
        sessionRecord(row);sessionInteger(row.slot,last+1);sessionText(row.skillId);
        need(typeof row.fits==='boolean','invalid-fit');sessionInteger(row.sockets);sessionInteger(row.occupied,0,row.sockets);
        last=row.slot;
        return {slot:row.slot,skillId:row.skillId,name:this.#skills.skill(row.skillId).name,fits:row.fits,sockets:row.sockets,occupied:row.occupied,
          capacity:row.fits&&row.occupied===row.sockets?(row.sockets?'full' as const:'none' as const):null};
      });
    }
    const lane=v.inBag&&!locked?v.lane:null;
    const amount=lane==='sell'?this.#craft.rules.sellSupportYield(g):lane==='break'?this.#craft.rules.salvageSupportYield(g):null;
    return {kind:'support',title:def.name+' Lv '+g.level,color:face.color,meta:'Support Memory',lines,locked,compatibility,
      gesture:v.inBag&&!v.lane?'socket':null,quote:lane?{action:lane,amount,confirm:false}:null};
  }
  #pouch(item:ItemInstance,v:CargoView,read:CargoReader):CargoCard {
    const id=this.#kinds.get(item.baseId);need(id,'unknown-pouch');
    const k=this.#config.kinds[id],units=item.mem!,count=units.length,locked=item.locked??false;
    const {rows,hidden}=pouchGroups(units,this.#config.maxGroups);
    const groups=rows.map(({key,unit,count})=>{
      const source=provenance(unit.d,this.#config,read);
      if(!unit.g)return {key,source,count};
      const g=unit.g;
      let name=g.id,color='#c8a84b';
      if(g.k==='skill'){
        try{const def=this.#skills.skill(g.id);name=def.name;color=def.color??color;}catch{/* Retired pin keeps its durable name. */}
      }else{
        const face=supportFace(read,g.id);if(face){name=this.#supportName(g.id);color=face.color;}
      }
      return {key,source,count,pin:{name,color}};
    });
    const newest=provenance(units[count-1].d,this.#config,read);
    const lines=[k.name+' · ×'+count+' held'];
    if(k.facets)lines.push('committed before the recall: choose a FACET (one attribute triad) — the grant is a skill of that facet');
    for(const g of groups)lines.push('×'+g.count+' — '+g.source+(g.pin?' — '+this.#config.pinned+' '+g.pin.name:''));
    if(hidden)lines.push('…and '+hidden+' other '+(hidden===1?'kind':'kinds'));
    lines.push('newest: '+newest);
    const lane=locked?null:v.lane;
    const quote:CargoQuote|null=lane==='sell'?{action:lane,amount:this.#craft.rules.sellMemoryYield(id,count),confirm:count>=this.#config.confirmFrom&&v.confirmMemorySale===true}:
      lane==='break'?{action:lane,amount:null,reason:'memory',confirm:false}:null;
    return {kind:'memory',title:k.name,color:k.color,meta:'×'+count+' · each unit sealed at its drop',lines,locked,gesture:'recall',quote,
      pouch:{kind:id,count,hidden,newest,groups}};
  }
}
