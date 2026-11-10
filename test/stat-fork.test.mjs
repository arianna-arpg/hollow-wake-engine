import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {StatSheet,StatRules} from '../dist/index.js';

const read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url)));
const pack=read('content/milestone-one.json'),rules=new StatRules(pack.stats,pack.trades);
const original=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/build-context/observations.json.gz',import.meta.url))));
const flat=(stat,value)=>({stat,kind:'flat',value});
function equivalent(actual,expected){
 for(const[id,value]of Object.entries(expected))assert(Math.abs(actual[id]-value)<=1e-12*Math.max(1,Math.abs(value)),`${id}: ${actual[id]} != ${value}`);
}
function hydrate(row){
 const sheet=new StatSheet(rules,2,1);
 for(const[id,value]of row.rawSheet.bases)sheet.setBase(id,value);
 sheet.setConditions(row.rawSheet.conditions);sheet.setGauges(row.rawSheet.gauges);
 for(const[id,mods]of row.rawSheet.sources)sheet.setSource(id,mods);
 return sheet;
}
for(const row of original.rows)test('stat fork preserves original build context: '+row.label,()=>{
 const sheet=hydrate(row),read=s=>Object.fromEntries(Object.keys(row.reads).map(id=>[id,s.get(id)]));
 equivalent(read(sheet),row.reads);sheet.get('life',new Set(['spell']));
 const fork=sheet.fork();assert.notEqual(fork,sheet);assert.equal(fork.revision,sheet.revision);
 assert.equal(fork.cacheEntries,0);assert.equal(fork.contextCacheEntries,0);
 equivalent(read(fork),row.reads);assert.deepEqual(fork.sourceNames(),sheet.sourceNames());
 const revision=fork.revision;fork.setConditions(row.rawSheet.conditions);fork.setGauges(row.rawSheet.gauges);assert.equal(fork.revision,revision);
 fork.setBase('life',777);fork.setConditions([]);fork.setGauges([]);fork.removeSource('gear:helmet');fork.setSource('fork-only',[flat('life',1)]);
 equivalent(read(sheet),row.reads);assert(!sheet.hasSource('fork-only'));
 const edited=read(fork);sheet.setBase('life',11);sheet.setSource('source-only',[flat('mana',9)]);
 equivalent(read(fork),edited);assert(!fork.hasSource('source-only'));
});

test('stat forks preserve independent source order and last override precedence',()=>{
 const sheet=new StatSheet(new StatRules({power:{base:1}}));
 sheet.setSource('first',[{stat:'power',kind:'override',value:4}]);
 sheet.setSource('last',[{stat:'power',kind:'override',value:9}]);
 const fork=sheet.fork();assert.equal(fork.get('power'),9);
 fork.setSource('first',[{stat:'power',kind:'override',value:7}]);assert.equal(fork.get('power'),9);
 fork.removeSource('last');assert.equal(fork.get('power'),7);assert.equal(sheet.get('power'),9);
 fork.setSource('last',[{stat:'power',kind:'override',value:12}]);assert.equal(fork.get('power'),12);
 assert.deepEqual(sheet.getSourceMods('first'),[{stat:'power',kind:'override',value:4}]);
});

test('stat forks own exposed modifier reads, nested tags and subsequent source writes',()=>{
 const sheet=new StatSheet(new StatRules({power:{base:1}})),mods=[{...flat('power',4),tags:['fire']}];
 sheet.setSource('worn',mods);const fork=sheet.fork();
 mods[0].value=100;mods[0].tags[0]='cold';
 const exposed=fork.getSourceMods('worn');exposed[0].value=90;exposed[0].tags.push('cold');
 assert.equal(sheet.get('power',new Set(['fire'])),5);assert.equal(fork.get('power',new Set(['fire'])),5);
 assert.equal(fork.get('power',new Set(['cold'])),1);
 sheet.setSource('worn',[flat('power',8)]);assert.equal(sheet.get('power'),9);assert.equal(fork.get('power'),1);
});

test('forked conditions and gauges remain private through replacement and invalid input',()=>{
 const sheet=new StatSheet(new StatRules({power:{base:1}}));
 sheet.setSource('context',[{...flat('power',2),when:'ready'},{...flat('power',3),gauge:'charge'}]);
 const conditions=['ready'],gauges=[['charge',4]];sheet.setConditions(conditions);sheet.setGauges(gauges);
 const fork=sheet.fork();conditions.length=0;gauges[0][1]=99;
 assert.equal(fork.get('power'),15);assert.equal(fork.gauge('charge'),4);assert(fork.hasCondition('ready'));
 const revision=sheet.revision;assert.throws(()=>fork.setGauges([['charge',NaN]]));assert.equal(sheet.revision,revision);
 fork.setConditions([]);fork.setGauges([['charge',2]]);assert.equal(fork.get('power'),7);assert.equal(sheet.get('power'),15);
 sheet.setConditions([]);sheet.setGauges([]);assert.equal(sheet.get('power'),1);assert.equal(fork.get('power'),7);
});

test('stat fork preserves bases and linked reads without a parent cache dependency',()=>{
 const sheet=new StatSheet(new StatRules({life:{base:10},power:{base:1}}));
 sheet.setBase('life',100);sheet.setSource('linked',[{stat:'power',kind:'link',fromStat:'life',value:.25}]);
 assert.equal(sheet.get('power'),26);const fork=sheet.fork();assert.equal(fork.get('power'),26);
 fork.setBase('life',40);assert.equal(fork.get('power'),11);assert.equal(sheet.get('power'),26);
 sheet.setBase('life',20);assert.equal(sheet.get('power'),6);assert.equal(fork.get('power'),11);
});

test('stat fork drops warm arming indexes and tracks each owner independently',()=>{
 const sheet=new StatSheet(new StatRules({grant_a:{base:0},grant_b:{base:0}})),ids=['a','b'];
 sheet.setBase('grant_a',2);assert.deepEqual(sheet.armedFamily('grant_',ids),['a']);
 const fork=sheet.fork();assert.deepEqual(fork.armedFamily('grant_',ids),['a']);
 fork.setBase('grant_a',0);fork.setSource('new',[flat('grant_b',3)]);
 assert.deepEqual(fork.armedFamily('grant_',ids),['b']);assert.deepEqual(sheet.armedFamily('grant_',ids),['a']);
 sheet.setBase('grant_a',0);assert.deepEqual(sheet.armedFamily('grant_',ids),[]);assert.deepEqual(fork.armedFamily('grant_',ids),['b']);
});

test('forked caches retain zero and nonzero bounds with mutable tag contexts',()=>{
 const definitions=new StatRules({power:{base:1}});
 for(const[valueBound,contextBound]of [[0,0],[2,0],[2,1]]){
  const sheet=new StatSheet(definitions,valueBound,contextBound);
  sheet.setSource('tagged',[{...flat('power',3),tags:['fire']}]);const tags=new Set(['fire']);
  assert.equal(sheet.get('power',tags),4);const fork=sheet.fork();
  assert.equal(fork.cacheEntries,0);assert.equal(fork.contextCacheEntries,0);
  for(const tag of ['fire','cold','spell']){tags.clear();tags.add(tag);assert.equal(fork.get('power',tags),tag==='fire'?4:1);}
  assert(fork.cacheEntries<=valueBound);assert(fork.contextCacheEntries<=contextBound);
  if(valueBound>0)assert(fork.cacheEntries>0);
 }
});

test('forking an edited fork preserves three independent build continuations',()=>{
 const a=new StatSheet(new StatRules({power:{base:1}}));a.setSource('build',[flat('power',2)]);
 const b=a.fork();b.setSource('build',[flat('power',4)]);const c=b.fork();
 c.setSource('build',[flat('power',8)]);assert.deepEqual([a.get('power'),b.get('power'),c.get('power')],[3,5,9]);
 assert.deepEqual([a.sourceNames(),b.sourceNames(),c.sourceNames()],[['build'],['build'],['build']]);
 // Equal revisions on independent branches are not a global conflict token.
 a.setBase('power',10);assert.equal(a.revision,b.revision);assert.notEqual(a.get('power'),b.get('power'));
});
