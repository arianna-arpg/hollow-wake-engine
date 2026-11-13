import {copySessionJSON,requireSession as need,sessionFields as fields,sessionInteger as integer,sessionText as text,sessionArray as array} from '../../dist/session-json.js';
const copy=value=>copySessionJSON(value);
const sync=(value,label)=>{need(!value||typeof value.then!=='function',label+'-must-be-synchronous');return value;};
const key=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
/** Reconciles one authoritative delivery namespace with a trusted live world.
 * Existing handles keep position, bob, grace, tier and other live fields.
 * A missing handle is created by the host; durable location/RNG restoration
 * belongs to that host, not to this bare-gem obligation protocol. */
export class WorldDeliveryBinding {
 #group;#admit;#world;#revision=0;#body;#handles=new Map();#rows=new Map();#busy=false;#failed=false;
 constructor({groupKey,admitDrop,world}){text(groupKey);need(typeof admitDrop==='function','delivery-codec-required');for(const name of ['list','inspect','create','remove'])need(typeof world?.[name]==='function','delivery-world-'+name+'-required');this.#group=groupKey;this.#admit=admitDrop;this.#world=world;}
 get status(){return this.#failed?'recovery-required':this.#busy?'reconciling':this.#revision?'ready':'unbound';}
 #check(){need(!this.#failed,'delivery-world-recovery-required');need(!this.#busy,'reentrant-delivery-world');}
 #row(raw){const row=copy(raw);fields(row,['id','characterKey','drop']);integer(row.id,1);text(row.characterKey);row.drop=copy(this.#admit(row.drop));return row;}
 #list(){const list=sync(this.#world.list(),'delivery-world-list');array(list,65536);return list.slice();}
 #inspect(handle){const value=sync(this.#world.inspect(handle),'delivery-world-inspect');if(value===undefined||value?.groupKey!==this.#group)return undefined;fields(value,['groupKey','id','characterKey','drop']);return this.#row({id:value.id,characterKey:value.characterKey,drop:value.drop});}
 reconcile(raw){
  this.#check();this.#busy=true;let mutating=false;
  try{
   const input=copy(raw);fields(input,['groupKey','revision','rows']);need(input.groupKey===this.#group,'foreign-delivery-group');integer(input.revision,1);array(input.rows,256);
   need(input.revision>=this.#revision,'stale-delivery-revision');
   const rows=input.rows.map(row=>this.#row(row)),wanted=new Map();for(const row of rows){need(!wanted.has(row.id),'duplicate-delivery-id');wanted.set(row.id,row);}
   const body=key(rows);need(input.revision!==this.#revision||body===this.#body,'conflicting-delivery-revision');
   const retained=new Map(),remove=[],seenHandles=new Set();
   for(const handle of this.#list()){
    const present=this.#inspect(handle);if(!present)continue;need(!seenHandles.has(handle),'duplicate-world-handle');seenHandles.add(handle);
    const expected=wanted.get(present.id);
    if(!expected||retained.has(present.id)){remove.push(handle);continue;}
    need(key(present)===key(expected),'delivery-world-payload-mismatch');retained.set(present.id,handle);
   }
   const missing=rows.filter(row=>!retained.has(row.id));
   // Complete validation precedes any world mutation. A callback that fails
   // after changing the world requires a fresh binding and authoritative read.
   mutating=true;
   for(const row of missing){const handle=sync(this.#world.create(copy({groupKey:this.#group,...row})),'delivery-world-create');need(handle!==undefined,'missing-created-delivery');need(key(this.#inspect(handle))===key(row),'invalid-created-delivery');retained.set(row.id,handle);}
   for(const handle of remove)sync(this.#world.remove(handle),'delivery-world-remove');
   const actual=new Map();for(const handle of this.#list()){const row=this.#inspect(handle);if(!row)continue;need(!actual.has(row.id),'duplicate-world-delivery');need(wanted.has(row.id)&&key(wanted.get(row.id))===key(row),'unreconciled-world-delivery');actual.set(row.id,handle);}
   need(actual.size===wanted.size,'missing-world-delivery');
   this.#revision=input.revision;this.#body=body;this.#handles=actual;this.#rows=wanted;
   return{revision:input.revision,created:missing.length,retired:remove.length,preserved:rows.length-missing.length};
  }catch(error){if(mutating)this.#failed=true;throw error;}finally{this.#busy=false;}
 }
 pickup(handle,characterKey){this.#check();need(this.#revision>0,'delivery-world-unbound');text(characterKey);const row=this.#inspect(handle);need(row&&this.#handles.get(row.id)===handle,'foreign-world-delivery');need(key(row)===key(this.#rows.get(row.id)),'delivery-world-payload-mismatch');return{kind:'pickup',characterKey,deliveryId:row.id};}
}

/** The host calls begin/end around its ordinary drop update. Eligibility stays
 * in the original world loop; waiting saves suppress repeat pickup requests
 * while animation, grace and world simulation continue. */
export class WorldDeliveryFrame {
 #binding;#owner;#characterOf;#actions=[];#ids=new Set();#open=false;#enabled=false;
 constructor({binding,owner,characterOf}){need(binding&&owner&&typeof characterOf==='function','delivery-frame-services-required');this.#binding=binding;this.#owner=owner;this.#characterOf=characterOf;}
 begin(){need(!this.#open,'delivery-frame-open');this.#open=true;this.#enabled=this.#owner.status==='ready'&&this.#binding.status==='ready';}
 offer(handle,seat){need(this.#open,'delivery-frame-not-open');if(!this.#enabled||this.#actions.length===16)return;const characterKey=sync(this.#characterOf(seat),'delivery-character');if(characterKey===undefined)return;
  const action=this.#binding.pickup(handle,characterKey);if(this.#ids.has(action.deliveryId))return;this.#ids.add(action.deliveryId);this.#actions.push(action);
 }
 cancel(){need(this.#open,'delivery-frame-not-open');this.#actions.length=0;this.#ids.clear();this.#open=false;this.#enabled=false;}
 end(){need(this.#open,'delivery-frame-not-open');const actions=this.#actions.length?this.#actions.slice():undefined;this.cancel();return actions?this.#owner.submit(actions):undefined;}
}
