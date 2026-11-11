// Pinned original tick command. Authored aura carriers plus labelled diagnostic
// frame inputs; presentation spies observe the same synchronous effect boundary.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {Actor,type ActiveAura} from '../src/engine/actor';import {StatSheet,mod} from '../src/engine/stats';
import {makeSkillInstance,type AuraDelivery,type AuraSpec} from '../src/engine/skills';import {SKILLS} from '../src/data/skills';
bootSimEngine();const restore=seedGlobalRandom(0xa671c),rows:unknown[]=[];
function body(name:string,team:'player'|'enemy',x=0){const a=new Actor(name,team,{x,y:0});a.sheet=new StatSheet();for(const[k,v]of Object.entries({life:100,mana:100,effectDuration:1,damage:1,damageTaken:1,lifeRegen:5}))a.sheet.setBase(k,v);a.life=80;a.mana=100;return a;}
function row(a:Actor,key='grit_stance',spec:AuraSpec={radius:12},fields:Partial<AuraDelivery>={}){const original=SKILLS.grit_stance;assert(original.delivery.type==='aura');const def={...original,id:key,delivery:{...original.delivery,...fields,aura:spec}},inst=makeSkillInstance(def,1),r:ActiveAura={inst,spec,radius:12,shape:0,remaining:Infinity,reserved:0,pulseTimer:0,affected:new Set(),since:15};a.activeAuras.set(key,r);return r;}
function fixture(){const w=makeSimWorld('magician',0xa671c),a=body('bearer','player'),ally=body('ally','player',3),enemy=body('enemy','enemy',4),events:Record<string,unknown>[]=[];w.walk=null;w.actors=[a,ally,enemy];w.time=17;const r=row(a);
 const host=w as unknown as {updateAuras(dt:number):void;presenceMoment(a:Actor,phase:string):boolean;accumulateDotText(a:Actor,amount:number,dt:number):void};
 const c={w,a,ally,enemy,r,events,host,error:undefined as string|undefined,onSource:undefined as ((a:Actor,key:string)=>void)|undefined,onRetire:undefined as ((a:Actor,key:string)=>void)|undefined,onPulse:undefined as ((a:Actor)=>void)|undefined,onDot:undefined as ((a:Actor)=>void)|undefined};
 const retire=w.deactivateAura.bind(w);w.deactivateAura=(...args)=>{events.push({kind:'retire',actor:args[0].name,key:args[1],life:args[0].life,mana:args[0].mana,chargeAcc:c.r.chargeAcc});c.onRetire?.(args[0],args[1]);return retire(...args);};
 host.presenceMoment=(a,phase)=>{events.push({kind:'presence',actor:a.name,phase,timer:c.r.pulseTimer});c.onPulse?.(a);return false;};host.accumulateDotText=(a,amount,dt)=>{events.push({kind:'damage',actor:a.name,amount,dt,life:a.life});c.onDot?.(a);};
 w.text=(...args)=>{events.push({kind:'text',text:args[1]});};
 for(const a of [c.a,c.ally,c.enemy]){const set=a.sheet.setSource.bind(a.sheet),remove=a.sheet.removeSource.bind(a.sheet),spend=a.spendCharge.bind(a);
  a.sheet.setSource=(key,mods)=>{events.push({kind:'source',actor:a.name,key,mods,sealVal:c.r.sealVal,affected:[...c.r.affected]});c.onSource?.(a,key);return set(key,mods);};
  a.sheet.removeSource=key=>{events.push({kind:'remove',actor:a.name,key});return remove(key);};
  a.spendCharge=(key,amount)=>{events.push({kind:'spend',actor:a.name,key,amount,chargeAcc:c.r.chargeAcc});return spend(key,amount);};
 }
 return c;
}
type Context=ReturnType<typeof fixture>;
const patch=(c:Context,fields:Partial<AuraDelivery>)=>{const d=c.r.inst.def.delivery;assert(d.type==='aura');c.r.inst.def={...c.r.inst.def,delivery:{...d,...fields}};};
const spec=(c:Context,s:AuraSpec)=>{c.r.spec=s;patch(c,{aura:s});};
function tick(c:Context,dt:number){try{c.host.updateAuras(dt);}catch(error){c.error=String(error);}}
const active=(c:Context)=>{assert.equal(c.error,undefined);assert.equal(c.a.activeAuras.get('grit_stance'),c.r);};
const retired=(c:Context)=>{assert.equal(c.error,undefined);assert(!c.a.activeAuras.has('grit_stance'));};
function course(label:string,setup:(c:Context)=>void,dt:number,check:(c:Context)=>void){const c=fixture();setup(c);tick(c,dt);check(c);rows.push({label,error:c.error,time:c.w.time,actors:c.w.actors.map(a=>({name:a.name,id:a.id,life:a.life,mana:a.mana,dead:a.dead,charges:[...a.charges],auras:[...a.activeAuras].map(([key,r])=>({key,remaining:Number.isFinite(r.remaining)?r.remaining:String(r.remaining),pulseTimer:r.pulseTimer,chargeAcc:r.chargeAcc,sealVal:r.sealVal,affected:[...r.affected]}))})),events:c.events});}
try{
 course('dead-bearer-does-not-tick',c=>{c.a.dead=true;c.r.remaining=3;},1,c=>{active(c);assert.equal(c.r.remaining,3);assert.equal(c.events.length,0);});
 course('duration-expiry-precedes-upkeep',c=>{c.r.remaining=1;patch(c,{upkeep:{manaPerSec:20}});},1,c=>{retired(c);assert.equal(c.a.mana,100);assert.equal(c.r.remaining,0);});
 course('zero-time-expiry-is-retired',c=>{c.r.remaining=0;},0,c=>{retired(c);});
 course('finite-duration-subtracts-frame',c=>{c.r.remaining=3;},.5,c=>{active(c);assert.equal(c.r.remaining,2.5);});
 course('native-duration-mode-skips-toggle-upkeep',c=>{c.r.remaining=3;patch(c,{mode:'duration',upkeep:{manaPerSec:200},maxDuration:0});},1,c=>{active(c);assert.equal(c.a.mana,100);assert.equal(c.r.remaining,2);});
 course('fuse-equality-expires-before-upkeep',c=>{patch(c,{maxDuration:2,upkeep:{manaPerSec:10}});},.5,c=>{retired(c);assert.equal(c.a.mana,100);});
 course('fuse-scales-with-duration',c=>{patch(c,{maxDuration:2});c.a.sheet.setBase('effectDuration',2);},1,c=>{active(c);});
 course('absent-since-has-zero-held-span',c=>{c.r.since=undefined;patch(c,{maxDuration:1,upkeep:{manaPerSec:10,rampPerSec:20}});},1,c=>{active(c);assert.equal(c.a.mana,90);});
 course('mixed-mana-drains-share-ramp',c=>{patch(c,{upkeep:{manaPerSec:2,manaPctMaxPerSec:.1,manaPctCurPerSec:.2,rampPerSec:.5}});},.5,c=>{active(c);assert.equal(c.a.mana,68);});
 course('mana-exhaustion-clamps-before-retirement',c=>{patch(c,{upkeep:{manaPerSec:200,lifeFractionPerSec:.1}});},1,c=>{retired(c);assert.equal(c.a.mana,0);assert.equal(c.a.life,80);assert.equal(c.events.find(e=>e.kind==='retire')?.mana,0);});
 course('life-floor-refuses-before-subtraction',c=>{patch(c,{upkeep:{lifeFractionPerSec:.79}});},1,c=>{retired(c);assert.equal(c.a.life,80);});
 course('life-upkeep-retains-prior-mana-write',c=>{patch(c,{upkeep:{manaPerSec:5,lifeFractionPerSec:.1}});},1,c=>{active(c);assert.equal(c.a.life,70);assert.equal(c.a.mana,95);});
 course('fractional-charge-owing-waits',c=>{patch(c,{upkeep:{charges:{charge:'diagnostic',perSec:.5}}});c.r.chargeAcc=.25;},1,c=>{active(c);assert.equal(c.r.chargeAcc,.75);assert(!c.events.some(e=>e.kind==='spend'));});
 course('whole-charge-payment-keeps-fraction',c=>{patch(c,{upkeep:{charges:{charge:'diagnostic',perSec:2.5}}});c.r.chargeAcc=.25;c.a.charges.set('diagnostic',5);},1,c=>{active(c);assert.equal(c.r.chargeAcc,.75);assert.equal(c.a.charges.get('diagnostic'),3);assert.equal(c.events.find(e=>e.kind==='spend')?.chargeAcc,.75);});
 course('insufficient-charges-spend-remainder-before-retiring',c=>{patch(c,{upkeep:{charges:{charge:'diagnostic',perSec:2.5}}});c.r.chargeAcc=.25;c.a.charges.set('diagnostic',1);},1,c=>{retired(c);assert.equal(c.a.charges.get('diagnostic'),0);assert.equal(c.r.chargeAcc,.75);assert(c.events.findIndex(e=>e.kind==='spend')<c.events.findIndex(e=>e.kind==='retire'));});
 course('seal-rounds-and-publishes-after-value',c=>{patch(c,{seal:{drPerMissing:.5,stagger:.2}});},0,c=>{active(c);assert.equal(c.r.sealVal,.1);assert.equal(c.a.sheet.get('damageTaken'),.9);assert.equal(c.a.sheet.get('staggerFrac'),.2);assert.equal(c.events.find(e=>e.kind==='source')?.sealVal,.1);});
 course('unchanged-seal-value-skips-source',c=>{patch(c,{seal:{drPerMissing:.5}});c.r.sealVal=.1;},0,c=>{active(c);assert(!c.events.some(e=>e.kind==='source'));});
 course('throwing-seal-publication-retains-rounded-value',c=>{patch(c,{seal:{drPerMissing:.5}});c.onSource=()=>{throw Error('seal publication failed');};},0,c=>{assert.match(c.error??'',/seal publication failed/);assert.equal(c.r.sealVal,.1);assert.equal(c.a.sheet.get('damageTaken'),1);});
 course('ally-entry-and-exit-retain-publication-order',c=>{spec(c,{radius:12,allyMods:[mod('damage','flat',3)]});},0,c=>{active(c);assert.deepEqual([...c.r.affected],[c.a.id,c.ally.id]);assert.equal(c.ally.sheet.get('damage'),4);assert(c.events.filter(e=>e.kind==='source').every(e=>(e.affected as number[]).length===0));c.ally.pos.x=100;tick(c,0);assert.equal(c.ally.sheet.get('damage'),1);assert.deepEqual([...c.r.affected],[c.a.id]);});
 course('existing-affected-members-skip-source-refresh',c=>{spec(c,{radius:12,allyMods:[mod('damage','flat',3)]});c.r.affected.add(c.a.id);},0,c=>{active(c);assert.equal(c.a.sheet.get('damage'),1);assert.equal(c.ally.sheet.get('damage'),4);});
 course('empty-ally-override-precedes-spec-modifiers',c=>{spec(c,{radius:12,allyMods:[mod('damage','flat',3)]});c.r.allyMods=[];},0,c=>{active(c);assert.equal(c.ally.sheet.get('damage'),1);assert.deepEqual([...c.r.affected],[c.a.id,c.ally.id]);});
 course('dead-allies-do-not-receive-source',c=>{spec(c,{radius:12,allyMods:[mod('damage','flat',3)]});c.ally.dead=true;},0,c=>{active(c);assert.deepEqual([...c.r.affected],[c.a.id]);});
 course('dps-and-siphon-use-landed-damage',c=>{spec(c,{radius:12,enemyDps:{type:'fire',amount:10},siphonFraction:.5});c.a.life=40;c.enemy.life=100;},.5,c=>{active(c);assert.equal(c.enemy.life,95);assert.equal(c.a.life,42.5);assert.equal(c.events.find(e=>e.kind==='damage')?.life,95);});
 course('enemy-modifiers-precede-damage-read',c=>{spec(c,{radius:12,enemyMods:[mod('damageTaken','more',1)],enemyDps:{type:'fire',amount:10}});c.enemy.life=100;},1,c=>{active(c);assert.equal(c.enemy.life,80);assert.deepEqual([...c.r.affected],[c.enemy.id]);});
 course('invulnerability-keeps-modifiers-but-prevents-damage',c=>{spec(c,{radius:12,enemyMods:[mod('damageTaken','more',1)],enemyDps:{type:'fire',amount:10}});c.enemy.invulnerable=true;},1,c=>{active(c);assert.equal(c.enemy.life,80);assert(!c.events.some(e=>e.kind==='damage'));assert.deepEqual([...c.r.affected],[c.enemy.id]);});
 for(const[base,expected]of [['maxLife',100],['maxMana',92],['lifeRegen',81]] as const)course('pulse-heal-base-'+base,c=>{c.ally.sheet.setBase('mana',60);spec(c,{radius:12,pulse:{interval:2,healAllies:{base,amount:.2}}});},10,c=>{active(c);assert.equal(c.ally.life,expected);assert.equal(c.r.pulseTimer,2);assert.equal(c.events.filter(e=>e.kind==='presence').length,1);});
 course('pulse-zero-time-first-frame',c=>{spec(c,{radius:12,pulse:{interval:2}});},0,c=>{active(c);assert.equal(c.r.pulseTimer,2);assert.equal(c.events.find(e=>e.kind==='presence')?.timer,2);});
 course('pulse-retains-unexpired-timer',c=>{spec(c,{radius:12,pulse:{interval:2}});c.r.pulseTimer=1;},.25,c=>{active(c);assert.equal(c.r.pulseTimer,.75);assert(!c.events.some(e=>e.kind==='presence'));});
 course('throwing-pulse-retains-new-affected-set-and-timer',c=>{spec(c,{radius:12,allyMods:[],pulse:{interval:2}});c.onPulse=()=>{throw Error('pulse failed');};},0,c=>{assert.match(c.error??'',/pulse failed/);assert.deepEqual([...c.r.affected],[c.a.id,c.ally.id]);assert.equal(c.r.pulseTimer,2);});
 course('captured-retired-row-still-ticks',c=>{c.r.remaining=0;const later=row(c.a,'later',{radius:12,pulse:{interval:2}});c.onRetire=(_a,key)=>{if(key==='grit_stance')c.a.activeAuras.delete('later');};assert.equal(later.pulseTimer,0);},0,c=>{retired(c);assert(!c.a.activeAuras.has('later'));assert.equal(c.events.filter(e=>e.kind==='presence').length,1);});
 course('new-aura-row-waits-for-next-frame',c=>{spec(c,{radius:12,pulse:{interval:2}});c.onPulse=()=>{row(c.a,'late',{radius:12,pulse:{interval:3}});};},0,c=>{active(c);assert.equal(c.events.filter(e=>e.kind==='presence').length,1);assert.equal(c.a.activeAuras.get('late')?.pulseTimer,0);});
 course('new-actor-is-visited-in-current-frame',c=>{spec(c,{radius:12,pulse:{interval:2}});c.onPulse=a=>{if(a===c.a){const late=body('late','player');row(late,'late',{radius:12,pulse:{interval:3}});c.w.actors.push(late);}};},0,c=>{active(c);assert.equal(c.events.filter(e=>e.kind==='presence').length,2);assert.equal(c.w.actors.find(a=>a.name==='late')?.activeAuras.get('late')?.pulseTimer,3);});
 assert.equal(rows.length,34);writeFileSync(process.argv[2],JSON.stringify({scope:'original-aura-ticking/v1',rows}),{flag:'wx'});
}finally{restore();}
