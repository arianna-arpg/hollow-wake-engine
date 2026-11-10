import assert from 'node:assert/strict';
import {GuardArts} from '../src/engine/guardArts';
import type {Actor} from '../src/engine/actor';
import type {World} from '../src/engine/world';
import type {SkillInstance} from '../src/engine/skills';

// Diagnostic host graph: checks adapter ownership, not authored skill legality.
// This same source must pass against the untouched original and installed SDK.
const skill=(id:string)=>({def:{id,color:'#abc',tags:['guard'],guardArts:{absorb:{fraction:1,duration:2,cooldown:3}}},treeNodes:[],level:1,sockets:[]}) as unknown as SkillInstance;
const guard=skill('guard'),other=skill('other');
const removed:string[]=[];
const owner={id:1,dead:false,downed:false,skills:[guard,other],absorbLayers:new Map(),
 sheet:{removeSource:(key:string)=>removed.push(key)},removeBuff:(key:string)=>removed.push(key),
 casting:{inst:guard,mode:'guard',held:true}} as unknown as Actor;
const foreign={id:2} as Actor;
const owned={caster:owner,inst:{guardArtsHost:guard}},otherSkill={caster:owner,inst:{guardArtsHost:other}},
 otherCaster={caster:foreign,inst:{guardArtsHost:guard}},ordinary={caster:owner,inst:{}};
const world={actors:[owner],projectiles:[owned,otherSkill,otherCaster,ordinary]} as unknown as World;
const runtime=new GuardArts(world);runtime.sync(owner);const held=owner.casting;
runtime.clear(owner,guard);
assert.deepEqual(world.projectiles,[otherSkill,otherCaster,ordinary],'Clear must match both caster and guard host');
assert.equal(owner.casting,held,'Guard cleanup does not own held-cast cancellation');
assert.equal(removed.length,2,'Only one guard source is retired');
runtime.clear(owner,other);
assert.deepEqual(world.projectiles,[otherCaster,ordinary],'Other guard cleanup retains foreign and ordinary carriers');
assert.equal(removed.length,4);
console.log('Guard binding ownership: 5 assertions passed');
