// Original-only contact supplement. Cinderkin consumes a ply; zombie loses life.
// The earlier dispatch-only observations remain unchanged.
// A diagnostic innate grants an authored seal; this is not an authored item.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {mod} from '../src/engine/stats';import {MONSTERS} from '../src/data/monsters';
bootSimEngine();const restore=seedGlobalRandom(0x4791),rows:unknown[]=[];
try{
 for(const target of ['cinderkin','zombie'] as const)
 for(const [label,held,fraction]of [['sampled-build',2,.5],['later-acknowledgement',4,.125]] as const){
  const w=makeSimWorld('tamer',0x4791);w.walk=null;const p=w.player,oldClass=w.meta.classDef;
  assert(!w.meta.knownSkills.has('mortis_seal'));
  w.meta.classDef={...oldClass,innate:[...(oldClass.innate??[]),mod('skillgrant_mortis_seal','flat',3)]};w.recalcPlayer();
  const grant=w.localSeat.grantedInsts?.get('mortis_seal');assert(grant);p.skills[0]=grant;
  const enemy=w.createMonster(target,30,'enemy');enemy.pos={x:p.pos.x+25,y:p.pos.y};enemy.life=100000;w.actors=[p,enemy];
  w.executeSkill(p,grant,{...p.pos},{noCooldown:true,noRepeat:true});assert(p.activeAuras.has('mortis_seal'));assert.notEqual(p.lifeSealAt,undefined);
  const since=p.activeAuras.get('mortis_seal')!.since!;w.time=since+held;p.life=p.maxLife()*fraction;
  const beforeLife=p.life,beforeMana=p.mana,beforeEnemy=enemy.life,beforePlies=enemy.plies,calls:unknown[]=[];const execute=w.executeSkill.bind(w);
  w.executeSkill=(...args:Parameters<typeof w.executeSkill>)=>{if(args[1].def.id==='death_knell')calls.push({skill:args[1].def.id,level:args[1].level,mult:args[3]?.dmgMult,life:args[0].life,barOwnsOldGrant:args[0].skills.includes(grant),time:w.time});return execute(...args);};
  w.meta.classDef=oldClass;w.recalcPlayer();
  assert(!p.activeAuras.has('mortis_seal'));assert.equal(p.lifeSealAt,undefined);assert(!w.localSeat.grantedInsts?.has('mortis_seal'));assert(!p.skills.includes(grant));assert.equal(calls.length,1);
  const expected=Math.min(2.8,1+.35*held)*(1+1.2*(1-fraction));assert.equal((calls[0] as {mult:number}).mult,expected);assert.equal(p.life,beforeLife);assert.equal(p.mana,beforeMana);
  if(target==='cinderkin'){assert.equal(beforePlies,4);assert.equal(enemy.plies,3);assert.equal(enemy.life,beforeEnemy);}
  else{assert.equal(beforePlies,0);assert(enemy.life<beforeEnemy,'The ordinary target must actually lose life');}
  rows.push({target,label,held,fraction,calls,enemyPliesBefore:beforePlies,enemyPliesAfter:enemy.plies,enemyLifeSpent:beforeEnemy-enemy.life,enemyStatuses:enemy.statuses,ownerLife:p.life,ownerMana:p.mana,auraRetired:!p.activeAuras.has('mortis_seal'),sources:p.sheet.sourceNames()});
 }
 const first=(rows[0] as {calls:{mult:number}[]}).calls[0].mult,last=(rows[1] as {calls:{mult:number}[]}).calls[0].mult;assert(last>first,'Acknowledgement must use current time and wounds');
 // Silent retirement is not universally equivalent to setting dead: authored
 // brain death actions remain active even though bounty/death charges are quiet.
 const def=Object.values(MONSTERS).find(d=>d.brain?.onDeath?.some(a=>a.do==='summon'&&a.monster==='vile_spawn'));assert(def);
 const w=makeSimWorld('tamer',0x4791);w.walk=null;const p=w.player,body=w.createMonster(def.id,1,p.team,p);w.actors=[p,body];
 w.kill(body,true);assert(body.dead);const spawned=w.actors.filter(a=>a!==p&&a!==body);assert.equal(spawned.length,2);assert(spawned.every(a=>a.defId==='vile_spawn'));
 rows.push({label:'silent-retirement-keeps-authored-death-actions',definition:def.id,dead:body.dead,spawned:spawned.map(a=>({definition:a.defId,team:a.team,owner:a.owner?.defId??a.owner?.name,life:a.life,level:a.level}))});
 assert.equal(rows.length,5);writeFileSync(process.argv[2],JSON.stringify({scope:'original-build-retirement-contact/v1',rows}),{flag:'wx'});
}finally{restore();}
