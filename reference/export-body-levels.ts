// Original-only evidence for the World level service still used by companions.
// The final definition is diagnostic; it exercises supported scaling terms and
// is removed in finally. This is not spawn/death/AI or full body lifecycle proof.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {MONSTERS} from '../src/data/monsters';import {monsterSkillLevelOf} from '../src/engine/world';import type {Actor} from '../src/engine/actor';
bootSimEngine();const restore=seedGlobalRandom(0x1288),probe='hwe_body_level_diagnostic',rows:unknown[]=[],ids=new WeakMap<object,number>();let serial=0;
const id=(x:object)=>{if(!ids.has(x))ids.set(x,++serial);return ids.get(x);},near=(a:number,b:number)=>assert(Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b)));
assert(!MONSTERS[probe]);
try{
 MONSTERS[probe]={...MONSTERS.cinderkin,id:probe,name:'Body level diagnostic',base:{life:40,armor:12,mana:0,moveSpeed:110},boss:true,plies:{count:3,perLevel:.5},
  scaling:{life:{flatPerLevel:3,incPerLevel:.1,rate:.02,pow:1.5},armor:{flatPerLevel:2,pow:2},accuracy:{flatPerLevel:0,incPerLevel:0,rate:0}}};
 const explicit=Object.values(MONSTERS).find(d=>d.boss&&d.base.poise!==undefined);assert(explicit);
 const w=makeSimWorld('tamer',0x1288);w.walk=null;w.actors=[w.player];
 const view=(a:Actor)=>({def:a.defId,level:a.level,life:a.life,maxLife:a.maxLife(),downed:a.downed,plies:a.plies,pliesMax:a.pliesMax,plySpec:a.plySpec,
  bases:[...(a.sheet as any).baseOverrides],sources:a.sheet.sourceNames().map(key=>[key,a.sheet.getSourceMods(key)]),stats:['life','armor','accuracy','evasion','poise'].map(key=>[key,a.sheet.get(key)]),
  skills:a.skills.map(s=>s&&{identity:id(s),def:s.def.id,level:s.level}),cooldowns:[...a.cooldowns]});
 const observe=(label:string,a:Actor)=>rows.push(JSON.parse(JSON.stringify({label,body:view(a)})));
 const selected=['cinderkin','conclave_eldritch_horror',explicit.id,probe];let last:Actor|undefined;
 for(const defId of selected){
  const a=w.createMonster(defId,3,w.player.team,w.player);last=a;a.life=a.maxLife()*.4;a.plies=Math.floor(a.pliesMax/2);a.cooldowns.set('retained-clock',1.75);
  const native=a.skills.slice(),cooldowns=a.cooldowns;observe('wounded-level-three:'+defId,a);
  const life=a.life/a.maxLife(),ply=a.pliesMax>0?a.plies/a.pliesMax:1;w.relevelActor(a,9);near(a.life,Math.min(a.maxLife(),Math.max(1,a.maxLife()*life)));assert.equal(a.plies,Math.min(a.pliesMax,Math.round(a.pliesMax*ply)));
  for(let n=0;n<native.length;n++){assert.equal(a.skills[n],native[n]);if(a.skills[n])assert.equal(a.skills[n]!.level,monsterSkillLevelOf(9));}assert.equal(a.cooldowns,cooldowns);assert.equal(a.cooldowns.get('retained-clock'),1.75);
  const fresh=w.createMonster(defId,9,w.player.team,w.player);for(const stat of ['life','armor','accuracy','evasion','poise'])near(a.sheet.get(stat),fresh.sheet.get(stat));
  if(MONSTERS[defId].base.poise!==undefined)assert.equal((a.sheet as any).baseOverrides.get('poise'),MONSTERS[defId].base.poise);
  observe('grown-with-native-identities-and-spent-plies:'+defId,a);
  const unchanged=view(a);w.relevelActor(a,9);assert.deepEqual(view(a),unchanged);observe('same-level-no-op:'+defId,a);
  a.downed=true;a.life=0;w.relevelActor(a,2);assert.equal(a.life,0);observe('downed-body-stays-at-zero:'+defId,a);
  a.downed=false;a.life=.01;w.relevelActor(a,1);assert.equal(a.life,1);observe('living-body-keeps-one-life-floor:'+defId,a);
 }
 assert(last);last.defId='hwe_missing_body';let before=view(last);w.relevelActor(last,25);assert.deepEqual(view(last),before);observe('unknown-definition-is-no-op',last);
 last.defId=undefined;before=view(last);w.relevelActor(last,25);assert.deepEqual(view(last),before);observe('absent-definition-is-no-op',last);
 const full=w.createMonster('cinderkin',3,w.player.team,w.player);full.life=full.maxLife()*2;w.relevelActor(full,9);assert.equal(full.life,full.maxLife());observe('overfull-life-clamps-to-new-maximum',full);
 assert.equal(rows.length,23);writeFileSync(process.argv[2],JSON.stringify({scope:'original-body-level-continuation-draft/v1',selected,diagnosticDefinition:MONSTERS[probe],rows}),{flag:'wx'});
}finally{delete MONSTERS[probe];restore();}
