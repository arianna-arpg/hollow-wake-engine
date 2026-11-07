import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
import {itemPack} from './compile-item-content.mjs';
import {passivePack} from './compile-passive-content.mjs';

const [folder,release]=process.argv.slice(2);
const out=fs.realpathSync(folder),read=f=>JSON.parse(fs.readFileSync(f));
const historical=read(path.join(root,'evidence/embedded-js/windows-persistent-session.json'));
const raw=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'evidence/embedded-js/windows-persistent-session-raw.json.gz')))).session;
for(const file of ['requests.jsonl','node-original.jsonl'])assert.equal(sha256(raw[file]),historical.session.raw[file]);
fs.writeFileSync(path.join(out,'combat.requests'),raw['requests.jsonl']);
fs.writeFileSync(path.join(out,'combat.expected'),raw['node-original.jsonl']);
fs.writeFileSync(path.join(out,'plain-combat.json'),JSON.stringify({
  core:read(path.join(root,'content/milestone-one.json')),items:itemPack(),passives:passivePack()}));
const dir=path.join(root,'baseline/pouch-recall'),bytes=gunzipSync(fs.readFileSync(path.join(dir,'observations.json.gz')));
assert.equal(sha256(bytes),read(path.join(dir,'acceptance.json')).sha256);
const {actions,cases,profiles,defs}=JSON.parse(bytes);
const data=read(path.join(out,'pouch-data.json'));
assert.equal(sha256(fs.readFileSync(path.join(out,'pouch-data.json'))),read(path.join(release,'verification-dotnet-windows.json')).files['pouch-data.json']);
const requests=[],expected=[];
const append=(r,e)=>{requests.push(JSON.stringify(r));expected.push(JSON.stringify(e));};
for(const a of actions){
  const ledger=a.mode==='threshold'?{[defs.rules.dropPrefix+'firebolt']:defs.rules.threshold-1}:{};
  const context={state:{items:a.before,board:{w:12,h:8},account:{features:[],progression:a.mode!=='immortal',ledger}},
    memory:null,level:1,uid:a.uid,sealed:a.mode==='sealed'};
  append({...context,op:'view'},a.view?{ok:true,view:a.view}:{ok:false,reason:'missing-item'});
  append({...context,op:'recall',nextUid:a.item?.uid??100000,group:a.group,facet:a.facet},a.result?
    {ok:true,result:a.result,item:a.item,order:a.bagOrder,remaining:a.pouchPresent?a.remaining:null,pouch:a.uid,ledger:a.ledger,secondary:a.secondary,seatLedger:a.seatLedger}:
    {ok:false,reason:a.floats[0]??'missing-item'});
}
for(const row of cases){
  const p=profiles[row.profile],u=row.unit,uid=4294967301;
  const baseId=row.facet?'preformed_memory':'rough_memory',group=u.g?u.d+'|'+u.g.k+':'+u.g.id:u.d;
  const memory={content:data.id,skills:p.skills,supports:p.supports,secondary:[],seatLedger:{}};
  append({op:'recall',state:{items:[{uid:1,baseId,x:0,y:0,mem:[u]}],board:{w:1,h:1},
    account:{features:p.all?[data.unlockAll]:[],ledger:{},progression:true}},uid:1,group,facet:row.facet,nextUid:uid,level:p.level,sealed:false,memory},
    {ok:true,gem:row.gem,nextUid:uid+1});
}
assert.equal(requests.length,2334);
fs.writeFileSync(path.join(out,'pouches.requests'),requests.join('\n')+'\n');
fs.writeFileSync(path.join(out,'pouches.expected'),expected.join('\n')+'\n');
const workshopProof=read(path.join(root,'evidence/content-tables/windows.json'));
const workshopBytes=fs.readFileSync(path.join(root,workshopProof.raw.file));
assert.equal(sha256(workshopBytes),workshopProof.raw.sha256);
const {course}=JSON.parse(gunzipSync(workshopBytes));
assert.equal(course.rows.length,56);
fs.writeFileSync(path.join(out,'workshop.requests'),course.rows.map(r=>JSON.stringify(r.request)).join('\n')+'\n');
fs.writeFileSync(path.join(out,'workshop.expected'),course.rows.map(r=>JSON.stringify(r.expected)).join('\n')+'\n');
