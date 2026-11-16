import test from 'node:test';
import assert from 'node:assert/strict';
import {ConstructRelocation} from '../dist/construct-relocation.js';
function setup(){
  const host={def:{id:'totem'}},payload={def:{id:'move'}},caster={dead:false,skills:[host],pos:{x:0,y:0},team:'ally'};
  const make=x=>({dead:false,owner:caster,summonInst:host,construct:{kind:'totem'},lifespan:10,team:'ally',radius:5,pos:{x,y:0},facing:0,casting:{},push:{},skills:[]});
  const a=make(20),b=make(-20),actors=[a,b],events=[];
  const ports={actors:()=>actors,metas:()=>[{skillId:'move'}],delivery:()=>({type:'construct',kind:'totem',castSkillId:'firebolt',placeRange:30}),
    sameLayer:()=>true,clamp:(p,r,a)=>{events.push(['clamp',p,r,a]);return p;},moved:(a,c)=>events.push(['moved',a,c])};
  const service=new ConstructRelocation(ports);service.bind(payload,host);return{host,payload,caster,a,b,actors,events,ports,service};
}
test('relocation retains first ties, includes exact radius and requires the original host instance',()=>{
  const s=setup();assert.equal(s.service.target(s.caster,s.payload,20),s.a);assert.equal(s.service.target(s.caster,s.payload,19),undefined);
  s.caster.skills=[{def:{id:'totem'}}];assert.equal(s.service.target(s.caster,s.payload,100),undefined);
});
test('foreign metas, missing grants, expired bodies and different layers are refused',()=>{
  const s=setup();assert.equal(s.service.target(s.caster,{def:{id:'move'}},100),undefined);
  s.ports.metas=()=>[];assert.equal(s.service.target(s.caster,s.payload,100),undefined);
  s.ports.metas=()=>[{skillId:'move'}];s.a.lifespan=0;s.ports.sameLayer=a=>a!==s.b;assert.equal(s.service.target(s.caster,s.payload,100),undefined);
});
test('movement is limited by the host skill and clears only the selected body after clamping',()=>{
  const s=setup();s.service.move(s.caster,s.payload,{x:100,y:0},40,'blue');
  assert.deepEqual(s.a.pos,{x:30,y:0});assert.equal(s.a.casting,null);assert.equal(s.a.push,null);assert.notEqual(s.b.casting,null);
  assert.deepEqual(s.events.map(e=>e[0]),['clamp','moved']);assert.equal(s.events[0][3],s.a);
});
test('failed spatial placement leaves casting and push intact',()=>{
  const s=setup(),prior={...s.a};s.ports.clamp=()=>{throw Error('ground unavailable');};
  assert.throws(()=>s.service.move(s.caster,s.payload,{x:100,y:0},40,'blue'),/ground unavailable/);assert.deepEqual(s.a,prior);
});
test('relocation reads the shared casting identity rather than a second payload cache',()=>{
  const s=setup(),hosts=new WeakMap([[s.payload,s.host]]);
  const service=new ConstructRelocation(s.ports,payload=>hosts.get(payload));
  assert.equal(service.target(s.caster,s.payload,20),s.a);
  hosts.delete(s.payload);
  service.bind(s.payload,s.host);
  assert.equal(service.target(s.caster,s.payload,20),undefined,'An expired shared association cannot fall back to stale state');
});
