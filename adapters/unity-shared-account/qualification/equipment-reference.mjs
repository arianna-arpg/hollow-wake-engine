// Compose the new shared owner with the existing combat projection, checked
// against immutable observations captured from the original game.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {root,sha256} from '../../../scripts/reference-utils.mjs';
import {definitions,packs} from '../../../test/shared-account/fixtures.mjs';
import {AccountWorkshopSession} from '../../../dist/account-workshop-session.js';
import {encodeContentTable} from '../../../dist/content-table-compiler.js';
import {CastRuntime} from '../../../dist/casting.js';
import {create,dispatch,equipmentCapability} from '../../embedded/equipment-session.mjs';
import {passivePack} from '../../../scripts/compile-passive-content.mjs';

const output=process.argv[2];assert(output&&!fs.existsSync(output));
const copy=value=>JSON.parse(JSON.stringify(value)),read=name=>JSON.parse(fs.readFileSync(path.join(root,name)));
const sourceFiles=[];
function collect(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
 const name=dir+'/'+entry.name;if(entry.isDirectory())collect(name);else sourceFiles.push(name);
}}
for(const dir of ['src','content','adapters/embedded'])collect(dir);
sourceFiles.push('adapters/unity-shared-account/qualification/equipment-reference.mjs','test/shared-account/fixtures.mjs',
 'package.json','scripts/reference-utils.mjs','baseline/live-equipment/v2/acceptance.json','baseline/live-equipment/v2/observations.json.gz',
 'evidence/embedded-js/windows-persistent-session-raw.json.gz',
 ...fs.readdirSync(path.join(root,'scripts')).filter(name=>name.startsWith('compile-')&&name.endsWith('.mjs')).map(name=>'scripts/'+name));
const sources=Object.fromEntries(sourceFiles.map(name=>[name,sha256(fs.readFileSync(path.join(root,name)))]));
const bytes=fs.readFileSync(path.join(root,'baseline/live-equipment/v2/observations.json.gz'));
assert.equal(sha256(bytes),read('baseline/live-equipment/v2/acceptance.json').gzipSha256);
const fixture=JSON.parse(gunzipSync(bytes));assert.equal(fixture.rows.length,12);
const history=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'evidence/embedded-js/windows-persistent-session-raw.json.gz'))));
const config=JSON.parse(history.session['requests.jsonl'].split('\n')[0]).config;
config.character={classId:'magician',passivePoints:1};config.skill={id:'ruin',level:5,sockets:0,treePoints:0};config.resources={life:68,mana:117};
const input={core:read('content/milestone-one.json'),items:packs.items,passives:passivePack()};
const aliases={};for(const [name,value] of Object.entries(read('package.json').exports)){
 const file=typeof value==='string'?value:value.import;if(file?.endsWith('.js'))aliases['@hollow-wake/engine'+name.slice(1)]=path.join(root,file);
}
const bundled=await build({entryPoints:[path.join(root,'adapters/embedded/account-workshop-session.mjs')],bundle:true,format:'iife',globalName:'SharedOwner',platform:'neutral',target:'es2022',write:false,metafile:true,tsconfigRaw:{},alias:aliases});
assert(Object.values(bundled.metafile.outputs).every(row=>row.imports.length===0));
const factory=vm.runInNewContext(bundled.outputFiles[0].text+'\n({createText:text=>SharedOwner.create(JSON.parse(text)),dispatchText:(host,text)=>JSON.stringify(SharedOwner.dispatch(host,JSON.parse(text)))});');
function openOwner(route){
 if(route==='portable'){const owner=new AccountWorkshopSession(definitions);return request=>copy(owner.command(request));}
 const host=factory.createText(JSON.stringify(encodeContentTable(packs)));
 return request=>{
  let encoded=request;
  if(request.op==='open-account')encoded={...request,op:'open-account-text',text:'{}'};
  if(request.op==='open-workshop'){const {state,...rest}=request;encoded={...rest,op:'open-workshop-text',progression:true,nextUid:0,text:JSON.stringify(state)};}
  if(request.op==='prepare')encoded={op:'prepare-text',text:JSON.stringify(request.commands.map(({command,...rest})=>({...rest,op:'workshop-command-text',text:JSON.stringify(command)})))};
  if(request.op==='workshop-save')encoded={...request,op:'workshop-save-text'};
  let reply=JSON.parse(factory.dispatchText(host,JSON.stringify(encoded)));
  if(reply.ok&&request.op==='prepare'){const {text,...rest}=reply;reply={...rest,replies:JSON.parse(text)};}
  if(reply.ok&&request.op==='workshop-save'){const {text,...rest}=reply;reply={...rest,save:JSON.parse(text)};}
  return reply;
 };
}
const report={passed:false,scope:'Original 12-course equipment composition through shared prepared owners; no native/device timing claim',sources,fixtureSha256:sha256(bytes),routes:[]};
try{
 for(const route of ['portable','embedded-text']){
  let steps=0,publications=0;
  for(const row of fixture.rows){
   const shared=openOwner(route),send=request=>{const reply=shared(request);assert(reply.ok,JSON.stringify(reply));return reply;};
   send({op:'open-account',account:1,key:row.name,seed:71});
   send({op:'open-workshop',profile:1,account:1,seed:17,state:{board:{w:16,h:16},items:copy(row.initialItems),overflow:[],equipped:{},essences:{}}});
   const save=()=>send({op:'workshop-save',profile:1}).save;
   const combat=create(input),opened=dispatch(combat,{version:1,op:'create',config:copy(config)});assert(opened.ok);
   const actor=combat.sessions.get(opened.handle);
   const action=(op,extra={})=>{const reply=dispatch(combat,{version:1,op,handle:opened.handle,...extra});assert(reply.ok,JSON.stringify(reply));return reply;};
   const snapshot=()=>copy(action('snapshot').snapshot);
   for(const {command,expected} of row.steps){
    const op=command.op;
    if(op==='equip'||op==='unequip'){
     const before=snapshot(),committed=save(),casting=actor.casting,itemRandom=actor.rules.snapshot();
     const gearCommand={...command,...op==='equip'?{actorLevel:1}:{uid:committed.workshop.state.equipped[command.slot].uid}};
     const proposal=send({op:'prepare',commands:[{op:'workshop',profile:1,command:gearCommand}]});
     assert.deepEqual(save(),committed);assert.deepEqual(JSON.parse(send({op:'workshop-equipment-text',profile:1}).text),committed.workshop.state.equipped);
     if(proposal.token){
      const text=send({op:'prepared-workshop-equipment-text',profile:1,token:proposal.token}).text;
      const prepared=action('prepareEquipment',{capability:equipmentCapability,equipped:JSON.parse(text)});
      assert.deepEqual(snapshot(),before);send({op:'commit-prepared',token:proposal.token});action('publishEquipment',{token:prepared.token});publications++;
     }
     const after=snapshot();assert.equal(actor.casting,casting);
     assert.deepEqual({...after.casting,resources:before.casting.resources},before.casting);
     for(const field of ['random','target','items','effect'])assert.deepEqual(after[field],before[field]);assert.deepEqual(actor.rules.snapshot(),itemRandom);
    }else if(op==='press')action('batch',{commands:[{op:'press'}]});
    else if(op==='advanceCasting')action('batch',{commands:[{op:'advance',dt:command.dt}]});
    else if(op==='setResources')actor.casting.setResources({life:command.life,mana:command.mana});
    else if(op==='fillResources')actor.casting.setResources({life:actor.character.sheet.get('life'),mana:actor.character.sheet.get('mana')});
    else if(op==='fixtureClocks'||op==='fixtureRecovery'){
     const state=actor.casting.snapshot();state.recovery=command.useLock;if(command.cooldowns)state.cooldowns=command.cooldowns;actor.casting=CastRuntime.restore(state);
    }else assert.equal(op,'initial');
    const view=action('equipmentView').view;assert.deepEqual(copy(view.attributes),expected.attributes,row.name);
    for(const id of fixture.stats)assert.equal(view.stats[id],expected.stats[id],row.name+' '+id);
    for(const id of ['preview','cost','cooldown'])assert.deepEqual(copy(view[id]),expected[id],row.name+' '+id);
    assert.equal(actor.casting.life,expected.life);assert.equal(actor.casting.mana,expected.mana);
    const cast=actor.casting.snapshot().active;
    if(expected.cast){assert(cast);assert.equal(cast.elapsed,expected.cast.elapsed);assert.equal(cast.total,expected.cast.total);assert.deepEqual(cast.profile.cost,expected.cast.paidCost);}else assert.equal(cast,null);
    assert.deepEqual(save().workshop.state.items,expected.bag);assert.deepEqual(save().workshop.state.equipped,expected.equipped);steps++;
   }
   send({op:'close-workshop',profile:1});send({op:'close-account',account:1});action('destroy');
  }
  report.routes.push({route,courses:fixture.rows.length,steps,publications});
 }
 report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 report.inputsUnchanged=sourceFiles.every(name=>sha256(fs.readFileSync(path.join(root,name)))===sources[name]);report.passed&&=report.inputsUnchanged;
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
assert(report.passed);console.log(JSON.stringify({passed:report.passed,routes:report.routes}));
