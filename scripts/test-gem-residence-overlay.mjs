import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256,writeJSON,verifyReference} from './reference-utils.mjs';
import {integrateGemResidence,renderGemResidence,renderItemRestoration} from '../adapters/hollow-wake/integrate-gem-residence.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const names=['gemitems','itemgen'],original=names.map(name=>fs.readFileSync(path.join(reference,'src/engine',name+'.ts'),'utf8').replaceAll('\r\n','\n'));
const directory=fs.mkdtempSync(path.join(root,'.artifacts/gem-residence-overlay-')),results=[];
const success=['original','crlf','local-import','retry'];
for(const scenario of [...success,'changed-gem','changed-item','collision','duplicate','private-extension','second-rename','second-editor','installer-lock']){
 const game=path.join(directory,scenario),files=names.map(name=>path.join(game,'src/engine',name+'.ts'));fs.mkdirSync(path.dirname(files[0]),{recursive:true});
 const source=original.map(text=>text+'\n// Independent host note.\n');
 if(scenario==='local-import')source[0]+='\nimport {keepUnrelated} from "./independent-extension";\n';
 if(scenario==='changed-gem')source[0]=source[0].replace('.slice(0, 3)','.slice(0, 4)');
 if(scenario==='changed-item')source[1]=source[1].replace('bumpItemUidFloor(item.uid);','void 0;');
 if(scenario==='collision')source[0]+='\nconst sdkGemResidence = {};\n';
 if(scenario==='duplicate')source[0]+='\nexport function gemInitials(name: string) { return name; }\n';
 if(scenario==='private-extension')source[0]+='\nexport const ownQuery = packSocketRow;\n';
 if(scenario==='crlf')source.forEach((text,i)=>source[i]=text.replaceAll('\n','\r\n'));
 files.forEach((file,i)=>fs.writeFileSync(file,source[i]));const before=files.map(file=>fs.readFileSync(file)),read=()=>files.map(file=>fs.readFileSync(file));
 const scratch=path.join(game,'.hollow-wake-character-install');if(scenario==='installer-lock'){fs.mkdirSync(scratch);fs.writeFileSync(path.join(scratch,'retain'),'independent');}
 if(['changed-gem','changed-item','collision','duplicate','private-extension'].includes(scenario))assert.throws(()=>integrateGemResidence(game,false));else assert.equal(integrateGemResidence(game,false).files.length,2);
 assert.deepEqual(read(),before);const rename=fs.renameSync,write=fs.writeFileSync;
 if(['second-rename','retry'].includes(scenario))fs.renameSync=(from,...args)=>{if(String(from).endsWith('1.candidate'))throw new Error('Injected destination lock');return rename(from,...args);};
 if(scenario==='second-editor')fs.writeFileSync=(file,...args)=>{const result=write(file,...args);if(String(file).endsWith('1.candidate'))write(files[1],'Independent concurrent edit');return result;};
 try{if(success.includes(scenario)&&scenario!=='retry')integrateGemResidence(game);else assert.throws(()=>integrateGemResidence(game));}
 finally{fs.renameSync=rename;fs.writeFileSync=write;}
 if(scenario==='retry'){assert.deepEqual(read(),before);integrateGemResidence(game);}
 if(success.includes(scenario)){
  const after=read();assert(after.every((bytes,i)=>!bytes.equals(before[i])&&bytes.toString().includes('// Independent host note.')));
  if(scenario==='local-import')assert(after[0].toString().includes('keepUnrelated'));
  if(scenario==='crlf')assert(after.every(bytes=>!/(?<!\r)\n/.test(bytes.toString())));
  assert.throws(()=>integrateGemResidence(game));assert.deepEqual(read(),after);
 }else if(scenario==='second-editor'){assert(fs.readFileSync(files[0]).equals(before[0]));assert.equal(fs.readFileSync(files[1],'utf8'),'Independent concurrent edit');}
 else assert.deepEqual(read(),before);
 if(scenario==='installer-lock')assert.equal(fs.readFileSync(path.join(scratch,'retain'),'utf8'),'independent');else assert(!fs.existsSync(scratch));results.push(scenario);
}
const methods=JSON.parse(fs.readFileSync(path.join(root,'baseline/gem-residence/acceptance.json'))).fixtures.residence.methods;
let guarded=0;
for(const [index,render]of [[0,renderGemResidence],[1,renderItemRestoration]]){
 const ast=ts.createSourceFile('source.ts',original[index],ts.ScriptTarget.Latest,true);
 for(const node of ast.statements){
  const name=ts.isFunctionDeclaration(node)?node.name?.text:ts.isVariableStatement(node)?node.declarationList.declarations[0].name.getText(ast):null;
  if(!methods['engine/'+names[index]+'.ts#'+name]||(index===1&&name!=='rebuildItem'))continue;
  const target=ts.isFunctionDeclaration(node)?node.body:node.declarationList.declarations[0].initializer;assert(target);
  const changed=original[index].slice(0,target.getStart(ast))+(ts.isFunctionDeclaration(node)?'{ void 1;'+target.getText(ast).slice(1):'('+target.getText(ast)+', undefined)')+original[index].slice(target.end);
  assert.throws(()=>render(changed),/Unreviewed/);guarded++;
 }
}
assert.equal(guarded,23);verifyReference(reference,lock);
const report={passed:true,directory,scenarios:results,guarded,adapterSha256:sha256(fs.readFileSync(path.join(root,'adapters/hollow-wake/integrate-gem-residence.mjs')))};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/gem-residence-overlay-latest.json'),report);console.log({passed:true,directory,scenarios:results.length,guarded});
