import {copySessionJSON,requireSession as need,sessionArray as array,sessionInteger as integer} from '../../dist/session-json.js';
function same(a,b){
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));
}
/** Trusted admitted inventory projections. Ordinary pickup only appends one
 * gem: retain the live bag and every preceding item reference. Validate the
 * entire prefix before mutation, and own a separate copy of the new item. */
export function publishGemPickupItems(target,source){
 array(target);array(source);need(source.length===target.length||source.length===target.length+1,'non-pickup-inventory-change');
 for(let n=0;n<target.length;n++)need(same(target[n],source[n]),'stale-live-pickup-inventory');
 if(source.length>target.length)target.push(copySessionJSON(source[target.length]));
}
/** Recovery owns the whole bag. Preserve unchanged live bodies by UID while
 * replacing divergent bodies and removing stale/duplicate world references. */
export function restoreOwnedInventory(target,source){
 array(target);array(source);const existing=new Map(),seen=new Set();
 for(const row of target)if(row&&typeof row==='object'&&!existing.has(row.uid))existing.set(row.uid,row);
 const next=source.map(row=>{integer(row.uid,1);need(!seen.has(row.uid),'duplicate-restored-item');seen.add(row.uid);const previous=existing.get(row.uid);return previous&&same(previous,row)?previous:copySessionJSON(row);});
 target.splice(0,target.length,...next);
}
