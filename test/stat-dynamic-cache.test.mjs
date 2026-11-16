import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StatRules,StatSheet} from '../dist/index.js';

test('dynamic stat caches agree with uncached evaluation through linked, traded and conditional edits',()=>{
 const rules=new StatRules({power:{base:10},damage:{base:2},rate:{base:.2},forgo:{base:0},gain:{base:0}},[
  {from:'power',to:'gain',rateStat:'rate',forgoStat:'forgo'}]);
 const sheets=[new StatSheet(rules,256),new StatSheet(rules,0)],tags=new Set(['spell']);
 const modifiers=[{stat:'power',kind:'flat',value:3,when:'ready',gauge:'charge'},
  {stat:'damage',kind:'link',value:.5,fromStat:'power'},
  {stat:'rate',kind:'flat',value:.1,gauge:'charge',gaugeAt:2},
  {stat:'damage',kind:'more',value:.25,tags:['spell'],when:'ready'}];
 const each=action=>sheets.forEach(action);
 each(s=>s.setSource('gear',modifiers));
 for(let i=0;i<200;i++){
  each(s=>s.setConditions(i%3?['ready','moving']:['moving']));
  each(s=>s.setGauges(i%7?[['charge',i%5],['unreferenced-clock',i]]:[['unreferenced-clock',i]]));
  if(i%13===0)each(s=>s.setSource('temporary',[{stat:'power',kind:'flat',value:7,gauge:'unreferenced-clock'}]));
  if(i%13===4)each(s=>s.removeSource('temporary'));
  if(i%17===0)each(s=>s.setBase('power',10+i));
  for(const context of [undefined,tags])for(const extra of [undefined,[{stat:'damage',kind:'flat',value:2,gauge:'unreferenced-clock',when:'moving'}]])
   for(const id of ['power','damage','rate','gain','forgo'])assert.equal(sheets[0].get(id,context,extra),sheets[1].get(id,context,extra),`${i} ${id}`);
  assert.equal(sheets[0].revision,sheets[1].revision);
 }
});

test('irrelevant dynamic inputs keep value/family caches while later sources and forks observe them',()=>{
 const rules=new StatRules({power:{base:10},proc_a:{base:0}}),sheet=new StatSheet(rules);
 sheet.setBase('proc_a',1);sheet.get('power');const registry=['a'],family=sheet.armedFamily('proc_',registry),revision=sheet.revision;
 sheet.setGauges([['clock',5]]);sheet.setConditions(['moving']);
 assert.equal(sheet.revision,revision+2);assert.equal(sheet.cacheEntries,1);assert.equal(sheet.armedFamily('proc_',registry),family);
 const fork=sheet.fork();assert.equal(fork.cacheEntries,0);
 for(const s of [sheet,fork]){s.setSource('later',[{stat:'power',kind:'flat',value:2,gauge:'clock',when:'moving'}]);assert.equal(s.get('power'),20);}
 sheet.setGauges([['clock',0]]);assert.equal(sheet.get('power'),10);assert.equal(fork.get('power'),20);
 sheet.setGauges([]);assert.equal(sheet.get('power'),10);
 const before=sheet.revision;assert.throws(()=>sheet.setGauges([['clock',1],['clock',2]]));assert.equal(sheet.revision,before);
 sheet.setConditions([]);sheet.setGauges([['clock',8]]);assert.equal(sheet.get('power'),10);
 sheet.setConditions(['moving']);assert.equal(sheet.get('power'),26);
});

test('plain, tagged and linked cache keys cannot alias and share one bound',()=>{
 const rules=new StatRules({power:{base:2},'0:5:power["fire"]':{base:99},linked:{base:0}}),sheet=new StatSheet(rules,3),tags=new Set(['fire']);
 sheet.setSource('gear',[{stat:'power',kind:'flat',value:3,tags:['fire']},{stat:'linked',kind:'link',fromStat:'power',value:2}]);
 for(let i=0;i<20;i++){
  assert.equal(sheet.get('power'),2);assert.equal(sheet.get('power',tags),5);assert.equal(sheet.get('0:5:power["fire"]'),99);
  assert.equal(sheet.get('linked'),4);assert.equal(sheet.get('linked',tags),10);assert(sheet.cacheEntries<=3);
 }
});
