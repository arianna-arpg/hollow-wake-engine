import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Possessions} from '../dist/possession.js';
const rules={lifeFrac:.4,duration:14,powerFactor:.8,shiftPowerFactor:.9,policy:{normal:1,rare:.6,champion:.35,crowned:0},endOn:{huskLostFrac:.35,huskSeized:true},eject:{bodyStun:.8,selfStun:.6,cooldown:8},denyTags:['blocked']};
function setup(){
  const trace=[],actors=[],definitions=new Map([['beast',{name:'Beast'}]]);let time=10;
  const make=(id,over={})=>{const sources=new Map(),a={id,life:100,level:4,dead:false,pos:{x:10,y:20},radius:10,color:'#fff',team:'enemy',kind:'monster',defId:'beast',
    skills:[],statuses:[],cooldowns:new Map(),cooldownTotals:new Map(),casting:{},maxLife:()=>100,
    sheet:{get:s=>s==='possessDuration'?2:s==='huskGuard'?.2:0,setSource:(id,mods)=>sources.set(id,mods),removeSource:id=>sources.delete(id)},sources,
    applyStatus(id,dps,duration,source){trace.push(['status',this.id,id,duration,source]);if(!this.statuses.some(s=>s.id===id))this.statuses.push({id});},...over};actors.push(a);return a;};
  const hero=make(1,{team:'player',kind:'player'}),target=make(2,{life:40,faction:'wild'}),controller={id:'controller',actor:hero},controllers=[controller],skill={def:{id:'possession'}};
  const ports={actors:()=>actors,controllers:()=>controllers,controllerFor:a=>controllers.find(c=>c.actor===a),reindex:()=>trace.push(['index',controller.actor.id]),time:()=>time,
    definition:id=>definitions.get(id),status:()=>({duration:2}),tags:()=>new Set(),grantedTags:()=>[],modifiers:()=>[],
    createBody:(id,level,team)=>{const a=make(3,{defId:id,level,team});actors.pop();return a;},clamp:p=>p,
    text:(p,t)=>trace.push(['text',t]),flash:()=>trace.push('flash'),fail:(a,k,n)=>trace.push(['fail',n]),changed:c=>trace.push(['changed',c.actor.id]),
    embodied:s=>trace.push(['embodied',s]),ejected:s=>trace.push(['ejected',s]),returnSwarmForm:(b,r)=>trace.push(['swarm',b.id,r])};
  return {trace,actors,definitions,make,hero,target,controller,controllers,skill,ports,runtime:new Possessions(rules,ports),time:n=>{time=n;}};
}
test('structural possession gates hold even with explicit permission; boss and taxonomy rules honor overrides',()=>{
  const h=setup();h.definitions.set('beast',{name:'Beast',possessable:true,boss:true,tags:['blocked']});assert.equal(h.runtime.refusal(h.target),null);
  h.target.construct={};assert.equal(h.runtime.refusal(h.target),'nothing dwells in it');delete h.target.construct;h.target.owner={};assert.equal(h.runtime.refusal(h.target),"already another's creature");
  delete h.target.owner;h.definitions.set('beast',{name:'Beast',boss:true});assert.equal(h.runtime.refusal(h.target),'the will inside refuses');
  h.definitions.set('beast',{name:'Beast',boss:true,bossBar:false});assert.equal(h.runtime.refusal(h.target),null);
});
test('weakening is inclusive and rarity scales it while non-controller riders skip weakness',()=>{
  const h=setup();assert.equal(h.runtime.refusal(h.target),null);h.target.life=40.01;assert.equal(h.runtime.refusal(h.target),'not weakened enough');
  assert.equal(h.runtime.riderRefusal(h.target),null);h.target.rarity='rare';h.target.life=24;assert.equal(h.runtime.refusal(h.target),null);
  h.target.rarity='crowned';assert.equal(h.runtime.refusal(h.target),'the will inside refuses');h.target.vacated={seatId:'x'};assert.equal(h.runtime.riderRefusal(h.target),'a seat holds it');
});
test('embodiment preserves hero identity, carries the same gem and publishes after index and sheet changes',()=>{
  const h=setup();h.runtime.seize(h.hero,h.skill,h.target);
  assert.equal(h.controller.actor,h.target);assert.equal(h.controller.home,h.hero);assert.equal(h.target.skills.at(-1),h.skill);assert.equal(h.hero.casting,null);assert.equal(h.target.casting,null);
  assert.equal(h.target.team,'player');assert.equal(h.target.kind,'player');assert.equal(h.target.possession.until,38);assert.equal(h.target.possession.guiseFaction,'wild');
  assert.deepEqual(h.hero.sources.get('vacated'),[{stat:'damageTaken',kind:'more',value:-.2}]);assert.deepEqual(h.trace[0],['index',2]);
  assert.equal(h.trace.at(-2)[0],'embodied');assert.equal(h.trace.at(-2)[1].hero,h.hero);
});
test('eject restores role/kit, keeps wounds and existing cooldowns, then clears host ownership',()=>{
  const h=setup();const native={def:{id:'claw'}};h.target.skills=[native];h.hero.cooldowns.set('possession',20);h.hero.cooldownTotals.set('possession',25);
  h.runtime.seize(h.hero,h.skill,h.target);h.target.life=12;h.runtime.eject(h.controller,'press');
  assert.equal(h.controller.actor,h.hero);assert.equal(h.controller.home,undefined);assert.equal(h.hero.vacated,undefined);assert.equal(h.target.possession,undefined);
  assert.equal(h.target.team,'enemy');assert.equal(h.target.kind,'monster');assert.deepEqual(h.target.skills,[native]);assert.equal(h.target.life,12);
  assert.equal(h.hero.cooldowns.get('possession'),20);assert.equal(h.hero.cooldownTotals.get('possession'),25);assert(!h.hero.sources.has('vacated'));assert(!h.target.sources.has('possessed'));
  assert.equal(h.trace.at(-1)[0],'ejected');assert(h.target.statuses.some(s=>s.id==='stun'));
});
test('a replaced guest slot is not removed during return',()=>{
  const h=setup();h.runtime.seize(h.hero,h.skill,h.target);const other={def:{id:'other'}};h.target.skills[0]=other;h.runtime.eject(h.controller,'released');
  assert.deepEqual(h.target.skills,[other]);assert(!h.target.statuses.some(s=>s.id==='stun'));
});
test('carried husks leave the roster, shadow the body and return at its location once',()=>{
  const h=setup();h.runtime.seize(h.hero,h.skill,h.target,{husk:'carried'});assert(!h.actors.includes(h.hero));
  h.target.pos={x:80,y:90};h.runtime.advance(.1);assert.deepEqual(h.hero.pos,{x:80,y:90});h.runtime.eject(h.controller,'travel');
  assert.equal(h.actors.filter(a=>a===h.hero).length,1);assert.deepEqual(h.hero.pos,{x:80,y:90});assert.notEqual(h.hero.pos,h.target.pos);h.runtime.eject(h.controller,'travel');
  assert.equal(h.actors.filter(a=>a===h.hero).length,1);
});
test('husk pain and seizure interrupt before expiry',()=>{
  const h=setup();h.runtime.seize(h.hero,h.skill,h.target);h.hero.life=65;h.time(100);h.runtime.advance(.1);
  assert.equal(h.trace.at(-1)[1].reason,'huskPain');
  h.hero.life=100;h.runtime.seize(h.hero,h.skill,h.target);h.hero.heldBy=99;h.runtime.advance(.1);assert.equal(h.trace.at(-1)[1].reason,'huskSeized');
});
test('shapeshift uses source level, withdraws hero, appends guest gem and retires only its projection',()=>{
  const h=setup();h.runtime.shift(h.hero,h.skill,{form:'beast',duration:3});const form=h.controller.actor;
  assert.equal(form.level,4);assert(form.noBounty);assert.equal(form.possession.kind,'shift');assert.equal(form.possession.until,16);assert.equal(form.skills.at(-1),h.skill);
  h.time(16);h.runtime.advance(.1);assert.equal(h.controller.actor,h.hero);assert(form.dead);assert(!h.hero.dead);assert(h.actors.includes(h.target));
});
test('body death returns the controller and applies backlash without completing the host kill',()=>{
  const h=setup();h.runtime.shift(h.hero,h.skill,{form:'beast'});const form=h.controller.actor;h.runtime.eject(h.controller,'bodyDied');
  assert(!form.dead);assert.equal(h.controller.actor,h.hero);assert(h.hero.statuses.some(s=>s.id==='stun'));assert.equal(h.hero.cooldowns.get('possession'),8);
});
test('missing ride self-heals controller ownership and missing seat/form are quiet refusals',()=>{
  const h=setup();h.runtime.shift(h.target,h.skill,{form:'beast'});assert.equal(h.controller.actor,h.hero);
  h.runtime.shift(h.hero,h.skill,{form:'missing'});assert.equal(h.controller.actor,h.hero);
  h.runtime.seize(h.hero,h.skill,h.target);h.target.possession=undefined;h.runtime.advance(.1);assert.equal(h.controller.actor,h.hero);
});
test('a failing host notification retains committed ownership and explicit ejection can repair it',()=>{
  const h=setup();h.ports.changed=()=>{throw Error('view');};assert.throws(()=>h.runtime.seize(h.hero,h.skill,h.target),/view/);
  assert.equal(h.controller.actor,h.target);assert.equal(h.controller.home,h.hero);assert.equal(h.target.skills[0],h.skill);
  h.ports.changed=()=>{};h.runtime.eject(h.controller,'released');assert.equal(h.controller.actor,h.hero);
});
test('swarm-form return is ordered between view refresh and final ejection signal',()=>{
  const h=setup();h.runtime.seize(h.hero,h.skill,h.target);h.target.hiveForm={};h.trace.length=0;h.runtime.eject(h.controller,'released');
  assert.deepEqual(h.trace.slice(-3).map(row=>row[0]),['changed','swarm','ejected']);
});
