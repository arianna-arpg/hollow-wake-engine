import {compileMemoryRollPolicy,type MemoryRollContent,type MemoryRollContext,type MemoryRollDefinition,type MemoryRollPlan} from './memory-roll-policy.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionArray as array,sessionText as text,sessionInteger as integer,sessionBoolean as boolean} from './session-json.js';
type Rows=Pick<MemoryRollContent,'skills'|'supports'|'starters'>;
/** Admit the compact authored projection once when content is loaded. No
 * original-game registry, database, item factory or global random is required.
 * Content IDs are caller-supplied identities, not signatures/authentication. */
export class MemoryRollCatalogue {
 readonly #rows:Rows;readonly #id:string;
 constructor(input:unknown){
  const pack=copySessionJSON(input);fields(pack,['schemaVersion','capability','contentId','skills','supports','starters']);
  need(pack.schemaVersion===1&&pack.capability==='memory-roll-rows/diagnostic','unsupported-memory-roll-content');text(pack.contentId);this.#id=pack.contentId;
  const admit=(value:unknown,skill:boolean):MemoryRollDefinition[]=>{
   array(value,4096);const ids=new Set<string>();
   return value.map(value=>{
    fields(value,skill?['id','tags','weight','min','noDrop']:['id','tags','weight','min']);text(value.id);need(!ids.has(value.id),'duplicate-memory-roll-id');ids.add(value.id);
    array(value.tags,128);for(const tag of value.tags)text(tag);integer(value.min);
    need(typeof value.weight==='number'&&Number.isFinite(value.weight)&&value.weight>=0,'invalid-memory-roll-weight');
    if(value.noDrop!==undefined)boolean(value.noDrop);
    return value as unknown as MemoryRollDefinition;
   });
  };
  const skills=admit(pack.skills,true),supports=admit(pack.supports,false),ids=new Set(skills.map(row=>row.id));
  array(pack.starters,4096);const starters=new Set<string>();for(const id of pack.starters){text(id);need(ids.has(id)&&!starters.has(id),'invalid-memory-roll-starter');starters.add(id);}
  need(skills.some(row=>!row.noDrop&&starters.has(row.id)),'missing-memory-roll-starter');this.#rows={skills,supports,starters};
 }
 get contentId():string{return this.#id;}
 prepare(rules:MemoryRollContent['rules'],context:MemoryRollContext):MemoryRollPlan {
  return compileMemoryRollPolicy({...this.#rows,rules},context);
 }
}
