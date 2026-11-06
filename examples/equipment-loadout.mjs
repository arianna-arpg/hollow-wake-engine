// Run alongside an installation of the engine, items, crafting and
// skill-progression packages. All four archives are in the local distribution.
import {ItemContent} from '@hollow-wake/engine/items';
import {ItemInspector} from '@hollow-wake/engine/items/inspection';
import {EquipmentSlots} from '@hollow-wake/engine/inventory/equipment';
import {CraftingSession} from '@hollow-wake/engine/crafting/session';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import itemPack from '@hollow-wake/items/items.json' with {type:'json'};
import terms from '@hollow-wake/items/inspection.json' with {type:'json'};
import equipment from '@hollow-wake/items/equipment.json' with {type:'json'};
import craftingPack from '@hollow-wake/crafting/crafting.json' with {type:'json'};
import skillPack from '@hollow-wake/skill-progression/skill-progression.json' with {type:'json'};

const items=new ItemContent(itemPack), slots=new EquipmentSlots(equipment);
const inspector=new ItemInspector(items,terms);
const session=new CraftingSession({crafting:new CraftingContent(craftingPack,items),
  skills:new SkillProgression(skillPack),memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}});
session.configureEquipment(slots);
function command(op,args={}){
  const reply=session.command({op,profile:1,...args});
  if(!reply.ok)throw new Error(reply.reason);
  return reply;
}
command('open',{seed:17,state:{board:{w:2,h:2},items:[],equipped:{},overflow:[],essences:{},
  account:{craftLore:{},ledger:{},features:[],progression:true}}});
for(const rarity of ['common','magic','rare']){
  const {uid}=command('mint',{kind:'forge',options:{baseId:'ring_lapis',ilvl:10,rarity,fillRandom:true}}).result;
  if(rarity!=='rare'){
    const worn=command('equip',{uid,actorLevel:10}).result;
    if(!worn.changed)throw new Error(worn.refusal?.reason??'No equipment change');
  }
}
const {state}=command('save').save;
const card=inspector.inspectLoadout(state.items[0],state.equipped,10,slots,'full');
console.log(JSON.stringify({title:card.title,requirement:card.requirement,targets:card.targets},null,2));
