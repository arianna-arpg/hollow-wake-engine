import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {AreaDeliveries} from '../dist/area-deliveries.js';import {inAoe} from '../dist/combat-geometry.js';import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-area-deliveries-probe.json.gz':'baseline/area-deliveries/observations.json.gz');
const bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const a=JSON.parse(fs.readFileSync('baseline/area-deliveries/acceptance.json'));assert.equal(sha256(archive),a.compressedSha256);assert.equal(sha256(bytes),a.sha256);}
const plain=value=>JSON.parse(JSON.stringify(value));
for(const c of fixture.courses){
  const a={...c.caster,pos:{x:800,y:600},facing:0,tier:0,team:'ally',dead:false,untargetable:false,statuses:[],sheet:{get:(key,_tags,_extra,base)=>c.stats[key]??base??0}},
    skill={def:{id:'m3-'+c.name,tags:['spell']}},actors=[a,...c.bodies.map(b=>({...structuredClone(b),dead:false,untargetable:false}))],hits=[],zones=[],projectiles=[];
  if(c.name==='consume')projectiles.push({caster:a,inst:skill,pos:{x:820,y:600}});
  const runtime=new AreaDeliveries({actors:()=>actors,enemiesOf:()=>actors.filter(b=>c.enemies.includes(b.id)),projectiles:()=>projectiles,assaultLocked:()=>undefined,
    resolveHit:(_a,_i,b,mult,depth,flat)=>hits.push(plain({target:b.id,mult,depth,flat})),nearestBody:b=>({pos:b.pos,r:b.radius,seg:-1}),noteBodyHit(){},
    inAoeBody:(origin,radius,shape,facing,b,arc,predicate)=>inAoe(origin,radius,shape,facing,b.pos,b.radius,arc)&&predicate(b.pos,b.radius)?{pos:b.pos,r:b.radius,seg:-1}:null,
    zone:z=>zones.push(z),flash(){},releaseStruckSummons(){},skillStrikeVoice(){},skillBurstVoice(){},skillBeamVoice(){},skillSelfVoice(){},skillContextTags:()=>new Set(['spell']),
    mintAftermath(){},healAlliesInArea(){},frontSplash(){},strikeSurfaces(){},skillOcclusion:()=> 'free',lineOfFire:()=>true,clipShot:(_a,b)=>b,spawnAftershocks(){}});
  const field=runtime[c.delivery.type]({caster:a,inst:skill,d:c.delivery,aim:c.aim,origin:a.pos,tags:new Set(['spell']),extra:[],useMult:2,aoeScale:1,arcScale:1,cosmeticColor:'#fff'});
  assert.deepEqual(hits,c.hits,c.name+': selected contacts');assert.deepEqual(field?[field]:[],c.fields,c.name+': linger origin');assert.equal(projectiles.length,c.projectiles);
  assert.deepEqual(plain(zones.map(z=>({pos:z.pos,radius:z.radius,linger:z.linger,shape:z.shape,facing:z.facing,drift:z.drift,arcRad:z.arcRad,struck:[...z.struck??[]]}))),c.zones,c.name+': sweep');
}
console.log({passed:true,originalDeliveryCourses:fixture.courses.length,contactSelectionQualified:true,fullHitPipelineQualified:false,allCombatFamiliesQualified:false});
