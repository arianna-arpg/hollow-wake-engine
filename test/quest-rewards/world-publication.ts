import {QuestMemoryPublication} from 'candidate/quest-memory-publication';
import type {PreparedQuestMemories} from 'candidate/quest-memory-mint';
import {mintMemoryPouch,type RoughMemoryUnit as StoredMemoryUnit} from 'candidate/gem-drop';
import {copySessionJSON} from 'candidate/json';
import type {World} from '../src/engine/world';
import type {RoughMemoryUnit} from '../src/engine/items';
import {nextItemUid} from '../src/engine/itemgen';
import {MEMORY_KINDS} from '../src/engine/memories';
import {SKILL_RARITIES} from '../src/engine/skills';
import {RARITY_DEFS} from '../src/engine/rarity';
const need=(value:unknown,message:string)=>{if(!value)throw Error(message);};
function originalKind(kind:string):asserts kind is keyof typeof MEMORY_KINDS{
 if(!Object.hasOwn(MEMORY_KINDS,kind))throw Error('Unknown original Memory kind');
}
function originalUnit(unit:StoredMemoryUnit):asserts unit is RoughMemoryUnit{
 if(unit.e!==undefined&&!Object.hasOwn(RARITY_DEFS,unit.e)||unit.g?.r!==undefined&&!Object.hasOwn(SKILL_RARITIES,unit.g.r)||unit.ceiling!==undefined&&!Object.hasOwn(SKILL_RARITIES,unit.ceiling))throw Error('Unknown original Memory rarity');
}
function label(raw:unknown):World['texts'][number]{
 const value=copySessionJSON(raw);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid Memory label');
 const p=value.pos;
 if(!p||typeof p!=='object'||Array.isArray(p)||typeof p.x!=='number'||!Number.isFinite(p.x)||typeof p.y!=='number'||!Number.isFinite(p.y)||typeof value.text!=='string'||typeof value.color!=='string'||typeof value.life!=='number'||typeof value.maxLife!=='number'||typeof value.size!=='number'||value.kind!=='drop')throw Error('Invalid Memory label');
 return{pos:{x:p.x,y:p.y},text:value.text,color:value.color,life:value.life,maxLife:value.maxLife,size:value.size,kind:value.kind};
}
/** Pinned-World bridge qualification only. Live ground IDs remain owned by the
 * original World; recipient inventory identity is assigned at accepted pickup.
 * Labels are already positioned and never roll randomness a second time. */
export function prepareQuestMemoryWorldPublication(w:World,plan:Pick<PreparedQuestMemories,'drops'|'placements'|'presentations'>):QuestMemoryPublication{
 for(const drop of plan.drops){need(drop.kind==='memory'&&Object.hasOwn(MEMORY_KINDS,drop.memoryKind),'Invalid Memory drop');for(const unit of drop.units)originalUnit(unit);}
 for(const placement of plan.placements){need(placement.worldKey===w.zone.id,'Foreign Memory world');need([placement.pos.x,placement.pos.y,placement.bob].every(Number.isFinite),'Invalid Memory placement');}
 for(const value of plan.presentations)label(value);
 return new QuestMemoryPublication(plan,{
  drop:(drop,placement)=>{
   need(placement.worldKey===w.zone.id,'Memory world changed before publication');
   originalKind(drop.memoryKind);
   const units=drop.units.map(unit=>{originalUnit(unit);return unit;});
   w.drops.push({pos:placement.pos,item:{kind:'gear',item:mintMemoryPouch(MEMORY_KINDS[drop.memoryKind],nextItemUid(),units)},bob:placement.bob,tier:placement.tier});
  },
  presentation:value=>{w.texts.push(label(value));}
 });
}
