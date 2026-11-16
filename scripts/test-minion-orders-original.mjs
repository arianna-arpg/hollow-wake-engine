import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {MinionOrders} from '../dist/minion-orders.js';
import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-minion-orders-probe.json.gz':'baseline/minion-orders/observations.json.gz');
const bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const accepted=JSON.parse(fs.readFileSync('baseline/minion-orders/acceptance.json'));assert.equal(sha256(archive),accepted.compressedSha256);assert.equal(sha256(bytes),accepted.sha256);}
for(const c of fixture.courses){
  const caster={id:c.casterId,pos:c.aim,tier:0,squadId:9,faction:'m3',sheet:{get:()=>.1}};
  const roster=c.traits.map((t,i)=>({id:c.ids[i],owner:t.owner?caster:undefined,dead:false,squadId:t.squad?9:undefined,faction:t.faction?'m3':undefined,
    passive:!!t.passive,pos:{x:800+t.x,y:600},sheet:{get:()=>0},ownedBy(owner){return this.owner===owner;},obedience:t.obedience,
    throngCarried:true,aiTargetId:123,wanderDir:2,threat:new Map([[123,7]])}));
  let draws=0;
  const runtime=new MinionOrders(fixture.rules,{actors:()=>[caster,...roster],enemies:()=>roster.filter(a=>c.enemies.includes(a.id)),time:()=>c.time,
    random:()=>{assert(draws<c.draws.length);return c.draws[draws++];},commandExists:()=>true,serves:()=>true,obedience:a=>a.obedience,
    promoteCommand(){},issue(a,order){a.throngCarried=false;a.aiCommand=order;a.aiTargetId=undefined;a.threat.clear();a.wanderDir=undefined;},
    assault(){},defied(){draws++;},sent(){},unheeded(){draws++;},empty(){},unknown(){assert.fail('unknown command');}});
  runtime.command(caster,{def:{id:'m3-command'}},c.aim,c.spec,'#fff');
  const actual=roster.map(a=>({id:a.id,command:a.aiCommand,carried:a.throngCarried,target:a.aiTargetId,wander:a.wanderDir,threat:[...a.threat]}));
  assert.deepEqual(JSON.parse(JSON.stringify(actual)),c.expected,JSON.stringify(c.spec));assert.equal(draws,c.draws.length,'random continuation');
}
console.log({passed:true,originalFullCastCourses:fixture.courses.length,allCombatFamiliesQualified:false});
