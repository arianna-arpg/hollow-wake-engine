import assert from 'node:assert/strict';
export function assertStatusDeliveryObservations(data){
 assert.equal(data.schemaVersion,1);assert.equal(data.courses,88);assert.equal(data.rows.length,88);
 const rows=new Map(data.rows.map(r=>[r.name,r]));assert.equal(rows.size,88);
 const row=name=>{const r=rows.get(name);assert(r,'Missing course '+name);return r;};
 const step=(name,i=0)=>{const s=row(name).steps[i];assert(s,'Missing step '+name+'/'+i);return s;};
 const calls=(s,k,phase='before')=>s.events.filter(e=>e.kind===k&&e.phase===phase);
 const actor=(s,id,phase='after')=>{const a=s[phase].actors.find(a=>a.id===id);assert(a);return a;};
 const ids=(s,id)=>actor(s,id).statuses.map(s=>s.id);
 const close=(a,b,label)=>assert(Number.isFinite(a)&&Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(b)),label+': '+a+' != '+b);
 const flats=s=>s.after.projectiles.map(p=>p.flat.physical);
 let throws=0;
 for(const r of data.rows){assert(r.steps.length>0);for(const s of r.steps){assert.equal(s.error,s.expectedError,r.name+'/'+s.name);if(s.expectedError){assert(s.expectedError.startsWith('intentional:'));throws++;}
  assert(s.draws.every(n=>Number.isFinite(n)&&n>=0&&n<1));assert.equal(new Set(s.after.actorOrder).size,s.after.actorOrder.length);
  for(const p of s.after.projectiles)assert.equal(typeof p.instanceIdentity,'string','Unobserved projectile identity');
 }}assert.equal(throws,9);
 assert.deepEqual(data.authored.skills.map(d=>d.id),['draw_corruption','spear_recall','impale_spear']);
 assert.deepEqual(data.authored.tree.map(n=>n.id),['rending_extraction','crossing_steel']);
 for(const n of data.authored.tree)assert(n.over.recallImpales.radius>0);

 const basic=step('siphon-authored');assert.deepEqual(ids(basic,1),['burn']);assert.deepEqual(ids(basic,2),[]);close(actor(basic,1).life,9008,'one authored draw heals eight');
 close(actor(basic,1).statuses[0].dps,12,'native magnitude retained');close(actor(basic,1).statuses[0].remaining,actor(basic,2,'before').statuses[0].remaining,'remaining clock');
 assert.deepEqual(calls(basic,'transplantStatus')[0].args[3],{duration:'remaining'});
 const order=basic.events.map(e=>e.kind+':'+e.phase),position=k=>{const i=order.indexOf(k);assert(i>=0,k);return i;};
 assert(position('transplantStatus:after')<position('actor-2-removeSource:before'));
 assert(position('actor-2-removeSource:after')<position('actor-1-healBy:before'));
 for(const [name,expected]of [['allies',['burn']],['enemies',['chill']],['all',['burn','chill']]]){
  const s=step('siphon-from-'+name);assert.deepEqual(ids(s,1),expected);close(actor(s,1).life,9000+8*expected.length,'team draw count');
 }
 for(const name of ['self','dead','untargetable','construct','outside','no-status','empty-filter','missing-filter']){
  const s=step('siphon-'+name);assert.equal(calls(s,'transplantStatus').length,0,name);assert.equal(calls(s,'failNote').length,1,name+' empty cue');close(actor(s,1).life,9000,name);
 }
 for(const name of ['other-story','edge','matching-filter','invulnerable','scaled-radius']){
  const s=step('siphon-'+name);assert.equal(calls(s,'transplantStatus').length,1,name);assert.deepEqual(ids(s,2),[]);close(actor(s,1).life,9008,name);
 }
 for(const name of ['challenge-field','unknown-definition','dead-caster']){
  const s=step('siphon-'+name);assert.equal(calls(s,'transplantStatus').length,1);assert.deepEqual(ids(s,1),[]);assert.deepEqual(ids(s,2),[]);
  assert.equal(calls(s,'actor-1-healBy').length,1);close(actor(s,1).life,name==='dead-caster'?9000:9008,name+' removal independent of transplantation');
 }
 for(const n of [0,-2,2,20]){const s=step('siphon-heal-'+n);close(actor(s,1).life,9000+Math.max(0,n*2),'per-status heal scaling');assert.equal(calls(s,'actor-1-healBy').length,n===0?0:1);if(n)assert.equal(calls(s,'actor-1-healBy')[0].args[0],n*2);}
 assert.equal(calls(step('siphon-no-heal-field'),'actor-1-healBy').length,0);close(actor(step('siphon-heal-capped'),1).life,10000,'life ceiling');
 assert.deepEqual(calls(step('siphon-reverse-and-actors'),'transplantStatus').map(e=>e.args[1].id),['chill','burn','vulnerable']);
 close(actor(step('siphon-reverse-and-actors'),1).life,9024,'three records, independent of stack count');
 for(const name of ['siphon-filtered-survivors','siphon-live-filter']){const s=step(name);assert.deepEqual(ids(s,2),['chill']);assert.deepEqual(ids(s,1),['vulnerable','burn']);close(actor(s,1).life,9016,name);}
 assert.deepEqual(ids(step('siphon-stacking'),1),['frozen']);close(actor(step('siphon-stacking'),1).life,9008,'one source record pays once');
 assert.equal(step('siphon-live-actors').after.actors.length,5);assert.deepEqual(ids(step('siphon-live-actors'),1),['burn','chill']);
 close(actor(step('siphon-live-source-status'),1).statuses.find(s=>s.id==='burn').remaining,.5,'live status record');
 close(actor(step('siphon-live-healing'),1).life,9016,'healing query follows transplant callback');
 assert.deepEqual(ids(step('siphon-live-position'),2),[]);assert.deepEqual(ids(step('siphon-live-position'),3),['chill']);

 const recall=step('recall-authored');close(actor(recall,2).life,9000-100*1.2,'authored recall burst');assert.deepEqual(ids(recall,2),[]);assert.deepEqual(flats(recall),[100*.5]);
 close(actor(step('recall-fire-resisted'),2).life,9000-100*1.2*.5,'typed burst applies fire resistance');assert.deepEqual(flats(step('recall-fire-resisted')),[50]);
 const sequence=recall.events.map(e=>e.kind+':'+e.phase);assert(sequence.indexOf('actor-2-removeSource:after')<sequence.indexOf('text:before'));assert(sequence.indexOf('text:after')<sequence.indexOf('spawnProjectile:before'));
 for(const name of ['none','ordinary-status','zero-bank','negative-bank','missing-bank','outside','breakable','ally','dead','untargetable','other-story']){
  const s=step('recall-'+name);assert.equal(s.after.projectiles.length,0,name);assert.equal(calls(s,'spawnProjectile').length,0,name);assert.equal(calls(s,'failNote').length,1,name);close(actor(s,2).life,9000,name);
 }
 for(const name of ['edge','construct','invulnerable','default-type','fire-type']){const s=step('recall-'+name);close(actor(s,2).life,8880,name);assert.deepEqual(ids(s,2),[]);assert.deepEqual(flats(s),[50]);}
 assert.equal(actor(step('recall-default-type'),2).hitFlashType,'physical');assert.equal(actor(step('recall-fire-type'),2).hitFlashType,'fire');
 const noSpear=step('recall-no-spear-definition');assert.deepEqual(ids(noSpear,2),[]);assert.equal(noSpear.after.projectiles.length,0);close(actor(noSpear,2).life,8880,'burst without spear definition');assert.equal(calls(noSpear,'failNote').length,0);
 for(const name of ['zero-damage','negative-damage','absorbed']){const s=step('recall-'+name);close(actor(s,2).life,9000,name);assert.deepEqual(ids(s,2),[]);assert.deepEqual(flats(s),[50]);}
 close(actor(step('recall-defaults'),2).life,8900,'default damage scale');assert.deepEqual(flats(step('recall-zero-share')),[0]);assert.deepEqual(flats(step('recall-negative-share')),[-50]);
 const lethal=step('recall-lethal');assert(actor(lethal,2).dead);assert.equal(calls(lethal,'kill').length,1);assert(lethal.events.indexOf(calls(lethal,'kill','after')[0])<lethal.events.indexOf(calls(lethal,'spawnProjectile')[0]));
 assert.deepEqual(flats(step('recall-reverse-and-actors')),[100,50,150]);close(actor(step('recall-reverse-and-actors'),2).life,8640,'two reversed banks');close(actor(step('recall-reverse-and-actors'),3).life,8640,'next actor bank');
 for(const name of ['recall-native-cache-reuse','recall-cache-shared-between-sources']){
  const a=step(name,0).after.projectiles,b=step(name,1).after.projectiles;assert.equal(a.length,1);assert.equal(b.length,2);assert.equal(b[0].instanceIdentity,b[1].instanceIdentity,name);
 }
 const replaced=step('recall-cache-level-replacement',1).after.projectiles;assert.notEqual(replaced[0].instanceIdentity,replaced[1].instanceIdentity);
 for(const [node,damage,share]of [['rending_extraction',1.8,.2],['crossing_steel',.7,1.1]]){
  const s=step('recall-tree-'+node);assert.equal(s.after.projectiles.length,2);assert.notEqual(s.after.projectiles[0].instanceIdentity,s.after.projectiles[1].instanceIdentity,'tree payloads are per occurrence');
  close(actor(s,2).life,9000-100*damage,node);close(actor(s,3).life,9000-100*damage,node);for(const value of flats(s))close(value,100*share,node+' physical payload');
 }
 const retired=row('recall-tree-selective-retirement').steps;assert.deepEqual(retired.map(s=>s.after.projectiles.length),[1,2,3,2,1,1]);
 assert.deepEqual(retired[3].after.projectiles.map(p=>p.instanceIdentity),retired[2].after.projectiles.slice(1).map(p=>p.instanceIdentity));
 assert.equal(retired[5].after.projectiles[0].instanceIdentity,retired[2].after.projectiles[2].instanceIdentity);
 for(const name of ['native','rending_extraction','crossing_steel']){const s=step('recall-flight-'+name,1);assert(calls(s,'spawnProjectile').length===0);assert.equal(s.events.filter(e=>e.kind==='hit').length,1);assert(actor(s,3).life<actor(s,3,'before').life,'real returning impact '+name);}
 assert(actor(step('recall-flight-crossing_steel',1),3).life<actor(step('recall-flight-rending_extraction',1),3).life,'authored tree bank shares affect actual impact');
 close(actor(step('recall-live-bank-after-removal'),2).life,9000-250*1.2,'bank read after modifier removal');assert.deepEqual(flats(step('recall-live-bank-after-removal')),[125]);
 assert.deepEqual(flats(step('recall-live-share-after-text')),[90]);assert.deepEqual(flats(step('recall-captured-bank-after-text')),[50]);
 assert.equal(calls(step('recall-live-level-after-kill'),'spawnProjectile')[0].args[1].level,4);
 assert.deepEqual(flats(step('recall-live-victims-snapshot')),[50,50]);assert(!step('recall-live-victims-snapshot').after.actorOrder.includes(3));close(actor(step('recall-live-victims-snapshot'),3).life,8880,'captured recipients survive world removal');
 close(actor(step('recall-nested-cast'),2).life,8880,'outer bank');close(actor(step('recall-nested-cast'),3).life,8950,'nested bank');assert.deepEqual(flats(step('recall-nested-cast')),[50,50]);
 assert.equal(calls(step('recall-color-fallback'),'text')[0].args[2],'#c8ccd8');
 assert.equal(step('mixed-siphon-recall').after.projectiles.length,0);assert.equal(step('mixed-recall-siphon').after.projectiles.length,1);
 assert(actor(step('mixed-recall-siphon'),2).life<actor(step('mixed-siphon-recall'),2).life,'authored effect order');

 const before=step('siphon-throw-transplantStatus-before'),after=step('siphon-throw-transplantStatus-after');assert.deepEqual(ids(before,1),[]);assert.deepEqual(ids(before,2),['burn']);assert.deepEqual(ids(after,1),['burn']);assert.deepEqual(ids(after,2),['burn']);
 for(const name of ['siphon-throw-actor-2-removeSource-after','siphon-throw-actor-1-healBy-before']){const s=step(name);assert.deepEqual(ids(s,1),['burn']);assert.deepEqual(ids(s,2),[]);close(actor(s,1).life,9000,'partial draw without healing');}
 const removal=step('recall-throw-actor-2-removeSource-after');assert.deepEqual(ids(removal,2),[]);close(actor(removal,2).life,9000,'bank consumed before interrupted mitigation');assert.equal(removal.after.projectiles.length,0);
 for(const name of ['recall-throw-text-before','recall-throw-spawnProjectile-before','recall-throw-spawnProjectile-after']){const s=step(name);close(actor(s,2).life,8880,name);assert.equal(s.after.projectiles.length,name.endsWith('Projectile-after')?1:0);}
 const killed=step('recall-throw-kill-after');assert(actor(killed,2).dead);assert.equal(killed.after.projectiles.length,0);
 return {courses:88,deliberateCallbackErrors:throws,realProjectileCourses:3,selectiveRetirement:true};
}
