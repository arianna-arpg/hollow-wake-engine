import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {checkScope,readScope,scopePath} from './combat-inventory-scope-tools.mjs';
import {readCatalogue} from './catalogue-tools.mjs';
import {acceptedCombatData} from './combat-registry-data.mjs';

const report=checkScope(),scope=readScope(),catalogue=readCatalogue();
const tables={};for(const[name,rows]of Object.entries(catalogue.tables))tables[name]=rows.length;
const fields={},families={},record=(map,key,id)=>{const row=map[key]??={count:0,examples:[]};row.count++;if(row.examples.length<3&&!row.examples.includes(id))row.examples.push(id);};
const walk=(value,at,id)=>{
 if(Array.isArray(value)){for(const row of value)walk(row,at+'[]',id);return;}
 if(!value||typeof value!=='object')return;
 for(const[key,next]of Object.entries(value)){
  if(['type','kind','op'].includes(key)&&typeof next==='string')record(families,at+'.'+key+'='+next,id);
  if(key==='$sourceRule')record(families,'sourceRule:'+String(next),id);
  walk(next,at+'.'+key,id);
 }
};
const selected=['skills','supports','passives','vocations','itemBases','affixes','uniques','vestiges','epitaphs','statuses'];
for(const name of selected)for(const row of catalogue.tables[name]){
 for(const key of Object.keys(row.value))record(fields,name+'.'+key,row.id);
 const value={...row.value};if(name==='vocations'){delete value.quest;delete value.secret;}
 walk(value,name,row.id);
}
report.content={tables,rows:Object.values(tables).reduce((a,b)=>a+b,0),structuralFields:fields,discriminatorFamilies:families,
 sourceRules:catalogue.sourceRules,executionProvenByCensus:false,excludedVocationSubtrees:['quest','secret'],coverageTask:'content'};
const composedCourses=new Map(acceptedCombatData('combat-families').courses.map(course=>[course.id,course]));
const checkRoutes=value=>{
 for(const[name,prefix]of [['effects','skills.effects[].type='],['deliveries','skills.delivery.type=']]){
  const expected=Object.keys(families).filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length)).sort();
  assert.deepEqual(Object.keys(value.contentFamilies[name]).sort(),expected,'Unassigned content family: '+name);
  for(const [family,row]of Object.entries(value.contentFamilies[name])){
   assert(value.capabilities.some(c=>c.id===row.capability)&&row.hostBoundary
    &&['pending-composed-course','composed-public-course','explicit-host-request-and-unavailable-refusal'].includes(row.acceptance),'Invalid content assignment');
   if(row.acceptance!=='pending-composed-course'){
    assert(row.evidence?.includes('scripts/test-combat-session-package.mjs')&&row.cases?.length,'Missing public content evidence');
    for(const id of row.cases){const course=composedCourses.get(id);assert(course&&(name==='effects'?course.effects.includes(family):course.delivery===family),'Invalid composed content evidence');}
   }
  }
 }
};checkRoutes(scope);
report.controls=[];
const reject=(name,fn,pattern)=>{assert.throws(fn,pattern,name);report.controls.push({name,detected:true});};
const original=fs.readFileSync(path.join(root,'src/index.ts'),'utf8');
reject('optional-runtime-import',()=>checkScope({overrides:new Map([['src/index.ts',original+"\nexport {ProgressionSession} from './progression-session.js';\n"]])}),/Minimal runtime depends on an extension/);
reject('optional-type-import',()=>checkScope({overrides:new Map([['src/index.ts',original+"\nexport type {VocationGateState} from './vocations.js';\n"]])}),/Minimal declarations depend on an extension/);
reject('database-import',()=>checkScope({overrides:new Map([['src/index.ts',original+"\nimport 'node:sqlite';\n"]])}),/External runtime dependency/);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json')));manifest.exports['./unreviewed']='./dist/index.js';
reject('unclassified-export',()=>checkScope({manifest}),/Unclassified public entry/);
const missingFamily=structuredClone(scope);delete missingFamily.contentFamilies.effects.damage;
reject('unassigned-content-family',()=>checkRoutes(missingFamily),/Unassigned content family/);
const counterfeit=structuredClone(scope);counterfeit.contentFamilies.effects.damage.cases=['not-a-frozen-course'];
reject('counterfeit-composed-evidence',()=>checkRoutes(counterfeit),/Invalid composed content evidence/);
const same=checkScope();assert.deepEqual(same.graphs,report.graphs);report.restored=true;
for(const file of [scopePath,'package.json','scripts/combat-inventory-scope-tools.mjs','scripts/check-combat-inventory-scope.mjs','scripts/catalogue-tools.mjs'])report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);assert(report.inputsUnchanged);
writeJSON(path.join(root,'.artifacts/combat-inventory-scope.json'),report);
console.log({passed:true,capabilities:report.capabilities,exports:report.exports,catalogueRows:report.content.rows,structuralFamilies:Object.keys(families).length,controls:report.controls.length,minimalEntries:scope.minimalEntries,allCapabilitiesComposed:false});
