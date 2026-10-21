import {SkillActions} from '@hollow-wake/engine/skills/actions';
import {abilityRules,skillTreeRules} from './skillProgressionAdapter';
import {SKILL_LEVEL_BANDS,MAX_SUPPORT_LEVEL,skillMaxLevel,supportMaxLevel,instanceTrigger,SKILL_RARITIES,type SkillInstance,type SupportInstance,type SkillRarity} from './skills';
import {treeGraph} from './skilltree';import {skillInstanceName} from './skillEmpowerment';import {skillMergePlan} from './skillMerge';
import {ABILITY_ESSENCES,ABILITY_ESSENCE_CFG,FONT_CFG} from '../data/essences';import {SKILL_EMPOWERMENT} from '../data/skillEmpowerment';
import {skillOfGemItem} from './gemitems';import {removeFromBag} from './inventory';
import {notePickup} from '../world/bulletins';
import type {World,Seat} from './world';import type {ItemInstance} from './items';

export interface SkillWorldHooks {
 awaken(seat:Seat,inst:SkillInstance):void;dismiss(seat:Seat,id:string):void;
 clearSummons(seat:Seat,inst:SkillInstance):void;clearFields(seat:Seat,inst:SkillInstance):void;
 fail(seat:Seat,key:string,reason:string):void;
}
/** One host per World. SDK commits retain live instance/item identities; native
 * cleanup, presentation, save dirtiness and account authority stay in the game. */
export function createSkillActions(world:World,hooks:SkillWorldHooks):SkillActions<Seat,SkillInstance,SupportInstance,ItemInstance>{
 return new SkillActions({
  ability:()=>abilityRules(SKILL_LEVEL_BANDS,MAX_SUPPORT_LEVEL,ABILITY_ESSENCE_CFG.cost,SKILL_EMPOWERMENT.reward),
  tree:inst=>skillTreeRules(inst.def,treeGraph(inst.def),SKILL_LEVEL_BANDS,MAX_SUPPORT_LEVEL,SKILL_EMPOWERMENT.reward),
  essences:()=>ABILITY_ESSENCES,font:()=>FONT_CFG,wallet:seat=>seat.meta.abilityEssences,known:(seat,id)=>seat.meta.knownSkills.get(id),granted:(seat,id)=>seat.grantedInsts?.get(id),
  skillMax:inst=>skillMaxLevel(inst.def),supportMax:gem=>supportMaxLevel(gem.def),nearFont:seat=>world.nearFont(seat),memoryRefusal:(_seat,id)=>world.memorySecondaryRefusal(id),swapRefusal:seat=>world.swapRefusal(seat,'socket'),
  position:seat=>seat.actor.pos,text:(at,message,color,size,category)=>world.text(at,message,color,size,category),fail:hooks.fail,
  markMetaDirty:seat=>world.markMetaDirty(seat),markCharacterDirty:()=>{world.charDirty=true;},
  pickup:(seat,essence,count)=>notePickup(world.pickupFeed,seat.id,essence.label,essence.color,world.time,count),
  awaken:hooks.awaken,dismiss:hooks.dismiss,clearSummons:hooks.clearSummons,clearFields:hooks.clearFields,trigger:instanceTrigger,recalculate:seat=>world.recalcSeat(seat),
  mergePlan:(seat,id,rarity)=>skillMergePlan(seat.meta.items,id,rarity as SkillRarity),sockets:item=>skillOfGemItem(item)?.sockets,
  remove:(seat,item)=>{removeFromBag(seat.meta.items,item.uid);},grantSkill:(seat,inst)=>{world.grantSkillGemItem(seat,inst,true);},grantSupport:(seat,support)=>{world.grantSupportGemItem(seat,support,true);},
  announceMerge:(seat,inst)=>world.text({x:seat.actor.pos.x,y:seat.actor.pos.y-40},skillInstanceName(inst)+' reforged — '+SKILL_RARITIES[inst.rarity!].label,SKILL_RARITIES[inst.rarity!].color,14),
 });
}
