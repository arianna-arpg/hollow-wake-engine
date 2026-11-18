import {ItemContent} from '@hollow-wake/engine/items';
import {ItemInspector} from '@hollow-wake/engine/items/inspection';

const own=(rows,id)=>Object.hasOwn(rows,id)?rows[id]:undefined;
function snapshot(value){
 let entries=0;
 const copy=(v,depth=0)=>{
  if(++entries>200000||depth>24)throw Error('Inspection content exceeds its bounds');
  if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return v;
  if(typeof v==='string'){if(v.length>8192)throw Error('Inspection text is too long');return v;}
  if(!v||typeof v!=='object'||(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v))))throw Error('Invalid inspection content');
  if(Array.isArray(v))return Object.freeze(v.map(child=>copy(child,depth+1)));
  return Object.freeze(Object.fromEntries(Object.entries(v).map(([k,child])=>[k,copy(child,depth+1)])));
 };
 return copy(value);
}
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const text=value=>{if(typeof value!=='string'||value.length>8192)throw Error('Invalid inspection text');};
const detail=value=>{if(value!=='compact'&&value!=='full')throw Error('Unknown inspection detail');};
const key=value=>{if(typeof value!=='string'||value.length>256)throw Error('Invalid inspection ID');return value;};
/** Load once for an Inventory UI. Combat does not import this module or its text. */
export function createInventoryInspector(builds,input){
 const p=snapshot(input);
 if(typeof p.sourceCommit!=='string'||!/^[a-f0-9]{40}$/.test(p.sourceCommit))throw Error('Invalid inspection source');
 if(p.schemaVersion!==1||p.capability!=='inventory-inspection/v1'||p.buildContentId!==builds.contentId||p.terms.itemsId!==builds.items.id)throw Error('Inspection content mismatch');
 if(p.limits.maxEntries!==6||p.limits.maxCharacters!==640||p.limits.maxNameCharacters!==80)throw Error('Unsupported inspection limits');
 for(const r of Object.values(p.refs)){text(r.name);text(r.text);if([...r.name].length>80||[...r.text].length>640)throw Error('Unbounded trigger reference');}
 const checkCard=c=>{text(c.name);text(c.description);if(!Array.isArray(c.references)||c.references.length>6)throw Error('Invalid card references');for(const r of c.references){text(r.name);text(r.text);}};
 for(const rows of [...Object.values(p.cards),...Object.values(p.trees)])for(const c of Object.values(rows))checkCard(c);
 for(const s of Object.values(p.stats)){text(s.name);text(s.description);if(s.detail!==null)text(s.detail);if(!Number.isFinite(s.base)||typeof s.percent!=='boolean')throw Error('Invalid stat reference');}
 for(const f of p.families){text(f.prefix);text(f.blurb);if(f.detail!==undefined)text(f.detail);}
 const items=new ItemInspector(new ItemContent(builds.items),p.terms);
 const triggers=mods=>{
  if(!Array.isArray(mods)||mods.length>4096)throw Error('Invalid inspection modifiers');
  const result=[],seen=new Set();
  for(const m of mods){
   if(!m||typeof m.stat!=='string'||typeof m.kind!=='string'||!Number.isFinite(m.value))throw Error('Invalid inspection modifier');
   if(m.kind!=='flat'||m.value<=0||seen.has(m.stat))continue;
   seen.add(m.stat);const r=own(p.refs,m.stat);
   if(r&&result.length<p.limits.maxEntries)result.push({...r});
  }
  return result;
 };
 const present=(card,mode)=>{detail(mode);return card?{name:card.name,description:card.description,hasFullDetail:card.references.length>0,references:mode==='full'?clone(card.references):[]}:null;};
 return Object.freeze({
  sourceCommit:p.sourceCommit,
  card(kind,id,mode='compact'){const rows=own(p.cards,key(kind));if(!rows)throw Error('Unknown inspection category');return present(own(rows,key(id)),mode);},
  treeNode(skillId,nodeId,mode='compact'){key(skillId);key(nodeId);return present(own(p.trees,skillId)&&own(p.trees[skillId],nodeId),mode);},
  stat(id,mode='compact'){
   detail(mode);if(typeof id!=='string'||id.length>256)throw Error('Invalid stat ID');
   const s=own(p.stats,id);if(!s)return null;
   return{name:s.name,description:s.description,base:s.base,percent:s.percent,hasFullDetail:!!s.detail&&s.detail!==s.description,detail:mode==='full'&&s.detail!==s.description?s.detail:null};
  },
  triggerReferences:triggers,
  item(input){const result=items.inspect(input);return{...result,procReferences:triggers(result.modifiers)};},
  compare(candidate,worn){return items.compare(candidate,worn);},
 });
}
