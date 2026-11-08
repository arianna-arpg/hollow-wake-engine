import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {pathToFileURL} from 'node:url';import {gunzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256} from '../scripts/reference-utils.mjs';import {encodeContentTable} from '../dist/content-table-compiler.js';
import {packs,baseline} from './shared-account/fixtures.mjs';import {splitAccount,access} from './shared-account/contracts.mjs';
import {preparedContracts} from './shared-account/prepared-contracts.mjs';
const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),aliases={};
for(const[key,value]of Object.entries(manifest.exports))if(key!== './package.json'){
 const file=typeof value==='string'?value:value.import;if(file?.endsWith('.js'))aliases['@hollow-wake/engine'+key.slice(1)]=path.join(root,file);
}
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});const parent=fs.realpathSync(path.join(root,'.artifacts'));
const work=fs.mkdtempSync(path.join(parent,'shared-entry-contract-'));let create,dispatch;
try{
 const built=await build({entryPoints:[path.join(root,'adapters/embedded/account-workshop-session.mjs')],bundle:true,format:'esm',
  platform:'neutral',target:'es2022',write:false,metafile:true,tsconfigRaw:{},alias:aliases});
 assert(Object.values(built.metafile.outputs).every(row=>!row.imports.length));
 const file=path.join(work,'entry.mjs');fs.writeFileSync(file,built.outputFiles[0].contents,{flag:'wx'});
 ({create,dispatch}=await import(pathToFileURL(file).href));
}finally{assert.equal(path.dirname(fs.realpathSync(work)),parent);fs.rmSync(work,{recursive:true});}
const fresh=()=>create(encodeContentTable(packs)),copy=value=>JSON.parse(JSON.stringify(value));
const ok=reply=>{assert(reply.ok,JSON.stringify(reply));return reply;};
const accountSave=(host,id=1)=>ok(dispatch(host,{op:'account-save-text',account:id}));
const workshopSave=(host,id=1)=>ok(dispatch(host,{op:'workshop-save-text',profile:id}));
function open(host,scenario=baseline.scenarios[0]){
 ok(dispatch(host,{op:'open-account-text',account:1,key:scenario.name,seed:scenario.accountSeed,text:JSON.stringify(splitAccount(scenario.initial.account))}));
 ok(dispatch(host,{op:'open-workshop-text',profile:1,account:1,seed:scenario.workshopSeed,progression:scenario.initial.progression,nextUid:0,text:JSON.stringify(scenario.initial.inventory)}));
 return host;
}
function envelope(request){
 const {op,account,profile,...rest}=request;
 if(op==='open-account'){const {key,seed,...body}=rest;return {op:'open-account-text',account,key,seed,text:JSON.stringify(body)};}
 if(op==='open-workshop')return {op:'open-workshop-text',account,profile,seed:rest.seed,progression:rest.progression??true,nextUid:rest.nextUid??0,text:JSON.stringify(rest.state)};
 if(op==='restore-account')return {op:'restore-account-text',account,text:JSON.stringify(rest.save)};
 if(op==='restore-workshop')return {op:'restore-workshop-text',account,profile,text:JSON.stringify(rest.save)};
 if(op==='account'||op==='workshop')return {op:op+'-command-text',...(op==='account'?{account}:{profile}),text:JSON.stringify(rest.command)};
 return request;
}
const capsule=fs.readFileSync(path.join(root,'evidence/native-cstring-cleanup/native-followthrough/inputs.json.gz'));
assert.equal(sha256(capsule),'fc87b365317f8ec26d6d3cfd5c69a9f8731fbe64d4f0bb3f4692be9c6fb6d6b7');
const courses=JSON.parse(JSON.parse(gunzipSync(capsule))['courses.json']);
test('compiled factory preserves every frozen native shared-account reply through direct and text commands',()=>{
 for(const wrap of [request=>request,envelope]){
  const host=fresh();let count=0;
  for(const course of courses)for(const row of course.rows){assert.deepEqual(copy(dispatch(host,wrap(copy(row.request)))),row.reply,course.name+' '+count);count++;}
  assert.equal(count,579);
 }
});
test('account authority reaches two inventories and retirement leaves the remaining character intact',()=>{
 const host=open(fresh()),scenario=baseline.scenarios[0];
 // Use the captured inventory twice with independent handles and random streams.
 ok(dispatch(host,{op:'open-workshop-text',profile:2,account:1,seed:17,progression:true,nextUid:0,text:JSON.stringify(scenario.initial.inventory)}));
 const saved=workshopSave(host,2).text;
 const slots=profile=>ok(dispatch(host,{op:'workshop-command-text',profile,text:'{"op":"options","uid":1001,"offset":0,"limit":1}'})).reply.slots;
 assert.deepEqual([slots(1),slots(2)],[1,1]);
 const observed=baseline.rows.find(row=>row.scenario===scenario.name&&row.name==='observe-deed').command;
 const {owner,...command}=observed;
 ok(dispatch(host,{op:'account-command-text',account:1,text:JSON.stringify({...command,credits:1000,roster:scenario.initial.account.roster})}));
 assert.equal(ok(dispatch(host,{op:'account-command-text',account:1,text:'{"op":"buy","id":"feat_craft_second"}'})).reply.result,true);
 assert.deepEqual([slots(1),slots(2)],[2,2]);assert.equal(workshopSave(host,2).text,saved);
 assert.equal(dispatch(host,{op:'close-account',account:1}).reason,'account-in-use');
 ok(dispatch(host,{op:'close-workshop',profile:1}));assert.equal(workshopSave(host,2).text,saved);
 assert.equal(dispatch(host,{op:'workshop-command-text',profile:1,text:JSON.stringify({op:'salvage',uid:1001,access})}).reason,'workshop-not-open');
 ok(dispatch(host,{op:'close-workshop',profile:2}));ok(dispatch(host,{op:'close-account',account:1}));
 assert.equal(dispatch(host,{op:'account-save-text',account:1}).reason,'account-not-open');
});
test('text saves keep separate account authority, versions, opaque JSON and both random continuations',()=>{
 const host=open(fresh()),a=accountSave(host),w=workshopSave(host),resumed=fresh();
 const account=JSON.parse(a.text);account.extra=JSON.parse('{"__proto__":{"n":9007199254740991},"fraction":0.3333333333333333,"tiny":5e-324,"unicode":"雪😀"}');
 ok(dispatch(resumed,{op:'restore-account-text',account:1,text:JSON.stringify(account)}));
 ok(dispatch(resumed,{op:'restore-workshop-text',profile:1,account:1,text:w.text}));
 assert.deepEqual(JSON.parse(accountSave(resumed).text).extra,account.extra);assert.equal(workshopSave(resumed).text,w.text);
 assert(!Object.hasOwn(JSON.parse(w.text).workshop.state,'account'));assert.equal(w.accountVersion,a.version);
 for(const request of [{op:'account',account:1,command:{op:'buy',id:'memory_discovery'}},
  {op:'workshop',profile:1,command:{op:'options',uid:1001,offset:0,limit:32}}])assert.deepEqual(dispatch(resumed,envelope(request)),dispatch(host,envelope(request)));
 const b=JSON.parse(accountSave(host).text),c=JSON.parse(accountSave(resumed).text);delete b.extra;delete c.extra;assert.deepEqual(b,c);
 assert.equal(workshopSave(host).text,workshopSave(resumed).text);
});
test('malformed or cross-owner text envelopes preserve every existing owner',()=>{
 const host=open(fresh()),before=[accountSave(host).text,workshopSave(host).text];
 for(const request of [null,[],{op:'account-save-text',account:1,extra:true},
  {op:'workshop-save-text',profile:1,account:1},
  {op:'open-account-text',account:2,key:'other',seed:1,text:'{"account":1}'},
  {op:'account-command-text',account:1,text:'['},{op:'account-command-text',account:1,text:'null'},
  {op:'workshop-command-text',profile:1,text:'[]'},
  {op:'restore-account-text',account:2,text:'x'.repeat(524289)},
  {op:'account-command-text',account:1,text:'{"op":"buy","id":"memory_discovery","profile":2}'},
  ...['open','restore','close','save'].map(op=>({op:'workshop-command-text',profile:1,text:JSON.stringify({op})})),
  {op:'workshop-command-text',profile:1,text:'{"op":"close-account","account":1}'},
  {op:'restore-workshop-text',profile:2,account:1,text:JSON.stringify({...JSON.parse(before[1]),accountKey:'wrong'})}
 ])assert.equal(dispatch(host,request).ok,false,JSON.stringify(request).slice(0,100));
 assert.deepEqual([accountSave(host).text,workshopSave(host).text],before);
});
test('transport consumption is explicit and malformed content cannot create a host',()=>{
 const table=encodeContentTable(packs);create(table);assert.equal(table.nodes.length,0);
 for(const value of [null,{},encodeContentTable({...packs,unknown:true}),encodeContentTable({items:packs.items})])assert.throws(()=>create(value));
 const bad=copy(packs);bad.skills.schemaVersion=-1;assert.throws(()=>create(encodeContentTable(bad)));
});

class TextOwner {
 host=fresh();
 command(request){
  let encoded=envelope(request);
  if(request.op==='prepare')encoded={op:'prepare-text',text:JSON.stringify(request.commands?.map?.(envelope)??request.commands)};
  if(request.op==='prepared-save')encoded={...request,op:'prepared-save-text'};
  if(['account-save','workshop-save'].includes(request.op))encoded={...request,op:request.op+'-text'};
  const reply=dispatch(this.host,encoded);
  if(!reply.ok||!Object.hasOwn(reply,'text'))return reply;
  const {text,...metadata}=reply;return {...metadata,[request.op==='prepare'?'replies':'save']:JSON.parse(text)};
 }
}
preparedContracts((name,fn)=>test('text bridge: '+name,fn),{AccountWorkshopSession:TextOwner,baseline});

test('text preparation admits every envelope before staging and cannot smuggle lifecycle or owner changes',()=>{
 const host=open(fresh()),before=[accountSave(host),workshopSave(host)];
 const first={op:'account-command-text',account:1,text:'{"op":"buy","id":"memory_discovery"}'};
 for(const second of [null,[],{...first,text:'['},{...first,profile:2},
  {...first,text:'{"op":"buy","id":"memory_discovery","profile":2}'},
  {op:'close-workshop',profile:1},{op:'account',account:1,command:{op:'buy',id:'memory_discovery'}},
  {op:'prepare-text',text:JSON.stringify([first])}]){
  assert.equal(dispatch(host,{op:'prepare-text',text:JSON.stringify([first,second])}).ok,false);
  assert.deepEqual([accountSave(host),workshopSave(host)],before);
 }
 const pending=ok(dispatch(host,{op:'prepare-text',text:JSON.stringify([first])}));
 assert.equal(pending.token,1);assert(Array.isArray(JSON.parse(pending.text)));assert(!Object.hasOwn(pending,'replies'));
 const request={op:'prepared-save-text',token:pending.token,kind:'account',handle:1};
 const saved=ok(dispatch(host,request));assert.equal(typeof saved.text,'string');assert(!Object.hasOwn(saved,'save'));
 for(const invalid of [{...request,profile:1},{...request,token:0},{...request,token:pending.token+1},
  {...request,kind:'workshop'},{op:'prepare-text',text:'[',extra:true}])assert.equal(dispatch(host,invalid).ok,false);
 assert.deepEqual([accountSave(host),workshopSave(host)],before);
 ok(dispatch(host,{op:'abort-prepared',token:pending.token}));assert.deepEqual([accountSave(host),workshopSave(host)],before);
});
