// Unaccepted investigation. Run only in a reconstructed original or retained adapter.
// State injections are explicit inputs; no SDK implementation is imported here.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {Actor} from '../src/engine/actor';
import {mod} from '../src/engine/stats';
import {makeSkillInstance,instanceGates,REFLEX_CFG} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {seedGlobalRandom} from '../src/sim/rng';
bootSimEngine();
type Case={name:string;skill?:string;definition?:any;state?:any;instanceState?:any;stat?:Record<string,number>;maps?:Record<string,any[]>;sets?:Record<string,string[]>;casting?:string;hostMatch?:boolean;support?:any;gateOnly?:boolean;repeat?:number;expected?:boolean;contracts?:any[];reflexPolicy?:Record<string,boolean>;afterFirst?:{state?:any;stat?:Record<string,number>;definition?:any;clearGate?:true;expected:boolean}};
const cases:Case[]=[
 {name:'replenishing-summon-never-hand-casts',skill:'summon_fire_golem',definition:{delivery:{...SKILLS.summon_fire_golem.delivery,replenish:{interval:1}}},expected:false},
 {name:'socket-grant-is-not-implicit-status-context',support:{grantsTags:['attack']},state:{statuses:[{id:'disarm',remaining:1}]},expected:true},
 {name:'native-context-attack-is-forbidden',definition:{tags:['spell','attack']},state:{statuses:[{id:'disarm',remaining:1}]},expected:false},
 {name:'reflex-live-policy-closes-cast',skill:'life_flask',casting:'cast',state:{life:80},maps:{charges:[['flask_life',1]]},reflexPolicy:{cast:false},expected:false},
 {name:'reflex-live-policy-opens-stun',skill:'life_flask',state:{life:80,statuses:[{id:'stun',remaining:1}]},maps:{charges:[['flask_life',1]]},reflexPolicy:{stun:true},expected:true},
 {name:'reflex-unlisted-mode-defaults-open',skill:'life_flask',casting:'future-mode',state:{life:80},maps:{charges:[['flask_life',1]]},expected:true},
 {name:'reflex-channel-definition-excluded',skill:'life_flask',definition:{channel:{interval:1}},casting:'cast',state:{life:80},maps:{charges:[['flask_life',1]]},expected:false},
 {name:'reflex-concentration-definition-excluded',skill:'life_flask',definition:{concentration:{duration:1}},casting:'cast',state:{life:80},maps:{charges:[['flask_life',1]]},expected:false},
 {name:'charge-gate-empty',definition:{gate:{charge:{id:'investigation',amount:2}}},expected:false},
 {name:'charge-gate-exact',definition:{gate:{charge:{id:'investigation',amount:2}}},maps:{charges:[['investigation',2]]},expected:true},
 {name:'buff-gate-empty',definition:{gate:{buff:'investigation'}},expected:false},
 {name:'buff-gate-present',definition:{gate:{buff:'investigation'}},maps:{buffs:[['investigation',{}]]},expected:true},
 {name:'active-gate-empty',definition:{gate:{active:'investigation'}},expected:false},
 {name:'active-gate-aura',definition:{gate:{active:'investigation'}},maps:{activeAuras:[['investigation',{}]]},expected:true},
 {name:'active-gate-summon',definition:{gate:{active:'investigation'}},maps:{summonToggles:[['investigation',{}]]},expected:true},
 {name:'any-thirst-ignores-missing-shield',definition:{gate:{missing:{kind:'any'}}},state:{es:0},expected:false},
 {name:'any-thirst-mana-dent-admits',definition:{gate:{missing:{kind:'any'}}},state:{mana:99},expected:true},
 {name:'any-prime-demands-both-pools-full',skill:'life_flask',definition:{gate:{missing:{kind:'any',pct:.2}}},stat:{pourPrime:1},state:{mana:95},maps:{charges:[['flask_life',1]]},expected:false},
 {name:'any-prime-both-full-admits',skill:'life_flask',definition:{gate:{missing:{kind:'any',pct:.2}}},stat:{pourPrime:1},maps:{charges:[['flask_life',1]]},expected:true},
 {name:'prime-needs-pour-effect',definition:{gate:{missing:{kind:'life'}},useTime:0},stat:{pourPrime:1},expected:false},
 {name:'prime-needs-instant-use',skill:'life_flask',definition:{useTime:.1},stat:{pourPrime:1},maps:{charges:[['flask_life',1]]},expected:false},
 {name:'gather-concentration-excluded',definition:{concentration:{duration:1}},maps:{cooldowns:[['ruin',1]],brims:[['ruin',{fill:1}]]},support:{gather:{premium:1.5,releaseOnCooldown:true,minRelease:.15}},expected:false},
 {name:'status-forbids-before-bank',skill:'scattergun',state:{statuses:[{id:'disarm',remaining:1}]},expected:false},
 {name:'unregistered-status-does-not-forbid',skill:'scattergun',state:{statuses:[{id:'investigation-missing',remaining:1}]},expected:true},
 {name:'silence-refuses-spell',state:{statuses:[{id:'silence',remaining:1}]},expected:false},
 {name:'silence-allows-attack',skill:'scattergun',state:{statuses:[{id:'silence',remaining:1}]},expected:true},
 {name:'reflex-stun-still-refuses',skill:'life_flask',state:{life:80,statuses:[{id:'stun',remaining:1}]},maps:{charges:[['flask_life',1]]},expected:false},
 {name:'reflex-dash-open',skill:'life_flask',state:{life:80,dash:{}},maps:{charges:[['flask_life',1]]},expected:true},
 {name:'reflex-body-recovery-open',skill:'life_flask',state:{life:80,useLock:1},maps:{charges:[['flask_life',1]]},expected:true},
 {name:'held-combo-body-recovery-closed',casting:'guard',definition:{useTime:0,usableWhileGuarding:true},state:{useLock:1},expected:false},
 {name:'held-combo-cast-time-closed',casting:'guard',definition:{useTime:.01,usableWhileGuarding:true},expected:false},
 {name:'guard-graft-admits-around-held-channel',casting:'channel',definition:{useTime:0},support:{guardCast:true},expected:true},
 {name:'guard-graft-own-gate-refuses-held-channel',casting:'channel',definition:{useTime:0},support:{guardCast:true,gate:{guard:true}},expected:false},
 {name:'berserk-off-above-half',skill:'berserk',state:{life:50.001},maps:{activeAuras:[['berserk',{}]]},expected:false},
 {name:'berserk-off-exact-half',skill:'berserk',state:{life:50},maps:{activeAuras:[['berserk',{}]]},expected:true},
 {name:'reserve-missing-refuses',state:{reserveSpecs:[{id:'fuel',perCast:2}]},maps:{reserves:[]},expected:false},
 {name:'reserve-short-refuses',state:{reserveSpecs:[{id:'fuel',perCast:2}]},maps:{reserves:[['fuel',{cur:1,ventUntil:0}]]},expected:false},
 {name:'reserve-exact-admits',state:{reserveSpecs:[{id:'fuel',perCast:2}]},maps:{reserves:[['fuel',{cur:2,ventUntil:0}]]},expected:true},
 {name:'reserve-positive-vent-refuses',state:{reserveSpecs:[{id:'fuel',perCast:2}]},maps:{reserves:[['fuel',{cur:2,ventUntil:.001}]]},expected:false},
 {name:'reserve-zero-price-skips-missing-state',state:{reserveSpecs:[{id:'fuel',perCast:2,costs:{ruin:0}}]},maps:{reserves:[]},expected:true},
 {name:'reserve-negative-price-clamps-free',state:{reserveSpecs:[{id:'fuel',perCast:-2}]},maps:{reserves:[]},expected:true},
 {name:'gather-thin-bank-refuses-cooldown',maps:{cooldowns:[['ruin',1]],brims:[['ruin',{fill:.1499}]]},support:{gather:{premium:1.5,releaseOnCooldown:true,minRelease:.15}},expected:false},
 {name:'gather-exact-bank-bypasses-cooldown',maps:{cooldowns:[['ruin',1]],brims:[['ruin',{fill:.15}]]},support:{gather:{premium:1.5,releaseOnCooldown:true,minRelease:.15}},expected:true},
 {name:'gather-never-bypasses-recovery',maps:{cooldowns:[['ruin',1]],brims:[['ruin',{fill:1}]]},sets:{skillRecoveryLocks:['ruin']},support:{gather:{premium:1.5,releaseOnCooldown:true,minRelease:.15}},expected:false},
 {name:'gather-flick-too-short',definition:{useTime:.299},maps:{cooldowns:[['ruin',1]],brims:[['ruin',{fill:1}]]},support:{gather:{premium:1.5,releaseOnCooldown:true,minRelease:.15}},expected:false},
 {name:'gather-live-release-policy',maps:{cooldowns:[['ruin',1]],brims:[['ruin',{fill:1}]]},support:{gather:{premium:1.5,releaseOnCooldown:false,minRelease:.15}},expected:false},
 {name:'gauge-refusal-precedes-authored-gate',definition:{gauge:{need:10,unit:'sparks'},gate:{holding:true,note:'grip'}},gateOnly:true},
 {name:'gauge-funded-reaches-authored-gate',definition:{gauge:{need:10,unit:'sparks'},gate:{holding:true,note:'grip'}},instanceState:{gauge:10},gateOnly:true},
 {name:'gauge-lock-with-full-bank-does-not-block',definition:{gauge:{need:10,unit:'sparks'},gate:{holding:true,note:'grip'}},instanceState:{gauge:10,gaugeLock:1},gateOnly:true},
 {name:'gauge-empty-lock-note',definition:{gauge:{need:10,unit:'sparks'},gate:{holding:true,note:'grip'}},instanceState:{gauge:0,gaugeLock:1},gateOnly:true},
 {name:'life-reservation-is-not-thirst-ceiling',skill:'life_flask',state:{reservedLife:50,life:50},maps:{charges:[['flask_life',1]]},expected:true},
 {name:'mana-reservation-is-thirst-ceiling',skill:'mana_flask',state:{reservedMana:50,mana:50},maps:{charges:[['flask_mana',1]]},expected:false},
 {name:'prime-near-full-less-than-one',skill:'life_flask',state:{life:99.5},stat:{pourPrime:1},definition:{gate:{missing:{kind:'life',pct:.2}}},maps:{charges:[['flask_life',1]]},expected:true},
 {name:'prime-one-point-short-refuses',skill:'life_flask',state:{life:99},stat:{pourPrime:1},definition:{gate:{missing:{kind:'life',pct:.2}}},maps:{charges:[['flask_life',1]]},expected:false},
 {name:'live-gate-definition-changes',definition:{gate:{holding:true}},expected:false,repeat:2,afterFirst:{clearGate:true,expected:true}},
 {name:'live-thirstless-stat-changes',skill:'life_flask',maps:{charges:[['flask_life',1]]},expected:false,repeat:2,afterFirst:{stat:{thirstless:1},expected:true}},
 {name:'summon-reservation-exact',skill:'summon_fire_golem',state:{reservedMana:70},expected:true},
 {name:'summon-reservation-short',skill:'summon_fire_golem',state:{reservedMana:71},expected:false},
 {name:'summon-legacy-eviction-exemption',skill:'summon_fire_golem',state:{reservedMana:71,manaReserved:1},expected:true},
 {name:'summon-exclusive-rival-frees-reservation',skill:'summon_fire_golem',definition:{manaCost:0},state:{reservedMana:100,mana:0},contracts:[{skill:'summon_ice_golem',reserved:30,slots:1}],expected:true},
 {name:'summon-other-exclusive-does-not-free',skill:'summon_fire_golem',definition:{manaCost:0},state:{reservedMana:100,mana:0},contracts:[{skill:'summon_ice_golem',reserved:30,slots:1,delivery:{exclusiveGroup:'other',poolGroup:'other'}}],expected:false},
 {name:'summon-shared-pool-has-no-free-slot',skill:'summon_fire_golem',contracts:[{skill:'summon_ice_golem',reserved:30,slots:1,delivery:{exclusiveGroup:'other'}}],expected:false},
 {name:'summon-nontoggle-prices-one-slot',definition:{delivery:{type:'summon',monsterId:'fire_golem',count:1,maxActive:3,persistent:{reserve:40,respawnTime:6}}},state:{reservedMana:60},expected:true},
 {name:'summon-toggle-prices-whole-block',definition:{delivery:{type:'summon',monsterId:'fire_golem',count:1,maxActive:3,persistent:{reserve:40,respawnTime:6,toggle:true}}},expected:false},
 {name:'ready-native-ammunition-creates-bank',skill:'scattergun',repeat:2,expected:true},
 {name:'dead-refusal-does-not-create-bank',skill:'scattergun',state:{dead:true},expected:false},
 {name:'body-lock-refusal-does-not-create-bank',skill:'scattergun',state:{useLock:1},expected:false},
 {name:'cooldown-refusal-does-not-create-bank',skill:'scattergun',maps:{cooldowns:[['scattergun',1]]},expected:false},
 {name:'recovery-refusal-does-not-create-bank',skill:'scattergun',sets:{skillRecoveryLocks:['scattergun']},expected:false},
 {name:'unaffordable-refusal-still-creates-bank',skill:'scattergun',definition:{manaCost:101},state:{mana:0,es:0},expected:false},
 {name:'empty-bank-before-price',skill:'scattergun',maps:{skillChargeState:[['scattergun',{count:0,timer:0}]]},expected:false},
 {name:'fractional-positive-bank-admits',skill:'scattergun',maps:{skillChargeState:[['scattergun',{count:.25,timer:2}]]},expected:true},
 {name:'empower-dry-bypasses-bank',skill:'scattergun',definition:{useCharges:{max:3,empower:.2}},expected:true},
 {name:'vent-dry-bypasses-bank',skill:'scattergun',definition:{useCharges:{max:3,ventAll:true}},expected:true},
 {name:'toggle-off-bypasses-payment-and-gate',skill:'overclock',state:{mana:0},definition:{gate:{holding:true,note:'holding'}},maps:{activeAuras:[['overclock',{}]]},expected:true},
 {name:'toggle-off-still-obeys-cooldown',skill:'overclock',maps:{activeAuras:[['overclock',{}]],cooldowns:[['overclock',1]]},expected:false},
 {name:'toggle-off-debt-lock',skill:'overclock',state:{overdrive:{mana:{debt:1}}},maps:{activeAuras:[['overclock',{}]]},expected:false},
 {name:'toggle-off-zero-debt',skill:'overclock',state:{overdrive:{mana:{debt:0}}},maps:{activeAuras:[['overclock',{}]]},expected:true},
 {name:'summon-off-bypasses-unaffordable-price',definition:{delivery:{type:'summon',persistent:{toggle:true}},manaCost:200},maps:{summonToggles:[['ruin',{}]]},expected:true},
 {name:'strobe-off-bypasses-gate',definition:{delivery:{type:'ground',strobe:{}},gate:{holding:true}},maps:{strobes:[['ruin',{}]]},expected:true},
 {name:'holding-required',definition:{gate:{holding:true,note:'grip'}},expected:false},
 {name:'holding-present',definition:{gate:{holding:true,note:'grip'}},state:{gripping:{}},expected:true},
 {name:'guard-required-without-hold',definition:{requiresGuard:true},expected:false},
 {name:'invocation-empty',definition:{invokes:{}},expected:false},
 {name:'invocation-woven',definition:{invokes:{}},state:{runes:[{}]},expected:true},
 {name:'hard-charge-missing',definition:{chargeCost:{charge:'investigation',amount:2}},expected:false},
 {name:'hard-charge-exact',definition:{chargeCost:{charge:'investigation',amount:2}},maps:{charges:[['investigation',2]]},expected:true},
 {name:'minimum-with-zero-spend',definition:{chargeCost:{charge:'investigation',amount:0,minimum:3}},maps:{charges:[['investigation',2]]},expected:false},
 {name:'all-charge-default-floor',definition:{chargeCost:{charge:'investigation',amount:'all'}},maps:{charges:[['investigation',.5]]},expected:false},
 {name:'optional-charge-empty',definition:{chargeCost:{charge:'investigation',amount:'all',minimum:3,optional:true}},expected:true},
 {name:'pool-empty',definition:{pool:{id:'investigation',min:2}},expected:false},
 {name:'pool-exact',definition:{pool:{id:'investigation',min:2}},maps:{pools:[['investigation',2]]},expected:true},
 {name:'venting-pool-bypass',definition:{pool:{id:'investigation',min:2}},sets:{venting:['investigation']},expected:true},
 {name:'native-flask-reflex-midcast',skill:'life_flask',state:{life:80},casting:'cast',maps:{charges:[['flask_life',1]]},expected:true},
 {name:'native-flask-reflex-lock',skill:'life_flask',state:{life:80,reflexLock:1},casting:'cast',maps:{charges:[['flask_life',1]]},expected:false},
 {name:'native-flask-full-refusal',skill:'life_flask',maps:{charges:[['flask_life',1]]},expected:false},
 {name:'native-flask-prime-full',skill:'life_flask',stat:{pourPrime:1},maps:{charges:[['flask_life',1]]},expected:true},
 {name:'native-flask-prime-fractional-cap-floor',skill:'life_flask',stat:{pourPrime:.99},maps:{charges:[['flask_life',1]]},expected:false},
 {name:'native-flask-prime-cap-occupied',skill:'life_flask',stat:{pourPrime:1},state:{primedPours:[{}]},maps:{charges:[['flask_life',1]]},expected:false},
 {name:'native-flask-thirstless',skill:'life_flask',stat:{thirstless:1},maps:{charges:[['flask_life',1]]},expected:true},
 {name:'innate-before-support-gate',definition:{gate:{holding:true,note:'innate'}},support:{gate:{buff:'investigation',note:'support'}},gateOnly:true},
 {name:'support-gate-after-innate-passes',definition:{gate:{holding:true,note:'innate'}},state:{gripping:{}},support:{gate:{buff:'investigation',note:'support'}},gateOnly:true},
 {name:'recent-damage-inclusive',definition:{gate:{recentDamage:{within:3}}},state:{recentHurt:3},expected:true},
 {name:'recent-damage-expired',definition:{gate:{recentDamage:{within:3}}},state:{recentHurt:3.0001},expected:false},
];
for(const mode of ['cast','guard','channel','charge','overcharge']){
 cases.push({name:'guard-combo-'+mode,casting:mode,definition:{useTime:0,usableWhileGuarding:true},expected:mode!=='cast'});
 cases.push({name:'host-payload-'+mode,casting:mode,hostMatch:true,definition:{useTime:0},expected:mode!=='cast'});
}
for(const kind of ['life','mana','es','ward']){
 cases.push({name:'resource-floor-'+kind,definition:{gate:{resource:{kind,amount:20}}},state:{[kind]:19},expected:false});
 cases.push({name:'resource-exact-'+kind,definition:{gate:{resource:{kind,amount:20}}},state:{[kind]:20},expected:true});
}
for(const kind of ['life','mana','es','any']){
 cases.push({name:'missing-percent-'+kind,definition:{gate:{missing:{kind,pct:.2}}},state:{life:90,mana:90,es:55},expected:false});
}
const copied=(value:any):any=>JSON.parse(JSON.stringify(value));
function run(input:Case,index:number){
 const restore=seedGlobalRandom(300000+index);
 const originalReflex={...REFLEX_CFG.during};Object.assign(REFLEX_CFG.during,input.reflexPolicy);
 try{
  const a:any=new Actor('Admission investigation','player',{x:0,y:0});
  for(const[id,value]of Object.entries({life:100,mana:100,energyShield:60,esToMana:0,attackSpeed:1,castSpeed:1}))a.sheet.setBase(id,value);
  a.fillResources();
  const inst:any=makeSkillInstance({...SKILLS[input.skill??'ruin'],...input.definition},1,1);
  a.skills=[inst];
  if(input.instanceState)inst.state={...inst.state,...input.instanceState};
  Object.assign(a,input.state);
  for(const[id,entries]of Object.entries(input.maps??{}))a[id]=new Map(entries as any);
  for(const[id,entries]of Object.entries(input.sets??{}))a[id]=new Set(entries);
  for(const row of input.contracts??[]){const other=makeSkillInstance({...SKILLS[row.skill],delivery:{...SKILLS[row.skill].delivery,...row.delivery}},1,1);a.summonToggles.set(row.skill,{inst:other,reserved:row.reserved,slots:row.slots});}
  for(const[id,value]of Object.entries(input.stat??{}))a.sheet.setSource('investigation:'+id,[mod(id,'override',value)]);
  if(input.casting){a.casting={mode:input.casting,inst:makeSkillInstance(SKILLS.ruin,1,1)};if(input.hostMatch)inst.hostSkillId='ruin';}
  if(input.support)inst.sockets[0]={def:{id:'investigation',name:'Investigation',mods:[],...input.support},level:1};
  const authored=instanceGates(inst),trace:any[]=[];
  for(const name of ['tagsForbidden','canAct','isReflex','reflexOpen','gatherReleasable','skillUseTime','skillChargeBank','skillCost','canAfford','gatesMet','unmetGate','primedPourOpen','maxMana','maxLife','availableMaxMana','maxEs']){
   const original=a[name].bind(a);
   a[name]=(...args:any[])=>{trace.push(name);return original(...args);};
  }
  const snapshot=()=>copied({mana:a.mana,life:a.life,es:a.es,ward:a.ward,reservedMana:a.reservedMana,reservedLife:a.reservedLife,banks:[...a.skillChargeState],charges:[...a.charges],pools:[...a.pools],primed:a.primedPours.length});
  const steps:any[]=[];
  for(let n=0;n<(input.repeat??1);n++){
   if(n===1&&input.afterFirst){const changes=input.afterFirst;Object.assign(a,changes.state);if(changes.definition)inst.def={...inst.def,...changes.definition};if(changes.clearGate){inst.def={...inst.def};delete inst.def.gate;}for(const[id,value]of Object.entries(changes.stat??{}))a.sheet.setSource('investigation:'+id,[mod(id,'override',value)]);}
   const before=snapshot();trace.length=0;
   const value=input.gateOnly?a.unmetGate(inst):a.canUse(inst);
   const result=input.gateOnly?{gate:value,index:value===null?null:authored.indexOf(value)}:value;
   steps.push({before,result,trace:[...trace],after:snapshot()});
   const expected=n===1&&input.afterFirst?input.afterFirst.expected:input.expected;
   if(expected!==undefined)assert.equal(value,expected,input.name);
  }
  if(input.name==='ready-native-ammunition-creates-bank'){assert.equal(steps[0].before.banks.length,0);assert.equal(steps[0].after.banks[0][1].count,3);assert.deepEqual(steps[1].before,steps[1].after);}
  if(input.name.endsWith('does-not-create-bank'))assert.equal(steps[0].after.banks.length,0,input.name);
  if(input.name==='unaffordable-refusal-still-creates-bank')assert.equal(steps[0].after.banks.length,1);
  if(input.name==='innate-before-support-gate')assert.equal(steps[0].result.index,0);
  if(input.name==='support-gate-after-innate-passes')assert.equal(steps[0].result.index,1);
  if(input.name==='gauge-refusal-precedes-authored-gate'||input.name==='gauge-empty-lock-note')assert.equal(steps[0].result.index,-1);
  if(input.name==='gauge-funded-reaches-authored-gate'||input.name==='gauge-lock-with-full-bank-does-not-block')assert.equal(steps[0].result.index,0);
  if(input.name==='empower-dry-bypasses-bank'||input.name==='vent-dry-bypasses-bank')assert.equal(steps[0].after.banks.length,0);
  return {input,steps};
 }finally{for(const key of Object.keys(REFLEX_CFG.during))delete REFLEX_CFG.during[key];Object.assign(REFLEX_CFG.during,originalReflex);restore();}
}
const result={status:'investigation, not accepted',scope:'Actor admission with explicit native and synthetic definition/state inputs; instrumented original method entry order and lazy bank mutation. This is not World press/HUD authority, full delivery, or a benchmark.',cases:cases.map(run)};
fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('Investigated '+result.cases.length+' admission inputs and '+result.cases.reduce((n,c)=>n+c.steps.length,0)+' observations.');
