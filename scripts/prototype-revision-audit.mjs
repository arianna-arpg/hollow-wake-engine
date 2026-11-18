import assert from 'node:assert/strict';

export function contentChanges(a,b,at='',rows=[]){
 if(JSON.stringify(a)===JSON.stringify(b))return rows;
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
  for(const key of new Set([...Object.keys(a),...Object.keys(b)]))contentChanges(a[key],b[key],at+'/'+key,rows);
 }else rows.push({path:at,before:a,after:b});
 return rows;
}
/** Explicit leaf roles, never a blanket removal of strings/IDs from comparison. */
export function auditRevisionContent(prior,catalogue,runtime){
 assert.deepEqual(catalogue.registryOrder,prior.catalogue.registryOrder,'Registry order changed');
 assert.deepEqual(catalogue.sourceRules,prior.catalogue.sourceRules,'Executable catalogue rule changed');
 const diffs={catalogue:contentChanges(prior.catalogue.tables,catalogue.tables),runtime:contentChanges(prior.runtime,runtime)};
 const textRoles=new Set(['name','label','description','desc','blurb','flavor','offerFlavor','offerLabel','text','line']);
 const decoyIndex=catalogue.tables.skills.findIndex(row=>row.id==='decoy');
 const progressionIndex=runtime.progression.skills.findIndex(row=>row.id==='decoy');
 const exceptions=new Set(['/skills/'+decoyIndex+'/value/tree/nodes/5/over','/registries/skills/decoy/tree/nodes/5/over','/progression/skills/'+progressionIndex+'/tree/nodes/5/over']);
 const mechanical=[];
 for(const[domain,rows]of Object.entries(diffs))for(const row of rows){
  if(exceptions.has(row.path)){
   assert.deepEqual(row.before,{tags:{add:['buff']}});assert.equal(row.after,undefined);
   mechanical.push({domain,path:row.path,change:'Decoy tree node no longer adds buff tag'});continue;
  }
  assert(textRoles.has(row.path.split('/').at(-1)), 'Unreviewed content change: '+domain+row.path);
  assert((typeof row.before==='string'||row.before===undefined)&&(typeof row.after==='string'||row.after===undefined),'Non-text change: '+domain+row.path);
 }
 assert.equal(mechanical.length,3,'Missing audited Decoy change');
 return{counts:Object.fromEntries(Object.entries(diffs).map(([name,rows])=>[name,rows.length])),mechanical,
  textChanges:Object.fromEntries(Object.entries(diffs).map(([name,rows])=>[name,rows.filter(r=>!exceptions.has(r.path)).map(r=>r.path)]))};
}
