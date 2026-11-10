import test from 'node:test';import assert from 'node:assert/strict';
import {CompanionBonds,createCompanionBondsState,resolveCompanionBond,companionLevelOf,companionRecoverySeconds,DEFAULT_COMPANION_RULES,companionCanMimic} from '../dist/companion-bonds.js';
const mod=(stat,kind,value,tags)=>({stat,kind,value,...(tags?{tags}:{})});
function skill(id='strike',level=1){return{def:{id,tags:['attack','melee'],delivery:{type:'melee'},effects:[{type:'damage'}]},level,sockets:[],treeNodes:[]};}
function actor(id,skills=[]){return{id,skills,radius:10,level:1,life:50,pliesMax:4,plies:2,pos:{x:0,y:0},dead:false,downed:false,companion:false,companionDormant:false,
 casting:null,passive:false,ambushArmed:false,untargetable:false,aiAwakened:false,guardMode:false,cooldowns:new Map(),buffs:new Map(),sources:new Map(),name:'Beast',defId:'hound'};}
function fixture(spec={},overrides={}){
 const inst=skill('bond'),owner=actor(1,[inst]),native=skill(),beast=actor(2,[native]);beast.owner=owner;beast.sourceSkillId='__companion:bond';beast.companion=true;
 const world={actors:[owner,beast],enemies:[],time:0,cap:1,stance:'hunt',spec,inherit:{ownerMods:[],combatMods:[],size:1,guard:false,plyBonus:0}};
 const calls={retired:[],sources:[],status:[],levels:[],plies:[],bequests:[],revives:[],flashes:[],hits:[],casts:[],uses:[],repeats:[],orbs:[],charges:[],commands:[],cues:[],draws:0};
 const ports={actors:()=>world.actors,contains:a=>world.actors.includes(a),time:()=>world.time,random:()=>{calls.draws++;return .25;},
  spec:()=>world.spec,level:companionLevelOf,capacity:()=>world.cap,relevel:(a,level)=>{a.level=level;calls.levels.push(level);},recoveryStatus:()=> 'recovery',endStatus:(a,id)=>calls.status.push([a,id]),
  stanceId:()=>world.stance,stance:id=>({lunges:id!=='heel',cue:id}),setStance:(a,id)=>{a.stance=id;},inherit:()=>world.inherit,
  plyBonus:(a,n)=>{calls.plies.push(n);const spent=a.pliesMax-a.plies;a.pliesMax=4+n;a.plies=Math.max(0,a.pliesMax-spent);},bequests:(...args)=>calls.bequests.push(args),
  maxLife:a=>100*(1+(a.sources.get('companionBond')??[]).filter(m=>m.stat==='life').reduce((sum,m)=>sum+m.value,0)),
  setSource:(a,key,mods)=>{calls.sources.push(key);a.sources.set(key,mods);},removeSource:(a,key)=>a.sources.delete(key),sourceNames:a=>[...a.sources.keys()],sourceMods:(a,key)=>a.sources.get(key),
  hasSkill:id=>id!=='missing',makeSkill:skill,familySkill:()=> 'family',dreadSkill:(damage,level)=>({...skill('dread',level),damage}),
  copyForMimic:i=>({...i,sockets:[...i.sockets],treeNodes:[...i.treeNodes],state:undefined}),
  retirePayloads:(a,owned)=>{calls.retired.push([a,new Set(owned)]);calls.repeats=calls.repeats.filter(p=>p.caster!==a||!owned.has(p.inst));},
  payloadActive:(a,i)=>calls.repeats.some(p=>p.caster===a&&p.inst===i),removeBuff:(a,id)=>a.buffs.delete(id),
  addBuff:(a,buff)=>a.buffs.set(buff.id,{...buff,stacks:Math.min(buff.maxStacks??1,(a.buffs.get(buff.id)?.stacks??0)+1)}),modifier:mod,
  revive:(a,power)=>{calls.revives.push([a,power]);a.downed=false;},enemies:()=>world.enemies,flash:f=>calls.flashes.push(f),pulseHit:(...args)=>calls.hits.push(args),
  execute:(...args)=>calls.casts.push(args),use:(...args)=>calls.uses.push(args),repeat:r=>calls.repeats.push(r),orb:(...args)=>calls.orbs.push(args),charge:(...args)=>calls.charges.push(args),
  command:(...args)=>calls.commands.push(args),cue:(...args)=>calls.cues.push(args),...overrides};
 const state=createCompanionBondsState(),runtime=new CompanionBonds(ports,state);
 return{runtime,state,ports,world,calls,owner,beast,inst,native,current:()=>state.bodies.get(beast),start(){runtime.refresh();return this;}};
}
test('default rules are immutable and level/recovery policy remains configurable',()=>{
 assert(Object.isFrozen(DEFAULT_COMPANION_RULES));assert(Object.isFrozen(DEFAULT_COMPANION_RULES.level));assert(Object.isFrozen(DEFAULT_COMPANION_RULES.recovery));
 assert.equal(companionLevelOf(4.6,8),8);assert.equal(companionLevelOf(9.6,8),10);
 assert.equal(companionLevelOf(20,4.6,{follow:'claimed',keepClaimed:true,offset:3}),5);
 assert.equal(companionLevelOf(4,12,{follow:'keeper',keepClaimed:false,offset:-9}),1);
 assert.equal(companionRecoverySeconds(6),.5);assert.equal(companionRecoverySeconds(0),3);
 assert.equal(companionRecoverySeconds(6,{seconds:4,divideByPack:false}),4);assert.equal(companionRecoverySeconds(3,{seconds:-1,divideByPack:true}),0);
});
test('lexical patches retain duplicate additive inputs and deduplicate skill grants only',()=>{
 const rows={a:{slotsAdd:2,normalSure:.8,beastSkills:['x'],beastMods:[mod('life','more',.1)],rallyCapAdd:1,attackOrb:{kind:'a'}},b:{slotsAdd:1,normalSure:.2,beastSkills:['x','y'],familyArt:true,attackOrb:{kind:'b'}}};
 const input=['b','a','a','missing'],out=resolveCompanionBond(input,id=>rows[id]);
 assert.deepEqual(input,['b','a','a','missing']);assert.equal(out.slotsAdd,5);assert.equal(out.rallyCapAdd,2);assert.equal(out.normalSure,.8);
 assert.deepEqual(out.beastSkills,['x','y']);assert.equal(out.beastMods.length,2);assert.equal(out.beastMods[0],rows.a.beastMods[0]);assert.equal(out.attackOrb,rows.b.attackOrb);assert(out.familyArt);
});
test('mimic admission excludes resource, held, nonmelee and unsupported effect casts',()=>{
 const i=skill();assert(companionCanMimic(i));for(const type of ['cone','nova']){i.def.delivery.type=type;assert(companionCanMimic(i));}
 for(const key of ['targeting','channel','guard','chargeCost','pool','concentration','comboChain'])assert(!companionCanMimic({...i,def:{...i.def,[key]:{}}}));
 assert(!companionCanMimic({...i,def:{...i.def,delivery:{type:'projectile'}}}));assert(!companionCanMimic({...i,def:{...i.def,tags:['melee']}}));
 assert(!companionCanMimic({...i,def:{...i.def,effects:[{type:'summon'}]}}));
});
test('runtime state is instance owned and unhosted adoption is inert',()=>{
 const f=fixture(),other=new CompanionBonds(f.ports);assert.notEqual(f.state,other.state);assert.notEqual(f.state.copies,other.state.copies);
 f.runtime.adopt(actor(3));assert.equal(f.state.bodies.size,0);f.start();assert.equal(f.state.bodies.size,1);assert.equal(other.state.bodies.size,0);
});
test('adoption removes wild behavior and retains claimed native kit and radius',()=>{
 const f=fixture();Object.assign(f.beast,{level:8,brain:{wild:true},passive:true,ambushArmed:true,untargetable:true,casting:{inst:f.native}});f.beast.sources.set('ambush',[]);f.start();
 assert.equal(f.current().claimedLevel,8);assert.equal(f.beast.level,8);assert.deepEqual(f.beast.brain,{});assert.equal(f.beast.casting,null);
 assert.deepEqual([f.beast.passive,f.beast.ambushArmed,f.beast.untargetable,f.beast.aiAwakened],[false,false,false,true]);assert(!f.beast.sources.has('ambush'));assert.deepEqual(f.current().native,[f.native]);assert.equal(f.current().baseRadius,10);
});
test('unchanged refresh preserves granted identity, cooldowns and sheet sources',()=>{
 const f=fixture({beastSkills:['art']}).start(),art=f.beast.skills[1],state=f.current();f.beast.cooldowns.set('art',9);f.beast.life=12;f.runtime.refresh();
 assert.equal(f.current(),state);assert.equal(f.beast.skills[1],art);assert.equal(f.beast.cooldowns.get('art'),9);assert.equal(f.beast.life,12);assert.deepEqual(f.calls.sources,['companionBond','minionCombat']);
});
test('inherited source changes keep wounds, body size, guard state and context',()=>{
 const f=fixture().start();f.world.inherit={ownerMods:[mod('life','more',1)],combatMods:[mod('threat','more',2)],size:.1,guard:true,plyBonus:2,tags:new Set(['beast']),extra:[]};f.runtime.refresh();
 assert.equal(f.beast.life,100);assert.equal(f.beast.radius,5);assert(f.beast.guardMode);assert.equal(f.beast.pliesMax,6);assert.equal(f.beast.plies,4);assert.equal(f.calls.bequests.at(-1)[1],f.world.inherit);
});
test('growth remints granted arts, retires their cast and preserves cooldown and armor fraction',()=>{
 const f=fixture({beastSkills:['art']}).start(),old=f.beast.skills[1];f.beast.casting={inst:old};f.beast.cooldowns.set('art',7);f.owner.level=6;f.world.inherit.plyBonus=4;f.runtime.refresh();
 assert.equal(f.beast.level,6);assert.notEqual(f.beast.skills[1],old);assert.equal(f.beast.skills[1].level,6);assert.equal(f.beast.casting,null);assert.equal(f.beast.cooldowns.get('art'),7);assert.equal(f.beast.plies,4);assert.deepEqual(f.calls.levels,[6]);
});
test('removing a grant cancels only its cast and cooldown',()=>{
 const f=fixture({beastSkills:['art']}).start(),old=f.beast.skills[1];f.beast.casting={inst:old};f.beast.cooldowns.set('art',8);f.beast.cooldowns.set('strike',3);f.world.spec={};f.runtime.refresh();
 assert.equal(f.beast.casting,null);assert(!f.beast.cooldowns.has('art'));assert.equal(f.beast.cooldowns.get('strike'),3);assert.deepEqual(f.beast.skills,[f.native]);
});
test('peaceful native kits get claw; family grants deduplicate native IDs and skip missing data',()=>{
 const f=fixture({familyArt:true,beastSkills:['missing','strike']});f.native.def.effects=[];f.start();
 assert.deepEqual(f.beast.skills.map(s=>s.def.id),['strike','family','claw']);assert.equal(f.current().granted.get('strike').level,1);
});
test('capacity counts bond groups; dormant bodies lose contributions and recovery',()=>{
 const f=fixture({beastSkills:['art']});const second=actor(3,[skill()]),third=actor(4,[skill()]);
 for(const a of [f.beast,second,third])Object.assign(a,{owner:f.owner,sourceSkillId:'__companion:bond',companion:true,bondGroup:a===third?'b':'a'});
 third.companionReviveRemaining=2;f.world.actors.push(second,third);f.start();
 assert(!f.beast.companionDormant&&!second.companionDormant);assert(third.companionDormant&&third.downed);assert.equal(third.life,0);assert.equal(third.companionReviveRemaining,undefined);assert.deepEqual(third.sources.get('companionBond'),[]);assert.equal(third.stance,'');
});
test('raw policy changes retire old payloads before assigning new echo policy',()=>{
 const f=fixture({mimicMelee:{cooldown:3,power:.5},beastSkills:['art']}).start();f.runtime.onCast(f.owner,skill(),{x:2,y:3});const copy=f.calls.repeats[0].inst,art=f.current().granted.get('art');
 f.beast.casting={inst:copy};f.current().exposure.set(f.owner,3);f.current().pulseUntil=9;f.world.time=4;f.world.spec={mimicMelee:{cooldown:20,power:1}};f.inst.treeNodes=['changed'];f.runtime.refresh();
 assert.equal(f.current().echoAt,7);assert.equal(f.calls.repeats.length,0);assert.equal(f.beast.casting,null);assert.equal(f.current().exposure.size,0);assert.equal(f.current().pulseUntil,0);assert(f.calls.retired[0][1].has(copy)&&f.calls.retired[0][1].has(art));
});
test('raw tree order and support level changes invalidate payload policy',()=>{
 const f=fixture().start();f.inst.treeNodes=['b','a'];f.runtime.refresh();f.inst.treeNodes.reverse();f.runtime.refresh();f.inst.sockets=[{def:{id:'support'},level:1}];f.runtime.refresh();f.inst.sockets[0].level++;f.runtime.refresh();assert.equal(f.calls.retired.length,4);
});
test('roster retirement restores native state without cancelling unrelated casts',()=>{
 const f=fixture({beastSkills:['art']}).start();f.beast.casting={inst:f.native};f.beast.radius=20;f.beast.guardMode=true;f.beast.bequestSignature='old';f.beast.sources.set('bequest',[]);f.world.actors=[f.owner];f.runtime.refresh();
 assert.equal(f.state.bodies.size,0);assert.deepEqual(f.beast.skills,[f.native]);assert.equal(f.beast.casting.inst,f.native);assert.equal(f.beast.radius,10);assert(!f.beast.guardMode);assert(!f.beast.sources.has('bequest'));assert.equal(f.beast.bequestSignature,undefined);assert.equal(f.beast.stance,'');
});
test('downing retires owned effects and stamps revival countdown without offline advancement',()=>{
 const f=fixture({reviveSeconds:5}).start();f.beast.downed=true;f.runtime.down(f.beast);assert.equal(f.runtime.reviveClock(f.beast),5);assert.equal(f.beast.companionReviveRemaining,5);assert.equal(f.calls.retired.length,1);
 f.world.time=999;f.runtime.update(0);assert.equal(f.beast.companionReviveRemaining,5);f.runtime.update(2);assert.equal(f.beast.companionReviveRemaining,3);f.runtime.update(1);assert.equal(f.beast.companionReviveRemaining,2);f.runtime.update(2);assert.deepEqual(f.calls.revives,[[f.beast,1]]);
});
test('owner incapacitation pauses recovery; absence of the trait clears countdown',()=>{
 const f=fixture({reviveSeconds:5}).start();f.beast.downed=true;f.beast.companionReviveRemaining=3;f.owner.downed=true;f.runtime.update(8);assert.equal(f.beast.companionReviveRemaining,3);
 f.owner.downed=false;f.owner.dead=true;f.runtime.update(8);assert.equal(f.beast.companionReviveRemaining,3);f.owner.dead=false;f.world.spec={};f.runtime.update(1);assert.equal(f.beast.companionReviveRemaining,undefined);
});
test('issued copies persist only while host payloads remain in flight',()=>{
 const f=fixture({mimicMelee:{cooldown:2,power:.7}}).start();f.runtime.onCast(f.owner,skill(),{x:1,y:2});const r=f.calls.repeats[0];assert.equal(r.timer,.15);assert.equal(r.dmgMult,.7);f.runtime.update(0);assert(f.current().issued.has(r.inst));f.calls.repeats=[];f.runtime.update(0);assert.equal(f.current().issued.size,0);
});
test('mimic copy is owned before dispatch, cannot recurse, and retains its cooldown',()=>{
 const f=fixture({mimicMelee:{cooldown:2,power:.5}}).start(),original=skill(),aim={x:2,y:3};f.runtime.onCast(f.owner,original,aim);const copy=f.calls.repeats[0].inst;
 assert.notEqual(copy,original);assert.notEqual(copy.sockets,original.sockets);assert(f.state.copies.has(copy));assert(f.current().issued.has(copy));aim.x=9;assert.equal(f.calls.repeats[0].aim.x,2);
 f.runtime.onCast(f.owner,original,aim);f.world.time=2;f.runtime.onCast(f.owner,copy,aim);f.runtime.onCast(f.beast,original,aim);assert.equal(f.calls.repeats.length,1);f.runtime.onCast(f.owner,original,aim);assert.equal(f.calls.repeats.length,2);
});
test('dread cadence caps stacks and prunes targets that become ineligible',()=>{
 const f=fixture({dread:{radius:5,interval:2,damage:8,ramp:.5,maxStacks:2}}).start(),enemy=actor(10),far=actor(11);far.pos.x=9;f.world.enemies=[enemy,far];
 f.runtime.update(0);assert.equal(f.calls.hits[0][3],1);f.world.time=1;f.runtime.update(0);assert.equal(f.calls.hits.length,1);
 f.world.time=2;f.runtime.update(0);assert.equal(f.calls.hits[1][3],1.5);f.world.time=9;f.runtime.update(0);assert.equal(f.calls.hits.length,3);assert.equal(f.calls.hits[2][3],1.5);
 enemy.passive=true;f.runtime.update(0);assert.equal(f.current().exposure.size,0);assert.equal(f.calls.hits[0][1].damage,8);
});
test('whistle scopes host, obeys stance and stops pulses exactly at its deadline',()=>{
 const f=fixture({whistle:{skillId:'whistle',pulseSkill:'pulse',duration:3,interval:1}}).start(),i=skill('whistle');i.hostSkillId='other';f.runtime.whistle(f.owner,i,{x:4,y:5});assert.equal(f.current().pulseUntil,0);
 i.hostSkillId='bond';f.world.stance='heel';f.runtime.refresh();f.runtime.whistle(f.owner,i,{x:4,y:5});assert.equal(f.calls.commands.length,0);f.runtime.update(0);assert.deepEqual(f.calls.casts[0][3],{noRepeat:true,noCooldown:true});
 f.world.time=3;f.runtime.update(0);assert.equal(f.calls.casts.length,1);f.world.stance='hunt';f.runtime.refresh();f.runtime.whistle(f.owner,i,{x:4,y:5});assert.equal(f.calls.commands.length,1);
});
test('orb and charge have independent random draws and cooldowns; copies cannot proc',()=>{
 const f=fixture({attackOrb:{chance:.5,cooldown:3,kind:'life'},attackCharge:{chance:.5,cooldown:2,id:'fury'}}).start(),target=actor(9);f.runtime.onHit(f.beast,f.native,target);assert.equal(f.calls.draws,2);assert.equal(f.calls.orbs.length,1);assert.deepEqual(f.calls.charges[0],[f.beast,'fury',1,3]);
 f.runtime.onHit(f.beast,f.native,target);assert.equal(f.calls.draws,2);f.world.time=2;f.runtime.onHit(f.beast,f.native,target);assert.equal(f.calls.draws,3);f.state.copies.add(f.native);f.world.time=9;f.runtime.onHit(f.beast,f.native,target);assert.equal(f.calls.draws,3);
});
test('rally transfers once per bond group; crescendo grants pursuit and obeys stance',()=>{
 const f=fixture({rally:{maxStacks:2,damagePerStack:.1,duration:4},rallyCapAdd:1,frenzy:{duration:5,attackSpeed:.3,gapCloser:'pursuit'}}).start(),target=actor(8),id='companion_bond:1:bond:rally';
 f.owner.buffs.set(id,{stacks:3});f.runtime.onHit(f.owner,f.native,target);assert(!f.owner.buffs.has(id));assert.equal(f.beast.buffs.get(id).stacks,1);assert.equal(f.beast.buffs.get(id).maxStacks,3);assert(f.beast.buffs.has('companion_bond:1:bond:frenzy'));assert.equal(f.calls.uses[0][1].def.id,'pursuit');assert.equal(f.calls.commands[0][1].targetId,8);
 f.world.stance='heel';f.runtime.refresh();f.owner.buffs.set(id,{stacks:3});f.runtime.onHit(f.owner,f.native,target);assert.equal(f.calls.uses.length,1);
});
test('stance shift reaches living matching bonds and owns emitted arts',()=>{
 const f=fixture({stanceArt:'art'}).start();assert.equal(f.runtime.stanceShift(f.owner,'other','heel'),0);assert.equal(f.runtime.stanceShift(f.owner,'bond','heel'),1);assert.equal(f.calls.cues[0][2],'heel');assert(f.current().issued.has(f.calls.casts[0][1]));assert.deepEqual(f.calls.casts[0][3],{noRepeat:true});f.beast.downed=true;assert.equal(f.runtime.stanceShift(f.owner,'bond','hunt'),0);
});
test('saved projection retains durable rarity, claimed radius and remaining revival only',()=>{
 const f=fixture().start();Object.assign(f.beast,{radius:30,rarity:'rare',spawnScale:.8,downed:true,companionReviveRemaining:2});const mods=[mod('life','more',1)];f.beast.sources.set('rarity',mods);f.beast.sources.set('rarityStack1',[]);f.beast.sources.set('other',[]);
 const saved=f.runtime.saved(f.beast);assert.equal(saved.radius,10);assert.equal(saved.skillId,'bond');assert.equal(saved.reviveRemaining,2);assert.equal(saved.spawnScale,.8);assert.deepEqual(saved.raritySources.map(([id])=>id),['rarity','rarityStack1']);assert.equal(saved.raritySources[0][1],mods);assert(!('issued'in saved));assert(!('cooldowns'in saved));
});
test('host exceptions retain earlier ownership writes and stop later dispatch',()=>{
 const f=fixture({mimicMelee:{cooldown:2,power:1}},{repeat:()=>{throw Error('queue unavailable');}}).start();assert.throws(()=>f.runtime.onCast(f.owner,skill(),{x:0,y:0}),/queue unavailable/);assert.equal(f.current().issued.size,1);assert.equal(f.current().echoAt,2);assert(f.state.copies.has([...f.current().issued][0]));
});
