import {test} from 'node:test';import assert from 'node:assert/strict';import {FieldSimulation} from '../dist/field-simulation.js';import {FieldDeliveries} from '../dist/field-deliveries.js';
function setup(){let time=0;const events=[],state={zones:[],domainSeq:0,sparkSeq:0},actors=[];
  const make=(id,team,x)=>{const sources=new Map();return{id,team,pos:{x,y:0},facing:0,radius:5,tier:0,kind:team==='ally'?'player':'monster',dead:false,untargetable:false,statuses:[],reservedMana:20,sources,
    sheet:{get:(k,_t,_m,base)=>['effectDuration','cascadeStep','healPower'].includes(k)?1:base??0,setSource:(k,v)=>sources.set(k,v),removeSource:k=>{events.push(['strip',id,k]);sources.delete(k);}},
    applyStatus(id){events.push(['status',this.id,id]);this.statuses.push({id});},healBy:n=>{events.push(['heal',id,n]);return n;}};};
  const actor=make(1,'ally',0),enemy=make(2,'enemy',10),skill={level:1,def:{id:'field',name:'Field',color:'red',tags:['spell'],delivery:{type:'ground'}}};actors.push(actor,enemy);
  const ports={time:()=>time,random:()=>.5,actors:()=>actors,actorById:id=>actors.find(a=>a.id===id),enemiesOf:()=>actors.filter(a=>a.team==='enemy'&&!a.dead),encounterLevel:()=>1,activeBoss:()=>undefined,passiveMonster:()=>false,
    regionAt:()=>undefined,underRoofAt:()=>false,isDormant:()=>false,clampPos:p=>p,lineOfFire:()=>true,skillOcclusion:()=> 'free',bodyWhere:(a,p)=>p(a.pos,a.radius)?{seg:-1}:null,noteBodyHit(){},
    skillContextTags:()=>new Set(),instanceMods:()=>[],instanceDelivery:i=>i.def.delivery,socketSpec:()=>undefined,baselineStatusDps:()=>0,hasSkill:()=>true,makeSkill:()=>skill,
    resolveHit:(_a,_i,b,m)=>events.push(['hit',b.id,m]),executeSkill(){},birthAt(){},releaseStruckSummons(){},healAlliesInArea(){},frontSplash(){},strikeSurfaces(){},addTempGround(){},plantImpactDress(){},flash:cue=>events.push(['flash',cue]),text(){},presenceProfile:()=>undefined,skillPresenceVoice:()=>undefined,combatCueFlash:(at,_voice,radius,_facing,color)=>({pos:at,radius,color,life:.3,maxLife:.3})};
  const runtime=new FieldSimulation(state,{expireCueSeconds:.3,maddenEpsilon:1e-6,occludingDeliveries:{ground:true}},ports);
  const field=patch=>({pos:{x:0,y:0},radius:40,caster:actor,inst:skill,color:'red',delay:0,exploded:true,linger:2,linger0:2,tickInterval:.2,tickTimer:0,shape:0,facing:0,dmgMult:1,depth:0,...patch});
  return{events,state,actors,actor,enemy,skill,ports,runtime,field,step:dt=>{time+=dt;runtime.updateZones(dt);}};
}
test('placement and clock share one field owner; pulses fire once per update and retirement releases it',()=>{
  const h=setup(),delivery=new FieldDeliveries(h.state,{conjure:{lineStep:1,lineMaxHops:4},forwarding:{scale:{},scaleDefault:1}},
    {...h.ports,clampGroundTarget:(_a,p)=>({...p}),instanceEffects:()=>[],instanceBirth:()=>undefined,instanceTurret:()=>undefined,expireZone:z=>h.runtime.expireZone(z),
      instancePulsePlan:()=>({native:{delay:.2,count:2},appended:[]}),instanceSizeOver:()=>undefined,maddenBankOf:()=>undefined,hostSockets:()=>[],instanceCascadePlan:()=>({recasts:[]})});
  delivery.ground({caster:h.actor,inst:h.skill,d:{type:'ground',radius:40,castRange:100},aim:{x:0,y:0},tags:new Set(),extra:[],aoeScale:1,arcScale:1,useMult:2,cosmeticColor:'red',gPow:1,ventRounds:0});
  h.step(.1);assert.equal(h.events.filter(e=>e[0]==='hit').length,1);h.step(2);assert.equal(h.events.filter(e=>e[0]==='hit').length,2);assert.equal(h.state.zones.length,0);
});
test('domain exposure accrues after membership and takes effect on the next frame; leaving strips immediately',()=>{
  const h=setup(),z=h.field({domain:{enemyMods:[{stat:'damage',kind:'flat',value:3}]},domainKey:'field:1',exposure:{after:.2,dwell:new Map()},exposureDomain:true});h.state.zones.push(z);
  h.step(.2);assert(!h.enemy.sources.has('field:1'));h.step(.01);assert(h.enemy.sources.has('field:1'));h.enemy.pos.x=100;h.step(.01);assert(!h.enemy.sources.has('field:1'));assert(!z.exposure.dwell.has(h.enemy.id));
});

test('a shared domain group grants one source and hands off after its first field expires',()=>{
  const h=setup(),domain={stackGroup:'banner',enemyMods:[{stat:'damage',kind:'flat',value:3}]};
  const first=h.field({domain,domainKey:'first',linger:.15}),second=h.field({domain,domainKey:'second'});
  h.state.zones.push(first,second);h.step(.1);
  assert.deepEqual([...h.enemy.sources.keys()],['first']);
  h.step(.1);h.step(.01);assert.deepEqual([...h.enemy.sources.keys()],['second']);
  h.enemy.tier=1;h.step(.01);assert.equal(h.enemy.sources.size,0);
});
test('overlapping madden placements credit a body only once per shared frame and never across layers',()=>{
  const h=setup(),bank={after:.3,dwell:new Map(),credited:new Map()};h.state.zones.push(h.field({madden:bank}),h.field({madden:bank}));h.step(.2);assert.equal(bank.dwell.get(2),.2);
  h.enemy.tier=1;h.step(.2);assert.equal(bank.dwell.get(2),.2);h.enemy.tier=0;h.step(.1);assert.deepEqual(h.events.filter(e=>e[0]==='status'),[['status',2,'maddened']]);assert.equal(bank.dwell.get(2),0);
});
test('repeated retirement refunds reservation once, removes domain sources and prunes dead madden occupants',()=>{
  const h=setup(),z=h.field({reserved:10,domainKey:'field:1',domainAffected:new Set([h.enemy]),madden:{after:1,dwell:new Map([[2,.5],[99,.5]]),credited:new Map([[2,1],[99,1]])}});
  h.enemy.dead=true;h.runtime.expireZone(z);h.runtime.expireZone(z);assert.equal(h.actor.reservedMana,10);assert.equal(z.reserved,0);assert.equal(z.domainAffected.size,0);assert.equal(z.madden.dwell.size,0);assert.equal(z.madden.credited.size,0);assert.equal(h.events.filter(e=>e[0]==='strip').length,1);
});
test('anchor death retires before a field can damage or emit again',()=>{const h=setup();h.state.zones.push(h.field({anchor:{dead:true},reserved:5,emit:{skillId:'field',interval:0}}));h.ports.executeSkill=()=>assert.fail('dead anchor must not emit');h.step(.1);assert.equal(h.state.zones.length,0);assert.equal(h.actor.reservedMana,15);assert.equal(h.events.filter(e=>e[0]==='hit').length,0);});
test('emitter reuses its payload, retains time debt and restores facing after successful cast',()=>{const h=setup(),z=h.field({emit:{skillId:'field',interval:.1,bearing:'random'},emitStep:2});h.state.zones.push(z);let minted=0,casts=0;const payload={...h.skill};h.ports.makeSkill=()=>{minted++;return payload;};h.ports.executeSkill=(a,i)=>{casts++;assert.equal(a.facing,Math.PI);assert.equal(i,payload);};h.step(.5);assert.equal(casts,1);assert.equal(h.actor.facing,0);h.step(.01);assert.equal(casts,2);assert.equal(minted,1);assert.equal(z.emitInterval,.4);});
test('field story stamps once; a caster changing layers does not move the field to that layer',()=>{const h=setup();const z=h.field();h.state.zones.push(z);h.step(.1);h.actor.tier=1;h.step(.2);assert.equal(z.tier,0);assert.equal(h.events.filter(e=>e[0]==='hit').length,2);});
test('healing fields honor team and layer and do not enter the damage lane',()=>{const h=setup();h.state.zones.push(h.field({healTick:5}));h.step(.1);assert.deepEqual(h.events.filter(e=>e[0]==='heal'),[['heal',1,5]]);assert.equal(h.events.filter(e=>e[0]==='hit').length,0);});
test('capsule occlusion rays start from the nearest spine point and cache the original occlusion policy',()=>{const h=setup(),z=h.field({seg:{ax:0,ay:0,bx:100,by:0}});h.ports.skillOcclusion=()=> 'blocked';let from;h.ports.lineOfFire=(p)=>{from=p;return false;};assert.equal(h.runtime.zoneSees(z,{x:60,y:30}),false);assert.deepEqual(from,{x:60,y:0});h.ports.skillOcclusion=()=>assert.fail('phase is already resolved');assert.equal(h.runtime.zoneSees(z,{x:200,y:30}),false);assert.deepEqual(from,{x:100,y:0});});
