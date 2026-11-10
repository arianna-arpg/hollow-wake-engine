// Original activation command, authored definitions/support admission and labelled
// diagnostic delivery boundaries. Full scheduling and cast admission are separate.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor,type ActiveAura} from '../src/engine/actor';
import {StatSheet,mod} from '../src/engine/stats';
import {makeSkillInstance,type AuraDelivery,type SkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
bootSimEngine();const restore=seedGlobalRandom(0xa6710),rows:unknown[]=[];
function fixture(id:string){
 const w=makeSimWorld('magician',0xa6710),a=new Actor('activation bearer','enemy',{x:0,y:0});w.walk=null;w.actors=[a];w.time=17;
 a.sheet=new StatSheet();for(const[key,value]of Object.entries({life:100,mana:100,manaCost:1,effectDuration:1,guardStrength:1,durationAuraCap:1}))a.sheet.setBase(key,value);a.life=80;a.mana=100;
 const definition=SKILLS[id];assert(definition.delivery.type==='aura');const inst=makeSkillInstance({...definition,delivery:{...definition.delivery,aura:{...definition.delivery.aura}}},1,3),events:Record<string,unknown>[]=[];
 return{w,a,inst,events,error:undefined as string|undefined,provided:undefined as AuraDelivery|undefined,onStat:undefined as ((key:string)=>void)|undefined,onSource:undefined as ((key:string)=>void)|undefined,beforeRetire:undefined as ((key:string)=>void)|undefined,afterRetire:undefined as ((key:string)=>void)|undefined};
}
type Context=ReturnType<typeof fixture>;
const delivery=(c:Context)=>{const d=c.inst.def.delivery;assert(d.type==='aura');return d;};
const patch=(c:Context,fields:Partial<AuraDelivery>)=>{c.inst.def={...c.inst.def,delivery:{...delivery(c),...fields}};};
const support=(c:Context,id:string,index=0)=>{c.inst.sockets[index]={def:SUPPORTS[id],level:1};};
function active(c:Context,id:string,key=id,remaining=10){
 const definition=SKILLS[id];assert(definition.delivery.type==='aura');const inst=makeSkillInstance({...definition,id:key},1),row:ActiveAura={inst,spec:definition.delivery.aura,radius:12,shape:0,remaining,reserved:0,pulseTimer:0,affected:new Set(),since:0,ledger:definition.delivery.ledger?{balance:0}:undefined};c.a.activeAuras.set(key,row);return row;
}
function hooks(c:Context){
 const {w,a,events}=c,get=a.sheet.get.bind(a.sheet),set=a.sheet.setSource.bind(a.sheet),text=w.text.bind(w),retire=w.deactivateAura.bind(w);
 a.sheet.get=(...args)=>{events.push({kind:'stat',key:args[0]});c.onStat?.(args[0]);return get(...args);};
 a.sheet.setSource=(...args)=>{events.push({kind:'source',key:args[0],rowPresent:a.activeAuras.has(c.inst.def.id),seal:a.lifeSealAt,mods:args[1]});c.onSource?.(args[0]);return set(...args);};
 w.text=(...args)=>{events.push({kind:'text',text:args[1],life:a.life,mana:a.mana,reservedMana:a.reservedMana,reservedLife:a.reservedLife});return text(...args);};
 w.deactivateAura=(...args)=>{events.push({kind:'retire',key:args[1],present:a.activeAuras.has(args[1]),newRow:a.activeAuras.has(c.inst.def.id)});c.beforeRetire?.(args[1]);const result=retire(...args);c.afterRetire?.(args[1]);return result;};
 const host=w as unknown as {failNote(a:Actor,key:string,note:string):void},fail=host.failNote.bind(w);host.failNote=(...args)=>{events.push({kind:'fail-note',key:args[1],note:args[2]});return fail(...args);};
}
const installed=(c:Context)=>{assert.equal(c.error,undefined);const row=c.a.activeAuras.get(c.inst.def.id);assert(row);assert.equal(row.inst,c.inst);assert.equal(row.spec,c.provided!.aura);return row;};
const silent=(c:Context)=>{assert.equal(c.error,undefined);assert(!c.a.activeAuras.has(c.inst.def.id));};
function course(label:string,id:string,setup:(c:Context)=>void,check:(c:Context)=>void){
 const c=fixture(id);setup(c);c.provided=delivery(c);hooks(c);
 const host=c.w as unknown as {activateAura(a:Actor,inst:SkillInstance,d:AuraDelivery,scale:number):void};try{host.activateAura(c.a,c.inst,c.provided,1.5);}catch(error){c.error=String(error);}check(c);
 rows.push({label,error:c.error,life:c.a.life,mana:c.a.mana,dead:c.a.dead,reservedLife:c.a.reservedLife,reservedMana:c.a.reservedMana,seal:c.a.lifeSealAt,shell:c.a.shellGuard,
  overdrive:Object.fromEntries(Object.entries(c.a.overdrive).map(([lane,row])=>[lane,{id:row.inst.def.id,sameInstance:row.inst===c.inst,debt:row.debt,idle:row.idle}])),
  active:[...c.a.activeAuras].map(([key,row])=>({key,instanceId:row.inst.def.id,sameInstance:row.inst===c.inst,sameSpec:row.spec===c.provided!.aura,allyMods:row.allyMods,radius:row.radius,shape:row.shape,remaining:Number.isFinite(row.remaining)?row.remaining:String(row.remaining),lifeLane:row.lifeLane,reserved:row.reserved,pulseTimer:row.pulseTimer,affected:[...row.affected],since:row.since,ledger:row.ledger})),events:c.events});
}
try{
 course('existing-row-does-not-refresh','overclock',c=>{active(c,'overclock','overclock',3);c.a.overdrive.mana={inst:makeSkillInstance(SKILLS.overclock),debt:2,idle:4};c.onStat=()=>{throw Error('unexpected stat read');};},c=>{assert.equal(c.error,undefined);assert.equal(c.a.activeAuras.get('overclock')!.remaining,3);assert.equal(c.events.length,0);});
 course('blocked-lane-before-stat-reads','overclock',c=>{c.a.overdrive.mana={inst:makeSkillInstance(SKILLS.overclock),debt:2,idle:4};c.onStat=()=>{throw Error('unexpected stat read');};},c=>{silent(c);assert.deepEqual(c.events,[{kind:'fail-note',key:'overclock:lane',note:'already overdriven'}]);assert.equal(c.a.overdrive.mana?.debt,2);});
 course('host-owns-dead-admission','grit_stance',c=>{c.a.dead=true;},c=>{installed(c);assert(c.a.dead);});
 course('borrowed-row-and-scaled-area','grit_stance',c=>{c.a.sheet.setBase('aoeShape',3);},c=>{const row=installed(c);assert.equal(row.radius,18);assert.equal(row.shape,3);assert.equal(row.remaining,Infinity);assert.equal(row.since,17);assert.equal(row.pulseTimer,0);assert.equal(row.affected.size,0);assert.equal(row.ledger,undefined);assert.equal(row.lifeLane,undefined);});
 course('reservation-scales-and-clamps-mana','reclamation',c=>{c.a.sheet.setBase('manaCost',2);},c=>{const row=installed(c);assert.equal(row.reserved,48);assert.equal(c.a.reservedMana,48);assert.equal(c.a.mana,52);});
 course('mana-exact-reservation-is-allowed','reclamation',c=>{c.a.reservedMana=76;},c=>{installed(c);assert.equal(c.a.reservedMana,100);assert.equal(c.a.mana,0);});
 course('mana-reservation-overflow-refused','reclamation',c=>{c.a.reservedMana=77;},c=>{silent(c);assert.equal(c.a.reservedMana,77);assert.equal(c.a.mana,100);assert.equal(c.events.find(e=>e.kind==='text')?.text,'cannot sustain');});
 course('life-exact-reservation-is-allowed','grit_stance',c=>{patch(c,{upkeep:{reserveMana:20}});support(c,'blood_pact');c.a.reservedLife=70;},c=>{const row=installed(c);assert.equal(row.lifeLane,true);assert.equal(row.reserved,20);assert.equal(c.a.reservedLife,90);assert.equal(c.a.life,10);assert.equal(c.a.mana,100);});
 course('life-reservation-overflow-refused','grit_stance',c=>{patch(c,{upkeep:{reserveMana:20}});support(c,'blood_pact');c.a.reservedLife=71;},c=>{silent(c);assert.equal(c.a.reservedLife,71);assert.equal(c.a.life,80);assert.equal(c.events.find(e=>e.kind==='text')?.text,'cannot sustain');});
 course('duration-graft-precedes-life-reservation','grit_stance',c=>{patch(c,{upkeep:{reserveMana:200}});support(c,'blood_pact');support(c,'fleeting_devotion',1);c.a.sheet.setBase('effectDuration',2);},c=>{const row=installed(c);assert.equal(row.remaining,24);assert.equal(row.reserved,0);assert.equal(row.lifeLane,undefined);assert.equal(c.a.reservedLife,0);assert.equal(c.a.reservedMana,0);});
 for(const[duration,expected]of [[undefined,10],[0,0]] as const)course('native-duration-'+String(duration),'grit_stance',c=>{patch(c,{mode:'duration',duration,upkeep:{reserveMana:200}});c.a.sheet.setBase('effectDuration',2);},c=>{const row=installed(c);assert.equal(row.remaining,expected);assert.equal(row.reserved,0);});
 course('duration-cap-rounds-up','grit_stance',c=>{support(c,'fleeting_devotion');c.a.sheet.setBase('durationAuraCap',1.5);active(c,'grit_stance','old-first');active(c,'grit_stance','old-second');},c=>{installed(c);assert.deepEqual([...c.a.activeAuras.keys()],['old-second','grit_stance']);});
 course('duration-cap-has-one-floor','grit_stance',c=>{support(c,'fleeting_devotion');c.a.sheet.setBase('durationAuraCap',0);active(c,'grit_stance','old-first');active(c,'grit_stance','old-second');},c=>{installed(c);assert.deepEqual([...c.a.activeAuras.keys()],['grit_stance']);assert.equal(c.events.filter(e=>e.kind==='retire').length,2);});
 course('duration-evicts-finite-insertion-order','grit_stance',c=>{support(c,'fleeting_devotion');c.a.sheet.setBase('durationAuraCap',2);active(c,'grit_stance','infinite',Infinity);active(c,'grit_stance','first',-1).since=100;active(c,'grit_stance','second',5).since=-100;},c=>{installed(c);assert.deepEqual([...c.a.activeAuras.keys()],['infinite','second','grit_stance']);assert.deepEqual(c.events.filter(e=>e.kind==='retire').map(e=>e.key),['first']);});
 course('duration-eviction-retains-snapshot','grit_stance',c=>{support(c,'fleeting_devotion');active(c,'grit_stance','first');active(c,'grit_stance','second');c.beforeRetire=key=>{if(key==='first'){c.a.activeAuras.delete('second');active(c,'grit_stance','late');c.a.sheet.setBase('durationAuraCap',99);}};},c=>{installed(c);assert.deepEqual(c.events.filter(e=>e.kind==='retire').map(e=>e.key),['first','second']);assert.deepEqual([...c.a.activeAuras.keys()],['late','grit_stance']);});
 course('duration-eviction-executes-ledger-settlement','grit_stance',c=>{support(c,'fleeting_devotion');active(c,'arrears').ledger!.balance=7;},c=>{installed(c);assert.equal(c.a.life,73);assert(!c.a.activeAuras.has('arrears'));assert.equal(c.events.find(e=>e.kind==='text')?.text,'arrears due: 7');});
 course('eviction-failure-keeps-earlier-removal','grit_stance',c=>{support(c,'fleeting_devotion');active(c,'grit_stance','first');active(c,'grit_stance','second');c.beforeRetire=key=>{if(key==='second')throw Error('second retirement fails');};},c=>{assert.match(c.error??'',/second retirement fails/);assert.deepEqual([...c.a.activeAuras.keys()],['second']);});
 for(const[id,lane]of [['overclock','mana'],['blood_mortgage','life']] as const)course('overdrive-installs-'+lane,id,()=>{},c=>{installed(c);assert.equal(c.a.overdrive[lane]?.inst,c.inst);assert.equal(c.a.overdrive[lane]?.debt,0);assert.equal(c.a.overdrive[lane]?.idle,0);});
 course('failed-reservation-cannot-open-lane','overclock',c=>{patch(c,{upkeep:{reserveMana:101}});},c=>{silent(c);assert.equal(c.a.overdrive.mana,undefined);});
 course('late-stat-failure-keeps-opened-lane','overclock',c=>{c.onStat=key=>{if(key==='auraEsRecharge')throw Error('late stat fails');};},c=>{assert.match(c.error??'',/late stat fails/);assert.equal(c.a.overdrive.mana?.inst,c.inst);assert(!c.a.activeAuras.has('overclock'));});
 course('unmodified-allies-retain-definition-array','grit_stance',c=>{delivery(c).aura.allyMods=[mod('damage','flat',3)];},c=>{assert.equal(installed(c).allyMods,c.provided!.aura.allyMods);});
 course('admitted-supports-copy-and-inject-allies','grit_stance',c=>{delivery(c).aura.allyMods=[mod('damage','flat',3)];support(c,'capacitor');support(c,'insulation',1);},c=>{const row=installed(c);assert.notEqual(row.allyMods,c.provided!.aura.allyMods);assert.deepEqual(row.allyMods,[mod('damage','flat',3),mod('esRechargeRate','increased',.6),mod('esRechargeDelay','increased',-.35)]);assert.equal(c.provided!.aura.allyMods?.length,1);});
 course('nonpositive-support-stats-do-not-copy','grit_stance',c=>{delivery(c).aura.allyMods=[mod('damage','flat',3)];c.a.sheet.setBase('auraEsRecharge',-1);c.a.sheet.setBase('auraEsDelay',0);},c=>{assert.equal(installed(c).allyMods,c.provided!.aura.allyMods);});
 course('misfit-aura-supports-stay-inert','rearguard_aegis',c=>{support(c,'fleeting_devotion');support(c,'blood_pact',1);support(c,'capacitor',2);},c=>{const row=installed(c);assert.equal(row.remaining,Infinity);assert.equal(row.lifeLane,undefined);assert.equal(row.reserved,18);assert.equal(row.allyMods,undefined);});
 for(const[prior,expected]of [[90,80],[50,50]] as const)course('seal-existing-lock-'+prior,'mortis_seal',c=>{c.a.lifeSealAt=prior;},c=>{installed(c);assert.equal(c.a.lifeSealAt,expected);});
 course('authored-shell-scales-pool','rearguard_aegis',c=>{c.a.sheet.setBase('guardStrength',2);},c=>{installed(c);assert.equal(c.a.shellGuard?.max,180);assert.equal(c.a.shellGuard?.pool,180);assert.equal(c.a.shellGuard?.regenRate,24);assert.equal(c.a.shellGuard?.fromAura,'rearguard_aegis');});
 course('shell-defaults-use-scaled-pool','rearguard_aegis',c=>{patch(c,{shellGuard:{max:20}});c.a.sheet.setBase('guardStrength',2);},c=>{installed(c);assert.deepEqual(c.a.shellGuard,{side:'rear',arcDeg:180,max:40,pool:40,regenDelay:3,regenRate:8,lastHitAt:-999,broken:false,color:c.inst.def.color,shellVisual:undefined,fromAura:'rearguard_aegis'});});
 course('shell-explicit-zeroes-are-preserved','rearguard_aegis',c=>{patch(c,{shellGuard:{max:20,side:'all',arcDeg:0,regenDelay:0,regenRate:0,color:'#123',shellVisual:'diagnostic'}});},c=>{installed(c);assert.equal(c.a.shellGuard?.side,'all');assert.equal(c.a.shellGuard?.arcDeg,0);assert.equal(c.a.shellGuard?.regenDelay,0);assert.equal(c.a.shellGuard?.regenRate,0);assert.equal(c.a.shellGuard?.color,'#123');assert.equal(c.a.shellGuard?.shellVisual,'diagnostic');});
 course('self-modifiers-before-shell-query','rearguard_aegis',c=>{delivery(c).aura.selfMods=[mod('guardStrength','more',1)];patch(c,{shellGuard:{max:20},seal:{}});},c=>{installed(c);assert.equal(c.a.shellGuard?.max,40);const e=c.events.find(e=>e.kind==='source');assert(e);assert.equal(e.rowPresent,true);assert.equal(e.seal,80);assert(c.events.indexOf(e)<c.events.findIndex(e=>e.kind==='stat'&&e.key==='guardStrength'));});
 course('self-source-failure-retains-row-and-seal','rearguard_aegis',c=>{delivery(c).aura.selfMods=[mod('damage','flat',1)];patch(c,{seal:{}});c.onSource=()=>{throw Error('self source fails');};},c=>{assert.match(c.error??'',/self source fails/);assert(c.a.activeAuras.has(c.inst.def.id));assert.equal(c.a.reservedMana,18);assert.equal(c.a.lifeSealAt,80);assert.equal(c.a.shellGuard,undefined);});
 course('reservation-clamp-failure-retains-reservation','reclamation',c=>{c.a.availableMaxMana=()=>{throw Error('mana clamp fails');};},c=>{assert.match(c.error??'',/mana clamp fails/);assert.equal(c.a.reservedMana,24);assert.equal(c.a.mana,100);assert(!c.a.activeAuras.has('reclamation'));});
 course('zero-reservation-skips-price-query','grit_stance',c=>{patch(c,{upkeep:{reserveMana:0}});c.onStat=key=>{if(key==='manaCost')throw Error('unexpected price query');};},c=>{assert.equal(installed(c).reserved,0);});
 course('fresh-ledger-and-affected-state','arrears',c=>{active(c,'arrears','other').ledger!.balance=7;},c=>{const row=installed(c),other=c.a.activeAuras.get('other')!;assert.deepEqual(row.ledger,{balance:0});assert.notEqual(row.ledger,other.ledger);assert.notEqual(row.affected,other.affected);assert.equal(other.ledger?.balance,7);});
 course('time-sampled-after-shape-query','grit_stance',c=>{c.onStat=key=>{if(key==='aoeShape')c.w.time=29;};},c=>{assert.equal(installed(c).since,29);});
 course('current-instance-id-with-borrowed-delivery','grit_stance',c=>{c.onStat=key=>{if(key==='aoeShape')c.inst.def={...c.inst.def,id:'changed_id'};};},c=>{const row=installed(c);assert(!c.a.activeAuras.has('grit_stance'));assert.equal(row.inst.def.id,'changed_id');assert(c.events.some(e=>e.kind==='source'&&e.key==='auraself:changed_id'));});
 assert.equal(rows.length,38);writeFileSync(process.argv[2],JSON.stringify({scope:'original-aura-activation/v1',rows}),{flag:'wx'});
}finally{restore();}
