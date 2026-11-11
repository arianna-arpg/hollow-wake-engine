import assert from 'node:assert/strict';
export function sequenceContinuationContracts(Controller){
 let count=0;const test=(name,fn)=>{fn();count++;};
 const forbidden=new Proxy({}, {get(_t,key){assert.fail('Copy invoked host port '+String(key));}});
 const make=()=>new Controller(forbidden);
 function fixture(){
  const skill=id=>({def:{id,tags:[],delivery:{type:'melee'}},level:1,sockets:[],treeNodes:[],state:{}});
  const host=skill('cleave'),primary={...skill('cleave'),sequenceHost:host,sequenceRole:'primary'},variant={...primary},retired={...primary};
  const actor=id=>({id,pos:{x:id,y:0},skills:[],buffs:new Map(),statuses:[],skillRecoveryLocks:new Map()});
  const owner=actor(1),target=actor(2),marker=actor(3);owner.skills=[host];marker.owner=owner;
  const policy={hitCycle:{max:4,increasedPerStack:.1}},buff={type:'buff',id:'cycle',duration:4,mods:[]};owner.buffs.set(buff.id,{def:buff});
  const state={owner,host,spec:policy,policy:'frozen',key:'sequence:1:cleave:2',stacks:new Map([[target,2]]),caught:3,retired:false,buffs:new Map([[owner,buff]])};
  const old={...state,key:'sequence:1:cleave:1',stacks:new Map([[target,0]]),retired:true,buffs:new Map()},cast={state,inst:primary,caught:2,connected:true,done:false,receipt:{target,dealt:12,physical:9}},oldCast={state:old,inst:retired,caught:0,connected:true,done:true};
  const flight={caster:owner,inst:primary,pos:{x:4,y:5},mult:1},externalFlight={caster:owner,inst:retired,pos:{x:6,y:7},mult:1};
  const source=make();source.serial=8;source.states.add(state);source.casts.set(primary,cast);source.casts.set(variant,cast);source.casts.set(retired,oldCast);source.active.add(cast);
  source.recoveries.push({cast,projectile:flight,target,marker,at:flight.pos,from:owner.pos,elapsed:.2,duration:1,dealt:12,airborne:true});
  source.scheduled.push({state,inst:primary,aim:flight.pos,due:7,power:2});source.rainAt.set(flight,7.5);source.rainAt.set(externalFlight,9.25);source.deferredContacts.push({projectile:flight,target});
  // A single copy preserves all visible object aliases. Weak controller maps
  // themselves are deliberately excluded and handled only by the candidate.
  const graph={actors:[owner,target,marker],skills:[host,primary,variant,retired],projectiles:[flight,externalFlight],buffs:[buff]};const copied=structuredClone(graph);
  const actors=new Map(graph.actors.map((v,n)=>[v,copied.actors[n]])),skills=new Map(graph.skills.map((v,n)=>[v,copied.skills[n]])),projectiles=new Map(graph.projectiles.map((v,n)=>[v,copied.projectiles[n]])),buffs=new Map([[buff,copied.buffs[0]]]);
  const aims=new Map([...actors].map(([a,b])=>[a.pos,b.pos]));for(const[a,b]of projectiles)aims.set(a.pos,b.pos);
  const mapping={actors,skills,projectiles,buffs,spec:structuredClone,aim:point=>{assert(aims.has(point));return aims.get(point);}};
  return{source,destination:make(),mapping,owner,target,marker,host,primary,variant,retired,flight,externalFlight,cast,oldCast,state,old,buff,graph};
 }
 const copied=f=>{assert.equal(f.source.copyOwnedStateTo(f.destination,f.mapping),f.destination);return f.destination;};
 test('owned state and all cast aliases remain detached',()=>{
  const f=fixture(),d=copied(f),c=d.casts.get(f.mapping.skills.get(f.primary)),s=c.state;
  assert.notEqual(s,f.state);assert.notEqual(c,f.cast);assert.equal(d.casts.get(f.mapping.skills.get(f.variant)),c);assert.equal(c.inst,f.mapping.skills.get(f.primary));assert.equal(s.owner,f.mapping.actors.get(f.owner));assert.equal(s.host,f.mapping.skills.get(f.host));assert.equal(s.stacks.get(f.mapping.actors.get(f.target)),2);assert.equal(s.caught,3);assert.equal(s.key,f.state.key);assert.equal(s.policy,'frozen');assert.equal(d.serial,8);assert.equal(c.caught,2);assert.equal(c.connected,true);assert.equal(c.done,false);
  assert.notEqual(s.spec,f.state.spec);s.spec.hitCycle.max=11;s.stacks.set(f.mapping.actors.get(f.target),99);assert.equal(f.state.spec.hitCycle.max,4);assert.equal(f.state.stacks.get(f.target),2);
 });
 test('retired weak-key cast remains separate from active state',()=>{const f=fixture(),d=copied(f),c=d.casts.get(f.mapping.skills.get(f.retired));assert(c.state.retired&&c.done);assert.equal(d.states.has(c.state),false);assert.notEqual(c.state,f.old);assert.equal(c.inst,f.mapping.skills.get(f.retired));assert.equal(d.states.size,1);});
 test('receipt active recovery deferred contact and scheduled aliases',()=>{
  const f=fixture(),d=copied(f),c=d.casts.get(f.mapping.skills.get(f.primary));assert.equal([...d.active][0],c);assert.notEqual(c.receipt,f.cast.receipt);assert.equal(c.receipt.target,f.mapping.actors.get(f.target));assert.equal(c.receipt.dealt,12);
  const r=d.recoveries[0],j=d.scheduled[0];assert.notEqual(r,f.source.recoveries[0]);assert.equal(r.cast,c);assert.equal(r.projectile,f.mapping.projectiles.get(f.flight));assert.equal(r.marker,f.mapping.actors.get(f.marker));assert.equal(r.target,f.mapping.actors.get(f.target));assert.equal(r.at,r.projectile.pos);assert.equal(r.from,f.mapping.actors.get(f.owner).pos);assert.equal(j.aim,r.at);assert.equal(j.state,c.state);assert.equal(j.inst,c.inst);assert.equal(j.due,7);assert.equal(j.power,2);assert.equal(r.elapsed,.2);assert.equal(r.duration,1);assert.equal(r.airborne,true);assert.equal(r.dealt,12);assert.deepEqual(d.deferredContacts,[{projectile:r.projectile,target:r.target}]);
 });
 test('weak projectile clocks include externally retained completed flights',()=>{const f=fixture(),d=copied(f);assert.equal(d.rainAt.get(f.mapping.projectiles.get(f.flight)),7.5);assert.equal(d.rainAt.get(f.mapping.projectiles.get(f.externalFlight)),9.25);assert.equal(d.rainAt.has(f.flight),false);});
 test('owned buffs preserve the actor definition alias',()=>{const f=fixture(),d=copied(f),s=[...d.states][0],owner=f.mapping.actors.get(f.owner),buff=f.mapping.buffs.get(f.buff);assert.equal(s.buffs.get(owner),buff);assert.equal(owner.buffs.get(buff.id).def,buff);assert.notEqual(buff,f.buff);});
 const refuses=(edit,pattern)=>{const f=fixture();edit(f);const destination=f.destination,fields={states:destination.states,casts:destination.casts,active:destination.active,recoveries:destination.recoveries,scheduled:destination.scheduled,rainAt:destination.rainAt,deferredContacts:destination.deferredContacts};assert.throws(()=>f.source.copyOwnedStateTo(destination,f.mapping),pattern);for(const[key,value]of Object.entries(fields))assert.equal(destination[key],value);assert.equal(destination.serial,0);assert.equal(destination.continuationImported,false);assert.equal(f.state.stacks.get(f.target),2);};
 test('missing retained primary mapping refuses before publication',()=>refuses(f=>f.mapping.skills.delete(f.primary),/Missing sequence skill/));
 test('missing recovery marker refuses before publication',()=>refuses(f=>f.mapping.actors.delete(f.marker),/Missing sequence actor/));
 test('missing projectile refuses before publication',()=>refuses(f=>f.mapping.projectiles.delete(f.flight),/Missing sequence projectile/));
 test('missing buff refuses before publication',()=>refuses(f=>f.mapping.buffs.delete(f.buff),/Missing sequence buff/));
 test('shared live skill identity refuses',()=>refuses(f=>f.mapping.skills.set(f.primary,f.primary),/detached skill/));
 test('collapsed skill identity refuses',()=>refuses(f=>f.mapping.skills.set(f.variant,f.mapping.skills.get(f.primary)),/detached skill/));
 test('wrong actor identity refuses',()=>refuses(f=>f.mapping.actors.get(f.owner).id=88,/actor identity/));
 test('shared actor collections refuse',()=>refuses(f=>f.mapping.actors.get(f.owner).statuses=f.owner.statuses,/mutable actor state/));
 test('missing payload host alias refuses',()=>refuses(f=>f.mapping.skills.get(f.primary).sequenceHost=f.host,/payload provenance/));
 test('incorrect projectile owner refuses',()=>refuses(f=>f.mapping.projectiles.get(f.flight).caster=f.owner,/projectile ownership/));
 test('incorrect actor buff alias refuses',()=>refuses(f=>f.mapping.actors.get(f.owner).buffs.get(f.buff.id).def={...f.buff},/buff identity/));
 test('borrowed policy callback refuses',()=>refuses(f=>f.mapping.spec=s=>s,/owned policy snapshot/));
 test('borrowed aim callback refuses',()=>refuses(f=>f.mapping.aim=p=>p,/mutable aim/));
 test('late aim callback failure leaves controller untouched',()=>refuses(f=>f.mapping.aim=()=>{throw Error('diagnostic mapping failure');},/diagnostic mapping failure/));
 test('used destination refuses even after state cleanup',()=>{const f=fixture();f.destination.serial=1;assert.throws(()=>f.source.copyOwnedStateTo(f.destination,f.mapping),/fresh private controller/);});
 test('a completed import cannot be reused',()=>{const f=fixture(),d=copied(f);assert.throws(()=>f.source.copyOwnedStateTo(d,f.mapping),/fresh private controller/);});
 test('self-copy refuses',()=>{const f=fixture();assert.throws(()=>f.source.copyOwnedStateTo(f.source,f.mapping),/fresh private controller/);});
 test('empty import still consumes destination admission',()=>{const source=make(),destination=make(),mapping={actors:new Map(),skills:new Map(),projectiles:new Map(),buffs:new Map(),spec:structuredClone,aim:structuredClone};source.copyOwnedStateTo(destination,mapping);assert.equal(destination.serial,0);assert.throws(()=>source.copyOwnedStateTo(destination,mapping),/fresh private controller/);});
 test('absent receipt stays absent',()=>{const f=fixture(),d=copied(f);assert.equal(Object.hasOwn(f.oldCast,'receipt'),false);assert.equal(Object.hasOwn(d.casts.get(f.mapping.skills.get(f.retired)),'receipt'),false);});
 test('explicit undefined receipt keeps its own slot',()=>{const f=fixture();f.cast.receipt=undefined;const d=copied(f),cast=d.casts.get(f.mapping.skills.get(f.primary));assert.equal(Object.hasOwn(cast,'receipt'),true);assert.equal(cast.receipt,undefined);});
 test('absent recovery target and marker stay absent',()=>{const f=fixture();delete f.source.recoveries[0].target;delete f.source.recoveries[0].marker;const d=copied(f);assert.equal(Object.hasOwn(d.recoveries[0],'target'),false);assert.equal(Object.hasOwn(d.recoveries[0],'marker'),false);});
 return count;
}
