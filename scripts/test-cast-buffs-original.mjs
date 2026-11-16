import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {CastBuffs} from '../dist/cast-buffs.js';
import {CasterEffects} from '../dist/caster-effects.js';
import {BuffRuntime} from '../dist/buffs.js';
import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-cast-buffs-probe.json.gz':'baseline/cast-buffs/observations.json.gz');
const bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const accepted=JSON.parse(fs.readFileSync('baseline/cast-buffs/acceptance.json'));assert.equal(sha256(archive),accepted.compressedSha256);assert.equal(sha256(bytes),accepted.sha256);}
for(const c of fixture.courses){
  const make=over=>({pos:{x:800,y:600},radius:10,team:'ally',tier:0,dead:false,buffs:new Map(),gainEvents:[],
    isMinion(){return !!this.owner;},sheet:{get:s=>s==='offeringShare'?.4:1},...over});
  const caster=make({radius:14}),roster=[caster,...c.traits.map(t=>make({pos:{x:800+t.x,y:600},owner:t.owner?caster:undefined,
    team:t.enemy?'enemy':'ally',tier:t.tier??0,downed:!!t.downed,dead:!!t.dead}))];
  const buffs=new BuffRuntime({publish(){},removeSource(){},release(){}}),policy=new CastBuffs({actors:()=>roster,tags:s=>new Set(s.def.tags),tagList:t=>[...t],
    modifiers:()=>[],hasTreeBuffs:()=>false,grant:buffs.grant.bind(buffs),remove:buffs.remove.bind(buffs),arrival(){}});
  new CasterEffects({buffs:policy},{fuse:()=>undefined}).apply({caster,skill:{def:{tags:['spell'],gauge:{}},state:{gaugePower:2.2}},
    origin:caster.pos,aim:caster.pos,delivery:'self',durationScale:1.5,areaScale:1,multiplier:.25,color:'#fff',tags:new Set(['spell']),modifiers:[],chargesSpent:0},[c.effect]);
  assert.deepEqual(JSON.parse(JSON.stringify(roster.map(a=>({buffs:[...a.buffs],events:a.gainEvents})))),c.expected,JSON.stringify(c.effect));
}
console.log({passed:true,originalFullCastCourses:fixture.courses.length,composedBuffServices:2,allCombatFamiliesQualified:false});
