// Original Actor.gainWard boundary. The stat port is controlled for arithmetic,
// re-entry and failure observations; the native resource method executes unchanged.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';import {Actor} from '../src/engine/actor';
bootSimEngine();
const encode=(v:any):any=>{if(v===undefined)return{$undefined:true};if(typeof v==='number'&&!Number.isFinite(v))return{$number:String(v)};if(v===null||typeof v!=='object')return v;return Array.isArray(v)?v.map(encode):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]));};
const cases=[
 {name:'ordinary',amount:10,rate:1,want:15,result:10,reads:1},
 {name:'fraction',amount:10,rate:.5,want:10,result:5,reads:1},
 {name:'suppressed',amount:10,rate:0,want:5,result:0,reads:1},
 {name:'uncapped',amount:1e6,rate:2,want:2000005,result:2000000,reads:1},
 {name:'negative-request',amount:-1,rate:1,want:5,result:0,reads:0},
 {name:'zero-request',amount:0,rate:1,want:5,result:0,reads:0},
 {name:'dead',amount:10,rate:1,want:5,result:0,reads:0},
 {name:'negative-rate-diagnostic',amount:10,rate:-1,want:-5,result:-10,reads:1},
 {name:'nan-request-diagnostic',amount:NaN,rate:1,want:NaN,result:NaN,reads:1},
 {name:'infinite-request-diagnostic',amount:Infinity,rate:1,want:Infinity,result:Infinity,reads:1},
 {name:'nan-rate-diagnostic',amount:10,rate:NaN,want:NaN,result:NaN,reads:1},
 {name:'rate-failure',amount:10,rate:2,want:5,result:undefined,reads:1},
 {name:'nested-during-rate',amount:10,rate:2,want:31,result:20,reads:2},
 {name:'death-during-rate',amount:10,rate:2,want:25,result:20,reads:1},
 {name:'pool-change-during-rate',amount:10,rate:2,want:120,result:20,reads:1},
];
const rows:unknown[]=[];
for(const row of cases){
 const a=new Actor('ward-boundary','player',{x:0,y:0});a.ward=5;a.dead=row.name==='dead';
 const calls:unknown[]=[];let reads=0,nested=false;const stat=a.sheet.get.bind(a.sheet);
 a.sheet.get=(id,...args)=>{
  if(id!=='wardGain')return stat(id,...args);reads++;calls.push({phase:'rate',ward:a.ward,dead:a.dead});
  if(row.name==='rate-failure')throw new Error('rate-failure');
  if(row.name==='nested-during-rate'&&!nested){nested=true;const returned=a.gainWard(3);calls.push({phase:'nested-return',returned,ward:a.ward});}
  if(row.name==='death-during-rate')a.dead=true;
  if(row.name==='pool-change-during-rate')a.ward=100;
  return row.rate;
 };
 let result:number|undefined,failure:string|null=null;
 try{result=a.gainWard(row.amount);}catch(error){failure=(error as Error).message;}
 assert.equal(a.ward,row.want,row.name);assert.equal(result,row.result,row.name);assert.equal(reads,row.reads,row.name);
 assert.equal(failure,row.name==='rate-failure'?'rate-failure':null);
 rows.push(encode({name:row.name,input:{ward:5,dead:row.name==='dead',amount:row.amount,rate:row.rate},result,ward:a.ward,dead:a.dead,reads,calls,failure}));
}
assert.equal(rows.length,15);assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Unaccepted original ward resource observations. Controlled stat callbacks expose native arithmetic, guard/read order, reentry and pre-commit failure; nonfinite and negative rates are compatibility diagnostics, not a content-validation policy.',courses:rows.length,rows},null,2)+'\n');
