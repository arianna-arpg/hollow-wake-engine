import {fitSupport,fitPage} from './support-fit.mjs';
import {godotDispatch} from '../godot/shared/number-wire.mjs';

const tables=['skills','supports','monsters'];
const missing=Symbol('missing');
export function create(index){
  if(index.format!=='workshop-support-pages/v1'||index.pages?.length!==128)throw Error('invalid-support-index');
  return {count:index.pages.length,lengths:index.pages.map(p=>p.length),pages:new Map(),previous:null,active:null};
}
function advance(host){
  const a=host.active;
  try{
    const rows=fitSupport(a.bar,a.support,(table,id)=>{
      const key=table+'/'+id;
      if(a.records.has(key))return a.records.get(key);
      const index=fitPage(id,host.count),page=host.pages.get(index);
      if(!a.touched.has(index)){a.touched.add(index);a.bytes+=host.lengths[index];}
      if(host.previous?.has(key)){const value=host.previous.get(key);a.records.set(key,value);return value;}
      if(!page){a.pending=index;throw missing;}
      const value=Object.hasOwn(page[table],id)?page[table][id]:undefined;
      a.records.set(key,value);return value;
    });
    // Consecutive card queries often share a bar. Retain only the individual
    // immutable definitions actually consulted. The sum of their complete
    // source-page sizes is a conservative upper bound on retained source data.
    host.previous=a.records.size<=128&&a.bytes<=256*1024?a.records:null;
    host.active=null;return {ok:true,rows};
  }catch(e){
    if(e===missing)return {ok:true,page:a.pending};
    host.active=null;return {ok:false,reason:'invalid-support-query'};
  }
}
export const dispatch=godotDispatch((host,r)=>{
  if(r?.op==='fits'){host.active={bar:r.bar,support:r.support,records:new Map(),touched:new Set(),bytes:0,pending:-1};return advance(host);}
  if(r?.op!=='supply'||!host.active||r.page!==host.active.pending)return {ok:false,reason:'unexpected-support-page'};
  try{
    if(typeof r.text!=='string'||r.text.length>48*1024)throw Error();
    const page=JSON.parse(r.text);
    for(const table of tables)if(!page[table]||typeof page[table]!=='object'||Array.isArray(page[table]))throw Error();
    if(host.pages.size===4)host.pages.delete(host.pages.keys().next().value);
    host.pages.set(r.page,page);
  }catch{host.active=null;return {ok:false,reason:'invalid-support-page'};}
  return advance(host);
});
