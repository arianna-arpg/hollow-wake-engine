import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import ts from 'typescript';
import {root,sha256} from './reference-utils.mjs';
import {parityDirectory,parityReference} from './prototype-parity-tools.mjs';
import {readCatalogue} from './catalogue-tools.mjs';

const inheritedTables=['attributes','classes','passiveRealms','itemBases','affixes','uniques','vestiges','epitaphs','containers','equipSlots','itemRarities','defenseKinds','rules'];
const inheritedFiles=['src/data/reliquary.ts','src/data/stashes.ts','src/data/containers.ts','src/data/essences.ts','src/data/classes.ts',
  'src/engine/crafting.ts','src/engine/items.ts','src/engine/itemgen.ts','src/engine/itemchoices.ts','src/engine/containers.ts','src/engine/seatlaw.ts','src/engine/relicPower.ts'];
const validatedProfiles=new WeakSet();
/** Inherited packs must be proven unchanged, including registry order and
 * executable catalogue rules. A content-ID match alone cannot prove that. */
export function assertInheritedContent(profile){
  if(validatedProfiles.has(profile))return;
  const previous=readCatalogue(),old=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
  for(const table of inheritedTables){
    assert.deepEqual(profile.catalogue.tables[table],previous.tables[table],'Changed inherited table: '+table);
    assert.deepEqual(profile.catalogue.registryOrder[table],previous.registryOrder[table],'Changed inherited order: '+table);
    const rules=c=>c.sourceRules.filter(r=>r.path.startsWith(table+'/'));
    assert.deepEqual(rules(profile.catalogue),rules(previous),'Changed inherited executable rule: '+table);
  }
  for(const file of inheritedFiles){assert(old.files[file],'Missing inherited file: '+file);
    assert.equal(profile.lock.files[file],old.files[file],'Changed inherited pack source: '+file);}
  validatedProfiles.add(profile);
}

export function readPrototypeContent(){
  const lockBytes=fs.readFileSync(path.join(parityDirectory,'source-lock.json')),lock=JSON.parse(lockBytes);
  const accepted=JSON.parse(fs.readFileSync(path.join(parityDirectory,'content-acceptance.json')));
  assert.equal(accepted.sourceCommit,lock.commit);assert.equal(accepted.sourceLockSha256,sha256(lockBytes));
  for(const[file,hash]of Object.entries(accepted.sources))assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);
  const read=name=>{const row=accepted.fixtures[name],compressed=fs.readFileSync(path.join(root,row.file));assert.equal(sha256(compressed),row.compressedSha256);
    const bytes=gunzipSync(compressed);assert.equal(sha256(bytes),row.sha256);return JSON.parse(bytes);};
  const runtime=read('runtime');assert(runtime.originalOnly);
  return {lock,lockBytes,directory:parityReference,catalogue:read('catalogue'),runtime};
}
export function prototypeBuildPack(previous,profile=readPrototypeContent()){
  assertInheritedContent(profile);
  const {runtime,catalogue}=profile,table=name=>Object.fromEntries(catalogue.tables[name].map(row=>[row.id,row.value]));
  const identified=(data,prefix)=>({...data,contentId:prefix+':sha256:'+sha256(JSON.stringify(data))});
  const {contentId:oldId,...data}=previous;
  void oldId;
  assertUnchangedDeclaration(profile,'src/engine/skills.ts','SKILL_RARITIES');
  const progression={...runtime.progression,services:{...runtime.progression.services,rarities:previous.progression.services.rarities}};
  const result={...data,definitions:{...data.definitions,stats:table('stats'),skills:table('skills'),supports:table('supports'),
    summonPactSupportGrants:runtime.summonPactSupportGrants,
    satelliteItems:runtime.carried.satellites.ids.map(id=>({stat:'satelliteCount_'+id,tags:runtime.carried.satellites.definitions[id].tags})),
    monsters:Object.fromEntries(Object.entries(runtime.registries.monsters).map(([id,m])=>[id,{skills:m.skills,faction:m.faction,...(m.grants?{grants:m.grants.filter(g=>g.skill).map(g=>({skill:g.skill}))}:{})}]))},
    passives:identified(runtime.passiveGrants,'hollow-wake-grants'),progression:identified(progression,'hollow-wake-skill-progression')};
  return identified(result,'hollow-wake-character-builds');
}
export function assertUnchangedDeclaration(profile,file,name){
  const old=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
  const read=(directory,lock)=>{const bytes=fs.readFileSync(path.join(directory,file));assert.equal(sha256(bytes),lock.files[file]);
    const source=ts.createSourceFile(file,bytes.toString(),ts.ScriptTarget.Latest,true);
    const node=source.statements.flatMap(n=>ts.isVariableStatement(n)?[...n.declarationList.declarations]:[]).find(n=>n.name.getText(source)===name);
    assert(node,'Missing inherited declaration: '+name);return ts.createPrinter({removeComments:true}).printNode(ts.EmitHint.Unspecified,node,source);};
  assert.equal(read(profile.directory,profile.lock),read(path.join(root,'.reference'),old),'Changed inherited rule: '+file+':'+name);
}
