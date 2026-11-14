/** Ordered quest settlement over admitted content and synchronous host effects.
 * World presence, cargo materialization, presentation and durable I/O are ports.
 * This service preserves the original occurrence order; it is not a transaction
 * across arbitrary host effects. Earlier effects remain if a later port throws. */
export interface QuestRewardDefinition {
 readonly id:string;readonly offerLabel:string;readonly vocation?:string;readonly collect?:unknown;
 readonly reward:{readonly choices?:readonly unknown[];readonly skillChoice?:unknown;readonly imbue?:unknown;readonly features?:readonly string[];
  readonly xp?:number;readonly gems?:number;readonly essence?:readonly unknown[];readonly passivePoints?:number;readonly vocationPoints?:number;
  readonly grantVocation?:string;readonly ledger?:Readonly<Record<string,number>>};
}
export interface QuestEntry {readonly questId:string}
export interface QuestRewardPorts<A extends QuestEntry,Q extends QuestRewardDefinition,C,I,P> {
 activeIndex(entry:A):number;noteCompletion(id:string):void;definition(id:string):Q|undefined;
 collectionReady(entry:A,quest:Q):boolean;shownChoice():string|null;requestChoice(quest:Q):void;
 choice(quest:Q,id:string):C|undefined;item(quest:Q,id:string,choice:C):I|null;place(item:I):boolean;noRoom():void;
 posting(id:string):P|null;consumeCargo(quest:Q):void;imbue(quest:Q):void;
 feature(id:string):void;accountDirty():void;experience(amount:number):void;gem():void;essence(cost:unknown):void;
 points(currency:'passive'|'vocation',amount:number):void;announcePoints(quest:Q,currency:'passive'|'vocation',amount:number):void;
 characterDirty():void;vocation(id:string):void;runCounter(key:string,amount:number):void;
 accountWritesAllowed():boolean;accountCounter(key:string,amount:number):void;
 questKey(id:string):string;bountyKey():string;bountyKindKey(posting:P):string;
 announceQuest(quest:Q):void;announceBounty(quest:Q,posting:P):void;
 rememberCompleted(id:string):void;removeActive(index:number):void;clientActions():boolean;saveAccount():void;saveCharacter():void;
}
export class QuestRewards<A extends QuestEntry,Q extends QuestRewardDefinition,C,I,P> {
 readonly #p:QuestRewardPorts<A,Q,C,I,P>;
 constructor(ports:QuestRewardPorts<A,Q,C,I,P>){
  // Bind once per host, without retaining world or content registries in a global.
  const bound={} as QuestRewardPorts<A,Q,C,I,P>;
  for(const key of ['activeIndex','noteCompletion','definition','collectionReady','shownChoice','requestChoice','choice','item','place','noRoom','posting','consumeCargo','imbue','feature','accountDirty','experience','gem','essence','points','announcePoints','characterDirty','vocation','runCounter','accountWritesAllowed','accountCounter','questKey','bountyKey','bountyKindKey','announceQuest','announceBounty','rememberCompleted','removeActive','clientActions','saveAccount','saveCharacter'] as const){
   const fn=ports[key];if(typeof fn!=='function')throw Error('Missing quest reward '+key+' port');Object.defineProperty(bound,key,{value:fn.bind(ports)});
  }
  this.#p=bound;
 }
 complete(entry:A,choiceId?:string):void{
  const p=this.#p,index=p.activeIndex(entry);if(index<0)return;
  p.noteCompletion(entry.questId);const q=p.definition(entry.questId);
  if(q?.collect&&!p.collectionReady(entry,q))return;
  if(q&&(q.reward.choices?.length||q.reward.skillChoice)){
   if(choiceId===undefined){if(p.shownChoice()!==q.id)p.requestChoice(q);return;}
   const choice=p.choice(q,choiceId);if(!choice)return;
   const item=p.item(q,choiceId,choice);if(!item)return;
   if(!p.place(item)){p.noRoom();return;}
  }
  const posting=p.posting(entry.questId);
  if(q){
   const r=q.reward;if(q.collect)p.consumeCargo(q);if(r.imbue)p.imbue(q);
   for(const feature of r.features??[])p.feature(feature);if(r.features?.length)p.accountDirty();
   if(r.xp)p.experience(r.xp);
   for(let n=0;n<(r.gems??0);n++)p.gem();for(const cost of r.essence??[])p.essence(cost);
   if(r.passivePoints){p.points('passive',r.passivePoints);p.announcePoints(q,'passive',r.passivePoints);}
   if(r.vocationPoints){p.points('vocation',r.vocationPoints);p.announcePoints(q,'vocation',r.vocationPoints);p.characterDirty();}
   if(r.grantVocation)p.vocation(r.grantVocation);
   if(r.ledger)for(const[key,amount]of Object.entries(r.ledger))p.runCounter(key,amount);
   if(posting){
    p.runCounter(p.bountyKey(),1);p.runCounter(p.bountyKindKey(posting),1);
    if(p.accountWritesAllowed()){p.accountCounter(p.bountyKey(),1);p.accountCounter(p.bountyKindKey(posting),1);p.accountDirty();}
    p.announceBounty(q,posting);
   }else{
    p.runCounter(p.questKey(entry.questId),1);
    if(p.accountWritesAllowed()){p.accountCounter(p.questKey(entry.questId),1);p.accountDirty();}
    p.announceQuest(q);
   }
  }
  if(!posting)p.rememberCompleted(entry.questId);p.removeActive(index);p.characterDirty();
  if((q?.reward.choices?.length||q?.reward.skillChoice||q?.reward.imbue)&&!p.clientActions()){p.saveAccount();p.saveCharacter();}
 }
}
