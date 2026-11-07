export interface InlayItem {uid:number; baseId:string; name:string; rarity:string; sockets?:(string|null)[]}
export interface InlayOwner<I extends InlayItem> {
  items: readonly I[];
  equipped: Readonly<Record<string,I|undefined>>;
  vestiges?: Record<string,number>;
}
export interface InlayContent<I,D,W> {
  vestige(id:string):D|undefined;
  word(item:I,sockets:readonly (string|null)[]):W|null|undefined;
}
export interface InlayHooks<I,D,W> {
  granted?(def:D,count:number):void;
  crumbled?(id:string,old:D|undefined):void;
  inlaid?(def:D):void;
  awakened?(word:W,item:I):void;
  recalculate?():void;
  dirty?():void;
}
type Refusal = 'unknown-vestige'|'invalid-count'|'satchel-limit'|'missing-material'|'missing-item'|'no-socket'|'sockets-full';
const refused=(reason:Refusal)=>({changed:false as const,reason});
const ownCount=(wallet:Record<string,number>|undefined,id:string)=>wallet && Object.hasOwn(wallet,id)?wallet[id]:0;

/** A synchronous inventory action. Item identity and satchel ownership stay with the caller. */
export class VestigeInlays<I extends InlayItem,D extends {id:string},W extends {id:string}> {
  constructor(private readonly content:InlayContent<I,D,W>) {}
  grant(owner:InlayOwner<I>,id:string,count:number,hooks?:InlayHooks<I,D,W>){
    const def=this.content.vestige(id);
    if(!def)return refused('unknown-vestige');
    if(!Number.isSafeInteger(count)||count<=0)return refused('invalid-count');
    const previous=ownCount(owner.vestiges,id),balance=previous+count;
    if(!Number.isSafeInteger(previous)||previous<0||!Number.isSafeInteger(balance))return refused('satchel-limit');
    (owner.vestiges??=Object.create(null))[id]=balance;
    hooks?.granted?.(def,count);
    hooks?.dirty?.();
    return {changed:true as const,balance};
  }
  #target(owner:InlayOwner<I>,uid:number,index:number|undefined,id:string){
    const def=this.content.vestige(id);
    if(!def)return refused('unknown-vestige');
    const count=ownCount(owner.vestiges,id);
    if(!Number.isSafeInteger(count)||count<1)return refused('missing-material');
    // The original game resolves the worn binding independently of the bag-first body lookup.
    const wornSlot=Object.keys(owner.equipped).find(k=>owner.equipped[k]?.uid===uid);
    const item=owner.items.find(i=>i.uid===uid)??(wornSlot?owner.equipped[wornSlot]:undefined);
    if(!item)return refused('missing-item');
    const sockets=item.sockets;
    if(!sockets?.length)return refused('no-socket');
    if(index===undefined){index=sockets.indexOf(null);if(index<0)return refused('sockets-full');}
    if(!Number.isSafeInteger(index)||index<0||index>=sockets.length)return refused('no-socket');
    return {changed:true as const,item,sockets,def,index,wornSlot};
  }
  preview(owner:InlayOwner<I>,uid:number,index:number|undefined,id:string) {
    const target=this.#target(owner,uid,index,id);
    if(!target.changed)return target;
    const sockets=target.sockets.slice(),replaced=sockets[target.index];
    sockets[target.index]=id;
    return {changed:true as const,index:target.index,replaced,epitaph:this.content.word(target.item,sockets)?.id??null};
  }
  inlay(owner:InlayOwner<I>,uid:number,index:number|undefined,id:string,hooks?:InlayHooks<I,D,W>){
    const target=this.#target(owner,uid,index,id);
    if(!target.changed)return target;
    const {item,sockets,def,wornSlot}=target,replaced=sockets[target.index];
    owner.vestiges![id]--;
    sockets[target.index]=id;
    if(replaced)hooks?.crumbled?.(replaced,this.content.vestige(replaced));
    hooks?.inlaid?.(def);
    // Cues can synchronously change the body. Resolve the word on its live socket array.
    const word=item.sockets?this.content.word(item,item.sockets):undefined;
    if(word)hooks?.awakened?.(word,item);
    if(wornSlot)hooks?.recalculate?.();
    hooks?.dirty?.();
    return {changed:true as const,index:target.index,replaced,epitaph:word?.id??null,wornSlot:wornSlot??null};
  }
}
