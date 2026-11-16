import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';
import {buildCombatContent} from './compile-combat-content.mjs';import {sha256} from './reference-utils.mjs';
import {createCombatSession} from '../adapters/embedded/combat-session.mjs';import {emptyCombatSpace} from '../test/combat-empty-space.mjs';
import {verifyLocomotionCourses} from '../test/combat-session/locomotion.mjs';
const parent=fs.realpathSync('.artifacts'),work=fs.mkdtempSync(path.join(parent,'m4-locomotion-owned-'));
try{
 const base='baseline/'+(process.argv.includes('--airborne')?'combat-locomotion-airborne':'combat-locomotion'),accepted=JSON.parse(fs.readFileSync(base+'/acceptance.json')),bytes=fs.readFileSync(base+'/observations.json.gz');
 assert.equal(sha256(bytes),accepted.compressedSha256);assert.equal(sha256(gunzipSync(bytes)),accepted.sha256);
 await buildCombatContent(path.join(work,'content'));
 const {combatContent:content}=await import(pathToFileURL(path.join(work,'content/content.mjs')));
 console.log({passed:true,...verifyLocomotionCourses({fixture:JSON.parse(gunzipSync(bytes)),content,createCombatSession,emptyCombatSpace})});
 const native={name:'Host contracts',team:'player',position:{x:400,y:400},controlled:true,skills:[],stats:{moveSpeed:180}};
 const s=createCombatSession(content,{space:emptyCombatSpace()}),hero=s.addActor(native),before=s.snapshot();
 for(const [direction,seconds]of [[{x:NaN,y:0},.1],[{x:1,y:0},-1],[{x:1,y:0},Infinity],[{x:1,y:0},2]]){
  assert.throws(()=>s.move(hero,direction,seconds));assert.deepEqual(s.snapshot(),before);
 }
 const foreign=createCombatSession(content,{space:emptyCombatSpace()}).addActor(native);
 assert.throws(()=>s.move(foreign,{x:1,y:0},.1),/handle/);assert.deepEqual(s.snapshot(),before);
 const space=emptyCombatSpace();let returned;
 space.stepPhysical=(facts,to,from)=>{facts.pos.x=-999;facts.tier=99;from.x=-888;returned={pos:{...to},tier:1,collision:{hit:'none'}};return returned;};
 const p=createCombatSession(content,{space}),a=p.addActor(native);p.move(a,{x:1,y:0},.1);
 assert.equal(p.pose(a).pos.x,418);assert.equal(p.pose(a).tier,1);returned.pos.x=-777;assert.equal(p.pose(a).pos.x,418);
 const pose=p.pose(a);pose.velocity.x=0;pose.pos.y=0;assert.equal(p.pose(a).pos.y,400);
 space.stepPhysical=()=>({pos:{x:NaN,y:0},tier:0});assert.throws(()=>p.move(a,{x:1,y:0},.1),/physical pose/);assert.throws(()=>p.advance(.1),/quarantined/);
 const failedSpace=emptyCombatSpace();let failed;
 failedSpace.walkScale=()=>{assert.throws(()=>failed.advance(.1),/reenter/);return Infinity;};
 failed=createCombatSession(content,{space:failedSpace});const f=failed.addActor(native);
 assert.throws(()=>failed.move(f,{x:1,y:0},.1),/walking scale/);assert.throws(()=>failed.move(f,{x:1,y:0},.1),/quarantined/);
 console.log({passed:true,movementOwnershipContracts:11});
}finally{assert.equal(path.dirname(fs.realpathSync(work)),parent);fs.rmSync(work,{recursive:true,maxRetries:3});}
