import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const {createStatusLifecycle,bankFracOf,statusRuptureRadius,tuneAilmentChance,statusBaselineDps,HOLLOW_WAKE_AILMENT_TUNING,WET_STAND_STATUSES}=await import(process.env.HWE_STATUS_MODULE?pathToFileURL(process.env.HWE_STATUS_MODULE).href:'../dist/status-lifecycle.js');
function context(defs={},stats={}) {
  const events=[],sources=new Map(),values={afflictionExpiry:1,...stats};
  const a={statuses:[],expiredStatuses:[],life:80,poise:0,poiseBroken:false,casting:null,rainWet:false,flying:false,flyingBase:false,touchdown:false,
    sheet:{get:id=>{events.push(['get',id]);return values[id]??0;},armedFamily:(prefix,ids)=>{events.push(['armed',prefix,[...ids]]);return values.relay?ids:[];},setSource:(id,mods)=>{events.push(['source',id]);sources.set(id,mods);},removeSource:id=>{events.push(['remove',id]);sources.delete(id);}},maxLife:()=>100};
  const ports={marker:7,relayIds:['a'],definition(id){assert.equal(this.marker,7);return defs[id];},random(){events.push(['random']);return .25;},skillContextTags:i=>new Set(i.def.tags),popCue:(a,id,d)=>events.push(['pop',id,d])};
  const r=createStatusLifecycle(ports);a.isWet=()=>r.isWet(a);a.applyStatus=(...args)=>r.applyStatus(a,...args);
  return {a,r,defs,ports,events,sources,values,apply:(id,dps=10,scale=1,opts)=>a.applyStatus(id,dps,scale,'source',opts)};
}
test('status services own ports and relay ids but read live, isolated definitions',()=>{
  const c=context({a:{duration:2}}, {relay:1}),d=context({a:{duration:9}});assert(Object.isFrozen(c.r));
  c.ports.definition=()=>{throw Error('replaced');};c.ports.random=()=>{throw Error('replaced');};c.ports.relayIds.push('late');
  c.a.statusRelay=()=>false;c.apply('a');d.apply('a');assert.equal(c.a.statuses[0].remaining,2);assert.equal(d.a.statuses[0].remaining,9);
  assert.deepEqual(c.events.find(e=>e[0]==='armed')[2],['a']);c.defs.a.duration=4;c.apply('a');assert.equal(c.a.statuses[0].remaining,4);
});
test('missing definitions and hostile immunity stop before relay and casting changes',()=>{
  const c=context({bad:{duration:2,forbidsTags:['spell']},good:{duration:3,beneficial:true}}, {debuffImmunity:1,relay:1});
  c.a.casting={inst:{def:{tags:['spell']}}};let calls=0;c.a.statusRelay=()=>{calls++;return false;};
  c.apply('absent');assert.equal(c.events.length,0);c.apply('bad');assert.equal(calls,0);assert(c.a.casting);assert.equal(c.a.statuses.length,0);
  c.apply('good');assert.equal(calls,1);assert.equal(c.a.statuses[0].remaining,3);
});
test('relay can consume, reenter through virtual apply, or fail before writes',()=>{
  const c=context({a:{duration:2}},{relay:1});let calls=0;c.a.statusRelay=(target,args)=>{calls++;assert.equal(target,c.a);target.applyStatus(args[0],args[1]+3,args[2],args[3],{relayed:true});return true;};
  c.apply('a');assert.equal(calls,1);assert.equal(c.a.statuses[0].dps,13);
  c.a.statusRelay=()=>{throw Error('relay');};assert.throws(()=>c.apply('a',100),/relay/);assert.equal(c.a.statuses[0].dps,13);
});
test('hard crowd control draws only with an intact poise gate',()=>{
  const c=context({a:{duration:2,hardCC:true}},{poiseCcAvoid:1});c.a.poise=.5;c.apply('a');assert(!c.events.some(e=>e[0]==='random'));
  c.r.endStatus(c.a,'a');c.a.poise=.5001;c.apply('a');assert.equal(c.a.statuses.length,0);assert.equal(c.events.filter(e=>e[0]==='random').length,1);
  c.a.poiseBroken=true;c.apply('a');assert.equal(c.a.statuses.length,1);assert.equal(c.events.filter(e=>e[0]==='random').length,1);
});
test('forbidden raw cast tags cancel before modifiers; hostile expiry skips blessings',()=>{
  const mods=[{value:-3}],c=context({a:{duration:8,forbidsTags:['spell'],mods},good:{duration:8,beneficial:true}},{afflictionExpiry:2});
  c.a.casting={inst:{def:{tags:['spell']}}};c.a.sheet.setSource=(id,m)=>{assert.equal(c.a.casting,null);c.sources.set(id,m);};
  c.apply('a',0,3);c.apply('good',0,3);assert.equal(c.a.statuses[0].remaining,12);assert.equal(c.a.statuses[1].remaining,24);assert.equal(c.sources.get('status:a'),mods);
});
test('wet authored banks use virtual wetness, strongest peak, cap and maximum remaining',()=>{
  const c=context({a:{duration:2,bank:{capMul:2,duration:4,wetMul:3}}});c.a.isWet=()=>true;
  c.apply('a',10,1,{casterId:1});const s=c.a.statuses[0];assert.equal(s.dps,30);assert.equal(s.remaining,4);assert.equal(s.bankFrac,.5);
  c.apply('a',20,2,{casterId:2});assert.equal(s.dps,90);assert.equal(s.bankPeak,60);assert.equal(s.bankFrac,.75);assert.equal(s.remaining,8);
  c.apply('a',10,1,{casterId:2});assert.equal(s.dps,120);assert.equal(s.remaining,8);assert.equal(s.total,8);assert.equal(s.bankFrac,1);
  const other=context(c.defs);other.a.isWet=()=>true;other.apply('a',10);assert.equal(other.a.statuses[0].dps,10);assert.equal(other.a.statuses[0].remaining,2);
});
test('buildup dispatches virtually and retains post-removal writes on the consumed record',()=>{
  const c=context({a:{duration:2,stacking:true,maxStacks:2,buildup:{into:'b'},mods:[{value:1}]},b:{duration:3}});
  c.apply('a');const consumed=c.a.statuses[0],apply=c.a.applyStatus;let calls=0;c.a.applyStatus=(...args)=>{calls++;return apply(...args);};
  c.apply('a',20,2,{power:2,rupture:4});assert.equal(calls,2);assert.equal(c.a.statuses.length,1);assert.equal(c.a.statuses[0].id,'b');assert.equal(c.a.statuses[0].power,2);
  assert.equal(consumed.rupture,4);assert.equal(consumed.statusDuration,4);assert(!c.sources.has('status:a'));
});
test('strongest refreshes only on higher damage and an armed fuse fixes its clock',()=>{
  const c=context({a:{duration:4,stackPolicy:'strongest'}});c.apply('a',10);const s=c.a.statuses[0];s.remaining=1;c.apply('a',10,3);assert.equal(s.remaining,1);
  c.apply('a',20,2);assert.equal(s.remaining,8);s.rupture=0;c.apply('a',30,3,{rupture:0});assert.equal(s.remaining,8);assert.equal(s.rupture,undefined);
  c.apply('a',40,3);assert.equal(s.remaining,12);s.rupture=1;s.ruptureRadius=30;c.apply('a',50,5,{rupture:2,ruptureRadius:120});assert.equal(s.remaining,12);assert.equal(s.rupture,3);assert.equal(s.ruptureRadius,120);
});
test('source and field scoping preserves shared modifier ownership until the final instance',()=>{
  const c=context({a:{duration:2,mods:[{value:1}]}});c.apply('a',1,1,{sourceKey:'x',challengeField:1});c.apply('a',2,2,{sourceKey:'y',challengeField:1});c.apply('a',3,3,{sourceKey:'x',challengeField:2});
  assert.equal(c.a.statuses.length,3);c.r.tickStatuses(c.a,2);assert.equal(c.a.expiredStatuses.length,1);assert(c.sources.has('status:a'));
  c.r.cleanseDebuffs(c.a,1);assert(c.sources.has('status:a'));c.r.endStatus(c.a,'a');assert(!c.sources.has('status:a'));assert.equal(c.a.expiredStatuses.length,1);
});
test('modifier publication borrows ordinary arrays and multiplies stack and strongest power',()=>{
  const mods=[{value:2,key:'slow'}],c=context({a:{duration:2,mods,stacking:true,modsPerStack:true,maxStacks:3}});c.apply('a',0);assert.equal(c.sources.get('status:a'),mods);
  c.apply('a',0,1,{power:2});assert.deepEqual(c.sources.get('status:a'),[{value:8,key:'slow'}]);c.apply('a',0,1,{power:.5});assert.equal(c.sources.get('status:a')[0].value,12);assert.equal(mods[0].value,2);
});
test('application stamps weak windows once and preserves first payload unless refresh is authored',()=>{
  const c=context({a:{duration:2,weakSpot:{size:.2,gap:.1}},b:{duration:2,refreshCaster:true}}),brood={monsterId:'m',perDamage:2,duration:3,max:4};
  c.apply('a',10,1,{casterId:1,brood,leech:.3});const s=c.a.statuses[0],window=s.window;c.a.life=1;c.apply('a',20,2,{casterId:2,brood:{...brood,max:9},leech:.1});
  assert.equal(s.window,window);assert.equal(window.hi,.7000000000000001);assert.equal(s.casterId,1);assert.equal(s.brood,brood);assert.equal(s.leech,.3);
  c.apply('b',0,1,{casterId:1});c.apply('b',0,1,{casterId:2});assert.equal(c.a.statuses[1].casterId,2);
});
test('pop debt follows cue callbacks and a fresh definition lookup for its damage type',()=>{
  const defs={a:{duration:4,dotType:'fire',pop:{fraction:.5}}},events=[];
  const c=context(defs);const r=createStatusLifecycle({...c.ports,popCue:(a,id,def)=>{events.push([id,def.dotType]);defs.a={...def,dotType:'cold'};a.statuses[0].popAcc+=1;}});
  r.applyStatus(c.a,'a',10,1,'x');r.applyStatus(c.a,'a',0,1,'x',{popBonus:1});assert.equal(c.a.statuses[0].popAcc,40);
  const ticks=[];assert.deepEqual(r.tickStatuses(c.a,.25,.25,(s,n,t)=>ticks.push([n,t])),{cold:41});assert.deepEqual(events,[['a','fire']]);assert.deepEqual(ticks,[[41,'cold']]);assert.equal(c.a.statuses[0].popAcc,0);
});
test('curved damage uses the decremented clock and expiring statuses pay the full frame',()=>{
  for(const [curve,expected]of [['ramp',5],['taper',15]]){const c=context({a:{duration:4,dpsCurve:curve}});c.apply('a',10);assert.deepEqual(c.r.tickStatuses(c.a,1),{untyped:expected});}
  const c=context({a:{duration:1}});c.apply('a',10);assert.deepEqual(c.r.tickStatuses(c.a,3),{untyped:30});assert.equal(c.a.expiredStatuses.length,1);
  const zero=context({a:{duration:1}});zero.apply('a',10);assert.deepEqual(zero.r.tickStatuses(zero.a,0),{untyped:0});
});
test('chrono time governs duration but damage uses simulation time; chrono-only ticks are silent',()=>{
  const c=context({a:{duration:2,timeScale:0,flight:true},b:{duration:2}});c.apply('a');c.apply('b');assert.deepEqual(c.r.tickStatuses(c.a,0,1),{untyped:0});assert.equal(c.a.statuses[0].remaining,1);assert.equal(c.a.statuses[1].remaining,2);assert(c.a.flying);
  c.r.tickChronoStatuses(c.a,2);assert.equal(c.a.statuses.length,1);assert.equal(c.a.expiredStatuses[0].id,'a');assert(c.a.flying);assert(!c.a.touchdown);c.r.tickStatuses(c.a,0);assert(!c.a.flying);assert(c.a.touchdown);
});
test('flight derivation respects base flight; cleanses are reverse, fractional and silent',()=>{
  const c=context({a:{duration:2},good:{duration:2,beneficial:true},fly:{duration:1,flight:true}});c.a.flyingBase=true;c.apply('fly');c.r.tickStatuses(c.a,2);assert(c.a.flying);assert(!c.a.touchdown);
  c.apply('a',1,1,{sourceKey:'one'});c.apply('good');c.apply('a',1,1,{sourceKey:'two'});assert.equal(c.r.cleanseDebuffs(c.a,.5),1);assert.equal(c.a.statuses[0].sourceKey,'one');assert.equal(c.a.statuses.length,2);assert.equal(c.r.cleanseDebuffs(c.a,0),0);assert.equal(c.r.cleanseDebuffs(c.a),1);assert.equal(c.a.statuses[0].id,'good');assert.equal(c.a.expiredStatuses.length,1);
});
test('tick callbacks change later leech and pop writes and errors preserve earlier clock changes',()=>{
  const c=context({a:{duration:2,dotType:'chaos'}});c.apply('a',10,1,{leech:.1});const s=c.a.statuses[0];let first=true;
  assert.deepEqual(c.r.tickStatuses(c.a,.5,.5,()=>{if(first){first=false;s.leech=.5;s.popAcc=4;}}),{chaos:9});assert.equal(s.leechAcc,4.5);
  assert.throws(()=>c.r.tickStatuses(c.a,.5,.5,()=>{throw Error('tick');}),/tick/);assert.equal(s.remaining,1);assert.equal(s.leechAcc,4.5);
});
test('queries keep tuple identity and evaluate context at each forbidden tag',()=>{
  const pair=[4,9],c=context({a:{duration:2,hardCC:true,panic:true,neverRetreats:true,fickleSpan:pair,forbidsTags:['first','second']},b:{duration:2,fickleSpan:[8,8]},wading:{duration:2}});c.apply('a');c.apply('b');c.apply('wading');
  assert(c.r.isStunned(c.a));assert(c.r.isPanicked(c.a));assert(c.r.neverRetreats(c.a));assert.equal(c.r.fickleSpan(c.a),pair);assert(c.r.isWet(c.a));
  let calls=0;const r=createStatusLifecycle({...c.ports,skillContextTags:()=>{calls++;return new Set(calls===2?['second']:[]);}});assert(r.tagsForbidden(c.a,{def:{tags:[]}}));assert.equal(calls,2);
});
test('public arithmetic handles missing definitions and preserves authored tuning and defaults',()=>{
  assert.equal(bankFracOf({dps:100},undefined),0);assert.equal(bankFracOf({dps:100,bankPeak:20},{bank:{capMul:2}}),1);assert.equal(bankFracOf({dps:-1,bankPeak:2},{bank:{capMul:2}}),0);
  assert.equal(statusRuptureRadius({}),90);assert.equal(statusRuptureRadius({ruptureRadius:0}),0);assert.equal(statusBaselineDps({baseline:{dps:10,perLevel:3}},0),10);assert.equal(statusBaselineDps({baseline:{dps:10,perLevel:3}},4),19);
  assert.equal(tuneAilmentChance('bleed',.69),0);assert.equal(tuneAilmentChance('bleed',.7),.7);assert.equal(tuneAilmentChance('burn',.2),.2*.35);assert.equal(tuneAilmentChance('other',.2),.2);assert.equal(tuneAilmentChance('burn',.2,{burn:{identityThreshold:.1,incidentalScale:0}}),.2);
  assert(Object.isFrozen(HOLLOW_WAKE_AILMENT_TUNING.burn));assert(Object.isFrozen(WET_STAND_STATUSES));
});
test('reentrant ticks have no shared accumulator and callback appends wait for the next frame',()=>{
  const c=context({a:{duration:4,dotType:'fire'},b:{duration:4,dotType:'cold'}});c.apply('a',10,1,{leech:.1});let nested;
  const result=c.r.tickStatuses(c.a,.5,.5,()=>{nested=c.r.tickStatuses(c.a,.25);c.apply('b',100);});assert.deepEqual(result,{fire:5});assert.deepEqual(nested,{fire:2.5});assert.equal(c.a.statuses[0].remaining,3.25);assert.equal(c.a.statuses[0].leechAcc,.75);assert.equal(c.a.statuses[1].remaining,4);
});
test('source callback failures leave the new live status committed and do not roll back',()=>{
  const c=context({a:{duration:2,mods:[{value:1}]}});c.a.sheet.setSource=()=>{throw Error('source');};assert.throws(()=>c.apply('a'),/source/);assert.equal(c.a.statuses.length,1);assert.equal(c.a.statuses[0].remaining,2);
});
