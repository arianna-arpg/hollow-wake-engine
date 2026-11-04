import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,writeJSON} from './reference-utils.mjs';
import {integrateVocationSites,renderVocationSites} from '../adapters/hollow-wake/integrate-vocation-sites.mjs';

const src=fs.readFileSync(path.join(root,'.reference/src/engine/world.ts'),'utf8');
const output=renderVocationSites(src);
assert.equal(renderVocationSites(src.replaceAll('\r\n','\n').replaceAll('\n','\r\n')).replaceAll('\r\n','\n'),output.replaceAll('\r\n','\n'));
const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/vocation-sites/acceptance.json')));
const ast=ts.createSourceFile('world.ts',src,ts.ScriptTarget.Latest,true);
const world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
for(const name of Object.keys(accepted.methodHashes)){
  const method=world.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name);
  const pos=method.body.getStart(ast)+1;
  assert.throws(()=>renderVocationSites(src.slice(0,pos)+' void 0;'+src.slice(pos)),/Unreviewed vocation site method/);
}
assert.throws(()=>renderVocationSites(src+'\nvoid bindVocationSites;'),/collision/);
const retained=renderVocationSites(src+'\nvoid VOCATION_CFG;'),retainedAst=ts.createSourceFile('world.ts',retained,ts.ScriptTarget.Latest,true);
const names=retainedAst.statements.find(i=>ts.isImportDeclaration(i)&&i.moduleSpecifier.text==='../data/vocations').importClause.namedBindings;
assert(names.elements.some(n=>n.name.text==='VOCATION_CFG'));
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/vocation-site-overlay-'));
const file=path.join(directory,'src/engine/world.ts'),binding=path.join(path.dirname(file),'vocationSiteAdapter.ts');
fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,src);
integrateVocationSites(directory,false);assert.equal(fs.readFileSync(file,'utf8'),src);assert(!fs.existsSync(binding));
const rename=fs.renameSync;
try{
  fs.renameSync=(from,to)=>{if(to===file)throw Error('injected site installation failure');return rename(from,to);};
  assert.throws(()=>integrateVocationSites(directory),/injected site installation failure/);
}finally{fs.renameSync=rename;}
assert.equal(fs.readFileSync(file,'utf8'),src);assert(!fs.existsSync(binding));
integrateVocationSites(directory);
assert.equal(fs.readFileSync(file,'utf8'),output);
assert(fs.readFileSync(binding).equals(fs.readFileSync(path.join(root,'adapters/hollow-wake/vocationSiteAdapter.ts'))));
assert.throws(()=>integrateVocationSites(directory),/collision/);
assert(!fs.readdirSync(path.dirname(file)).some(f=>f.startsWith('.engine-binding-')));
writeJSON(path.join(directory,'verification.json'),{passed:true,directory,methodGuards:Object.keys(accepted.methodHashes),originalPreflight:true,liveImport:true,rollback:true,retry:true});
console.log({passed:true,directory});
