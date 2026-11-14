import {copySessionJSON,requireSession as need,sessionInteger as integer} from './session-json.js';
export interface MemoryPublicationItem {uid:number;baseId:string;mem?:unknown[];x?:number;y?:number}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const copy=<T>(value:T):T=>copySessionJSON(value) as T;
const withoutUnits=(item:MemoryPublicationItem)=>{const {mem,...rest}=item;return rest;};
const withoutAddress=(item:MemoryPublicationItem)=>{const {uid,x,y,...rest}=item;return rest;};

/** Ack-time host publication for admitted Memory pickup views. Validate the
 * entire change before touching live items. A first pouch keeps the live drop
 * object through its callbacks; a merge keeps the standing pouch object. */
export function publishMemoryPickupItems<Item extends MemoryPublicationItem>(bag:Item[],drop:Item,view:readonly Item[],accepted:boolean):void {
 const next=copy(view);need(Array.isArray(next)&&Array.isArray(drop.mem),'invalid-memory-publication');
 if(!accepted){need(same(bag,next),'refused-memory-publication-changed');return;}
 need(next.length===bag.length||next.length===bag.length+1,'memory-publication-shape');
 const seen=new Set<number>();let target:Item|undefined,replacement:Item|undefined;
 for(let i=0;i<next.length;i++){
  const row=next[i];integer(row.uid,1);need(!seen.has(row.uid),'duplicate-memory-publication-id');seen.add(row.uid);
  const prior=bag[i];
  if(prior){
   need(prior.uid===row.uid,'memory-publication-order');
   if(same(prior,row))continue;
   need(!target&&prior!==drop&&prior.baseId===drop.baseId&&Array.isArray(prior.mem)&&same(withoutUnits(prior),withoutUnits(row))&&same(row.mem,[...prior.mem,...drop.mem]),'stale-memory-merge-publication');
   target=prior;replacement=row;
  }else{
   need(!target&&!bag.includes(drop)&&same(withoutAddress(row),withoutAddress(drop)),'stale-memory-birth-publication');target=drop;replacement=row;
  }
 }
 need(target&&replacement,'missing-memory-publication');
 if(target===drop){Object.assign(drop,replacement);bag.push(drop);}
 else target.mem=replacement.mem;
}
