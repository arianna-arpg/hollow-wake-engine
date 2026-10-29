import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {createDamagePipeline,HOLLOW_WAKE_DAMAGE_RULES}=await import(process.env.HWE_DAMAGE_MODULE
  ?pathToFileURL(process.env.HWE_DAMAGE_MODULE).href:'../dist/damage-pipeline.js');
const skill={def:{name:'Independent spell',baseDamage:{fire:[10,20]},addedEffectiveness:1},mods:[]};
function actor(values={}) {
  const stats={life:200,mana:100,damage:1,damageTaken:1,guardStrength:1,blockPower:1,poiseDamage:1,
    critMulti:2,esShred:1,insightEfficiency:1,fireResMax:.75,coldResMax:.75,lightningResMax:.75,chaosResMax:.75,...values};
  const a={id:1,level:1,life:150,mana:60,reservedMana:0,es:0,esDelay:0,esRecharging:false,esBroke:false,
    ward:0,absorb:0,absorbLayers:new Map(),insight:0,poise:0,poiseBroken:false,endurance:0,enduranceDelay:0,
    dead:false,downed:false,invulnerable:false,evadeEntropy:0,evadeWindow:0,plies:0,lastGaspCd:0,lastGaspSpan:0,gasped:false,
    hitFlash:0,aiNerve:1,statuses:[],activeAuras:new Map(),restoreStreams:[],gainEvents:[],
    get absorbTotal(){return this.absorb+[...this.absorbLayers.values()].reduce((n,l)=>n+l.amount,0);},
    sheet:{get(id,_tags,extra){return (stats[id]??0)+(extra??[]).filter(m=>m.stat===id).reduce((n,m)=>n+m.value,0);},
      armedFamily(prefix,ids){return ids.filter(id=>stats[prefix+id]!==undefined);},removeSource(){}},
    maxLife(){return stats.life;},maxPoise(){return stats.poise??0;},effectiveWeight(){return stats.weight??1;},insightMomentum(){return 1;},
    damagePoise(n){this.poise=Math.max(0,this.poise-n);return this.poise===0;},ledgerCap(){return 30;},
    applyStatus(id){this.statuses.push({id,stacks:1});},stanceRead(){return null;},
    healBy(n){const before=this.life;this.life=Math.min(stats.life,this.life+Math.max(0,n));return this.life-before;},
    gainWard(n){this.ward+=n;return n;},gainEs(n){this.es+=n;return n;},gainPoise(n){this.poise+=n;return n;},
    availableMaxMana(){return stats.mana;},staggerDamage(n){this.stagger=(this.stagger??0)+n;},stats};
  return a;
}
function context(overrides={},rules) {
  let draws=0;const events=[];
  const ports={random(){draws++;return .5;},instanceMods:i=>[...(i.mods??[])],instanceInnateMods:i=>[...(i.mods??[])],
    skillContextTags:(_i,extra=[])=>new Set(['spell',...extra]),travelProtected:()=>false,weakPointBonus:()=>0,plyFloor:()=>1,
    dominantType:amounts=>Object.keys(amounts).sort((a,b)=>amounts[b]-amounts[a])[0],stampSegment(){},feedWound:()=>false,
    resourceFlow:(a,b,r,n)=>events.push(['flow',r,n]),boundToAbsorb:()=>false,
    onHit:(_a,_b,result)=>events.push(['hit',result.total]),onDot:(_a,n)=>events.push(['dot',n]),...overrides};
  return {runtime:createDamagePipeline(ports,rules),ports,events,get draws(){return draws;}};
}
const packet=(amounts={fire:100},tags=['spell'])=>({amounts,tags:new Set(tags),crit:false,sourceName:'independent'});
const near=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('damage: independent armor, capped resistance and penetration arithmetic',()=>{
  const {runtime:r}=context(),a=actor({firePen:.2}),b=actor({armor:600,fireRes:1,fireResMax:.8});
  // 100 physical => 50, 100 fire => 40 after capped .8 minus .2.
  near(r.mitigateTyped(b,{physical:100,fire:100},{attacker:a}),90);
  assert.equal(r.resistValue(b,'physical'),0);
  a.stats.firePen=3;assert.equal(r.resistValue(b,'fire',{attacker:a}),-.75);
});
test('damage: independent ordered pool ledger',()=>{
  const {runtime:r}=context(),a=actor(),b=actor({insightDR:.2,poise:100,poiseDR:.25,enduranceDR:.5,manaShield:.5,staggerFrac:.5,hitCap:3});
  b.insight=100;b.poise=100;b.endurance=10;b.ward=2;b.absorb=3;b.es=5;
  b.activeAuras.set('ledger',{inst:{def:{delivery:{type:'aura',ledger:{source:'damageTaken',rate:.5}}}},ledger:{balance:0}});
  const result=r.applyHit(a,b,packet());
  // 100 -> insight 80 -> poise 60 -> endurance 50 -> ledger 25 -> ward 23
  // -> absorb 20 -> ES 15 -> mana 7.5 -> stagger 3.75 -> cap 3.
  assert.equal(result.total,3);assert.equal(result.clamped,true);assert.equal(b.life,147);
  assert.equal(b.insight,80);assert.equal(b.poise,69);assert.equal(b.endurance,0);
  assert.equal(b.activeAuras.get('ledger').ledger.balance,25);assert.equal(b.mana,52.5);assert.equal(b.stagger,3.75);
});
test('damage: block subtracts guard before spending defensive pools and skips sustain',()=>{
  const {runtime:r}=context(),a=actor({lifeLeech:1}),b=actor({blockChance:1});b.ward=10;
  const result=r.applyHit(a,b,packet());assert.equal(result.blockedAmount,15);assert.equal(result.total,75);
  assert.equal(b.life,75);assert.equal(a.life,150);assert.equal(result.crit,false);
});
test('damage: last gasp changes actual life loss while hit receipt retains mitigated total',()=>{
  const {runtime:r}=context(),a=actor(),b=actor({lastGasp:1,lastGaspLife:.1,lastGaspCooldown:4});b.life=5;
  assert.equal(r.applyHit(a,b,packet()).total,100);assert.equal(b.life,20);assert.equal(b.lastGaspCd,4);assert.equal(b.gasped,true);
  b.lastGaspCd=0;b.life=50;assert.equal(r.landLifeDamage(b,100),30);
});
test('damage: outgoing conversion cascades; incoming conversion uses original amounts',()=>{
  const {runtime:r}=context(),a=actor({convert_physical_fire:1,convert_fire_cold:1,extraAs_fire:.2,extraAs_chaos:.1});
  const amounts={physical:100};r.applyConversion(a,amounts,new Set());assert.deepEqual(amounts,{cold:100,fire:20,chaos:10});
  const b=actor({takenAs_physical_fire:1,takenAs_fire_cold:1}),input={physical:100};
  assert.deepEqual(r.receiveDamageAs(b,input),{physical:0,fire:100});assert.deepEqual(input,{physical:100});
  assert.equal(r.receiveDamageAs(actor(),input),input);
});
test('damage: incoming conversion over 100 percent conserves each original type',()=>{
  const {runtime:r}=context(),b=actor({takenAs_physical_fire:1.5,takenAs_physical_cold:.5});
  assert.deepEqual(r.receiveDamageAs(b,{physical:100}),{physical:0,fire:75,cold:25});
});
test('damage: DoT bypasses hit defenses but follows shield bypass and actual-life-loss gate',()=>{
  const c=context(),r=c.runtime,b=actor({armor:10000,fireRes:.75,damageTaken:1,hitCap:1,esDotResist:.2,esDotBypass:.5,energyShield:100,esRechargeDelay:4});
  b.es=50;b.plies=5;const landed=r.applyDot(b,100,'fire');
  assert.equal(landed,40);assert.equal(b.es,10);assert.equal(b.esDelay,4);assert.equal(b.plies,5);assert.equal(c.draws,0);
});
test('damage: shield drain can mark break and hit consumes recharge roll even behind ward',()=>{
  const c=context(),r=c.runtime,a=actor(),b=actor({energyShield:100,esRechargeSteadfast:1});
  b.es=10;b.esRecharging=true;b.ward=200;r.applyHit(a,b,packet());assert.equal(c.draws,2);assert.equal(b.es,10);
  b.ward=0;r.applyHit(a,b,packet());assert.equal(b.es,0);assert.equal(b.esBroke,true);
});
test('damage: preview is random-free; flat added damage and lucky rolls retain draw count',()=>{
  const c=context(),r=c.runtime,a=actor({addedFire:5,luckyChance:1});
  assert.deepEqual(r.skillDamageBands(a,skill).bands,{fire:{lo:15,hi:25}});assert.equal(c.draws,0);
  const p=r.rollSkillDamage(a,skill);assert.equal(p.amounts.fire,20);assert.equal(p.rollT,.5);assert.equal(c.draws,5);
});
test('damage: crit avoidance mutates packet before status and off-target taunt scaling',()=>{
  const {runtime:r}=context(),a=actor({damageVs_burning:.5}),b=actor({critAvoid:1});b.id=2;
  a.statuses.push({id:'taunted',stacks:1,casterId:3});b.statuses.push({id:'burning',stacks:2});
  const p=packet();p.crit=true;const result=r.applyHit(a,b,p);assert.equal(p.crit,false);assert.equal(p.amounts.fire,70);assert.equal(result.total,70);
});
test('damage: plies consume the hit after pools and before life',()=>{
  const {runtime:r}=context(),a=actor({plyRend:1}),b=actor();b.ward=10;b.plies=2;b.plySpec={spentStatus:'spent'};
  const result=r.applyHit(a,b,packet());assert.equal(result.total,0);assert.equal(result.plyEaten,true);assert.equal(b.ward,0);
  assert.equal(b.life,150);assert.equal(b.plies,0);assert.equal(b.statuses[0].id,'spent');
});
test('damage: life interceptors are live and nested calls have no shared scratch',()=>{
  const {runtime:r}=context(),b=actor();let nested=false;
  b.lifeDamageInterceptors=new Map([['first',n=>{if(!nested){nested=true;r.applyDot(b,4);b.lifeDamageInterceptors.set('late',x=>x*.5);}return n;}]]);
  assert.equal(r.landLifeDamage(b,100),50);assert.equal(b.life,96);
});
test('damage: absorb replacement retains the original snapshot semantics',()=>{
  const {runtime:r}=context(),b=actor(),events=[];
  b.absorbLayers.set('a',{amount:10,remaining:1,source:skill,ended:reason=>{events.push(reason);b.absorbLayers.set('b',{amount:999,remaining:5,source:skill,ended:()=>events.push('replacement')});}});
  b.absorbLayers.set('b',{amount:20,remaining:1,source:skill,ended:reason=>events.push('old-'+reason)});
  assert.equal(r.spendAbsorbLayers(b,50),20);assert.equal(b.absorbLayers.size,0);assert.deepEqual(events,['broken','old-broken']);
});
test('damage: absorption expiry is silent for dead/downed and uses the tolerance',()=>{
  const {runtime:r}=context(),b=actor(),events=[];
  b.absorbLayers.set('a',{amount:10,remaining:1,source:skill,ended:reason=>events.push(reason)});r.tickAbsorbLayers(b,1-5e-10);
  assert.equal(b.absorbLayers.size,0);assert.deepEqual(events,['expired']);
  b.downed=true;b.absorbLayers.set('b',{amount:10,remaining:0,source:skill,ended:reason=>events.push(reason)});r.tickAbsorbLayers(b,0);assert.deepEqual(events,['expired']);
});
test('damage: callback failure preserves completed writes and suppresses later observer',()=>{
  const c=context(),a=actor(),b=actor();b.ward=10;b.absorbLayers.set('a',{amount:10,remaining:1,source:skill,ended(){throw new Error('expected');}});
  assert.throws(()=>c.runtime.applyHit(a,b,packet()),/expected/);assert.equal(b.ward,0);assert.equal(b.absorbLayers.size,0);assert.equal(b.life,150);assert.deepEqual(c.events,[]);
});
test('damage: sustain and cull use post-soak total, with actual capped recovery',()=>{
  const c=context(),r=c.runtime,a=actor({lifeLeech:.2,wardLeech:.1,esOnHit:5,manaLeech:.5,poiseOnHit:2,cullThreshold:.3}),b=actor({recuperate:.2,recuperateTime:2});
  a.life=195;const result=r.applyHit(a,b,packet());assert.equal(result.culled,true);assert.equal(b.life,0);assert.equal(a.life,200);
  assert.equal(a.gainEvents.length,1);assert.equal(a.gainEvents[0].n,5);assert.equal(a.ward,10);assert.equal(a.es,5);assert.equal(a.mana,100);assert.equal(a.poise,2);assert.deepEqual(b.restoreStreams,[{resource:'life',perSec:10,remaining:20}]);
});
test('damage: configuration is copied and services keep independent random streams',()=>{
  const rules=structuredClone(HOLLOW_WAKE_DAMAGE_RULES),c=context({},rules);rules.armor.k=1;
  assert.equal(c.runtime.mitigateTyped(actor({armor:600}),{physical:100}),50);
  const second=context();c.runtime.rollSkillDamage(actor(),skill);assert.equal(second.draws,0);
  assert(Object.isFrozen(c.runtime));assert(Object.isFrozen(HOLLOW_WAKE_DAMAGE_RULES.slayer.regicideRarities));
  assert.throws(()=>context({}, {...rules,armor:{k:0}}),RangeError);
});
test('damage: semantic hooks receive actual references and source parameters',()=>{
  const a=actor(),b=actor(),calls=[];b.segHitPending=2;
  const c=context({weakPointBonus:t=>{assert.equal(t,b);return .1;},stampSegment:(t,s)=>calls.push(['stamp',t===b,s]),feedWound:(t,s,n)=>{calls.push(['wound',t===b,s,n]);return true;},onHit:(x,y,result,p)=>{assert.equal(x,a);assert.equal(y,b);assert.equal(p.tags.has('spell'),true);calls.push(['hit',result.total]);}});
  near(c.runtime.applyHit(a,b,packet()).total,110);assert.equal(b.segHitPending,undefined);assert.deepEqual(b.segTears,[2]);assert.equal(calls[0][0],'stamp');assert.equal(calls[1][0],'wound');assert.equal(calls[2][0],'hit');
});
