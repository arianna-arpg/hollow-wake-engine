import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
const boundary=JSON.parse(fs.readFileSync(path.join(root,'baseline/stat-context/source-boundary.json')));
const importText="import {TagContextCache} from '@hollow-wake/engine/stats/context-cache';\n";
const field='\n  private engineStatContextKeys: TagContextCache<string> | undefined;\n';
const replacement="(this.engineStatContextKeys ??= new TagContextCache(tags => tags.join(','))).get(contextTags)";
export const statContextDecision='Reuse bounded canonical tag-context encodings while preserving live membership, the original cache key and numeric stat folding';
export function renderStatContext(source){
  const input=source.replaceAll('\r\n','\n');assert(!/\b(?:TagContextCache|engineStatContextKeys)\b/.test(input),'Stat context binding collision');
  const ast=ts.createSourceFile('stats.ts',input,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0);
  const sheets=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='StatSheet');assert.equal(sheets.length,1);const sheet=sheets[0];
  assert.equal(sha256(sheet.getText(ast)),boundary.classSha256,'Unreviewed StatSheet boundary');
  assert.equal(input.split(boundary.keyExpression).length-1,1);
  let output=input.slice(0,sheet.members.pos)+field+input.slice(sheet.members.pos);output=importText+output.replace(boundary.keyExpression,replacement);
  assert.equal(output.replace(importText,'').replace(field,'').replace(replacement,boundary.keyExpression),input,'Unexpected stat edits');
  assert.equal(ts.createSourceFile('stats.ts',output,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateStatContext(game,write=true){
  const target='src/engine/stats.ts',file=path.join(game,target),output=renderStatContext(fs.readFileSync(file,'utf8'));
  if(write)fs.writeFileSync(file,output);
  return {files:[target],decision:statContextDecision};
}
