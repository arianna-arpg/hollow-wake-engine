// Original-only recovery evidence. No private clone, save, or full death-path claim.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {COMPANION_CFG} from '../src/engine/companionSpec';import {STATUS_DEFS} from '../src/engine/status';
import {mod} from '../src/engine/stats';import type {Actor} from '../src/engine/actor';
bootSimEngine();const restore=seedGlobalRandom(0x4192),original={...COMPANION_CFG.recovery},rows:unknown[]=[];
const json=(x:unknown)=>JSON.parse(JSON.stringify(x));
function setup(){
 Object.assign(COMPANION_CFG.recovery,original);
 const w=makeSimWorld('tamer',0x4192);w.walk=null;w.grantStartingCompanions();
 const p=w.player,a=w.actors.find(b=>b.companion&&b.owner===p);assert(a);w.actors=[p,a];w.flashes=[];
 a.endStatus(original.status);a.life=a.maxLife()*.3;a.companionReviveRemaining=1.75;a.companionReviveDwell=.25;
 return{w,p,a};
}
function view(a:Actor){return json({companion:a.companion,dead:a.dead,downed:a.downed,dormant:a.companionDormant,owner:a.owner?.id,life:a.life,maxLife:a.maxLife(),remaining:a.companionReviveRemaining,dwell:a.companionReviveDwell,
 statuses:a.statuses,expired:a.expiredStatuses,sources:a.sheet.sourceNames().map(key=>[key,a.sheet.getSourceMods(key)])});}
function observe(label:string,h:ReturnType<typeof setup>){rows.push({label,body:view(h.a),flashes:json(h.w.flashes)});}
function wound(a:Actor){
 a.applyStatus('poison',2,1,'recovery probe');a.applyStatus('moonlit',0,1,'recovery probe');
 const bad=a.statuses.find(s=>s.id==='poison'),good=a.statuses.find(s=>s.id==='moonlit');assert(bad&&good);
 a.expiredStatuses=[{...bad,remaining:0},{...good,remaining:0},{...bad,id:'hwe_unknown_expiry',remaining:0}];
 return{bad,good,oldExpired:a.expiredStatuses};
}
function shelter(a:Actor){return a.statuses.filter(s=>s.id===original.status);}
try{
 for(const flag of ['companion','dead','downed','companionDormant','owner'] as const){
  const h=setup();wound(h.a);if(flag==='companion')h.a.companion=false;else if(flag==='owner')h.a.owner=undefined;else h.a[flag]=true;
  const before=view(h.a),expired=h.a.expiredStatuses;h.w.recoverCompanion(h.a);assert.deepEqual(view(h.a),before);assert.equal(h.a.expiredStatuses,expired);assert.equal(h.w.flashes.length,0);observe('recovery-refused:'+flag,h);
 }
 for(const flag of ['companion','dead','downed','companionDormant'] as const){
  const h=setup();h.a.downed=true;h.a.life=0;wound(h.a);if(flag==='companion')h.a.companion=false;else if(flag==='downed')h.a.downed=false;else h.a[flag]=true;
  const before=view(h.a);h.w.reviveCompanion(h.a);assert.deepEqual(view(h.a),before);assert.equal(h.w.flashes.length,0);observe('revival-refused:'+flag,h);
 }
 {
  const h=setup(),{good,oldExpired}=wound(h.a),life=h.a.life;h.w.recoverCompanion(h.a);
  assert.equal(h.a.life,life);assert(!h.a.statuses.some(s=>s.id==='poison'));assert(h.a.statuses.includes(good));
  assert.notEqual(h.a.expiredStatuses,oldExpired);assert.deepEqual(h.a.expiredStatuses,[oldExpired[1]]);assert.equal(h.a.expiredStatuses[0],oldExpired[1]);
  assert.equal(shelter(h.a).length,1);assert.equal(shelter(h.a)[0].remaining,3);assert.equal(h.a.companionReviveRemaining,1.75);assert.equal(h.w.flashes.length,0);observe('cleanse-retains-blessings-and-beneficial-expiry',h);
 }
 {
  const h=setup();wound(h.a);h.a.sheet.setSource('diagnostic-duration',[mod('effectDuration','increased',10)]);h.p.sheet.setSource('diagnostic-duration',[mod('effectDuration','increased',10)]);
  const add=(kind:string)=>{const b=h.w.createMonster('cinderkin',1,h.p.team,h.p);b.companion=true;b.bondGroup=kind;h.w.actors.push(b);return b;};
  add('other-host').downed=true;add('another-host');add('dead').dead=true;add('dormant').companionDormant=true;add('non-companion').companion=false;add('foreign').owner=h.w.createMonster('cinderkin',1,h.p.team);
  h.a.applyStatus(original.status,0,10,h.p.name);h.w.recoverCompanion(h.a);assert.equal(shelter(h.a).length,1);assert.equal(shelter(h.a)[0].remaining,1);observe('shared-pack-counts-downed-and-other-hosts',h);
  shelter(h.a)[0].remaining=.1;h.w.recoverCompanion(h.a);assert.equal(shelter(h.a).length,1);assert.equal(shelter(h.a)[0].remaining,1);observe('reapplication-replaces-short-window',h);
  COMPANION_CFG.recovery.divideByPack=false;h.w.recoverCompanion(h.a);assert.equal(shelter(h.a)[0].remaining,3);observe('undivided-budget-policy',h);
 }
 {
  const h=setup(),{oldExpired}=wound(h.a);COMPANION_CFG.recovery.cleanse=false;h.w.recoverCompanion(h.a);
  assert(h.a.statuses.some(s=>s.id==='poison'));assert.equal(h.a.expiredStatuses,oldExpired);assert.equal(shelter(h.a)[0].remaining,3);observe('cleanse-disabled-preserves-pending-expiries',h);
 }
 for(const seconds of [0,-3]){
  const h=setup();h.a.applyStatus(original.status,0,10,h.p.name);COMPANION_CFG.recovery.seconds=seconds;h.w.recoverCompanion(h.a);assert.equal(shelter(h.a).length,0);observe('nonpositive-budget-removes-old-shelter:'+seconds,h);
 }
 for(const duration of [0,-1]){
  const h=setup(),old=STATUS_DEFS[original.status].duration;h.a.applyStatus(original.status,0,10,h.p.name);
  try{STATUS_DEFS[original.status].duration=duration;h.w.recoverCompanion(h.a);assert.equal(shelter(h.a).length,0);observe('nonpositive-status-duration:'+duration,h);}finally{STATUS_DEFS[original.status].duration=old;}
 }
 {
  const h=setup();COMPANION_CFG.recovery.status='hwe_missing_recovery';wound(h.a);h.w.recoverCompanion(h.a);assert(!h.a.statuses.some(s=>s.id==='poison'));assert.equal(shelter(h.a).length,0);observe('missing-status-still-cleanses',h);
 }
 for(const fraction of [undefined,0,-1,2]){
  const h=setup();wound(h.a);h.a.downed=true;h.a.life=0;const host=h.w.companionBonds.host(h.a);assert(host);
  const cue=h.w.showRecoveryCue.bind(h.w);let called=0;h.w.showRecoveryCue=(actor,kind,inst)=>{assert.equal(actor,h.a);assert.equal(kind,'revive');assert.equal(inst,host);assert(!actor.downed);assert.equal(actor.companionReviveRemaining,undefined);assert.equal(actor.companionReviveDwell,0);assert.equal(shelter(actor).length,1);called++;cue(actor,kind,inst);};
  h.w.reviveCompanion(h.a,fraction);assert.equal(h.a.life,Math.max(1,h.a.maxLife()*(fraction??.5)));assert.equal(called,1);observe('revival-fraction:'+String(fraction),h);
 }
 {
  const h=setup();wound(h.a);h.a.downed=true;h.a.life=0;h.a.owner=undefined;h.w.reviveCompanion(h.a);
  assert(!h.a.downed);assert.equal(h.a.life,h.a.maxLife()*.5);assert(h.a.statuses.some(s=>s.id==='poison'));assert.equal(shelter(h.a).length,0);observe('ownerless-revival-skips-recovery-only',h);
 }
 {
  const h=setup();h.w.actors=[h.p];h.w.recoverCompanion(h.a);assert.equal(shelter(h.a)[0].remaining,3);observe('empty-pack-count-has-one-body-floor',h);
 }
 assert.equal(rows.length,25);writeFileSync(process.argv[2],JSON.stringify({scope:'original-companion-recovery/v1',rows}),{flag:'wx'});
}finally{Object.assign(COMPANION_CFG.recovery,original);restore();}
