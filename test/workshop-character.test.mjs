import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountWorkshopSession} from '../dist/account-workshop-session.js';
import {WorkshopBuildPreparation} from '../dist/workshop-build-preparation.js';
import {WorkshopCharacterData} from '../dist/workshop-character.js';
import {PassivePolicy} from '../dist/passive-policy.js';
import {PassiveGrants} from '../dist/passive-grants.js';
import {WorkshopSkillBook} from '../dist/workshop-skill-book.js';
import {ItemRules} from '../dist/item-rules.js';
import {baseline,definitions} from './shared-account/fixtures.mjs';
import {send,workshopSave,accountSave,splitAccount,access} from './shared-account/contracts.mjs';
import {characterPacks,originalBuilds} from './workshop-character-fixture.mjs';
const copy=structuredClone,plain=value=>JSON.parse(JSON.stringify(value));
const scenario=baseline.scenarios[0];
const policy=new PassivePolicy({schemaVersion:1,capability:'passive-policy/v1',contentId:'tiny-policy',defaultPick:1,pickCost:1,requireVocationGate:false,
 nodes:[{id:'root',name:'Root'},{id:'choice',name:'Choice',choice:{group:'pick'}},{id:'graft',name:'Graft',graft:{support:'arcing'}},
 {id:'v',name:'Vocation',vocation:'smith'}],adjacency:{root:['choice','graft','v'],choice:['root'],graft:['root'],v:['root']},
 groups:[{id:'pick',options:[{id:'a'},{id:'b'}]}],realms:[{id:'tree'}],classes:[{id:'mage',startNode:'root'}],vocations:[{id:'smith',root:'v',gate:null}]});
const characterDefinitions={contentId:'tiny-character',passives:policy,attributes:['strength'],
 containers:[{id:'case',accepts:{categories:['helmet']}},{id:'reliquary',accountStorage:true,accepts:{categories:['relic']}}]};
function context(){return {schemaVersion:1,capability:'workshop-character/v1',contentId:'tiny-character',level:14,baseAttrs:{strength:9.25},
 passives:{classId:'mage',allocated:['root','choice','graft','v'],choices:{choice:['b']},grafts:{graft:null},vocations:['smith'],
 passivePoints:3,vocationPoints:2,realmPoints:{favor:7}},containers:{case:[],reliquary:[]}};}
const inventory=()=>copy(scenario.initial.inventory);
function setup(extra={}){
 const host=new AccountWorkshopSession({...definitions,character:characterDefinitions,...extra});
 send(host,{op:'open-account',account:1,key:'character',seed:scenario.accountSeed,...splitAccount(scenario.initial.account)});
 return host;
}
const open=(host,character=context(),profile=1,state=inventory(),extra={})=>host.command({op:'open-workshop',profile,account:1,
 seed:scenario.workshopSeed,state,...(character===null?{}:{character}),...extra});
const ok=value=>{assert.equal(value.ok,true,JSON.stringify(value));return value;};
const lock=(host,on=true,profile=1)=>host.command({op:'workshop',profile,command:{op:'lock',uid:1001,on,access}});
const helmet=()=>{const item=inventory().items[0];item.uid=8000;item.x=2;item.y=3;return item;};

test('legacy inventory keeps its exact v1 format and command results when character support is configured',()=>{
 const enabled=setup(),disabled=setup({character:undefined});ok(open(enabled,null));ok(open(disabled,null));
 assert.deepEqual(plain(lock(enabled)),plain(lock(disabled)));assert.deepEqual(workshopSave(enabled),workshopSave(disabled));
 assert.equal(workshopSave(enabled).schemaVersion,1);assert(!Object.hasOwn(workshopSave(enabled),'character'));
});
test('v2 roundtrips source context without changing order, passive values or inventory authority',()=>{
 const host=setup(),source=context();source.containers.case.push(helmet());ok(open(host,source));
 const saved=workshopSave(host);assert.equal(saved.schemaVersion,2);assert.equal(saved.capability,'account-workshop-inventory/v2');
 assert.deepEqual(saved.character,source);assert.equal(saved.workshop.nextUid,8001);assert(!Object.hasOwn(saved.workshop.state,'character'));
 source.baseAttrs.strength=1000;source.containers.case[0].uid=1;assert.deepEqual(workshopSave(host),saved);
 const restored=setup();send(restored,{op:'restore-workshop',profile:1,account:1,save:saved});
 assert.deepEqual(workshopSave(restored),saved);ok(lock(restored));assert.deepEqual(workshopSave(restored).character,saved.character);
 saved.character.passives.choices.choice.length=0;assert.deepEqual(workshopSave(restored).character.passives.choices.choice,['b']);
});
test('prepared saves retain context and private continuations across commit, abort and detached service edits',()=>{
 const trace=[];
 const services={initialize:input=>{trace.push(['init',copy(input.character)]);return {turn:0};},
 fork:(source,input)=>{trace.push(['fork',source.turn,copy(input.character)]);return {turn:source.turn+1};},
 derive:(candidate,input)=>{assert.equal(input.character.baseAttrs.strength,9.25);input.character.baseAttrs.strength=-100;
 input.character.containers.case.push(helmet());return [];}};
 const host=setup({preparation:new WorkshopBuildPreparation(services)});ok(open(host));const before=workshopSave(host);
 const prep=()=>send(host,{op:'prepare',commands:[{op:'workshop',profile:1,command:{op:'lock',uid:1001,on:true,access}}]});
 let pending=prep();const staged=send(host,{op:'prepared-save',token:pending.token,kind:'workshop',handle:1}).save;
 assert.deepEqual(staged.character,before.character);assert.deepEqual(workshopSave(host),before);
 send(host,{op:'abort-prepared',token:pending.token});assert.deepEqual(workshopSave(host),before);
 pending=prep();send(host,{op:'commit-prepared',token:pending.token});assert.deepEqual(workshopSave(host),staged);
 ok(lock(host,false));assert.equal(trace.filter(row=>row[0]==='init').length,1);
 assert.deepEqual(trace.filter(row=>row[0]==='fork').map(row=>row[1]),[0,0,1]);
 assert.deepEqual(workshopSave(host).character,before.character);
});
test('every personal body reserves its UID including inactive and outside-board positions',()=>{
 const source=context();source.containers.case=[helmet()];source.containers.case[0].x=100;
 const host=setup();assert.equal(open(host,source,1,inventory(),{nextUid:8000}).reason,'character-uid-floor');
 ok(open(host,source));const saved=workshopSave(host);assert.equal(saved.workshop.nextUid,8001);
 saved.workshop.nextUid=8000;const another=setup();assert.equal(another.command({op:'restore-workshop',profile:1,account:1,save:saved}).reason,'character-uid-floor');
 const collision=context();collision.containers.case=[helmet()];collision.containers.case[0].uid=1001;
 assert.equal(open(another,collision).reason,'duplicate-character-uid');
});
test('strict context admission rejects malformed, retired and cross-content sources before publication',()=>{
 const edits=[c=>c.contentId='different',c=>c.level=0,c=>c.schemaVersion=2,c=>c.baseAttrs.extra=1,c=>delete c.baseAttrs.strength,
 c=>c.passives.classId='retired',c=>c.passives.allocated.push('root'),c=>c.passives.allocated.push('retired'),
 c=>c.passives.choices.choice=['a','b'],c=>c.passives.vocations.push('smith'),c=>c.passives.grafts.graft='firebolt',
 c=>c.passives.passivePoints=-1,c=>c.passives.realmPoints.favor=.5,c=>c.passives.unknown=true,
 c=>c.containers.unknown=[],c=>{c.containers.case=[helmet()];delete c.containers.case[0].x;},
 c=>{const i=inventory().items[1];c.containers.case=[i];},c=>c.cachedSheet={}];
 for(const edit of edits){const host=setup(),c=context();edit(c);const before=copy(c),a=accountSave(host);
 assert.equal(open(host,c).ok,false);assert.deepEqual(c,before);assert.equal(host.command({op:'workshop-save',profile:1}).reason,'workshop-not-open');
 assert.deepEqual(accountSave(host),a);ok(open(host));}
});
test('v2 refuses account relic echoes in every local custody location and nonempty account containers',()=>{
 for(const place of ['bag','equipment','overflow','container','account-container']){
  const host=setup(),c=context(),state=inventory(),item=helmet();item.relicKey='canonical-account-key';
  if(place==='container')c.containers.case=[item];
  else if(place==='account-container'){
   const relic=new ItemRules(definitions.workshop.crafting.items,17,8100).roll({uniqueId:'hermits_bead',ilvl:30});
   assert(relic);relic.x=0;relic.y=0;c.containers.reliquary=[relic];
  }
  else if(place==='bag'){state.items[0].relicKey=item.relicKey;}
  else {delete item.x;delete item.y;if(place==='equipment')state.equipped.helmet=item;else state.overflow.push(item);}
  const result=open(host,c,1,state);assert.equal(result.ok,false,place);
  assert(['account-item-in-character','account-container-in-character'].includes(result.reason),result.reason);
 }
});
test('v2 cannot be loaded without matching support, changed to v1 or attached to a different account',()=>{
 const host=setup();ok(open(host));const saved=workshopSave(host);
 const disabled=setup({character:undefined});assert.equal(disabled.command({op:'restore-workshop',profile:1,account:1,save:saved}).reason,'character-context-unavailable');
 for(const edit of [s=>s.schemaVersion=1,s=>s.capability='account-workshop-inventory/v1',s=>delete s.character,s=>s.accountKey='elsewhere']){
  const target=setup(),value=copy(saved);edit(value);assert.equal(target.command({op:'restore-workshop',profile:1,account:1,save:value}).ok,false);
 }
});
test('account refresh gives each sibling its own context and refuses all publications on a late failure',()=>{
 let fail=false;const calls=[];
 const prep=new WorkshopBuildPreparation({initialize:()=>({turn:0}),fork:source=>({turn:source.turn+1}),derive:(_candidate,input)=>{
  calls.push([input.profile,input.phase,input.character.level,input.account.progression.account.credits]);
  if(fail&&input.profile===2)throw Error('last sibling failed');return [];
 }});
 const host=setup({preparation:prep});ok(open(host));const c=context();c.level=22;ok(open(host,c,2));
 const a=accountSave(host),one=workshopSave(host),two=workshopSave(host,2);
 const request={op:'account',account:1,command:{op:'observe',level:a.progression.account.level,ledger:a.progression.account.ledger,credits:1002,roster:[]}};
 fail=true;assert.throws(()=>host.command(request),/last sibling/);assert.deepEqual(accountSave(host),a);
 assert.deepEqual(workshopSave(host),one);assert.deepEqual(workshopSave(host,2),two);
 fail=false;send(host,request);assert.deepEqual(calls.slice(-2),[[1,'account',14,1002],[2,'account',22,1002]]);
 assert.deepEqual(workshopSave(host).character,one.character);assert.deepEqual(workshopSave(host,2).character,two.character);
});
test('complete save bounds include context and failure leaves an available profile handle',()=>{
 const host=setup(),c=context();c.passives.realmPoints={};for(let i=0;i<33000;i++)c.passives.realmPoints['realm'+i]=i;
 assert.equal(open(host,c).ok,false);ok(open(host));assert.equal(workshopSave(host).schemaVersion,2);
});
test('standalone admission returns detached data and preserves fractional source attributes',()=>{
 const data=new WorkshopCharacterData(characterDefinitions,definitions.workshop),source=context(),state=inventory();
 const admitted=data.admit(source,state);assert.deepEqual(plain(admitted),source);admitted.passives.allocated.length=0;
 admitted.baseAttrs.strength=0;assert.equal(source.baseAttrs.strength,9.25);assert.equal(source.passives.allocated.length,4);
});
test('an inventory edit cannot orphan a bound passive graft, and admitted new bodies skip container addresses',()=>{
 const c=context(),state=inventory();c.containers.case=[helmet()];c.passives.grafts.graft='firebolt';
 state.skillBook={known:[{gem:{kind:'skill',skillId:'firebolt',level:1,rarity:'common',sockets:[null]}}],bar:Array(8).fill(null)};
 const host=setup({rack:new WorkshopSkillBook(definitions.workshop.crafting.items)});ok(open(host,c,1,state));
 const before=workshopSave(host),request={op:'workshop',profile:1,command:{op:'unlearn-skill',skillId:'firebolt',blocked:{}}};
 assert.equal(host.command(request).reason,'unknown-graft-carrier');assert.deepEqual(workshopSave(host),before);
 const other=setup({rack:new WorkshopSkillBook(definitions.workshop.crafting.items)});c.passives.grafts.graft=null;ok(open(other,c,1,state));
 send(other,request);const saved=workshopSave(other);assert(saved.workshop.state.items.some(item=>item.uid===8001&&item.gem?.skillId==='firebolt'));
 assert.equal(saved.workshop.nextUid,8002);assert.deepEqual(saved.character,c);
});
test('warm inventory edits reuse admitted passive context without traversing its graph again',()=>{
 let admissions=0;
 class CountedPolicy extends PassivePolicy {create(input){admissions++;return super.create(input);}}
 const host=setup({character:{...characterDefinitions,passives:new CountedPolicy(policy.pack)}});ok(open(host));assert.equal(admissions,1);
 ok(lock(host));ok(lock(host,false));ok(lock(host,false));assert.equal(admissions,1);
 const saved=workshopSave(host);send(host,{op:'close-workshop',profile:1});send(host,{op:'restore-workshop',profile:1,account:1,save:saved});
 assert.equal(admissions,2);
});
test('all 78 frozen original class source records survive cold save restore and attribute recomputation',()=>{
 const passives=new PassivePolicy(characterPacks.passives),grants=new PassiveGrants(characterPacks.grants);
 const defs={contentId:'original-source-context',passives,attributes:characterPacks.grants.attributes.map(a=>a.id),
 containers:characterPacks.containers.containers.map(({id,accepts,accountStorage})=>({id,accepts,...(accountStorage===undefined?{}:{accountStorage})}))};
 assert.equal(originalBuilds.length,78);
 for(const row of originalBuilds){
  const host=setup({character:defs}),c={schemaVersion:1,capability:'workshop-character/v1',contentId:defs.contentId,level:1,
   baseAttrs:row.base,passives:{classId:row.classId,allocated:row.allocated,choices:row.choices,grafts:{},vocations:[],passivePoints:0,vocationPoints:0,realmPoints:{}},containers:{}};
  ok(open(host,c));const saved=workshopSave(host);send(host,{op:'close-workshop',profile:1});send(host,{op:'restore-workshop',account:1,profile:1,save:saved});
  const restored=workshopSave(host).character;assert.deepEqual(restored,c,row.label);
  const fold=grants.begin(restored.baseAttrs,new Set(restored.passives.allocated),restored.passives.choices);
  assert.deepEqual(fold.attributes(),row.attributes,row.label);
 }
});
