import assert from 'node:assert/strict';
import {originalPouchData} from './compile-pouch-recall.mjs';
import {sha256} from './reference-utils.mjs';
/** Reuse the accepted, complete authored metadata in its original registry
 * order. Strip presentation/recall data at build time, never per reward. Drop
 * tuning remains an explicit host input, separate from this row identity. */
export function memoryRollRowsPack(){
 const source=JSON.parse(originalPouchData());
 const project=(rows,order,skill)=>{
  const index=new Map(rows.map(row=>[row.id,row]));
  return order.map(id=>{const row=index.get(id);assert(row,'Missing Memory roll row '+id);return{id,tags:[...row.tags],weight:row.weight,min:row.min,...(skill&&row.noDrop?{noDrop:true}:{})};});
 };
 const data={schemaVersion:1,capability:'memory-roll-rows/diagnostic',skills:project(source.skills,source.skillPool,true),supports:project(source.supports,source.supportPool,false),starters:[...source.starters]};
 return {...data,contentId:'hollow-wake-memory-roll-rows:sha256:'+sha256(JSON.stringify(data))};
}
