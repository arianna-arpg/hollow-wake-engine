import {copySessionJSON,requireSession as need,sessionFields as fields,sessionInteger as integer,sessionText as text,sessionArray as array} from '../../dist/session-json.js';
const clone=value=>copySessionJSON(value);
const requireReply=value=>{need(value?.ok===true,value?.reason??'character-owner-refused');return value;};
const synchronous=(value,label)=>{need(!value||typeof value.then!=='function',label+'-must-be-synchronous');return value;};
/** Private integration candidate. The factory transfers sole access to a fresh
 * account owner. Storage compare-and-swap covers this whole saved aggregate,
 * including unchanged siblings and pending world deliveries. World simulation
 * continues while the storage promise is pending; publication is synchronous. */
export class DurableCharacterOwner {
 #pickupGrants=new Map();#owner;#storage;#key;#accountKey;#bindings;#handles;#live;#admitDrop;#current;#busy=false;#poisoned=false;
 static async open(options){const owner=new DurableCharacterOwner(options);await owner.#open(options.initial);return owner;}
 constructor({createOwner,storage,groupKey,accountKey,characters,live,admitDrop}){
  text(groupKey);text(accountKey);array(characters,7);need(characters.length>0,'character-group-empty');
  need(typeof createOwner==='function'&&typeof admitDrop==='function','character-services-required');
  need(typeof storage?.read==='function'&&typeof storage?.commit==='function','grouped-storage-required');
  for(const method of ['prepare','publish','discard','recoverRequired'])need(typeof live?.[method]==='function','live-'+method+'-required');
  this.#bindings=clone(characters);this.#handles=new Map();const keys=new Set();
  for(const row of this.#bindings){fields(row,['key','handle']);text(row.key);integer(row.handle,0,0xffffffff);need(!keys.has(row.key)&&!this.#handles.has(row.handle),'duplicate-character-binding');keys.add(row.key);this.#handles.set(row.handle,row.key);}
  this.#owner=createOwner({resolveDelivery:({accountKey,profile,deliveryId})=>{
   const grant=this.#pickupGrants.get(deliveryId);need(this.#busy&&accountKey===this.#accountKey&&grant?.profile===profile,'unauthorized-delivery-pickup');return clone(grant.drop);
  }});this.#storage=storage;this.#key=groupKey;this.#accountKey=accountKey;this.#live=live;this.#admitDrop=admitDrop;
 }
 get status(){return this.#poisoned?'recovery-required':this.#busy?'pending':this.#current?'ready':'opening';}
 #check(){need(!this.#poisoned,'character-recovery-required');need(this.#current,'character-not-ready');}
 #recover(error,lease){
  const first=!this.#poisoned;this.#poisoned=true;this.#owner=undefined;
  if(first)synchronous(this.#live.recoverRequired({groupKey:this.#key,error,lease}),'live-recovery');
 }
 #outbox(value){
  const out=clone(value);fields(out,['nextId','rows']);integer(out.nextId,1);array(out.rows,256);const seen=new Set(),keys=new Set(this.#bindings.map(row=>row.key));
  for(const row of out.rows){fields(row,['id','characterKey','drop']);integer(row.id,1,out.nextId-1);text(row.characterKey);need(keys.has(row.characterKey),'foreign-delivery-character');need(!seen.has(row.id),'duplicate-delivery-id');seen.add(row.id);
   row.drop=clone(this.#admitDrop(row.drop));
  }return out;
 }
 #copyGroup(group){
  // Saves are separately bounded by their own public JSON contract. Combining
  // eight legal records must not accidentally impose one record's byte limit.
  fields(group,['schemaVersion','capability','account','characters','outbox']);need(group.schemaVersion===1&&group.capability==='durable-character-group/diagnostic','unsupported-character-group');
  array(group.characters,7);need(group.characters.length===this.#bindings.length,'character-group-mismatch');
  const account=clone(group.account);need(account.key===this.#accountKey,'foreign-group-account');
  const seen=new Set(),characters=group.characters.map(row=>{fields(row,['key','save']);text(row.key);need(this.#bindings.some(b=>b.key===row.key)&&!seen.has(row.key),'foreign-group-character');seen.add(row.key);return{key:row.key,save:clone(row.save)};});
  return{schemaVersion:1,capability:'durable-character-group/diagnostic',account,characters,outbox:this.#outbox(group.outbox)};
 }
 #snapshot(body,revision){integer(revision,1);return{revision,body:this.#copyGroup(body)};}
 read(){this.#check();return this.#snapshot(this.#current.body,this.#current.revision);}
 #saved(outbox){return{schemaVersion:1,capability:'durable-character-group/diagnostic',
  account:requireReply(this.#owner.command({op:'account-save',account:1})).save,
  characters:this.#bindings.map(row=>({key:row.key,save:requireReply(this.#owner.command({op:'workshop-save',profile:row.handle})).save})),outbox};}
 async #open(initial){
  try{
   const stored=await this.#storage.read(this.#key);
   if(stored){
    fields(stored,['revision','body']);const current=this.#snapshot(stored.body,stored.revision);
    requireReply(this.#owner.command({op:'restore-account',account:1,save:current.body.account}));
    for(const binding of this.#bindings){const row=current.body.characters.find(row=>row.key===binding.key);requireReply(this.#owner.command({op:'restore-workshop',profile:binding.handle,account:1,save:row.save}));}
    // Cold admission may normalize saved investment. Keep the stored revision
    // as the comparison fence; subsequent writes use the admitted values.
    this.#current=this.#snapshot(this.#saved(current.body.outbox),current.revision);return;
   }
   need(initial,'character-group-missing');fields(initial,['account','characters']);array(initial.characters,7);need(initial.characters.length===this.#bindings.length,'character-group-mismatch');
   const account=clone(initial.account);need(account.key===this.#accountKey,'foreign-group-account');need(!Object.hasOwn(account,'op')&&!Object.hasOwn(account,'account'),'initial-account-address');
   requireReply(this.#owner.command({...account,op:'open-account',account:1}));
   const seen=new Set();for(const row of initial.characters){fields(row,['key','start']);need(!seen.has(row.key),'duplicate-character-binding');seen.add(row.key);const binding=this.#bindings.find(b=>b.key===row.key);need(binding,'foreign-group-character');
    const start=clone(row.start);for(const field of ['op','profile','account'])need(!Object.hasOwn(start,field),'initial-character-address');
    requireReply(this.#owner.command({...start,op:'open-workshop',profile:binding.handle,account:1}));
   }
   const body=this.#copyGroup(this.#saved({nextId:1,rows:[]})),result=await this.#storage.commit(this.#key,0,this.#copyGroup(body));
   need(result?.status==='committed'&&result.revision===1,'initial-character-save-refused');this.#current={revision:1,body};
  }catch(error){this.#poisoned=true;this.#owner=undefined;throw error;}
 }
 #commands(actions){
  const values=clone(actions);array(values,16);need(values.length>0,'invalid-command-batch');
  return values.map(row=>{
   if(row.kind==='account'){fields(row,['kind','command']);return{op:'account',account:1,command:row.command};}
   if(row.kind==='activate'){fields(row,['kind','characterKey']);const binding=row.characterKey===null?null:this.#bindings.find(b=>b.key===row.characterKey);need(row.characterKey===null||binding,'foreign-group-character');return{op:'activate-workshop',account:1,profile:binding?.handle??null};}
   if(row.kind==='pickup'){
    fields(row,['kind','characterKey','deliveryId']);integer(row.deliveryId,1);const binding=this.#bindings.find(b=>b.key===row.characterKey);need(binding,'foreign-group-character');
    const delivery=this.#current.body.outbox.rows.find(d=>d.id===row.deliveryId);need(delivery,'unknown-pending-delivery');need(!this.#pickupGrants.has(row.deliveryId),'duplicate-pickup-delivery');
    this.#pickupGrants.set(row.deliveryId,{profile:binding.handle,drop:delivery.drop});
    return{op:'workshop',profile:binding.handle,command:{op:'character-pickup',command:{op:'pickup',deliveryId:row.deliveryId}}};
   }
   need(row.command?.op!=='character-pickup','durable-pickup-action-required');
   fields(row,['kind','characterKey','command']);need(row.kind==='character','invalid-character-action');const binding=this.#bindings.find(b=>b.key===row.characterKey);need(binding,'foreign-group-character');return{op:'workshop',profile:binding.handle,command:row.command};
  });
 }
 async submit(actions){
  this.#check();need(!this.#busy,'character-save-pending');this.#busy=true;
  let pending,lease,prepared=false,commitAttempted=false,committed=false,leaseUncertain=false;
  try{
   pending=requireReply(this.#owner.command({op:'prepare',commands:this.#commands(actions)}));
   if(!pending.token)return{status:'unchanged',replies:clone(pending.replies),revision:this.#current.revision};
   const journal=this.#owner.preparedJournal(pending.token),body=this.#copyGroup(this.#current.body);
   for(const write of pending.writes){const saved=requireReply(this.#owner.command({op:'prepared-save',token:pending.token,kind:write.kind,handle:write.handle})).save;
    if(write.kind==='account'){need(write.handle===1,'foreign-group-write');body.account=saved;}
    else{const key=this.#handles.get(write.handle),row=body.characters.find(row=>row.key===key);need(row,'foreign-group-write');row.save=saved;}
   }
   const deliveries=[],settlements=[];
   for(const entry of journal){
    if(entry.command.op!=='workshop'||entry.command.command?.op!=='character-pickup')continue;
    const id=entry.command.command.command.deliveryId,grant=this.#pickupGrants.get(id);need(grant?.profile===entry.command.profile,'unauthorized-delivery-pickup');
    const reply=entry.reply.reply;need(reply?.deliveryId===id,'pickup-reply-mismatch');
    if(reply.accepted===true){
     const index=body.outbox.rows.findIndex(row=>row.id===id);need(index>=0,'unknown-pending-delivery');
     const [delivery]=body.outbox.rows.splice(index,1);settlements.push({id,characterKey:this.#handles.get(entry.command.profile),sourceCharacterKey:delivery.characterKey});
    }
   }
   for(const entry of journal){const drops=entry.reply.reply?.worldDrops??[];array(drops,64);if(!drops.length)continue;
    need(entry.command.op==='workshop','unowned-world-delivery');const key=this.#handles.get(entry.command.profile);need(key,'foreign-group-write');
    for(const drop of drops){integer(body.outbox.nextId,1,Number.MAX_SAFE_INTEGER-1);const row={id:body.outbox.nextId++,characterKey:key,drop:clone(this.#admitDrop(drop))};body.outbox.rows.push(row);deliveries.push(row);}
   }
   const next=this.#copyGroup(body);integer(this.#current.revision,1,Number.MAX_SAFE_INTEGER-1);
   lease=synchronous(this.#live.prepare({groupKey:this.#key,journal,current:this.read(),candidate:this.#snapshot(next,this.#current.revision+1),deliveries:clone(deliveries),settlements:clone(settlements)}),'live-prepare');prepared=true;
   // Every sibling remains in the group even when its logical version did not
   // change. The storage port must compare this aggregate's revision atomically.
   commitAttempted=true;const result=await this.#storage.commit(this.#key,this.#current.revision,this.#copyGroup(next));
   if(result?.status!=='committed'){
    need(result?.status==='refused'||result?.status==='conflict','unknown-storage-outcome');commitAttempted=false;
    prepared=false;
    try{synchronous(this.#live.discard(lease),'live-discard');}catch(error){leaseUncertain=true;throw error;}
    requireReply(this.#owner.command({op:'abort-prepared',token:pending.token}));pending=undefined;
    if(result.status==='conflict')this.#recover(Error('stale-character-group'),undefined);
    return{status:result.status,revision:this.#current.revision};
   }
   committed=true;need(result.revision===this.#current.revision+1,'invalid-storage-revision');
   requireReply(this.#owner.command({op:'commit-prepared',token:pending.token}));pending=undefined;
   synchronous(this.#live.publish(lease,{groupKey:this.#key,revision:result.revision,journal,deliveries:clone(deliveries),settlements:clone(settlements)}),'live-publish');prepared=false;
   this.#current={revision:result.revision,body:next};return{status:'committed',revision:result.revision,replies:clone(pending?.replies??journal.map(row=>row.reply))};
  }catch(error){
   if(this.#poisoned||commitAttempted||committed||leaseUncertain)this.#recover(error,lease);
   else{
    try{if(prepared)synchronous(this.#live.discard(lease),'live-discard');if(pending?.token)requireReply(this.#owner.command({op:'abort-prepared',token:pending.token}));}
    catch(failure){this.#recover(failure,lease);}
   }
   throw error;
  }finally{this.#pickupGrants.clear();this.#busy=false;}
 }
}
