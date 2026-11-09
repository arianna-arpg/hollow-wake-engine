import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountWorkshopSession} from '../dist/account-workshop-session.js';
import {WorkshopBuildPreparation} from '../dist/workshop-build-preparation.js';
import {EquipmentSkillDraft} from '../dist/equipment-skill-draft.js';
import {EquipmentSkills} from '../dist/equipment-skills.js';
import {baseline,definitions} from './shared-account/fixtures.mjs';
import {openCourse,send,workshopSave,accountSave,access} from './shared-account/contracts.mjs';

const copy=structuredClone;
const inventory=(command,profile=1)=>({op:'workshop',profile,command});
const lock=(on,profile=1)=>inventory({op:'lock',uid:1001,on,access},profile);
const saved=(host,profile=1)=>workshopSave(host,profile).workshop;
const investment=(save,uid=1001)=>[...save.state.items,...Object.values(save.state.equipped),...save.state.overflow]
 .find(item=>item.uid===uid)?.grantState?.firebolt;
const tick=save=>investment(save)?.sockets[0]?.rolled.tick;
const prepared=(host,pending,profile=1)=>send(host,{op:'prepared-save',token:pending.token,kind:'workshop',handle:profile}).save.workshop;

// A diagnostic build service, not a claim about authored helmet grants. The
// existing EquipmentSkills and EquipmentSkillDraft own actual graph derivation
// and copying; a rolled counter exposes continuity across the save coordinator.
function fixture(){
 const def={id:'firebolt',name:'Firebolt'},support={id:'arcing'};
 const trace=[],control={fail:false,invalid:false,unknown:false,duplicate:false,reenter:null};
 const frame=()=>({seat:{},actor:{skills:Array(8).fill(null),sheet:{get:()=>0},activeAuras:new Map(),summonToggles:new Map()},
  meta:{knownSkills:new Map(),equipped:{},classDef:{innate:[]},grafts:{}},passiveMods:[],gearSheetMods:new Map(),
  containerSheetMods:new Map(),containerPieceMods:new Map(),passiveGrafts:()=>[],
  deriveCompanions:()=>{},deactivateAura:()=>assert.fail('live aura'),dismissSummon:()=>assert.fail('live summon')});
 let restores=0;
 const pack=inst=>({sockets:inst.sockets.map(row=>row?{supportId:row.def.id,level:row.level,rolled:copy(row.rolled)}:null)});
 const runtime=new EquipmentSkills({skillGrantPrefix:'grant_',companionGrantPrefix:'crew_',slotGraftPrefix:'slot_',
  equipSlots:()=>[{id:'helmet'}],skill:id=>id===def.id?def:undefined,support:id=>id===support.id?support:undefined,
  parseSkillGrant:id=>id.slice(6),companionGrantStat:id=>'crew_'+id,parseSlotGraft:()=>null,
  skillMaxLevel:()=>20,maxSupportLevel:20,grantSockets:()=>1,autoSeat:()=>true,
  makeSkill:(def,level)=>({def,level,sockets:[{def:support,level:1,rolled:{tick:'1'}}]}),
  restoreGrant:(inst,state)=>{restores++;inst.sockets=state.sockets.map(row=>row?{def:support,level:row.level,rolled:copy(row.rolled)}:null);},
  packGrant:pack,classes:()=>[],openingSkills:()=>[],classSkillStat:()=>'',treeGraft:()=>undefined,supportFits:()=>true});
 const services={
  initialize:input=>{trace.push({kind:'initialize',phase:input.phase,profile:input.profile});return {frame:frame()};},
  fork:(source,input)=>{
   trace.push({kind:'fork',source,profile:input.profile,phase:input.phase});
   return new EquipmentSkillDraft(source.frame,{copySkill:copy,copyItem:copy,copyToggle:()=>assert.fail('no toggles'),
    sheet:{get:()=>0},deriveCompanions:(_frame,defs)=>assert.equal(defs.length,0),retire:()=>assert.fail('no retirements')});
  },
  derive:(candidate,input)=>{
   const f=candidate.frame;
   for(const inst of f.seat.grantedInsts?.values()??[])inst.sockets[0].rolled.tick=String(Number(inst.sockets[0].rolled.tick)+1);
   f.meta.equipped=input.state.equipped;
   f.gearSheetMods=new Map(Object.keys(f.meta.equipped).map(slot=>[slot,[{stat:'grant_firebolt'}]]));
   f.actor.sheet={get:id=>id==='grant_firebolt'?4:0};runtime.derive(f);
   trace.push({kind:'derived',candidate,profile:input.profile,phase:input.phase});
   // These attempted unrelated edits must not escape through input ownership.
   input.state.essences.coarse=0;input.state.account.features.push('not-authorized');
   input.account.progression.account.credits=0;
   if(control.reenter)control.reenter();
   if(control.fail)throw Error('private build failure');
   const writes=Object.values(f.meta.equipped).map(item=>({uid:item.uid,grantState:copy(item.grantState??{})}));
   if(control.invalid&&writes.length)writes[0].grantState.firebolt.sockets[0].level=9999;
   if(control.unknown)writes.push({uid:900000,grantState:{}});
   if(control.duplicate&&writes.length)writes.push(copy(writes[0]));
   return writes;
  },
 };
 const preparation=new WorkshopBuildPreparation(services),host=new AccountWorkshopSession({...definitions,preparation});
 const scenario=copy(baseline.scenarios[0]),state=scenario.initial.inventory;
 const helm=state.items.shift();delete helm.x;delete helm.y;state.equipped.helmet=helm;
 const replacement=copy(helm);replacement.uid=1004;replacement.x=0;replacement.y=0;
 replacement.grantState={firebolt:{sockets:[{supportId:'arcing',level:1,rolled:{tick:'80'}}]}};state.items.push(replacement);
 openCourse(host,scenario);
 return {host,services,preparation,trace,control,scenario,restores:()=>restores};
}

test('private equipment derivation reaches canonical saves without a command-time cold reload',()=>{
 const f=fixture(),first=saved(f.host),account=accountSave(f.host);
 assert.equal(tick(first),'1');assert.equal(first.state.essences.coarse,100);assert.equal(f.restores(),0);
 const old=f.trace.find(row=>row.kind==='derived').candidate.frame.seat.grantedInsts.get('firebolt');
 const cast={inst:old,elapsed:0.75,paid:9,draws:3};
 send(f.host,lock(true));assert.equal(tick(saved(f.host)),'2');send(f.host,lock(false));assert.equal(tick(saved(f.host)),'3');
 assert.equal(f.trace.filter(row=>row.kind==='initialize').length,1);assert.equal(f.restores(),0);
 assert.equal(old.sockets[0].rolled.tick,'1');assert.deepEqual(cast,{inst:old,elapsed:0.75,paid:9,draws:3});
 assert.deepEqual(accountSave(f.host),account);assert.deepEqual(saved(f.host).random,first.random);assert.equal(saved(f.host).nextUid,first.nextUid);
 const count=f.trace.length;send(f.host,lock(false));assert.equal(f.trace.length,count,'no-op does not rederive a build');
});

test('batched preparation chains private graphs, exports normalized saves and aborts without consuming continuity',()=>{
 const f=fixture(),before=saved(f.host);
 const first=send(f.host,{op:'prepare',commands:[lock(true),lock(false)]});
 assert.equal(tick(prepared(f.host,first)),'3');assert.deepEqual(saved(f.host),before);
 send(f.host,{op:'abort-prepared',token:first.token});assert.deepEqual(saved(f.host),before);
 const second=send(f.host,{op:'prepare',commands:[lock(true)]});assert(second.token>first.token);assert.equal(tick(prepared(f.host,second)),'2');
 assert.equal(f.host.command({op:'commit-prepared',token:first.token}).reason,'stale-prepared-change');
 send(f.host,{op:'commit-prepared',token:second.token});assert.equal(tick(saved(f.host)),'2');
 send(f.host,lock(false));assert.equal(tick(saved(f.host)),'3');
});

test('host replacement restores its own investment and persists it before publication',()=>{
 const f=fixture(),before=saved(f.host),held=f.trace.find(row=>row.kind==='derived').candidate.frame.actor.skills[0];
 const pending=send(f.host,{op:'prepare',commands:[inventory({op:'equip',uid:1004,actorLevel:100,slot:'helmet'})]});
 const next=prepared(f.host,pending);assert.equal(next.state.equipped.helmet.uid,1004);assert.equal(investment(next,1004).sockets[0].rolled.tick,'80');
 assert.equal(f.restores(),1);assert.equal(held.grantedHostUid,1001);assert.equal(held.sockets[0].rolled.tick,'1');assert.deepEqual(saved(f.host),before);
 send(f.host,{op:'commit-prepared',token:pending.token});assert.deepEqual(saved(f.host),next);
});

test('private callback, output admission and late-batch failures preserve saved and graph continuations',()=>{
 for(const flag of ['fail','invalid','unknown','duplicate']){
  const f=fixture(),before=saved(f.host);f.control[flag]=true;
  if(flag==='fail')assert.throws(()=>f.host.command({op:'prepare',commands:[lock(true)]}),/private build failure/);
  else assert.equal(f.host.command({op:'prepare',commands:[lock(true)]}).ok,false,flag);
  assert.deepEqual(saved(f.host),before);f.control[flag]=false;send(f.host,lock(true));assert.equal(tick(saved(f.host)),'2');
 }
 const f=fixture(),before=saved(f.host);assert.equal(f.host.command({op:'prepare',commands:[lock(true),inventory({op:'bogus'})]}).ok,false);
 assert.deepEqual(saved(f.host),before);send(f.host,lock(true));assert.equal(tick(saved(f.host)),'2');
});

test('account changes refresh attached builds atomically and a failing sibling rolls the account back',()=>{
 const f=fixture();send(f.host,{op:'open-workshop',profile:2,account:1,seed:9,state:f.scenario.initial.inventory});
 const first=saved(f.host),second=saved(f.host,2),account=accountSave(f.host);
 const {owner,...observed}=baseline.rows.find(row=>row.scenario==='shared-authority'&&row.name==='observe-deed').command;
 const buy={op:'account',account:1,command:{...observed,credits:account.progression.account.credits,roster:account.progression.account.roster}};
 const derive=f.services.derive;f.services.derive=(build,input)=>{const result=derive(build,input);if(input.phase==='account'&&input.profile===2)throw Error('sibling refused');return result;};
 assert.throws(()=>f.host.command({op:'prepare',commands:[buy]}),/sibling refused/);
 assert.deepEqual(accountSave(f.host),account);assert.deepEqual(saved(f.host),first);assert.deepEqual(saved(f.host,2),second);
 f.services.derive=derive;const pending=send(f.host,{op:'prepare',commands:[buy]});
 assert.deepEqual(pending.writes,[{kind:'account',handle:1},{kind:'workshop',handle:1},{kind:'workshop',handle:2}]);
 assert.equal(tick(prepared(f.host,pending)),'2');assert.equal(tick(prepared(f.host,pending,2)),'2');
 send(f.host,{op:'commit-prepared',token:pending.token});assert.equal(tick(saved(f.host)),'2');assert.equal(tick(saved(f.host,2)),'2');
});

test('cold restore initializes once, retired handles cannot inherit graphs and callbacks cannot reenter the owner',()=>{
 const f=fixture();send(f.host,lock(true));const save=workshopSave(f.host);
 send(f.host,{op:'close-workshop',profile:1});send(f.host,{op:'restore-workshop',profile:1,account:1,save});
 assert.equal(f.trace.filter(row=>row.kind==='initialize'&&row.phase==='restore').length,1);assert.equal(f.restores(),1);
 assert.equal(tick(saved(f.host)),'2');f.control.reenter=()=>assert.equal(f.host.command(lock(false)).reason,'reentrant-command');
 send(f.host,lock(false));assert.equal(tick(saved(f.host)),'3');
});

test('detached save reads and writeback arrays cannot change a committed candidate',()=>{
 const f=fixture(),derive=f.services.derive;let retained;
 f.services.derive=(build,input)=>{retained=derive(build,input);return retained;};
 const pending=send(f.host,{op:'prepare',commands:[lock(true)]}),good=prepared(f.host,pending);
 retained[0].grantState.firebolt.sockets[0].rolled.tick='999';const detached=prepared(f.host,pending);detached.state.equipped.helmet.grantState.firebolt.sockets=[];
 assert.deepEqual(prepared(f.host,pending),good);send(f.host,{op:'commit-prepared',token:pending.token});assert.deepEqual(saved(f.host),good);
});

test('workshop account changes normalize sibling saves and fail as one transaction',()=>{
 const f=fixture();send(f.host,{op:'open-workshop',profile:2,account:1,seed:9,state:f.scenario.initial.inventory});
 const before=[accountSave(f.host),saved(f.host),saved(f.host,2)],derive=f.services.derive;
 const action=inventory({op:'salvage',uid:1002,lane:'break',access});
 f.services.derive=(candidate,input)=>{const writes=derive(candidate,input);if(input.phase==='account')throw Error('sibling failed');return writes;};
 assert.throws(()=>f.host.command(action),/sibling failed/);assert.deepEqual([accountSave(f.host),saved(f.host),saved(f.host,2)],before);
 f.services.derive=derive;const pending=send(f.host,{op:'prepare',commands:[action]});
 assert.deepEqual(pending.writes,[{kind:'account',handle:1},{kind:'workshop',handle:1},{kind:'workshop',handle:2}]);
 assert.equal(tick(prepared(f.host,pending)),'2');assert.equal(tick(prepared(f.host,pending,2)),'2');
 send(f.host,{op:'commit-prepared',token:pending.token});assert.equal(tick(saved(f.host)),'2');assert.equal(tick(saved(f.host,2)),'2');
});

test('complete account context refreshes private continuations even when no inventory bytes change',()=>{
 const f=fixture(),before=saved(f.host),derive=f.services.derive;
 f.services.derive=(candidate,input)=>{derive(candidate,input);return [];};
 const pending=send(f.host,{op:'prepare',commands:[{op:'account',account:1,command:{op:'buy',id:'memory_discovery'}}]});
 assert(pending.replies[0].changed);assert.deepEqual(pending.writes,[{kind:'account',handle:1},{kind:'workshop',handle:1}]);
 assert.deepEqual(prepared(f.host,pending),before);send(f.host,{op:'commit-prepared',token:pending.token});
 f.services.derive=derive;send(f.host,lock(true));assert.equal(tick(saved(f.host)),'3','graph-only account rebuild survives commit');
});

test('a fork returning its source refuses before derivation and cannot consume the committed continuation',()=>{
 const f=fixture(),before=saved(f.host),fork=f.services.fork;
 f.services.fork=source=>source;assert.equal(f.host.command(lock(true)).reason,'invalid-build-candidate');assert.deepEqual(saved(f.host),before);
 f.services.fork=fork;send(f.host,lock(true));assert.equal(tick(saved(f.host)),'2');
});
