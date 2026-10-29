// Original implementation observer. Expected observations must be frozen before extraction.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {Actor} from '../src/engine/actor';
import {StatSheet, DAMAGE_TYPES, type SkillTag} from '../src/engine/stats';
import {SKILLS} from '../src/data/skills';
import {makeSkillInstance} from '../src/engine/skills';
import {STATUS_DEFS} from '../src/engine/status';
import {SIM_TAP} from '../src/engine/tap';
import {mulberry32} from '../src/sim/rng';
import * as damage from '../src/engine/damage';
import {spendAbsorbLayers, tickAbsorbLayers, skillAbsorbAmount} from '../src/engine/absorb';
import {receiveDamageAs} from '../src/engine/reception';

bootSimEngine();
type Setup = (a: Actor, b: Actor, events: unknown[]) => void;
type Run = (a: Actor, b: Actor) => unknown;
const rows: unknown[] = [];
const previousRandom = Math.random, previousTap = SIM_TAP.current;
const fields = ['life','mana','es','ward','absorb','poise','poiseBroken','poiseJustBroke','poiseDelay',
  'insight','endurance','enduranceDelay','esDelay','esRecharging','esBroke','evadeEntropy','evadeWindow',
  'plies','hitFlash','hitFlashType','lastGaspCd','lastGaspSpan','gasped','dead','invulnerable','downed',
  'stagger','segHitPending','segTears','restoreStreams','gainEvents','healedSince','statuses','since'];
function plain(value: any): any {
  if (value === undefined) return {$undefined:true};
  if (typeof value === 'number' && !Number.isFinite(value)) return {$number:String(value)};
  if (Object.is(value,-0)) return {$number:'-0'};
  if (value instanceof Actor) return {$actor:value.name};
  if (value instanceof Set) return {$set:[...value].map(plain)};
  if (value instanceof Map) return {$map:[...value].map(([k,v])=>[plain(k),plain(v)])};
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value as any).map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,plain(v)]));
  if (typeof value === 'function') return {$callback:true};
  return value;
}
const state = (a:Actor) => plain({...Object.fromEntries(fields.map(k=>[k,(a as any)[k]])),
  absorbLayers:[...a.absorbLayers].map(([key,v])=>({key,amount:v.amount,remaining:v.remaining,source:v.source.def.id})),
  ledgers:[...a.activeAuras].map(([key,v])=>({key,ledger:v.ledger})),absorbTotal:a.absorbTotal,
  segment:a.worm?{flash:a.worm.flash,woundHp:a.worm.woundHp,wounded:a.worm.wounded}:undefined});
const base = (a:Actor, values:Record<string,number>) => {for(const [key,v] of Object.entries(values)) a.sheet.setBase(key,v);};
const packet = (amount=80,tags:SkillTag[]=['spell'],crit=false):damage.DamagePacket => ({amounts:{physical:amount*.4,fire:amount*.6},tags:new Set(tags),crit,sourceName:'observed'});
const hit:Run = (a,b) => {const p=packet();return {result:damage.applyHit(a,b,p),packet:p};};
function course(name:string,setup:Setup,run:Run=hit,seed=701) {
  const a=new Actor('attacker','player',{x:0,y:0}),b=new Actor('defender','enemy',{x:10,y:0});
  a.id=101;b.id=102;
  for(const actor of [a,b]){actor.sheet=new StatSheet();base(actor,{life:200,mana:100});actor.life=150;actor.mana=60;}
  const events:unknown[]=[], draws:number[]=[]; setup(a,b,events);
  const before=[state(a),state(b)];
  for(const actor of [a,b]) {
    const get=actor.sheet.get.bind(actor.sheet);
    actor.sheet.get=(...args:Parameters<typeof get>)=>{const result=get(...args);events.push({kind:'stat',actor:actor.name,args:plain(args),result:plain(result)});return result;};
    for(const name of ['damagePoise','applyStatus','healBy','gainWard','gainEs','gainPoise','staggerDamage','assaultPlyBreak'] as const){
      const original=(actor as any)[name];if(typeof original!=='function')continue;
      (actor as any)[name]=(...args:unknown[])=>{events.push({kind:name,actor:actor.name,args:plain(args),before:state(actor)});
        const result=original.apply(actor,args);events.push({kind:name+'-return',actor:actor.name,result:plain(result),after:state(actor)});return result;};
    }
  }
  const next=mulberry32(seed); Math.random=()=>{const n=next();draws.push(n);events.push({kind:'random',value:n});return n;};
  SIM_TAP.current={onHit:(a,b,result,p)=>events.push({kind:'hit',attacker:plain(a),target:plain(b),result:plain(result),packet:plain(p),state:state(b)}),
    onDot:(a,n,t)=>events.push({kind:'dot',target:plain(a),amount:n,type:plain(t),state:state(a)}),
    onHeal:(a,n)=>events.push({kind:'heal-tap',actor:plain(a),amount:n})};
  let result:unknown,error:unknown;
  try{result=run(a,b);}catch(e){error=e instanceof Error?{name:e.name,message:e.message}:String(e);}
  rows.push({name,seed,before,result:plain(result),error:plain(error),after:[state(a),state(b)],draws,events});
  Math.random=previousRandom;SIM_TAP.current=previousTap;
}
const noSetup:Setup=()=>{};
try {
  course('ordinary',noSetup);
  course('invulnerable',(_,b)=>{b.invulnerable=true;b.segHitPending=2;});
  for(const blocked of [false,true]) course('segment-wound-'+blocked,(_,b)=>{
    b.segHitPending=1;b.worm={hittable:true,wounds:{frac:.1}} as any;if(blocked)base(b,{blockChance:1,blockPower:.1});});
  for(const active of [false,true]) course('weak-point-'+active,(_,b)=>{
    const row=Object.entries(STATUS_DEFS).find(([,s])=>s.weakSpot);assert(row,'loaded weak point');
    b.statuses.push({id:row[0],stacks:1,remaining:2,power:1,window:{lo:active?.5:.1,hi:active?1:.2}} as any);});
  course('hit-immune',(_,b)=>base(b,{hitImmune:1}));
  course('guaranteed-bypasses-hit-immune',(_,b)=>base(b,{hitImmune:1,areaAvoidance:1,evasion:99999}),
    (a,b)=>{const p=packet(80,['attack','aoe']);p.assaultGuaranteed=true;return damage.applyHit(a,b,p);});
  for(const rate of [0,.4,1]) course('area-avoidance-'+rate,(_,b)=>base(b,{areaAvoidance:rate}),
    (a,b)=>damage.applyHit(a,b,packet(80,['spell','aoe'])));
  for(const evasion of [0,400,50000]) course('attack-entropy-'+evasion,(a,b)=>{base(a,{accuracy:100});base(b,{evasion});},
    (a,b)=>Array.from({length:12},()=>damage.applyHit(a,b,packet(1,['attack']))));
  course('attack-entropy-existing',(a,b)=>{base(a,{accuracy:100});base(b,{evasion:500});b.evadeWindow=2;b.evadeEntropy=.6;},
    (a,b)=>damage.applyHit(a,b,packet(80,['attack'])));
  for(const power of [0,.25,1]) for(const value of [0,200]) course(`block-${power}-${value}`,(_,b)=>base(b,{blockChance:1,blockPower:power,blockValue:value}));
  course('block-layer-order',(_,b)=>{base(b,{blockChance:1,blockPower:1,blockValue:5,armor:600,fireRes:.5,ward:0,hitCap:4,poise:20,poiseDR:.3});b.ward=3;b.poise=20;});
  course('crit-avoidance',(a,b)=>{base(a,{critMulti:2});base(b,{critAvoid:1});},(a,b)=>{const p=packet(100,['spell'],true);return {result:damage.applyHit(a,b,p),packet:p};});
  course('crit-avoidance-low-multiplier',(a,b)=>{base(a,{critMulti:1});base(b,{critAvoid:1});},(a,b)=>{const p=packet(100,['spell'],true);return {result:damage.applyHit(a,b,p),packet:p};});
  course('damage-immunity-still-consumes-ply',(_,b)=>{base(b,{damageImmunity:1});b.plies=2;b.plySpec={count:2,floor:0};});
  for(const type of DAMAGE_TYPES) for(const res of [-.5,.5,1.5]) course(`resist-${type}-${res}`,(a,b)=>{
    base(a,{[type+'Pen']:.3});base(b,{[type+'Res']:res,[type+'ResMax']:.8});},(a,b)=>damage.resistValue(b,type,{attacker:a}));
  course('penetration-floor',(a,b)=>{base(a,{firePen:3});base(b,{fireRes:.5,fireResMax:.8});},(a,b)=>damage.resistValue(b,'fire',{attacker:a}));
  course('armor-floor',(a,b)=>{base(a,{armorPen:.2,armorDamageFloor:.4});base(b,{armor:10000});},
    (a,b)=>damage.mitigateTyped(b,{physical:100},{attacker:a,armorDamageFloor:.3}));
  course('all-slayer-conditions',(a,b)=>{base(a,{weight:1,overmatch:.1,giantsbane:.2,regicide:.3,limbreaver:.4,siegebreaker:.5,spentbane:.6,uprooter:.7,bondbreaker:.8,quailbane:.9});base(b,{weight:10});
    Object.assign(b,{level:20,rarity:'rare',partLink:{},stationary:true,spent:true,rootedSpec:{},rootedHeld:false,bondHeld:true,aiNerve:.1});});
  for(const momentum of [0,.5,1]) course('insight-'+momentum,(a,b)=>{base(a,{insightPen:.2});base(b,{insightDR:.4,insightEfficiency:2});b.insight=10;b.insightMomentum=()=>momentum;});
  for(const pool of [0,1,20]) course('poise-'+pool,(_,b)=>{base(b,{poise:20,poiseDR:.4});b.poise=pool;});
  course('poise-already-broken',(_,b)=>{base(b,{poise:20,poiseDR:.4});b.poise=10;b.poiseBroken=true;});
  course('endurance',(_,b)=>{base(b,{enduranceDR:.5,enduranceRegenDelay:3});b.endurance=10;});
  course('ledger-before-soak',(_,b)=>{const inst=makeSkillInstance(SKILLS.firebolt);(inst.def as any)={...inst.def,delivery:{type:'aura',ledger:{source:'damageTaken',rate:.5}}};
    b.activeAuras.set('observed',{inst,ledger:{balance:2}} as any);b.ledgerCap=()=>30;b.ward=10;});
  const layers=(b:Actor,events:unknown[])=>{for(const [key,amount] of [['first',10],['second',20]] as const)b.absorbLayers.set(key,{amount,remaining:2,source:makeSkillInstance(SKILLS.firebolt),ended:reason=>events.push({kind:'layer-ended',key,reason,state:state(b)})});};
  course('soak-chain',(_,b,e)=>{base(b,{energyShield:40,manaShield:.5,staggerFrac:.25});b.ward=5;layers(b,e);b.absorb=3;b.es=7;});
  course('bound-absorb-statuses',(_,b,e)=>{layers(b,e);for(const [id,s] of Object.entries(STATUS_DEFS).filter(([,s])=>s.boundToAbsorb)){b.statuses.push({id,remaining:10,stacks:1,power:1} as any);b.sheet.setSource('status:'+id,s.mods??[]);}});
  for(const shred of [.1,1,3]) course('shield-shred-'+shred,(a,b)=>{base(a,{esShred:shred});base(b,{energyShield:100});b.es=50;});
  course('steadfast-shield',(_,b)=>{base(b,{energyShield:100,esRechargeSteadfast:1});b.es=50;b.esRecharging=true;});
  course('hit-cap',(_,b)=>base(b,{hitCap:5}));
  for(const floor of [1,100]) course('ply-floor-'+floor,(a,b,e)=>{base(a,{plyRend:1.9});b.plies=2;b.plySpec={count:2,floor,spentStatus:'stunned'};b.assaultPlyBreak=()=>e.push({kind:'ply-break',plies:b.plies});});
  course('block-ply',(_,b)=>{base(b,{blockChance:1,blockPower:.2});b.plies=1;b.plySpec={count:1,floor:1};});
  course('last-gasp',(_,b)=>{base(b,{lastGasp:1,lastGaspLife:.1,lastGaspCooldown:3});b.life=10;});
  course('last-gasp-cooldown',(_,b)=>{base(b,{lastGasp:1});b.life=10;b.lastGaspCd=1;});
  course('overkill',(_,b)=>{b.life=10;});
  course('recuperate-and-cull',(a,b)=>{base(a,{cullThreshold:.5});base(b,{recuperate:.3,recuperateTime:2});});
  course('all-sustain',(a)=>{base(a,{lifeOnHit:4,lifeLeech:.2,wardLeech:.3,esOnHit:2,esLeech:.2,manaLeech:.5,poiseOnHit:5,energyShield:100,poise:100});});
  course('dead-attacker-no-sustain',a=>{a.dead=true;base(a,{lifeLeech:1});});
  course('status-and-taunt',(a,b)=>{base(a,{damageVs_burning:.2});b.statuses.push({id:'burning',stacks:2,remaining:2,power:1} as any);a.statuses.push({id:'taunted',casterId:999,stacks:1,remaining:2,power:1} as any);});
  for(const operation of ['dot','life'] as const) for(const amount of [-1,0,5,100,300]) course(`${operation}-${amount}`,noSetup,
    (_,b)=>operation==='dot'?damage.applyDot(b,amount,'fire'):damage.landLifeDamage(b,amount));
  course('dot-bypasses-hit-ladder',(_,b)=>{base(b,{armor:10000,fireRes:1,hitCap:1,poise:100,poiseDR:1});b.poise=100;b.insight=100;b.plies=10;},(_,b)=>damage.applyDot(b,80,'fire'));
  for(const bypass of [0,.5,1]) course('dot-shield-'+bypass,(_,b)=>{base(b,{energyShield:100,esDotResist:.25,esDotBypass:bypass});b.es=30;},(_,b)=>damage.applyDot(b,80,'fire'));
  course('dot-ward-no-shield-delay',(_,b)=>{base(b,{energyShield:100});b.es=30;b.ward=100;},(_,b)=>damage.applyDot(b,20));
  course('dot-immunity-pool-writes',(_,b)=>{base(b,{damageImmunity:1});b.ward=10;},(_,b)=>damage.applyDot(b,20));
  course('life-interceptor-order',(_,b,e)=>{b.lifeDamageInterceptors=new Map([['first',n=>{e.push({intercept:'first',n});return n*.5;}],['second',n=>{e.push({intercept:'second',n});return n-3;}]]);},(_,b)=>damage.landLifeDamage(b,40));
  course('life-interceptor-live-add',(_,b,e)=>{b.lifeDamageInterceptors=new Map([['first',n=>{b.lifeDamageInterceptors!.set('late',n=>{e.push({intercept:'late',n});return n+2;});return n*.5;}]]);},(_,b)=>damage.landLifeDamage(b,40));
  course('life-interceptor-throw',(_,b)=>{b.lifeDamageInterceptors=new Map([['bad',()=>{throw new Error('interceptor fault');}]]);});
  course('life-interceptor-nested-dot',(_,b)=>{let entered=false;b.lifeDamageInterceptors=new Map([['nested',n=>{if(!entered){entered=true;damage.applyDot(b,3);}return n;}]]);});
  course('absorb-snapshot-replacement',(_,b,e)=>{layers(b,e);b.absorbLayers.get('first')!.ended=reason=>{e.push({kind:'replace',reason});b.absorbLayers.set('second',{amount:999,remaining:10,source:makeSkillInstance(SKILLS.firebolt),ended:()=>e.push('replacement-ended')});};},(_,b)=>spendAbsorbLayers(b,50));
  course('absorb-partial-throw',(_,b,e)=>{layers(b,e);b.absorbLayers.get('first')!.ended=()=>{throw new Error('layer fault');};},(_,b)=>spendAbsorbLayers(b,50));
  for(const dt of [0,1,2,2-5e-10]) for(const dead of [false,true]) course(`absorb-clock-${dt}-${dead}`,(_,b,e)=>{layers(b,e);b.dead=dead;},(_,b)=>tickAbsorbLayers(b,dt));
  course('absorb-power',(a)=>base(a,{absorbPower:1.5}),(a)=>skillAbsorbAmount(a,makeSkillInstance(SKILLS.firebolt),40));
  for(const total of [.5,1,2]) course('receive-normalize-'+total,(_,b)=>{b.sheet.setSource('routes',[{stat:'takenAs_physical_fire',kind:'flat',value:total*.6},{stat:'takenAs_physical_cold',kind:'flat',value:total*.4},{stat:'takenAs_fire_cold',kind:'flat',value:1}]);},(_,b)=>{const input={physical:100,fire:20};const output=receiveDamageAs(b,input);return {input,output,same:input===output};});
  course('receive-unarmed-identity',noSetup,(_,b)=>{const input={physical:100};return {same:receiveDamageAs(b,input)===input};});
  course('conversion-sequential-and-extra',(a)=>a.sheet.setSource('conversion',[{stat:'convert_physical_fire',kind:'flat',value:.8},{stat:'convert_fire_cold',kind:'flat',value:1},{stat:'extraAs_fire',kind:'flat',value:.2},{stat:'extraAs_chaos',kind:'flat',value:.3}]),a=>{const values={physical:100,fire:10};damage.applyConversion(a,values,new Set(['spell']));return values;});
  for(const skill of ['firebolt','cleave','ruin']) for(const luck of ['none','lucky','unlucky','both']) course(`roll-preview-${skill}-${luck}`,
    a=>base(a,{luckyChance:luck==='lucky'||luck==='both'?1:0,unluckyChance:luck==='unlucky'||luck==='both'?1:0,critChance:.5,critMulti:2,damageSpread:.4,addedMin_fire:2,addedMax_cold:4}),
    a=>{assert(SKILLS[skill],skill);const inst=makeSkillInstance(SKILLS[skill],10,2);const preview=damage.skillDamageBands(a,inst,{physical:3});return {preview,rolls:Array.from({length:3},()=>damage.rollSkillDamage(a,inst,{physical:3},['vs:burning']))};});
  course('guard-innate-broadcast',a=>{const inst=makeSkillInstance(SKILLS.firebolt);(inst.def as any)={...inst.def,innateMods:[{stat:'damage',kind:'increased',value:.4,when:'guarding'}]};a.casting={mode:'guard',inst} as any;a.sheet.setConditions(['guarding']);},a=>damage.rollSkillDamage(a,makeSkillInstance(SKILLS.firebolt)));
  course('thorns-dominion',(a)=>{base(a,{thornsToHit:.5,thorns:20,reservedDamage:.2,maxManaDamage:.1});a.reservedMana=30;},a=>damage.skillDamageBands(a,makeSkillInstance(SKILLS.firebolt)));
} finally {Math.random=previousRandom;SIM_TAP.current=previousTap;}
assert(rows.length>100);
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,rows},null,2)+'\n');
console.log(`Damage pipeline: ${rows.length} original courses`);
