import {CharacterSession} from '@hollow-wake/engine/character/session';
import {CharacterLive} from '@hollow-wake/engine/character/live';
import {CharacterBuilds} from '@hollow-wake/engine/character/builds';
import {SkillPricing} from '@hollow-wake/engine/character/skill-pricing';
import {CharacterProgression} from '@hollow-wake/engine/character/progression';
import {ItemContent} from '@hollow-wake/engine/items';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {PassivePolicy} from '@hollow-wake/engine/passives';
import {EquipmentSlots} from '@hollow-wake/engine/inventory/equipment';
import {Random} from '@hollow-wake/engine';
import {createCharacterBuildRules,characterSkillQueries as queries} from '@hollow-wake/character-builds';

/** Load immutable content once; each created character owns its memory. */
export function createCharacterKit(buildPack,pack){
  if(pack?.capability!=='character-kit/v1'||pack.schemaVersion!==1||pack.buildContentId!==buildPack?.contentId)throw Error('Character kit content mismatch');
  const contentId=pack.contentId;
  const rules=createCharacterBuildRules(buildPack),builds=new CharacterBuilds(rules),items=new ItemContent(buildPack.items);
  const catalogue=Object.freeze({skills:Object.freeze(Object.fromEntries(Object.keys(buildPack.definitions.skills).map(id=>[id,rules.equipment.skill(id)]))),
    supports:Object.freeze(Object.fromEntries(Object.keys(buildPack.definitions.supports).map(id=>[id,rules.equipment.support(id)]))),
    monsters:Object.freeze(Object.fromEntries(Object.keys(buildPack.definitions.monsters).map(id=>[id,true])))});
  const containerDefinitions=rules.contributions.containers();
  const definitions={contentId,builds,catalogue,trigger:queries.instanceTrigger,
    containers:Object.freeze({definitions:containerDefinitions,board:(id,features)=>{const def=containerDefinitions.find(row=>row.id===id);return def?rules.contributions.board(def,new Set(features)):null;}}),
    workshop:{crafting:new CraftingContent(pack.crafting,items),skills:new SkillProgression(buildPack.progression),memoryKinds:Object.freeze({...pack.memoryKinds})},
    equipment:new EquipmentSlots(pack.equipment),progression:new CharacterProgression(pack.experience),maxVocations:pack.maxVocations,
    character:{contentId,passives:new PassivePolicy(pack.passives),attributes:buildPack.passives.attributes.map(row=>row.id),
      containers:Object.freeze(containerDefinitions.map(({id,accepts,accountStorage})=>Object.freeze({id,accepts,...(accountStorage===undefined?{}:{accountStorage})})))}};
  Object.freeze(definitions.workshop);Object.freeze(definitions.character.attributes);Object.freeze(definitions.character);Object.freeze(definitions);
  const pricing=new SkillPricing({tags:queries.skillContextTags,mods:queries.instanceMods,guarded:queries.guarded,replenishing:queries.replenishing,cooldown:queries.skillCooldownSeconds});
  const projection=()=>({features:[],relics:{enabled:true,power:0,containers:{}}});
  return Object.freeze({definitions,rules,queries,pricing,
    admit:(data,authority)=>new CharacterSession(definitions,data,authority),
    live:(frame,effects)=>new CharacterLive(rules,frame,effects),
    create:(classId,{seed=1,board={w:10,h:6},authority=projection()}={})=>{
      const def=rules.class(classId);if(!def)throw Error('Unknown character class');
      const rarity=definitions.workshop.skills.pack.services.rarities.find(row=>row.id==='common'),start=definitions.character.passives.pack.classes.find(row=>row.id===classId).startNode;
      const known=def.bar.filter(id=>id!==null).map(skillId=>({gem:{kind:'skill',skillId,level:1,rarity:rarity.id,sockets:Array(rarity.sockets).fill(null)}}));
      const character=new CharacterSession(definitions,{schemaVersion:1,capability:'character/v1',contentId,nextUid:1,xp:0,craftLore:{},random:new Random(seed).snapshot(),
        state:{board,items:[],equipped:{},overflow:[],essences:{},skillBook:{known,bar:[...def.bar]}},
        character:{schemaVersion:2,capability:'workshop-character/progression-diagnostic',contentId,level:1,baseAttrs:{...def.attributes},
          passives:{classId,allocated:[start],choices:{},grafts:{},vocations:[],passivePoints:definitions.progression.passivePointsAtLevel(1),vocationPoints:0,realmPoints:{}},containers:{},abilityEssences:{}}},{...authority,relics:{...authority.relics,containers:{}}});
      if(Object.keys(authority.relics.containers).length){const change=character.authorize({kind:'projection',projection:authority});if(!change.accepted)throw Error(change.refusal);character.commit(change);}
      return character;
    },
  });
}
