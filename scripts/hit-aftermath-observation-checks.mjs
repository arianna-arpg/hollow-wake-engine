import assert from 'node:assert/strict';

// Positive behavior requirements complement whole-trace equality and deliberate
// original-source faults. Normal verification must never rewrite expectations.
export function assertHitAftermathObservations(data){
  assert.equal(data.schemaVersion,1);assert.equal(data.courses,260);assert.equal(data.rows.length,260);assert.equal(new Set(data.rows.map(r=>r.name)).size,260);
  const row=name=>{const r=data.rows.find(r=>r.name===name);assert(r,name);return r;};
  const end=r=>r.steps.at(-1).state,actor=(r,id=70)=>end(r).actors.find(a=>a.id===id);
  const calls=(r,kind)=>r.events.filter(e=>e.kind===kind&&e.phase==='before');
  const count=(name,kind,want)=>assert.equal(calls(row(name),kind).length,want,name+' '+kind);
  const hit=r=>r.events.find(e=>e.kind==='applied-hit'),damage=r=>hit(r)?.args[2].total;
  const map=(v,k)=>v.$map.find(([key])=>key===k)?.[1];
  const close=(a,b,label)=>assert(Number.isFinite(a)&&Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(b)),label+': '+a+' / '+b);
  const errors=data.rows.flatMap(r=>r.steps.filter(s=>!s.error.$undefined).map(s=>[r.name,s.error.name,s.error.message]));
  const faultRows=data.rows.filter(r=>r.name.includes('callback-error-'));assert.equal(faultRows.length,19);
  assert.deepEqual(errors,faultRows.map(r=>[r.name,'Error','aftermath fault: '+r.name.split('callback-error-')[1]]));
  for(const r of data.rows){assert(r.steps.length>0,r.name);for(const s of r.steps)for(const a of s.state.actors)assert(Number.isFinite(a.life),r.name+' finite life');}
  const plain=row('plain');assert(damage(plain)>0);close(actor(plain).life,9000-damage(plain),'plain life');
  const order=['knockFixtures','assaults.plant','applyThorns','challenges.beforeEffects','throngOnHit','assaults.afterHit','assaultDoomCull','challenges.afterHit','attackSequences.landed','companionBonds.onHit','actor-1-spendBuffs','actor-70-spendBuffs'];
  const positions=order.map(k=>plain.events.findIndex(e=>e.kind===k&&e.phase==='before'));assert(positions.every((n,i)=>n>=0&&(i===0||n>positions[i-1])),'complete native phase order');
  for(const name of ['zero','ward','shield']){const r=row('admission-'+name);assert.equal(damage(r),0);count(r.name,'knockFixtures',1);assert.equal(calls(r,'knockFixtures')[0].args[3],false);count(r.name,'applyThorns',1);count(r.name,'throngOnHit',0);count(r.name,'actor-1-spendBuffs',0);}
  for(const name of ['evade','block'])count('admission-'+name,'knockFixtures',0);
  count('admission-immune','knockFixtures',1);count('admission-immune','assaults.plant',0);assert.equal(calls(row('admission-immune'),'knockFixtures')[0].args[3],false);
  count('admission-no-damage','knockFixtures',0);count('admission-no-damage','challenges.beforeEffects',1);count('admission-forced','knockFixtures',1);
  for(const name of ['active','exact-ready','quiet','zero-icd','scaled','rounded-level'])count('volatile-'+name,'executeSkill',1);
  for(const name of ['zero-damage','lethal','dead','hidden','cooling','missing-skill','chance-fail'])count('volatile-'+name,'executeSkill',0);
  assert.equal(actor(row('volatile-active')).volatileReadyAt,5.5);assert.equal(actor(row('volatile-active')).ward,17);assert.equal(actor(row('volatile-zero-icd')).volatileReadyAt,4);assert.equal(actor(row('volatile-rounded-level')).volatileInst.level,3);
  assert.equal(calls(row('volatile-quiet'),'showCombatOutcome').filter(c=>c.args[1]==='volatile_release').length,0);
  assert.equal(calls(row('volatile-scaled'),'executeSkill')[0].args[3].dmgMult,.25);
  const reused=calls(row('volatile-reuses-instance'),'executeSkill');assert.equal(reused.length,2);assert.equal(reused[1].args[1].$origin,'cached-volatile');assert.equal(reused[1].args[1].level,1);
  const live=calls(row('volatile-live-cue-callback'),'executeSkill')[0];assert.equal(live.args[1].skill,'aftermath-other');assert.equal(live.args[3].dmgMult,0);assert.deepEqual(live.args[2],{x:812,y:607});
  for(const name of ['active','exact-ready','zero-icd','chance-one','skill-only','null-row'])count('element-'+name,'executeSkill',1);
  for(const name of ['zero-damage','lethal','dead','hidden','cooling','missing-skill','chance-zero','chance-fail','status-only','no-matching-type','multiple-types'])count('element-'+name,'executeSkill',0);
  assert.equal(actor(row('element-active')).onHitTypeReadyAt,4.8);assert.equal(actor(row('element-zero-icd')).onHitTypeReadyAt,4);
  assert.deepEqual(actor(row('element-multiple-types')).statuses.map(s=>s.id),['chill']);assert.deepEqual(actor(row('element-first-failed-chance')).statuses.map(s=>s.id),['chill']);
  assert.equal(calls(row('element-reuses-instance'),'executeSkill')[1].args[1].$origin,'cached-element');assert.equal(calls(row('element-live-row'),'executeSkill')[0].args[3].dmgMult,.3);
  for(const name of ['active','exact-ready','generation','delay-zero','custom'])assert.equal(end(row('contagion-'+name)).pendingContagions.length,1,name);
  for(const name of ['zero-damage','dead-caster','seen','cooling','missing-skill','max-zero','max-global','max-local','decay-zero','chance-zero'])assert.equal(end(row('contagion-'+name)).pendingContagions.length,0,name);
  const cg=end(row('contagion-active')).pendingContagions[0];assert.equal(cg.when,4.3);assert.equal(cg.gen,1);assert.equal(cg.damageScale,1);assert.equal(cg.level,1);assert.deepEqual(cg.seen.$set,[70]);
  assert.equal(end(row('contagion-delay-zero')).pendingContagions[0].when,4);assert.equal(end(row('contagion-custom')).pendingContagions[0].damageScale,.3);
  const shared=end(row('contagion-shared-set')).pendingContagions;assert.equal(shared.length,2);assert.equal(shared[0].seen.$origin,'chain-seen');assert.deepEqual(shared[0].seen.$set,[70,71]);assert(shared[1].seen.$ref,'native chain shares seen identity');
  assert.equal(end(row('contagion-support-precedence')).pendingContagions[0].damageScale,0);
  for(const[name,id]of [['active',71],['same-status',72],['other-tier',72],['tie',72],['refresh',71]]){const r=row('spread-'+name);count(r.name,'transplantStatus',1);assert.equal(calls(r,'transplantStatus')[0].args[0].$actor,id);assert(actor(r,id).statuses.some(s=>s.id==='burn'));}
  for(const name of ['none','zero','depth','outside','cross-story'])count('spread-'+name,'transplantStatus',0);
  for(const[name,want]of [['active',2],['same-instance',1],['absent-graft',1],['dead',1],['lethal',2],['depth',1],['zero',1],['two',3]])assert.equal(row('curse-'+name).events.filter(e=>e.kind==='applied-hit').length,want,name);
  for(const[name,want]of [['remove',2],['replace',3],['append',4]])assert.equal(row('curse-live-'+name).events.filter(e=>e.kind==='applied-hit').length,want,name);
  const echo=map(actor(row('echo-positive'),1).buffs,'echoing_might');assert(echo);close(echo.def.mods[0].value,damage(row('echo-positive'))*.25,'echo magnitude');
  for(const name of ['zero','negative','depth','zero-damage'])assert.equal(map(actor(row('echo-'+name),1).buffs,'echoing_might'),undefined,name);
  assert(actor(row('impale-composition')).statuses.some(s=>s.id==='impaled'&&s.rupture>0));
  count('dominate-active','createMonster',1);const thrall=actor(row('dominate-active'),74);assert.equal(thrall.owner.$actor,1);assert.equal(thrall.lifespan,3);assert.equal(thrall.sourceSkillId,'__dominate:observed-aftermath');
  for(const name of ['alive','depth','boss','missing','minion','cap','chance-fail','zero-max'])count('dominate-'+name,'createMonster',0);
  close(actor(row('grip-sever-other')).gripping.severed,.1+damage(row('grip-sever-other'))/10000,'grip sever');for(const name of ['self','zero'])assert.equal(actor(row('grip-sever-'+name)).gripping.severed,.1);
  close(actor(row('thorns-reflect'),1).life,9000-(20+damage(row('thorns-reflect'))*.5),'native thorns');assert.equal(actor(row('thorns-kills-caster'),1).dead,true);
  assert.equal(actor(row('iron-ward-cap')).ironWard.stored,500);close(actor(row('iron-ward-active')).ironWard.stored,10+damage(row('iron-ward-active')),'iron ward');for(const name of ['exact-expiry','expired','zero'])assert.equal(actor(row('iron-ward-'+name)).ironWard.stored,10);
  const share=row('minion-share-active'),moved=damage(share)*.5;close(actor(share).life,9000-damage(share)+moved,'share recovery');for(const id of [71,72])close(actor(share,id).life,9000-moved/2,'share recipient');
  const ceiling=row('minion-share-ceiling');assert(damage(ceiling)>0);count(ceiling.name,'executeSkill',1);
  const healed=ceiling.events.find(e=>e.kind==='actor-70-healBy'&&e.phase==='after');assert(healed,'native self-heal reaches sharing ceiling');
  assert.equal(healed.state.actors.find(a=>a.id===70).life,10000);assert.equal(actor(ceiling).life,10000);
  assert(ceiling.events.some(e=>e.kind==='get'&&e.actor===70&&e.args[0]==='minionShare'&&e.value===.5));
  for(const id of [71,72])close(actor(ceiling,id).life,9000-damage(ceiling)*.25,'ceiling still shares the full captured wound');
  for(const name of ['remove','change-owner','mark-dead'])close(actor(row('share-snapshot-'+name),72).life,9000-damage(row('share-snapshot-'+name))*.25,'snapshotted recipient '+name);
  for(const name of ['active','zero-damage','two','first-ineligible']){count('retaliate-'+name,'createMonster',1);assert.equal(map(actor(row('retaliate-'+name)).charges,'shard'),1);}
  for(const name of ['no-charge','cap','depth'])count('retaliate-'+name,'createMonster',0);
  for(const name of ['melee','ranged','buffet'])count('displacement-'+name,'pushActor',1);for(const name of ['pull','push'])count('displacement-'+name,'pushActor',2);for(const name of ['zero','zero-damage'])count('displacement-'+name,'pushActor',0);
  assert.equal(actor(row('current-life-active')).life,7200);assert.equal(actor(row('current-life-resisted')).life,8100);assert.equal(actor(row('current-life-cap')).life,1);assert.equal(actor(row('current-life-one-life')).life,1);for(const name of ['invulnerable','negative','zero'])assert.equal(actor(row('current-life-'+name)).life,9000);
  assert.equal(actor(row('current-life-multiple-elements')).hitFlashType,'lightning');assert.equal(actor(row('current-life-element-fallback')).hitFlashType,'lightning');
  assert(actor(row('composed-effects-and-riders')).statuses.some(s=>s.id==='chill'));assert(actor(row('composed-effects-and-riders')).statuses.some(s=>s.id==='burn'));
  for(const name of ['zero','depth'])count('splash-'+name,'strikeSurfaces',0);count('splash-active','strikeSurfaces',1);assert(actor(row('splash-active'),71).life<9000);assert.equal(actor(row('splash-other-tier'),71).life,9000);assert(actor(row('splash-radius-edge'),71).life<9000);assert.equal(actor(row('splash-radius-outside'),71).life,9000);
  assert.equal(end(row('hit-orbs-active')).orbs.length,4);assert.equal(end(row('hit-orbs-near-cap')).orbs.length,40);count('hit-orbs-near-cap','shedOrb',4);for(const name of ['cap','zero','depth','zero-rate','failed-chance'])count('hit-orbs-'+name,'shedOrb',0);
  for(const name of ['active','chance-below','rolled-element','two-elements'])assert.equal(end(row('remnant-'+name)).remnants.length,1,name);for(const name of ['zero','depth','chance-edge','no-element'])assert.equal(end(row('remnant-'+name)).remnants.length,0,name);assert.equal(end(row('remnant-cap')).remnants.length,14);
  count('bell-active','ringBell',1);count('bell-active','executeSkill',1);count('bell-cooling','executeSkill',0);count('bell-zero','ringBell',0);
  const recovery=actor(row('kill-recovery-lethal'),1);assert.deepEqual([recovery.life,recovery.mana,recovery.es],[9020,5030,40]);const cap=actor(row('kill-recovery-capped'),1);assert.deepEqual([cap.life,cap.mana,cap.es],[10000,10000,100]);
  for(const name of ['every','chance','gauge-due'])count('spawn-vein-'+name,'birthAt',1);for(const name of ['chance-fail','gauge-wait','inert','zero','depth','dead'])count('spawn-vein-'+name,'birthAt',0);
  const gauge=name=>calls(row(name),'attackSequences.landed')[0].args[1].sockets.at(-1).gauge;assert.equal(gauge('spawn-vein-gauge-due'),0);assert.equal(gauge('spawn-vein-gauge-wait'),1);
  assert(calls(row('proc-hit-normal'),'executeProc').length>0);assert(calls(row('proc-hit-lethal'),'executeProc').length>calls(row('proc-hit-normal'),'executeProc').length);
  assert.equal(map(actor(row('owner-carry-kill'),1).charges,'frenzy'),2);for(const name of ['active','missing','owner-dead','kill-chance-zero','kill-zero-amount','zero'])assert.equal(map(actor(row('owner-carry-'+name),1).charges,'frenzy')??0,0,name);
  for(const name of ['hit','crit','kill']){assert.equal(map(actor(row('consumption-'+name),1).buffs,'spent'),undefined);assert.equal(map(actor(row('consumption-'+name)).buffs,'hurt-spent'),undefined);}
  assert(map(actor(row('consumption-zero'),1).buffs,'spent'));assert.equal(actor(row('consumption-stride'),1).strideSpent,true);assert.equal(actor(row('consumption-no-condition'),1).strideSpent,false);
  for(const name of ['eligible','depth','stamp','trigger','spell','not-melee','zero'])assert.equal(calls(row('melee-trigger-'+name),'rollTriggers').filter(c=>c.args[1]==='meleeHit').length,name==='eligible'?1:0,name);
  for(const name of ['revive-after-capture','revive-before-final-kill']){const r=row('lethal-capture-'+name);assert.equal(actor(r,1).life,9017);assert.equal(actor(r).life,500);assert.equal(actor(r).dead,false);assert(calls(r,'actor-1-spendBuffs').some(c=>c.args[0]==='kill'));count(r.name,'kill',0);}
  for(const name of ['kill-after-capture','kill-in-attack-sequence']){const r=row('lethal-capture-'+name);assert.equal(actor(r,1).life,9000);assert.equal(actor(r).dead,true);assert(!calls(r,'actor-1-spendBuffs').some(c=>c.args[0]==='kill'));count(r.name,'kill',1);}
  count('throng-evolution-active','throngEvolutionBurst',1);assert(actor(row('throng-evolution-active'),72).life<9000);for(const name of ['not-attack','zero','depth','zero-scale'])count('throng-evolution-'+name,'throngEvolutionBurst',0);
  assert(actor(row('composed-stat-status')).statuses.some(s=>s.id==='poison'));
  assert(damage(row('spread-cross-story'))>0);assert(damage(row('splash-cross-story'))>0);assert.equal(actor(row('splash-cross-story'),71).life,9000);
  const context=calls(row('live-final-context'),'actor-1-spendBuffs')[0].args;assert(context[1].includes('attack'));assert.equal(context[2],'observed-aftermath');
  const captured=calls(row('live-packet-captured-damage'),'attackSequences.landed')[0].args;assert.equal(captured[3],damage(row('live-packet-captured-damage')));assert.equal(captured[4],0);
  assert.equal(row('nested-aftermath-hit').events.filter(e=>e.kind==='applied-hit').length,2);
  for(const r of faultRows){const seam=r.name.split('callback-error-')[1];assert(calls(r,seam).length>0,r.name+' reached intended failure');assert(!r.steps.at(-1).error.$undefined);}
  return {courses:data.courses,expectedCallbackErrors:19};
}
