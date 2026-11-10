// Original-only retirement boundary. Authored skill definitions are combined
// with explicit diagnostic active rows; this is not an aura-activation course.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {mod} from '../src/engine/stats';
import {makeSkillInstance,type LedgerSpec,type SkillInstance} from '../src/engine/skills';
import type {Actor,ActiveAura} from '../src/engine/actor';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
bootSimEngine();const restore=seedGlobalRandom(0x47291),rows:unknown[]=[];
function active(inst:SkillInstance):ActiveAura{
 assert.equal(inst.def.delivery.type,'aura');const d=inst.def.delivery;assert(d.type==='aura');
 return{inst,spec:d.aura,radius:40,shape:0,remaining:Infinity,reserved:0,pulseTimer:0,affected:new Set(),since:0};
}
function fixture(id:string){
 const w=makeSimWorld('tamer',0x47291);w.walk=null;const p=w.player;
 const ally=w.createMonster('zombie',1,p.team),untouched=w.createMonster('zombie',1,p.team);w.actors=[p,ally,untouched];
 const inst=makeSkillInstance({...SKILLS[id]},3,1),aura=active(inst);aura.affected=new Set([p.id,ally.id]);p.activeAuras.set(id,aura);p.skills[0]=inst;
 const source='aura:'+id+':'+p.id;
 for(const a of w.actors)a.sheet.setSource(source,[mod('damage','flat',7)]);
 p.sheet.setSource('auraself:'+id,[mod('damage','flat',3)]);p.sheet.setSource('seal:'+id,[mod('damageReduction','flat',.1)]);
 const events:Record<string,unknown>[]=[];
 return{w,p,ally,untouched,inst,aura,source,events,afterPayload:undefined as undefined|(()=>void),beforeRemove:undefined as undefined|((a:Actor,id:string)=>void),thrown:undefined as undefined|string};
}
type Context=ReturnType<typeof fixture>;
function shell(c:Context){c.p.shellGuard={side:'rear',arcDeg:120,max:50,pool:40,regenDelay:1,regenRate:1,lastHitAt:0,broken:false,color:'#888',fromAura:c.inst.def.id};c.inst.sockets[0]={def:SUPPORTS.answering_wall,level:1};}
function observe(label:string,id:string,setup:(c:Context)=>void,check:(c:Context)=>void,quiet=false){
 const c=fixture(id),{w,p,aura,inst,events}=c;setup(c);
 for(const[who,a]of [['bearer',p],['affected',c.ally],['untouched',c.untouched]] as const){
  const remove=a.sheet.removeSource.bind(a.sheet);a.sheet.removeSource=key=>{if(key.startsWith('aura:')||key.startsWith('auraself:')||key.startsWith('seal:'))events.push({kind:'remove',who,key});c.beforeRemove?.(a,key);return remove(key);};
 }
 const execute=w.executeSkill.bind(w);w.executeSkill=(...args)=>{events.push({kind:'payload',id:args[1].def.id,level:args[1].level,mult:args[3]?.dmgMult,oldAuraPresent:p.activeAuras.get(id)===aura,lifeSealAt:p.lifeSealAt,life:p.life});const result=execute(...args);c.afterPayload?.();return result;};
 const bash=w.guardBash.bind(w);w.guardBash=(...args)=>{events.push({kind:'bash',pool:args[3],shellAlreadyRemoved:p.shellGuard===undefined,oldAuraPresent:p.activeAuras.get(id)===aura});return bash(...args);};
 const ledgerHost=w as unknown as {settleLedger(a:Actor,spec:LedgerSpec,state:{balance:number}):void};
 const settle=ledgerHost.settleLedger.bind(w);ledgerHost.settleLedger=(...args)=>{events.push({kind:'ledger',lapse:args[1].lapse,balance:args[2].balance,oldAuraPresent:p.activeAuras.get(id)===aura,reservedMana:p.reservedMana});return settle(...args);};
 try{w.deactivateAura(p,id,quiet);}catch(error){c.thrown=String(error);}
 check(c);
 rows.push({label,id,quiet,events,thrown:c.thrown,auraPresent:p.activeAuras.has(id),shell:p.shellGuard,reservedMana:p.reservedMana,reservedLife:p.reservedLife,life:p.life,mana:p.mana,dead:p.dead,lifeSealAt:p.lifeSealAt,ledgerBalance:aura.ledger?.balance,
  overdrive:Object.fromEntries(Object.entries(p.overdrive).map(([lane,row])=>[lane,{id:row.inst.def.id,debt:row.debt,idle:row.idle}])),
  sources:[p,c.ally,c.untouched].map(a=>a.sheet.sourceNames().filter(key=>key===c.source||key==='auraself:'+id||key==='seal:'+id)),skillIdentity:p.skills.includes(inst)});
}
const gone=(c:Context)=>{assert(!c.p.activeAuras.has(c.inst.def.id));assert.equal(c.thrown,undefined);};
const noPayload=(c:Context)=>assert(!c.events.some(e=>e.kind==='payload'));
const payload=(c:Context)=>{const rows=c.events.filter(e=>e.kind==='payload');assert.equal(rows.length,1);assert.equal(rows[0].id,'death_knell');assert.equal(rows[0].oldAuraPresent,true);return rows[0];};
try{
 observe('absent-row-is-noop','grit_stance',c=>{c.p.activeAuras.clear();c.p.reservedMana=17;},c=>{assert.equal(c.events.length,0);assert.equal(c.p.reservedMana,17);assert(c.p.sheet.sourceNames().includes(c.source));});
 observe('affected-source-and-mana-release','grit_stance',c=>{c.aura.reserved=7;c.p.reservedMana=17;},c=>{gone(c);assert.equal(c.p.reservedMana,10);assert(!c.p.sheet.sourceNames().includes(c.source));assert(!c.ally.sheet.sourceNames().includes(c.source));assert(c.untouched.sheet.sourceNames().includes(c.source));assert.deepEqual(c.events.map(e=>e.kind),['remove','remove','remove']);});
 observe('life-reservation-clamps-at-zero','grit_stance',c=>{c.aura.lifeLane=true;c.aura.reserved=20;c.p.reservedLife=5;c.p.reservedMana=17;},c=>{gone(c);assert.equal(c.p.reservedLife,0);assert.equal(c.p.reservedMana,17);});
 observe('nonpositive-reservation-is-untouched','grit_stance',c=>{c.aura.reserved=-3;c.p.reservedMana=17;},c=>{gone(c);assert.equal(c.p.reservedMana,17);});
 observe('last-seal-unlocks-before-payload','mortis_seal',c=>{c.p.lifeSealAt=30;c.p.life=c.p.maxLife()/2;c.w.time=4;},c=>{gone(c);assert.equal(c.p.lifeSealAt,undefined);assert.equal(payload(c).lifeSealAt,undefined);assert.equal(payload(c).mult,Math.min(2.8,1+.35*4)*1.6);assert(!c.p.sheet.sourceNames().includes('seal:mortis_seal'));});
 observe('another-seal-keeps-life-locked','mortis_seal',c=>{c.p.lifeSealAt=30;c.p.activeAuras.set('seal_of_death',active(makeSkillInstance(SKILLS.seal_of_death)));},c=>{gone(c);assert.equal(c.p.lifeSealAt,30);assert(c.p.activeAuras.has('seal_of_death'));payload(c);});
 observe('quiet-release-suppresses-payload','mortis_seal',c=>{c.p.lifeSealAt=30;},c=>{gone(c);noPayload(c);assert.equal(c.p.lifeSealAt,undefined);},true);
 observe('dead-bearer-suppresses-payload','mortis_seal',c=>{c.p.dead=true;},c=>{gone(c);noPayload(c);});
 observe('unknown-payload-degrades-to-silence','mortis_seal',c=>{const d=c.inst.def.delivery;assert(d.type==='aura');c.inst.def={...c.inst.def,delivery:{...d,onDeactivate:{skillId:'absent_diagnostic_payload'}}};},c=>{gone(c);noPayload(c);});
 observe('held-time-cap','mortis_seal',c=>{c.w.time=100;c.p.life=c.p.maxLife()/2;},c=>{gone(c);assert.equal(payload(c).mult,2.8*1.6);});
 observe('absent-start-time-means-zero-held','mortis_seal',c=>{c.w.time=100;c.aura.since=undefined;c.p.life=c.p.maxLife()/2;},c=>{gone(c);assert.equal(payload(c).mult,1.6);});
 observe('shell-releases-remaining-pool-first','rearguard_aegis',shell,c=>{gone(c);assert.equal(c.p.shellGuard,undefined);const event=c.events[0];assert.equal(event.kind,'bash');assert.equal(event.pool,40);assert.equal(event.shellAlreadyRemoved,true);assert.equal(event.oldAuraPresent,true);});
 observe('broken-shell-does-not-bash','rearguard_aegis',c=>{shell(c);c.p.shellGuard!.broken=true;},c=>{gone(c);assert.equal(c.p.shellGuard,undefined);assert(!c.events.some(e=>e.kind==='bash'));});
 observe('quiet-shell-does-not-bash','rearguard_aegis',shell,c=>{gone(c);assert.equal(c.p.shellGuard,undefined);assert(!c.events.some(e=>e.kind==='bash'));},true);
 observe('unseated-shell-does-not-bash','rearguard_aegis',c=>{shell(c);c.p.skills.fill(null);},c=>{gone(c);assert.equal(c.p.shellGuard,undefined);assert(!c.events.some(e=>e.kind==='bash'));});
 observe('anatomical-shell-is-preserved','rearguard_aegis',c=>{shell(c);c.p.shellGuard!.fromAura=undefined;},c=>{gone(c);assert.equal(c.p.shellGuard?.pool,40);assert(!c.events.some(e=>e.kind==='bash'));});
 observe('mana-overdrive-debt-release','overclock',c=>{c.aura.reserved=5;c.p.reservedMana=20;c.p.overdrive.mana={inst:c.inst,debt:8,idle:2};},c=>{gone(c);assert.equal(c.p.reservedMana,7);assert.equal(c.p.overdrive.mana,undefined);});
 observe('life-overdrive-debt-release','blood_mortgage',c=>{c.aura.reserved=5;c.aura.lifeLane=true;c.p.reservedLife=20;c.p.overdrive.life={inst:c.inst,debt:8,idle:2};},c=>{gone(c);assert.equal(c.p.reservedLife,7);assert.equal(c.p.overdrive.life,undefined);});
 observe('foreign-overdrive-is-preserved','overclock',c=>{c.p.reservedMana=20;c.p.overdrive.mana={inst:makeSkillInstance(SKILLS.firebolt),debt:8,idle:2};},c=>{gone(c);assert.equal(c.p.reservedMana,20);assert.equal(c.p.overdrive.mana?.debt,8);});
 observe('quiet-arrears-still-settles-damage','arrears',c=>{c.p.life=50;c.aura.ledger={balance:7};},c=>{gone(c);assert.equal(c.p.life,43);assert.equal(c.aura.ledger?.balance,0);assert.equal(c.events.filter(e=>e.kind==='ledger').length,1);},true);
 observe('dead-bearer-does-not-settle-ledger','arrears',c=>{c.p.dead=true;c.aura.ledger={balance:7};},c=>{gone(c);assert.equal(c.aura.ledger?.balance,7);assert(!c.events.some(e=>e.kind==='ledger'));});
 observe('reclamation-frees-reservation-before-payout','reclamation',c=>{c.p.mana=0;c.p.reservedMana=24;c.aura.reserved=24;c.aura.ledger={balance:7};},c=>{gone(c);assert.equal(c.p.mana,7);assert.equal(c.aura.ledger?.balance,0);const event=c.events.find(e=>e.kind==='ledger');assert(event);assert.equal(event.reservedMana,0);assert.equal(event.oldAuraPresent,true);});
 observe('payload-death-prevents-later-ledger','mortis_seal',c=>{const d=c.inst.def.delivery,ledger=SKILLS.arrears.delivery;assert(d.type==='aura'&&ledger.type==='aura');c.inst.def={...c.inst.def,delivery:{...d,ledger:ledger.ledger}};c.aura.ledger={balance:7};c.afterPayload=()=>{c.p.dead=true;};},c=>{gone(c);payload(c);assert.equal(c.aura.ledger?.balance,7);assert(!c.events.some(e=>e.kind==='ledger'));});
 observe('delivery-is-reread-after-payload','mortis_seal',c=>{c.p.reservedLife=20;c.p.overdrive.life={inst:c.inst,debt:8,idle:2};c.afterPayload=()=>{const d=SKILLS.blood_mortgage.delivery;c.inst.def={...c.inst.def,delivery:d};};},c=>{gone(c);payload(c);assert.equal(c.p.reservedLife,12);assert.equal(c.p.overdrive.life,undefined);});
 observe('callback-replacement-row-is-still-deleted','mortis_seal',c=>{c.afterPayload=()=>{c.p.activeAuras.set(c.inst.def.id,{...c.aura});};},c=>{gone(c);payload(c);});
 observe('host-failure-retains-prior-writes','grit_stance',c=>{c.p.reservedMana=20;c.aura.reserved=5;c.beforeRemove=a=>{if(a===c.ally)throw Error('diagnostic-source-removal');};},c=>{assert.match(c.thrown??'',/diagnostic-source-removal/);assert(c.p.activeAuras.has(c.inst.def.id));assert(!c.p.sheet.sourceNames().includes(c.source));assert(c.ally.sheet.sourceNames().includes(c.source));assert.equal(c.p.reservedMana,20);});
 assert.equal(rows.length,26);writeFileSync(process.argv[2],JSON.stringify({scope:'original-aura-retirement/v1',rows}),{flag:'wx'});
}finally{restore();}
