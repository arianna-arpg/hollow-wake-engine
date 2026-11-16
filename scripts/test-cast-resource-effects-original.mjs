import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {CastResourceEffects} from '../dist/cast-resource-effects.js';
import {ChargeRuntime,createChargeState} from '../dist/charge-runtime.js';
import {sha256} from './reference-utils.mjs';
import path from 'node:path';import {pathToFileURL} from 'node:url';
import {buildCombatQueries} from './compile-combat-queries.mjs';import {readCatalogue} from './catalogue-tools.mjs';
import {StatRules} from '../dist/stat-rules.js';import {StatSheet} from '../dist/stats.js';
import {CastPreparation} from '../dist/cast-preparation.js';import {CastAftermath} from '../dist/cast-aftermath.js';import {CombatExecution} from '../dist/combat-execution.js';
import {DeliveryExecution} from '../dist/delivery-execution.js';import {AreaDeliveries} from '../dist/area-deliveries.js';import {DirectDeliveries} from '../dist/direct-deliveries.js';
import {CasterEffects} from '../dist/caster-effects.js';import {CastSelfEffects} from '../dist/cast-self-effects.js';
import {FieldAftermath} from '../dist/field-aftermath.js';

const probe=process.argv.includes('--probe');
const file=probe?'.artifacts/m3-cast-resource-effects-probe.json.gz':'baseline/cast-resource-effects/observations.json.gz';
const archive=fs.readFileSync(file),bytes=gunzipSync(archive);
if(!probe){
  const accepted=JSON.parse(fs.readFileSync('baseline/cast-resource-effects/acceptance.json'));
  assert(accepted.originalOnly);assert.equal(sha256(archive),accepted.compressedSha256);assert.equal(sha256(bytes),accepted.sha256);
}
const fixture=JSON.parse(bytes);assert(fixture.originalOnly);
const owned=fs.realpathSync('.artifacts'),work=fs.mkdtempSync(path.join(owned,'m3-composed-resources-owned-'));
try{
await buildCombatQueries(work);const {combatSkillQueries:q}=await import(pathToFileURL(path.join(work,'queries.mjs')).href);
const catalogue=readCatalogue(),table=name=>Object.fromEntries(catalogue.tables[name].map(row=>[row.id,row.value])),definitions=table('skills'),ruleRows=table('rules'),rules=new StatRules(table('stats'),ruleRows.statTrades);
const unused=()=>assert.fail('Unexpected service needed by composed resource course');
for(const {input,expected}of fixture.courses){
  const {initial,spec}=input;
  const skill=q.makeSkillInstance(definitions[input.skillId],4);skill.hostSkillId=input.hostSkillId;
  const host={def:{id:'m3-bank',useCharges:{max:4}}},still={def:{id:'m3-still',useCharges:{max:4,still:{bleed:1}}}};
  const banks=new Map(initial.banks.map(row=>[row.id,structuredClone(row.state)])),caps=new Map(initial.banks.map(row=>[row.id,row.cap]));
  const chargeState=createChargeState();chargeState.charges=new Map(initial.charges);
  for(const[id,drain]of initial.drains)chargeState.clocks.set(id,{idle:0,acc:0,tick:0,...(drain===null?{}:{drain})});
  const charges=new ChargeRuntime(chargeState,{definition:()=>undefined,definitions:()=>[],capacityBonus:()=>0,chargeCapacityBonus:()=>0,regenerationBonus:()=>0,
    skills:()=>[],taps:()=>[],socketTaps:()=>[],spentCharge:()=>undefined,toggled:()=>false,channelSkillId:()=>undefined,gaugeTerms:()=>({}),walked:()=>0,clearWalked(){},
    gainEventCount:()=>0,emitGainEvent(){},setSource(){},removeSource(){}});
  const actor={skills:[skill,host,still,...(spec.duplicate?[still]:[])],cooldowns:new Map(initial.cooldowns),totals:new Map(initial.totals),
    activeAuras:new Map([['m3-bank',{ledger:{balance:initial.ledger}}]]),casting:{inst:skill,mode:'channel',held:initial.held},
    skillChargeBank:s=>banks.get(s.def.id),skillChargeCap:s=>caps.get(s.def.id),
    gainCharge:(id,amount,max,s)=>charges.gain(id,amount,max,s),startChargeDrain:(id,perSecond)=>charges.startDrain(id,perSecond),
    id:1,pos:{x:0,y:0},facing:0,radius:12,tier:0,team:'player',kind:'player',dead:false,statuses:[],sheet:new StatSheet(rules)};
  const runtime=new CastResourceEffects({useCharges:s=>s.def.useCharges,refundCooldown(a,id){a.cooldowns.delete(id);a.totals.delete(id);},
    ammunitionCue(){},ledgerPaid(){},ledgerEmpty(){},cooldownsReduced(){}});
  const state={corpses:[],pendingSteps:[],pendingRepeats:[],zones:[],remnants:[]};
  const preparation=new CastPreparation(state,{empower:{},corpseAreaPerExtra:.12,cosmetic:{}},{...q,random:unused,prepareChallenge:(_a,i)=>i,prepareAttack:(_a,i)=>i,cosmetic:()=>({}),castObserved(){},denseCount:()=>0,
    guardCast(){},payloadTransition:()=>undefined,stampSkillCooldown:unused,failNote:unused});
  const direct=new DirectDeliveries({arrive(){},rite:()=>false,effects:q.instanceEffects,selfRelease(){},statusDuration:unused});
  const fields=new FieldAftermath(state,{...q,time:()=>0,random:unused,instanceDelivery:q.instanceDelivery,skillBurstVoice:()=>undefined,skillStrikeVoice:()=>undefined,skillMovementVoice:()=>undefined,skillPresenceVoice:()=>undefined,maddenBankOf:()=>undefined});
  const area=new AreaDeliveries({actors:()=>[actor],enemiesOf:()=>[],projectiles:()=>[],assaultLocked:()=>undefined,resolveHit:unused,nearestBody:unused,noteBodyHit:unused,inAoeBody:unused,
    zone:z=>state.zones.push(z),flash(){},releaseStruckSummons(){},skillStrikeVoice:()=>undefined,skillBurstVoice:()=>undefined,skillBeamVoice:()=>undefined,skillSelfVoice:()=>undefined,skillContextTags:q.skillContextTags,
    mintAftermath:(...args)=>fields.mintAftermath(...args),healAlliesInArea(){},frontSplash(){},strikeSurfaces(){},skillOcclusion:()=> 'free',lineOfFire:()=>true,clipShot:(_from,to)=>to,spawnAftershocks(){}});
  const deliveries=new DeliveryExecution({direct,area},q.instanceTargeting),caster=new CasterEffects({resource:runtime,self:new CastSelfEffects({})},{});
  const aftermath=new CastAftermath(state,{unleashInterval:1,elements:[]},{...q,time:()=>0,random:unused,presenceMoment(){}});
  const execution=new CombatExecution(.1,{preparation,deliveries,caster,aftermath,effects:q.instanceEffects,linger:(...args)=>fields.dropLingerField(...args)});
  assert(execution.execute(actor,skill,{x:40,y:0},{noRepeat:true,noCooldown:true}));
  const actual={cooldowns:[...actor.cooldowns],totals:[...actor.totals],banks:[host,still].map(s=>({id:s.def.id,cap:caps.get(s.def.id),state:banks.get(s.def.id)})),
    ledger:actor.activeAuras.get('m3-bank').ledger.balance,charges:[...chargeState.charges],drains:[...chargeState.clocks].map(([id,s])=>[id,s.drain??null]),held:actor.casting.held};
  assert.deepEqual(actual,expected,JSON.stringify(spec));
}
console.log({passed:true,originalFullCastCourses:fixture.courses.length,composedExecution:true,compiledAuthoredQueries:true,composedResourceRuntimes:2,allCombatFamiliesQualified:false});
}finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,maxRetries:3});}
