import fs from 'node:fs';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {ConstructBirth} from '../dist/construct-birth.js';import {StatSheet} from '../dist/stats.js';import {StatRules} from '../dist/stat-rules.js';import {sha256} from './reference-utils.mjs';
const probe=process.argv.includes('--probe'),archive=fs.readFileSync(probe?'.artifacts/m3-construct-birth-probe.json.gz':'baseline/construct-birth/observations.json.gz'),bytes=gunzipSync(archive),fixture=JSON.parse(bytes);assert(fixture.originalOnly);
if(!probe){const a=JSON.parse(fs.readFileSync('baseline/construct-birth/acceptance.json'));assert.equal(sha256(archive),a.compressedSha256);assert.equal(sha256(bytes),a.sha256);}
const plain=value=>JSON.parse(JSON.stringify(value)),rules=new StatRules(fixture.definitions,fixture.trades);
for(const c of fixture.courses){
  const make=(id,pos)=>({id,pos,team:'ally',facing:0,tier:0,level:1,radius:12,dead:false,taunt:false,untargetable:false,invulnerable:false,lifespan:Infinity,explodeOnDeath:0,activeAuras:new Map(),sheet:new StatSheet(rules),
    fillResources(){this.life=this.sheet.get('life');this.mana=this.sheet.get('mana');}}),a=make(c.casterId,{x:800,y:600}),actors=[a],born=[];
  a.tier=2;a.level=7;for(const [key,v]of Object.entries(c.stats))a.sheet.setBase(key,v);for(const [key,mods]of Object.entries(fixture.sources))a.sheet.setSource(key,mods);
  const skill={def:{id:'m3-'+c.name,name:c.name,color:'#fff'}},payload=c.self?skill:{def:{id:'m3-payload'}},unused=()=>assert.fail('Unexpected construct operation '+c.name);
  const runtime=new ConstructBirth(fixture.rules,{tags:()=>new Set(c.tags),modifiers:()=>c.extra,innateModifiers:()=>c.innate,sockets:()=>[],socket:()=>undefined,
    minions:(owner,id)=>actors.filter(b=>!b.dead&&b.owner===owner&&b.sourceSkillId===id),kill:b=>{b.dead=true;},create:(_name,_team,pos)=>{const b=make(c.ids[born.length],pos);born.push(b);return b;},actors:()=>actors,
    random:unused,clamp:p=>p,push:unused,attachTethers(){},enemies:()=>[],hit:unused,arrival:()=>false,flash(){}});
  for(let n=0;n<c.ids.length;n++)runtime.spawn(a,skill,c.delivery,{x:1000,y:600},payload,undefined,c.scale);
  const actual=born.map(b=>({pos:b.pos,radius:b.radius,tier:b.tier,level:b.level,sourceSkillId:b.sourceSkillId,shape:b.shape,color:b.color,look:b.look,aims:b.aims,taunt:b.taunt,
    untargetable:b.untargetable,invulnerable:b.invulnerable,lifespan:b.lifespan,explodeOnDeath:b.explodeOnDeath,gateLink:b.gateLink,dead:b.dead,
    construct:{...b.construct,castInst:b.construct?.castInst?.def.id},life:b.life,mana:b.mana,
    sources:Object.fromEntries(['inherited','parentSkill','owner','constructCastRate'].map(s=>[s,b.sheet.getSourceMods(s)])),
    auras:[...b.activeAuras].map(([key,aura])=>[key,{...aura,inst:aura.inst.def.id,affected:[...aura.affected],remaining:String(aura.remaining)}])}));
  assert.deepEqual(plain(actual),c.expected,c.name);assert(born.every(b=>b.owner===a&&b.summonInst===skill&&b.construct.castInst===payload));
}
console.log({passed:true,originalBirthCourses:fixture.courses.length,composedStatEngine:true,allCombatFamiliesQualified:false});
