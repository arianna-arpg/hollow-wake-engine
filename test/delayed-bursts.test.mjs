import fs from 'node:fs';import {test} from 'node:test';import assert from 'node:assert/strict';
const {DelayedBursts,compileDelayedBurstEffect}=await import(process.env.HOLLOW_WAKE_DELAYED_MODULE??'../dist/delayed-bursts.js');
const body=(id,team='blue')=>({id,team,pos:{x:710,y:700},radius:10,tier:0,level:5,life:500,dead:false,untargetable:false,invulnerable:false,ward:0,es:0,esBroke:false,hitFlash:0,defensePending:true});
const effect=(base=10,delay=0)=>({type:'delayedBurst',at:'self',delay,radius:100,healAllies:{base,perLevel:0}});
const damage=()=>({...effect(),healAllies:undefined,damage:{type:'fire',base:20,perLevel:0}});
const emit=(w,kind,details={})=>{w.events.push({kind,...details});w.hook?.(kind,details);};
const ports=Object.freeze({
 queue(w){w.reads++;if(w.failQueue)throw new Error('queue-read');return w.queue;},time:w=>w.time,actors:w=>w.actors,
 clearQueue(w){w.queue=[];emit(w,'clear');},
 warning(w,b){emit(w,'warning',{radius:b.fx.radius,at:{...b.at},life:b.fx.delay});},
 flash(w,b){emit(w,'flash',{radius:b.fx.radius,at:{...b.at}});},
 heal(w,a,amount){const old=a.life;a.life=Math.min(1000,a.life+amount);w.current=a;const healed=a.life-old;emit(w,'heal',{id:a.id,amount,healed});return healed;},
 mitigate(w,a,type,amount){let left=amount;if(a.immunity)left=0;else{const ward=Math.min(a.ward,left);a.ward-=ward;left-=ward;const es=Math.min(a.es,left);a.es-=es;left-=es;if(es>0&&a.es===0)a.esBroke=true;}w.current=a;emit(w,'mitigate',{id:a.id,type,amount,left});return left;},
 text(w,at,text,color,size){emit(w,'text',{at:{...at},text,color,size});},
 shieldBreak(w,a,depth){emit(w,'shieldBreak',{id:a.id,depth,flag:a.esBroke});},
 sweepDefenses(w,a,depth){a.defensePending=false;emit(w,'sweep',{id:a.id,depth});},
 kill(w,a){a.dead=true;emit(w,'kill',{id:a.id});},
});
function setup(){const owner=body('owner');owner.pos={x:700,y:700};const a=body('a'),b=body('b'),w={time:10,queue:[],actors:[a,b],events:[],reads:0},runtime=new DelayedBursts(ports);return{w,owner,a,b,runtime,schedule:(fx=effect(),depth=3,target=null)=>runtime.schedule(w,owner,fx,'#abcdef',depth,target)};}

test('all five loaded original delayed definitions compile unchanged to frozen owned copies',()=>{
 const source=JSON.parse(fs.readFileSync(new URL('../baseline/milestone-forty/source-boundaries.json',import.meta.url)));
 assert.equal(source.catalogue.definitions.length,5);
 for(const {effect:input}of source.catalogue.definitions){const out=compileDelayedBurstEffect(input,['physical','fire','cold','lightning','chaos']);assert.deepEqual(out,input);assert.notEqual(out,input);assert(Object.isFrozen(out));for(const key of ['damage','healAllies'])if(input[key]){assert.notEqual(out[key],input[key]);assert(Object.isFrozen(out[key]));}}
});
test('content compiler copies magnitudes, supports custom damage names, signed values and visual-only payloads',()=>{
 const input={...effect(-2,.5),damage:{type:'sonic',base:7,perLevel:-1}},out=compileDelayedBurstEffect(input,['sonic']);input.healAllies.base=999;input.damage.base=999;assert.equal(out.healAllies.base,-2);assert.equal(out.damage.base,7);assert.equal(out.damage.perLevel,-1);assert.throws(()=>{out.damage.base=2;},TypeError);
 assert.deepEqual(compileDelayedBurstEffect({type:'delayedBurst',at:'target',delay:0,radius:0},[]),{type:'delayedBurst',at:'target',delay:0,radius:0});
 const plain=Object.assign(Object.create(null),effect());assert.equal(compileDelayedBurstEffect(plain,[]).radius,100);
});
test('serialized definition validation rejects malformed types, unknown fields and nonfinite values',()=>{
 const valid=effect();const invalid=[null,[],1,{}, {...valid,type:'ward'},{...valid,at:'cursor'},{...valid,delay:-1},{...valid,radius:-1},{...valid,extra:true},{...valid,damage:null},{...valid,healAllies:[]},{...valid,damage:{type:'fire',base:1,perLevel:0}},{...valid,healAllies:{base:1,perLevel:0,hidden:1}},Object.create(valid),{...valid,[Symbol('extra')]:1}];
 for(const key of ['delay','radius'])for(const value of [NaN,Infinity,-Infinity,'1',null,undefined,1n])invalid.push({...valid,[key]:value});
 for(const key of ['base','perLevel'])for(const value of [NaN,Infinity,'1',null,undefined])invalid.push({...valid,healAllies:{base:1,perLevel:0,[key]:value}});
 for(const input of invalid)assert.throws(()=>compileDelayedBurstEffect(input,[]));
 for(const types of [null,{},[''],[null],Array(1)])assert.throws(()=>compileDelayedBurstEffect(valid,types));
 assert.throws(()=>compileDelayedBurstEffect({...valid,damage:{type:'fire',base:1,perLevel:0,extra:1}},['fire']));
});
test('content accessors and hidden fields are rejected without evaluating getters',()=>{
 let reads=0;const input={...effect()};Object.defineProperty(input,'radius',{enumerable:true,get(){reads++;throw new Error('getter called');}});assert.throws(()=>compileDelayedBurstEffect(input,[]),/enumerable data/);assert.equal(reads,0);
 const hidden={...effect()};Object.defineProperty(hidden,'radius',{value:1,enumerable:false});assert.throws(()=>compileDelayedBurstEffect(hidden,[]),/enumerable data/);
});
test('required host ports are checked at construction',()=>{for(const key of Object.keys(ports)){const incomplete={...ports};delete incomplete[key];assert.throws(()=>new DelayedBursts(incomplete),new RegExp(key));}});
test('schedule captures its envelope while retaining borrowed owner and payload identities',()=>{
 const s=setup(),fx=effect(10,2),target=body('target');target.pos={x:740,y:710};fx.at='target';s.schedule(fx,4,target);const b=s.w.queue[0];assert.equal(b.owner,s.owner);assert.equal(b.fx,fx);assert.notEqual(b.at,target.pos);assert.deepEqual(b.at,target.pos);assert.equal(b.when,12);assert.equal(b.depth,5);assert.equal(b.tier,0);assert.equal(b.color,'#abcdef');
 target.pos.x=999;s.owner.tier=2;fx.delay=99;assert.equal(b.at.x,740);assert.equal(b.when,12);assert.equal(b.tier,0);
});
test('a missing target falls back to owner position and dead owners do not cancel loosed bursts',()=>{const s=setup();s.owner.dead=true;s.schedule({...effect(),at:'target'});assert.deepEqual(s.w.queue[0].at,s.owner.pos);s.runtime.advance(s.w);assert.equal(s.a.life,510);assert.equal(s.b.life,510);});
test('reverse insertion order differs from deadlines and skips future entries until equality',()=>{
 const s=setup();s.w.actors=[s.a];s.schedule(effect(11));s.schedule(effect(21,2));s.schedule(effect(31));s.runtime.advance(s.w);assert.deepEqual(s.w.events.filter(e=>e.kind==='heal').map(e=>e.amount),[31,11]);assert.equal(s.w.queue.length,1);s.w.time=12;s.runtime.advance(s.w);assert.equal(s.a.life,563);assert.equal(s.w.queue.length,0);
});
for(const forward of [true,false])test('clock is sampled per entry when a callback moves it '+(forward?'forward':'backward'),()=>{
 const s=setup();s.w.actors=[s.a];s.schedule(effect(11,forward?1:0));s.schedule(effect(31));s.w.hook=kind=>{if(kind==='heal')s.w.time=forward?11:9;};s.runtime.advance(s.w);assert.equal(s.a.life,forward?542:531);assert.equal(s.w.queue.length,forward?0:1);
});
test('new appends wait for the next advance, including a multi-entry drain',()=>{
 const s=setup();s.w.actors=[s.a];s.schedule(effect(11));s.schedule(effect(31));let once=false;s.w.hook=kind=>{if(kind==='heal'&&!once){once=true;s.schedule(effect(41));}};s.runtime.advance(s.w);assert.equal(s.a.life,542);assert.equal(s.w.queue.length,1);s.runtime.advance(s.w);assert.equal(s.a.life,583);assert.equal(s.w.queue.length,0);
});
test('level is sampled once but owner team and payload remain live across targets',()=>{
 const s=setup(),c=body('c','red');s.w.actors.push(c);const fx={...effect(10),healAllies:{base:10,perLevel:2},damage:{type:'fire',base:10,perLevel:2}};s.schedule(fx);s.w.hook=kind=>{if(kind==='heal'){s.owner.level=20;s.owner.team='red';}};s.runtime.advance(s.w);assert.deepEqual(s.w.actors.map(a=>a.life),[518,482,518]);
});
test('live payload changes use captured geometry/tier and current owner level',()=>{const s=setup(),fx=effect();s.w.actors=[s.a];s.schedule(fx);fx.healAllies={base:13,perLevel:2};fx.radius=5;fx.delay=100;s.owner.pos={x:2000,y:2000};s.owner.level=20;s.owner.tier=2;s.runtime.advance(s.w);assert.equal(s.a.life,551);assert.deepEqual(s.w.events.filter(e=>['warning','flash'].includes(e.kind)).map(e=>e.radius),[100,5]);});
for(const mode of ['append','remove','replace'])test('actor iteration preserves native '+mode+' behavior',()=>{
 const s=setup(),c=body('c');if(mode==='remove')s.w.actors.push(c);let once=false;s.w.hook=kind=>{if(kind==='heal'&&!once){once=true;if(mode==='append')s.w.actors.push(c);if(mode==='remove')s.w.actors.splice(1,1);if(mode==='replace')s.w.actors=[c];}};s.schedule();s.runtime.advance(s.w);assert.deepEqual(s.w.events.filter(e=>e.kind==='heal').map(e=>e.id),mode==='append'?['a','b','c']:mode==='remove'?['a','c']:['a','b']);
});
test('dead, untargetable, other-tier and outside targets are excluded, while tangency is included',()=>{
 const s=setup();s.w.actors=[{...body('dead'),dead:true},{...body('hidden'),untargetable:true},{...body('other-tier'),tier:1},{...body('outside'),pos:{x:810.001,y:700}},{...body('tangent'),pos:{x:810,y:700}}];s.schedule();s.runtime.advance(s.w);assert.deepEqual(s.w.events.filter(e=>e.kind==='heal').map(e=>e.id),['tangent']);
});
test('damage ordering retains post-mitigation invulnerability, break flags and native callbacks',()=>{
 const s=setup();s.a.team='red';s.a.ward=5;s.a.es=5;s.w.actors=[s.a];s.schedule(damage());s.runtime.advance(s.w);assert.equal(s.a.life,490);assert.equal(s.a.esBroke,false);assert.equal(s.a.hitFlash,.15);assert.equal(s.a.hitFlashType,'fire');assert.deepEqual(s.w.events.map(e=>e.kind),['warning','flash','mitigate','text','shieldBreak','sweep']);assert.deepEqual(s.w.events.find(e=>e.kind==='shieldBreak'),{kind:'shieldBreak',id:'a',depth:4,flag:false});
 for(const kind of ['invulnerable','absorbed','immunity']){const s=setup();s.a.team='red';s.w.actors=[s.a];s.a.es=kind==='invulnerable'?5:20;if(kind==='invulnerable')s.a.invulnerable=true;if(kind==='immunity')s.a.immunity=true;s.schedule(damage());s.runtime.advance(s.w);assert.equal(s.a.life,500);assert.equal(s.a.es,kind==='immunity'?20:0);assert.equal(s.a.esBroke,kind!=='immunity');assert(!s.w.events.some(e=>e.kind==='text'));}
});
test('healing text uses the strict half-point threshold, actual gain and native formatting',()=>{
 const s=setup();s.w.actors=[s.a];s.schedule(effect(.5));s.runtime.advance(s.w);assert(!s.w.events.some(e=>e.kind==='text'));s.schedule(effect(.51));s.runtime.advance(s.w);assert.equal(s.w.events.find(e=>e.kind==='text').text,'+1');
});
for(const stage of ['flash','heal','heal-text','mitigate','text','shieldBreak','sweep','kill'])test('reset after '+stage+' cancels current and remaining old-area delivery',()=>{
 const s=setup(),healing=['heal','heal-text'].includes(stage);if(!healing){s.a.team=s.b.team='red';s.a.es=5;s.a.ward=5;}if(stage==='kill')s.a.life=5;s.schedule(healing?effect(11):damage());s.schedule(healing?effect(31):damage());let once=false;s.w.hook=kind=>{if(!once&&kind===(stage==='heal-text'?'text':stage)){once=true;s.runtime.reset(s.w);s.w.actors=[body('new-area','red')];}};s.runtime.advance(s.w);assert(once);assert.equal(s.w.queue.length,0);assert.equal(s.b.life,500);assert.equal(s.w.events.at(-1).kind,'clear');
 if(stage==='flash')assert.equal(s.a.life,500);if(stage==='heal'||stage==='heal-text')assert.equal(s.a.life,531);if(stage==='mitigate'){assert.equal(s.a.life,500);assert.equal(s.a.es,0);assert.equal(s.a.esBroke,true);}if(stage==='text')assert.equal(s.a.esBroke,true);if(stage==='shieldBreak')assert.equal(s.a.esBroke,false);if(stage==='sweep')assert.equal(s.a.defensePending,false);if(stage==='kill'){assert.equal(s.a.life,-5);assert.equal(s.a.dead,true);}
});
test('replacement identity cancels, preserving newly scheduled work until the next advance',()=>{
 const s=setup();s.w.actors=[s.a];s.schedule(effect(11));s.schedule(effect(31));let once=false;s.w.hook=kind=>{if(kind==='heal'&&!once){once=true;s.w.queue=[];s.schedule(effect(41));}};s.runtime.advance(s.w);assert.equal(s.a.life,531);assert.equal(s.w.queue.length,1);s.runtime.advance(s.w);assert.equal(s.a.life,572);
});
test('explicit reset remains visible even when the old queue reference is restored',()=>{
 const s=setup();s.w.actors=[s.a];s.schedule(effect(11));s.schedule(effect(31));const old=s.w.queue;let once=false;s.w.hook=kind=>{if(kind==='heal'&&!once){once=true;s.runtime.reset(s.w);s.w.queue=old;}};s.runtime.advance(s.w);assert.equal(s.a.life,531);assert.equal(s.w.queue.length,1);
});
test('same-instance re-entry rejects before host reads and releases the outer guard after failure',()=>{
 const s=setup();s.w.actors=[s.a];s.schedule(effect(11));s.schedule(effect(31));s.w.hook=kind=>{if(kind==='heal'){const before=s.w.reads;try{s.runtime.advance(s.w);}finally{assert.equal(s.w.reads,before);}}};assert.throws(()=>s.runtime.advance(s.w),/^Error: Delayed burst advance is already active$/);assert.equal(s.a.life,531);assert.equal(s.w.queue.length,1);s.w.hook=undefined;s.runtime.advance(s.w);assert.equal(s.a.life,542);
});
test('caught nested rejection permits the outer drain to continue',()=>{const s=setup();s.w.actors=[s.a];s.schedule(effect(11));s.schedule(effect(31));s.w.hook=kind=>{if(kind==='heal')assert.throws(()=>s.runtime.advance(s.w),/already active/);};s.runtime.advance(s.w);assert.equal(s.a.life,542);assert.equal(s.w.queue.length,0);});
test('independent schedulers sharing ports can nest without shared guards',()=>{const x=setup(),y=setup();x.w.actors=[x.a];y.w.actors=[y.a];x.schedule(effect(11));y.schedule(effect(31));x.w.hook=kind=>{if(kind==='heal')y.runtime.advance(y.w);};x.runtime.advance(x.w);assert.equal(x.a.life,511);assert.equal(y.a.life,531);});
for(const stage of ['warning','flash','heal','mitigate','text','shieldBreak','sweep','kill'])test('failure after '+stage+' retains committed state and permits later recovery',()=>{
 const s=setup();s.w.actors=[s.a];const healing=stage==='heal';if(!healing){s.a.team='red';s.a.ward=5;s.a.es=5;}if(stage==='kill')s.a.life=5;s.schedule(effect(11,1));s.w.hook=kind=>{if(kind===stage)throw new Error('failed-'+stage);};
 if(stage==='warning'){assert.throws(()=>s.schedule(damage()),/failed-warning/);assert.equal(s.w.queue.length,2);}else{s.schedule(healing?effect(31):damage());assert.throws(()=>s.runtime.advance(s.w),new RegExp('failed-'+stage));assert.equal(s.w.queue.length,1);if(stage==='heal')assert.equal(s.a.life,531);if(stage==='mitigate')assert.equal(s.a.life,500);if(['text','shieldBreak','sweep'].includes(stage))assert.equal(s.a.life,490);if(stage==='kill')assert(s.a.dead);}
 s.w.hook=undefined;s.w.time=11;assert.doesNotThrow(()=>s.runtime.advance(s.w));assert.equal(s.w.queue.length,0);
});
test('a throwing clear callback invalidates the active generation before returning control',()=>{
 const s=setup();s.w.actors=[s.a];s.schedule(effect(11));s.schedule(effect(31));const old=s.w.queue;s.w.hook=kind=>{if(kind==='clear'){s.w.queue=old;throw new Error('clear-failed');}if(kind==='heal')assert.throws(()=>s.runtime.reset(s.w),/clear-failed/);};s.runtime.advance(s.w);assert.equal(s.a.life,531);assert.equal(s.w.queue.length,1);s.w.hook=undefined;s.runtime.advance(s.w);assert.equal(s.a.life,542);
});
test('failed initial observation releases the guard without removing work',()=>{const s=setup();s.schedule();s.w.failQueue=true;assert.throws(()=>s.runtime.advance(s.w),/queue-read/);s.w.failQueue=false;s.runtime.advance(s.w);assert.equal(s.a.life,510);assert.equal(s.w.queue.length,0);});
