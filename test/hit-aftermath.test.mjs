import test from 'node:test';
import assert from 'node:assert/strict';
const {createHitAftermath} = await import(process.env.HWE_HIT_AFTERMATH_MODULE || '../dist/hit-aftermath.js');

function rig() {
  const r={events:[],actors:[],pending:[],orbs:[],remnants:[],flashes:[],created:[],now:4,nextId:10};
  const record=(name,...args)=>{r.events.push({name,args});};r.record=record;
  r.actor=(id,team='foe')=>({
    id,team,pos:{x:id,y:0,z:2},radius:2,level:1,life:900,mana:500,es:0,
    dead:false,invulnerable:false,untargetable:false,tier:0,
    volatileReadyAt:0,onHitTypeReadyAt:0,contagionReadyAt:0,
    statuses:[],hexToggles:new Map(),skills:[],charges:new Map(),buffs:[],
    strideDist:0,strideSpent:false,hitFlash:0,
    maxLifeValue:1000,ceiling:1000,manaCap:1000,esCap:1000,
    sheet:{values:{},get(id,tags,extra){record('stat',id,tags,extra);return this.values[id]??({damageTaken:1,aoeRadius:1,orbShedRate:1}[id]??0);}},
    applyStatus(id,dps,scale,source){record('applyStatus',this,id,dps,scale,source);this.statuses.push({id});},
    addBuff(effect){record('addBuff',this,effect);this.buffs.push(effect);},
    isMinion(){return !!this.owner;},maxLife(){return this.maxLifeValue;},lifeCeiling(){return this.ceiling;},
    spendCharge(id,amount){record('spendCharge',this,id,amount);this.charges.set(id,(this.charges.get(id)??0)-amount);},
    gainCharge(id,amount,max,inst){record('gainCharge',this,id,amount,max,inst);this.charges.set(id,Math.min(max,(this.charges.get(id)??0)+amount));},
    healBy(amount){record('healBy',this,amount);this.life=Math.min(this.ceiling,this.life+amount);},
    availableMaxMana(){return this.manaCap;},maxEs(){return this.esCap;},
    spendBuffs(event,tags,id){record('spendBuffs',this,event,tags,id);},
    noteRecent(event){record('noteRecent',this,event);},
    conditionHolds(condition){record('conditionHolds',this,condition);return !!this.strided;},
  });
  r.caster=r.actor(1,'friend');r.target=r.actor(2);r.actors.push(r.caster,r.target);
  r.def={id:'hit',color:'#abc',tags:['spell'],delivery:{type:'projectile'}};
  r.inst={def:r.def};r.packet={amounts:{physical:100},tags:new Set(['spell'])};
  r.skills=new Map([[r.def.id,r.def]]);r.monsters=new Map([['mob',{boss:false}]]);
  const p={
    time:()=>r.now,actors:()=>r.actors,
    appendActor:actor=>{record('appendActor',actor);r.actors.push(actor);},
    skill:id=>r.skills.get(id),monster:id=>r.monsters.get(id),
    makeInstance:(def,level)=>{record('makeInstance',def,level);return{def,level};},
    effectiveLevel:inst=>inst.level??1,
    chance:value=>{record('chance',value);return .25<value;},
    pick:values=>{record('pick',values);return values[0];},
    copyPosition:actor=>{record('copyPosition',actor);return{...actor.pos};},
    scatterPosition:(actor,extent)=>{record('scatterPosition',actor,extent);return{x:actor.pos.x+extent,y:actor.pos.y,z:actor.pos.z-extent};},
    clampPoint:(point,radius)=>{record('clampPoint',point,radius);return point;},
    distance:(from,to)=>Math.hypot(from.x-to.x,from.y-to.y,from.z-to.z),
    direction:(from,to)=>({from,to}),randomDirection:()=>r.randomDirection,
    randomPhase:()=>{record('randomPhase');return .125;},
    sameStory:(actor,target)=>actor.tier===target.tier,
    enemies:()=>r.enemies??[],
    contagion:inst=>inst.contagion,
    contagionConfig:{maxGenerations:3,decay:.5,actorIcd:.3,delay:.4},
    queueContagion:release=>{record('queueContagion',release);r.pending.push(release);},
    flash:(...args)=>{record('flash',...args);r.flashes.push(args);},
    spreadOnHit:inst=>inst.spread,curseOnHit:inst=>inst.curse,dominate:inst=>inst.dominate,
    flatPhysicalModifier:value=>({id:'addedPhysical',type:'flat',value}),
    createMonster:(id,level,team,owner)=>{const actor=r.actor(r.nextId++,team);actor.owner=owner;actor.level=level;record('createMonster',id,level,team,owner,actor);r.created.push(actor);return actor;},
    kill:(target,silent,caster)=>{record('kill',target,silent,caster);target.dead=true;},
    minionsOfSkill:(owner,id)=>r.actors.filter(a=>a.owner===owner&&!a.dead&&a.sourceSkillId===id),
    deliveryKnock:{projectile:.2},deliveryKnockDefault:.1,
    resistance:(target,type)=>{record('resistance',target,type);return r.resistance??0;},
    prepareStatuses:(caster,inst,target,def,extra,packet,dealt,depth,afflictionCarry)=>{
      const frame={caster,inst,target,def,extra,packet,dealt,depth,afflictionCarry,tags:new Set(def.tags)};
      record('prepareStatuses',frame);r.frame=frame;return frame;
    },
    orbCount:()=>r.orbs.length,orbCap:5,orbKeys:()=>r.orbKeys??[],orbOnHitStat:id=>'orb_'+id,
    orbHitChance:(caster,id,chance,time)=>{record('orbHitChance',caster,id,chance,time);return chance;},
    shedOrb:(...args)=>{record('shedOrb',...args);r.orbs.push(args);},
    remnantCount:()=>r.remnants.length,
    appendRemnant:remnant=>{record('appendRemnant',remnant);r.remnants.push(remnant);},
    throngSplash:inst=>inst.splash,sockets:inst=>inst.sockets??[],spawnSpec:socket=>socket.spec,
    spawnDuration:6,carryProcs:(...args)=>{record('carryProcs',...args);return true;},
    chargeGains:inst=>inst.gains??[],contextTags:inst=>new Set(inst.def.tags),instanceTrigger:inst=>inst.trigger,
  };
  for(const name of ['executeSkill','volatileCue','knockFixtures','transplant','resolveHit','dischargeStatuses','plantAssault','plantImpale','companionBindCue','companionArrivalCue','thorns','push','currentLifeDamageCue','applyRiders','beforeEffects','dispatchEffects','applyGrantedStatuses','strikeSurfaces','ringBell','throngOnHit','throngBurst','birth','hitProcs','rollKillOrbs','rollKillRemnants','assaultAfterHit','assaultDoomCull','challengeAfterHit','sequenceLanded','companionOnHit','strideCue','killCharges','rollTriggers'])p[name]=(...args)=>record(name,...args);
  r.ports=p;r.randomDirection={opaque:'host direction'};
  r.service=createHitAftermath(p);
  r.apply=(o={})=>r.service.apply(o.caster??r.caster,o.inst??r.inst,o.target??r.target,o.multiplier??1,o.depth??0,o.effects,o.def??r.def,o.extra??[],o.packet??r.packet,o.tone??null,o.afflictionCarry??0,o.hasDamage??true,o.dealt??100,o.crit??false);
  r.calls=name=>r.events.filter(e=>e.name===name).map(e=>e.args);
  r.first=(name,index=0)=>{const calls=r.calls(name);assert(calls.length>index,'Missing callback '+name+' at '+index);return calls[index];};
  return r;
}

test('whole continuation preserves composition order and the existing frame identity',()=>{
  const r=rig(),extra=[{id:'extra'}],effects=[{type:'custom'}];r.apply({extra,effects,afflictionCarry:.3});
  const phases=['knockFixtures','dischargeStatuses','plantAssault','plantImpale','thorns','prepareStatuses','applyRiders','beforeEffects','dispatchEffects','applyGrantedStatuses','throngOnHit','hitProcs','assaultAfterHit','assaultDoomCull','challengeAfterHit','sequenceLanded','companionOnHit'];
  assert.deepEqual(r.events.filter(e=>phases.includes(e.name)).map(e=>e.name),phases);
  assert.deepEqual(r.calls('thorns'),[[r.target,r.caster,100]]);
  const frame=r.frame;assert.equal(frame.extra,extra);assert.equal(frame.packet,r.packet);assert.equal(frame.afflictionCarry,.3);
  for(const name of ['applyRiders','dispatchEffects','applyGrantedStatuses'])assert.equal(r.first(name)[0],frame);
  assert.equal(r.first('dispatchEffects')[2],effects);assert.equal(r.first('hitProcs')[9],frame.tags);
  assert.deepEqual(r.calls('spendBuffs').map(a=>[a[0].id,a[1]]),[[1,'hit'],[2,'hurt']]);
});

test('non-damaging contacts still complete common policy; zero landed damaging contacts retain fixture and thorns calls',()=>{
  const plain=rig();plain.apply({hasDamage:false,dealt:0});
  for(const name of ['knockFixtures','dischargeStatuses','thorns','throngOnHit','spendBuffs'])assert.equal(plain.calls(name).length,0,name);
  for(const name of ['prepareStatuses','beforeEffects','dispatchEffects','hitProcs','assaultAfterHit','sequenceLanded'])assert.equal(plain.calls(name).length,1,name);
  assert.equal(plain.first('assaultAfterHit')[4],false);
  const zero=rig();zero.apply({dealt:0});assert.equal(zero.first('knockFixtures')[3],false);assert.equal(zero.first('thorns')[2],0);
});

test('volatile retaliation preserves explicit zero values, readiness, rounded level and cached identity',()=>{
  const r=rig(),def={...r.def,id:'answer'};r.skills.set(def.id,def);r.target.level=2.6;
  r.target.volatile={skillId:def.id,chance:1,icd:0,dmgMult:0,cue:false};r.target.volatileReadyAt=4;
  r.apply();const cached=r.target.volatileInst;r.apply();
  assert.equal(r.target.volatileReadyAt,4);assert(cached,'Retaliation must create its cached instance at the readiness boundary');assert.equal(cached.level,3);assert.equal(r.calls('makeInstance').length,1);
  assert.equal(r.calls('volatileCue').length,0);
  for(const args of r.calls('executeSkill')){assert.equal(args[1],cached);assert.equal(args[3].dmgMult,0);assert.deepEqual(args[2],r.caster.pos);assert.notEqual(args[2],r.caster.pos);}
});

test('volatile cue mutation remains visible to later instance, aim and scale reads',()=>{
  const r=rig(),replacement={def:{...r.def,id:'replacement'}};
  r.target.volatile={skillId:r.def.id,chance:1};
  r.ports.volatileCue=()=>{r.target.volatileInst=replacement;r.target.volatile.dmgMult=0;r.caster.pos={x:19,y:7,z:11};};
  r.apply();const args=r.first('executeSkill');assert.equal(args[1],replacement);assert.deepEqual(args[2],{x:19,y:7,z:11});assert.equal(args[3].dmgMult,0);
});

test('element response skips explicit zero chance and uses the first eligible live row',()=>{
  const r=rig();r.packet.amounts.fire=3;r.target.onHitTypeIcd=0;
  const row={status:'burn',skillId:r.def.id,dmgMult:1};
  r.target.onHitByType={physical:{status:'chill',chance:0},fire:row,cold:{status:'frozen'}};
  r.target.applyStatus=(id)=>{r.record('status',id);row.dmgMult=0;};
  r.apply();assert.deepEqual(r.calls('status'),[['burn']]);assert.equal(r.first('executeSkill')[3].dmgMult,0);
  const cached=r.target.onHitTypeInsts.get(r.def.id);r.apply();assert.equal(r.first('executeSkill',1)[1],cached);assert.equal(r.calls('makeInstance').length,1);
});

test('contagion preserves shared history, zero delay and scale, and publishes after queueing',()=>{
  const r=rig(),seen=new Set([7]);r.inst.state={contagion:{gen:1,seen}};
  r.inst.contagion={chance:1,decay:1,delay:0,damageScale:0};
  r.ports.flash=(...args)=>{assert.equal(r.pending.length,1);assert(seen.has(2));r.record('flash',...args);};
  r.apply();assert.equal(r.pending.length,1);const pending=r.pending[0];
  assert.equal(pending.seen,seen);assert.equal(pending.gen,2);assert.equal(pending.when,4);assert.equal(pending.damageScale,0);
  assert.deepEqual(pending.at,{x:2,y:0,z:2});assert.notEqual(pending.at,r.target.pos);
  r.now=6;r.apply();assert.equal(r.pending.length,1);assert.equal(r.calls('chance').length,1);
});

test('spread uses victim story, excludes existing status, and favors the later equal-distance candidate',()=>{
  const r=rig(),status={id:'burn'},first=r.actor(3),second=r.actor(4),wrongStory=r.actor(5),existing=r.actor(6);
  r.target.pos={x:0,y:0,z:2};first.pos={x:4,y:0,z:2};second.pos={x:-4,y:0,z:2};
  wrongStory.pos={x:1,y:0,z:2};wrongStory.tier=1;existing.pos={x:2,y:0,z:2};existing.statuses=[{id:'burn'}];
  r.target.statuses=[status];r.inst.spread={chance:1,radius:6};r.enemies=[r.target,first,second,wrongStory,existing];
  r.apply();assert.equal(r.calls('transplant').length,1);assert.equal(r.first('transplant')[0],second);assert.equal(r.first('transplant')[1],status);assert.equal(r.first('transplant')[3],r.inst.spread);
});

test('curse iteration excludes its own instance and observes live map deletion and append',()=>{
  const r=rig(),a={def:{...r.def,id:'a'},curse:{damageScale:0}},b={def:{...r.def,id:'b'},curse:{}},c={def:{...r.def,id:'c'},curse:{damageScale:.4}};
  r.caster.hexToggles=new Map([['self',{inst:r.inst}],['a',{inst:a}],['b',{inst:b}]]);
  r.ports.resolveHit=(...args)=>{r.record('resolveHit',...args);if(args[1]===a){r.caster.hexToggles.delete('b');r.caster.hexToggles.set('c',{inst:c});}};
  r.apply();assert.deepEqual(r.calls('resolveHit').map(args=>[args[1],args[3],args[4],args[5]]),[[a,0,1,true],[c,.4,1,true]]);
});

test('echo uses captured damage and grip severing divides by maximum life',()=>{
  const r=rig();r.caster.sheet.values.echoMight=.25;r.target.gripping={id:8,severed:.1};
  r.apply({dealt:40});const effect=r.caster.buffs[0];
  assert.equal(effect.id,'echoing_might');assert.equal(effect.duration,4);assert.equal(effect.mods[0].value,10);
  assert(Math.abs(r.target.gripping.severed-.14)<1e-12);
});

test('domination assigns ownership and lifetime before appending and publishing arrival cues',()=>{
  const r=rig();r.target.life=0;r.target.defId='mob';r.inst.dominate={chance:1,max:2,duration:7};r.apply();
  assert.equal(r.created.length,1);const thrall=r.created[0];assert.equal(thrall.owner,r.caster);assert.equal(thrall.team,'friend');
  assert.equal(thrall.sourceSkillId,'__dominate:hit');assert.equal(thrall.lifespan,7);assert.deepEqual(thrall.pos,r.target.pos);assert.notEqual(thrall.pos,r.target.pos);
  const names=r.events.map(e=>e.name);assert(names.indexOf('appendActor')<names.indexOf('companionBindCue'));assert(names.indexOf('companionArrivalCue')<names.indexOf('kill'));
});

test('sharing caps only the owner recovery and keeps its recipient snapshot across kill callbacks',()=>{
  const r=rig(),first=r.actor(3),second=r.actor(4),excluded=r.actor(5);
  for(const actor of [first,second,excluded])actor.owner=r.target;
  first.life=1;second.life=100;second.hitFlashType='fire';excluded.life=100;excluded.construct={};
  r.target.life=980;r.target.sheet.values.minionShare=.5;r.actors.push(first,second,excluded);
  r.ports.kill=actor=>{r.record('kill',actor);actor.dead=true;second.dead=true;second.owner=r.caster;r.actors.splice(r.actors.indexOf(second),1);};
  r.apply();assert.equal(r.target.life,1000);assert.equal(first.life,-24);assert.equal(second.life,75);assert.equal(excluded.life,100);
  assert.equal(second.hitFlash,.1);assert.equal(second.hitFlashType,undefined);assert.equal(r.calls('kill').length,1);
});

test('retaliation spends one charge before creating only the first eligible summon',()=>{
  const r=rig(),retaliate={charge:'chip',monsterId:'mob',duration:3,max:2};
  r.target.charges.set('chip',2);r.target.skills=[{def:{...r.def,id:'a',retaliate}},{def:{...r.def,id:'b',retaliate}}];r.apply();
  assert.equal(r.target.charges.get('chip'),1);assert.equal(r.created.length,1);assert.equal(r.created[0].sourceSkillId,'a');assert.equal(r.created[0].lifespan,3);
  assert.deepEqual(r.created[0].pos,{x:27,y:0,z:-24});assert.equal(r.first('scatterPosition')[0],r.caster);
  const names=r.events.map(e=>e.name);assert(names.indexOf('spendCharge')<names.indexOf('createMonster'));
});

test('displacement uses opaque host directions and preserves push versus pull order',()=>{
  const r=rig();r.packet.tags=new Set(['attack','melee']);r.caster.sheet.values.knockback=12;r.caster.sheet.values.displaceForce=-3;r.apply();
  const pushes=r.calls('push');assert.equal(pushes.length,2);assert.equal(pushes[0][2],12);assert.equal(pushes[1][2],3);
  assert.equal(pushes[0][1].from,r.caster.pos);assert.equal(pushes[0][1].to,r.target.pos);assert.equal(pushes[1][1].from,r.target.pos);assert.equal(pushes[1][1].to,r.caster.pos);
  const buffet=rig();buffet.packet.tags=new Set(['melee']);buffet.caster.sheet.values.knockback=4;buffet.caster.sheet.values.knockBuffet=1;buffet.apply();
  assert.equal(buffet.first('push')[1],buffet.randomDirection);assert.equal(buffet.first('push')[2],4);
});

test('current-life damage runs on non-damaging contacts, uses element precedence and leaves one life',()=>{
  const r=rig();r.target.life=101;r.target.sheet.values.damageTaken=.8;r.resistance=.25;
  r.def.currentLifeDamage=2;r.def.tags=['chaos','cold','fire'];r.apply({hasDamage:false,dealt:0});
  assert.equal(r.target.life,1);assert.equal(r.target.hitFlash,.15);assert.equal(r.target.hitFlashType,'fire');assert.equal(r.first('resistance')[1],'fire');assert.equal(r.first('currentLifeDamageCue')[1],100);
});

test('frame tags remain shared while the final sequence reads the live packet and buff spending reads current instance tags',()=>{
  const r=rig();r.ports.applyRiders=frame=>{r.record('applyRiders',frame);frame.tags.add('rider');r.packet.amounts.physical=7;};
  r.ports.sequenceLanded=(...args)=>{r.record('sequenceLanded',...args);r.inst.def={...r.def,id:'changed',tags:['cold']};};
  r.apply();assert(r.first('hitProcs')[9].has('rider'));assert.equal(r.first('sequenceLanded')[3],100);assert.equal(r.first('sequenceLanded')[4],7);
  const spent=r.calls('spendBuffs').find(args=>args[0]===r.caster&&args[1]==='hit');assert.deepEqual(spent[2],['cold']);assert.equal(spent[3],'hit');
});

test('captured lethal rewards survive revival while final death rereads life',()=>{
  const r=rig();r.target.life=0;r.caster.sheet.values.lifeOnKill=5;r.ports.throngOnHit=()=>{r.target.life=50;};r.apply();
  assert.equal(r.first('healBy')[1],5);assert.equal(r.first('hitProcs')[7],true);assert.equal(r.calls('kill').length,0);
  assert(r.calls('spendBuffs').some(args=>args[0]===r.caster&&args[1]==='kill'));
  const later=rig();later.caster.sheet.values.lifeOnKill=5;later.ports.throngOnHit=()=>{later.target.life=0;};later.apply();
  assert.equal(later.calls('healBy').length,0);assert.equal(later.first('hitProcs')[7],false);assert.equal(later.target.dead,true);
  assert.deepEqual(later.events.filter(e=>['killCharges','rollKillRemnants','rollKillOrbs','rollTriggers','kill'].includes(e.name)).map(e=>e.name),['killCharges','rollKillRemnants','rollKillOrbs','rollTriggers','kill']);
  assert.equal(later.first('rollTriggers')[1],'kill');
});

test('failure retains completed writes and stops the remaining continuation',()=>{
  const r=rig();r.target.volatile={skillId:r.def.id,chance:1};r.ports.volatileCue=()=>{throw new Error('cue failure');};
  assert.throws(()=>r.apply(),/cue failure/);assert.equal(r.target.volatileReadyAt,5.5);assert(r.target.volatileInst);
  assert.equal(r.calls('executeSkill').length,0);assert.equal(r.calls('knockFixtures').length,0);
});

test('nested contacts retain independent captured damage and critical values',()=>{
  const r=rig(),other=r.actor(3);r.actors.push(other);let nested=false;
  r.ports.knockFixtures=(...args)=>{r.record('knockFixtures',...args);if(!nested){nested=true;r.apply({target:other,dealt:7,crit:true,depth:1});}};
  r.apply();assert.deepEqual(r.calls('sequenceLanded').map(args=>args[3]),[7,100]);assert.deepEqual(r.calls('hitProcs').map(args=>args[6]),[true,false]);
});

test('melee trigger gates distinguish causal depth, trigger stamps, trigger specs and packet tags',()=>{
  for(const mode of ['plain','depth','stamp','spec','no-attack','no-melee','zero']){
    const r=rig();r.packet.tags=new Set(['attack','melee']);
    if(mode==='stamp')r.inst.state={trigDepth:1};if(mode==='spec')r.inst.trigger={};
    if(mode==='no-attack')r.packet.tags.delete('attack');if(mode==='no-melee')r.packet.tags.delete('melee');
    r.apply({depth:mode==='depth'?1:0,dealt:mode==='zero'?0:100});
    const calls=r.calls('rollTriggers').filter(args=>args[1]==='meleeHit');assert.equal(calls.length,mode==='plain'?1:0,mode);
    if(calls.length){assert(!Object.hasOwn(calls[0][2],'depth'));assert.deepEqual(calls[0][2].aim,{x:2,y:0,z:2});}
  }
});

test('hit-orb capacity is checked before enumeration and each chance keeps its rate and clock',()=>{
  const r=rig();r.orbs.push(null,null,null,null);r.orbKeys=['life','mana'];
  Object.assign(r.caster.sheet.values,{orb_life:.2,orb_mana:.4,orbShedRate:2});r.apply();
  assert.equal(r.orbs.length,6);assert.deepEqual(r.calls('orbHitChance').map(a=>[a[1],a[2],a[3]]),[['life',.4,4],['mana',.8,4]]);
  assert.deepEqual(r.calls('shedOrb').map(a=>a[2]),[{scatter:18,tier:0},{scatter:18,tier:0}]);
});

test('remnants include rolled elements and preserve placement, selection and phase-random order',()=>{
  const r=rig();r.def.tags=['cold'];r.packet.amounts.fire=5;r.caster.sheet.values.remnantChance=1;r.apply();
  assert.deepEqual(r.remnants,[{pos:{x:18,y:0,z:-14},element:'fire',bob:.125,life:14}]);
  assert.deepEqual(r.calls('chance'),[[.4]]);
  const selected=['scatterPosition','clampPoint','pick','randomPhase','appendRemnant'];
  assert.deepEqual(r.events.filter(e=>selected.includes(e.name)).map(e=>e.name),selected);
  const full=rig();full.remnants.push(...Array(14).fill(null));full.caster.sheet.values.remnantChance=1;full.apply();
  assert.equal(full.remnants.length,14);assert.equal(full.calls('chance').length,0);
});

test('spawn cadence preserves every/pct/hits precedence, zero chance and gauge reset before birth',()=>{
  const r=rig(),spec={monsterId:'mob',count:2,cap:5};
  const always={def:{id:'always'},gauge:7,spec:{...spec,every:true,pct:0,hits:2}};
  const never={def:{id:'never'},gauge:1,spec:{...spec,pct:0,hits:2}};
  const counter={def:{id:'counter'},gauge:1,spec:{...spec,hits:2}};r.inst.sockets=[always,never,counter];
  r.ports.birth=(...args)=>{r.record('birth',...args);if(args[3].capKey.endsWith(':counter'))assert.equal(counter.gauge,0);};
  r.apply();assert.deepEqual([always.gauge,never.gauge,counter.gauge],[7,1,0]);
  assert.deepEqual(r.calls('birth').map(a=>a[3].capKey),['__vein:hit:always','__vein:hit:counter']);
  for(const args of r.calls('birth')){assert.deepEqual(args[1],{type:'birth',monsterId:'mob',count:[2,2],cap:5,duration:6});assert.notEqual(args[2],r.target.pos);}
});

test('owner carry uses the summoning instance, kill-only charge chances and owner pickup ordering',()=>{
  const r=rig(),owner=r.actor(5,'friend'),contract={def:{...r.def,id:'summon'},gains:[
    {on:'hit',charge:'wrong',amount:3,max:5},
    {on:'kill',chance:0,charge:'none',amount:3,max:5},
    {on:'kill',chance:1,charge:'credit',amount:2,max:5},
  ]};
  r.caster.owner=owner;r.caster.summonInst=contract;r.target.life=0;r.target.rarity='rare';r.apply();
  assert.equal(r.first('carryProcs')[0],owner);assert.equal(r.first('carryProcs')[1],contract);assert.equal(r.first('carryProcs')[8],true);
  assert.equal(owner.charges.get('credit'),2);assert.equal(owner.charges.has('none'),false);assert.equal(owner.charges.has('wrong'),false);
  const owned=r.events.filter(e=>['carryProcs','gainCharge','rollKillOrbs','rollKillRemnants'].includes(e.name)&&e.args[0]===owner);
  assert.deepEqual(owned.map(e=>e.name),['carryProcs','gainCharge','rollKillOrbs','rollKillRemnants']);
  for(const mode of ['dead','declined']){const q=rig(),o=q.actor(8);q.caster.owner=o;q.caster.summonInst=contract;q.target.life=0;
    if(mode==='dead')o.dead=true;else q.ports.carryProcs=()=>false;q.apply();assert.equal(q.calls('gainCharge').length,0,mode);}
});

test('stride is spent once after buff consumption and an expired iron ward cannot gain storage',()=>{
  const r=rig();r.caster.strideDist=3;r.caster.strided=true;r.target.ironWard={stored:9,cap:10,until:5};r.apply();
  assert.equal(r.caster.strideSpent,true);assert.equal(r.target.ironWard.stored,10);
  r.now=5;r.target.ironWard.stored=9;r.apply();assert.equal(r.target.ironWard.stored,9);
  assert.equal(r.calls('strideCue').length,1);assert.equal(r.calls('conditionHolds').length,1);
  const names=r.events.map(e=>e.name);assert(names.indexOf('spendBuffs')<names.indexOf('strideCue'));
});

test('volatile admission independently rejects zero damage, nonpositive life, death, hidden targets, cooldown and chance failure',()=>{
  for(const mode of ['zero','life','dead','hidden','cooldown','chance','missing']) {
    const r=rig();r.target.volatile={skillId:r.def.id,chance:1};
    if(mode==='life')r.target.life=0;if(mode==='dead')r.target.dead=true;if(mode==='hidden')r.target.untargetable=true;
    if(mode==='cooldown')r.target.volatileReadyAt=5;if(mode==='chance')r.target.volatile.chance=0;if(mode==='missing')r.skills.clear();
    r.apply({dealt:mode==='zero'?0:100});assert.equal(r.calls('executeSkill').length,0,mode);assert.equal(r.calls('makeInstance').length,0,mode);
  }
});

test('element response requires its own positive damage type and stops after the first eligible row',()=>{
  const r=rig();r.target.onHitByType={cold:{status:'wrong'},physical:{status:'first'},fire:{status:'later'}};r.packet.amounts.fire=2;
  r.target.onHitTypeReadyAt=4;r.apply();assert.deepEqual(r.calls('applyStatus').map(a=>a[1]),['first']);assert.equal(r.target.onHitTypeReadyAt,4.8);
});

test('contagion enforces generation, readiness and zero decay independently',()=>{
  for(const mode of ['limit','ready','decay','dead','at-ready']) {
    const r=rig();r.inst.contagion={chance:1,decay:mode==='decay'?0:1};
    r.inst.state={contagion:{gen:mode==='limit'?3:1,seen:new Set()}};
    r.target.contagionReadyAt=mode==='ready'?5:4;if(mode==='dead')r.caster.dead=true;
    r.apply();assert.equal(r.pending.length,mode==='at-ready'?1:0,mode);
  }
});

test('curse and echo admit only the root hit while an unprocessed corpse still accepts a curse',()=>{
  for(const mode of ['root','depth','dead','corpse']) {
    const r=rig();r.inst.curse={};r.caster.hexToggles.set('self',{inst:r.inst});r.caster.hexToggles.set('hex',{inst:{def:r.def,curse:{}}});r.caster.sheet.values.echoMight=.2;
    if(mode==='dead')r.target.dead=true;if(mode==='corpse')r.target.life=0;
    r.apply({depth:mode==='depth'?1:0});assert.equal(r.calls('resolveHit').length,mode==='depth'||mode==='dead'?0:1,mode);
    assert.equal(r.calls('addBuff').length,mode==='depth'?0:1,mode);
  }
});

test('domination excludes bosses, owned minions and a full live cap',()=>{
  for(const mode of ['boss','owned','cap']) {
    const r=rig();r.target.life=0;r.target.defId='mob';r.inst.dominate={chance:1,max:1,duration:7};
    if(mode==='boss')r.monsters.get('mob').boss=true;if(mode==='owned')r.target.owner=r.caster;
    if(mode==='cap'){const old=r.actor(3);old.owner=r.caster;old.sourceSkillId='__dominate:hit';r.actors.push(old);}
    r.apply();assert.equal(r.created.length,0,mode);
  }
});

test('sharing excludes hidden minions and chained hits while retaliation enforces charge and live summon cap',()=>{
  for(const mode of ['hidden','depth']) {
    const r=rig(),m=r.actor(3);m.owner=r.target;m.untargetable=mode==='hidden';r.actors.push(m);r.target.sheet.values.minionShare=.5;
    r.apply({depth:mode==='depth'?1:0});assert.equal(m.life,900,mode);assert.equal(r.target.life,900,mode);
  }
  for(const mode of ['charge','cap']) {
    const r=rig(),def={...r.def,id:'retaliate',retaliate:{charge:'chip',monsterId:'mob',duration:3,max:1}};
    r.target.skills=[{def}];r.target.charges.set('chip',mode==='charge'?0:1);
    const old=r.actor(3);old.owner=r.target;old.sourceSkillId=def.id;if(mode==='cap')r.actors.push(old);
    r.apply();assert.equal(r.created.length,0,mode);assert.equal(r.calls('spendCharge').length,0,mode);
  }
});

test('nonlethal life damage applies resistance and increased damage taken before the ceiling',()=>{
  const r=rig();r.target.life=200;r.def.currentLifeDamage=.2;r.target.sheet.values.damageTaken=1.5;r.resistance=.25;
  r.apply({hasDamage:false,dealt:0});assert.equal(r.target.life,155);assert.equal(r.first('currentLifeDamageCue')[1],45);
});

test('splash uses the victim story and inclusive body edge before striking surfaces',()=>{
  const r=rig(),edge=r.actor(3),outside=r.actor(4),wrongStory=r.actor(5);r.caster.tier=1;
  r.target.pos={x:0,y:0,z:2};edge.pos={x:12,y:0,z:2};outside.pos={x:12.1,y:0,z:2};wrongStory.pos={x:1,y:0,z:2};wrongStory.tier=1;
  r.enemies=[r.target,edge,outside,wrongStory];r.caster.sheet.values.splashRadius=5;r.caster.sheet.values.aoeRadius=2;
  r.apply({multiplier:3});assert.deepEqual(r.calls('resolveHit').map(a=>[a[2],a[3],a[4]]),[[edge,1.5,1]]);
  assert.deepEqual(r.first('strikeSurfaces'),[r.caster,r.target.pos,10,0]);assert.equal(r.first('flash')[1],10);
});

test('full orb capacity rejects the whole hit-shed pass and a struck bell requires positive damage',()=>{
  const full=rig();full.orbs.push(...Array(5).fill(null));full.orbKeys=['life'];full.caster.sheet.values.orb_life=1;full.apply();assert.equal(full.calls('orbHitChance').length,0);
  for(const mode of ['live','zero','dead']) {
    const r=rig();r.target.construct={castOnStruck:true};if(mode==='dead')r.target.dead=true;
    r.apply({dealt:mode==='zero'?0:100});assert.equal(r.calls('ringBell').length,mode==='live'?1:0,mode);
  }
});

test('kill recovery keeps native resource ceilings and throng damage requires an attack',()=>{
  const r=rig();r.target.life=0;r.caster.mana=995;r.caster.es=998;
  Object.assign(r.caster.sheet.values,{lifeOnKill:7,manaOnKill:20,esOnKill:5});r.apply();
  assert.equal(r.caster.life,907);assert.equal(r.caster.mana,1000);assert.equal(r.caster.es,1000);
  for(const attack of [true,false]) {
    const q=rig();q.caster.summonInst={def:{...q.def,throng:{}},splash:.4};q.def.tags=attack?['attack']:['spell'];q.apply();
    assert.equal(q.calls('throngBurst').length,attack?1:0);if(attack)assert.deepEqual(q.first('throngBurst'),[q.caster,q.target.pos,36,.4,q.target]);
  }
});

test('owner carry falls back to the matching native skill and never rewards an uncaptured kill',()=>{
  const r=rig(),owner=r.actor(6),contract={def:{...r.def,id:'contract'},gains:[{on:'kill',charge:'a',amount:1,max:3}]};
  owner.skills=[null,{def:{...r.def,id:'other'}},contract];r.caster.owner=owner;r.caster.sourceSkillId='contract';
  r.ports.hitProcs=(...args)=>{r.record('hitProcs',...args);r.target.life=0;};r.apply();
  assert.equal(r.first('carryProcs')[1],contract);assert.equal(r.first('carryProcs')[7],false);assert.equal(r.calls('gainCharge').length,0);assert(r.target.dead);
});
