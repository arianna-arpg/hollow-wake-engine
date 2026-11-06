import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {CargoInspector,CargoAtlas} from '@hollow-wake/engine/inventory/cargo-cards';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {ItemContent} from '@hollow-wake/engine/items';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import itemsPack from '@hollow-wake/items/items.json' with {type:'json'};
import skillsPack from '@hollow-wake/skill-progression/skill-progression.json' with {type:'json'};
import craftingPack from '@hollow-wake/crafting/crafting.json' with {type:'json'};
import index from '@hollow-wake/cargo-cards/index.json' with {type:'json'};

const items=new ItemContent(itemsPack),skills=new SkillProgression(skillsPack);
const crafting=new CraftingContent(craftingPack,items);
const bytes=fs.openSync(new URL(import.meta.resolve('@hollow-wake/cargo-cards/pages.txt')),'r');
try{
  const atlas=new CargoAtlas(index,(_page,range)=>{
    const data=Buffer.alloc(range.length);
    if(fs.readSync(bytes,data,0,data.length,range.offset)!==range.length ||
       createHash('sha256').update(data).digest('hex')!==range.sha256)throw Error('Invalid cargo display page');
    return data.toString('utf8');
  });
  const inspector=new CargoInspector(skills,crafting,atlas.config);
  const item=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):{
    uid:1,baseId:'skill_gem',name:'Firebolt',rarity:'common',tier:1,ilvl:1,baseRoll:0,implicitRolls:[],affixes:[],
    gem:{kind:'skill',skillId:'firebolt',rarity:'common',level:1,sockets:[null]}};
  console.log(JSON.stringify(inspector.inspect(item,{inBag:true,attributes:{intelligence:12},lane:'sell',confirmMemorySale:true},atlas.read),null,2));
}finally{fs.closeSync(bytes);}
