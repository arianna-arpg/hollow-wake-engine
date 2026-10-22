import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CastingContinuation} from '../dist/casting-continuation.js';

function rig(mode='cast') {
  const inst={def:{id:'bolt',cooldown:4,concentration:{time:1,onBreak:'release',minRelease:.25}}};
  const cast={inst,mode,aim:{x:4,y:5,z:6},elapsed:0,total:1,held:true,baseMult:2};
  const actor={casting:cast,pos:{x:0,y:0,z:0},radius:1,dead:false,useLock:0,
    cooldowns:new Map(),cooldownTotals:new Map()};
  const quarry={...actor,casting:null,pos:{x:4,y:5,z:6},radius:2};
  const calls=[],draws=[],targets=new Map([['quarry',quarry]]);
  const state={primary:true,seated:true,stunned:false,invisible:0,persist:4,skillRecovery:2,
    globalRecovery:1,needsLine:true,clearLine:true,finesse:undefined,channel:undefined};
  const tags=new Set(['spell']),mods=[{value:2}],vessel={construct:{}};
  const ports={
    stunned:()=>state.stunned,lowerGuard:(a,i)=>calls.push(['lower',a.casting,a.shellGuard,i]),
    feedback:(a,s,kind)=>calls.push([kind,a.casting,a.useLock,s]),
    updateAim:()=>calls.push(['aim']),seated:()=>state.seated,primary:()=>state.primary,
    actor:id=>targets.get(id),assignAim:(aim,pos)=>Object.assign(aim,pos),copyAim:aim=>({...aim}),
    channel:()=>state.channel,random:()=>{assert(draws.length,'Unexpected draw');return draws.shift();},
    hold:s=>s.aiHold,needsFireLine:()=>state.needsLine,lineOfFire:()=>state.clearLine,
    finesse:()=>state.finesse,click:a=>{calls.push(['click']);runtime.press(a);},
    distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),tags:()=>tags,mods:()=>mods,
    stat:(a,id,t,m)=>{
      if(id==='invisible')return state.invisible;
      calls.push(['stat',id,t,m]);
      return id==='channelPersist'?state.persist:t?state.skillRecovery:state.globalRecovery;
    },
    target:(pos,body)=>({pos,actor:body}),
    deliver:(a,i,aim,options)=>calls.push(['deliver',a.casting,a.useLock,i,aim,options]),
    advanceGuard:(a,s,dt)=>calls.push(['guard',a,s,dt]),
    advanceChannel:(a,s,dt,t)=>calls.push(['channel',a,s,dt,t]),
    advanceCharged:(a,dt)=>calls.push(['charged',a,dt,a.casting.held]),
    plantTotem:(a,i,aim)=>calls.push(['totem',a.casting,a.useLock,i,aim]),
    spawnChannelVessel:(a,i,spec,aim)=>{calls.push(['vessel',a.casting,a.useLock,i,spec,aim]);return vessel;},
    acted:a=>calls.push(['acted',a.casting]),timingBonus:()=>undefined,
    timingCue:(a,cue,aim)=>calls.push(['cue',cue,aim]),
    flawless:(a,aim,i)=>calls.push(['flawless',aim,i]),
  };
  const config={channelGrace:.9,focusSlack:30};
  const runtime=new CastingContinuation(ports,config);
  return {runtime,actor,cast,inst,quarry,targets,calls,draws,state,ports,config,tags,mods,vessel};
}
const event=(r,name)=>r.calls.find(c=>c[0]===name);

test('idle update has no callbacks; idle click still records activity',()=>{
  const r=rig();r.actor.casting=null;r.runtime.advance(r.actor,.1);assert.deepEqual(r.calls,[]);
  r.runtime.press(r.actor);assert.deepEqual(r.calls,[['acted',null]]);
});
test('guard interruption lowers before removing its shell and clearing the cast',()=>{
  const r=rig('guard'),shell={fromAura:'bolt'};r.actor.shellGuard=shell;r.state.stunned=true;
  r.runtime.advance(r.actor,.1);
  assert.deepEqual(r.calls,[['lower',r.cast,shell,r.inst],['interrupt',null,0,r.cast]]);
  assert.equal(r.actor.shellGuard,undefined);
});
test('interruption preserves an unrelated shell',()=>{
  const r=rig(),shell={fromAura:'other'};r.actor.shellGuard=shell;r.state.stunned=true;
  r.runtime.advance(r.actor,0);assert.equal(r.actor.shellGuard,shell);assert.equal(r.actor.casting,null);
});
test('failed guard lowering preserves the original active cast and shell',()=>{
  const r=rig('guard'),shell={fromAura:'bolt'},error=new Error('lower');
  r.actor.shellGuard=shell;r.state.stunned=true;r.ports.lowerGuard=()=>{throw error;};
  assert.throws(()=>r.runtime.advance(r.actor,0),e=>e===error);
  assert.equal(r.actor.casting,r.cast);assert.equal(r.actor.shellGuard,shell);
});
test('failed interrupt feedback propagates after clearing without poisoning later casts',()=>{
  const r=rig(),error=new Error('cue');r.state.stunned=true;r.ports.feedback=()=>{throw error;};
  assert.throws(()=>r.runtime.advance(r.actor,0),e=>e===error);assert.equal(r.actor.casting,null);
  r.state.stunned=false;r.actor.casting={...r.cast};r.runtime.advance(r.actor,1);
  assert(event(r,'deliver'));
});
test('clinger tracking follows live-aim handling and preserves a 3D aim identity',()=>{
  const r=rig(),aim=r.cast.aim;r.state.seated=false;r.actor.clingTo={id:'quarry'};
  r.quarry.pos={x:10,y:20,z:30};r.ports.updateAim=()=>Object.assign(aim,{x:1,y:2,z:3});
  r.runtime.advance(r.actor,0);assert.equal(r.cast.aim,aim);assert.deepEqual(aim,r.quarry.pos);
});
test('seated, dead and missing clinger targets do not overwrite aim',()=>{
  for(const kind of ['seated','dead','missing']){
    const r=rig(),aim={...r.cast.aim};r.state.seated=kind==='seated';r.actor.clingTo={id:'quarry'};
    r.quarry.dead=kind==='dead';if(kind==='missing')r.targets.clear();
    r.runtime.advance(r.actor,0);assert.deepEqual(r.cast.aim,aim);
  }
});
test('AI charge hold uses the old clock and caps a long hold at full charge',()=>{
  const r=rig('charge');r.state.primary=false;r.cast.aiHold=10;r.cast.elapsed=.9;
  r.ports.advanceCharged=(a,dt)=>{r.calls.push(['held',a.casting.held]);a.casting.elapsed+=dt;};
  r.runtime.advance(r.actor,.1);r.runtime.advance(r.actor,0);
  assert.deepEqual(r.calls.filter(c=>c[0]==='held'),[['held',true],['held',false]]);
});
test('secondary-seat hold and finesse use deliberately different authority predicates',()=>{
  const r=rig('charge');r.state.primary=false;r.state.seated=true;r.cast.aiHold=5;r.cast.elapsed=1;
  r.runtime.advance(r.actor,0);assert.equal(r.cast.held,false);
  r.cast.mode='perfect';r.state.finesse={chance:1};r.runtime.advance(r.actor,0);
  assert.equal(r.cast.aiClickAt,undefined);assert.equal(event(r,'click'),undefined);
});
test('primary charge preserves the input-held flag at its cap',()=>{
  const r=rig('charge');r.cast.elapsed=1;r.runtime.advance(r.actor,0);assert.equal(r.cast.held,true);
});
test('completion-required and brim holds initialize without random draws',()=>{
  for(const [channel,hold] of [[{release:{requireFull:true}},4.5],[{brim:{fillTime:3}},3.4]]){
    const r=rig('channel');r.state.primary=false;r.state.channel=channel;
    r.runtime.advance(r.actor,0);assert.equal(r.cast.aiHold,hold);
    r.state.channel=undefined;r.runtime.advance(r.actor,0);assert.equal(r.cast.aiHold,hold);
  }
});
test('random hold is initialized once and gather overrides the instance channel',()=>{
  const r=rig('channel');r.state.primary=false;r.draws.push(.5);
  r.runtime.advance(r.actor,0);const hold=r.cast.aiHold;r.runtime.advance(r.actor,0);
  assert.equal(hold,1.2+.5*(2.6-1.2));assert.deepEqual(r.draws,[]);
  r.cast.aiHold=undefined;r.cast.gather={release:{requireFull:true},maxHold:7};
  r.state.channel={brim:{fillTime:1}};r.runtime.advance(r.actor,0);assert.equal(r.cast.aiHold,7.5);
});
test('channel line grace includes its boundary; clear and invalid prey reset it',()=>{
  const r=rig('channel');r.state.primary=false;r.cast.aiHold=10;r.actor.aiTargetId='quarry';r.state.clearLine=false;
  r.runtime.advance(r.actor,.4);assert.equal(r.cast.held,true);assert.equal(r.cast.losLost,.4);
  r.runtime.advance(r.actor,.5);assert.equal(r.cast.held,false);assert.equal(r.cast.losLost,.9);
  for(const kind of ['clear','dead','missing','not-required']){
    r.cast.losLost=.4;r.state.clearLine=kind==='clear';r.quarry.dead=kind==='dead';
    r.state.needsLine=kind!=='not-required';if(kind==='missing')r.targets.delete('quarry');else r.targets.set('quarry',r.quarry);
    r.runtime.advance(r.actor,0);assert.equal(r.cast.losLost,0,kind);
  }
});
test('unpracticed and spent finesse do not consume randomness',()=>{
  const r=rig('perfect');r.state.seated=false;r.runtime.advance(r.actor,0);assert.equal(r.cast.aiClickAt,-1);
  r.cast.aiClickAt=undefined;r.cast.pressUsed=true;r.state.finesse={chance:1};
  r.runtime.advance(r.actor,0);assert.equal(r.cast.aiClickAt,undefined);
});
test('AI finesse preserves success/fumble draw ordering and clamps timed markers',()=>{
  for(const [mode,chance,draws,expected] of [
    ['perfect',1,[.2,.5],.78+.5*(.96-.78)],['perfect',0,[.2,.5],.15+.5*(.6-.15)],
    ['timed',1,[.2,1],.96],['timed',0,[.2,.1,1],.6],
  ]){
    const r=rig(mode);r.state.seated=false;r.state.finesse={chance};r.cast.indicatorAt=.95;r.draws.push(...draws);
    r.runtime.advance(r.actor,0);assert.equal(r.cast.aiClickAt,expected);assert.deepEqual(r.draws,[]);
  }
});
test('AI clicks through the host entry at the exact pre-advance threshold',()=>{
  const r=rig('perfect');r.state.seated=false;r.cast.aiClickAt=.8;r.cast.elapsed=.8;
  r.runtime.advance(r.actor,0);assert.equal(r.cast.empowered,1.7);
  assert.deepEqual(r.calls.map(c=>c[0]),['aim','click','acted','cue','flawless']);
});
test('large timing steps do not invent substeps to rescue a missed AI window',()=>{
  const r=rig('timed');r.state.seated=false;r.cast.aiClickAt=.5;r.cast.indicatorAt=.5;
  r.runtime.advance(r.actor,.95);assert.equal(event(r,'click'),undefined);
  r.runtime.advance(r.actor,0);assert(event(r,'click'));assert.equal(r.cast.empowered,undefined);
});
test('focus tracking copies the full quarry position; release clears before delivery',()=>{
  const r=rig('concentration'),old=r.cast.aim;r.cast.quarryId='quarry';r.state.seated=false;
  r.quarry.pos={x:7,y:8,z:9};r.runtime.advance(r.actor,1);
  const delivered=event(r,'deliver');assert.equal(delivered[1],null);assert.equal(delivered[2],.15);
  assert.notEqual(r.cast.aim,old);assert.notEqual(r.cast.aim,r.quarry.pos);
  assert.notEqual(delivered[4],r.cast.aim);assert.deepEqual(delivered[4],r.quarry.pos);
  assert.notEqual(delivered[5].targetInfo.pos,r.quarry.pos);assert.equal(delivered[5].targetInfo.actor,r.quarry);
});
test('focus distance includes the radius-plus-slack boundary in three dimensions',()=>{
  const r=rig('concentration');r.cast.quarryId='quarry';r.cast.aim={x:4,y:5,z:38};
  r.runtime.advance(r.actor,.5);assert.equal(r.cast.focusBroken,false);assert.equal(r.cast.elapsed,.5);
  r.cast.aim.z+=.001;r.runtime.advance(r.actor,0);assert.equal(r.actor.casting,null);
  assert.equal(event(r,'deliver')[5].dmgMult,1);
});
test('invalid focus quarry is rejected before distance or automatic tracking',()=>{
  for(const kind of ['dead','downed','untargetable','invisible','missing']){
    const r=rig('concentration'),aim=r.cast.aim;r.cast.quarryId='quarry';r.state.seated=false;
    if(kind==='missing')r.targets.clear();else if(kind==='invisible')r.state.invisible=1;else r.quarry[kind]=true;
    r.ports.distance=()=>{throw new Error('Invalid quarry distance');};r.runtime.advance(r.actor,0);
    assert.equal(r.cast.aim,aim);assert.equal(r.actor.casting,null);assert(event(r,'fizzle'));
  }
});
test('focus fizzle observes feedback mutations before contextual/global cooldown reads',()=>{
  const r=rig('concentration');r.cast.held=false;r.cast.aiRecovery=7;
  r.ports.feedback=(a,s,kind)=>{assert.equal(a.casting,null);assert.equal(a.useLock,.15);assert.equal(s.aiRecovery,undefined);assert.equal(kind,'fizzle');r.state.skillRecovery=4;r.state.globalRecovery=2;};
  r.runtime.advance(r.actor,0);assert.equal(r.actor.cooldowns.get('bolt'),2);assert.equal(r.actor.cooldownTotals.get('bolt'),2);
  assert.deepEqual(r.calls.filter(c=>c[0]==='stat'),[['stat','cooldownRecovery',r.tags,r.mods],['stat','cooldownRecovery',undefined,undefined]]);
});
test('partial focus release with lost quarry copies aim and retains payment identity',()=>{
  const r=rig('concentration'),paid={mana:5,life:2};r.cast.elapsed=.4;r.cast.paidCost=paid;r.cast.chargesSpent=3;
  r.runtime.advance(r.actor,0);const d=event(r,'deliver');assert.equal(d[5].dmgMult,.8);
  assert.equal(d[5].paidCost,paid);assert.equal(d[5].chargesSpent,3);assert.equal(d[5].targetInfo.actor,undefined);
  assert.notEqual(d[4],r.cast.aim);assert.notEqual(d[5].targetInfo.pos,r.cast.aim);
});
test('existing mode services receive the original actor, cast, time and target',()=>{
  for(const mode of ['guard','channel','charge','overcharge']){
    const r=rig(mode),target={surface:'ground'};r.cast.targetInfo=target;r.runtime.advance(r.actor,.125);
    const call=event(r,mode==='charge'||mode==='overcharge'?'charged':mode);assert.equal(call[1],r.actor);
    if(mode==='guard'||mode==='channel'){assert.equal(call[2],r.cast);assert.equal(call[3],.125);}
    else assert.equal(call[2],.125);
    if(mode==='channel')assert.equal(call[4],target);assert.equal(r.actor.casting,r.cast);
  }
});
test('ordinary completion retains aim, target and payment identities',()=>{
  const r=rig(),target={surface:'ground'},paid={mana:3,life:1};Object.assign(r.cast,{targetInfo:target,paidCost:paid,chargesSpent:2,ventRounds:4,empowered:1.5});
  r.runtime.advance(r.actor,.5);assert.equal(event(r,'deliver'),undefined);
  r.runtime.advance(r.actor,.5);const d=event(r,'deliver');assert.equal(d[1],null);assert.equal(d[2],.1);
  assert.equal(d[3],r.inst);assert.equal(d[4],r.cast.aim);assert.equal(d[5].targetInfo,target);assert.equal(d[5].paidCost,paid);
  assert.deepEqual(d[5],{dmgMult:3,repeat:1,targetInfo:target,paidCost:paid,chargesSpent:2,ventRounds:4});
});
test('multitude repeats clamp to at least one and clicks cap at fifteen',()=>{
  const r=rig('multitude');r.cast.presses=14;r.runtime.press(r.actor);r.runtime.press(r.actor);
  assert.equal(r.cast.presses,15);assert.equal(event(r,'cue'),undefined);
  r.cast.presses=0;r.runtime.advance(r.actor,1);assert.equal(event(r,'deliver')[5].repeat,1);
});
test('totem placement wins over channel planting and stamps only the base clock',()=>{
  const r=rig();r.cast.plantTotem=true;r.cast.plantChannel=true;r.runtime.advance(r.actor,1);
  assert.deepEqual(event(r,'totem'),['totem',null,.1,r.inst,r.cast.aim]);assert.equal(event(r,'vessel'),undefined);
  assert.equal(r.actor.cooldowns.get('bolt'),4);assert.equal(r.actor.cooldownTotals.size,0);
});
test('channel vessel uses live context, minimum duration and one-held-channel policy',()=>{
  const r=rig();r.cast.plantChannel=true;r.state.persist=.5;r.runtime.advance(r.actor,1);
  const v=event(r,'vessel');assert.equal(v[1],null);assert.equal(v[2],.1);assert.equal(v[5],r.cast.aim);
  assert.deepEqual(v[4],{type:'construct',kind:'eruptor',range:240,duration:1.5,maxActive:2,life:40,placeRange:440,interval:.4});
  assert.equal(r.vessel.construct.holdOnce,true);assert.equal(r.actor.cooldowns.get('bolt'),4);
});
test('missing vessel still completes the cast and stamps its cooldown',()=>{
  const r=rig();r.cast.plantChannel=true;r.ports.spawnChannelVessel=()=>undefined;r.runtime.advance(r.actor,1);
  assert.equal(r.actor.casting,null);assert.equal(r.actor.cooldowns.get('bolt'),4);
});
test('failed delivery propagates after completion with no rollback or busy latch',()=>{
  const r=rig(),error=new Error('delivery');r.ports.deliver=()=>{throw error;};
  assert.throws(()=>r.runtime.advance(r.actor,1),e=>e===error);assert.equal(r.actor.casting,null);assert.equal(r.actor.useLock,.1);
  r.runtime.advance(r.actor,1);
});
test('successful click cues precede triggers; the trigger receives a copied 3D aim',()=>{
  const r=rig('perfect');r.cast.elapsed=.8;r.runtime.press(r.actor);r.runtime.press(r.actor);
  assert.deepEqual(r.calls.map(c=>c[0]),['acted','cue','flawless','acted']);
  assert.equal(event(r,'cue')[2],r.cast.aim);assert.notEqual(event(r,'flawless')[1],r.cast.aim);
  assert.deepEqual(event(r,'flawless')[1],r.cast.aim);assert.equal(event(r,'flawless')[2],r.inst);
});
test('click reads active state after activity callback and keeps committed timing on cue failure',()=>{
  const r=rig('perfect'),error=new Error('timing');r.cast.elapsed=.8;
  r.ports.acted=a=>{a.casting=null;};r.runtime.press(r.actor);assert.equal(r.cast.pressUsed,undefined);
  r.actor.casting=r.cast;r.ports.acted=()=>{};r.ports.timingCue=()=>{throw error;};
  assert.throws(()=>r.runtime.press(r.actor),e=>e===error);assert.equal(r.cast.pressUsed,true);
  r.runtime.press(r.actor);assert.equal(event(r,'flawless'),undefined);
});
test('independent controllers retain independent ports and copy configuration once',()=>{
  const a=rig('channel'),b=rig('channel');a.state.primary=false;b.state.primary=false;
  for(const r of [a,b]){r.cast.aiHold=10;r.actor.aiTargetId='quarry';r.state.clearLine=false;}
  a.config.channelGrace=0;a.runtime.advance(a.actor,.5);assert.equal(a.cast.held,true);assert.equal(b.cast.losLost,undefined);
  b.runtime.advance(b.actor,.9);assert.equal(b.cast.held,false);assert.equal(a.cast.held,true);
  assert.throws(()=>new CastingContinuation(a.ports,{channelGrace:-1,focusSlack:30}),/nonnegative/);
  assert.throws(()=>new CastingContinuation(a.ports,{channelGrace:Infinity,focusSlack:30}),/finite/);
});
