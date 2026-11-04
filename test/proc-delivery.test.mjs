import test from 'node:test';
import assert from 'node:assert/strict';
const {createProcDelivery, countProcSummons} = await import(process.env.HWE_PROC_DELIVERY_MODULE || '../dist/proc-delivery.js');

function setup() {
  const events = [], cues = [], hits = [], actors = [], stats = new Map();
  function actor(id, x) {
    return {id, pos: [x, 0, 0], level: 3, tier: 0, radius: 2, dead: false, untargetable: false, invulnerable: false,
      life: 100, esBroke: false, hitFlash: 0, lifespan: 0, statuses: [], buffs: new Map(), charges: new Map(),
      maxLife() {return 200;},
      gainEndurance(amount) {events.push(['endurance', amount]); return amount;},
      gainCharge(key, amount, max, instance, depth) {events.push(['charge', instance, depth]); this.charges.set(key, Math.min(max, (this.charges.get(key) ?? 0) + amount));},
      addBuff(buff, duration, depth) {events.push(['buff', buff, duration, depth]); this.buffs.set(buff.id, buff);},
      removeBuff(key) {events.push(['remove', key]); this.buffs.delete(key);},
      endStatus(key) {events.push(['end', key]); this.statuses = this.statuses.filter(s => s.id !== key);},
    };
  }
  const caster = actor(1, 0), target = actor(2, 10), near = actor(3, 20); actors.push(caster, target, near);
  const ports = {
    stat: (a, name, inst) => {events.push(['stat', name, inst]); return stats.get(name) ?? 1;},
    buffCue: () => ({profile: 'rune'}), withStoredCue: (buff, storedCue) => ({...buff, storedCue}),
    cue: (a, cue, phase, id) => cues.push({a, cue, phase, id}),
    status: (...args) => events.push(['status', ...args]), heal: () => true, restore: () => true, cooldown: () => true, ward: () => true,
    delayed: (...args) => events.push(['delayed', ...args]),
    statusDefinition: id => ({freeze: {hardCC: true}, stun: {hardCC: true}, burn: {dotType: 'fire'}}[id]),
    enemies: () => actors.filter(a => a !== caster), sameStory: (a, b) => a.tier === b.tier,
    distance: (a, b) => Math.hypot(...a.map((v, i) => v - b[i])),
    direction: (a, b) => b.map((v, i) => v - a[i]), copyPosition: a => [...a],
    flash: (...args) => events.push(['flash', ...args]), arcTrail: (a, b, def) => events.push(['trail', a.id, b.id, def.id]),
    strikeSurfaces: (...args) => events.push(['surface', ...args]),
    hit: (a, inst, b, scale, depth) => hits.push({a, inst, b, scale, depth}),
    mitigate: (a, type, amount) => amount, text: (...args) => events.push(['text', ...args]),
    shieldBreak: (a, depth) => events.push(['break', a.esBroke, depth]), sweepDefenses: (a, depth) => events.push(['sweep', a.id, depth]),
    kill: a => {events.push(['kill', a.id]); a.dead = true;}, push: (...args) => events.push(['push', ...args]),
    summonCount: (a, key) => countProcSummons(actors, a, key), createMonster: (id, owner) => ({...actor(100, 0), owner}),
    lifeline: owner => owner.id, forwardSockets: (inst, summon) => events.push(['sockets', inst, summon]),
    placeSummon: (a, b, scatter) => {events.push(['place', a, b, scatter]); a.pos = [...b.pos];},
    publishSummon: a => {events.push(['publish', a]); actors.push(a);},
    birth: (...args) => events.push(['birth', ...args]), lightwell: (...args) => events.push(['well', ...args]),
    vent: (...args) => events.push(['vent', ...args]), cast: (...args) => events.push(['cast', ...args]),
    riders: (def, a, inst, b, depth) => events.push(['riders', depth, def.id]),
  };
  const service = createProcDelivery(ports);
  const deliver = (effect, extra = {}, instance = 0, victim = target, depth = 2, aim) =>
    service.execute({id: 'test', name: 'Test', color: 'blue', effect, ...extra}, caster, instance, victim, depth, aim);
  return {caster, target, near, actors, actor, events, cues, hits, stats, ports, deliver};
}

test('power is folded once in the triggering context before delivery and riders', () => {
  const h = setup(); h.stats.set('procPower_test', 2);
  const fx = {type: 'extraHit', damageScale: 0.5}; h.deliver(fx);
  assert.equal(fx.damageScale, 0.5); assert.deepEqual(h.events[0], ['stat', 'procPower_test', 0]);
  assert.deepEqual(h.hits, [{a:h.caster, inst:0, b:h.target, scale:1, depth:3}]);
  assert.deepEqual(h.events.at(-1), ['riders',2,'test']);
  h.deliver({type:'collisionDamage',damageScale:1});
  assert.deepEqual(h.events.filter(e=>e[0]==='flash').map(e=>e[2]),[10,12]);
});
test('missing target or instance keeps the ordinary rider tail', () => {
  const h = setup();
  for (const type of ['extraHit','collisionDamage','arc','explosion']) {
    h.deliver({type, damageScale:1}, {}, null); h.deliver({type, damageScale:1}, {}, 0, null);
  }
  assert.equal(h.hits.length,0); assert.equal(h.events.filter(e=>e[0]==='riders').length,8);
});
test('charge cues report actual growth and zero-valued instances retain depth', () => {
  const h=setup(), fx={type:'gainCharge',charge:'fury',amount:2,max:2};
  h.deliver(fx,{procCue:{color:'red'}}); h.deliver(fx);
  assert.equal(h.caster.charges.get('fury'),2); assert.deepEqual(h.events[1],['charge',0,3]);
  assert.deepEqual(h.cues.map(c=>c.cue),[{profile:'mend',color:'red'}]);
});
test('buff grants detach the definition before a contextual duration callback', () => {
  const h=setup(), buff={id:'tempo',duration:3}; const stat=h.ports.stat;
  h.ports.stat=(a,name,inst)=>{if(name==='effectDuration'){buff.duration=100;return 2;}return stat(a,name,inst);};
  h.deliver({type:'buff',buff},{procCue:{color:'gold'}});
  const grant=h.events.find(e=>e[0]==='buff'); assert.notEqual(grant[1],buff); assert.equal(grant[1].duration,3);
  assert.deepEqual(grant.slice(2),[2,3]); assert.deepEqual(h.cues[0].cue,{profile:'rune',color:'gold'});
  assert.equal(buff.storedCue,undefined);
});
test('explicit stored false and silent announcements suppress cue derivation', () => {
  const h=setup(); let queries=0; h.ports.buffCue=()=>{queries++;return {profile:'rune'};};
  h.deliver({type:'buff',buff:{id:'one',storedCue:false}});
  h.deliver({type:'buff',buff:{id:'two'}},{announceName:false});
  assert.deepEqual(h.cues.map(c=>c.cue),[false,false]);
  assert.equal(queries,0);
});
test('scoped resource and cooldown services decide cue emission before riders', () => {
  for(const type of ['heal','restore','cooldown','ward']) {
    const h=setup(), effect={type,flat:10}; let calls=0;
    h.ports[type]=(actor,fx,inst)=>{assert.equal(actor,h.caster);assert.equal(fx,effect);if(type==='cooldown')assert.equal(inst,0);return ++calls===1;};
    h.deliver(effect); assert.equal(h.cues.length,1);
    h.deliver(effect); assert.equal(calls,2); assert.equal(h.cues.length,1);
    assert.equal(h.events.filter(e=>e[0]==='riders').length,2);
  }
});
test('status attribution and delayed scheduling retain their distinct depth contracts', () => {
  const h=setup(), status={type:'status',status:'burn'}, delayed={type:'delayedBurst',at:'self',delay:1,radius:4};
  h.deliver(status); h.deliver(delayed);
  assert.deepEqual(h.events.find(e=>e[0]==='status').slice(1),[status,'Test',h.caster,0,h.target]);
  assert.deepEqual(h.events.find(e=>e[0]==='delayed').slice(1),[h.caster,delayed,'blue',2,h.target]);
});
test('burst admits an inclusive radius, mitigates invulnerability and consumes shield edges before reactions', () => {
  const h=setup(); h.near.pos=[12,0,0]; h.near.invulnerable=true; h.target.life=1; h.target.esBroke=true;
  h.ports.mitigate=(a,type,n)=>{h.events.push(['mitigate',a.id,n]);return n;};
  h.deliver({type:'burst',damage:'fire',base:2,perLevel:3,radius:10});
  assert.deepEqual(h.events.filter(e=>e[0]==='mitigate'),[['mitigate',2,8],['mitigate',3,8]]);
  assert.equal(h.near.life,100); assert.equal(h.target.life,-7);
  assert.deepEqual(h.events.filter(e=>['break','sweep','kill'].includes(e[0])),[['break',false,3],['sweep',2,3],['kill',2]]);
});
test('burst captures damage before the surface callback but queries enemies afterward', () => {
  const h=setup(); const newEnemy=h.actor(7,0);
  h.ports.strikeSurfaces=()=>{h.caster.level=20;h.actors.push(newEnemy);};
  h.deliver({type:'burst',damage:'fire',base:1,perLevel:1,radius:1});
  assert.equal(newEnemy.life,97); assert.equal(h.target.life,100);
});
test('explosion gates against the target story after the enemy query', () => {
  const h=setup(); h.ports.enemies=()=>{h.target.tier=1;h.near.tier=1;return [h.target,h.near];};
  h.deliver({type:'explosion',damageScale:0.25,radius:8});
  assert.deepEqual(h.hits.map(e=>e.b.id),[2,3]); assert.deepEqual(h.hits.map(e=>e.depth),[3,3]);
});
test('arc chooses later equal distances and obtains a live origin and fresh candidates at each hop', () => {
  const h=setup(), tie=h.actor(4,0); h.actors.push(tie); let queries=0;
  h.ports.enemies=()=>{queries++; return h.actors.filter(a=>a!==h.caster);};
  const hit=h.ports.hit;
  h.ports.hit=(...args)=>{hit(...args);if(args[2]===tie){tie.pos=[100,0,0];h.near.pos=[101,0,0];}};
  h.deliver({type:'arc',damageScale:1,range:10,hops:1.5});
  assert.deepEqual(h.hits.map(e=>e.b.id),[4,3]); assert.equal(queries,2);
});
test('displacement preserves a host vector direction and force sign', () => {
  const h=setup(); h.deliver({type:'displace',force:-5}); h.deliver({type:'displace',force:0}); h.deliver({type:'displace',force:5});
  assert.deepEqual(h.events.filter(e=>e[0]==='push').map(e=>[e[2],e[3]]),[[[-10,0,0],5],[[-10,0,0],0],[[10,0,0],5]]);
});
test('fortify flashes only when endurance was banked and detaches its location', () => {
  const h=setup(); h.deliver({type:'fortify',flat:1,pctMaxLife:.1}); h.deliver({type:'fortify',flat:0});
  assert.deepEqual(h.events.filter(e=>e[0]==='endurance').map(e=>e[1]),[21,0]);
  const flashes=h.events.filter(e=>e[0]==='flash'); assert.equal(flashes.length,1); assert.notEqual(flashes[0][1],h.caster.pos);
});
test('buff removal preserves duplicates; cleanse deduplicates explicit and classified status IDs', () => {
  const h=setup(); h.caster.statuses=[{id:'freeze'},{id:'burn'},{id:'stun'},{id:'keep'}];
  h.deliver({type:'removeBuff',buff:['a','a']}); h.deliver({type:'removeBuff',buff:'b'});
  h.deliver({type:'cleanse',statuses:['unknown','freeze'],hardCC:true,afflictions:true});
  assert.deepEqual(h.events.filter(e=>e[0]==='remove').map(e=>e[1]),['a','a','b']);
  assert.deepEqual(h.events.filter(e=>e[0]==='end').map(e=>e[1]),['unknown','freeze','burn','stun']);
  assert.deepEqual(h.caster.statuses,[{id:'keep'}]); assert.equal(h.cues[0].phase,'release');
  h.deliver({type:'cleanse',statuses:['unknown']}); assert.equal(h.cues.length,1);
});
test('summon uses resolved keeper, exact instance, contextual duration and publication order', () => {
  const h=setup(); h.caster.owner=h.near;h.stats.set('effectDuration',2);
  const stat=h.ports.stat;h.ports.stat=(a,name,inst)=>{if(name==='effectDuration'){assert.equal(a,h.near);assert.equal(inst,0);}return stat(a,name,inst);};
  const fx={type:'summon',monsterId:'wraith',duration:4,max:1}; h.deliver(fx);h.deliver(fx);
  const summoned=h.actors.at(-1);assert.equal(h.actors.length,4);assert.equal(summoned.owner,h.near);assert.equal(summoned.lifelineId,3);
  assert.equal(summoned.summonInst,0);assert.equal(summoned.sourceSkillId,'__proc:test');assert.equal(summoned.lifespan,8);
  assert.deepEqual(h.events.filter(e=>['sockets','place','publish'].includes(e[0])).map(e=>e[0]),['sockets','place','publish']);
});
test('census captures length, skips holes and observes mutations to unvisited entries', () => {
  const owner={}, actors=[]; let laterReads=0;
  const match={owner,dead:false,sourceSkillId:'key'};
  actors.length=4;
  actors[0]={get owner(){actors.push(match);delete actors[2];return owner;},dead:false,sourceSkillId:'key'};
  actors[2]={get owner(){laterReads++;return owner;},dead:false,sourceSkillId:'key'};
  actors[3]={owner,dead:true,sourceSkillId:'key'};
  assert.equal(countProcSummons(actors,owner,'key'),1);assert.equal(laterReads,0);assert.equal(actors.length,5);
  assert.equal(countProcSummons([{owner:0,dead:false,sourceSkillId:'key'}],0,'key'),1);
});
test('birth on self still marks a host when the target is the resolved keeper', () => {
  const h=setup(), row={brood:'test'};h.caster.owner=h.near;
  h.deliver({type:'birth',at:'self',birth:row},{},null,h.near);
  const result=h.events.find(e=>e[0]==='birth');assert.equal(result[1],h.near);assert.equal(result[2],row);
  assert.notEqual(result[3],h.near.pos);assert.deepEqual(result.slice(4),[true,'__proc:test']);
});
test('kindle and vent copy the landing site; vent uses an unscoped duration query', () => {
  const h=setup();h.deliver({type:'kindle',kind:'mote'});h.deliver({type:'vent',bank:'fog',radius:6,duration:8},{},0,null);
  const well=h.events.find(e=>e[0]==='well');assert.deepEqual(well.slice(1),['mote',h.target.pos]);assert.notEqual(well[2],h.target.pos);
  const vent=h.events.find(e=>e[0]==='vent');assert.deepEqual(vent.slice(1),[{bank:'fog',radius:6,duration:8},h.caster.pos,1,1,0]);assert.notEqual(vent[2],h.caster.pos);
  assert(h.events.some(e=>e[0]==='stat'&&e[1]==='effectDuration'&&e[2]===undefined));
});
test('cast forwards the original payload and aim with one added depth', () => {
  const h=setup(), spec={skillId:'bolt',count:[1,1]}, aim=[9,0,0];h.deliver({type:'cast',cast:spec},{},0,null,2,aim);
  const event=h.events.find(e=>e[0]==='cast');assert.deepEqual(event.slice(1),[h.caster,0,null,3,spec,aim]);assert.equal(event[5],spec);
});
test('reentry completes nested riders first and a thrown callback preserves partial writes', () => {
  const h=setup();h.ports.ward=()=>{h.deliver({type:'removeBuff',buff:'x'},{id:'nested'},null,null,4);return true;};
  h.deliver({type:'ward',flat:1});assert.deepEqual(h.events.filter(e=>e[0]==='riders'),[['riders',4,'nested'],['riders',2,'test']]);
  const failure=Error('after gain');h.caster.gainCharge=function(id){this.charges.set(id,1);throw failure;};
  assert.throws(()=>h.deliver({type:'gainCharge',charge:'fury',amount:1,max:2}),e=>e===failure);
  assert.equal(h.caster.charges.get('fury'),1);assert.equal(h.events.filter(e=>e[0]==='riders').length,2);
});
