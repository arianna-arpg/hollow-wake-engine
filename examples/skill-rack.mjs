// Install the engine, items and skill-progression archives beside this example.
import {SkillRackActions} from '@hollow-wake/engine/skills/rack';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {ItemContent} from '@hollow-wake/engine/items';
import {InventoryHost} from '@hollow-wake/engine/inventory/host';
import {createGemResidence} from '@hollow-wake/engine/inventory/gems';
import skillData from '@hollow-wake/skill-progression/skill-progression.json' with {type:'json'};
import itemData from '@hollow-wake/items/items.json' with {type:'json'};

const progression=new SkillProgression(skillData),items=new ItemContent(itemData);
const sizeOf=item=>items.pack.bases[item.baseId];
const grid=new InventoryHost(sizeOf),board={w:3,h:1};
const hero={skills:Array(8).fill(null)},seat={hero,items:[],known:new Map()};
let nextUid=1;
const residence=createGemResidence({
  skill:id=>progression.skill(id),support:id=>progression.support(id),
  hasOwnSupport:id=>progression.pack.supports.some(s=>s.id===id),hasForm:()=>false,
  makeSkill:(def,level,n)=>({def,level,sockets:Array(n).fill(null)}),
  validTreeNodes:(def,ids,level,inst)=>progression.tree(def.id).restore(ids,level,inst),
  nextUid:()=>nextUid++,rebuildItem:()=>{throw Error('No item migration in this example');},
  bagWidth:()=>board.w,bagHeight:()=>board.h,itemGridSize:sizeOf,
});
// This hero is in sanctuary and the game has admitted Fireball. In a game,
// supply the acting body, real-time gates, equipment grants and world effects.
const rack=new SkillRackActions({
  maxLearned:8,hero:s=>s.hero,actor:s=>s.hero,known:s=>s.known,granted:()=>false,
  bagItem:(s,uid)=>s.items.find(i=>i.uid===uid),unpack:residence.skillOfGemItem,pack:residence.makeSkillGemItem,
  meets:(_s,id)=>id==='fireball',refusal:()=>null,fail:(_actor,_key,reason)=>console.error(reason),
  remove:(s,uid)=>grid.remove(s.items,uid),freeCells:s=>residence.freeCellCount(s.items),
  place:(s,item,x,y)=>{
    if(x===undefined||y===undefined)return grid.autoPlace(s.items,item,board);
    if(!grid.canPlace(s.items,item,x,y,board))return false;
    item.x=x;item.y=y;s.items.push(item);return true;
  },
  beforeForget:()=>{},afterForget:()=>{},afterLearn:()=>{},dirty:()=>{},afterUnlearn:()=>{},
});
const def=progression.skill('fireball'),support=progression.support('splitting');
const first=residence.makeSkillGemItem({def,level:1,rarity:'common',sockets:[]});
const upgrade=residence.makeSkillGemItem({def,level:5,rarity:'rare',locked:true,
  sockets:[{def:support,level:3,locked:true},null]});
for(const gem of [first,upgrade])if(!grid.autoPlace(seat.items,gem,board))throw Error('Initial pack is full');
if(!rack.learn(seat,first.uid,3)||!rack.learn(seat,upgrade.uid))throw Error('Learn failed');
const learned=hero.skills[3];
if(learned!==seat.known.get('fireball')||learned.level!==5)throw Error('Duplicate did not replace its own seat');
if(!rack.unlearn(seat,'fireball',2,0))throw Error('Could not return upgraded gem');
console.log(JSON.stringify({learned:seat.known.size,nextUid,bag:seat.items.map(i=>({
  uid:i.uid,cell:[i.x,i.y],level:i.gem.level,locked:!!i.locked,sockets:i.gem.sockets,
}))},null,2));
