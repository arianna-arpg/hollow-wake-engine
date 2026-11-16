import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {FieldAftermath} from '../dist/field-aftermath.js';import {StatSheet} from '../dist/stats.js';import {StatRules} from '../dist/stat-rules.js';import {sha256} from './reference-utils.mjs';import {buildCombatQueries} from './compile-combat-queries.mjs';import {readCatalogue} from './catalogue-tools.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-field-aftermath-probe.json.gz':'baseline/field-aftermath/observations.json.gz'),bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const a=JSON.parse(fs.readFileSync('baseline/field-aftermath/acceptance.json'));assert.equal(sha256(archive),a.compressedSha256);assert.equal(sha256(bytes),a.sha256);}
const plain=value=>JSON.parse(JSON.stringify(value,(key,v)=>key==='caster'?v.id:key==='inst'?v.def.id:v instanceof Map?[...v]:v instanceof Set?[...v]:typeof v==='number'&&!Number.isFinite(v)?String(v):v));
const owned=fs.realpathSync('.artifacts'),work=fs.mkdtempSync(path.join(owned,'m3-field-aftermath-owned-'));
try{await buildCombatQueries(work);const {combatSkillQueries:q}=await import(pathToFileURL(path.join(work,'queries.mjs')).href),catalogue=readCatalogue(),table=name=>Object.fromEntries(catalogue.tables[name].map(r=>[r.id,r.value])),rules=new StatRules(table('stats'),table('rules').statTrades);
  for(const c of fixture.courses){const state={zones:[]},a={id:c.casterId,pos:{x:800,y:600},facing:.3,radius:12,tier:0,sheet:new StatSheet(rules)},i=q.makeSkillInstance(c.definition,1);i.sockets=c.sockets;for(const[k,v]of Object.entries(c.stats))a.sheet.setBase(k,v);let draw=0;
    const runtime=new FieldAftermath(state,{...q,time:()=>4,random:()=>{assert(draw<c.draws.length);return c.draws[draw++];},clampPos:p=>p,maddenBankOf:()=>undefined,skillBurstVoice:()=>undefined,skillStrikeVoice:()=>undefined,skillMovementVoice:()=>undefined,skillPresenceVoice:()=>undefined});
    const at={x:840,y:620};if(c.method==='mintAftermath')runtime.mintAftermath(a,i,at,30,0,.3,1.5,q.skillContextTags(i),q.instanceMods(i),1,.2,.7);
    else if(c.method==='dropLingerField')runtime.dropLingerField(a,i,at,1.5);else if(c.method==='mintTrailPatch')runtime.mintTrailPatch(a,i,c.trail,at,.3);
    else runtime.layFissure(a,i,at,.3,i.def.delivery,1.5,{fire:2},c.branches,c.fan);
    assert.deepEqual(plain(state.zones),c.zones,c.name);assert.equal(draw,c.draws.length,c.name+': RNG');
  }console.log({passed:true,originalSecondaryFieldCourses:fixture.courses.length,composedStatAndSkillQueries:true,allCombatFamiliesQualified:false});
}finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,maxRetries:3});}
