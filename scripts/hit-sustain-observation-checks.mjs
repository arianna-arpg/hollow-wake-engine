import assert from 'node:assert/strict';

// These assertions check that named courses reach the intended original behavior.
// Full traces (including query order and borrowed identities) are compared separately.
export function assertHitSustainObservations(data) {
  assert.equal(data.schemaVersion,1);assert.equal(data.courses,98);assert.equal(data.rows.length,98);
  assert.equal(new Set(data.rows.map(r=>r.name)).size,98);
  const row=name=>{const r=data.rows.find(r=>r.name===name);assert(r,name);return r;};
  const events=(r,kind)=>r.events.filter(e=>e.kind===kind);
  const heals=r=>r.events.slice(r.events.findIndex(e=>e.kind==='applied-hit')+1).filter(e=>e.kind==='heal');
  const pairs=r=>heals(r).map(e=>[e.actor,e.amount]);
  const final=r=>r.steps.at(-1).state;
  const actor=(r,id)=>final(r).actors.find(a=>a.id===id);
  const dealt=r=>events(r,'applied-hit')[0]?.args[2].total;
  const expectedErrors=[['siphon-callback-failure','siphon callback fault'],['share-callback-failure','share callback fault'],['bond-callback-failure','bond callback fault'],['share-text-failure','share text fault'],['tree-write-failure','tree write fault']];
  assert.deepEqual(data.rows.flatMap(r=>r.steps.filter(s=>!s.error.$undefined).map(s=>[r.name,s.error.message])),expectedErrors);
  for(const r of data.rows){
    const failures=r.steps.filter(s=>!s.error.$undefined).length;
    assert.equal(events(r,'before-effects').length,r.name==='nested-heal-hit'?2:r.steps.length-failures,r.name+' continuation');
    for(const s of r.steps)for(const a of s.state.actors)assert.equal(typeof a.life,'number',r.name+' life');
    if(r.name!=='siphon-no-damage')assert(events(r,'applied-hit').length>0,r.name+' real damage');
  }
  assert.deepEqual(heals(row('plain')),[]);
  for(const depth of [-1,0,1,3]){
    const r=row('all-lanes-depth-'+depth),d=dealt(r);assert(d>0);
    assert.deepEqual(pairs(r),depth===0?[[1,d*.5],[71,d*.25],[72,d*.25],[73,d*.25],[71,d*.5]]:[[1,d*.5]],r.name);
    assert.equal(actor(r,72).construct.stored,depth===0?40+d:40,r.name);
  }
  for(const name of ['siphon-undefined','siphon-0','siphon-dead','siphon-zero-damage','siphon-ward','siphon-no-damage'])assert.equal(heals(row(name)).length,0,name);
  for(const name of ['siphon-zero-damage','siphon-ward'])assert.equal(dealt(row(name)),0,name);
  for(const [name,factor]of [['siphon--0.5',-.5],['siphon-0.5',.5],['siphon-downed',.5],['siphon-heal-power',1]]){
    const r=row(name);assert.deepEqual(pairs(r),[[1,dealt(r)*factor]]);
  }
  assert.equal(actor(row('siphon-full'),1).life,10000);assert.equal(actor(row('siphon-sealed'),1).life,9010);
  assert.equal(actor(row('siphon-heal-taken'),1).life,9000+dealt(row('siphon-heal-taken'))*.5*.5);
  for(const kind of ['default','disabled','custom'])for(const id of [1,71,72,73]){
    const a=actor(row('feeding-cue-'+kind),id);assert.equal(a.resourceFlows.length,kind==='disabled'?0:1);
    if(kind==='custom')assert.equal(a.resourceFlows[0].color,'#123456');
  }
  const coalesced=row('feeding-cue-coalesces');for(const id of [1,71,72,73]){const a=actor(coalesced,id);assert.equal(a.resourceFlows.length,1);assert.equal(a.resourceFlows[0].from.x,actor(coalesced,70).pos.x);}
  for(const gate of ['eligible','dead','downed','enemy','other-story','same-zero-story','outside','exact-radius','inside','full','healed-half','healed-below-half','healed-above-half']){
    const r=row('share-'+gate),eligible=!['dead','enemy','other-story','outside'].includes(gate);
    assert.deepEqual(heals(r).map(e=>e.actor),eligible?[71,72,73]:[72,73],r.name);
    assert(heals(r).every(e=>e.amount===dealt(r)*.25),r.name);
  }
  const recipientText=(r,id,color)=>events(r,'text').filter(e=>e.args[2]===color&&e.args[0].x===actor(r,id).pos.x&&e.args[0].y===actor(r,id).pos.y);
  for(const [suffix,landed,texts]of [['half',.5,0],['below-half',.25,0],['above-half',.75,1]]){
    const r=row('share-healed-'+suffix);assert.equal(events(r,'heal-return').find(e=>e.actor===71).landed,landed);assert.equal(recipientText(r,71,'#8ae0a8').length,texts);
  }
  for(const n of [-.5,0])assert.equal(heals(row('share-value-'+n)).length,0);
  for(const gate of ['missing','dead','no-buff','duplicate-id']){const r=row('bond-'+gate);assert.equal(heals(r).length,0);assert.deepEqual(actor(r,1).bond,{$undefined:true});}
  for(const gate of ['zero-share','negative-share'])assert.equal(heals(row('bond-'+gate)).length,0);
  for(const [gate,factor,id]of [['valid',.5,71],['enemy-far-other-story',.5,71],['zero-feed',0,71],['negative-feed',-.5,71],['null-feed',.5,71],['custom-feed',1,71],['self',.5,1]]){
    const r=row('bond-'+gate);assert.deepEqual(pairs(r),[[id,dealt(r)*factor]]);assert.equal(actor(r,id).resourceFlows.length,0,r.name+' bond has no transfer cue');
  }
  for(const [gate,count]of [['full',0],['half',0],['above-half',1]])assert.equal(recipientText(row('bond-'+gate),71,'#7ee0b8').length,count);
  for(const gate of ['eligible','dead-caster','other-caster-story','exact-range','missing-base']){
    const r=row('tree-'+gate),a=actor(r,72);assert.equal(a.construct.stored,40+dealt(r));assert.equal(a.radius,12*(1+.6*((40+dealt(r))/300)));
  }
  for(const gate of ['dead-tree','enemy-tree','other-target-story','outside','missing-burst']){const a=actor(row('tree-'+gate),72);assert.equal(a.construct.stored,40);assert.equal(a.radius,12);}
  for(const gate of ['zero-stored','missing-stored']){const r=row('tree-'+gate);assert.equal(actor(r,72).construct.stored,dealt(r));}
  assert.equal(actor(row('tree-negative-stored'),72).construct.stored,-50+dealt(row('tree-negative-stored')));
  for(const gate of ['capped','over-cap'])assert.equal(actor(row('tree-'+gate),72).construct.stored,300);
  assert.equal(actor(row('tree-zero-base'),72).radius,0);
  assert.deepEqual(actor(row('tree-zero-cap'),72).radius,{$number:'NaN'});assert.equal(actor(row('tree-negative-cap'),72).construct.stored,-10);
  const context=row('context-and-extra'),d=dealt(context);
  assert.deepEqual(pairs(context),[[1,d*.5*1.5],[71,d*.25*1.5],[72,d*.25*1.5],[73,d*.25*1.5],[71,d*.5*1.5]]);
  for(const r of data.rows)for(const e of events(r,'get').filter(e=>['healPower','vampiricShare','bondShare'].includes(e.args[0])))assert.match(e.args[2].$origin,/^prepared-extra-\d+$/,r.name+' borrowed modifiers');
  const tags=row('context-tags-change-during-share'),dt=dealt(tags);assert.deepEqual(pairs(tags),[[71,dt*.25*2],[72,dt*.25*2],[73,dt*.25*2],[71,dt*.5*3]]);
  assert(events(tags,'get').some(e=>e.args[0]==='healPower'&&e.value===3&&e.args[1].$set.includes('melee')));
  const altered=row('siphon-changes-share-and-definition'),da=dealt(altered);assert.deepEqual(pairs(altered),[[1,da*.5],[71,da*.4],[72,da*.4],[73,da*.4]]);assert.equal(actor(altered,1).resourceFlows.length,0);
  const deadDuringSiphon=row('siphon-kills-caster');assert.deepEqual(pairs(deadDuringSiphon),[[1,dealt(deadDuringSiphon)*.5]]);assert.equal(actor(deadDuringSiphon,72).construct.stored,40+dealt(deadDuringSiphon));
  const deadDuringShare=row('share-kills-caster');assert.deepEqual(heals(deadDuringShare).map(e=>e.actor),[71,72,73,71]);assert(actor(deadDuringShare,1).dead);
  for(const kind of ['kill','team','story','move','remove'])assert.deepEqual(heals(row('share-callback-'+kind)).map(e=>e.actor),[71,73,73]);
  assert.deepEqual(heals(row('share-callback-append')).map(e=>e.actor),[71,72,73,74,73]);
  const replaced=row('share-callback-replace-list');assert.deepEqual(heals(replaced).map(e=>e.actor),[71,72,73]);assert.deepEqual(final(replaced).order,[1,70,72]);assert(actor(replaced,1).bond.$undefined);
  const power=row('share-callback-change-power'),dp=dealt(power);assert.deepEqual(pairs(power),[[71,dp*.25],[72,dp*.25],[73,dp*.25],[73,dp*.5*3]]);
  for(const id of [71,72,73])assert.equal(actor(row('share-callback-change-cue'),id).resourceFlows[0].color,'#654321');
  for(const kind of ['clear-bond','remove-buff']){const r=row('share-callback-'+kind);assert.deepEqual(heals(r).map(e=>e.actor),[71,72,73]);assert(actor(r,1).bond.$undefined);}
  assert.deepEqual(heals(row('share-callback-replace-bond')).map(e=>e.actor),[71,72,73,72]);
  assert.equal(actor(row('share-callback-replace-tree'),72).construct.stored,300);assert.equal(actor(row('share-callback-replace-tree'),72).radius,32);
  for(const kind of ['packet','prepared']){
    const r=row('captured-dealt-'+kind+'-extra'),d=dealt(r),power=kind==='packet'?1.25:2;assert.equal(final(r).results[0].total,999);
    assert.deepEqual(pairs(r),[[1,d*.5*power],[71,d*.25*power],[72,d*.25*power],[73,d*.25*power],[71,d*.5*power]]);assert.equal(actor(r,72).construct.stored,40+d);
  }
  const nested=row('nested-heal-hit');assert.equal(events(nested,'applied-hit').length,2);assert.equal(actor(nested,72).construct.stored,40+dealt(nested));
  for(const [name]of expectedErrors){const r=row(name),s=r.steps[0];assert.equal(actor(r,1).lastCombatAt,s.before.actors[0].lastCombatAt,name+' stopped before combat stamp');}
  for(const name of ['siphon-callback-failure','share-callback-failure','bond-callback-failure','share-text-failure']){const r=row(name),id=name.startsWith('siphon')?1:71;assert(actor(r,id).life>9000,name+' retains prior heal');assert.equal(actor(r,72).construct.stored,40);}
  const partial=row('tree-write-failure');assert.equal(actor(partial,71).construct.stored,40+dealt(partial));assert.equal(actor(partial,72).construct.stored,40+dealt(partial));assert.equal(actor(partial,72).radius,12);
}
