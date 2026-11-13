import type {PassiveAccess,PassiveHost} from './passive-policy.js';

/** Borrowed state and synchronous effects. The host supplies admitted identity,
 * service authority and bodies; it owns persistence and publication. */
export interface PassiveActionPorts<S,I,B> {
 session(seat:S):PassiveHost;
 access(seat:S):PassiveAccess;
 refundRefusal(seat:S):string|null;
 graft(seat:S,key:string):string|null;
 knownIds(seat:S):ReadonlySet<string>;
 known(seat:S,id:string):I|undefined;
 /** Return a snapshot of the learned and granted instances, in that order. */
 skills(seat:S):readonly I[];
 /** Capture eligible ordinary summons before the passive state changes. */
 summons(seat:S):readonly B[];
 alive(body:B):boolean;
 recalculate(seat:S):undefined;
 refreshCompany(seat:S):undefined;
 resyncSupports(inst:I):undefined;
 refreshSummon(seat:S,body:B):undefined;
 markMetaDirty(seat:S):undefined;
 markCharacterDirty():undefined;
 fail(seat:S,key:string,reason:string):undefined;
}

/** Original passive action ordering over an explicitly owned policy session.
 * Exceptions retain preceding borrowed writes. This is not a transaction. */
export class PassiveActions<S,I,B> {
 readonly #p:PassiveActionPorts<S,I,B>;#busy=false;
 constructor(ports:PassiveActionPorts<S,I,B>){
  const names=['session','access','refundRefusal','graft','knownIds','known','skills','summons','alive',
   'recalculate','refreshCompany','resyncSupports','refreshSummon','markMetaDirty','markCharacterDirty','fail'] as const;
  for(const name of names)if(typeof ports[name]!=='function')throw Error('Passive action '+name+' port is required');
  this.#p=Object.fromEntries(names.map(name=>[name,ports[name].bind(ports)])) as unknown as PassiveActionPorts<S,I,B>;
 }
 #run<R>(work:()=>R):R{
  if(this.#busy)throw Error('Reentrant passive action');this.#busy=true;
  try{return work();}finally{this.#busy=false;}
 }
 #roots(seat:S,realm:string):void{
  if(this.#p.session(seat).ensureRealmRoots(realm).length)this.#p.recalculate(seat);
 }
 allocate(seat:S,nodeId:string,option?:string):boolean{return this.#run(()=>{
  const p=this.#p,host=p.session(seat),node=host.policy.node(nodeId);if(!node)return false;
  const realm=host.policy.realm(node),access=p.access(seat);
  if(!realm||!host.policy.open(realm,access))return false;
  // The free root has its own rebuild even if the paid transition is refused.
  this.#roots(seat,realm.id);
  if(!p.session(seat).allocate(nodeId,access,option).accepted)return false;
  p.recalculate(seat);p.refreshCompany(seat);return true;
 });}
 refund(seat:S,nodeId:string):boolean{return this.#run(()=>{
  const p=this.#p,quote=p.session(seat).quoteRefund(nodeId),why=p.refundRefusal(seat)??quote.refusal;
  if(why){p.fail(seat,'passiveRefund',why);return false;}
  const bodies=p.summons(seat);
  // Policy rechecks the transition after the host's read-only body capture.
  if(p.session(seat).refund(nodeId).refusal!==null)return false;
  p.recalculate(seat);
  for(const inst of p.skills(seat))p.resyncSupports(inst);
  for(const body of bodies)if(p.alive(body))p.refreshSummon(seat,body);
  p.refreshCompany(seat);p.markMetaDirty(seat);p.markCharacterDirty();return true;
 });}
 ensureRealmRoots(seat:S,realm:string):void{this.#run(()=>this.#roots(seat,realm));}
 ensureOpenRoots(seat:S):void{this.#run(()=>{
  const p=this.#p,host=p.session(seat),access=p.access(seat);
  // Select open realms before callbacks can change the host's current ledger.
  const realms=host.policy.pack.realms.filter(realm=>host.policy.open(realm,access));
  for(const realm of realms)this.#roots(seat,realm.id);
 });}
 grantRealmPoints(seat:S,currency:string,amount:number):void{this.#run(()=>{
  if(this.#p.session(seat).grantRealmPoints(currency,amount))this.#p.markMetaDirty(seat);
 });}
 bindGraft(seat:S,key:string,skillId:string|null):boolean{return this.#run(()=>{
  const p=this.#p,previous=p.graft(seat,key);
  if(!p.session(seat).bindGraft(key,skillId,p.knownIds(seat)))return false;
  if(previous===skillId)return true;
  p.recalculate(seat);
  for(const id of [previous,skillId])if(id){const inst=p.known(seat,id);if(inst)p.resyncSupports(inst);}
  return true;
 });}
}
