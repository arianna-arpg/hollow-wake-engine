import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256,writeJSON,verifyReference} from './reference-utils.mjs';
import {integrateCrafting,renderCraftingPolicy,renderCraftingWorld} from '../adapters/hollow-wake/integrate-crafting.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const original=['crafting','world'].map(name=>fs.readFileSync(path.join(reference,'src/engine',name+'.ts'),'utf8').replaceAll('\r\n','\n'));
const directory=fs.mkdtempSync(path.join(root,'.artifacts/crafting-overlay-')),results=[];
const success=['original','crlf','local-import','retry'];
for(const scenario of [...success,'changed-policy','changed-world','collision','duplicate','private-extension','second-rename','second-editor','installer-lock']){
 const game=path.join(directory,scenario),files=['crafting','world'].map(name=>path.join(game,'src/engine',name+'.ts'));fs.mkdirSync(path.dirname(files[0]),{recursive:true});
 const source=original.map(text=>text+'\n// Independent host note.\n');
 if(scenario==='local-import')source[1]+='\nimport {keepUnrelated} from "./independent-extension";\n';
 if(scenario==='changed-policy')source[0]=source[0].replace('skillLift: 0.85','skillLift: 0.86');
 if(scenario==='changed-world')source[1]=source[1].replace('if (item.locked) { this.lockedRefusal(seat); return; }','if (item.locked) { return; }');
 if(scenario==='collision')source[1]+='\nconst sdkCrafting = {};\n';
 if(scenario==='duplicate')source[0]+='\nexport function craftedCount() { return 0; }\n';
 if(scenario==='private-extension')source[0]+='\nexport const ownQuery = normalTiers;\n';
 if(scenario==='crlf')source.forEach((text,i)=>source[i]=text.replaceAll('\n','\r\n'));
 files.forEach((file,i)=>fs.writeFileSync(file,source[i]));const before=files.map(file=>fs.readFileSync(file)),read=()=>files.map(file=>fs.readFileSync(file));
 const scratch=path.join(game,'.hollow-wake-character-install');if(scenario==='installer-lock'){fs.mkdirSync(scratch);fs.writeFileSync(path.join(scratch,'retain'),'independent');}
 if(['changed-policy','changed-world','collision','duplicate','private-extension'].includes(scenario))assert.throws(()=>integrateCrafting(game,false));else assert.equal(integrateCrafting(game,false).files.length,2);
 assert.deepEqual(read(),before);const rename=fs.renameSync,write=fs.writeFileSync;
 if(['second-rename','retry'].includes(scenario))fs.renameSync=(from,...args)=>{if(String(from).endsWith('1.candidate'))throw new Error('Injected destination lock');return rename(from,...args);};
 if(scenario==='second-editor')fs.writeFileSync=(file,...args)=>{const result=write(file,...args);if(String(file).endsWith('1.candidate'))write(files[1],'Independent concurrent edit');return result;};
 try{if(success.includes(scenario)&&scenario!=='retry')integrateCrafting(game);else assert.throws(()=>integrateCrafting(game));}
 finally{fs.renameSync=rename;fs.writeFileSync=write;}
 if(scenario==='retry'){assert.deepEqual(read(),before);integrateCrafting(game);}
 if(success.includes(scenario)){
  const after=read();assert(after.every((bytes,i)=>!bytes.equals(before[i])&&bytes.toString().includes('// Independent host note.')));
  if(scenario==='local-import')assert(after[1].toString().includes('keepUnrelated'));
  if(scenario==='crlf')assert(after.every(bytes=>!/(?<!\r)\n/.test(bytes.toString())));
  assert.throws(()=>integrateCrafting(game));assert.deepEqual(read(),after);
 }else if(scenario==='second-editor'){assert(fs.readFileSync(files[0]).equals(before[0]));assert.equal(fs.readFileSync(files[1],'utf8'),'Independent concurrent edit');}
 else assert.deepEqual(read(),before);
 if(scenario==='installer-lock')assert.equal(fs.readFileSync(path.join(scratch,'retain'),'utf8'),'independent');else assert(!fs.existsSync(scratch));results.push(scenario);
}
let guarded=0;
for(const [index,render]of [[0,renderCraftingPolicy],[1,renderCraftingWorld]]){
 const ast=ts.createSourceFile('source.ts',original[index],ts.ScriptTarget.Latest,true),world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
 const names=JSON.parse(fs.readFileSync(path.join(root,'baseline/crafting/acceptance.json'))).fixtures[index===0?'policy':'actions'].methods;
 const nodes=index===0?ast.statements.filter(ts.isFunctionDeclaration):world.members.filter(ts.isMethodDeclaration);
 for(const node of nodes){const name=node.name.getText(ast),key='engine/'+(index===0?'crafting':'world')+'.ts#'+name;
  if(!names[key]||['spendEssence','grantEssence'].includes(name))continue;
  const at=node.body.getStart(ast)+1;assert.throws(()=>render(original[index].slice(0,at)+' void 1;'+original[index].slice(at)),/Unreviewed/);guarded++;
 }
}
verifyReference(reference,lock);const report={passed:true,directory,scenarios:results,guarded,adapterSha256:sha256(fs.readFileSync(path.join(root,'adapters/hollow-wake/integrate-crafting.mjs')))};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/crafting-overlay-latest.json'),report);console.log(report);
