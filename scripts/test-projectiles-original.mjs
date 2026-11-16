import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {Projectiles} from '../dist/projectiles.js';import {StatSheet} from '../dist/stats.js';import {StatRules} from '../dist/stat-rules.js';import {createDamagePipeline} from '../dist/damage-pipeline.js';
import {projectileHost} from '../test/projectile-host.mjs';import {sha256} from './reference-utils.mjs';import {buildCombatQueries} from './compile-combat-queries.mjs';import {readCatalogue} from './catalogue-tools.mjs';
import {combatHitHost} from '../test/combat-hit-host.mjs';import {createStatusLifecycle,HOLLOW_WAKE_AILMENT_TUNING} from '../dist/status-lifecycle.js';
import {ChargeRuntime,createChargeState} from '../dist/charge-runtime.js';
const course=process.argv.includes('--combat')?'projectile-combat':'projectiles',probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?`.artifacts/m3-${course}-probe.json.gz`:`baseline/${course}/observations.json.gz`),bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const a=JSON.parse(fs.readFileSync(`baseline/${course}/acceptance.json`));assert.equal(sha256(archive),a.compressedSha256);assert.equal(sha256(bytes),a.sha256);}
function plain(value){return JSON.parse(JSON.stringify(value,(k,v)=>k==='caster'||k==='anchor'&&v?.id!==undefined?v?.id:k==='inst'||k==='emitInst'?v?.def.id:v instanceof Map?[...v]:v instanceof Set?[...v]:typeof v==='number'&&!Number.isFinite(v)?String(v):v));}
const owned=fs.realpathSync('.artifacts'),work=fs.mkdtempSync(path.join(owned,'m3-projectiles-owned-'));
try{await buildCombatQueries(work);const {combatSkillQueries:q}=await import(pathToFileURL(path.join(work,'queries.mjs')).href),catalogue=readCatalogue(),table=name=>Object.fromEntries(catalogue.tables[name].map(r=>[r.id,r.value]));
  const definitions=table('skills'),statusDefinitions=table('statuses'),rules=new StatRules(table('stats'),table('rules').statTrades);
  for(const c of fixture.courses){const h=projectileHost(),hits=combatHitHost();h.actors.length=0;hits.actors.length=0;let draw=0,hit=0,now=0;
    const random=()=>{assert(draw<c.draws.length,c.name+': exhausted RNG at '+draw);return c.draws[draw++];};
    const lifecycle=createStatusLifecycle({definition:id=>statusDefinitions[id],random,skillContextTags:q.skillContextTags,relayIds:[],popCue(){}});
    for(const initial of c.initial){const a=Object.assign(hits.make(initial.id,initial.team),initial,{sheet:new StatSheet(rules),dead:false,hitFlash:0,statuses:[],activeAuras:new Map(),absorbLayers:new Map(),restoreStreams:[],gainEvents:[],ward:0,absorb:0,insight:0,endurance:0,aiNerve:1,level:1});
      Object.assign(a,{lastCombatAt:-1,aiHitAt:-1,aiHitById:-1,lastFoeAt:-1,lastFoeId:-1,recentHurt:999});
      a.stanceRead=()=>undefined;a.maxLife=()=>a.sheet.get('life');a.availableMaxMana=()=>a.sheet.get('mana');a.maxPoise=()=>a.sheet.get('poise');a.effectiveWeight=()=>1;a.insightMomentum=()=>0;a.damagePoise=()=>false;a.ledgerCap=()=>0;a.staggerDamage=()=>assert.fail('unexpected stagger');Object.defineProperty(a,'absorbTotal',{get:()=>0});h.actors.push(a);}
    const a=h.actors[0];a.aimPos={x:850,y:640};for(const[k,v]of Object.entries(c.stats))a.sheet.setBase(k,v);const i=q.makeSkillInstance(c.definition,1);
    for(const spec of c.actorStats??[])h.actors.find(a=>a.id===spec.id).sheet.setBase('life',spec.life);
    const damage=createDamagePipeline({...q,random,travelProtected:()=>false,weakPointBonus:()=>0,plyFloor:()=>0,dominantType:amounts=>Object.keys(amounts).sort((x,y)=>amounts[y]-amounts[x])[0],stampSegment(){},feedWound:()=>false,resourceFlow(){},boundToAbsorb:()=>false});
    for(const body of h.actors){body.applyStatus=(...args)=>lifecycle.applyStatus(body,...args);body.skills=body===a?[i]:[];body.lifeCeiling=body.maxLife;body.maxMana=body.availableMaxMana;
      const state=createChargeState();body.charges=state.charges;const charge=new ChargeRuntime(state,{definition:id=>q.chargeDefinitions[id],definitions:()=>Object.entries(q.chargeDefinitions),
        capacityBonus:inst=>body.sheet.get('chargeCap',inst?q.skillContextTags(inst):undefined,inst?q.instanceMods(inst):undefined),chargeCapacityBonus:id=>body.sheet.get('chargeCap_'+id),regenerationBonus:id=>body.sheet.get('chargeRegen_'+id),
        skills:()=>body.skills,taps:q.instanceChargeGain,socketTaps:q.hostSockets,spentCharge:inst=>q.instanceChargeCost(inst)?.charge,toggled:()=>false,channelSkillId:()=>undefined,gaugeTerms:()=>({}),walked:()=>0,clearWalked(){},
        gainEventCount:()=>body.gainEvents.length,emitGainEvent:(id,n,inst,depth)=>body.gainEvents.push({kind:'charge',id,depth,n,tags:inst?.def.tags}),setSource:(id,mods)=>body.sheet.setSource(id,mods),removeSource:id=>body.sheet.removeSource(id)});
      body.gainCharge=(...args)=>charge.gain(...args);body.spendCharge=(...args)=>charge.spend(...args);
    }
    for(const ports of Object.values(hits.input))Object.assign(ports,{time:()=>now,random,chance:p=>random()<p,actors:()=>h.actors});
    Object.assign(hits.input.damage,q,{plyFloor:()=>0});
    Object.assign(hits.input.preparation,{fuse:q.instanceFuse,instanceTags:inst=>q.skillContextTags(inst,q.grantedTags(inst)),definitionTags:q.skillContextTags,modifiers:q.instanceMods});
    Object.assign(hits.input.sustain,{tags:q.skillContextTags});
    Object.assign(hits.input.reactions,{tags:q.skillContextTags,instanceMods:q.instanceMods,woundSearchSeconds:6,damageCue:()=>{random();}});
    Object.assign(hits.input.statuses,{definition:id=>statusDefinitions[id],statusIds:()=>Object.keys(statusDefinitions),tuning:id=>HOLLOW_WAKE_AILMENT_TUNING[id],skillContextTags:q.skillContextTags,instanceBrood:q.instanceBrood});
    Object.assign(hits.input.effects,{effects:q.instanceEffects});
    Object.assign(hits.input.aftermath,{contextTags:q.skillContextTags,sockets:q.hostSockets,instanceTrigger:q.instanceTrigger,chargeGains:q.instanceChargeGain,spreadOnHit:inst=>q.socketSpec(inst,'spreadOnHit'),curseOnHit:inst=>q.socketSpec(inst,'curseOnHit'),dominate:inst=>q.socketSpec(inst,'dominate')});
    const pipeline=hits.create();
    Object.assign(h.ports,q,{time:()=>now,random,arena:()=>({w:1600,h:1200}),cosmetic:()=>({}),skill:id=>definitions[id]??(id===i.def.id?i.def:undefined),makeSkill:q.makeSkillInstance,
      applyConversion:damage.applyConversion,rollSkillDamage:damage.rollSkillDamage,mitigateTyped:damage.mitigateTyped,
      resolveHit:(...args)=>{const expected=c.hits[hit++];assert(expected,c.name+': unexpected contact');assert.deepEqual(args.map((arg,n)=>n===0||n===2?arg.id:n===1?arg.def.id:plain(arg??null)),expected.args,c.name+': contact');assert.equal(draw,expected.before,c.name+': pre-contact draw');pipeline.resolve(...args);assert.equal(draw,expected.after,c.name+': post-contact draw');assert.equal(args[2].hitFlashType,expected.hitFlashType,c.name+': hit tone');}});
    const runtime=new Projectiles(h.state,fixture.rules,h.ports);runtime.spawnProjectile(a,i,a.pos,0,{mult:1.5,flat:{fire:2},dest:c.dest,patrol:c.patrol});
    for(const [index,step]of c.steps.entries()){if(step.dt){now+=step.dt;runtime.updateProjectiles(step.dt);}assert.deepEqual(plain(h.state.projectiles),step.projectiles,c.name+': flights '+index);assert.deepEqual(plain(h.state.zones),step.zones,c.name+': fields '+index);assert.equal(draw,step.drawEnd,c.name+': RNG '+index);
      if(step.combat)assert.deepEqual(plain(h.actors.map(b=>({id:b.id,life:b.life,mana:b.mana,es:b.es,poise:b.poise,hitFlash:b.hitFlash,hitFlashType:b.hitFlashType,statuses:plain(b.statuses),charges:plain(b.charges),gainEvents:plain(b.gainEvents),lastCombatAt:b.lastCombatAt,aiHitAt:b.aiHitAt,aiHitById:b.aiHitById,lastFoeAt:b.lastFoeAt,lastFoeId:b.lastFoeId,alertUntil:b.alertUntil,alertFrom:b.alertFrom,alertTier:b.alertTier,recentHurt:b.recentHurt,esDelay:b.esDelay,esRecharging:b.esRecharging,esBroke:b.esBroke,evadeEntropy:b.evadeEntropy,plies:b.plies,dead:b.dead}))),step.combat,c.name+': combat '+index);
    }
    assert.equal(hit,c.hits.length,c.name+': contacts');
  }
  console.log({passed:true,course,originalProjectileCourses:fixture.courses.length,transitions:fixture.courses.reduce((n,c)=>n+c.steps.length,0),composedStatAndDamageQueries:true,contactPipelineExecuted:true,combatStateCompared:course==='projectile-combat',fullHitPipelineQualified:false,allCombatFamiliesQualified:false});
}finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,maxRetries:3});}
