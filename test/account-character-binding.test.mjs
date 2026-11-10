import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountWorkshopSession} from '../dist/account-workshop-session.js';
import {AccountRelicItems} from '../dist/account-relic-items.js';
import {WorkshopBuildPreparation} from '../dist/workshop-build-preparation.js';
import {PassivePolicy} from '../dist/passive-policy.js';
import {baseline,definitions} from './shared-account/fixtures.mjs';
import {send,accountSave,workshopSave,splitAccount,access} from './shared-account/contracts.mjs';
import {originalRelics} from './account-relic-items-fixture.mjs';

const copy=structuredClone,scenario=baseline.scenarios[0],data=new AccountRelicItems(definitions.workshop);
const policy=new PassivePolicy({schemaVersion:1,capability:'passive-policy/v1',contentId:'binding-policy',defaultPick:1,pickCost:1,requireVocationGate:false,
 nodes:[{id:'root',name:'Root'}],adjacency:{root:[]},groups:[],realms:[{id:'tree'}],classes:[{id:'mage',startNode:'root'}],vocations:[]});
const character={contentId:'binding-character',passives:policy,attributes:['strength'],
 containers:[{id:'case',accepts:{categories:['helmet']}},{id:'reliquary',accountStorage:true,accepts:{categories:['relic']}}]};
const context=()=>({schemaVersion:1,capability:'workshop-character/v1',contentId:'binding-character',level:14,baseAttrs:{strength:9},
 passives:{classId:'mage',allocated:['root'],choices:{},grafts:{},vocations:[],passivePoints:0,vocationPoints:0,realmPoints:{}},containers:{case:[],reliquary:[]}});
const tick=state=>state.items[0].grantState?.firebolt?.sockets[0]?.rolled.tick??'0';
const read=host=>send(host,{op:'account-relic-items',account:1}).state;
const active=host=>send(host,{op:'active-workshop',account:1}).profile;
const select=(profile)=>({op:'activate-workshop',account:1,profile});
const lock=(profile,on=true)=>({op:'workshop',profile,command:{op:'lock',uid:1001,on,access}});
const accountCommand=state=>({op:'account',account:1,command:{op:'relic-items',state}});
const ok=reply=>{assert.equal(reply.ok,true,JSON.stringify(reply));return reply;};

// Diagnostic investment counters exercise ownership; these authored relics
// grant companions, not Firebolt. This is not authored ordinary-grant parity.
function fixture(options={}){
 const control={write:false,fail:0,duplicate:false,stale:false,foreign:false,invalid:false,missing:false,unknownField:false,localCollision:false,redirectCommand:false,reenter:null};
 const trace=[];
 const services={initialize:()=>({turn:0}),fork:source=>({turn:source.turn+1}),derive:(candidate,input)=>{
  trace.push({profile:input.profile,phase:input.phase,role:input.relics?.role,turn:candidate.turn,
   tick:tick(data.decode(input.account.progression.account.reliquary)),candidate,input});
  if(control.reenter)control.reenter();
  if(control.fail===input.profile)throw Error('late build failure');
  const writes=[];
  if((control.write&&input.relics?.role==='active')||control.foreign){
   const state=input.relics?.role==='active'?input.relics.state:data.decode(input.account.progression.account.reliquary),item=state.items[0];
   writes.push({uid:item.uid,relicKey:item.relicKey,grantState:{firebolt:{sockets:[{supportId:'arcing',level:1,rolled:{tick:String(Number(tick(state))+1)}}]}}});
   if(control.stale)writes[0].uid++;
   if(control.invalid)writes[0].grantState.firebolt.sockets[0].level=9999;
   if(control.missing)delete writes[0].grantState;
   if(control.unknownField)writes[0].locked=true;
   if(control.duplicate)writes.push(copy(writes[0]));
  }
  // Detached inputs cannot grant authority or publish unrelated body changes.
  input.account.progression.account.reliquary.items[0].payload.name='private edit';
  if(input.relics?.role==='active')input.relics.state.items[0].name='private projection';
  return {items:[],relics:writes};
 }};
 const preparation=new WorkshopBuildPreparation(services);
 const port={prepare:(previous,input)=>{
  if(control.redirectCommand&&input.command){input.command.account=99;input.command.profile=99;input.command.op='redirected';}
  const result=preparation.prepare(previous,input);
  if(control.localCollision&&input.relics?.role==='active')result.state.items[0].uid=input.relics.state.items[0].uid;
  return result;
 }};
 const host=new AccountWorkshopSession({...definitions,relicItems:options.codec??data,character,preparation:port,relicBuilds:true});
 const state=copy(originalRelics[0].account);state.items.forEach((item,i)=>item.uid=20000+i);
 const account=splitAccount(scenario.initial.account);account.state.reliquary=data.encode(state);
 send(host,{op:'open-account',account:1,key:'binding',seed:scenario.accountSeed,...account,relicItems:true});
 const open=(profile,edit=()=>{})=>{
  const c=context(),s=copy(scenario.initial.inventory);edit(c,s);
  return host.command({op:'open-workshop',profile,account:1,seed:scenario.workshopSeed,state:s,character:c});
 };
 if(!options.empty){ok(open(1));ok(open(2));}
 return {host,trace,control,open,services,preparation};
}

test('authority is explicit, per account, ephemeral and absent from durable saves',()=>{
 const f=fixture();assert.equal(active(f.host),null);assert(f.trace.every(row=>row.role==='inactive'));
 send(f.host,select(2));assert.equal(active(f.host),2);assert.equal(f.trace.at(-2).profile,2);assert.equal(f.trace.at(-2).role,'active');
 assert.equal(f.trace.at(-1).profile,1);assert.equal(f.trace.at(-1).role,'inactive');
 const a=accountSave(f.host),one=workshopSave(f.host),two=workshopSave(f.host,2);
 assert(!Object.hasOwn(a,'active'));assert.equal(two.character.containers.reliquary.length,0);
 assert(!two.workshop.state.items.some(i=>i.relicKey));assert.equal(two.workshop.nextUid,20000+read(f.host).items.length);
 const restored=new AccountWorkshopSession({...definitions,relicItems:data,character,preparation:f.preparation,relicBuilds:true});
 send(restored,{op:'restore-account',account:1,save:a});send(restored,{op:'restore-workshop',account:1,profile:1,save:one});
 send(restored,{op:'restore-workshop',account:1,profile:2,save:two});assert.equal(active(restored),null);
});

test('activation normalizes canonical investment before siblings and preserves every unrelated field',()=>{
 const f=fixture(),before=read(f.host);f.control.write=true;send(f.host,select(2));
 const after=read(f.host);assert.equal(tick(after),'1');delete after.items[0].grantState;assert.deepEqual(after,before);
 assert.deepEqual(f.trace.slice(-2).map(r=>[r.profile,r.tick,r.role]),[[2,'0','active'],[1,'1','inactive']]);
 assert.equal(f.trace.at(-2).input.relics.state.items[0].name,'private projection');assert.deepEqual(read(f.host).items[0].name,before.items[0].name);
 const count=f.trace.length;assert.equal(send(f.host,select(2)).changed,false);assert.equal(f.trace.length,count);
});

test('ordinary active inventory changes write account and character once and refresh siblings against final bodies',()=>{
 const f=fixture();send(f.host,select(2));f.control.write=true;
 const beforeA=send(f.host,{op:'account-save',account:1}),beforeW=send(f.host,{op:'workshop-save',profile:2});
 const result=send(f.host,lock(2));assert.equal(result.accountVersion,beforeA.version+1);assert.equal(result.version,beforeW.version+1);
 assert.equal(tick(read(f.host)),'1');assert.equal(workshopSave(f.host,2).workshop.state.items[0].locked,true);
 assert.deepEqual(f.trace.slice(-2).map(r=>[r.profile,r.tick]),[[2,'0'],[1,'1']]);
 const count=f.trace.length;send(f.host,lock(2));assert.equal(f.trace.length,count);
 send(f.host,lock(1));assert.equal(tick(read(f.host)),'1');assert.equal(f.trace.at(-1).profile,1);
});

test('shared account changes derive the selected character first even when it was attached last',()=>{
 const f=fixture();send(f.host,select(2));f.control.write=true;
 const state=read(f.host),before=send(f.host,{op:'account-save',account:1}).version;state.enabled=false;
 const reply=send(f.host,accountCommand(state));assert.equal(reply.version,before+1);assert.equal(tick(read(f.host)),'1');
 assert.equal(read(f.host).enabled,false);assert.deepEqual(f.trace.slice(-2).map(r=>[r.profile,r.tick]),[[2,'0'],[1,'1']]);
});

test('switching authority and canonical writeback rolls back completely on a late sibling failure',()=>{
 const f=fixture();send(f.host,select(1));const a=accountSave(f.host),one=workshopSave(f.host),two=workshopSave(f.host,2);
 f.control.write=true;f.control.fail=1;assert.throws(()=>f.host.command(select(2)),/late build failure/);
 assert.equal(active(f.host),1);assert.deepEqual(accountSave(f.host),a);assert.deepEqual(workshopSave(f.host),one);assert.deepEqual(workshopSave(f.host,2),two);
 f.control.fail=0;send(f.host,select(2));assert.equal(tick(read(f.host)),'1');
 assert.equal(f.trace.at(-2).turn,2,'failed continuation was not promoted');
});

test('prepared activation keeps committed reads and promotes or discards authority with canonical writes',()=>{
 const f=fixture();f.control.write=true;const before=accountSave(f.host);
 const prepare=()=>send(f.host,{op:'prepare',commands:[select(2),lock(2)]});
 let p=prepare();assert.equal(active(f.host),null);assert.deepEqual(accountSave(f.host),before);
 const staged=send(f.host,{op:'prepared-save',token:p.token,kind:'account',handle:1}).save;
 assert.equal(tick(data.decode(staged.progression.account.reliquary)),'2');
 send(f.host,{op:'abort-prepared',token:p.token});assert.equal(active(f.host),null);assert.deepEqual(accountSave(f.host),before);
 p=prepare();send(f.host,{op:'commit-prepared',token:p.token});assert.equal(active(f.host),2);assert.deepEqual(accountSave(f.host),staged);
});

test('graph-only activation has a commit token and explicit deactivation is required before closing',()=>{
 const f=fixture(),before=accountSave(f.host);const p=send(f.host,{op:'prepare',commands:[select(1)]});assert(p.token>0);
 send(f.host,{op:'commit-prepared',token:p.token});assert.deepEqual(accountSave(f.host),before);
 assert.equal(f.host.command({op:'close-workshop',profile:1}).reason,'active-workshop-in-use');
 send(f.host,select(null));assert.equal(active(f.host),null);assert(f.trace.slice(-2).every(row=>row.role==='inactive'));
 send(f.host,{op:'close-workshop',profile:1});
});

test('strict selection refuses collisions in bag, equipment, overflow and all personal containers without discarding items',()=>{
 for(const location of ['bag','equipment','overflow','container']){
  const f=fixture({empty:true});ok(f.open(1,(c,s)=>{
   if(location==='bag')s.items[0].uid=20000;
   else {const item=copy(s.items[0]);item.uid=20000;delete item.x;delete item.y;
    if(location==='equipment')s.equipped.helmet=item;else if(location==='overflow')s.overflow.push(item);
    else{item.x=100;item.y=100;c.containers.case.push(item);}}
  }));const a=accountSave(f.host),w=workshopSave(f.host);
  assert.equal(f.host.command(select(1)).reason,'relic-address-collision',location);assert.equal(active(f.host),null);
  assert.deepEqual(accountSave(f.host),a);assert.deepEqual(workshopSave(f.host),w);
 }
});

test('canonical address changes refuse conflicts atomically and reserve safe future local identities',()=>{
 const f=fixture();send(f.host,select(1));const before=accountSave(f.host),w=workshopSave(f.host);
 let state=read(f.host);state.items[0].uid=1001;assert.equal(f.host.command(accountCommand(state)).reason,'relic-address-collision');
 assert.deepEqual(accountSave(f.host),before);assert.deepEqual(workshopSave(f.host),w);
 state=read(f.host);state.items[0].uid=0xffffffff;send(f.host,accountCommand(state));assert.equal(workshopSave(f.host).workshop.nextUid,0x100000000);
});

test('malformed, stale, duplicate and unauthorized writes preserve authority and both saved owners',()=>{
 for(const flag of ['duplicate','stale','invalid','missing','unknownField','foreign','localCollision']){
  const f=fixture();send(f.host,select(1));const a=accountSave(f.host),one=workshopSave(f.host),two=workshopSave(f.host,2);
  f.control.write=true;f.control[flag]=true;const result=f.host.command(lock(flag==='foreign'?2:1));assert.equal(result.ok,false,flag);
  assert.equal(active(f.host),1);assert.deepEqual(accountSave(f.host),a);assert.deepEqual(workshopSave(f.host),one);assert.deepEqual(workshopSave(f.host,2),two);
 }
});

test('null write removes only the canonical investment and bypassing the helper still requires active authority',()=>{
 const f=fixture();send(f.host,select(1));f.control.write=true;send(f.host,lock(1));f.control.write=false;
 f.services.derive=(_candidate,input)=>({items:[],relics:input.relics?.role==='active'?[{uid:input.relics.state.items[0].uid,relicKey:input.relics.state.items[0].relicKey,grantState:null}]:[]});
 send(f.host,lock(1,false));assert.equal(tick(read(f.host)),'0');assert(!Object.hasOwn(read(f.host).items[0],'grantState'));
 const g=fixture();const previous=g.services.derive;g.preparation.prepare=(p,input)=>({state:input.state,continuation:{},relicWrites:[{uid:20000,relicKey:'foreign',grantState:null}]});
 assert.equal(g.host.command(lock(1)).reason,'inactive-relic-write');g.services.derive=previous;
});

test('reentry is refused and authority cannot be selected from an unrelated account or missing character',()=>{
 const f=fixture();f.control.reenter=()=>assert.equal(f.host.command(select(1)).reason,'reentrant-command');send(f.host,select(2));f.control.reenter=null;
 send(f.host,{op:'open-account',account:2,key:'other',seed:1,relicItems:true});
 assert.equal(f.host.command({op:'activate-workshop',account:2,profile:1}).reason,'account-mismatch');
 send(f.host,{op:'open-workshop',account:1,profile:3,seed:1,state:copy(scenario.initial.inventory)});
 assert.equal(f.host.command(select(3)).reason,'character-context-required');assert.equal(active(f.host),2);
 assert.throws(()=>new AccountWorkshopSession({...definitions,relicBuilds:true}),/relic-build-services-required/);
 assert.equal(new AccountWorkshopSession(definitions).command(select(1)).reason,'relic-builds-unavailable');
});

test('failed later commands discard prepared selection, account writes and continuation advances',()=>{
 const f=fixture();f.control.write=true;const a=accountSave(f.host),w=workshopSave(f.host,2);
 assert.equal(f.host.command({op:'prepare',commands:[select(2),{op:'workshop',profile:2,command:{op:'retired'}}]}).ok,false);
 assert.equal(active(f.host),null);assert.deepEqual(accountSave(f.host),a);assert.deepEqual(workshopSave(f.host,2),w);
 send(f.host,select(2));assert.equal(tick(read(f.host)),'1');assert.equal(f.trace.at(-2).turn,1);
});

test('ordinary active edits reuse admitted account bodies and preserve local safe-integer addresses',()=>{
 let admissions=0;class Counted extends AccountRelicItems{decode(state){admissions++;return super.decode(state);}}
 const f=fixture({codec:new Counted(definitions.workshop),empty:true});
 ok(f.open(1,(c,s)=>{const item=copy(s.items[0]);item.uid=0x100000010;item.x=100;item.y=100;c.containers.case.push(item);}));
 send(f.host,select(1));const count=admissions;
 send(f.host,lock(1));send(f.host,lock(1,false));assert.equal(admissions,count,'unchanged canonical bodies are not readmitted');
 assert.equal(workshopSave(f.host).workshop.nextUid,0x100000011);
});

test('multiple accounts retain independent selection and canonical writes',()=>{
 const f=fixture();send(f.host,select(2));const other=splitAccount(scenario.initial.account);other.state.reliquary=data.encode(read(f.host));
 send(f.host,{op:'open-account',account:2,key:'second',seed:5,...other,relicItems:true});
 send(f.host,{op:'open-workshop',account:2,profile:3,seed:6,state:copy(scenario.initial.inventory),character:context()});
 f.control.write=true;send(f.host,{op:'activate-workshop',account:2,profile:3});
 assert.equal(active(f.host),2);assert.equal(send(f.host,{op:'active-workshop',account:2}).profile,3);
 assert.equal(tick(read(f.host)),'0');assert.equal(tick(send(f.host,{op:'account-relic-items',account:2}).state),'1');
});

test('inactive inventory account changes normalize the active build before the initiating sibling',()=>{
 const f=fixture();send(f.host,select(2));f.control.write=true;
 const action={op:'workshop',profile:1,command:{op:'salvage',uid:1002,lane:'break',access}};
 const before=[accountSave(f.host),workshopSave(f.host),workshopSave(f.host,2)];
 f.control.fail=1;assert.throws(()=>f.host.command(action),/late build failure/);
 assert.deepEqual([accountSave(f.host),workshopSave(f.host),workshopSave(f.host,2)],before);
 f.control.fail=0;send(f.host,action);assert.equal(tick(read(f.host)),'1');
 assert.deepEqual(f.trace.slice(-2).map(r=>[r.profile,r.phase,r.tick]),[[2,'account','0'],[1,'command','1']]);
 assert(!workshopSave(f.host).workshop.state.items.some(i=>i.uid===1002));
});

test('custom build ports receive command snapshots and cannot redirect selection or sibling phases',()=>{
 const f=fixture();f.control.redirectCommand=true;const before=accountSave(f.host);
 const result=send(f.host,select(2));assert.equal(result.profile,2);assert.equal(active(f.host),2);
 assert.equal(f.host.command({op:'account-save',account:99}).reason,'account-not-open');
 assert.deepEqual(f.trace.slice(-2).map(r=>r.phase),['activation','activation']);assert.deepEqual(accountSave(f.host),before);
 send(f.host,lock(2));assert.equal(workshopSave(f.host,2).workshop.state.items[0].locked,true);assert.equal(active(f.host),2);
});
