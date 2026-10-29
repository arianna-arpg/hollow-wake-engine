import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
const boundary=JSON.parse(fs.readFileSync(path.join(root,'adapters/hollow-wake/damage-boundary.json')));
export const damageDecision='Delegate the shared outgoing roll/preview, hit/DoT ladder, absorption clocks and incoming conversion; host supplies skill compilation, actor services and presentation';
export function renderDamageFile(file,source){
  const input=source.replaceAll('\r\n','\n'),entry=boundary.files[file];assert(entry,'Unknown damage boundary');
  assert.equal(sha256(input),entry.sha256,'Unreviewed damage source: '+file);
  let output;
  if(entry.adapter)output=fs.readFileSync(path.join(root,entry.adapter),'utf8').replaceAll('\r\n','\n');
  else{
    const ast=ts.createSourceFile(file,input,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0);
    const matches=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='receiveDamageAs');assert.equal(matches.length,1);
    const fn=matches[0];output="import {damagePipeline} from './damagePipeline';\n"+input.slice(0,fn.body.getStart(ast))+'{ return damagePipeline.receiveDamageAs(target, amounts); }'+input.slice(fn.body.end);
  }
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateDamagePipeline(game,write=true){
  const binding='src/engine/damagePipeline.ts';assert(!fs.existsSync(path.join(game,binding)),'Damage binding already exists');
  const edits=Object.keys(boundary.files).map(file=>({file,output:renderDamageFile(file,fs.readFileSync(path.join(game,file),'utf8'))}));
  // Configuration was copied from this exact original. Reject upstream changes.
  for(const[file,hash] of Object.entries(boundary.configuration))assert.equal(sha256(fs.readFileSync(path.join(game,file),'utf8').replaceAll('\r\n','\n')),hash,'Unreviewed damage configuration: '+file);
  edits.push({file:binding,output:fs.readFileSync(path.join(root,'adapters/hollow-wake/damage-pipeline.ts'),'utf8')});
  if(write)for(const e of edits)fs.writeFileSync(path.join(game,e.file),e.output);
  return {files:edits.map(e=>e.file),decision:damageDecision};
}
