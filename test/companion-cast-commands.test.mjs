import test from 'node:test';
import assert from 'node:assert/strict';
import {CompanionCastCommands} from '../dist/companion-cast-commands.js';

function setup(){
  const events=[],actors=[];
  const make=(id,fields={})=>{const a={id,dead:false,life:20,manaReserved:0,pos:{x:0,y:0},radius:10,facing:0,tier:2,team:'ally',maxLife:()=>100,isMinion:()=>true,...fields};actors.push(a);return a;};
  const caster=make('caster'),skill={def:{id:'command',color:'green'}},controller={};
  const ports={actors:()=>actors,companions:(a,id)=>actors.filter(b=>b.owner===a&&b.sourceSkillId===id),noRecall:id=>id==='fixed',nativeDelivery:s=>s.def.delivery,
    revive(a,f){events.push(['revive',a.id,f]);a.downed=false;},recover:a=>events.push(['recover',a.id]),
    teleport(a,at,color,layer){events.push(['teleport',a.id,a.life,at,color,layer]);a.pos=at;},companionCue:(a,k,c)=>events.push(['cue',a.id,k,c.id]),
    whistleBonds:()=>events.push(['bonds']),controller:()=>controller,stance:(c,h,s)=>events.push(['stance',c,h,s]),
    refundCooldown:(a,id)=>events.push(['refund',id]),refused:(a,k,m)=>events.push(['refused',k,m]),
    explode:(a,f)=>events.push(['explode',a.id,f]),kill(a,v,k){events.push(['kill',a.id,v,k?.id]);a.dead=true;},
    selfCue:(c,s,a)=>events.push(['self',a.id]),burst:(at,r,n,color,team,tier)=>events.push(['burst',at,r,n,color,team,tier])};
  return {events,actors,make,caster,skill,ports,controller,commands:new CompanionCastCommands(ports)};
}
test('whistle without bonds refuses and refunds in source order',()=>{
  const s=setup();s.commands.whistle(s.caster,s.skill,{x:1,y:2});
  assert.deepEqual(s.events.map(e=>e[0]),['refused','refund']);
});
test('whistle preserves dormant indices, revives before filling, then emits the bond action',()=>{
  const s=setup();s.make('sleeping',{owner:s.caster,companion:true,companionDormant:true});
  const b=s.make('down',{owner:s.caster,companion:true,downed:true});
  s.make('other-owner',{companion:true});s.commands.whistle(s.caster,s.skill,{x:1,y:2});
  assert.equal(b.life,100);assert.equal(b.downed,false);
  assert.deepEqual(s.events.map(e=>e[0]),['revive','teleport','cue','bonds']);
  assert.equal(b.pos.x,Math.cos(Math.PI*.75+.7)*40);assert.equal(b.pos.y,Math.sin(Math.PI*.75+.7)*40);
});
test('a hosted whistle uses its own crew and still notifies bonds when every companion is dormant',()=>{
  const s=setup();s.skill.hostSkillId='host';s.make('one',{owner:s.caster,sourceSkillId:'host',companionDormant:true});
  s.make('different',{owner:s.caster,sourceSkillId:'other',companion:true});s.commands.whistle(s.caster,s.skill,{x:0,y:0});
  assert.deepEqual(s.events,[['bonds']]);
});
test('stance needs only a host controller; absent controller refunds without account access',()=>{
  const s=setup();s.commands.stance(s.caster,s.skill,'guard');assert.deepEqual(s.events,[['stance',s.controller,undefined,'guard']]);
  s.ports.controller=()=>undefined;s.commands.stance(s.caster,s.skill);assert.deepEqual(s.events.at(-1),['refund','command']);
});
test('recall selects mobile owned bodies, clears push before teleport and carries the owner layer',()=>{
  const s=setup(),a=s.make('a',{owner:s.caster,push:{x:2}}),b=s.make('b',{owner:s.caster,push:{x:2}});
  for(const fields of [{dead:true},{anchored:true},{leap:{}},{construct:{kind:'totem'}},{defId:'fixed'}])s.make('excluded',{owner:s.caster,...fields});
  s.make('foreign');s.commands.recall(s.caster,s.skill,20);
  assert.equal(a.push,null);assert.equal(b.push,null);assert.equal(a.pos.x,20);assert.equal(b.pos.x,-20);
  assert.deepEqual(s.events.map(e=>[e[1],e[5]]),[['a',2],['b',2]]);
});
test('detonation excludes reserved, persistent, foreign and unrelated-host bodies',()=>{
  const s=setup();s.skill.hostSkillId='host';
  s.make('spend',{owner:s.caster,sourceSkillId:'host'});
  for(const fields of [{sourceSkillId:'other'},{manaReserved:1},{summonInst:{def:{delivery:{type:'summon',persistent:true}}}},{construct:{kind:'totem'}}])s.make('keep',{owner:s.caster,sourceSkillId:'host',...fields});
  s.commands.detonate(s.caster,s.skill,.4);assert.deepEqual(s.events,[['explode','spend',.4],['kill','spend',false,'caster']]);
});
test('detonation snapshots the roster and does not kill twice when the explosion already killed',()=>{
  const s=setup(),a=s.make('a',{owner:s.caster}),b=s.make('b',{owner:s.caster});
  s.ports.explode=body=>{s.events.push(['explode',body.id]);body.dead=true;s.actors.splice(s.actors.indexOf(body),1);s.make('born',{owner:s.caster});};
  s.commands.detonate(s.caster,s.skill,1);assert.deepEqual(s.events,[['explode','a'],['explode','b']]);assert(a.dead&&b.dead);
});
test('shatter delegates authored death bursts and otherwise accepts only the original three construct kinds',()=>{
  const s=setup();s.make('death',{owner:s.caster,construct:{kind:'other',deathBurst:{}}});
  s.make('totem',{owner:s.caster,construct:{kind:'totem'}});s.make('keep',{owner:s.caster,construct:{kind:'wall'}});
  s.commands.shatter(s.caster,s.skill,.2,30);assert.deepEqual(s.events.map(e=>e[0]),['self','kill','burst','kill']);
  assert.deepEqual(s.events[2],['burst',{x:0,y:0},30,20,'green','ally',2]);
});
test('shatter snapshots the blast origin before querying body life',()=>{
  const s=setup(),body=s.make('totem',{owner:s.caster,construct:{kind:'totem'}});
  body.maxLife=()=>{body.pos.x=100;return 100;};s.commands.shatter(s.caster,s.skill,.2,30);
  assert.deepEqual(s.events[0][1],{x:0,y:0});
});
test('host failure during recall retains earlier body writes and stops subsequent recipients',()=>{
  const s=setup(),a=s.make('a',{owner:s.caster,push:{}}),b=s.make('b',{owner:s.caster,push:{}});
  s.ports.teleport=()=>{throw Error('host');};assert.throws(()=>s.commands.recall(s.caster,s.skill),/host/);
  assert.equal(a.push,null);assert.notEqual(b.push,null);
});
