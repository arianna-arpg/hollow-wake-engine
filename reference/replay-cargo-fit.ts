// Installed-consumer replay. The source capture itself never imports the SDK.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {CargoAtlas,CargoInspector,createCargoFitReader} from '@hollow-wake/engine/inventory/cargo-cards';
import {ItemContent} from '@hollow-wake/engine/items';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import {supportRules} from './supportRulesAdapter';
const original=(file:string)=>import(pathToFileURL(path.join(process.argv[2],'src',file+'.ts')).href);
const {bootSimEngine}=await original('sim/arena');bootSimEngine();
const {SKILLS}=await original('data/skills'),{SUPPORTS}=await original('data/supports');
const {World}=await original('engine/world'),{makeSkillInstance}=await original('engine/skills');
const installed=(id:string)=>JSON.parse(fs.readFileSync(new URL(import.meta.resolve(id)),'utf8'));
const craft=new CraftingContent(installed('@hollow-wake/crafting/crafting.json'),new ItemContent(installed('@hollow-wake/items/items.json')));
const skills=new SkillProgression(installed('@hollow-wake/skill-progression/skill-progression.json'));
const manifest=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/cargo-cards/index.json')),'utf8'));
const handle=fs.openSync(new URL(import.meta.resolve('@hollow-wake/cargo-cards/pages.txt')),'r');
const atlas=new CargoAtlas(manifest,(_,range)=>{
  const buffer=Buffer.alloc(range.length);
  assert.equal(fs.readSync(handle,buffer,0,buffer.length,range.offset),buffer.length);return buffer.toString();
});
const inspector=new CargoInspector(skills,craft,atlas.config);
const bar=JSON.parse(fs.readFileSync('roster.json','utf8')).map((s:any)=>{
  if(!s)return null;
  const inst=makeSkillInstance(SKILLS[s.id],s.level,s.sockets.length);
  inst.sockets=s.sockets.map((r:any)=>r?{def:SUPPORTS[r.id],level:r.level}:null);
  const crew=World.prototype.summonCrewSkills(inst);
  assert.deepEqual(Array.isArray(crew)?crew.map(d=>d.id):crew,s.crew);return inst;
});
let active=bar;
const fit=createCargoFitReader(supportRules(),id=>SUPPORTS[id],()=>active,inst=>World.prototype.summonCrewSkills(inst));
let cases=0,slots=0,crewOnly=0;
try{
  for(const r of JSON.parse(fs.readFileSync('support-cases.json','utf8'))){
    active=r.view.emptyBar?[]:bar;
    const result=inspector.inspect(r.item,{},atlas.read,fit);
    if(!r.values){assert.equal(result,null);continue;}
    assert.equal(result?.kind,'support');const actual=result!.compatibility!;
    assert.deepEqual(actual.map(s=>[s.slot,s.skillId,s.fits,s.sockets,s.occupied]),
      r.values.fit.map((s:any)=>[s.slot,s.id,s.fits,s.sockets,s.occupied]),r.label);
    cases++;slots+=actual.length;crewOnly+=r.values.fit.filter((s:any,i:number)=>!s.direct&&actual[i].fits).length;
  }
}finally{fs.closeSync(handle);}
fs.writeFileSync('fit-result.json',JSON.stringify({passed:true,cases,slots,crewOnly})+'\n');
