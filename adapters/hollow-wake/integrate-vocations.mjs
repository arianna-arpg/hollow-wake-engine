import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installWorldBinding} from './install-world-binding.mjs';

const boundary = JSON.parse(fs.readFileSync(path.join(root,'baseline/vocation-progression/acceptance.json')));

export function renderVocationGrant(source) {
  const input = source.replaceAll('\r\n','\n');
  const ast = ts.createSourceFile('world.ts',input,ts.ScriptTarget.Latest,true);
  const world = ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='World');
  const method = world?.members.find(member=>ts.isMethodDeclaration(member)&&member.name.getText(ast)==='grantVocation');
  assert(method?.body && sha256(method.getText(ast))===boundary.methods.grantVocation.sha256,'Unreviewed vocation grant');
  assert(!/\b(engineGrantVocation|engineVocationGrants|bindVocationGrants)\b/.test(input),'Vocation binding collision');
  const imports = ast.statements.filter(ts.isImportDeclaration), body = method.body;
  const edits = [
    [body.getStart(ast),body.end,'{\n    return engineGrantVocation(vocId, seat, this.engineVocationGrants);\n  }'],
    [method.getStart(ast),method.getStart(ast),'private readonly engineVocationGrants = bindVocationGrants(this);\n  '],
    [imports.at(-1).end,imports.at(-1).end,"\nimport {grantVocation as engineGrantVocation} from '@hollow-wake/engine/progression/vocations';\nimport {bindVocationGrants} from './vocationGrantAdapter';"],
  ];
  const definitionImport = imports.find(i=>i.moduleSpecifier.text==='../data/vocations');
  const names = definitionImport?.importClause?.namedBindings;
  assert(names && ts.isNamedImports(names) && names.elements.some(n=>n.name.text==='vocationRootId'),'Missing vocation root import');
  const withoutBody = input.slice(0,body.getStart(ast))+input.slice(body.end);
  if((withoutBody.match(/\bvocationRootId\b/g)??[]).length===1){
    edits.push([names.getStart(ast),names.end,'{'+names.elements.filter(n=>n.name.text!=='vocationRootId').map(n=>n.getText(ast)).join(', ')+'}']);
  }
  let result=input;
  for(const [start,end,value] of edits.sort((a,b)=>b[0]-a[0]))result=result.slice(0,start)+value+result.slice(end);
  return source.includes('\r\n')?result.replaceAll('\n','\r\n'):result;
}

/** All inputs are checked before installation. Publish the two existing entry
 * points by same-directory rename. On World failure restore only our own quest
 * file. The caller always installs in a dedicated, disposable game checkout. */
export function integrateVocations(game,install=true) {
  const world=path.join(game,'src/engine/world.ts'),quest=path.join(game,'src/quests/vocations.ts');
  const canonicalGame=fs.realpathSync(game);
  for(const file of [world,quest]){
    const relative=path.relative(canonicalGame,fs.realpathSync(file));
    assert(relative&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)&&fs.lstatSync(file).isFile(),'Vocation source outside selected game');
  }
  const source=fs.readFileSync(world,'utf8'),expected=fs.readFileSync(quest);
  assert.equal(sha256(expected),boundary.sources['quests/vocations.ts'],'Unreviewed vocation quest generator');
  const replacement=renderVocationGrant(source);
  const target=path.join(path.dirname(world),'vocationGrantAdapter.ts');
  assert(!fs.existsSync(target),'Vocation binding already exists');
  const files=['src/engine/world.ts','src/engine/vocationGrantAdapter.ts','src/quests/vocations.ts'];
  const result={files,decision:'vocation quest gates and character grants'};
  if(!install)return result;

  const directory=path.join(root,'adapters/hollow-wake'),binding=fs.readFileSync(path.join(directory,'vocationGrantAdapter.ts'),'utf8');
  const quests=fs.readFileSync(path.join(directory,'vocationQuests.ts'));
  const scratch=fs.mkdtempSync(path.join(path.dirname(quest),'.engine-vocation-'));
  const draft=path.join(scratch,'candidate'),backup=path.join(scratch,'previous');
  let published, keepBackup=false;
  try{
    const options={flag:'wx',mode:fs.statSync(quest).mode};
    fs.writeFileSync(draft,quests,options);
    fs.writeFileSync(backup,expected,options);
    assert(fs.readFileSync(quest).equals(expected),'Quest source changed before installation');
    const identity=fs.statSync(draft,{bigint:true});
    fs.renameSync(draft,quest);published=identity;
    installWorldBinding(game,world,source,replacement,target,binding);
    published=undefined;
  }finally{
    try{
      if(published){
        const current=fs.lstatSync(quest,{bigint:true,throwIfNoEntry:false});
        if(current?.dev===published.dev && current.ino===published.ino && fs.readFileSync(quest).equals(quests)) {
          // A locked destination can prevent the restoring rename on Windows.
          // Retain the exact original and identify it to the caller for recovery.
          try {fs.renameSync(backup,quest);}
          catch(cause){keepBackup=true;throw new Error('Could not restore the vocation source. Original retained at '+backup,{cause});}
        }
      }
    }finally{
      fs.rmSync(draft,{force:true});
      if(!keepBackup){fs.rmSync(backup,{force:true});fs.rmdirSync(scratch);}
    }
  }
  return result;
}
