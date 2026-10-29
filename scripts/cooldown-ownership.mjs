import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {root,listFiles,sha256,verifyReference,writeJSON} from './reference-utils.mjs';

/** Inventory explicit uses of the two named ledgers, including quoted keys.
 * This is a source ownership inventory, not an alias/dataflow proof. */
export function inspectCooldownOwnership(game) {
  const directory=path.join(game,'src');
  const snapshot=()=>Object.fromEntries(listFiles(directory).map(file=>[file,sha256(fs.readFileSync(path.join(directory,file)))]));
  const source=snapshot(),rows=[];
  for(const file of Object.keys(source).filter(f=>f.endsWith('.ts'))){
    const text=fs.readFileSync(path.join(directory,file),'utf8');
    if(!/cooldowns|cooldownTotals/.test(text))continue;
    const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
    assert.equal(ast.parseDiagnostics.length,0);
    const visit=node=>{
      if((ts.isIdentifier(node)||ts.isStringLiteral(node))&&['cooldowns','cooldownTotals'].includes(node.text)){
        let access=node,operation='declaration-or-key';
        if((ts.isPropertyAccessExpression(node.parent)&&node.parent.name===node)
          ||(ts.isElementAccessExpression(node.parent)&&node.parent.argumentExpression===node)){
          access=node.parent;operation='borrow';
        }
        if(access!==node&&ts.isPropertyAccessExpression(access.parent)){
          operation=access.parent.name.text;
          if(!ts.isCallExpression(access.parent.parent))operation='member:'+operation;
        }else if(access!==node&&ts.isForOfStatement(access.parent))operation='iterate';
        else if(access!==node&&ts.isSpreadElement(access.parent))operation='snapshot-or-spread';
        else if(access!==node&&ts.isBinaryExpression(access.parent)&&access.parent.left===access)
          operation='assignment:'+access.parent.operatorToken.getText(ast);
        let owner='<top-level>',className='',statement=access;
        for(let parent=access.parent;parent;parent=parent.parent){
          if(statement===access&&(ts.isExpressionStatement(parent)||ts.isVariableStatement(parent)
            ||ts.isReturnStatement(parent)||ts.isPropertyDeclaration(parent)))statement=parent;
          if(owner==='<top-level>'&&(ts.isMethodDeclaration(parent)||ts.isFunctionDeclaration(parent)))owner=parent.name?.getText(ast)??'<anonymous>';
          if(ts.isClassDeclaration(parent))className=parent.name?.text??'<anonymous-class>';
        }
        rows.push({file,line:ast.getLineAndCharacterOfPosition(access.getStart(ast)).line+1,field:node.text,
          operation,owner:className?className+'.'+owner:owner,expression:access.getText(ast),statement:statement.getText(ast),sourceSha256:source[file]});
      }
      ts.forEachChild(node,visit);
    };
    visit(ast);
  }
  assert.deepEqual(snapshot(),source);
  return {sourceMapSha256:sha256(JSON.stringify(source)),files:Object.keys(source).length,rows};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);assert(args.length===0||(args.length===2&&args[0]==='--game'));
  const game=path.resolve(root,args[1]??'.reference');
  if(!args.length)verifyReference(game,JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))));
  const report=inspectCooldownOwnership(game),output=fs.mkdtempSync(path.join(root,'.artifacts/clock-ownership-'));
  writeJSON(path.join(output,'inventory.json'),report);
  console.log({output,references:report.rows.length,directWrites:report.rows.filter(r=>['set','delete','clear'].includes(r.operation)).length});
}
