import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {createConnection} from 'node:net';
import {combatContent} from '@hollow-wake/combat/content';import {createCombatSession} from '@hollow-wake/combat';
import {createCharacterKit} from '@hollow-wake/characters';import {Random} from '@hollow-wake/engine';
import builds from '@hollow-wake/character-builds/builds.json' with {type:'json'};
import characters from '@hollow-wake/characters/characters.json' with {type:'json'};
import {createNodeCombatHost,listenCombatHost,lineDecoder} from '@hollow-wake/node-godot';
import {emptyCombatSpace} from './space.mjs';import {replayCombat,prototypeSpace} from './replay.mjs';
const read=name=>JSON.parse(gunzipSync(fs.readFileSync(name+'.json.gz')));
const plain=value=>JSON.parse(JSON.stringify(value));
const fixtures=['combat','interactions','layers-v2','summons-v5','rules-v2','terminal','corpse-rites','relocation'].map(read),hostGeometry=read('host').courses[0];
const replay=replayCombat({createCombatSession,combatContent,emptyCombatSpace,fixtures,hostGeometry});assert(replay.passed,JSON.stringify(replay.failures));
const kit=createCharacterKit(builds,characters);let characterSteps=0;
for(const course of read('character-v2').courses){
 const initial=structuredClone(course.initial),data={schemaVersion:1,capability:'character/v1',contentId:characters.contentId,...initial.data,
  character:{schemaVersion:2,capability:'workshop-character/progression-diagnostic',contentId:characters.contentId,...initial.data.character},nextUid:10000000,random:new Random(17).snapshot(),craftLore:{}};
 const character=kit.admit(data,initial.projection),session=createCombatSession(combatContent,{space:emptyCombatSpace()}),hero=session.addCharacter(kit,character,{name:'Hero',position:{x:400,y:400}});
 for(const step of course.steps){const change=character.prepare(step.command,step.conditions);assert.equal(change.accepted,step.accepted);
  if(change.accepted)assert(session.commitCharacter(hero,change).accepted);
  assert.deepEqual(plain(character.inspect()),step.expected.build);assert.deepEqual(plain(session.build(hero)),plain(character.inspect()));
  assert.deepEqual(plain(kit.admit(character.export(),character.current().projection).inspect()),plain(character.inspect()));characterSteps++;
 }
}
// Replay recorded timing, mine-command and frame-dismissal outcomes through
// the actual adapter input queue. Compare after each original clock advance;
// commands intentionally remain queued until that frame starts.
let adapterCommandComparisons=0;
const adapterCommandCourses=['timing-combined-early','mine-paid-duplicate-command','golem-dismiss-reconstruction'];
for(const id of adapterCommandCourses){
 const fixture=fixtures.find(f=>f.courses.some(c=>c.id===id)),course=fixture.courses.find(c=>c.id===id);
 const adapter=createNodeCombatHost(combatContent,{space:prototypeSpace(emptyCombatSpace,hostGeometry),nativeHero:course.config,seed:fixture.seed});
 if(course.target)adapter.session.addActor(course.target);
 let seq=0,aim=[480,400],held=course.config.skills.map(s=>s.id);
 try{for(const [index,step] of course.steps.entries()){
  const action=step.action;
  // The timing observer primes its window with one 300 ms update. Keep that
  // original setup intact; live adapter frames remain bounded to 250 ms.
  if(id==='timing-combined-early'&&index<2){
   if(action.type==='press')assert.equal(adapter.session.press(adapter.hero,action.skill,action.aim),step.accepted);
   else{assert.equal(action.type,'advance');adapter.session.advance(action.seconds);}
   assert.deepEqual(plain(adapter.session.snapshot()),step.state);continue;
  }
  if(action.type==='advance'){
   adapter.step(action.seconds);
   assert.deepEqual(plain(adapter.session.snapshot()),step.state,id+' adapter clock '+adapterCommandComparisons);
   adapterCommandComparisons++;
  }else if(action.type==='press'&&action.actor){
   assert.equal(adapter.session.press(adapter.session.actor(action.actor),action.skill,action.aim),step.accepted);
  }else{
   assert(['press','meta','timing','dismiss','release'].includes(action.type),id+': unexpected adapter course action');
   if(action.aim)aim=[action.aim.x,action.aim.y];if(action.type==='release')held=[];
   const message={t:'input',seq:++seq,move:[0,0],aim,held,press:action.type==='press'?[action.skill]:[],
    ...(action.type==='meta'?{meta:[action.skill]}:{}),...(action.type==='timing'?{timing:true}:{}),...(action.type==='dismiss'?{dismiss:[action.skill]}:{})};
   assert(adapter.input(message).accepted,id+': valid adapter input refused');
  }
 }}finally{adapter.close();}
}
const course=fixtures[3].courses.find(c=>c.id==='lich-ritual-crowns');
let environmentalFrames=0;
const host=createNodeCombatHost(combatContent,{space:emptyCombatSpace(),nativeHero:course.config,seed:7331,
 services:{safeZone:true,environment:frame=>{assert.equal(frame.seconds,.05);assert(frame.actors.length>0);environmentalFrames++;return [];}}});
assert(host.input({t:'input',seq:1,move:[0,0],aim:[480,400],press:['summon_skeleton_mage']}).accepted);
for(let n=0;n<180;n++)host.step(.05);
assert.equal(environmentalFrames,180,'The Node wrapper omitted trusted environment services');
assert(host.session.snapshot().actors.some(a=>a.defId==='ossuary_lich'));
const detail=host.inspect();assert(detail.hero.skills.some(s=>s.id==='summon_skeleton_mage'));
detail.hero.skills.length=0;assert(host.inspect().hero.skills.length>0,'Inspection leaked live state');
assert(!host.input({t:'input',seq:2,move:[0,0],aim:[480,400],press:[],timing:.9}).accepted);
assert(host.input({t:'input',seq:2,move:[0,0],aim:[480,400],press:[],timing:true,meta:[],dismiss:[]}).accepted);host.step(.05);
const server=await listenCombatHost(host,{port:0,stepSeconds:.05});let socket;
try{await new Promise((resolve,reject)=>{
 const seen=new Set(),timer=setTimeout(()=>reject(Error('Inspection transport timeout')),5000);
 socket=createConnection({port:server.port,host:'127.0.0.1'});socket.on('error',reject);
 const decode=lineDecoder(message=>{if(message.t==='inspect'){assert(message.hero.skills.length);assert(Array.isArray(message.visuals.fields));seen.add('inspect');}
  if(message.t==='saved'){assert.equal(message.accepted,false);assert.equal(message.reason,'storage-unavailable');seen.add('save');}
  if(seen.size===2){clearTimeout(timer);resolve();}});
 socket.on('data',chunk=>{try{decode(chunk);}catch(error){clearTimeout(timer);reject(error);}});
 socket.on('connect',()=>socket.write('{"t":"inspect"}\n{"t":"save"}\n'));
 });
}finally{socket?.destroy();await server.close();}
console.log(JSON.stringify({passed:true,combat:replay,characterSteps,adapterCommandCourses,adapterCommandComparisons,adapterInspection:true,hostServices:true,persistenceRequired:false}));
