import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MinionOrders} from '../dist/minion-orders.js';

function setup(){
  const trace=[],skill={def:{id:'command'}},make=(id,over={})=>({id,pos:{x:0,y:0},tier:0,dead:false,skills:[],sheet:{get:()=>0},
    ownedBy(owner){return this.owner===owner;},useLock:5,mana:3,maxMana:()=>20,...over});
  const caster=make(1),roster=[caster],enemies=[],ports={actors:()=>roster,enemies:()=>enemies,time:()=>10,random:()=>{trace.push('random');return .5;},
    commandExists:id=>['assault','recall'].includes(id),skillExists:()=>true,serves:(a,id)=>a.source===id,throng:a=>!!a.throng,
    obedience:a=>{trace.push(['obedience',a.id]);return a.obedience??1;},issue:(a,order)=>{trace.push(['issue',a.id]);a.order=order;},
    promoteCommand:()=>trace.push('promote-command'),liteKind:()=>2,promote:()=>trace.push('promote-lite'),level:()=>4,
    makeSkill:(id,level)=>({def:{id},level}),forwardSockets:(s,d)=>trace.push(['sockets',s,d]),
    execute:(a,s,at,opts)=>{trace.push(['execute',a.id,s,at,opts,a.useLock,a.mana]);return true;},
    assault:(c,s,recipients,recall)=>trace.push(['assault',recipients.map(a=>a.id),recall]),
    defied:a=>trace.push(['defied',a.id]),sent:()=>trace.push('sent'),unheeded:()=>trace.push('unheeded'),
    empty:()=>trace.push('empty'),unknown:(...args)=>trace.push(['unknown',...args])};
  const runtime=new MinionOrders({duration:6,pinRadius:52,earshot:640,delegates:2},ports);
  return {trace,skill,make,caster,roster,enemies,ports,runtime};
}
test('commands retain identity, stable quarry ties and obedience-before-random evaluation',()=>{
  const h=setup(),a=h.make(2,{owner:h.caster});h.roster.push(a);h.enemies.push(h.make(3,{pos:{x:10,y:0}}),h.make(4,{pos:{x:-10,y:0}}));
  h.runtime.command(h.caster,h.skill,{x:0,y:0},{},'#fff');
  assert.deepEqual(a.order,{kind:'assault',pos:{x:0,y:0},until:16,radius:undefined,targetId:3,issuerId:1});
  assert.deepEqual(h.trace,['promote-command',['obedience',2],'random',['issue',2],['assault',[2],false],'sent']);
});
test('recipient scopes distinguish ownership, distant squadmates and faction earshot',()=>{
  const h=setup();h.caster.squadId=9;h.caster.faction='f';
  h.roster.push(h.make(2,{owner:h.caster}),h.make(3,{squadId:9,pos:{x:2000,y:0}}),h.make(4,{faction:'f',pos:{x:640,y:0}}),
    h.make(5,{faction:'f',pos:{x:641,y:0}}),h.make(6,{squadId:9,passive:true}),h.make(7,{owner:h.caster,construct:{}}));
  h.runtime.command(h.caster,h.skill,{x:0,y:0},{affects:'both'},'#fff');
  assert.deepEqual(h.roster.filter(a=>a.order).map(a=>a.id),[2,3,4]);
});
test('host identity and explicit radius narrow recipients before consuming random',()=>{
  const h=setup();h.skill.hostSkillId='bond';
  h.roster.push(h.make(2,{owner:h.caster,source:'bond',pos:{x:20,y:0}}),h.make(3,{owner:h.caster,source:'other'}),
    h.make(4,{owner:h.caster,source:'bond',pos:{x:21,y:0}}));
  h.runtime.command(h.caster,h.skill,{x:0,y:0},{radius:20},'#fff');
  assert.equal(h.trace.filter(v=>v==='random').length,1);assert(h.roster[1].order);assert(!h.roster[2].order);assert(!h.roster[3].order);
});
test('invisible/passive and exact-pin-radius enemies cannot become quarry',()=>{
  const h=setup(),a=h.make(2,{owner:h.caster});h.roster.push(a);
  h.enemies.push(h.make(3,{passive:true}),h.make(4,{sheet:{get:()=>1}}),h.make(5,{pos:{x:52,y:0}}));
  h.runtime.command(h.caster,h.skill,{x:0,y:0},{},'#fff');assert.equal(a.order.targetId,undefined);
});
test('defiance still runs assault with empty recipients and retains presentation order',()=>{
  const h=setup();h.roster.push(h.make(2,{owner:h.caster,obedience:.5}));
  h.runtime.command(h.caster,h.skill,{x:0,y:0},{command:'recall'},'#fff');
  assert.deepEqual(h.trace.slice(-3),[['defied',2],['assault',[],true],'unheeded']);
});
test('unknown commands cannot promote or mutate the roster',()=>{
  const h=setup();h.runtime.command(h.caster,h.skill,{x:0,y:0},{command:'unknown'},'#fff');
  assert.deepEqual(h.trace,[['unknown','unknown','command']]);
});
test('command traversal is live while per-recipient mark objects are detached',()=>{
  const h=setup(),first=h.make(2,{owner:h.caster}),late=h.make(3,{owner:h.caster});h.roster.push(first);
  const issue=h.ports.issue;h.ports.issue=(a,order)=>{issue(a,order);if(a===first){order.pos.x=500;h.roster.push(late);}};
  const aim={x:10,y:20};h.runtime.command(h.caster,h.skill,aim,{},'#fff');
  assert.equal(late.order.pos.x,10);assert.equal(aim.x,10);assert.notEqual(first.order.pos,late.order.pos);
});
test('delegated casts promote before selection, cap only throng, preserve roster order and refill before execution',()=>{
  const h=setup();h.skill.hostSkillId='swarm';h.caster.skills=[{def:{id:'swarm',throng:{tier:'lite',monsterId:'rat'}}}];
  h.roster.push(h.make(2,{owner:h.caster,source:'swarm',throng:true,pos:{x:30,y:0}}),h.make(3,{owner:h.caster,source:'swarm',throng:true,pos:{x:10,y:0}}),
    h.make(4,{owner:h.caster,source:'swarm',throng:true,pos:{x:-10,y:0}}),h.make(5,{owner:h.caster,source:'swarm',mana:80}),h.make(6,{owner:h.caster,source:'other'}));
  h.runtime.cast(h.caster,h.skill,{x:0,y:0},{skillId:'strike'});
  assert.equal(h.trace[0],'promote-lite');const calls=h.trace.filter(v=>v[0]==='execute');
  assert.deepEqual(calls.map(v=>v[1]),[3,4,5]);assert.deepEqual(calls.map(v=>v.slice(-2)),[[0,20],[0,20],[0,80]]);
  assert.notEqual(calls[0][2],calls[1][2]);assert.equal(calls[0][2].level,4);
});
test('enemy delegation uses strict range, first ties, and never refills an actor without a target',()=>{
  const h=setup(),a=h.make(2,{owner:h.caster});h.roster.push(a);h.enemies.push(h.make(3,{pos:{x:340,y:0}}));
  h.runtime.cast(h.caster,h.skill,{x:0,y:0},{skillId:'strike',at:'enemy'});assert.equal(a.mana,3);assert.equal(a.useLock,5);assert.equal(h.trace.at(-1),'empty');
  h.enemies.push(h.make(4,{pos:{x:20,y:0}}),h.make(5,{pos:{x:-20,y:0}}));
  h.runtime.cast(h.caster,h.skill,{x:0,y:0},{skillId:'strike',at:'enemy'});assert.deepEqual(h.trace.at(-1)[3],{x:20,y:0});
});
test('delegation snapshots recipients and retains prefix writes on callback failure',()=>{
  const h=setup(),a=h.make(2,{owner:h.caster}),b=h.make(3,{owner:h.caster});h.roster.push(a,b);
  h.ports.execute=()=>{h.roster.push(h.make(4,{owner:h.caster}));throw Error('host failed');};
  assert.throws(()=>h.runtime.cast(h.caster,h.skill,{x:0,y:0},{skillId:'strike'}),/host failed/);
  assert.equal(a.mana,20);assert.equal(a.useLock,0);assert.equal(b.mana,3);assert.equal(h.roster[3].mana,3);
});
