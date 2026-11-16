import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createConnection} from 'node:net';
import {combatContent} from '@hollow-wake/combat/content';
import {createReferenceSpace,createNodeCombatHost,lineDecoder,listenCombatHost,createMemoryCharacterStore} from '@hollow-wake/node-godot';
import {createReferenceScene} from './host/scene.mjs';import {createFileCharacterStore} from './host/file-store.mjs';
import {createCombatSession} from '@hollow-wake/combat';
import {setTimeout as pause} from 'node:timers/promises';
import {verifyLocomotionCourses} from './locomotion.mjs';
import {verifyCharacterCourses} from './characters.mjs';
import {createCharacterKit} from '@hollow-wake/characters';
import builds from '@hollow-wake/character-builds/builds.json' with {type:'json'};
import characters from '@hollow-wake/characters/characters.json' with {type:'json'};
const native={name:'Hero',team:'player',position:{x:400,y:400},stats:{life:10000,mana:10000},attributes:Object.fromEntries(Object.keys(combatContent.hitQueries.ATTRIBUTES).map(id=>[id,100]))};
let courses=0,observations=0,contracts=0;const refused=[];
{
 const a=createReferenceScene({wall:false,platform:false}),b=createReferenceScene({wall:false,platform:false});
 try{
  const before=b.character.export(),state=b.session.snapshot();assert.deepEqual(a.character.export(),before);
  assert(a.grant({kind:'points',currency:'passive',amount:2}).accepted);
  assert(a.build(a.inventory().actions.find(row=>row.command.kind==='passive').command).accepted);a.step();
  assert.deepEqual(b.character.export(),before);assert.deepEqual(b.session.snapshot(),state);contracts++;
 }finally{a.close();b.close();}
}
for(const name of ['combat-frames','combat-families'])for(const c of JSON.parse(gunzipSync(fs.readFileSync(name+'.json.gz'))).courses){
 const space=createReferenceSpace(combatContent,{width:1600,height:1200});space.viewRectFor=a=>a.frameLockRect??c.view;
 let host;try{host=createNodeCombatHost(combatContent,{space,seed:c.seed,nativeHero:{...native,skills:[c.id],resourceFraction:c.resourceFraction}});}
 catch(e){assert.equal(name,'combat-families');assert.match(e.message,/missing-host-service/);refused.push(c.id);continue;}
 host.session.addActor({name:'Target',team:'enemy',position:{x:440,y:400},stats:{life:10000,mana:10000},resourceFraction:c.resourceFraction});
 for(let i=1;i<c.steps.length;i++){
  assert(host.input({t:'input',seq:i,move:[0,0],aim:[440,400],press:i===1?[c.id]:[],held:c.releaseStep!==undefined&&i>=c.releaseStep?[]:[c.id]}).accepted);
  const view=host.step(.1);assert.doesNotThrow(()=>JSON.stringify(view));
  const actual={...host.session.snapshot(),...(name==='combat-families'?{effects:host.session.effects()}:{})};
  assert.deepEqual(JSON.parse(JSON.stringify(actual)),c.steps[i],`${name}: ${c.id} frame ${i}`);observations++;
 }
 host.close();courses++;
}
assert.deepEqual(refused,['town_portal','shatterstep','kindle_wick','steam_vent','steam_veil']);
{
 const host=createNodeCombatHost(combatContent,{space:createReferenceSpace(combatContent),nativeHero:{...native,skills:['whirlwind']}});
 const input={t:'input',seq:0,move:[0,0],aim:[440,400],press:['whirlwind'],hold:true};
 assert(host.input(input).accepted);host.step(.1);
 assert(host.input({...input,seq:1,press:[]}).accepted);host.step(.1);
 for(let i=0;i<10;i++)host.step(.1);
 assert.equal(host.session.inspect(host.hero).casting?.id,'whirlwind');contracts++;
 host.disconnect();
 assert(host.input({...input,seq:0,press:[],hold:false}).accepted);
 for(let i=0;i<10;i++)host.step(.1);
 assert.equal(host.session.inspect(host.hero).casting,null);contracts++;
 host.close();host.disconnect();
}
{
 const space=createReferenceSpace(combatContent,{wall:true,platform:true});
 const facts={id:1,pos:{x:600,y:400},radius:14,tier:0,flying:false,touchdown:false};
 const unchanged=structuredClone(facts),to={x:850,y:400};
 const stopped=space.stepPhysical(facts,to,facts.pos);assert(stopped.pos.x<=706);assert.deepEqual(facts,unchanged);contracts++;
 assert.equal(space.stepPhysical(facts,to,facts.pos,{ignoreConfine:true}).pos.x,850);contracts++;
 assert(space.stepPhysical(facts,to,facts.pos,{ignoreFall:true}).pos.x<=706);contracts++;
 assert.equal(space.lineOfFire({x:600,y:400},{x:900,y:400}),false);assert.equal(space.castGridRay({x:600,y:400},{x:900,y:400}),.4);contracts++;
 assert.equal(space.stepPhysical({...facts,pos:{x:1090,y:750}},{x:1110,y:750},{x:1090,y:750}).tier,1);contracts++;
 assert.equal(space.stepPhysical({...facts,pos:{x:1090,y:400}},{x:1110,y:400},{x:1090,y:400}).tier,0);contracts++;
 const session=createCombatSession(combatContent,{space}),hero=session.addActor({...native,position:{x:1090,y:750},skills:['firebolt']}),
  enemy=session.addActor({name:'Lower target',team:'enemy',position:{x:1180,y:750},stats:{life:10000}});
 session.move(hero,{x:1,y:0},.1);assert.equal(session.pose(hero).tier,1);assert(session.press(hero,'firebolt',{x:1180,y:750}));
 for(let i=0;i<20;i++)session.advance(.1);assert.equal(session.inspect(enemy).life,10000);contracts++;
}
for(const name of ['combat-locomotion','combat-locomotion-airborne']){
 const motion=verifyLocomotionCourses({fixture:JSON.parse(gunzipSync(fs.readFileSync(name+'.json.gz'))),content:combatContent,createCombatSession,
  emptyCombatSpace:(width,height)=>createReferenceSpace(combatContent,{width,height})});courses+=motion.courses;observations+=motion.observations;
}
const characterCourses=verifyCharacterCourses({fixture:JSON.parse(gunzipSync(fs.readFileSync('character-session.json.gz'))),
 kit:createCharacterKit(builds,characters),pack:characters,combatContent,createCombatSession,createNodeHost:createNodeCombatHost,
 emptyCombatSpace:(width,height)=>createReferenceSpace(combatContent,{width,height})});
{
 const host=createReferenceScene({wall:false,platform:false}),before=host.session.snapshot();
 for(const input of [null,{}, {t:'input',seq:0,move:[NaN,0],aim:[0,0],press:[]},
  {t:'input',seq:0,move:[2,0],aim:[0,0],press:[]}, {t:'input',seq:0,move:[0,0],aim:[0,0],press:[],actor:2}]){
  assert.equal(host.input(input).accepted,false);assert.deepEqual(host.session.snapshot(),before);contracts++;
 }
 const input={t:'input',seq:1,move:[1,0],aim:[610,410],press:[]};assert(host.input(input).accepted);input.move[0]=-1;
 assert(!host.input(input).accepted);host.step();assert(host.session.inspect(host.hero).pos.x>400);contracts++;
 for(let i=2;i<34;i++)assert(host.input({...input,seq:i}).accepted);
 assert(!host.input({...input,seq:34}).accepted);host.disconnect();host.step();contracts++;
 const data=host.character.export();
 for(const kind of ['xp','items','projection','vocation']){assert(!host.build({kind,request:{}}).accepted);assert.deepEqual(host.character.export(),data);contracts++;}
 for(const kind of ['inventory','support','passive']){
  const action=host.inventory().actions.find(a=>a.command.kind===kind);assert(action,kind);
  const before=host.character.export(),combat=host.session.snapshot();assert(host.build(action.command,{preview:true}).accepted);
  assert.deepEqual(host.character.export(),before);assert.deepEqual(host.session.snapshot(),combat);
  assert(host.build(action.command).accepted);assert.notDeepEqual(host.character.export(),before);contracts++;
 }
 assert.equal(host.inventory().revision,3);
 const memory=createMemoryCharacterStore(),file=createFileCharacterStore('character-proof.json');
 for(const store of [memory,file]){
  const exported=host.character.export();await store.save(exported);exported.state.items.length=0;
  const restored=createReferenceScene({saved:await store.load(),wall:false,platform:false});
  assert.deepEqual(restored.character.export(),host.character.export());assert.deepEqual(restored.inventory().stats,host.inventory().stats);restored.close();contracts++;
 }
 assert.deepEqual(memory.load(),await file.load());
 const server=await listenCombatHost(host,{port:0,save:value=>memory.save(value)});let socket;
 try{
  const messages=[];socket=createConnection({host:'127.0.0.1',port:server.port});
  const decode=lineDecoder(m=>messages.push(m));socket.on('data',decode);
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{clearInterval(poll);reject(Error('Wire verification timeout'));},10000);
   const poll=setInterval(()=>{if(messages.some(m=>m.t==='hello')&&messages.some(m=>m.t==='state'&&m.ack===100)){clearTimeout(timeout);clearInterval(poll);resolve();}},10);
   socket.on('error',error=>{clearInterval(poll);clearTimeout(timeout);reject(error);});
   socket.on('connect',()=>{const text=JSON.stringify({t:'input',seq:100,move:[0,1],aim:[610,410],press:['firebolt'],held:[]})+'\n';socket.write(text.slice(0,7));socket.write(text.slice(7));});
  });contracts++;
  assert(host.grant({kind:'points',currency:'passive',amount:1}).accepted);
  for(let i=0;i<500&&!messages.some(m=>m.t==='inventory'&&m.inventory.revision===4);i++)await pause(20);
  assert(messages.some(m=>m.t==='inventory'&&m.inventory.revision===4),'Host grant must publish a fresh Inventory view');contracts++;
 }finally{socket?.destroy();await server.close();}
}
{
 const rows=[],decode=lineDecoder(x=>rows.push(x));const bytes=Buffer.from('{"name":"Élan"}\n{"t":"next"}\n');
 for(const byte of bytes)decode(Buffer.from([byte]));assert.deepEqual(rows,[{name:'Élan'},{t:'next'}]);contracts++;
 for(const invalid of [Buffer.from('bad\n'),Buffer.from([0xff,10]),Buffer.alloc(65537,65)]){
  const parse=lineDecoder(()=>assert.fail('Invalid frame dispatched'));assert.throws(()=>parse(invalid));assert.throws(()=>parse(Buffer.from('{}\n')),/closed/);contracts++;
 }
}
console.log(JSON.stringify({passed:true,courses,observations,characterCourses,contracts,explicitWorldServiceRefusals:refused,transport:'localhost-ndjson',persistenceRequired:false}));
