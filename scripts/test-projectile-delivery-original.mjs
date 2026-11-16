import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {ProjectileDelivery} from '../dist/projectile-delivery.js';import {inAoe,zoneHoleSpares,bandSwingGeo} from '../dist/combat-geometry.js';import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-projectile-delivery-probe.json.gz':'baseline/projectile-delivery/observations.json.gz');
const bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const a=JSON.parse(fs.readFileSync('baseline/projectile-delivery/acceptance.json'));assert.equal(sha256(archive),a.compressedSha256);assert.equal(sha256(bytes),a.sha256);}
const plain=value=>JSON.parse(JSON.stringify(value));
for(const c of fixture.courses){
  const a={id:c.casterId,pos:{x:800,y:600},facing:.3,sheet:{get:key=>c.stats[key]},speedFactor:()=>c.speed},skill={def:{id:c.skillId}},salvos=[];
  let time=0,draw=0,emission=0,expected=[];const actual=[];
  const runtime=new ProjectileDelivery(salvos,[],1,{time:()=>time,random:()=>{assert(draw<c.draws.length);return c.draws[draw++];},projectilesPerCharge:()=>0,caromCapacity:()=>c.capacity,clamp:p=>p,anchor(){},
    spawn(caster,inst,at,direction,options){const e=expected[emission++];assert(e,'extra emission');assert.equal(draw,e.before,c.name+': release draw position');
      actual.push(plain({caster:caster.id,skill:inst.def.id,at,direction,options,before:draw,after:e.after}));
      // The original factory's draws occur between release calls. Flight and
      // its factory are not replaced by the release selector under test.
      draw=e.after;},embed(){assert.fail('unexpected embed');},minions(){assert.fail('unexpected court');},triggerAmbush(){assert.fail('unexpected ambush');}});
  for(const step of c.steps){time=step.time;assert.equal(draw,step.drawStart);expected=step.emissions;emission=0;actual.length=0;
    runtime.execute({caster:a,skill,aim:step.aim,delivery:c.delivery,multiplier:1.2,tags:new Set(['spell']),modifiers:[],gaugePower:1,chargesSpent:0,corpseFeast:0,bonusProjectiles:0,ventRounds:0,color:'#fff'});
    assert.deepEqual(actual,expected,c.name);assert.equal(draw,step.drawEnd,c.name+': complete draw count');
    assert.deepEqual(plain(skill.state?.anchors??null),step.anchors??null);assert.equal(skill.state?.anchorsAt,step.anchorsAt);
    assert.deepEqual(plain(salvos.map(({aim,origin,shots,timer,interval,mult,flat})=>({aim,origin,shots,timer,interval,mult,flat}))),step.salvos);
  }
}
for(const c of fixture.geometry){assert.equal(inAoe({x:0,y:0},c.radius,c.shape,c.facing,c.point,c.bodyRadius),c.inside);assert.equal(zoneHoleSpares({pos:{x:0,y:0},radius:c.radius,shape:c.shape,facing:c.facing,edge:.5},c.point,Math.abs(c.bodyRadius)),c.hole);}
for(const c of fixture.bands)assert.deepEqual(bandSwingGeo(100,c.arc),c.expected);
console.log({passed:true,releaseCourses:fixture.courses.length,geometryObservations:fixture.geometry.length*2+fixture.bands.length,flightQualified:false,allCombatFamiliesQualified:false});
