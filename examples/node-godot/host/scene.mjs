import {Random} from '@hollow-wake/engine';
import {ItemContent} from '@hollow-wake/engine/items';
import {createItemHost} from '@hollow-wake/engine/items/host';
import {createGemCargo} from '@hollow-wake/engine/inventory/gems';
import {createCharacterKit} from '@hollow-wake/characters';
import builds from '@hollow-wake/character-builds/builds.json' with {type:'json'};
import characters from '@hollow-wake/characters/characters.json' with {type:'json'};
import {combatContent} from '@hollow-wake/combat/content';
import {createNodeCombatHost,createReferenceSpace} from '@hollow-wake/node-godot';

// Immutable authored catalogues are loaded once for this host module. Every
// character, item identity source, random stream and combat session stays owned
// by its scene. Reopening Inventory or creating another scene needs no recopy
// and revalidation of the entire catalogue.
const kit=createCharacterKit(builds,characters),itemContent=new ItemContent(builds.items);

/** Authored example setup, never a client reward or campaign dependency. */
export function createReferenceScene({saved=null,wall=true,platform=true,skill=null}={}) {
 if(skill){
  const space=createReferenceSpace(combatContent,{wall,platform});
  const host=createNodeCombatHost(combatContent,{space,nativeHero:{name:'Effect gallery',team:'player',position:{x:400,y:400},
   stats:{life:10000,mana:10000},attributes:Object.fromEntries(builds.passives.attributes.map(row=>[row.id,100])),skills:[skill],resourceFraction:.6}});
  host.session.addActor({name:'Target',team:'enemy',position:{x:440,y:400},stats:{life:10000,mana:10000}});
  return host;
 }
 const authority={features:[],relics:{enabled:true,power:0,containers:{}}};
 const character=saved?kit.admit(saved,authority):kit.create('magician',{seed:71});
 if(!saved){
  const random=new Random(71);let uid=character.export().nextUid;
  const items=createItemHost(itemContent,()=>uid++);
  const ring=items.roll({baseId:'ring_lapis',ilvl:1,rarity:'common'},()=>random.next());
  const cargo=createGemCargo({nextUid:()=>uid++,support:id=>kit.rules.equipment.support(id)});
  const known=character.export().state.skillBook.known;
  const supportId=['added_fire','measured_blows','corrosion'].find(id=>known.some(s=>character.canSocket(s.gem.skillId,id)));
  if(!supportId)throw Error('No compatible reference support');
  const support=cargo.makeSupportGemItem({def:kit.rules.equipment.support(supportId),level:1});
  for(const grant of [{kind:'items',items:[ring,support]},{kind:'points',currency:'passive',amount:3}]){
   const change=character.authorize(grant);if(!change.accepted)throw Error('Reference setup: '+change.refusal);character.commit(change);
  }
 }
 const space=createReferenceSpace(combatContent,{wall,platform}),host=createNodeCombatHost(combatContent,{kit,character,space,seed:711});
 host.session.addActor({name:'Training target',team:'enemy',position:{x:610,y:410},stats:{life:100000,mana:10000}});
 host.session.addActor({name:'Upper target',team:'enemy',position:{x:1230,y:740},layer:1,stats:{life:100000,mana:10000}});
 const actions=()=>{
  const data=character.export(),rows=[];
  for(const item of data.state.items){
   if(item.baseId==='ring_lapis')rows.push({label:'Equip '+item.name,command:{kind:'inventory',request:{op:'equip',uid:item.uid,slot:'ring1'}}});
   if(item.gem?.kind==='support'){
    const skill=data.state.skillBook.known.find(s=>character.canSocket(s.gem.skillId,item.gem.supportId));
    if(skill)rows.push({label:'Socket '+item.name,command:{kind:'support',request:{op:'socket',residence:'learned',skillId:skill.gem.skillId,uid:item.uid}}});
   }
  }
  const allocated=new Set(data.character.passives.allocated);
  const neighbours=new Set([...allocated].flatMap(id=>characters.passives.adjacency[id]??[]));
  for(const id of neighbours){if(allocated.has(id))continue;
   const command={kind:'passive',request:{op:'allocate',nodeId:id}};
   if(character.prepare(command,{refundRefusal:null,openAllRealms:false,runLedger:{}}).accepted)
    rows.push({label:'Allocate '+(characters.passives.nodes.find(n=>n.id===id)?.name??id),command});
   if(rows.length>=10)break;
  }
  return rows;
 };
 const inventory=()=>({...host.inventory(),actions:actions()});
 return Object.freeze({...host,inventory,hello:()=>({...host.hello(),inventory:inventory()}),
  build:(command,options)=>{const result=host.build(command,options);if(result.inventory)result.inventory=inventory();return result;},
  grant:request=>{const result=host.grant(request);if(result.inventory)result.inventory=inventory();return result;},
 });
}
