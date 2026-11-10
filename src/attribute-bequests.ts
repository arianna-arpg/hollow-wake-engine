/** Definitions and modifier rows belong to the host; each registry belongs to
 * one ruleset. Updating a definition retains its existing registration order. */
export interface AttributeBequest<K extends string> {
  id:string;name:string;attributes:K[];recipients:'minions'|'companions'|'both';maxShare?:number;
}
export interface AttributeBequestState<K extends string> {
  definitions:Record<string,AttributeBequest<K>>;ids:string[];
}
export function createAttributeBequestState<K extends string>():AttributeBequestState<K> {
  return {definitions:Object.create(null),ids:[]};
}
export interface BequestActor<A,K extends string> {
  owner?:A;dead:boolean;attributeValues?:Partial<Record<K,number>>;team:string;companion:boolean;
  bequestSignature?:string;life:number;mana:number;
}
export interface AttributeBequestPorts<A,K extends string,M,T> {
  registerStat(id:string,def:{label:string;base:0;min:0;percent:true}):void;
  armed(actor:A,prefix:string,ids:string[],extra?:M[]):readonly string[];
  stat(actor:A,id:string,tags:T|undefined,extra:M[]|undefined):number;
  perPoint(attribute:K):readonly M[];
  setSource(actor:A,key:string,mods:M[]):void;removeSource(actor:A,key:string):void;
  maxLife(actor:A):number;maxMana(actor:A):number;
}
export const bequestStat=(id:string):string=>`bequest_${id}`;

/** Shares original owner attributes once. Sync never traverses the owner chain.
 * Host operations are synchronous; an exception retains preceding writes. The
 * signature assumes attribute definitions stay stable during active play. */
export class AttributeBequests<A extends BequestActor<A,K>,K extends string,M extends {value:number},T> {
  constructor(private readonly p:AttributeBequestPorts<A,K,M,T>,readonly state:AttributeBequestState<K>=createAttributeBequestState()) {}
  register(def:AttributeBequest<K>):void {
    if(!this.state.definitions[def.id])this.state.ids.push(def.id);
    this.state.definitions[def.id]=def;
    this.p.registerStat(bequestStat(def.id),{label:def.name,base:0,min:0,percent:true});
  }
  sync(recipient:A,scale=1,tags?:T,extra?:M[]):void {
    const owner=recipient.owner;
    const armed=owner?this.p.armed(owner,'bequest_',this.state.ids,extra):undefined;
    if(!armed?.length&&!recipient.bequestSignature)return;
    const mods:M[]=[],signature:string[]=[];
    if(owner&&!owner.dead&&owner.attributeValues&&recipient.team===owner.team){
      for(const id of armed??[]){
        const def=this.state.definitions[id];
        if(def.recipients==='companions'&&!recipient.companion)continue;
        if(def.recipients==='minions'&&recipient.companion)continue;
        const share=Math.min(def.maxShare??1,Math.max(0,this.p.stat(owner,bequestStat(def.id),tags,extra)))*scale;
        if(share<=0)continue;
        for(const attr of def.attributes){
          const points=(owner.attributeValues[attr]??0)*share;
          if(points<=0)continue;
          signature.push(`${def.id}:${attr}:${points}`);
          for(const m of this.p.perPoint(attr))mods.push({...m,value:m.value*points});
        }
      }
    }
    const key=signature.join('|');
    if((recipient.bequestSignature??'')===key)return;
    recipient.bequestSignature=key||undefined;
    if(mods.length)this.p.setSource(recipient,'bequest',mods);
    else this.p.removeSource(recipient,'bequest');
    recipient.life=Math.min(recipient.life,this.p.maxLife(recipient));
    recipient.mana=Math.min(recipient.mana,this.p.maxMana(recipient));
  }
}
