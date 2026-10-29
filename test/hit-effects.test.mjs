import {test as nodeTest} from 'node:test';
import assert from 'node:assert/strict';
const {createHitEffects}=await import(process.env.HWE_HIT_EFFECTS_MODULE || '../dist/hit-effects.js');
// Actor/frame identity assertions contain functions. Keep their original message
// while making assertion failures serializable by both supported Node reporters.
const test=(name,body)=>nodeTest(name,()=>{try{body();}catch(error){
  if(error instanceof assert.AssertionError)throw new assert.AssertionError({message:error.message,operator:error.operator});
  throw error;
}});

function rig(effects=[]) {
  const events=[],queries=[];
  const actor=(id,team='hero',x=0)=>({id,team,dead:false,radius:2,pos:{x,y:0,z:0},statuses:[],ward:0,
    sheet:{get(name,tags,extra){queries.push([id,name,tags,extra]);return name==='aoeRadius'?2:0;},removeSource(id){events.push(['remove',id]);}},
    gainWard(amount){this.ward+=amount;events.push(['ward',id,amount]);},applyStatus(...args){events.push(['apply',id,...args]);}});
  const caster=actor(1),target=actor(2,'hero',50),def={id:'captured',name:'Captured',color:'#abc',tags:['cold']};
  const inst={def:{id:'replacement'},effects},tags=new Set(['spell']),extra=[{name:'scoped'}];
  const frame={caster,target,inst,def,tags,extra,durScale:3,dealt:12,depth:0};
  const record=name=>(...args)=>{events.push([name,...args]);};
  const ports={effects:i=>i.effects,heal:record('heal'),cleanse:record('cleanse'),buff:record('buff'),rupture:record('rupture'),status:record('status'),
    direction:(from,to)=>({dx:to.x-from.x,dy:to.y-from.y,dz:to.z-from.z}),randomDirection:()=>({dx:0,dy:0,dz:1}),
    distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),push:record('push'),grab:record('grab'),possess:record('possess'),
    dormant:()=>false,absorbAmount:(_c,_i,base)=>base*2,absorb:record('absorb'),restore:record('restore'),orb:record('orb'),
    copyPosition:at=>({...at}),birth:record('birth'),enemies:()=>[],sameStory:(a,b)=>(a.tier??0)===(b.tier??0),
    transplant:record('transplant'),flash:record('flash'),fail:record('fail')};
  const service=createHitEffects(ports);
  return {actor,caster,target,frame,ports,service,events,queries,run:(delivery)=>service.dispatch(frame,1.5,delivery)};
}
const of=(r,name)=>r.events.filter(e=>e[0]===name);

test('dispatch forwards borrowed effects, captured definition, scaling and exact order',()=>{
  const effects=[{type:'heal',amount:9},{type:'cleanse'},{type:'buff',id:'bond',bond:true},{type:'rupture',status:'bank',fraction:.4},
    {type:'status',status:'burn'},{type:'grabSeize',grab:{verb:'carry'}},{type:'possess',spec:{duration:2}},{type:'absorb',amount:7,duration:2},{type:'restore',amount:11}];
  const r=rig(effects);r.run();
  assert.deepEqual(r.events.map(e=>e[0]),['heal','cleanse','buff','rupture','status','grab','possess','absorb','restore']);
  assert.deepEqual(of(r,'heal')[0],['heal',r.caster,r.frame.inst,r.target,effects[0],1.5]);
  assert.equal(of(r,'heal')[0][4],effects[0]);assert.equal(of(r,'cleanse')[0][2],2);
  assert.equal(of(r,'buff')[0][4],effects[2]);assert.equal(of(r,'buff')[0][5],3);
  assert.deepEqual(r.caster.bond,{targetId:2,buffId:'bond'});
  assert.deepEqual(of(r,'rupture')[0].slice(3),['bank',.4,1,r.frame.tags,r.frame.extra]);
  assert.equal(of(r,'status')[0][1],r.frame);assert.equal(of(r,'status')[0][2],effects[4]);
  assert.equal(of(r,'grab')[0][4],effects[5]);assert.equal(of(r,'possess')[0][4],effects[6]);
  for(const name of ['grab','possess']){assert.equal(of(r,name)[0][1],r.caster);assert.equal(of(r,name)[0][2],r.frame.inst);assert.equal(of(r,name)[0][3],r.target);}
  assert.deepEqual(of(r,'absorb')[0].slice(2),[14,6]);
  assert.equal(of(r,'restore')[0][2],effects[8]);assert.equal(of(r,'restore')[0][3].tags,r.frame.def.tags);
});
test('heals, cleanses and buffs observe recipient gates and explicit zero counts',()=>{
  const r=rig([{type:'heal',excludeCaster:true},{type:'cleanse',count:0},{type:'buff',id:'b'}]);
  r.target.team='enemy';r.run();assert.deepEqual(r.events,[]);
  r.frame.target=r.caster;r.run();assert.deepEqual(r.events,[['cleanse',r.caster,0]]);
  r.frame.inst.effects[0].excludeCaster=false;r.run();assert.equal(of(r,'heal').length,1);assert.equal(of(r,'buff').length,0);
});
test('rupture preserves explicit multiplier and zero',()=>{
  const r=rig([{type:'rupture',status:'b',fraction:.2,mul:0},{type:'rupture',status:'b',fraction:.5,mul:1.7}]);r.run();
  assert.deepEqual(of(r,'rupture').map(e=>e[5]),[0,1.7]);
});
test('buff failure retains grant side effects without writing a bond',()=>{
  const r=rig([{type:'buff',id:'b',bond:true}]);r.ports.buff=()=>{r.target.granted=true;throw Error('grant failed');};
  assert.throws(()=>r.run(),/grant failed/);assert.equal(r.target.granted,true);assert.equal(r.caster.bond,undefined);
});
test('actor team and effect fields stay live between callbacks',()=>{
  const heal={type:'heal',excludeCaster:false},r=rig([{type:'restore'},heal]);r.target.team='enemy';
  r.ports.restore=()=>{r.target.team='hero';heal.amount=73;};r.run();assert.equal(of(r,'heal')[0][4],heal);assert.equal(heal.amount,73);
});
test('unmerged effect list remains live while merged delivery snapshots membership',()=>{
  for(const merged of [false,true]){const r=rig([{type:'restore'}]);r.ports.restore=()=>{r.frame.inst.effects.push({type:'ward',amount:7});};
    r.run(merged?[{type:'ward',amount:3}]:undefined);assert.equal(r.target.ward,merged?3:7);}
  const r=rig([{type:'restore'}]);r.ports.restore=()=>r.frame.inst.effects.push({type:'ward',amount:5});r.run([]);assert.equal(r.target.ward,5);
});
test('merged list still borrows payload records and retains authored-before-delivery order',()=>{
  const fx={type:'ward',amount:3},r=rig([{type:'restore'},{type:'ward',amount:2}]);
  r.ports.restore=()=>{fx.amount=11;};r.run([fx]);assert.deepEqual(of(r,'ward').map(e=>e[2]),[2,11]);
});
test('nested dispatch keeps separate recipients, scalars and pending lists',()=>{
  const r=rig([{type:'restore'},{type:'ward',amount:7}]),inner=r.actor(3);let entered=false;
  r.ports.restore=()=>{if(!entered){entered=true;r.service.dispatch({...r.frame,target:inner,inst:{effects:[{type:'ward',amount:13}]}},9);}};
  r.run();assert.equal(inner.ward,13);assert.equal(r.target.ward,7);assert.deepEqual(of(r,'ward').map(e=>e[1]),[3,2]);
});
test('knockback uses opaque 3D directions and avoids unnecessary stat/random reads',()=>{
  const r=rig([{type:'knockback',strength:9,mode:'buffet'}]);let draws=0;
  const direction={dx:0,dy:1,dz:2};r.ports.randomDirection=()=>{draws++;return direction;};r.run();
  assert.equal(draws,1);assert.equal(r.queries.length,0);assert.equal(of(r,'push')[0][2],direction);
  r.frame.inst.effects=[{type:'knockback',strength:8}];r.target.pos.z=30;r.run();
  assert.deepEqual(of(r,'push')[1][2],{dx:50,dy:0,dz:30});assert.equal(draws,1);assert.equal(r.queries[0][1],'knockBuffet');
  r.caster.sheet.get=()=>1;r.run();assert.equal(draws,2);
});
test('pull uses body-edge gap, reverse direction and captured stun duration/name',()=>{
  const r=rig([{type:'pull',stun:.5}]);r.run();assert.equal(of(r,'push')[0][3],34);
  assert.deepEqual(of(r,'push')[0][2],{dx:-50,dy:0,dz:0});assert.deepEqual(of(r,'apply')[0],['apply',2,'stun',0,1.5,'Captured']);
  r.events.length=0;r.target.pos.x=1;r.run();assert.equal(of(r,'push').length,0);assert.equal(of(r,'apply').length,1);
});
test('pull refuses planted, leaping and dormant actors with short-circuit observations',()=>{
  for(const field of ['construct','anchored','leap']){const r=rig([{type:'pull',stun:1}]);r.target[field]=true;r.ports.dormant=()=>{throw Error('eager dormant');};r.run();assert.deepEqual(r.events,[]);}
  const r=rig([{type:'pull',stun:1}]);r.ports.dormant=()=>true;r.run();assert.deepEqual(r.events,[]);
});
test('absorb duration is read after power callback and uses the captured scale',()=>{
  const fx={type:'absorb',amount:4,duration:2},r=rig([fx]);r.ports.absorbAmount=()=>{fx.duration=5;return 17;};r.run();
  assert.deepEqual(of(r,'absorb')[0],['absorb',r.target,17,15]);
});
test('ward keeps separate per-hit and allied recipient gates',()=>{
  const r=rig([{type:'ward',amount:5,onHit:true},{type:'ward',amount:7}]);r.run();assert.equal(r.caster.ward,5);assert.equal(r.target.ward,7);
  r.caster.dead=true;r.target.team='enemy';r.run();assert.equal(r.caster.ward,5);assert.equal(r.target.ward,7);
  r.caster.dead=false;r.frame.dealt=0;r.run();assert.equal(r.caster.ward,5);
});
test('siphon preserves owner, borrowed position, tier and its distinct death gate',()=>{
  const r=rig([{type:'siphonOrb',resource:'mana',amount:8}]),owner=r.actor(3);r.caster.owner=owner;r.caster.dead=true;r.target.tier=2;r.run();
  const orb=of(r,'orb')[0];assert(orb,'Expected the dead caster to emit its siphon orb');assert.equal(orb[2],r.target.pos);assert.deepEqual(orb[3],{scatter:8,amount:8,life:8,homeTo:owner,clamp:false,flowFromTier:2});
  r.caster.owner=undefined;r.target.tier=undefined;r.run();assert.equal(of(r,'orb')[1][3].homeTo,r.caster);assert.equal(of(r,'orb')[1][3].flowFromTier,0);
  for(const change of [{depth:1},{dealt:0}]){Object.assign(r.frame,{depth:0,dealt:12},change);r.run();}assert.equal(of(r,'orb').length,2);
  r.frame.depth=0;r.frame.dealt=12;r.caster.construct={};r.run();assert.equal(of(r,'orb').length,2);
});
test('birth requires authored onHit and live top-level damage, and copies the position',()=>{
  const fx={type:'birth',onHit:true,monsterId:'child'},r=rig([fx]);r.target.pos.z=23;r.run();
  const birth=of(r,'birth')[0];assert.equal(birth[3],fx);assert.notEqual(birth[4],r.target.pos);assert.deepEqual(birth[4],r.target.pos);assert.deepEqual(birth[5],{host:true});
  for(const change of [{dead:true},{dead:false}]){Object.assign(r.caster,change);if(!change.dead)fx.onHit=false;r.run();}assert.equal(of(r,'birth').length,1);
  fx.onHit=true;r.frame.depth=1;r.run();r.frame.depth=0;r.frame.dealt=0;r.run();assert.equal(of(r,'birth').length,1);
});
test('spread scales body-edge reach, filters stories and observes candidates after the cap',()=>{
  const fx={type:'spreadStatus',radius:10,maxTargets:1,statuses:['burn']},r=rig([fx]);
  const burn={id:'burn',power:4};r.target.statuses=[{id:'cold'},burn];const cross=r.actor(3,'enemy',52),edge=r.actor(4,'enemy',72),far=r.actor(5,'enemy',73);cross.tier=1;
  r.ports.enemies=()=>[r.target,cross,far,edge,r.actor(6,'enemy',51)];const visits=[];r.ports.sameStory=(a,b)=>{visits.push(a.id);return (a.tier??0)===(b.tier??0);};r.run();
  assert.equal(of(r,'transplant').length,1);assert.deepEqual(of(r,'transplant')[0],['transplant',edge,burn,'Captured',fx]);
  assert.deepEqual(visits,[2,3,5,4,6]);assert.equal(of(r,'flash')[0][2],20);assert.notEqual(of(r,'flash')[0][1],r.target.pos);
});
test('spread preserves default eight, explicit zero and dead-with-status semantics',()=>{
  for(const limit of [undefined,0,9]){const r=rig([{type:'spreadStatus',radius:100,maxTargets:limit}]);r.target.statuses=[{id:'s'}];r.target.dead=true;
    r.ports.enemies=()=>Array.from({length:10},(_,i)=>r.actor(10+i,'enemy',50+i));r.run();assert.equal(of(r,'transplant').length,limit??8);assert.equal(of(r,'flash').length,limit===0?0:1);}
  const r=rig([{type:'spreadStatus',radius:10}]);r.target.dead=true;r.ports.enemies=()=>{throw Error('empty dead target');};r.run();assert.deepEqual(r.events,[]);
});
test('spread snapshots membership but keeps donor records live across recipients',()=>{
  const r=rig([{type:'spreadStatus',radius:100}]),s={id:'s',power:1};r.target.statuses=[s];r.ports.enemies=()=>[r.actor(3),r.actor(4)];
  const seen=[];r.ports.transplant=(a,status)=>{seen.push([a.id,status.power]);s.power=7;r.target.statuses.push({id:'late'});};r.run();assert.deepEqual(seen,[[3,1],[4,7]]);
});
test('transfusion snapshots recipients and live donor identities, then cleans up in order',()=>{
  const fx={type:'transfuseStatus',splash:10,statuses:['a','b']},r=rig([fx]);const a={id:'a',power:1},b={id:'b',power:2},keep={id:'keep'};r.caster.statuses=[a,b,keep];
  const edge=r.actor(3,'enemy',72),cross=r.actor(4,'enemy',55);cross.tier=2;r.ports.enemies=()=>[r.target,edge,cross];
  const seen=[];r.ports.transplant=(target,s)=>{seen.push([target.id,s.id,s.power]);if(seen.length===1){b.power=11;edge.pos.x=999;}};r.run();
  assert.deepEqual(seen,[[2,'a',1],[2,'b',11],[3,'a',1],[3,'b',11]]);assert.deepEqual(r.caster.statuses,[keep]);
  assert.deepEqual(r.events.slice(0,2),[['remove','status:a'],['remove','status:b']]);assert.equal(of(r,'flash')[0][2],10);
});
test('transfusion failure preserves donors and completed recipient writes',()=>{
  const r=rig([{type:'transfuseStatus',splash:100}]),a={id:'a'},b={id:'b'};r.caster.statuses=[a,b];let count=0;
  r.ports.transplant=(target,s)=>{target.statuses.push(s);if(++count===2)throw Error('transfer failed');};
  assert.throws(()=>r.run(),/transfer failed/);assert.deepEqual(r.target.statuses,[a,b]);assert.deepEqual(r.caster.statuses,[a,b]);assert.deepEqual(r.events,[]);
});
test('transfusion removes donors by identity and retains partial cleanup failures',()=>{
  const r=rig([{type:'transfuseStatus'}]),a={id:'a'},b={id:'b'};r.caster.statuses=[a,b];
  r.caster.sheet.removeSource=()=>{throw Error('cleanup failed');};assert.throws(()=>r.run(),/cleanup failed/);assert.deepEqual(r.caster.statuses,[b]);assert.equal(of(r,'flash').length,0);
});
test('empty transfusion refuses; zero splash and ignored effects keep original meaning',()=>{
  const r=rig([{type:'transfuseStatus',statuses:['absent']},{type:'recallMinions'}]);r.caster.statuses=[{id:'a'}];r.run();
  assert.deepEqual(r.events,[['fail',r.caster,'captured:clean','nothing to pour']]);
  r.events.length=0;r.frame.inst.effects=[{type:'transfuseStatus',splash:0}];r.ports.enemies=()=>{throw Error('zero splash queried');};r.run();assert.equal(of(r,'transplant').length,1);assert.equal(of(r,'flash')[0][2],0);
});
