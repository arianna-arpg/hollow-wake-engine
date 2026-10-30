import assert from 'node:assert/strict';

// Independent admission, arithmetic, ordering and partial-write requirements.
// Exact full native traces and source mutation controls are separate checks.
export function assertHitReactionObservations(data){
  assert.equal(data.schemaVersion,1);assert.equal(data.courses,136);assert.equal(data.rows.length,136);assert.equal(new Set(data.rows.map(r=>r.name)).size,136);
  const row=name=>{const r=data.rows.find(r=>r.name===name);assert(r,name);return r;};
  const calls=(r,kind)=>r.events.filter(e=>e.kind===kind&&e.phase==='before');
  const end=r=>calls(r,'knockFixtures').at(-1)?.state??r.steps.at(-1).state;
  const actor=(r,id=70)=>end(r).actors.find(a=>a.id===id),final=(r,id=70)=>r.steps.at(-1).state.actors.find(a=>a.id===id);
  const result=r=>r.events.find(e=>e.kind==='applied-hit')?.args[2],damage=r=>result(r).total;
  const map=(value,key)=>value.$map.find(([k])=>k===key)?.[1];
  const close=(a,b,message)=>assert(Number.isFinite(a)&&Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(b)),message+': '+a+' / '+b);
  const expectedFaults=['bumpDrives','releasePrimedPours','tapCharges','rouseOnWound','sweepDefenseEvents','bankDamageTakenTriggers','fragile','es-break'];
  assert.deepEqual(data.rows.flatMap(r=>r.steps.filter(s=>!s.error.$undefined).map(s=>[r.name,s.error.message])),expectedFaults.map(s=>['callback-error-'+s,'reaction fault: '+s]));
  for(const r of data.rows){assert(r.steps.length>0);for(const s of r.steps)for(const a of s.state.actors)assert(Number.isFinite(a.life),r.name+' finite life');}
  const plain=row('plain');assert(damage(plain)>0);assert.equal(actor(plain,1).lastCombatAt,4);assert.equal(actor(plain).lastCombatAt,4);assert.equal(actor(plain).aiHitAt,4);assert.equal(actor(plain).aiHitById,1);assert.equal(actor(plain,1).lastFoeId,70);assert.equal(actor(plain,1).lastFoeAt,4);
  assert.equal(actor(plain).recentHurt,0);assert.equal(actor(plain).alertUntil,10);assert.equal(actor(plain).aggroed,false);
  assert.deepEqual(calls(plain,'bumpDrives').map(e=>[e.args[0].$actor,e.args[1]]),[[70,'onHurt'],[1,'onDealt']]);
  assert.deepEqual(calls(plain,'tapCharges').map(e=>[e.args[0].$actor,e.args[1],e.args[4].$actor]),[[1,'hit',70],[70,'takeHit',1]]);
  const sequence=['bumpDrives','releasePrimedPours','tapCharges','rouseOnWound','sweepDefenseEvents','bankDamageTakenTriggers','knockFixtures'];
  const positions=sequence.map(k=>plain.events.findIndex(e=>e.kind===k&&e.phase==='before'));assert(positions.every((n,i)=>n>=0&&(i===0||n>positions[i-1])));
  for(const kind of ['zero','ward','shield']){const r=row('admission-'+kind);assert.equal(damage(r),0);assert.equal(actor(r).lastCombatAt,4);assert.equal(map(actor(r).buffs,'fragile'),undefined);assert.equal(calls(r,'releasePrimedPours').length,0);assert.equal(calls(r,'bankDamageTakenTriggers').length,0);assert.equal(calls(r,'tapCharges').length,2);}
  for(const kind of ['evade','block','immune','no-damage']){const r=row('admission-'+kind);assert.equal(calls(r,'bumpDrives').length,0);assert.equal(actor(r).lastCombatAt,r.steps[0].before.actors.find(a=>a.id===70).lastCombatAt);assert(map(actor(r).buffs,'fragile'));}
  for(const depth of [-1,0,1,3]){const r=row('depth-'+depth);assert.equal(calls(r,'tapCharges').length,depth===0?2:0);assert.equal(actor(r,1).casting.hitSpool,depth===0?5:4);assert.equal(map(actor(r).buffs,'fragile'),undefined);assert.equal(calls(r,'sweepDefenseEvents')[0].args[1],depth);}
  for(const name of ['self','friendly','enemy-pair']){const r=row('relation-'+name),id=name==='self'?1:name==='enemy-pair'?71:1;assert.equal(actor(r,id).lastFoeId,r.steps[0].before.actors.find(a=>a.id===id).lastFoeId);}
  for(const depth of [0,1])for(const tier of [undefined,0,7]){const r=row('origin-'+depth+'-'+String(tier)),a=actor(r);assert.deepEqual([a.alertFrom.x,a.alertFrom.y],[17,29]);assert.equal(a.alertTier,tier??actor(r,1).tier);assert.equal(a.alertFrom.$origin,undefined,'evidence position is copied');}
  for(const factor of [0,.5,2])assert.equal(actor(row('alert-scale-'+factor)).alertUntil,4+6*factor);assert.equal(actor(row('existing-alert')).alertUntil,100);
  for(const tw of [undefined,0,-1,.5,2])for(const gen of [0,1,2]){const r=row('threat-'+String(tw)+'-'+gen),factor=tw??1,want=factor>0&&gen>0?damage(r)*factor*gen:0;close(map(actor(r).threat,1)??0,want,r.name);assert.equal(calls(r,'actor-70-addThreat').length,want>0?1:0);}
  for(const override of [null,0,3]){const r=row('threat-tuning-'+String(override));close(map(actor(r).threat,1)??0,damage(r)*(override??2),r.name);}
  for(const[name,factor]of [['threat-context-and-live-mods',2],['live-threat-brain',3]]){const r=row(name);close(map(actor(r).threat,1),damage(r)*factor,name);}
  assert.equal(map(actor(row('drive-jumps'),1).drives,'wrath'),.25);assert.equal(map(actor(row('drive-jumps')).drives,'wrath'),.5);
  for(const depth of [0,1]){const r=row('charge-banks-'+depth);assert.equal(map(actor(r,1).charges,'frenzy')??0,depth===0?2:0);assert.equal(map(actor(r).charges,'endurance')??0,depth===0?3:0);}
  assert.equal(actor(row('primed-pour-land')).ward,17);assert.equal(actor(row('primed-pour-land')).primedPours.length,0);
  for(const kind of ['zero','dead']){assert.equal(actor(row('primed-pour-'+kind)).ward,0);assert.equal(actor(row('primed-pour-'+kind)).primedPours.length,1);}
  close(actor(row('damage-trigger-bank-false')).skills[0].state.trigAccum,damage(row('damage-trigger-bank-false')),'native trigger bank');assert.equal(actor(row('damage-trigger-bank-true')).skills[0].state.trigAccum,undefined);
  for(const elapsed of [.39,.4,.41,1]){const r=row('loot-spill-'+elapsed),spilled=elapsed>.4;assert.equal(actor(r).lootSack.length,spilled?1:2);assert.equal(end(r).drops.length,spilled?1:0);if(spilled){assert.equal(end(r).drops[0].item.$origin,'last-loot');assert.equal(end(r).drops[0].item.count,7);assert.equal(actor(r).lastSpillAt,elapsed);}}
  assert.equal(end(row('loot-spill-empty')).drops.length,0);assert.equal(calls(row('essence-native'),'bankEssenceSpill').length,1);assert.equal(actor(row('essence-native')).essenceSpilled,1);
  for(const kind of ['zero','missing-definition','missing-spill'])assert.equal(calls(row('essence-'+kind),'bankEssenceSpill').length,0);
  assert.deepEqual(calls(row('fragile-mixed-order'),'actor-70-removeBuff').map(e=>e.args[0]),['first','last']);assert.deepEqual(actor(row('fragile-mixed-order')).buffs.$map.map(([id])=>id),['kept']);
  for(const[change,want]of [['append',['first','last','appended']],['remove-next',['first']],['replace-map',['first','last']]])assert.deepEqual(calls(row('fragile-callback-'+change),'actor-70-removeBuff').map(e=>e.args[0]),want);
  for(const initial of [undefined,0,4])assert.equal(actor(row('channel-spool-'+String(initial)),1).casting.hitSpool,(initial??0)+1);
  assert.equal(actor(row('channel-callback-cancel'),1).casting,null);assert.equal(actor(row('channel-callback-replace'),1).casting.hitSpool,9);assert.equal(actor(row('channel-callback-change-mode'),1).casting.hitSpool,4);
  for(const roll of [.49,.5,.51])assert.equal(end(row('orb-chance-cap-'+roll)).orbs.length,roll<.5?4:0);
  for(const kind of ['construct','zero-rate','depth'])assert.equal(calls(row('orb-gate-'+kind),'shedOrb').length,0);
  assert.equal(end(row('orb-gate-zero-damage')).orbs.length,1);assert.equal(calls(row('orb-gate-cap'),'shedOrb').length,0);
  assert.equal(end(row('orb-near-cap')).orbs.length,40);assert.equal(calls(row('orb-near-cap'),'shedOrb').length,4);
  assert.equal(row('orb-registry-live-between-hits').events.filter(e=>e.kind==='get'&&e.args[0]==='orbOnHurt_reaction_extra').length,1);
  assert.equal(actor(row('rouse-native')).aiAwakened,true);assert.equal(actor(row('rouse-native'),71).aiAwakened,true);
  assert.equal(actor(row('ambush-native')).ambushArmed,false);assert.equal(actor(row('ambush-native'),71).ambushArmed,false);
  for(const gate of ['eligible','exact-radius','other-tier','existing-origin'])assert.equal(actor(row('stealth-peer-'+gate),71).alertUntil,8);
  for(const gate of ['dead','other-team','outside'])assert.equal(actor(row('stealth-peer-'+gate),71).alertUntil,0);
  const prior=actor(row('stealth-peer-existing-origin'),71);assert.deepEqual([prior.alertFrom.x,prior.alertFrom.y,prior.alertTier],[1,2,6]);assert.equal(actor(row('stealth-peer-existing-alert'),71).alertUntil,100);
  for(const change of ['move-next','team-next'])assert.equal(actor(row('stealth-write-'+change),72).alertUntil,0);assert.equal(actor(row('stealth-write-replace-list'),72).alertUntil,8);
  assert.equal(actor(row('stealth-write-remove-next'),72).alertUntil,0);assert.equal(actor(row('stealth-write-remove-next'),73).alertUntil,8);assert.equal(actor(row('stealth-write-append-new'),74).alertUntil,8);
  for(const gate of ['fresh','existing-point','zero-damage']){const a=actor(row('watch-'+gate));assert.equal(a.watchS,.6);assert.equal(a.watchRung,2);assert.equal(a.watchFedAt,4);}
  assert.equal(actor(row('watch-existing-point')).watchAt.$origin,'watch-point');assert.equal(actor(row('watch-high-rung')).watchS,.9);assert.equal(actor(row('watch-high-rung')).watchRung,8);
  for(const gate of ['aggroed','friendly','self'])assert.equal(actor(row('watch-'+gate),gate==='self'?1:70).watchS,0);
  for(const life of [1,1000,4000,9000])assert.equal(end(row('incoming-life-'+life)).lowLifeHitFlash,life===1000?.45:0);
  assert.equal(result(row('outcome-crit')).crit,true);assert.equal(result(row('outcome-poise-break')).poiseBroke,true);assert.equal(result(row('outcome-hit-cap')).clamped,true);assert.equal(result(row('outcome-cull')).culled,true);
  for(const[name,event]of [['outcome-shield-break','esBreak'],['outcome-poise-break','poiseBreakDealt'],['captured-and-live-poise-flag','poiseBreakDealt']])assert(calls(row(name),'rollOwnProcs').some(e=>e.args[1]===event));
  assert.equal(actor(row('outcome-shield-break')).esBroke,false);
  for(const[name,event]of [['outcome-hit-cap','hit_cap'],['outcome-cull','culled'],['captured-and-live-cull-flag','culled'],['captured-and-live-clamp-flag','hit_cap']])assert(calls(row(name),'showCombatOutcome').some(e=>e.args[1]===event));
  for(const depth of [undefined,0,3]){const r=row('trigger-depth-'+String(depth));for(const event of ['crit','highRoll']){const call=calls(r,'rollTriggers').find(e=>e.args[1]===event);assert(call,r.name+' must reach '+event);assert.equal(call.args[2].depth,depth??0);assert.equal(call.args[2].sourceInst.$origin,'instance-1');}close(calls(r,'rollTriggers').find(e=>e.args[1]==='highRoll').args[2].rollT,.25,'native ranged roll');}
  assert(calls(row('captured-and-live-crit-flag'),'rollTriggers').some(e=>e.args[1]==='crit'));
  const numberText=calls(row('captured-and-live-crit-flag'),'text').find(e=>e.args[4]==='dmg');assert.equal(numberText.args[2],'#ffffff');
  assert(!calls(row('captured-and-live-roll-undefined'),'rollTriggers').some(e=>e.args[1]==='highRoll'));assert.equal(calls(row('captured-and-live-roll-zero'),'rollTriggers').find(e=>e.args[1]==='highRoll').args[2].rollT,0);
  assert.equal(calls(row('captured-and-live-trigger-depth'),'rollTriggers').find(e=>e.args[1]==='crit').args[2].depth,5);
  const moved=calls(row('captured-and-live-move-target'),'rollTriggers').find(e=>e.args[1]==='crit').args[2].aim;assert.deepEqual([moved.x,moved.y],[17,29]);
  const captured=row('captured-and-live-dealt');assert.equal(end(captured).results[0].total,9999);close(map(actor(captured).threat,1),damage(captured),'captured damage drives threat');close(calls(captured,'bankDamageTakenTriggers')[0].args[1],damage(captured),'captured damage bank');
  assert.equal(final(row('callback-error-es-break')).esBroke,false,'clear precedes callback failure');assert(map(final(row('callback-error-fragile')).buffs,'fragile'),'failure before removal retains buff');
  for(const seam of expectedFaults){const r=row('callback-error-'+seam);assert.equal(calls(r,'knockFixtures').length,0);assert.equal(final(r).lastCombatAt,4);}
  assert.equal(row('nested-reaction-hit').events.filter(e=>e.kind==='applied-hit').length,2);assert.equal(calls(row('nested-reaction-hit'),'bankDamageTakenTriggers').length,2);
  const clock=row('live-clock-between-stamps');assert.equal(actor(clock,1).lastCombatAt,4);assert.equal(actor(clock).lastCombatAt,5);assert.equal(actor(clock).aiHitAt,5);
  return true;
}
