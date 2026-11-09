import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountRelicItems} from '../dist/account-relic-items.js';
import {AccountWorkshopSession} from '../dist/account-workshop-session.js';
import {WorkshopBuildPreparation} from '../dist/workshop-build-preparation.js';
import {RelicCustody} from '../dist/relic-custody.js';
import {baseline,definitions} from './shared-account/fixtures.mjs';
import {send,workshopSave,accountSave,splitAccount,access} from './shared-account/contracts.mjs';
import {originalRelics} from './account-relic-items-fixture.mjs';
const copy=structuredClone,plain=value=>JSON.parse(JSON.stringify(value));
const scenario=baseline.scenarios[0],data=new AccountRelicItems(definitions.workshop);
const initial=()=>copy(originalRelics[0].account),inventory=()=>copy(scenario.initial.inventory);
function owner(extra={}){return new AccountWorkshopSession({...definitions,relicItems:data,...extra});}
function open(host,state=initial(),enabled=true){
 const input=splitAccount(scenario.initial.account);input.state.reliquary=data.encode(state);
 return host.command({op:'open-account',account:1,key:'relics',seed:scenario.accountSeed,...input,...(enabled?{relicItems:true}:{})});
}
const ok=reply=>{assert.equal(reply.ok,true,JSON.stringify(reply));return reply;};
const read=host=>send(host,{op:'account-relic-items',account:1}).state;
const write=(host,state)=>host.command({op:'account',account:1,command:{op:'relic-items',state}});
const openWorkshop=(host,profile=1,state=inventory())=>host.command({op:'open-workshop',profile,account:1,seed:scenario.workshopSeed,state});
const ports={isRelic:()=>true,footprint:item=>definitions.workshop.crafting.items.pack.bases[item.baseId],
 nextUid:()=>{throw Error('unexpected allocation');},bumpUidFloor:()=>{},cloneItems:copy,
 stash:()=>({...definitions.progression.unlocks.relicStash,accepts:()=>true}),bagBoard:()=>({w:10,h:8}),
 progression:()=>definitions.progression.unlocks.reliquaryConfig};

test('typed body conversion is detached, ordered and exact for all 27 frozen original checkpoints',()=>{
 assert.equal(originalRelics.length,27);const custody=new RelicCustody(ports);
 for(const row of originalRelics){
  const host=owner();ok(open(host,row.account));const saved=accountSave(host);
  assert.equal(saved.schemaVersion,2);assert.equal(saved.capability,'account-workshop-account/v2');
  assert.deepEqual(saved.relicItems,plain(data.content));assert.deepEqual(read(host),row.account,row.label);
  const restored=owner();send(restored,{op:'restore-account',account:1,save:saved});
  const state=read(restored),board=custody.board(state);
  assert.deepEqual(state,row.account,row.label);assert.deepEqual(accountSave(restored),saved);
  assert.deepEqual(board,row.accountBoard.map(item=>item.body),row.label);
  for(let i=0;i<board.length;i++)assert.equal(board[i],state.items[row.accountBoard[i].canonical]);
  saved.progression.account.reliquary.items[0].payload.name='detached save';state.items[0].name='detached view';
  assert.deepEqual(read(host),row.account);assert.deepEqual(read(restored),row.account);
 }
});

test('canonical body order controls board and stable keys cannot select duplicate bodies',()=>{
 const host=owner(),state=initial();state.seated.reverse();ok(open(host,state));const custody=new RelicCustody(ports);
 let view=read(host);assert.deepEqual(custody.board(view).map(i=>i.uid),state.items.map(i=>i.uid));
 const echo=copy(view.items[0]);echo.name='stale echo';assert.equal(custody.bank(view,echo,'stale'),view.items[0]);
 assert.notEqual(view.items[0].name,echo.name);view.items.reverse();ok(write(host,view));
 const restored=owner();send(restored,{op:'restore-account',account:1,save:accountSave(host)});
 assert.deepEqual(custody.board(read(restored)).map(i=>i.uid),view.items.map(i=>i.uid));
});

test('legacy opaque accounts keep byte-identical saves and behavior with the optional module configured',()=>{
 const enabled=owner(),disabled=owner({relicItems:undefined});ok(open(enabled,initial(),false));ok(open(disabled,initial(),false));
 assert.deepEqual(accountSave(enabled),accountSave(disabled));assert.equal(accountSave(enabled).schemaVersion,1);
 for(const host of [enabled,disabled]){
  assert.equal(host.command({op:'account-relic-items',account:1}).reason,'relic-items-not-enabled');
  assert.equal(write(host,initial()).reason,'relic-items-not-enabled');
  const state=accountSave(host).progression.account.reliquary;state.items[0].payload={arbitrary:'legacy host body'};
  send(host,{op:'account',account:1,command:{op:'relics',state}});
 }
 assert.deepEqual(accountSave(enabled),accountSave(disabled));
});

test('typed format requires explicit support and matching identities on open and restore',()=>{
 const host=owner();ok(open(host));const saved=accountSave(host);
 assert.equal(open(owner({relicItems:undefined})).reason,'relic-items-unavailable');
 assert.equal(owner({relicItems:undefined}).command({op:'restore-account',account:1,save:saved}).reason,'relic-items-unavailable');
 for(const edit of [s=>s.relicItems[0]='other',s=>s.schemaVersion=1,s=>s.capability='account-workshop-account/v1',s=>delete s.relicItems]){
  const next=owner(),value=copy(saved);edit(value);assert.equal(next.command({op:'restore-account',account:1,save:value}).ok,false);
  send(next,{op:'restore-account',account:1,save:saved});assert.deepEqual(accountSave(next),saved);
 }
 const other=new AccountRelicItems({...definitions.workshop,memoryKinds:{...definitions.workshop.memoryKinds,extra:'rough'}});
 assert.throws(()=>owner({relicItems:other}),/relic-content-mismatch/);
});

test('mismatched metadata and malformed payloads refuse before publishing and leave the handle reusable',()=>{
 const host=owner();ok(open(host));const saved=accountSave(host);
 const malformed=initial();malformed.items[0].uniqueRolls.pop();assert.throws(()=>data.encode(malformed));
 const nonRelic=initial();nonRelic.items[0]={...inventory().items[0],relicKey:'ordinary-gear'};assert.throws(()=>data.encode(nonRelic));
 const edits=[s=>s.items[0].uid+=1000,s=>s.items[0].relicKey+='wrong',s=>s.items[0].w++,s=>s.items[0].h++,
  s=>s.items[0].x++,s=>delete s.items[0].payload.x,s=>s.items[0].payload.baseId='retired',
  s=>s.items[0].payload.uniqueRolls.pop(),s=>s.items[0].payload.grantState={retired:{sockets:[]}},
  s=>s.items[0].payload.affixes.push({id:'retired',tier:1,rolls:[]}),s=>s.items[0].payload.cachedSheet={},
  s=>{const body=inventory().items[0];body.relicKey=s.items[0].relicKey;body.uid=s.items[0].uid;s.items[0].payload=body;},
  s=>{s.items[0].uid=0;s.items[0].payload.uid=0;}];
 for(const edit of edits){
  const state=copy(saved.progression.account.reliquary);edit(state);const before=copy(state);
  assert.throws(()=>data.decode(state));
  assert.equal(host.command({op:'account',account:1,command:{op:'relics',state}}).ok,false);assert.deepEqual(state,before);
  assert.deepEqual(accountSave(host),saved);
  const target=owner(),value=copy(saved);value.progression.account.reliquary=state;
  assert.equal(target.command({op:'restore-account',account:1,save:value}).ok,false);
  send(target,{op:'restore-account',account:1,save:saved});
 }
});

test('typed replacement composes strict custody and storage validation without silently repairing',()=>{
 const host=owner();ok(open(host));const before=accountSave(host);
 const edits=[s=>s.items.push(copy(s.items[0])),s=>s.seated.push('missing'),s=>s.carried.push(s.seated[0]),
  s=>s.released.push(s.items[0].relicKey),s=>s.stash.cells[s.items[0].relicKey]={page:0,x:0,y:0},
  s=>{s.seated=[];s.stash.cells={};},s=>s.rank=-1,s=>s.invested=-1,s=>s.enabled='false'];
 for(const edit of edits){const state=initial();edit(state);assert.equal(write(host,state).ok,false);assert.deepEqual(accountSave(host),before);}
 assert.throws(()=>data.encode({...initial(),items:Array(513).fill(initial().items[0])}));
 assert.throws(()=>data.encode({...initial(),extra:true}));
});

test('release commits tombstones and rejects stale resurrection or forgotten history',()=>{
 const host=owner();ok(open(host));const state=read(host),custody=new RelicCustody(ports),body=state.items[0];
 state.seated=state.seated.filter(key=>key!==body.relicKey);state.carried=[body.relicKey];body.x=0;body.y=0;ok(write(host,state));
 assert.equal(custody.loseCarried(state,[body],'local'),1);ok(write(host,state));const saved=accountSave(host);
 assert.equal(custody.bank(state,copy(body),'stale'),undefined);
 assert.equal(write(host,initial()).reason,'released-relic-forgotten');assert.deepEqual(accountSave(host),saved);
 const forgotten=read(host);forgotten.released=[];assert.equal(write(host,forgotten).reason,'released-relic-forgotten');
 const restored=owner();send(restored,{op:'restore-account',account:1,save:saved});
 assert.deepEqual(read(restored).released,[body.relicKey]);assert.equal(write(restored,initial()).reason,'released-relic-forgotten');
});

test('prepared typed changes expose detached candidates and commit or abort as one account revision',()=>{
 const host=owner();ok(open(host));const before=accountSave(host),state=read(host);state.enabled=false;state.items[0].locked=true;
 const prepare=()=>send(host,{op:'prepare',commands:[{op:'account',account:1,command:{op:'relic-items',state}}]});
 let pending=prepare();assert.deepEqual(pending.writes,[{kind:'account',handle:1}]);assert.deepEqual(accountSave(host),before);
 assert.equal(read(host).enabled,true);const staged=send(host,{op:'prepared-save',token:pending.token,kind:'account',handle:1}).save;
 assert.equal(staged.progression.account.reliquary.enabled,false);send(host,{op:'abort-prepared',token:pending.token});
 assert.deepEqual(accountSave(host),before);pending=prepare();send(host,{op:'commit-prepared',token:pending.token});
 assert.deepEqual(accountSave(host),staged);assert.equal(read(host).items[0].locked,true);
 assert.equal(write(host,read(host)).changed,false);
});

test('each sibling gets a private canonical view and a late build failure publishes neither account nor inventories',()=>{
 let fail=false;const calls=[];
 const host=owner({preparation:new WorkshopBuildPreparation({initialize:()=>({}),fork:()=>({}),derive:(_candidate,input)=>{
  const state=data.decode(input.account.progression.account.reliquary);calls.push([input.profile,state.enabled,state.items[0].name]);
  state.items[0].name='private edit';input.account.progression.account.reliquary.items[0].payload.name='private account';
  if(fail&&input.profile===2)throw Error('late sibling');return [];
 }})});
 ok(open(host));ok(openWorkshop(host));ok(openWorkshop(host,2));const before=accountSave(host),one=workshopSave(host),two=workshopSave(host,2);
 const state=read(host);state.enabled=false;fail=true;assert.throws(()=>write(host,state),/late sibling/);
 assert.deepEqual(accountSave(host),before);assert.deepEqual(workshopSave(host),one);assert.deepEqual(workshopSave(host,2),two);
 fail=false;ok(write(host,state));assert.deepEqual(calls.slice(-2),[[1,false,state.items[0].name],[2,false,state.items[0].name]]);
 assert.deepEqual(read(host),state);assert.deepEqual(workshopSave(host),one);assert.deepEqual(workshopSave(host,2),two);
});

test('typed accounts cannot publish keyed item copies in legacy character bags, equipment or overflow',()=>{
 for(const location of ['items','equipped','overflow']){
  const host=owner();ok(open(host));const state=inventory();
  if(location==='items')state.items[0].relicKey='account-key';
  else {const item=copy(state.items[0]);item.uid=8000;delete item.x;delete item.y;item.relicKey='account-key';
   if(location==='overflow')state.overflow.push(item);else state.equipped.helmet=item;}
  assert.equal(openWorkshop(host,1,state).reason,'account-item-in-character');ok(openWorkshop(host));
  const saved=workshopSave(host);send(host,{op:'close-workshop',profile:1});saved.workshop.state.items[0].relicKey='account-key';
  assert.equal(host.command({op:'restore-workshop',profile:1,account:1,save:saved}).reason,'account-item-in-character');
 }
});

test('ordinary inventory edits reuse admitted account items without invoking item admission',()=>{
 let admissions=0;
 class Counted extends AccountRelicItems {decode(state){admissions++;return super.decode(state);}}
 const host=owner({relicItems:new Counted(definitions.workshop)});ok(open(host));ok(openWorkshop(host));const count=admissions;
 send(host,{op:'workshop',profile:1,command:{op:'lock',uid:1001,on:true,access}});
 send(host,{op:'workshop',profile:1,command:{op:'lock',uid:1001,on:false,access}});
 assert.equal(admissions,count);const saved=accountSave(host);assert.equal(saved.schemaVersion,2);
});

test('bounded admission rejects oversized bodies without changing the caller or owner',()=>{
 const host=owner();ok(open(host));const before=accountSave(host),state=read(host);state.items[0].name='x'.repeat(300000);
 assert.equal(write(host,state).ok,false);assert.deepEqual(accountSave(host),before);
 const circular=initial();circular.items[0].loop=circular;assert.throws(()=>data.encode(circular));
 const value=initial();const body=value.items[0];data.encode(value);assert.equal(value.items[0],body);
});
