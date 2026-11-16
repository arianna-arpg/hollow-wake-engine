import assert from 'node:assert/strict';
import {Random} from '@hollow-wake/engine';
import {ItemContent} from '@hollow-wake/engine/items';
import {createItemHost} from '@hollow-wake/engine/items/host';
import {createCharacterKit} from '@hollow-wake/characters';
import builds from '@hollow-wake/character-builds/builds.json' with {type:'json'};
import characters from '@hollow-wake/characters/characters.json' with {type:'json'};
import {combatContent} from '@hollow-wake/combat/content';
import {createNodeCombatHost,createReferenceSpace} from '@hollow-wake/node-godot';

// Share the immutable kit. Mutable investment and combat belong to this owner.
const kit=createCharacterKit(builds,characters),character=kit.create('magician',{seed:71});
const space=createReferenceSpace(combatContent,{wall:false,platform:false});
const host=createNodeCombatHost(combatContent,{kit,character,space,seed:711});
try {
  const random=new Random(711);let uid=character.export().nextUid;
  const items=createItemHost(new ItemContent(builds.items),()=>uid++);
  const ring=items.roll({baseId:'ring_lapis',ilvl:1,rarity:'common'},()=>random.next());
  // The game decides entitlement; this is a trusted grant, never client input.
  assert(host.grant({kind:'items',items:[ring]}).accepted);
  const command={kind:'inventory',request:{op:'equip',uid:ring.uid,slot:'ring1'}};
  const before=character.export();
  assert(host.build(command,{preview:true}).accepted);
  assert.deepEqual(character.export(),before,'Preview must not publish');
  assert(host.build(command).accepted);

  const target=host.session.addActor({name:'Training target',team:'enemy',position:{x:440,y:400},stats:{life:10000,mana:10000}});
  const initialLife=host.session.inspect(target).life;
  assert(host.input({t:'input',seq:0,move:[0,0],aim:[440,400],press:['firebolt'],held:[]}).accepted);
  for(let frame=0;frame<120;frame++)host.step(1/60);
  assert(host.session.inspect(target).life<initialLife,'The cast must land a real hit');

  // Detached character investment is useful without choosing a save format.
  const data=character.export(),restored=kit.admit(data,{features:[],relics:{enabled:true,power:0,containers:{}}});
  assert.deepEqual(restored.export(),data);
  console.log(JSON.stringify({passed:true,equipped:true,previewPreservedState:true,castHit:true,detachedAdmission:true,
    persistenceRequired:false,questsRequired:false}));
} finally {host.close();}
