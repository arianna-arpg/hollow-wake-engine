import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {sha256} from './reference-utils.mjs';
import {renderBodyFactory,integrateBodyFactory} from '../adapters/hollow-wake/integrate-body-factory.mjs';
export function verifyBodyFactoryAdapterGuards(original,work){
 const report={checks:[]};
 const rendered=renderBodyFactory(original,original),expected=rendered;assert.equal(sha256(rendered),"36f24c2935f82d6d379a2256867e46dc32636853a59ed2af68c4f687cc9010c7",'Qualified body-factory binding changed');report.checks.push('binding-matches-qualified-prototype');
 assert.equal(renderBodyFactory(original.replaceAll('\n','\r\n'),original),expected.replaceAll('\n','\r\n'));report.checks.push('crlf-preserved');
 assert.equal(renderBodyFactory('// independent host marker\n'+original,original),rendered.replace("import {BodyFactory as EngineBodyFactory} from '@hollow-wake/engine/bodies/factory';\n","import {BodyFactory as EngineBodyFactory} from '@hollow-wake/engine/bodies/factory';\n// independent host marker\n"));report.checks.push('unrelated-source-preserved');
 const ast=ts.createSourceFile('world.ts',original,ts.ScriptTarget.Latest,true),owner=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert(owner);
 const method=owner.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)==='createMonster');assert(method?.body);
 const replace=(start,end,text)=>original.slice(0,start)+text+original.slice(end);
 const cases=[
  ['changed-body',replace(method.body.getStart(ast),method.body.end,'{ throw Error("changed"); }')],
  ['changed-signature',replace(method.getStart(ast),method.body.getStart(ast),method.getText(ast).slice(0,method.body.getStart(ast)-method.getStart(ast)).replace('level: number','level: string'))],
  ['missing-method',replace(method.getStart(ast),method.end,'')],
  ['duplicate-method',replace(method.end,method.end,'\n'+method.getText(ast))],
  ['bodyless-method',replace(method.body.getStart(ast),method.body.end,';')],
  ['missing-world',original.replace('export class World','export class ChangedWorld')],
  ['duplicate-world',original+'\nclass World {}\n'],
  ['field-collision',replace(owner.members.pos,owner.members.pos,'\n engineBodyFactory=0;\n')],
  ['class-alias-collision','const EngineBodyFactory=1;\n'+original],
  ['module-collision',"import '@hollow-wake/engine/bodies/factory';\n"+original],
  ['malformed-source','} invalid (\n'+original],
  ['already-installed',rendered],
 ];
 for(const[name,text]of cases){assert.throws(()=>renderBodyFactory(text,original),{code:'ERR_ASSERTION'},name);report.checks.push(name);}
 const game=path.join(work,'game'),target=path.join(game,'src/engine/world.ts');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,original);
 integrateBodyFactory(game,false);assert.equal(fs.readFileSync(target,'utf8'),original);assert(!fs.existsSync(path.join(game,'.hollow-wake-character-install')));report.checks.push('preflight-does-not-write');
 integrateBodyFactory(game);assert.equal(fs.readFileSync(target,'utf8'),expected);assert(!fs.existsSync(path.join(game,'.hollow-wake-character-install')));report.checks.push('transactional-installation');
 const before=fs.readFileSync(target);assert.throws(()=>integrateBodyFactory(game),{code:'ERR_ASSERTION'});assert(fs.readFileSync(target).equals(before));report.checks.push('repeat-refusal-does-not-write');
 const changed=cases[0][1];fs.writeFileSync(target,changed);assert.throws(()=>integrateBodyFactory(game),{code:'ERR_ASSERTION'});assert.equal(fs.readFileSync(target,'utf8'),changed);assert(!fs.existsSync(path.join(game,'.hollow-wake-character-install')));report.checks.push('changed-source-refusal-does-not-write');
 report.guards=report.checks.length;assert.equal(report.guards,19);return report;
}
