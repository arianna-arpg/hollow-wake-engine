import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {root,sha256} from './reference-utils.mjs';

const [flag,location,out,...rest]=process.argv.slice(2);
assert(flag==='--location'&&out&&!rest.length&&!fs.existsSync(out),'--location PREPARED_RECEIPT NEW_REPORT');
const loc=JSON.parse(fs.readFileSync(location));assert(loc.skillRackDecision);
assert(fs.readFileSync(path.join(loc.game,'node_modules/@hollow-wake/engine/dist/skill-rack.js')).equals(fs.readFileSync(path.join(root,'dist/skill-rack.js'))));
const file='src/engine/world.ts',bytes=fs.readFileSync(path.join(root,'.reference',file));
assert.equal(sha256(bytes),JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))).files[file]);
const ast=ts.createSourceFile(file,bytes.toString(),ts.ScriptTarget.Latest,true);
const world=ast.statements.find(s=>ts.isClassDeclaration(s)&&s.name?.text==='World');
const methods=world.members.filter(m=>ts.isMethodDeclaration(m)&&['learnSkill','unlearnSkill'].includes(m.name.getText(ast)));
const gifts=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='MIREILLE_GIFT_SKILLS'));
assert.equal(methods.length,2);assert(gifts);
const code=gifts.getText(ast)+'\nclass OriginalRack {\n'+methods.map(m=>m.getText(ast)).join('\n')+'\n}';
const body=fs.readFileSync(path.join(root,'reference/benchmark-skill-rack.ts'),'utf8').replace('// ORIGINAL_RACK_CLASS',()=>code);
const target=path.join(loc.game,'balance','bench-rack-'+randomUUID()+'.ts');
fs.writeFileSync(target,body,{flag:'wx'});
try{execFileSync(process.execPath,['--import','tsx',target,path.resolve(out)],{cwd:loc.game,stdio:'inherit',windowsHide:true});}
finally{if(fs.readFileSync(target,'utf8')===body)fs.unlinkSync(target);}
console.log(JSON.parse(fs.readFileSync(out)).medians);
