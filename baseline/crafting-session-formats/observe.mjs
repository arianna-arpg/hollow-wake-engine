import assert from 'node:assert/strict';
import {CraftingSession} from 'published-session';
import {CraftingContent} from '../../dist/crafting-content.js';
import {ItemContent} from '../../dist/item-rules.js';
import {SkillProgression} from '../../dist/skill-progression.js';
import {WorkshopSkillBook} from '../../dist/workshop-skill-book.js';
import packs from 'format-content';

const items=new ItemContent(packs.items),crafting=new CraftingContent(packs.crafting,items),skills=new SkillProgression(packs.skills);
const definitions={crafting,skills,memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}};
const rows=[];
for(const[version,extra]of [[1,{}],[2,{rack:Array(8).fill(null)}],[3,{vestiges:{}}],[4,{skillBook:{known:[],bar:Array(8).fill(null)}}]]){
 const input={board:{w:2,h:2},items:[],equipped:{},overflow:[],essences:{},account:{craftLore:{},ledger:{},features:[],progression:true},...extra};
 const session=new CraftingSession(definitions,1,new WorkshopSkillBook(items));
 assert.equal(session.command({op:'open',profile:1,seed:123,state:input}).ok,true);
 const saved=session.command({op:'save',profile:1});assert(saved.ok);assert.equal(saved.save.schemaVersion,version);assert.equal(saved.save.capability,'crafting-session/v'+version);
 rows.push({version,input,save:saved.save});
}
console.log(JSON.stringify({rows}));
