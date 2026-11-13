import assert from 'node:assert/strict';
import {RunCharacterSession} from 'candidate/run-character-session';
import {CompleteAccountWorkshopSession} from '../../dist/account-workshop-complete.js';
import {CraftingSession} from '../../dist/crafting-session.js';
import {createCharacterBuilds} from '../../adapters/embedded/character-builds.mjs';
import {ItemContent} from '../../dist/item-rules.js';import {CraftingContent} from '../../dist/crafting-content.js';
import {SkillProgression} from '../../dist/skill-progression.js';import {PassivePolicy} from '../../dist/passive-policy.js';
import {EquipmentSlots} from '../../dist/equipment-actions.js';import {CharacterProgression} from '../../dist/character-progression.js';
import data from 'candidate/data';
const copy=x=>JSON.parse(JSON.stringify(x)),pack=data.builds,policy=new PassivePolicy(data.passives),rules=new CharacterProgression(data.experience);
const items=new ItemContent(pack.items),workshop={crafting:new CraftingContent(data.crafting,items),skills:new SkillProgression(pack.progression),memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}};
const character={workshop,equipment:new EquipmentSlots(data.equipment),builds:createCharacterBuilds(pack),catalogue:pack.definitions,trigger:()=>{throw Error('Unexpected trigger query');},relicPowerPerRank:pack.containers.custody.progression.powerPerRank,
 character:{contentId:'run-prototype-character',passives:policy,attributes:pack.passives.attributes.map(r=>r.id),containers:pack.containers.containers.map(({id,accepts,accountStorage})=>({id,accepts,...(accountStorage===undefined?{}:{accountStorage})}))}};
const account={...character,progression:data.account},classDef=pack.definitions.classes.find(r=>r.id==='warrior');
const start=policy.pack.classes.find(r=>r.id==='warrior').startNode,node=policy.pack.nodes.find(r=>(!r.realm||r.realm==='tree')&&r.id!==start&&!r.choice&&!r.vocation&&policy.adjacent(policy.index(r.id),new Set([start])));assert(node);
const command=(profile,op)=>({kind:'command',command:{op:'workshop',profile,command:{op:'character-passive',command:op}}});
const award=(amount,profile=1)=>({kind:'award',profile,amount}),ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r;};
let cases=0;
function setup(level=1,xpNeeded=rules.experienceForLevel(level),ports={}){
 const traces=[];let observation={eligible:true,blessing:0,relicSuppressed:false,local:true,accountOwned:true};
 const owner=new RunCharacterSession({account,character,experience:rules},{conditions:()=>({refundRefusal:null,openAllRealms:false}),experience:r=>ports.experience?ports.experience(r,observation):observation,trace:r=>traces.push(r)});
 ok(owner.command({op:'open-account',account:1,key:'account-a',seed:17}));
 for(const profile of [1,2])ok(owner.command({op:'open-workshop',profile,account:1,seed:51+profile,nextUid:1,state:{board:{w:16,h:16},items:[],equipped:{},overflow:[],essences:{},skillBook:{known:[],bar:Array(8).fill(null)}},character:{schemaVersion:2,capability:'workshop-character/progression-diagnostic',contentId:character.character.contentId,level,baseAttrs:copy(classDef.attributes),passives:{classId:'warrior',allocated:[start],choices:{},grafts:{},vocations:[],passivePoints:0,vocationPoints:0,realmPoints:{}},containers:{},abilityEssences:{}}}));
 owner.attach({schemaVersion:1,capability:'run-progression/diagnostic',key:'run-a',ledger:{},characters:[1,2].map(n=>({key:'character-'+n,accountKey:'account-a',xp:0,xpNeeded}))},[1,2].map(n=>({profile:n,key:'character-'+n})));
 const saves=()=>[1,2].map(profile=>ok(owner.command({op:'workshop-save',profile}))),all=()=>({run:owner.read(),saves:saves(),account:ok(owner.command({op:'account-save',account:1}))});
 return{owner,traces,saves,all,observe:v=>{observation=v;}};
}
{
 const f=setup(),before=f.all(),buildCalls=f.traces.length,p=ok(f.owner.prepareTrusted([award(7)]));assert(p.token);assert.equal(p.writes.length,0,'ordinary XP must not serialize a character save');
 assert.equal(f.traces.length,buildCalls,'ordinary XP must not enter character rebuild/kernel');assert.deepEqual(f.all(),before,'preparation published run XP');
 const pending=f.owner.prepared(p.token);assert.equal(pending.state.characters[0].xp,7);assert.equal(pending.journal[0].character.transitions.length,0);assert.equal(pending.state.ledger,before.run.ledger);
 assert.equal(pending.state.characters[1],before.run.characters[1],'unchanged run characters should share immutable rows');
 assert(Object.isFrozen(pending.state.characters[0]));assert.equal(Reflect.set(pending.state.characters[0],'xp',999),false);
 ok(f.owner.command({op:'abort-prepared',token:p.token}));assert.deepEqual(f.all(),before,'abort advanced run XP');
 const again=ok(f.owner.prepareTrusted([award(7)]));ok(f.owner.command({op:'commit-prepared',token:again.token}));assert.equal(f.owner.read().characters[0].xp,7);assert.deepEqual(f.saves(),before.saves);cases++;
}
{
 const f=setup(),before=f.all(),p=ok(f.owner.prepareTrusted([award(rules.experienceForLevel(1)),command(1,{op:'allocate',nodeId:node.id}),award(rules.experienceForLevel(2))]));
 const rows=f.owner.prepared(p.token).journal;assert.equal(rows.length,3);const currency=rules.pack.tuning.passivePointsPerLevel;
 assert.equal(rows[0].experience.after.level,2);assert.equal(rows[0].experience.after.passivePoints,currency);
 assert.equal(rows[1].character.reply.reply.accepted,true,'earned passive point was unavailable within batch');
 assert.equal(rows[2].experience.before.passivePoints,currency-policy.pack.pickCost,'XP planning ignored preceding passive spend');
 assert.equal(rows[2].experience.after.level,3);assert.equal(rows[2].experience.after.passivePoints,2*currency-policy.pack.pickCost);
 assert.equal(rows[0].after,rows[1].before);assert.equal(rows[1].after,rows[2].before);assert.equal(rows[0].character.transitions.length,1);
 const middle=f.owner.build(rows[1].character.transitions.at(-1).after);assert(middle.character.passives.allocated.includes(node.id));
 assert.deepEqual(f.all(),before);ok(f.owner.command({op:'commit-prepared',token:p.token}));const saved=f.saves()[0].save.character;
 assert.equal(saved.level,3);assert.equal(saved.passives.passivePoints,2*currency-policy.pack.pickCost);assert(saved.passives.allocated.includes(node.id));assert.equal(f.owner.read().characters[0].xp,0);assert.deepEqual(f.saves()[1],before.saves[1]);cases++;
}
{
 const f=setup(),before=f.all(),amount=[1,2,3,4].reduce((sum,l)=>sum+rules.experienceForLevel(l),0),p=ok(f.owner.prepareTrusted([award(amount),award(3,2)]));
 const pending=f.owner.prepared(p.token),steps=pending.journal[0].character.transitions;
 assert.equal(steps.length,4,'multi-level XP must keep every intermediate build');assert.deepEqual(steps.map(s=>f.owner.build(s.after).character.level),[2,3,4,5]);
 assert.equal(pending.state.ledger.reached_level_5,1);assert.equal(pending.journal[1].experience.ledgerBefore,pending.state.ledger,'next award did not observe staged milestone');
 assert.equal(before.run.ledger.reached_level_5,undefined);assert.equal(pending.journal[0].character.accounts.length,0,'run milestone leaked into permanent account');
 assert.equal(ok(f.owner.command({op:'account-save',account:1})).save.progression.account.ledger.reached_level_5,undefined);
 ok(f.owner.command({op:'abort-prepared',token:p.token}));assert.deepEqual(f.all(),before);cases++;
}
{
 const f=setup(),before=f.all();assert.throws(()=>f.owner.prepareTrusted([award(45),command(1,{op:'allocate',nodeId:node.id,ledger:{forged:1}})]),/unknown-field/);
 assert.deepEqual(f.all(),before,'late failure published earlier run or investment');const p=ok(f.owner.prepareTrusted([award(45)]));ok(f.owner.command({op:'commit-prepared',token:p.token}));assert.equal(f.saves()[0].save.character.level,2);cases++;
}
{
 const f=setup(),before=f.all();for(const op of [{op:'run-experience',profile:1,grant:1},{op:'workshop',profile:1,command:{op:'character-experience-levels',grant:1}}]){
  assert.equal(f.owner.command(op).ok,false);assert.equal(f.owner.command({op:'prepare',commands:[op]}).ok,false);
  assert.throws(()=>f.owner.prepareTrusted([award(45),{kind:'command',command:op}]),/unowned-experience/);
 }
 assert.deepEqual(f.all(),before);assert.throws(()=>f.owner.prepareTrusted([award(45,999)]),/character-not-in-run/);assert.deepEqual(f.all(),before);cases++;
}
{
 const f=setup(),before=f.all(),p=ok(f.owner.prepareTrusted([award(4)]));assert.throws(()=>f.owner.prepareTrusted([award(5)]),/prepared-change-pending/);
 assert.equal(f.owner.command({op:'commit-prepared',token:p.token+1}).ok,false);assert.deepEqual(f.all(),before);assert.equal(f.owner.prepared(p.token).state.characters[0].xp,4);
 ok(f.owner.command({op:'abort-prepared',token:p.token}));assert.equal(f.owner.command({op:'commit-prepared',token:p.token}).ok,false);cases++;
}
{
 const f=setup(1,19),p=ok(f.owner.prepareTrusted([award(19)]));assert.equal(f.owner.prepared(p.token).journal[0].experience.after.level,2,'stored threshold was silently recomputed');ok(f.owner.command({op:'commit-prepared',token:p.token}));cases++;
}
{
 let owner,attempts=0;const f=setup(1,45,{experience(_r,o){assert.throws(()=>owner.prepareTrusted([award(99)]),/reentrant-run-command/);assert.equal(owner.command({op:'workshop-save',profile:1}).ok,false);attempts++;return o;}});owner=f.owner;
 const p=ok(owner.prepareTrusted([award(3)]));assert.equal(attempts,1);ok(owner.command({op:'abort-prepared',token:p.token}));cases++;
}
{
 const f=setup(),before=f.all();f.observe({eligible:false,blessing:0,relicSuppressed:false,local:true,accountOwned:true});const p=ok(f.owner.prepareTrusted([award(100)]));assert.equal(p.token,0);assert.deepEqual(f.all(),before);
 f.observe({eligible:true,blessing:.5,relicSuppressed:false,local:true,accountOwned:true});const q=ok(f.owner.prepareTrusted([award(1),award(1)]));assert.equal(f.owner.prepared(q.token).state.characters[0].xp,4,'per-award rounding was merged');ok(f.owner.command({op:'abort-prepared',token:q.token}));cases++;
}
// A retained trusted step capability must expire before asynchronous reuse.
{
 const f=setup(),before=f.all(),a=before.account.save.progression.account;
 const update={kind:'command',command:{op:'account',account:1,command:{op:'observe',level:a.level,credits:a.credits+1,ledger:copy(a.ledger),roster:copy(a.roster)}}};
 const mixed=ok(f.owner.prepareTrusted([update,award(7)]));assert.equal(f.owner.prepared(mixed.token).state.characters[0].xp,7);assert.deepEqual(f.all(),before);ok(f.owner.command({op:'abort-prepared',token:mixed.token}));
 const p=ok(f.owner.prepareTrusted([update]));ok(f.owner.command({op:'abort-prepared',token:p.token}));assert.deepEqual(f.all(),before);cases++;
}
{
 const crafting=new CraftingSession(workshop,1);let retained;
 const kernel={character:{admit:v=>v,checkInventory(){},uidFloor(){return 1;}},execute(previous,open,command,scope){ok(crafting.command({...open,profile:0}));const save=ok(crafting.command({op:'save',profile:0})).save;ok(crafting.command({op:'close',profile:0}));return{reply:null,save,continuation:{},character:scope.characterInput};}};
 const owner=new CompleteAccountWorkshopSession({...account,completeKernel:kernel,preparedStep:(_c,scope)=>{retained=scope;return{ok:true,reply:{events:[{kind:'test'}]}};}});
 const pending=ok(owner.command({op:'prepare',commands:[{op:'run-experience'}]}));assert.throws(()=>retained.read(1),/expired-prepared-step/,'prepared step read outlived transaction');assert.throws(()=>retained.execute({op:'account',account:1,command:{op:'catalogue'}}),/expired-prepared-step/,'prepared step writer outlived transaction');ok(owner.command({op:'abort-prepared',token:pending.token}));cases++;
}
console.log({passed:true,cases,realCharacterBuilder:true,realAccountOwner:true,originalWorldPublication:false,durableRunStore:false});
