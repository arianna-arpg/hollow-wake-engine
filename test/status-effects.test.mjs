import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {createStatusEffects}=await import(process.env.HWE_STATUS_EFFECTS_MODULE?pathToFileURL(process.env.HWE_STATUS_EFFECTS_MODULE).href:'../dist/status-effects.js');
function rig(){
  const events=[],defs={burn:{duration:4,dotType:'fire',color:'orange',baseline:{dps:10,perLevel:2}},stack:{duration:4,color:'red',mods:[{value:3}],modsPerStack:true},doom:{duration:5,color:'purple',cullsAtLethal:true},impale:{duration:5,color:'grey',dischargeMatchingType:true},blessing:{duration:3,color:'white',beneficial:true},zap:{duration:8,color:'yellow',element:'lightning',baseline:{dps:10,perLevel:2},zapNearby:{interval:2,factor:.5,radius:40}},lash:{duration:8,color:'pink',baseline:{dps:20,perLevel:0},lashOut:{interval:3,factor:.5,radius:40}}};
  const make=id=>({id,pos:{x:0,y:0},radius:2,team:'enemy',life:100,dead:false,invulnerable:false,untargetable:false,passive:false,hitFlash:0,statuses:[],expiredStatuses:[],values:{damageTaken:1,statusMagnitude:2,effectDuration:1.5},
    sheet:{get(key,tags,extra){events.push(['get',id,key,tags,extra]);return actors.find(a=>a.id===id)?.values[key]??0;},setSource(key,mods){events.push(['source',id,key,mods]);},removeSource(key){events.push(['remove',id,key]);}},
    isStunned(){return false;},applyStatus(...args){events.push(['apply',id,...args]);},endStatus(key){events.push(['end',id,key]);this.statuses=this.statuses.filter(s=>s.id!==key);},cleanseDebuffs(count){events.push(['cleanse',id,count]);return count;}});
  const actors=[make(1),make(2),make(3)];let time=0;
  const ports={definition:id=>defs[id],actors:()=>actors,actorById:id=>actors.find(a=>a.id===id),time:()=>time,zoneLevel:()=>3,distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),sameStory:()=>true,
    skillContextTags:(_inst,tags=[])=>new Set(['spell',...tags]),instanceMods:()=>[],
    mitigateTyped:(a,amounts,o)=>{events.push(['mitigate',a.id,amounts,o]);return Object.values(amounts).reduce((n,v)=>n+v,0);},resistValue:(a,type)=>{events.push(['resist',a.id,type]);return .25;},
    recordIndirectDamage:(a,owner,before)=>events.push(['indirect',a.id,owner?.id,before,a.life]),kill:(...args)=>{events.push(['kill',...args.map(a=>typeof a==='object'?a.id:a)]);args[0].dead=true;},
    accumulateDotText:(a,n,dt)=>events.push(['dot',a.id,n,dt]),text:(...args)=>events.push(['text',...args]),flash:(...args)=>events.push(['flash',...args]),ruptureCue:(a,s,r)=>events.push(['ruptureCue',a.id,s.id,r])};
  return {events,defs,actors,ports,service:createStatusEffects(ports),time:v=>{time=v;},status:(id,fields={})=>({id,dps:10,stacks:1,remaining:4,sourceName:'origin',...fields})};
}
const of=(r,kind)=>r.events.filter(e=>e[0]===kind);
test('transplant respects the remaining floor, fractional stack count and its payload boundary',()=>{
  const r=rig(),s=r.status('burn',{remaining:-1,stacks:2.5,casterId:8,rupture:7,ruptureType:'cold',ruptureRadius:12,leech:.5,power:3});
  r.service.transplantStatus(r.actors[1],s,'move',{strengthScale:.5,durationScale:2});
  const applied=of(r,'apply');assert.equal(applied.length,3);assert.deepEqual(applied[0].slice(2),['burn',5,.025,'move',{casterId:8,rupture:7,ruptureType:'cold',ruptureRadius:12}]);assert.equal(s.stacks,2.5);
  r.service.transplantStatus(r.actors[1],{...s,challengeField:0},'field');assert.equal(of(r,'apply').length,3);
  r.service.transplantStatus(r.actors[1],s,'refresh',{duration:'refresh'});assert.equal(of(r,'apply')[3][4],1);
});
test('ringing keeps blessings and timed expiry while synchronizing stack modifiers',()=>{
  const r=rig(),a=r.actors[0],stack=r.status('stack',{stacks:4,power:9}),single=r.status('burn');a.statuses=[stack,single,r.status('blessing')];
  assert.equal(r.service.ringAfflictions(a,.5),2);assert.equal(stack.stacks,2);assert.equal(single.remaining,2);assert.equal(a.statuses.length,3);assert.deepEqual(of(r,'source')[0][3],[{value:6}]);
  r.service.ringAfflictions(a,2);assert.equal(single.remaining,-2);assert(a.statuses.includes(single));assert.equal(of(r,'remove').length,1);
});
test('duplicate source removal waits for its last ringing entry; cleanse owns its cue',()=>{
  const r=rig(),a=r.actors[0];a.statuses=[r.status('stack',{stacks:2}),r.status('stack',{stacks:2})];r.service.ringAfflictions(a,1);assert.equal(of(r,'remove').length,1);
  assert.equal(r.service.cleanseActor(a),2);assert.equal(of(r,'text').at(-1)[2],'cleansed');r.events.length=0;assert.equal(r.service.cleanseActor(a,0),0);assert.equal(of(r,'text').length,0);
});
test('shed retains legacy stale-reference splice and unscaled stack modifiers',()=>{
  const r=rig(),a=r.actors[0],s=r.status('stack',{stacks:3,power:10});a.statuses=[s];r.service.shedStatusStack(a,s);assert.deepEqual(of(r,'source')[0][3],[{value:6}]);
  r.service.shedStatusStack(a,r.status('stack'));assert.equal(a.statuses.length,0);assert.equal(of(r,'remove').length,1);
});
test('bank spend precedes defenses and directly lands the shared mitigated amount',()=>{
  const r=rig(),[caster,target]=r.actors,s=r.status('burn',{dps:20,stacks:3,remaining:4});target.statuses=[s];
  r.ports.mitigateTyped=(a,amounts,o)=>{assert.equal(s.dps,10);assert.deepEqual(amounts,{fire:240});assert.equal(o.attacker,caster);return 30;};
  assert.equal(r.service.ruptureBank(caster,target,'burn',.5,2),30);assert.equal(target.life,70);assert.equal(target.hitFlash,.15);assert.equal(of(r,'text')[0][5],undefined);assert.equal(of(r,'text')[0][6],14);assert.equal(of(r,'indirect').length,0);
});
test('zero bank payout still spends and flashes; immunity blocks the spend',()=>{
  const r=rig(),[caster,target]=r.actors,s=r.status('burn');target.statuses=[s];assert.equal(r.service.ruptureBank(caster,target,'burn',1,0),0);assert.equal(s.dps,0);assert.equal(of(r,'end').length,1);assert.equal(of(r,'flash').length,1);
  target.statuses=[r.status('burn')];target.invulnerable=true;r.events.length=0;assert.equal(r.service.ruptureBank(caster,target,'burn',1,1),0);assert.equal(target.statuses[0].dps,10);assert.equal(r.events.length,0);
});
test('throwing defenses preserve the already committed bank spend',()=>{
  const r=rig(),[caster,target]=r.actors,s=r.status('burn');target.statuses=[s];r.ports.mitigateTyped=()=>{throw Error('defense');};assert.throws(()=>r.service.ruptureBank(caster,target,'burn',.5,1),/defense/);assert.equal(s.dps,5);assert.equal(target.life,100);assert.equal(of(r,'flash').length,0);
});
test('rupture uses resistance directly, keeps radius edges and attributes before cues',()=>{
  const r=rig(),[a,b,c]=r.actors;b.pos.x=12;c.pos.x=13;r.ports.mitigateTyped=()=>{throw Error('wrong ladder');};
  r.service.ruptureStatus(a,r.status('burn',{rupture:40,ruptureRadius:10,casterId:3}));assert.equal(a.life,70);assert.equal(b.life,70);assert.equal(c.life,100);assert.deepEqual(of(r,'indirect')[0],['indirect',1,3,100,70]);assert.equal(r.events[0][0],'ruptureCue');assert.equal(of(r,'text').length,2);
});
test('rupture story gates precede arithmetic; immune actors still receive resistance queries',()=>{
  const r=rig(),[a,b,c]=r.actors;r.ports.sameStory=e=>e!==b;c.invulnerable=true;r.service.ruptureStatus(a,r.status('burn',{rupture:40,ruptureRadius:10}));assert.equal(b.life,100);assert.equal(c.life,100);assert.deepEqual(of(r,'resist').map(e=>e[1]),[1,3]);
});
test('doom cull removes armed statuses in reverse order at equality',()=>{
  const r=rig(),a=r.actors[0];a.life=20;a.statuses=[r.status('doom',{rupture:10,ruptureRadius:0}),r.status('doom',{rupture:10,ruptureRadius:0}),r.status('burn')];r.ports.actors=()=>[];
  r.service.assaultDoomCull(a);assert.deepEqual(a.statuses.map(s=>s.id),['burn']);assert.equal(of(r,'remove').length,1);assert.equal(of(r,'ruptureCue').length,2);
});
test('proc application uses level baseline, element tags and optional investment',()=>{
  const r=rig(),[caster,target]=r.actors;caster.values.dotLeech_burn=.2;caster.values.popPower_burn=.3;
  r.service.applyProcStatus({status:'burn',magnitude:1.5},'proc',caster,{},target);const app=of(r,'apply')[0];assert.equal(app[3],42);assert.equal(app[4],1.5);assert.deepEqual(app[6],{casterId:1,leech:.2,popBonus:.3,power:undefined});assert(of(r,'get').find(e=>e[2]==='statusMagnitude')[3].has('fire'));
  r.events.length=0;r.service.applyProcStatus({status:'stack'},'proc',caster,null,target);assert.equal(of(r,'apply')[0][3],0);assert.equal(of(r,'apply')[0][6].power,2);
  r.events.length=0;r.ports.zoneLevel=()=>{delete r.defs.burn.dotType;return 3;};
  r.service.applyProcStatus({status:'burn'},'changed during level read',caster,{},target);
  assert.deepEqual([...of(r,'get').find(e=>e[2]==='statusMagnitude')[3]],['spell']);
});
test('expiry discards matching-type charges and drains the live queue only on completion',()=>{
  const r=rig(),a=r.actors[0];a.expiredStatuses=[r.status('impale',{rupture:20}),r.status('burn',{rupture:20})];r.ports.actors=()=>[];r.service.expireStatuses(a);assert.equal(of(r,'ruptureCue').length,1);assert.equal(a.expiredStatuses.length,0);
  a.expiredStatuses=[r.status('burn',{rupture:20})];r.ports.ruptureCue=()=>{throw Error('cue');};assert.throws(()=>r.service.expireStatuses(a),/cue/);assert.equal(a.expiredStatuses.length,1);
});
test('zap initializes its beat, scales by stacks and never catches up after a time jump',()=>{
  const r=rig(),[a,b,c]=r.actors;a.statuses=[r.status('zap',{stacks:3})];c.team='player';r.ports.sameStory=()=>{throw Error('zap has no story gate');};
  r.service.zapStatuses(a);assert.equal(a.statuses[0].zapAt,2);assert.equal(b.life,100);r.time(20);r.service.zapStatuses(a);assert.equal(b.life,79);assert.equal(c.life,100);assert.equal(a.statuses[0].zapAt,22);r.service.zapStatuses(a);assert.equal(b.life,79);assert.equal(of(r,'flash').length,1);assert.deepEqual(of(r,'dot')[0],['dot',2,21,2]);
});
test('zap excludes passive and immune neighbors and suppresses a zero-damage cue',()=>{
  const r=rig(),[a,b,c]=r.actors;a.statuses=[r.status('zap',{zapAt:0})];b.passive=true;c.invulnerable=true;r.service.zapStatuses(a);assert.equal(of(r,'mitigate').length,0);assert.equal(of(r,'flash').length,0);
  b.passive=false;a.statuses[0].zapAt=0;r.ports.mitigateTyped=()=>0;r.service.zapStatuses(a);assert.equal(of(r,'flash').length,0);
});
test('lash picks the last equally close body regardless of team and does not multiply stacks',()=>{
  const r=rig(),[a,b,c]=r.actors;a.statuses=[r.status('lash',{lashAt:0,stacks:9})];b.pos.x=4;c.pos.x=-4;c.team='player';r.service.lashStatuses(a);assert.equal(b.life,100);assert.equal(c.life,90);assert.equal(a.statuses[0].lashAt,3);assert.equal(of(r,'flash').length,1);
});
test('lash preserves a blocked beat and shows contact even when mitigation absorbs it',()=>{
  const r=rig(),[a,b,c]=r.actors;a.statuses=[r.status('lash',{lashAt:0})];a.isStunned=()=>true;r.time(10);r.service.lashStatuses(a);assert.equal(a.statuses[0].lashAt,0);
  a.isStunned=()=>false;b.construct={};c.passive=true;r.service.lashStatuses(a);assert.equal(a.statuses[0].lashAt,13);assert.equal(of(r,'flash').length,0);
  c.passive=false;a.statuses[0].lashAt=0;r.ports.mitigateTyped=()=>0;r.service.lashStatuses(a);assert.equal(of(r,'flash').length,1);assert.equal(of(r,'text').length,0);
});
test('death capture retains references across detonation and later propagation',()=>{
  const r=rig(),[a,b]=r.actors,s=r.status('burn',{rupture:20,propagates:true,total:8,leech:.2,power:3,sourceKey:'discard',ruptureRadius:0});a.statuses=[s,r.status('impale',{rupture:20})];const captured=r.service.capturePropagation(a,false);assert.equal(captured[0],s);
  r.ports.actors=()=>[];r.service.detonateDeathStatuses(a,false);assert.equal(a.statuses.length,0);assert.equal(of(r,'ruptureCue').length,1);s.dps=30;r.ports.actors=()=>[a,b];r.service.propagateDeathStatuses(a,captured,false);
  const app=of(r,'apply')[0];assert.equal(app[3],30);assert.equal(app[4],2);assert.equal(app[6].leech,.2);assert.equal(app[6].power,3);assert(!('sourceKey' in app[6]));assert(!('ruptureRadius' in app[6]));
});
test('propagation caps recipients per status, permits passive bodies and silent death does nothing',()=>{
  const r=rig(),a=r.actors[0],kin=Array.from({length:8},(_,i)=>({...r.actors[1],id:i+10,passive:true}));r.ports.actors=()=>[a,...kin];const s=r.status('burn',{propagates:true});a.statuses=[s];
  r.service.propagateDeathStatuses(a,[s],false);assert.equal(of(r,'apply').length,6);assert.equal(of(r,'flash').length,1);r.events.length=0;assert.deepEqual(r.service.capturePropagation(a,true),[]);r.service.detonateDeathStatuses(a,true);r.service.propagateDeathStatuses(a,[s],true);assert.equal(a.statuses.length,1);assert.equal(r.events.length,0);
});
test('reentrant ruptures retain independent loops and live actor attribution',()=>{
  const r=rig(),[a,b]=r.actors;let nested=false;r.ports.actors=()=>[a,b];r.ports.text=()=>{if(!nested){nested=true;r.service.ruptureStatus(b,r.status('burn',{rupture:8,ruptureRadius:4}));}};r.service.ruptureStatus(a,r.status('burn',{rupture:4,ruptureRadius:4}));assert.equal(a.life,91);assert.equal(b.life,91);assert.equal(of(r,'indirect').length,4);
});
