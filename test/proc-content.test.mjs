import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {test} from 'node:test';import assert from 'node:assert/strict';
import {ProcContent,BorrowedProcRegistry} from '../dist/proc-content.js';
const rules={maxExtraDepth:2,depthFalloff:.5,ppmCatchup:4};
const row=(id,trigger='condition')=>({id,trigger,effect:{type:'ward',flat:10}});
const pack=()=>({schemaVersion:1,capability:'proc-dispatch/v1',contentId:'test',rules:{...rules},procs:[row('A'),row('B','heal')],riders:[{id:'rider',proc:'A',cast:{skillId:'spark',count:[1,4]}}]});

test('owned proc content preserves every authored proc/rider without adding a rider stat',()=>{
  const raw=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-thirty-eight/proc-catalogue.json.gz',import.meta.url))));
  const input={...pack(),rules:raw.ruleConfiguration,procs:raw.procs.map(r=>r.value),riders:raw.riders.map(r=>r.value)};
  const content=new ProcContent(input);
  assert.equal(content.allIds().length,147);assert.equal(content.riders().length,1);
  assert.deepEqual(content.pack,input);assert.deepEqual(content.allIds(),raw.procs.map(r=>r.id));
  assert.notEqual(content.definition(input.procs[0].id),input.procs[0]);
  assert.deepEqual(content.hitCandidates().map(r=>r.id),input.procs.filter(r=>r.trigger==='hit'||r.trigger==='kill').map(r=>r.id));
});
test('owned input and all returned nested data are detached and immutable',()=>{
  const input=pack(),content=new ProcContent(input);input.procs[0].effect.flat=99;input.procs.splice(0);input.riders[0].cast.count[0]=9;input.rules.depthFalloff=0;
  assert.deepEqual(content.allIds(),['A','B']);assert.equal(content.definition('A').effect.flat,10);assert.deepEqual(content.riders()[0].cast.count,[1,4]);
  assert.equal(content.configuration.depthFalloff,.5);
  assert.throws(()=>{content.definition('A').effect.flat=1;},TypeError);
  assert.throws(()=>content.candidates('condition').push(row('C')),TypeError);
  assert.equal(content.triggerIds('condition').add,undefined);assert.equal(content.triggerIds('condition').delete,undefined);
  assert.equal(content.triggerIds('condition').has('A'),true);
});
test('owned proc validation rejects malformed dispatch and nonportable payload data',()=>{
  const edits=[
    p=>p.procs.push(row('A')),p=>p.riders.push({...p.riders[0]}),p=>p.riders[0].proc='missing',p=>p.procs[0].trigger='unknown',
    p=>p.procs[0].tags=[1],p=>p.procs[0].bracket=[NaN],p=>p.procs[0].icd=Infinity,p=>p.procs[0].oncePerCast=false,
    p=>p.procs[0].effect.flat=()=>1,p=>p.procs[0].effect.self=p.procs[0].effect,p=>p.procs[0].effect.values=new Array(1),
    p=>p.procs[0].effect=Object.assign(new Map(),{type:'ward'}),p=>p.procs[0].effect[Symbol('x')]=1,
    p=>p.rules.maxExtraDepth=1.5,p=>p.rules.depthFalloff=1.01,p=>p.rules.ppmCatchup=-1,
  ];
  for(const edit of edits){const input=pack();edit(input);assert.throws(()=>new ProcContent(input));}
});
test('empty filters and explicit zero ICD are retained rather than normalized away',()=>{
  const input=pack();Object.assign(input.procs[0],{tags:[],requireBuff:[],requireStatus:[],bracket:[],icd:0,ppm:0,every:0});
  assert.deepEqual(new ProcContent(input).definition('A'),input.procs[0]);
});
test('owned revisions with identical ids have independent indexes',()=>{
  const first=new ProcContent(pack()),input=pack();input.procs[0].trigger='pulse';const second=new ProcContent(input);
  assert.equal(first.triggerIds('condition').has('A'),true);assert.equal(second.triggerIds('condition'),undefined);
  assert.equal(second.triggerIds('pulse').has('A'),true);assert.equal(first.definition('A').trigger,'condition');
});
test('borrowed indexes preserve native identities and length-keyed staleness',()=>{
  const definitions=[row('A')],riders=[],ports={definitions:()=>definitions,definition:id=>definitions.find(r=>r.id===id),riders:()=>riders};
  const content=new BorrowedProcRegistry(ports,rules);assert.equal(content.definition('A'),definitions[0]);assert.equal(content.candidates('condition'),definitions);
  assert.equal(content.triggerIds('condition').has('A'),true);definitions[0].trigger='heal';assert.equal(content.triggerIds('heal'),undefined);
  definitions.push(row('B'));assert.equal(content.triggerIds('heal').has('A'),true);assert.equal(content.riders(),riders);
});
test('borrowed source identity replacement refreshes an equal-length index without sharing another binding',()=>{
  let first=[row('A')];const second=[row('A','pulse')];
  const source=rows=>new BorrowedProcRegistry({definitions:rows,definition:id=>rows().find(r=>r.id===id),riders:()=>[]},rules);
  const a=source(()=>first),b=source(()=>second);assert.equal(a.triggerIds('condition').has('A'),true);assert.equal(b.triggerIds('pulse').has('A'),true);
  first=[row('A','heal')];assert.equal(a.triggerIds('heal').has('A'),true);assert.equal(b.triggerIds('heal'),undefined);
});
