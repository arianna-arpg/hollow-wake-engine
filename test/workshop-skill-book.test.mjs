import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {CraftingSession} from '../dist/crafting-session.js';
import {WorkshopRack} from '../dist/workshop-rack.js';
import {WorkshopSkillBook} from '@hollow-wake/engine/skills/workshop-book';
import {AccountWorkshopSession} from '../dist/account-workshop-session.js';
import {definitions} from './shared-account/fixtures.mjs';
const defs=definitions.workshop,items=defs.crafting.items;
const sample=JSON.parse(fs.readFileSync(new URL('../examples/godot-inventory/cargo-sample.json',import.meta.url)));
const fire=sample.find(row=>row.gem?.kind==='skill');
const copy=value=>structuredClone(value);
const plain=value=>JSON.parse(JSON.stringify(value));
const row=(id='firebolt')=>({gem:{kind:'skill',skillId:id,level:1,rarity:'common',sockets:[null]}});
const state=()=>({board:{w:3,h:2},items:copy(sample),equipped:{},overflow:[],essences:{},
  account:{craftLore:{},ledger:{},features:[],progression:true}});
function fixture(s=state(),provider=new WorkshopSkillBook(items)){
 const host=new CraftingSession(defs,2,provider),cmd=(op,args={})=>plain(host.command({op,profile:1,...args}));
 assert.deepEqual(cmd('open',{state:s,seed:17}),{ok:true});return{host,cmd,save:()=>cmd('save').save};
}
const learn=(f,args={})=>f.cmd('learn-skill',{uid:fire.uid,meets:true,blocked:{},...args});

test('legacy saves keep their version until explicit book promotion, preserving every payload and binding',()=>{
 const f=fixture();const first=f.save();assert.equal(first.schemaVersion,1);
 assert(learn(f,{slot:5}).result.changed);const legacy=f.save();assert.equal(legacy.schemaVersion,2);
 assert.equal(f.cmd('bind-skill',{slot:2,skillId:'firebolt'}).reason,'skill-book-required');assert.deepEqual(f.save(),legacy);
 const promoted=f.cmd('promote-skill-book');assert.equal(promoted.ok,true,JSON.stringify(promoted));assert(promoted.result.changed);
 const next=f.save();assert.equal(next.schemaVersion,4);assert.equal(next.capability,'crafting-session/v4');
 assert(!Object.hasOwn(next.state,'rack'));assert.deepEqual(next.state.skillBook,{known:[legacy.state.rack[5]],bar:[null,null,null,null,null,'firebolt',null,null]});
 assert.deepEqual(next.random,legacy.random);assert.equal(next.nextUid,legacy.nextUid);assert.deepEqual(next.state.items,legacy.state.items);
 assert.deepEqual(f.cmd('promote-skill-book').result,{changed:false,needsSave:false});assert.deepEqual(f.save(),next);
 const old=new CraftingSession(defs,1,new WorkshopRack());assert.equal(old.command({op:'restore',profile:0,save:next}).reason,'skill-book-unavailable');
 assert(old.command({op:'restore',profile:0,save:legacy}).ok);
 f.cmd('close');assert(f.cmd('restore',{save:next}).ok);assert.deepEqual(f.save(),next);
});

test('binding, toggling and swapping retain off-bar investment, exact blanks and the learned insertion order',()=>{
 const s=state();s.skillBook={known:[{gem:copy(fire.gem),locked:true},row('fireball')],bar:Array(8).fill(null)};const f=fixture(s),before=f.save();
 const bound=f.cmd('bind-skill',{slot:4,skillId:'firebolt'});assert.deepEqual(bound.result,{accepted:true,changed:true,needsSave:true});
 assert.deepEqual(bound.events,[{kind:'remember-skill-slot',skillId:'firebolt',slot:4},{kind:'bar-rebound',skillIds:['firebolt']}]);
 assert(f.cmd('bind-skill',{slot:2,skillId:'fireball'}).result.changed);
 assert(f.cmd('swap-skill-slots',{a:2,b:4}).result.changed);assert.deepEqual(f.save().state.skillBook.bar,[null,null,'firebolt',null,'fireball',null,null,null]);
 assert(f.cmd('bind-skill',{slot:2,skillId:'firebolt'}).result.changed);assert.equal(f.save().state.skillBook.bar[2],null);
 const saved=f.save();assert.deepEqual(saved.state.skillBook.known,before.state.skillBook.known);assert.deepEqual(saved.random,before.random);assert.equal(saved.nextUid,before.nextUid);
 f.cmd('close');assert(f.cmd('restore',{save:saved}).ok);assert.deepEqual(f.save(),saved);
 const empty=f.cmd('swap-skill-slots',{a:0,b:7});assert.deepEqual(empty.result,{accepted:true,changed:false,needsSave:false});assert.deepEqual(empty.events,[]);
 const unknown=f.cmd('bind-skill',{slot:0,skillId:'missing'});assert.deepEqual(unknown.result,{accepted:false,changed:false,needsSave:false});assert.deepEqual(unknown.events,[]);
 assert.deepEqual(f.save(),saved);
 for(const args of [{slot:-1,skillId:'firebolt'},{slot:.5,skillId:null},{slot:8,skillId:null},{slot:0,skillId:9}])assert.equal(f.cmd('bind-skill',args).ok,false);
 assert.deepEqual(f.save(),saved);
});

test('a new gem replaces an off-bar copy and a seated other skill through the existing custody policy',()=>{
 const s=state();s.skillBook={known:[row('firebolt'),row('fireball')],bar:[null,'fireball',...Array(6).fill(null)]};
 const f=fixture(s),before=f.save();assert(learn(f,{slot:1}).result.changed);const after=f.save();
 assert.deepEqual(after.state.skillBook.known,[{gem:fire.gem,...(fire.locked?{locked:true}:{})}]);
 assert.deepEqual(after.state.skillBook.bar,[null,'firebolt',...Array(6).fill(null)]);
 assert.deepEqual(after.state.items.slice(-2).map(item=>item.gem.skillId),['fireball','firebolt']);assert.equal(after.nextUid,before.nextUid+2);
 assert.deepEqual(after.random,before.random);
});

test('unlearning an off-bar skill returns its locked investment and does not fill a bar vacancy on resume',()=>{
 const s=state();s.items=[];s.skillBook={known:[{gem:copy(fire.gem),locked:true}],bar:Array(8).fill(null)};
 const f=fixture(s),before=f.save();assert(f.cmd('unlearn-skill',{skillId:'firebolt',blocked:{}}).result.changed);const after=f.save();
 assert.deepEqual(after.state.skillBook,{known:[],bar:Array(8).fill(null)});assert.deepEqual(after.state.items[0].gem,fire.gem);assert.equal(after.state.items[0].locked,true);
 assert.equal(after.state.items[0].uid,before.nextUid);assert.equal(after.nextUid,before.nextUid+1);assert.deepEqual(after.random,before.random);
});

test('support custody addresses an off-bar learned skill and survives a complete save/reopen',()=>{
 const s=state(),support=s.items.find(item=>item.gem?.kind==='support');
 s.skillBook={known:[row()],bar:Array(8).fill(null)};support.locked=true;
 const f=fixture(s),before=f.save();const args={skillId:'firebolt',uid:support.uid,hold:null,fits:true};
 assert(f.cmd('socket-support',args).result.changed);const loaded=f.save(),socket=loaded.state.skillBook.known[0].gem.sockets[0];
 assert.deepEqual(socket,{supportId:support.gem.supportId,level:support.gem.level,locked:true,...(support.gem.rolled?{rolled:support.gem.rolled}:{})});
 assert.deepEqual(loaded.state.skillBook.bar,Array(8).fill(null));f.cmd('close');assert(f.cmd('restore',{save:loaded}).ok);
 assert(f.cmd('unsocket-support',{skillId:'firebolt',index:0,supportId:socket.supportId,hold:null}).result.changed);
 const finish=f.save();assert.equal(finish.state.skillBook.known[0].gem.sockets[0],null);assert.equal(finish.state.items.at(-1).locked,true);
 assert.equal(finish.nextUid,before.nextUid+1);assert.deepEqual(finish.random,before.random);
});

test('strict book admission rejects duplicate authorities, unresolved references and malformed payloads without occupying a profile',()=>{
 const s=state();s.skillBook={known:[row()],bar:['firebolt',...Array(7).fill(null)]};const good=fixture(s).save();
 for(const corrupt of [s=>s.state.rack=Array(8).fill(null),s=>s.state.skillBook.known.push(row()),s=>s.state.skillBook.known.push(null),
  s=>s.state.skillBook.bar[1]='firebolt',s=>s.state.skillBook.bar[1]='missing',s=>s.state.skillBook.bar.pop(),s=>s.state.skillBook.extra=1,
  s=>s.state.skillBook.known[0].locked=false,s=>s.state.skillBook.known[0].gem.skillId='missing',s=>s.schemaVersion=3,s=>s.capability='crafting-session/v3']){
  const bad=copy(good);corrupt(bad);const host=new CraftingSession(defs,1,new WorkshopSkillBook(items));
  assert.equal(host.command({op:'restore',profile:0,save:bad}).ok,false);
  assert(host.command({op:'restore',profile:0,save:good}).ok);
  assert.deepEqual(plain(host.command({op:'save',profile:0})).save,good);
 }
});

test('promoting a vestige save preserves the wallet and keeps vestige commands available',()=>{
 const s=state();s.vestiges={};const f=fixture(s);assert.equal(f.save().schemaVersion,3);const id=Object.keys(items.pack.vestiges)[0];assert(id);
 assert(f.cmd('grant-vestige',{id,count:2}).result.changed);const before=f.save();
 assert(f.cmd('promote-skill-book').result.changed);assert.deepEqual(f.save().state.vestiges,before.state.vestiges);
 assert(f.cmd('grant-vestige',{id,count:1}).result.changed);assert.equal(f.save().state.vestiges[id],3);
});

test('a retained provider draft cannot alter committed book rows or bindings',()=>{
 let held;class Observed extends WorkshopSkillBook {move(request,state,...ports){held=state;return super.move(request,state,...ports);}}
 const s=state();s.skillBook={known:[row()],bar:Array(8).fill(null)};const f=fixture(s,new Observed(items));
 assert(f.cmd('bind-skill',{slot:1,skillId:'firebolt'}).result.changed);const before=f.save();
 held.skillBook.known[0].gem.level=2;held.skillBook.bar[1]=null;assert.deepEqual(f.save(),before);
});

test('two workshops prepare independent books, abort without publication and reject stale tokens',()=>{
 const host=new AccountWorkshopSession({...definitions,rack:new WorkshopSkillBook(items)});
 const send=request=>{const result=host.command(request);assert.equal(result.ok,true,JSON.stringify(result));return plain(result);};
 send({op:'open-account',account:1,key:'book-owner',seed:7});
 const s=state();delete s.account;s.skillBook={known:[row()],bar:Array(8).fill(null)};
 for(const profile of [1,2])send({op:'open-workshop',profile,account:1,seed:profile,state:s});
 const saved=profile=>send({op:'workshop-save',profile}),before=[saved(1),saved(2)],account=send({op:'account-save',account:1});
 const commands=[1,2].map(profile=>({op:'workshop',profile,command:{op:'bind-skill',slot:profile,skillId:'firebolt'}}));
 const first=send({op:'prepare',commands});assert.deepEqual(first.writes,[{kind:'workshop',handle:1},{kind:'workshop',handle:2}]);
 const candidate=send({op:'prepared-save',token:first.token,kind:'workshop',handle:1});
 assert.deepEqual([saved(1),saved(2)],before);assert.deepEqual(send({op:'account-save',account:1}),account);
 send({op:'abort-prepared',token:first.token});assert.deepEqual([saved(1),saved(2)],before);
 const next=send({op:'prepare',commands});assert(next.token>first.token);
 assert.equal(host.command({op:'commit-prepared',token:first.token}).reason,'stale-prepared-change');
 assert.deepEqual(send({op:'prepared-save',token:next.token,kind:'workshop',handle:1}),candidate);
 send({op:'commit-prepared',token:next.token});assert.equal(saved(1).save.workshop.state.skillBook.bar[1],'firebolt');assert.equal(saved(2).save.workshop.state.skillBook.bar[2],'firebolt');
 assert.deepEqual(send({op:'account-save',account:1}),account);
});

test('off-bar entries count toward learned capacity and a full bag retains the original refusal and UID semantics',()=>{
 const s=state(),ids=defs.skills.pack.skills.map(skill=>skill.id).filter(id=>id!=='firebolt').slice(0,8);
 assert.equal(ids.length,8);s.skillBook={known:ids.map(id=>row(id)),bar:Array(8).fill(null)};
 const f=fixture(s),before=f.save(),full=learn(f);
 assert.equal(full.result.changed,false);assert.equal(full.result.refusal,'every seat is taken');assert.deepEqual(f.save(),before);
 const bad=copy(before);bad.state.skillBook.known.push(row());
 assert.equal(new CraftingSession(defs,1,new WorkshopSkillBook(items)).command({op:'restore',profile:0,save:bad}).ok,false);
 const blocked=state();blocked.board={w:1,h:1};blocked.items=[{...copy(fire),x:0,y:0}];
 blocked.skillBook={known:[row()],bar:Array(8).fill(null)};
 const g=fixture(blocked),prior=g.save(),reply=g.cmd('unlearn-skill',{skillId:'firebolt',blocked:{}}),after=g.save();
 assert.equal(reply.result.changed,false);assert.equal(reply.result.refusal,'no room in the bag');assert.equal(reply.result.needsSave,true);
 assert.equal(after.nextUid,prior.nextUid+1);prior.nextUid++;assert.deepEqual(after,prior);
});

test('provider failure after a book change leaves the whole committed profile untouched',()=>{
 class Fault extends WorkshopSkillBook {move(...args){super.move(...args);throw Error('after book mutation');}}
 const s=state();s.skillBook={known:[row()],bar:Array(8).fill(null)};const f=fixture(s,new Fault(items)),before=f.save();
 assert.throws(()=>f.cmd('bind-skill',{slot:1,skillId:'firebolt'}),/after book mutation/);assert.deepEqual(f.save(),before);
});
