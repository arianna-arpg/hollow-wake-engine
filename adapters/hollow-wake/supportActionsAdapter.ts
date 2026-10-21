import {SupportActions} from '@hollow-wake/engine/skills/support-actions';
import {supportFitsInstOrCrew,type SkillInstance,type SupportInstance} from './skills';
import {supportOfGemItem,skillGemPayloadOf,bagSkillSupport} from './gemitems';
import {removeFromBag} from './inventory';
import type {World,Seat} from './world';import type {ItemInstance} from './items';

export function createSupportActions(world:World,hooks:{bagItem(seat:Seat,uid:number):ItemInstance|undefined;fail(seat:Seat,key:string,reason:string):void}):SupportActions<Seat,SkillInstance,SupportInstance,ItemInstance>{
 return new SupportActions({
  bagItem:hooks.bagItem,support:item=>supportOfGemItem(item)??undefined,
  known:(seat,id)=>seat.meta.knownSkills.get(id),granted:(seat,id)=>seat.grantedInsts?.get(id),
  fits:(gem,inst)=>supportFitsInstOrCrew(gem.def,inst,world.summonCrewSkills(inst),gem.rolled),
  refusal:(seat,kind,id)=>world.swapRefusal(seat,kind,id),fail:hooks.fail,
  remove:(seat,uid)=>{removeFromBag(seat.meta.items,uid);},give:(seat,gem)=>!!world.grantSupportGemItem(seat,gem),
  recalculate:seat=>world.recalcSeat(seat),resync:inst=>world.resyncMinionSupports(inst),dirty:seat=>world.markMetaDirty(seat),
  stored:item=>skillGemPayloadOf(item)??undefined,storedSupport:(item,index)=>bagSkillSupport(item,index)??undefined,
 });
}
