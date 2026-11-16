import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {ThrongOrders} from '../dist/throng-orders.js';
import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-throng-orders-probe.json.gz':'baseline/throng-orders/observations.json.gz');
const bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const accepted=JSON.parse(fs.readFileSync('baseline/throng-orders/acceptance.json'));assert.equal(sha256(archive),accepted.compressedSha256);assert.equal(sha256(bytes),accepted.sha256);}
for(const c of fixture.courses){
  const caster={id:c.casterId,pos:{x:800,y:600}},bodies=c.ids.map((id,i)=>({id,throngCarried:true,throngDive:c.variant==='diving'&&i===0?{x:850,y:650}:undefined,
    aiTargetId:999,wanderDir:1,threat:new Map([[999,5]])}));let pooled;
  const runtime=new ThrongOrders(fixture.rules,{time:()=>10,evolution:()=>({}),bodies:()=>bodies,kind:()=>c.kind,countOwned:()=>0,
    enemies:()=>[{id:c.quarryId,pos:{x:810,y:600},sheet:{get:()=>0}},{id:c.quarryId+1,pos:{x:790,y:600},sheet:{get:()=>0}}],
    issue(a,order){a.throngCarried=false;a.aiCommand=order;a.aiTargetId=undefined;a.threat.clear();a.wanderDir=undefined;},
    pooledOrder(owner,kind,order){assert.equal(owner,c.casterId);assert.equal(kind,c.kind);pooled=order;},empty(){}});
  runtime.direct(caster,{def:{id:c.skillId,throng:c.spec}},{x:800,y:600},{});
  assert.deepEqual(JSON.parse(JSON.stringify(bodies.map(b=>({order:b.aiCommand,carried:b.throngCarried,dive:b.throngDive,target:b.aiTargetId,wander:b.wanderDir,threat:[...b.threat]})))),c.expected,c.skillId+':'+c.variant);
  assert.deepEqual(pooled,c.pooled);
}
console.log({passed:true,originalAuthoredCastCourses:fixture.courses.length,allCombatFamiliesQualified:false});
