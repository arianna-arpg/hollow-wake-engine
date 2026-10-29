import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {createHitStatuses}=await import(process.env.HWE_HIT_STATUS_MODULE?pathToFileURL(process.env.HWE_HIT_STATUS_MODULE).href:'../dist/hit-status.js');

function rig(){
  const events=[],draws=[],random=[];
  const defs={burn:{duration:4,color:'orange',dotType:'fire',element:'fire',baseline:{dps:10,perLevel:2},hitMagnitude:.25},poison:{duration:6,color:'green',dotType:'chaos',baseline:{dps:8,perLevel:1},hitMagnitude:.2,stacking:true},chill:{duration:4,color:'blue',element:'cold',stacking:true},doom:{duration:5,color:'purple',cullsAtLethal:true,baseline:{dps:10,perLevel:2}},impaled:{duration:5,color:'grey',dischargeOnHit:true,dischargeMatchingType:true}};
  const make=id=>{
    const a={id,name:'actor-'+id,life:500,dead:false,invulnerable:false,hitFlash:0,statuses:[],skills:[],buffs:new Map(),wet:false,
      values:{effectDuration:2,statusMagnitude:2,aoeRadius:1.5,critChance:.5,critMulti:3},armed:{},
      sheet:{get(key,tags,extra){events.push(['get',id,key,tags,extra]);return a.values[key]??0;},armedFamily(prefix,ids,extra){events.push(['armed',id,prefix,[...ids],extra]);return a.armed[prefix]??[];},removeSource(key){events.push(['remove',id,key]);}},
      applyStatus(...args){events.push(['apply',id,...args]);a.statuses.push({id:args[0],dps:args[1],remaining:args[2],sourceName:args[3],stacks:1,...args[4]});},
      consumeBuffStacks(key,count){events.push(['consume',id,key,count]);const b=a.buffs.get(key);if(b){b.stacks-=count;if(b.stacks<=0)a.buffs.delete(key);}},
      isWet(){events.push(['wet',id]);return a.wet;}};
    return a;
  };
  const caster=make(1),target=make(2),other=make(3),def={id:'hit',name:'Hit',color:'red',tags:['spell','fire'],effects:[]},inst={def},extra=[{value:2}],packet={amounts:{physical:80,fire:20},tags:new Set(['spell','contact'])},ids=['burn','poison','chill','doom'];
  const ports={definition:id=>defs[id],statusIds:()=>ids,random:()=>{const v=random.shift()??.25;draws.push(v);events.push(['random',v]);return v;},zoneLevel:()=>3,tuning:()=>undefined,
    skillContextTags:(d,tags=[])=>new Set([...d.tags,...tags]),instanceBrood:()=>undefined,
    mitigateTyped:(a,amounts,o)=>{events.push(['mitigate',a.id,{...amounts},o]);return Object.values(amounts).reduce((s,n)=>s+n,0);},
    landLifeDamage:(a,n)=>{events.push(['land',a.id,n]);a.life-=n;},kill:(a,silent,c)=>{events.push(['kill',a.id,silent,c.id]);a.dead=true;},
    rollStatusProcs:(...args)=>events.push(['procs',args[0].id,args[2].id,args[3],args[6]]),bankPools:(a,source,n)=>events.push(['pool',a.id,source,n]),
    procDefinition:id=>({id}),executeProc:(proc,c,i,t,depth)=>events.push(['execute',proc.id,c.id,t.id,depth]),riderCue:(a,b,id)=>events.push(['riderCue',a.id,b,id]),
    text:(...args)=>events.push(['text',args[0].id,...args.slice(1)]),statusCue:(kind,t,c,color)=>events.push(['cue',kind,t.id,c.id,color])};
  const service=createHitStatuses(ports);
  return {events,draws,random,defs,ids,caster,target,other,def,inst,packet,extra,ports,service,
    frame:(dealt=100,depth=0,carry=0)=>service.prepare(caster,inst,target,def,extra,packet,dealt,depth,carry)};
}
const of=(r,kind)=>r.events.filter(e=>e[0]===kind);
const status=(id,fields={})=>({id,remaining:5,stacks:1,dps:0,sourceName:'old',...fields});

test('preparation captures ordered prices and links only the first status of other curses',()=>{
  const r=rig();r.def.linkedHexes={dmgPerHex:.25,durPerHex:.2};r.caster.skills=[r.inst,null,{def:{id:'a',name:'A',tags:['curse'],effects:[{type:'damage'},{type:'status',status:'burn'},{type:'status',status:'poison'}]}},{def:{id:'b',name:'B',tags:['curse'],effects:[{type:'status',status:'chill'}]}}];
  const f=r.frame();assert.deepEqual(of(r,'get').slice(0,2).map(e=>e[2]),['effectDuration','statusChance']);assert.equal(f.hexDmg,1.5);assert.equal(f.hexDur,1.4);
  assert.deepEqual(of(r,'apply').map(e=>e.slice(2)),[['burn',14,2,'A'],['chill',0,2,'B']]);assert.equal(r.draws.length,0);assert.equal(of(r,'text')[0][3],'2 hexes!');
});
test('linked-curse callbacks precede multiplier reads; zero damage suppresses linking',()=>{
  const r=rig();r.def.linkedHexes={dmgPerHex:.25,durPerHex:.2};r.caster.skills=[{def:{id:'a',name:'A',tags:['curse'],effects:[{type:'status',status:'burn'}]}}];
  r.ports.text=()=>{r.def.linkedHexes.dmgPerHex=2;};assert.equal(r.frame().hexDmg,3);r.events.length=0;assert.equal(r.frame(0).hexDmg,1);assert.equal(of(r,'apply').length,0);
});
test('authored carry, fixed duration, bomb conversion and critical scale retain distinct arithmetic',()=>{
  const r=rig();Object.assign(r.caster.values,{igniteToBomb:.5,dotCrit:1,dotPropagates:.8,dotLeech_burn:.1,popPower_burn:.2});
  r.service.applyAuthored(r.frame(100,2,20),{type:'status',status:'burn',chance:1,magnitude:.25,durationOverride:1.5});
  const a=of(r,'apply')[0];assert.equal(a[3],45);assert.equal(a[4],.375);assert.equal(a[6].rupture,67.5);assert.equal(a[6].ruptureRadius,135);assert.equal(a[6].propagates,true);assert.equal(a[6].leech,.1);assert.equal(a[6].popBonus,.2);assert.equal(a[6].power,undefined);
  assert.deepEqual(of(r,'pool'),[['pool',1,{status:'burn'},67.5]]);assert.deepEqual(of(r,'procs'),[['procs',1,2,'burn',2]]);assert.equal(r.draws.length,3);assert.equal(of(r,'cue')[0][1],'affliction');
});
test('stat-granted bomb banking uses pre-conversion DPS and never borrows the authored critical lane',()=>{
  const r=rig();r.caster.armed.apply_=['burn'];Object.assign(r.caster.values,{apply_burn:1,igniteToBomb:.5,dotCrit:1});r.service.applyGranted(r.frame());
  const a=of(r,'apply')[0];assert.equal(a[3],12.5);assert.equal(a[6].rupture,100);assert.deepEqual(of(r,'pool'),[['pool',1,{status:'burn'},200]]);assert(!of(r,'get').some(e=>e[2]==='dotCrit'));assert.equal(r.draws.length,2);
});
test('Doom differs between authored duration-scaled payloads and stat-granted banks',()=>{
  const a=rig();a.caster.values.doomDot=.1;a.service.applyAuthored(a.frame(),{type:'status',status:'doom',chance:1,magnitude:.4});assert.equal(of(a,'apply')[0][6].rupture,400);assert.equal(of(a,'apply')[0][3],40);assert.equal(of(a,'pool')[0][3],400);
  const b=rig();Object.assign(b.caster.values,{doomDot:.1,apply_doom:1});b.caster.armed.apply_=['doom'];b.service.applyGranted(b.frame());assert.equal(of(b,'apply')[0][6].rupture,80);assert.equal(of(b,'apply')[0][3],8);assert.equal(of(b,'pool').length,0);
});
test('authored curses carry power and Hedonism; stat grants omit power and victim resistance',()=>{
  const a=rig();a.def.tags=['curse','cold'];Object.assign(a.caster.values,{curseRupture:.5,hedonism:1,ailmentStacks:2.6});a.service.applyAuthored(a.frame(),{type:'status',status:'chill',chance:1});const x=of(a,'apply')[0];assert.equal(x[6].power,2);assert.equal(x[6].stacksBonus,3);assert.equal(x[6].rupture,50);assert.equal(x[6].ruptureType,'cold');assert.equal(of(a,'apply')[1][2],'hedonism');
  const b=rig();b.target.values.ailmentResist=1;b.caster.values.apply_chill=1;b.caster.armed.apply_=['chill'];b.service.applyGranted(b.frame());assert.equal(Object.hasOwn(of(b,'apply')[0][6],'power'),false);assert(!of(b,'get').some(e=>e[2]==='ailmentResist'));
});
test('taunt from a summon shell credits the owner while ordinary authored effects credit the caster',()=>{
  const r=rig();r.caster.summonShell={};r.caster.owner={id:19};r.defs.taunted={duration:2};r.service.applyAuthored(r.frame(),{type:'status',status:'taunted',chance:1});assert.equal(of(r,'apply')[0][6].casterId,19);
});
test('resistance refuses before authored chance and reads its element-tagged context',()=>{
  const r=rig();r.target.values.ailmentResist=1;r.service.applyAuthored(r.frame(),{type:'status',status:'burn',chance:1,magnitude:.5});assert.equal(r.draws.length,1);assert.equal(of(r,'apply').length,0);assert.equal(of(r,'cue')[0][1],'resist');assert.deepEqual([...of(r,'get').find(e=>e[2]==='ailmentResist')[3]],['fire']);
});
test('incidental tuning and zero chance still consume the original random draw',()=>{
  const r=rig();r.ports.tuning=()=>({identityThreshold:.7,incidentalScale:0});r.service.applyAuthored(r.frame(),{type:'status',status:'burn',chance:.35,magnitude:.3});assert.equal(r.draws.length,1);assert.equal(of(r,'apply').length,0);
  r.caster.values.statusChance=.3;r.service.applyAuthored(r.frame(),{type:'status',status:'burn',chance:.35,magnitude:.3});assert.equal(of(r,'apply').length,1);assert.equal(r.draws.length,3);
});
test('low duration uses the half-second divisor floor and live elemental potency',()=>{
  const r=rig();r.caster.values.effectDuration=.1;r.caster.values.statusMagnitude=3;const f=r.frame(1);r.service.applyAuthored(f,{type:'status',status:'burn',chance:1,magnitude:.2});assert.equal(of(r,'apply')[0][3],84);assert.equal(of(r,'apply')[0][4],.1);
  const query=of(r,'get').find(e=>e[2]==='statusMagnitude');assert.deepEqual([...query[3]],['spell','fire']);assert.equal(query[4]===r.extra,true);
});
test('baseline lookup follows the live level callback, while frame scalar captures remain fixed',()=>{
  const r=rig(),f=r.frame();r.caster.values.effectDuration=5;r.ports.zoneLevel=()=>{r.defs.burn.baseline.dps=50;return 1;};r.service.applyAuthored(f,{type:'status',status:'burn',chance:1,magnitude:.01});assert.equal(of(r,'apply')[0][3],50);assert.equal(of(r,'apply')[0][4],2);
});
test('wet grants merge once in vocabulary order and dry targets never query the wet family',()=>{
  const r=rig();r.target.wet=true;r.caster.armed.apply_=['poison','burn'];r.caster.armed.applyWet_=['burn','chill'];Object.assign(r.caster.values,{apply_burn:.5,applyWet_burn:.5,apply_poison:1,applyWet_chill:1});r.service.applyGranted(r.frame());assert.deepEqual(of(r,'apply').map(e=>e[2]),['burn','poison','chill']);assert.deepEqual(of(r,'armed').map(e=>e[2]),['applyWet_','apply_']);
  const d=rig();d.service.applyGranted(d.frame());assert.deepEqual(of(d,'armed').map(e=>e[2]),['apply_']);assert.equal(d.draws.length,0);d.events.length=0;d.service.applyGranted(d.frame(0));assert.equal(of(d,'wet').length,0);
});
test('live grant vocabulary refresh and nonpositive per-status chance preserve admission ordering',()=>{
  const r=rig();const f=r.frame();r.ids.push('late');r.defs.late={duration:3};r.caster.armed.apply_=['burn','late'];Object.assign(r.caster.values,{apply_burn:0,apply_late:1,statusChance:1});r.service.applyGranted(f);assert.deepEqual(of(r,'apply').map(e=>e[2]),['late']);assert.equal(r.draws.length,2);assert(of(r,'armed')[0][3].includes('late'));
});
test('riders use baseline damage, packet tags, copied added damage and fixed proc depth before consumption',()=>{
  const r=rig(),added={cold:15};const b={stacks:2,def:{nextHit:{status:'poison',addedDamage:added,procId:'p',tags:['spell']}}};r.caster.buffs.set('loaded',b);r.service.applyRiders(r.frame());assert.equal(of(r,'apply')[0][3],30);assert.equal(r.target.life,485);assert.equal(b.stacks,1);assert.deepEqual(of(r,'execute'),[['execute','p',1,2,1]]);assert.equal(of(r,'mitigate')[0][3].tags===r.packet.tags,true);assert.equal(of(r,'mitigate')[0][3].attacker===r.caster,true);assert.deepEqual(added,{cold:15});assert.deepEqual(r.events.slice(-2).map(e=>e[0]),['consume','riderCue']);
});
test('rider gates require every tag and top-level landed damage',()=>{
  for(const [dealt,depth,tags]of [[0,0,undefined],[10,1,undefined],[10,0,['spell','attack']]]){const r=rig();r.caster.buffs.set('b',{stacks:1,def:{nextHit:{status:'burn',tags}}});r.service.applyRiders(r.frame(dealt,depth));assert.equal(of(r,'apply').length,0);assert.equal(of(r,'consume').length,0);}
});
test('rider entry snapshots survive removal, but consumption and cue use live buff records',()=>{
  const r=rig(),a={stacks:1,def:{nextHit:{status:'burn'}}},b={stacks:1,def:{nextHit:{status:'chill'}}};r.caster.buffs.set('a',a);r.caster.buffs.set('b',b);const apply=r.target.applyStatus;r.target.applyStatus=(...args)=>{apply(...args);r.caster.buffs.delete('b');b.def={nextHit:{status:'poison'}};};r.service.applyRiders(r.frame());assert.deepEqual(of(r,'apply').map(e=>e[2]),['burn','poison']);assert.deepEqual(of(r,'consume').map(e=>e[2]),['a','b']);assert.equal(of(r,'riderCue')[1][2]===b.def,true);
});
test('rider failure retains damage and application, without spending the stack or publishing release',()=>{
  const r=rig(),b={stacks:1,def:{nextHit:{status:'burn',addedDamage:{fire:20},procId:'p'}}};r.caster.buffs.set('b',b);r.ports.executeProc=()=>{throw Error('proc failure');};assert.throws(()=>r.service.applyRiders(r.frame()),/proc failure/);assert.equal(r.target.life,480);assert.equal(of(r,'apply').length,1);assert.equal(b.stacks,1);assert.equal(of(r,'riderCue').length,0);
});
test('application failure retains earlier application and draws but suppresses proc and pool completion',()=>{
  const r=rig(),apply=r.target.applyStatus;r.target.applyStatus=(...args)=>{apply(...args);throw Error('apply failure');};assert.throws(()=>r.service.applyAuthored(r.frame(),{type:'status',status:'burn',chance:1,magnitude:.3}),/apply failure/);assert.equal(r.target.statuses.length,1);assert.equal(r.draws.length,2);assert.equal(of(r,'procs').length,0);assert.equal(of(r,'pool').length,0);
});
test('nested hit preparation cannot overwrite an outer target, duration or captured definition',()=>{
  const r=rig(),outer=r.frame(),apply=r.target.applyStatus;let nested=false;r.target.applyStatus=(...args)=>{apply(...args);if(!nested){nested=true;r.caster.values.effectDuration=3;const def={...r.def,tags:['cold']};const inner=r.service.prepare(r.caster,r.inst,r.other,def,r.extra,r.packet,20,1,0);r.service.applyAuthored(inner,{type:'status',status:'chill',chance:1});}};
  r.service.applyAuthored(outer,{type:'status',status:'burn',chance:1,magnitude:.2});assert.deepEqual(of(r,'apply').map(e=>[e[1],e[2],e[4]]),[[2,'burn',2],[3,'chill',3]]);assert.deepEqual(of(r,'procs').map(e=>[e[2],e[3],e[4]]),[[3,'chill',1],[2,'burn',0]]);assert.equal(of(r,'pool')[0][3],160);
});
test('discharge respects hold and matching rolled type, removes before mitigation and uses life landing',()=>{
  const r=rig();r.target.statuses=[status('impaled',{rupture:30,ruptureType:'cold'}),status('impaled',{rupture:40,holdDischarge:true}),status('impaled',{rupture:50,ruptureType:'fire'})];r.service.dischargeOnHit(r.caster,r.target,r.packet,100,0);assert.equal(r.target.statuses.length,2);assert.equal(r.target.life,450);assert.deepEqual(r.events.slice(0,3).map(e=>e[0]),['remove','mitigate','land']);assert.equal(of(r,'text')[0][2],26);assert.equal(of(r,'text')[0][6],'combat');assert.equal(r.target.hitFlashType,'fire');
});
test('discharge failures keep the removed status and skip landing; repeated discharge continues after a kill',()=>{
  const r=rig();r.target.statuses=[status('impaled',{rupture:30})];r.ports.mitigateTyped=()=>{throw Error('defense');};assert.throws(()=>r.service.dischargeOnHit(r.caster,r.target,r.packet,10,0),/defense/);assert.equal(r.target.statuses.length,0);assert.equal(r.target.life,500);
  const d=rig();d.target.life=10;d.target.statuses=[status('impaled',{rupture:20}),status('impaled',{rupture:20})];d.service.dischargeOnHit(d.caster,d.target,d.packet,10,0);assert.equal(d.target.life,-30);assert.equal(of(d,'kill').length,1);assert.equal(of(d,'land').length,2);
});
test('Impale drive-in uses rolled physical damage and selects the first status without a source key',()=>{
  const r=rig();r.caster.values.impalePower=.25;const held=status('impaled',{sourceKey:'owned',rupture:10}),free=status('impaled',{rupture:5});r.target.statuses=[held,free];r.service.plantImpale(r.caster,r.target,r.def,r.packet,r.extra,1,0);assert.equal(free.rupture,25);assert.equal(held.rupture,10);assert.equal(free.ruptureType,'physical');assert.equal(of(r,'apply')[0][5],'Hit');
  r.events.length=0;r.service.plantImpale(r.caster,r.target,r.def,r.packet,r.extra,1,1);assert.equal(r.events.length,0);
});
