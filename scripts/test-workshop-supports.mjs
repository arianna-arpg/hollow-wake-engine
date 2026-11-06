import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import vm from 'node:vm';
import {root,sha256} from './reference-utils.mjs';
import {supportGateAssets} from './compile-workshop-supports.mjs';
import {replayCustody} from './replay-workshop-custody.mjs';

const a=await supportGateAssets();
const frozen=file=>JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline',file))));
const original=frozen('milestone-twenty-one/support-rules.json.gz'),{courses}=frozen('workshop-supports/observations.json.gz');
const alternate=def=>def.rollBase?Object.fromEntries(def.rollBase.axes.map(axis=>[axis.id,axis.rows.at(-1).id])):undefined;
const read=(t,id)=>Object.hasOwn(a.records[t],id)?a.records[t][id]:undefined;
const originalMoves=replayCustody(a.api.fitSupport,read);assert.equal(originalMoves,18);
const cases=[],covered=new Set();
let comparisons=0,crewOnly=0,changed=0;
for(const [i,id] of original.skills.entries()){
  const c=courses[i];assert.equal(c.skillId,id);
  const bare={kind:'skill',skillId:id,level:1,rarity:'common',sockets:[null,null,null,null]};
  const socket=(k,level)=>({supportId:k,level,...(alternate(a.records.supports[k])?{rolled:alternate(a.records.supports[k])}:{})});
  const built={...bare,level:10,rarity:'rare',sockets:[socket(c.seated[0],2),null,socket(c.seated[1],3),null],treeNodes:c.treeNodes};
  for(const [j,sid] of original.supports.entries()){
    const flags=Number(original.matrix[i][j]),first=!!(flags&6),second=c.verdicts[j]==='1';
    const plain={kind:'support',supportId:sid,level:1},cut={...plain,...socket(sid,2)};
    const actual=a.api.fitSupport([bare],plain,read)[0].fits,withStones=a.api.fitSupport([null,built],cut,read)[0].fits;
    if(actual!==first||withStones!==second)assert.fail('Mismatch at '+id+'/'+sid);
    comparisons+=2;
    if((flags&6)===4)crewOnly++;
    if(first!==second)changed++;
    const label=[(flags&6)===4?'crew':'direct',first,second,!!cut.rolled,c.treeNodes.length>0].join('-');
    if(!covered.has(label)){
      covered.add(label);
      for(const [bar,support,fits] of [[[bare],plain,first],[[null,built],cut,second]]){
        cases.push({bar,support,expected:[{slot:bar.length-1,skillId:id,fits,sockets:4,occupied:bar.length===1?0:2}]});
      }
    }
  }
}
assert.equal(comparisons,871956);assert(crewOnly>0&&changed>0);
for(const sid of ['splitting','multistrike']){
  const j=original.supports.indexOf(sid);assert(j>=0);
  const used=new Set(),bar=[],expected=[];
  for(const [slot,mode] of ['host',null,'crew','no','no','crew',null,'host'].entries()){
    if(!mode){bar.push(null);continue;}
    const i=original.matrix.findIndex((row,i)=>{
      const flags=Number(row[j])&6;return !used.has(i)&&(mode==='host'?!!(flags&2):mode==='crew'?flags===4:flags===0);
    });
    assert(i>=0);used.add(i);const skillId=original.skills[i];
    bar.push({skillId,kind:'skill',level:1,rarity:'common',sockets:[null,null,null,null]});
    expected.push({slot,skillId,fits:mode!=='no',sockets:4,occupied:0});
  }
  cases.push({bar,support:{kind:'support',supportId:sid,level:1},expected});
}
const reader=a.api.createSupportReader(a.index,range=>{
  const bytes=a.data.subarray(range.offset,range.offset+range.length);return {sha256:sha256(bytes),text:bytes.toString('utf8')};
});
for(const row of cases)assert.deepEqual(reader(row.bar,row.support),row.expected);
assert.throws(()=>a.api.createSupportReader(a.index,()=>({text:'{}',sha256:'wrong'}))(cases[0].bar,cases[0].support),/invalid-support-page/);
function pageCourse(reuse){
  const api=vm.runInNewContext(a.bundle+'\nHollowWakeSession',{}, {contextCodeGeneration:{strings:false,wasm:false}});
  const host=api.create(a.index),sequence=[...cases,...Array(6).fill(cases.at(-1))];
  let reads=0,bytesRead=0;
  for(const row of sequence){
    if(!reuse)host.previous=null;
    let r=api.dispatch(host,['command',{op:'fits',bar:row.bar,support:row.support}]);
    while(r.ok&&r.page!==undefined){
      const range=a.index.pages[r.page],bytes=a.data.subarray(range.offset,range.offset+range.length);
      reads++;bytesRead+=range.length;
      r=api.dispatch(host,['command',{op:'supply',page:r.page,text:bytes.toString('utf8')}]);
    }
    assert(r.ok);assert.deepEqual(JSON.parse(JSON.stringify(r.rows)),row.expected);
    assert(host.pages.size<=4);assert(!host.previous||host.previous.size<=128);
  }
  return {queries:sequence.length,reads,bytesRead};
}
const pagesOnly=pageCourse(false),retained=pageCourse(true);assert(retained.reads<pagesOnly.reads);
const deviceCases=JSON.parse(fs.readFileSync(path.join(root,'examples/godot-inventory/support-measure.json')));
for(const row of deviceCases){
  const j=original.supports.indexOf(row.support.supportId);assert(j>=0);
  const expected=row.bar.flatMap((g,slot)=>g?[{slot,skillId:g.skillId,fits:!!(Number(original.matrix[original.skills.indexOf(g.skillId)][j])&6),sockets:4,occupied:0}]:[]);
  assert.deepEqual(row.expected,expected);assert.deepEqual(reader(row.bar,row.support),expected);
}
const report={sourceCommit:a.index.sourceCommit,comparisons,skills:original.skills.length,supports:original.supports.length,
  crewOnly,changed,representativeQueries:cases.length,gateBytes:Buffer.byteLength(a.bundle),dataBytes:a.data.length,
  largestPage:Math.max(...a.index.pages.map(p=>p.length)),dataSha256:a.index.sha256,pageComparison:{pagesOnly,retained}};
if(process.argv[2]==='--capture'){
  const dir=process.argv[3]?path.resolve(process.argv[3]):path.join(root,'evidence/workshop-supports');fs.mkdirSync(dir,{recursive:true});
  const writes=[['rules.json',report],['native-cases.json',cases]];
  for(const [file] of writes)assert(!fs.existsSync(path.join(dir,file)));
  for(const [file,value] of writes)fs.writeFileSync(path.join(dir,file),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
}else{
  assert.deepEqual(report,JSON.parse(fs.readFileSync(path.join(root,'evidence/workshop-supports/rules.json'))));
  assert.deepEqual(cases,JSON.parse(fs.readFileSync(path.join(root,'evidence/workshop-supports/native-cases.json'))));
}
console.log({...report,originalMoves});
