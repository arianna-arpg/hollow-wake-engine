import type {CraftingItem,CraftingSkill,CraftingSupport,CraftLore,CraftingRules,MaterialAmount,CraftStudy} from './crafting.js';

export type SalvageLane='break'|'sell';
export type SalvageCategory='item'|'skill'|'support';
export type CraftingRefusal='relic'|'quest'|'capacity'|'socket-capacity'|'reroll-locked'|'reroll-crafted'|'reroll-ineligible';
export type CraftingCue=
  | {kind:'locked'|'memory-refused'|'granted-broken'|'socket'|'rerolled'}
  | {kind:'memory-sold';memory:string;count:number}
  | {kind:'expertise';family:string;bulk:boolean}
  | {kind:'crafted';name:string}
  | {kind:'bulk';count:number;gains:MaterialAmount[]};
export interface CraftingAccount {craftLore:CraftLore;ledger:Partial<Record<string,number>>}
export interface CraftingCarry<I> {items:I[];equipped:Partial<Record<string,I>>;essences:Partial<Record<string,number>>}
export interface CraftingActionPorts<C,I,S,U,A> {
  carry(context:C):CraftingCarry<I>;
  account():A;
  hasFeature(id:string):boolean;
  progression():boolean;
  reach(context:C,station:'salvage'|'oracle'):boolean;
  nearBench(context:C):boolean;
  nearCounter(context:C):boolean;
  bagItem(context:C,uid:number):I|undefined;
  findCarried(context:C,uid:number):I|undefined;
  remove(items:I[],uid:number):void;
  spend(context:C,cost:MaterialAmount,noteKey:string):boolean;
  grant(context:C,gain:MaterialAmount):void;
  random():number;
  recalc(context:C):void;
  dirty(context:C):void;
  save(account:A):void;
  refuse(context:C,reason:CraftingRefusal,noteKey:string):void;
  cue(context:C,cue:CraftingCue):void;
  skill(item:I):S|null;
  support(item:I):U|null;
  skillPayload(item:I):{rarity?:string;granted?:boolean}|null;
  grantSupport(context:C,support:U):void;
  memoryKind(item:I):string|null|undefined;
}

/** Synchronous borrowed-state commands. Ports own custody, payment, persistence
 * and presentation. Exceptions retain earlier writes, just as the original
 * game does; these commands are not durable database transactions. A single
 * instance rejects recursive commands but can serve any number of characters. */
export class CraftingActions<C,I extends CraftingItem,S extends CraftingSkill&{sockets:(U|null)[]},U extends CraftingSupport,A extends CraftingAccount=CraftingAccount> {
  readonly #rules:CraftingRules;
  readonly #ports:CraftingActionPorts<C,I,S,U,A>;
  #busy=false;
  constructor(rules:CraftingRules,ports:CraftingActionPorts<C,I,S,U,A>){
    this.#rules=rules;
    const bound={...ports};
    for(const name of ['carry','account','hasFeature','progression','reach','nearBench','nearCounter','bagItem','findCarried','remove','spend','grant','random','recalc','dirty','save','refuse','cue','skill','support','skillPayload','grantSupport','memoryKind'] as const){
      if(typeof ports[name]!=='function')throw new Error('Missing crafting action port '+name);
      bound[name]=ports[name].bind(ports) as never;
    }
    this.#ports=Object.freeze(bound);
  }
  #run(work:()=>void):void{if(this.#busy)throw new Error('Reentrant crafting action');this.#busy=true;try{work();}finally{this.#busy=false;}}
  craftSlots():number{const c=this.#rules.ports.craft;return c.maxCraftedAffixes+(this.#ports.hasFeature(c.extraSlotFeature)?1:0);}
  #lane(ctx:C,lane?:SalvageLane):SalvageLane|null{
    const p=this.#ports,want=lane??(p.nearBench(ctx)?'break':'sell');
    return want==='break'?(p.reach(ctx,'salvage')?'break':null):(p.nearCounter(ctx)?'sell':null);
  }
  #breakItem(ctx:C,item:I,mode:SalvageLane):CraftStudy[]{
    const p=this.#ports,r=this.#rules;
    p.remove(p.carry(ctx).items,item.uid);p.grant(ctx,mode==='break'?r.salvageItemYield(item):r.sellItemYield(item));
    if(mode!=='break'||!p.progression())return [];
    const taught=r.studySalvage(p.account().craftLore,item);
    for(const t of taught)if(t.rankedUp&&p.account().craftLore[t.family]?.rank===1){
      const key=r.ports.ledgerCraftsUnlocked,ledger=p.account().ledger;
      const current=p.account().ledger,next=(Object.hasOwn(current,key)?current[key]??0:0)+1;
      Object.defineProperty(ledger,key,{value:next,enumerable:true,configurable:true,writable:true});
    }
    return taught;
  }
  #breakGem(ctx:C,item:I,mode:SalvageLane):void{
    const p=this.#ports,r=this.#rules,m=p.carry(ctx);
    if(item.gem?.kind==='skill'){
      const skill=p.skill(item);p.remove(m.items,item.uid);if(!skill)return;
      for(const support of skill.sockets)if(support)p.grantSupport(ctx,support);
      const gain=mode==='break'?r.salvageSkillYield(skill):r.sellSkillYield(skill);
      if(gain)p.grant(ctx,gain);else p.cue(ctx,{kind:'granted-broken'});
    }else if(item.gem?.kind==='support'){
      const support=p.support(item);p.remove(m.items,item.uid);if(!support)return;
      p.grant(ctx,mode==='break'?r.salvageSupportYield(support):r.sellSupportYield(support));
    }
  }
  salvageItem(ctx:C,uid:number,lane?:SalvageLane):void{this.#run(()=>{
    const p=this.#ports,r=this.#rules,mode=this.#lane(ctx,lane);if(!mode)return;
    const item=p.bagItem(ctx,uid);if(!item)return;
    if(item.relicKey){p.refuse(ctx,'relic','relicSale');return;}
    if(item.questId){p.refuse(ctx,'quest','questCargo');return;}
    if(item.locked){p.cue(ctx,{kind:'locked'});return;}
    if(item.mem){
      if(mode!=='sell'){p.cue(ctx,{kind:'memory-refused'});return;}
      const memory=p.memoryKind(item)??'rough',count=item.mem.length;
      p.remove(p.carry(ctx).items,item.uid);p.grant(ctx,r.sellMemoryYield(memory,count));
      p.cue(ctx,{kind:'memory-sold',memory,count});p.dirty(ctx);return;
    }
    if(item.gem){this.#breakGem(ctx,item,mode);p.dirty(ctx);return;}
    const taught=this.#breakItem(ctx,item,mode);
    for(const t of taught)if(t.rankedUp)p.cue(ctx,{kind:'expertise',family:t.family,bulk:false});
    if(mode==='break'&&p.progression())p.save(p.account());p.dirty(ctx);
  });}
  salvageBulk(ctx:C,category:SalvageCategory,rarity?:string,lane?:SalvageLane):void{this.#run(()=>{
    const p=this.#ports,r=this.#rules,mode=this.#lane(ctx,lane);if(!mode)return;
    const m=p.carry(ctx),before={...m.essences};let broke=0;const ranked:string[]=[];
    if(category==='item'){
      const targets=m.items.filter(i=>!i.gem&&!i.mem&&!i.locked&&!i.questId&&!i.relicKey&&(!rarity||i.rarity===rarity));
      for(const item of targets){for(const t of this.#breakItem(ctx,item,mode))if(t.rankedUp)ranked.push(t.family);broke++;}
      if(broke>0&&mode==='break'&&p.progression())p.save(p.account());
    }else if(category==='skill'){
      const targets=m.items.filter(i=>{const payload=p.skillPayload(i);return payload&&!i.locked&&!payload.granted&&(!rarity||payload.rarity===rarity);});
      for(const item of targets){this.#breakGem(ctx,item,mode);broke++;}
    }else{
      const targets=m.items.filter(i=>i.gem?.kind==='support'&&!i.locked);
      for(const item of targets){this.#breakGem(ctx,item,mode);broke++;}
    }
    if(broke>0){
      const gains:MaterialAmount[]=[];
      for(const essence of r.ports.essenceIds){
        const afterValue=Object.hasOwn(m.essences,essence)?m.essences[essence]??0:0;
        const beforeValue=Object.hasOwn(before,essence)?before[essence]??0:0,count=afterValue-beforeValue;
        if(count>0)gains.push({essence,count});
      }
      p.cue(ctx,{kind:'bulk',count:broke,gains});
      for(const family of new Set(ranked))p.cue(ctx,{kind:'expertise',family,bulk:true});
    }
    p.dirty(ctx);
  });}
  salvageLockSet(ctx:C,uid:number,on:boolean):void{this.#run(()=>{
    const p=this.#ports,thing=p.findCarried(ctx,uid);if(!thing)return;
    if(on)thing.locked=true;else delete thing.locked;p.dirty(ctx);
  });}
  craftSocket(ctx:C,uid:number):void{this.#run(()=>{
    const p=this.#ports,r=this.#rules;if(!p.reach(ctx,'salvage'))return;
    const m=p.carry(ctx),worn=Object.keys(m.equipped).find(k=>m.equipped[k]?.uid===uid),item=p.bagItem(ctx,uid)??(worn?m.equipped[worn]:undefined);
    if(!item)return;const base=r.ports.base(item.baseId);if(!base)return;
    if((item.sockets?.length??0)>=r.ports.socketCap(base.category)){p.refuse(ctx,'socket-capacity','chisel:'+uid);return;}
    if(r.craftedCount(item)>=this.craftSlots()){p.refuse(ctx,'capacity','chisel:'+uid);return;}
    if(!p.spend(ctx,r.ports.craft.socketCost,'chisel:'+uid))return;
    item.sockets=[...(item.sockets??[]),null];item.craftedSockets=(item.craftedSockets??0)+1;
    if(worn)p.recalc(ctx);p.cue(ctx,{kind:'socket'});p.dirty(ctx);
  });}
  craftAffix(ctx:C,uid:number,affixId:string,score=0):void{this.#run(()=>{
    const p=this.#ports,r=this.#rules;if(!p.reach(ctx,'salvage'))return;
    const m=p.carry(ctx),worn=Object.keys(m.equipped).find(k=>m.equipped[k]?.uid===uid),item=p.bagItem(ctx,uid)??(worn?m.equipped[worn]:undefined);
    if(!item)return;if(r.craftedCount(item)>=this.craftSlots()){p.refuse(ctx,'capacity','craft:'+uid);return;}
    const option=r.craftableAffixesFor(item,p.account().craftLore).find(o=>o.def.id===affixId);if(!option)return;
    const rank=r.expertiseRank(p.account().craftLore,option.def.family);if(!p.spend(ctx,r.ports.cost(rank),'craft:'+affixId))return;
    const rolled=r.rollCraftedAffix(option.def,rank,p.random,Math.max(0,Math.min(1,score)));if(!rolled)return;
    item.affixes.push(rolled);if(worn)p.recalc(ctx);
    p.cue(ctx,{kind:'crafted',name:option.def.names[option.def.names.length-1]??option.def.id});p.dirty(ctx);
  });}
  rerollAffix(ctx:C,uid:number,index:number,score:number):void{this.#run(()=>{
    const p=this.#ports,r=this.#rules;if(!p.reach(ctx,'oracle'))return;
    const m=p.carry(ctx),worn=Object.keys(m.equipped).find(k=>m.equipped[k]?.uid===uid),item=p.bagItem(ctx,uid)??(worn?m.equipped[worn]:undefined);
    if(!item)return;const a=item.affixes[index];
    if(!a||a.crafted||a.locked){p.refuse(ctx,a?.locked?'reroll-locked':'reroll-crafted','oracle:'+uid);return;}
    const def=r.ports.affix(a.id);if(!def)return;
    const rolled=r.rollRerolledAffix(def,item,p.random,Math.max(0,Math.min(1,score)));
    if(!rolled){p.refuse(ctx,'reroll-ineligible','oracle:'+uid);return;}
    if(!p.spend(ctx,r.ports.oracleCost(item.rarity),'oracle:'+uid))return;item.affixes[index]=rolled;
    if(worn)p.recalc(ctx);p.cue(ctx,{kind:'rerolled'});p.dirty(ctx);
  });}
}
