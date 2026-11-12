import test from 'node:test';
import assert from 'node:assert/strict';
import {definitions,baseline} from './shared-account/fixtures.mjs';
import {CraftingSessionData} from '../dist/crafting-session-data.js';
import {CharacterResidenceData} from '../dist/character-residence-data.js';
import {CraftingSession} from '../dist/crafting-session.js';
import {WorkshopSkillBook} from '../dist/workshop-skill-book.js';
import {WorkshopCharacterData} from '../dist/workshop-character.js';
import {CompleteWorkshopCharacterData} from '../dist/workshop-character-complete.js';
import {ProgressionCharacterData} from '../dist/workshop-character-progression.js';
import {CharacterInventoryCommands} from '../dist/character-inventory-commands.js';
import {createCharacterDeliveryCodec} from '../dist/character-delivery-codec.js';
import {PassivePolicy} from '../dist/passive-policy.js';
import {Random} from '../dist/random.js';

const copy=structuredClone,plain=value=>JSON.parse(JSON.stringify(value));
const retainedGem=()=>({kind:'skill',skillId:'firebolt',level:1,rarity:'common',sockets:[],treeNodes:['flame_studies']});
const item=()=>({uid:1,baseId:'skill_gem',ilvl:1,tier:1,name:'Retained firebolt',rarity:'common',baseRoll:0,implicitRolls:[],affixes:[],gem:retainedGem()});
const account=()=>({craftLore:{},ledger:{},features:[],progression:true});
const state=()=>({board:{w:8,h:8},items:[],equipped:{},overflow:[],essences:{},account:account(),skillBook:{known:[],bar:Array(8).fill(null)}});
const policy=new PassivePolicy({schemaVersion:1,capability:'passive-policy/v1',contentId:'complete-test-policy',defaultPick:1,pickCost:1,requireVocationGate:false,
 nodes:[{id:'root',name:'Root'},{id:'graft',name:'Graft',graft:{support:'arcing'}}],adjacency:{root:['graft'],graft:['root']},
 groups:[],realms:[{id:'tree'}],classes:[{id:'mage',startNode:'root'}],vocations:[]});
const characterDefinitions={contentId:'complete-test-character',passives:policy,attributes:['strength'],containers:[]};
const character=()=>({schemaVersion:1,capability:'workshop-character/v1',contentId:'complete-test-character',level:14,baseAttrs:{strength:9.25},
 passives:{classId:'mage',allocated:['root','graft'],choices:{},grafts:{graft:'firebolt'},vocations:[],passivePoints:0,vocationPoints:0,realmPoints:{}},containers:{}});

test('retained investment uses the shared structural checks while cold budgets remain strict',()=>{
 const data=new CraftingSessionData(definitions.workshop),gem=retainedGem();
 assert.equal(definitions.workshop.skills.tree('firebolt').restore(gem.treeNodes,1,gem),undefined);
 assert.throws(()=>data.skillPayload(gem),/invalid-skill-tree/);data.retainedSkillPayload(gem);
 for(const edit of [g=>g.treeNodes=['missing'],g=>g.treeNodes=['flame_studies','missing'],g=>g.sockets=[{supportId:'missing',level:1}],g=>g.level=0]){
  const invalid=copy(gem);edit(invalid);assert.throws(()=>data.retainedSkillPayload(invalid));assert.throws(()=>data.skillPayload(invalid));
 }
 assert.deepEqual(gem,retainedGem());
});

test('the internal residence codec does not weaken the public v4 save boundary',()=>{
 const strict=new CraftingSessionData(definitions.workshop),retained=new CharacterResidenceData(definitions.workshop),body=item();
 assert.throws(()=>strict.item(body),/invalid-skill-tree/);assert.equal(retained.item(body),body);
 for(const location of ['bag','book']){
  const saved=state();if(location==='bag')saved.items=[{...body,x:0,y:0}];else saved.skillBook.known=[{gem:body.gem}];
  const legacy=new CraftingSession(definitions.workshop,1,new WorkshopSkillBook(definitions.workshop.crafting.items));
  assert.equal(legacy.command({op:'open',profile:0,seed:7,state:saved}).ok,false,location);
  assert.equal(legacy.command({op:'save',profile:0}).reason,'not-open');
 }
});

test('retained grafts require authored identities and retain shared custody rejection',()=>{
 const strict=new WorkshopCharacterData(characterDefinitions,definitions.workshop);
 const retained=new CompleteWorkshopCharacterData(characterDefinitions,definitions.workshop);
 const source=character(),inventory=state();
 assert.throws(()=>strict.admit(source,inventory),/unknown-graft-carrier/);
 assert.deepEqual(plain(retained.admit(source,inventory)),source);
 const unknown=character();unknown.passives.grafts.graft='missing';assert.throws(()=>retained.admit(unknown,inventory),/unknown-graft-carrier/);
 for(const codec of [strict,retained]){
  const context=character();context.passives.grafts.graft=null;
  const duplicate=state();duplicate.items=[item(),item()];assert.throws(()=>codec.checkInventory(context,duplicate),/duplicate-character-uid/);
  const foreign=state();foreign.items=[{...item(),relicKey:'account-owned'}];assert.throws(()=>codec.checkInventory(context,foreign),/account-item-in-character/);
 }
});

test('inventory preparation is detached, closes its carrier, and retains account RNG authority',()=>{
 const carrier=new CharacterInventoryCommands(definitions),draft=copy(baseline.scenarios[0].initial.inventory);
 delete draft.rack;draft.skillBook={known:[],bar:Array(8).fill(null)};
 const saved={state:draft,nextUid:100000},scope={account:account()},random=new Random(123).snapshot();
 const before=copy({saved,scope,random}),request={op:'lock',uid:draft.items[0].uid,on:true,access:{salvage:true,oracle:true,bench:true,counter:true}};
 const changed=carrier.execute(saved,scope,request,random);assert(changed.reply.ok);assert(changed.save.state.items[0].locked);
 assert.equal(changed.save.capability,'crafting-session/complete-diagnostic');assert.deepEqual(plain(changed.save.random),random);
 assert.equal(changed.save.nextUid,saved.nextUid);assert.deepEqual({saved,scope,random},before);
 const absent=carrier.execute(saved,scope,{...request,uid:999999},random);assert(absent.reply.ok);assert.deepEqual(plain(absent.save.state.items),draft.items);
 const refused=carrier.execute(saved,scope,{...request,on:'invalid'},random);assert.equal(refused.reply.ok,false);assert.equal(refused.save,undefined);
 assert.deepEqual(carrier.execute(saved,scope,request,random),changed);
 const legacy=new CraftingSession(definitions.workshop,1,new WorkshopSkillBook(definitions.workshop.crafting.items));
 assert.equal(legacy.command({op:'restore',profile:0,save:changed.save}).ok,false);
});

test('inventory requests cannot supply profile authority or invoke prototype and skill routes',()=>{
 const carrier=new CharacterInventoryCommands(definitions),{account:shared,...inventory}=state();
 const saved={state:inventory,nextUid:1},scope={account:shared},random=new Random(2).snapshot();
 assert.throws(()=>carrier.execute(saved,scope,{op:'lock',profile:1},random),/implicit-profile-command/);
 for(const op of ['__proto__','constructor','bind-skill','learn-skill','prepare'])assert.throws(()=>carrier.execute(saved,scope,{op},random),/complete-skill-route-required/);
 assert.throws(()=>carrier.execute(saved,scope,null,random),/invalid-object/);
});

test('bare-gem delivery admission preserves detached investment without minting a wrapper',()=>{
 const admit=createCharacterDeliveryCodec(definitions.workshop),drop={kind:'skill',gem:retainedGem(),locked:true};
 const result=admit(drop);assert.deepEqual(plain(result),drop);assert(!Object.hasOwn(result,'uid'));
 drop.gem.treeNodes.length=0;assert.deepEqual(result.gem.treeNodes,['flame_studies']);
 const support={kind:'support',gem:{kind:'support',supportId:definitions.workshop.skills.pack.supports[0].id,level:1},locked:false};
 assert.deepEqual(plain(admit(support)),support);
 for(const edit of [d=>d.gem.supportId='missing',d=>d.gem.level=0,d=>d.kind='skill',d=>d.locked=1,d=>d.uid=9]){
  const invalid=copy(support);edit(invalid);assert.throws(()=>admit(invalid));
 }
});

test('ability currency is admitted separately and cannot select a weaker legacy format',()=>{
 const complete=new CompleteWorkshopCharacterData(characterDefinitions,definitions.workshop);
 const codec=new ProgressionCharacterData(complete,definitions.workshop.skills),id=definitions.workshop.skills.pack.services.essences[0].id;
 const source={...character(),schemaVersion:2,capability:'workshop-character/progression-diagnostic',abilityEssences:{[id]:1.25}};
 const admitted=codec.admit(source,state());assert.deepEqual(plain(admitted),source);source.abilityEssences[id]=77;assert.equal(admitted.abilityEssences[id],1.25);
 assert.throws(()=>complete.admit(source,state()),/unknown-field/);
 for(const wallet of [{missing:1},{[id]:-1},{[id]:Infinity}])assert.throws(()=>codec.admit({...source,abilityEssences:wallet},state()));
});
