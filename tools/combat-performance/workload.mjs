import {createReferenceScene} from './scene.mjs';
import {createNodeCombatHost,createReferenceSpace} from '@hollow-wake/node-godot';
import {combatContent} from '@hollow-wake/combat/content';
import {createCharacterKit} from '@hollow-wake/characters';
import builds from '@hollow-wake/character-builds/builds.json' with {type:'json'};
import characters from '@hollow-wake/characters/characters.json' with {type:'json'};
import {Random} from '@hollow-wake/engine';
import {ItemContent} from '@hollow-wake/engine/items';
import {createItemHost} from '@hollow-wake/engine/items/host';

export const specification=Object.freeze({version:1,seed:711,seconds:1/60,warmup:120,frames:600,
 courses:['mixed-32','mixed-128','summons-procs-32','build-combat-32','character-create','inventory-24','build-edits','create-release'],
 note:'Synthetic encounter placement and sustained resources; authored skills, status, proc, summon, movement and build rules. No AI, renderer, persistence or quests.'});
const need=(ok,message)=>{if(!ok)throw Error(message);};
let kit;
const getKit=()=>kit??=createCharacterKit(builds,characters);
export function createCourse(name){
 if(name.startsWith('mixed-')||name==='summons-procs-32'||name==='build-combat-32'){
  const count=Number(name.split('-').at(-1)),heavy=name.startsWith('summons');
  const space=createReferenceSpace(combatContent,{width:2400,height:2400});
  const skills=heavy?['firebolt','summon_skeleton_mage']:['firebolt','hive_poison_spit','vine_lash'];
  const stats={life:1e7,mana:1e7,accuracy:10000,...(heavy?{proc_brutal_strike:1,critChance:1}:{})};
  const attributes=Object.fromEntries(Object.keys(combatContent.hitQueries.ATTRIBUTES).map(id=>[id,100]));
  const host=name==='build-combat-32'?createReferenceScene({wall:false,platform:false}):createNodeCombatHost(combatContent,{space,seed:711,nativeHero:{name:'Benchmark hero',team:'player',position:{x:400,y:400},stats,skills,
   attributes}});
  if(name==='build-combat-32')for(const kind of ['inventory','support','passive'])need(host.build(host.inventory().actions.find(a=>a.command.kind===kind).command).accepted,'Build combat setup');
  const casters=[host.hero],targets=[{x:440,y:400}];
  for(let i=name==='build-combat-32'?3:1;i<count;i++){
   const pair=Math.floor(i/2),at={x:400+(pair%8)*160+(i%2?40:0),y:400+Math.floor(pair/8)*160};
   const actor=host.session.addActor({name:'Body '+i,team:i%2?'enemy':'player',position:at,stats,attributes,skills:i%2?[]:skills,controlled:i%2===0});
   if(i%2===0){casters.push(actor);targets.push({x:at.x+40,y:at.y});}
  }
  let frame=0,presses=0,accepted=0,procEvents=0,maxBodies=count,maxShots=0,maxStatuses=0,last;
  return {name,step(){
   if(frame%60===0)for(let i=0;i<casters.length;i++){
    const skill=name==='build-combat-32'&&i===0?'firebolt':skills[(Math.floor(frame/60)+i)%skills.length];presses++;
    if(host.session.press(casters[i],skill,targets[i]))accepted++;
   }
   need(host.input({t:'input',seq:frame,move:[0,Math.floor(frame/120)%2?.1:-.1],aim:[targets[0].x,targets[0].y],press:[],held:skills}).accepted,'Input refusal');
   // Host input uses compact wire points; preserve the same authored aim.
   last=host.step(specification.seconds);frame++;
   maxBodies=Math.max(maxBodies,last.bodies.length);maxShots=Math.max(maxShots,last.shots.length);
   maxStatuses=Math.max(maxStatuses,last.bodies.reduce((n,b)=>n+b.statuses.length,0));
   procEvents+=last.events.filter(e=>e.kind==='proc').length;return last;
  },observe(){return {frame,presses,accepted,procEvents,maxBodies,maxShots,maxStatuses,frameState:last,
   combat:host.session.snapshot(),effects:host.session.effects(),procs:host.session.procs()};},close(){host.close();}};
 }
 if(name==='character-create'){
  const shared=getKit();let current,count=0;
  return {name,step(){count++;current=shared.create('magician',{seed:711});return current.stat('life');},
   observe(){return {count,character:current.export(),build:current.inspect()};},close(){current=null;}};
 }
 if(name==='create-release'){
  const shared=getKit();let count=0,last;
  return {name,step(){const character=shared.create('magician',{seed:711}),host=createNodeCombatHost(combatContent,{kit:shared,character,
   space:createReferenceSpace(combatContent),seed:711});last=host.step();host.close();count++;return last;},observe(){return {count,last};},close(){last=null;}};
 }
 let host=createReferenceScene({wall:false,platform:false}),count=0,last;
 if(name==='inventory-24'){
  const rng=new Random(711);let uid=host.character.export().nextUid;
  const items=createItemHost(new ItemContent(builds.items),()=>uid++);
  need(host.grant({kind:'items',items:Array.from({length:24},()=>items.roll({baseId:'ring_lapis',ilvl:1,rarity:'common'},()=>rng.next()))}).accepted,'Cargo setup');
  const ids=host.character.export().state.items.filter(i=>i.baseId==='ring_lapis').map(i=>i.uid);
  need(ids.length>=24,'Populated Inventory is incomplete');
  return {name,step(){count++;last={inventory:host.inventory(),cards:ids.map(id=>host.character.item(id))};return last;},
   observe(){return {count,last};},close(){host.close();host=null;last=null;}};
 }
 need(name==='build-edits','Unknown workload');
 let commands;
 return {name,prepare(){host.close();host=createReferenceScene({wall:false,platform:false});commands=['inventory','support','passive'].map(kind=>{
   const action=host.inventory().actions.find(a=>a.command.kind===kind);need(action,'Missing '+kind+' action');return action.command;});},
  step(){count++;last=[];for(const command of commands){
   const preview=host.build(command,{preview:true});need(preview.accepted,'Preview refusal');
   const applied=host.build(command);need(applied.accepted,'Edit refusal');last.push({preview,applied});
  }return last;},observe(){return {count,last,combat:host.session.snapshot(),character:host.character.export()};},close(){host.close();host=null;last=null;}};
}
