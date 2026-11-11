import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {sha256} from './reference-utils.mjs';
import {renderSummonBirth,integrateSummonBirth} from '../adapters/hollow-wake/integrate-summon-birth.mjs';
import {renderAuraTick} from '../adapters/hollow-wake/integrate-aura-ticking.mjs';
import {renderAuraActivation} from '../adapters/hollow-wake/integrate-aura-activation.mjs';
import {renderAuraLedgerWorld} from '../adapters/hollow-wake/integrate-aura-ledgers.mjs';
import {renderAuraRetirement} from '../adapters/hollow-wake/integrate-aura-retirement.mjs';
import {renderCompanionRecovery} from '../adapters/hollow-wake/integrate-companion-recovery.mjs';
import {renderBodyLevels} from '../adapters/hollow-wake/integrate-body-levels.mjs';

export function verifySummonAdapterGuards(original,work){
 const report={guards:[]};
function check(name,fn){fn();report.guards.push(name);}
function parse(source){const ast=ts.createSourceFile('world.ts',source,ts.ScriptTarget.Latest,true),owner=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert(owner);return{ast,owner};}
function method(source,name){const {ast,owner}=parse(source),matches=owner.members.filter(n=>ts.isMethodDeclaration(n)&&n.name?.getText(ast)===name);assert.equal(matches.length,1);return{ast,node:matches[0],text:matches[0].getText(ast)};}
function replaceMethod(source,name,fn){const {ast,node,text}=method(source,name),replacement=fn(text,node,ast);assert.notEqual(replacement,text);return source.slice(0,node.getStart(ast))+replacement+source.slice(node.end);}
 const rendered=renderSummonBirth(original,original);report.installedWorldSha256=sha256(rendered);
 check('delegate-birth',()=>assert.equal(method(rendered,'spawnMinion').node.body.getText(),'{ return this.engineSummonBirth.spawn(caster,inst,overrides); }'));
 check('delegate-offspring',()=>assert.equal(method(rendered,'spawnSummonOffspring').node.body.getText(),'{ this.engineSummonOffspring.spawn(parent,act); }'));
 check('remove-roll-helper',()=>assert(!rendered.includes('rollSummonType')));
 check('remove-kit-import',()=>assert(!rendered.includes('summonKitIds')));
 for(const name of ['update','createMonster','minionsOfSkill','minionsOfGroup','kill','activateAura','updateAuras','releaseContract','conjurationLifeline','forwardSummonSockets','bakeMinionOwnerStats','recoverCompanion','reviveCompanion'])check('preserve-'+name,()=>assert.equal(method(rendered,name).text,method(original,name).text));
 const extension='\nexport const unrelatedSummonHostExtension=107;\n';check('preserve-extension',()=>assert(renderSummonBirth(original+extension,original).endsWith(extension)));
 check('preserve-crlf',()=>assert.equal(renderSummonBirth(original.replaceAll('\n','\r\n'),original),rendered.replaceAll('\n','\r\n')));
 for(const[name,render,marker]of [['ticking',renderAuraTick,'this.engineAuraTick.update(dt);'],['activation',renderAuraActivation,'this.engineAuraActivation.activate('],['ledgers',renderAuraLedgerWorld,'this.engineAuraLedgers.update('],['retirement',renderAuraRetirement,'this.engineAuraRetirement.retire('],['recovery',renderCompanionRecovery,'this.engineCompanionRecovery.revive('],['levels',renderBodyLevels,'engineBodyLevels.relevel(']])for(const order of [0,1])check('compose-'+name+'-'+order,()=>{const combined=order?renderSummonBirth(render(original,original),original):render(rendered,original);assert(combined.includes('this.engineSummonBirth.spawn(caster,inst,overrides);')&&combined.includes(marker));});
 for(const name of ['spawnMinion','spawnSummonOffspring','rollSummonType']){
  check('reject-changed-body-'+name,()=>assert.throws(()=>renderSummonBirth(replaceMethod(original,name,(text,node,ast)=>text.slice(0,node.body.getStart(ast)-node.getStart(ast))+'{ throw Error("unreviewed"); }'),original)));
  check('reject-changed-signature-'+name,()=>assert.throws(()=>renderSummonBirth(replaceMethod(original,name,text=>text.replace(name+'(',name+'(unreviewed: number,')),original)));
  check('reject-missing-'+name,()=>assert.throws(()=>renderSummonBirth(replaceMethod(original,name,text=>text.replace(name+'(','renamed'+name+'(')),original)));
  check('reject-duplicate-'+name,()=>{const {owner}=parse(original),changed=original.slice(0,owner.members.pos)+'\n'+method(original,name).text+'\n'+original.slice(owner.members.pos);assert.throws(()=>renderSummonBirth(changed,original));});
 }
 for(const[name,source]of [['duplicate-installation',rendered],['birth-field-collision',original+'\nconst engineSummonBirth=0;'],['birth-type-collision',original+'\nconst EngineSummonBirth=0;'],['offspring-field-collision',original+'\nconst engineSummonOffspring=0;'],['offspring-type-collision',original+'\nconst EngineSummonOffspring=0;'],['duplicate-world',original+'\nclass World {}'],['unremoved-helper-use',original+'\nconst extraHelper=summonKitIds;'],['malformed-world',original+'\nconst broken = ;']])check('reject-'+name,()=>assert.throws(()=>renderSummonBirth(source,original)));
 const {ast}=parse(original),decl=ast.statements.find(n=>ts.isImportDeclaration(n)&&n.importClause?.namedBindings&&ts.isNamedImports(n.importClause.namedBindings)&&n.importClause.namedBindings.elements.some(e=>e.name.text==='summonKitIds'));assert(decl);
 const changeImport=replacement=>original.slice(0,decl.getStart(ast))+replacement+original.slice(decl.end),importText=decl.getText(ast);
 for(const[label,replacement]of [['missing',importText.replace('summonKitIds','renamedKit')],['alias',importText.replace('summonKitIds','wrongKit as summonKitIds')],['module',importText.replace(decl.moduleSpecifier.getText(ast),"'./unreviewed'")],['type-only',importText.replace('import ','import type ')]])check('reject-import-'+label,()=>assert.throws(()=>renderSummonBirth(changeImport(replacement),original)));
 for(const[position,body]of [['first','summonKitIds, extraOne, extraTwo'],['middle','extraOne, summonKitIds, extraTwo'],['last','extraOne, extraTwo, summonKitIds']])check('preserve-grouped-import-'+position,()=>{const grouped=changeImport(importText.replace(/\{[^}]*\}/,'{ '+body+' }')),result=renderSummonBirth(grouped,original);const parsed=ts.createSourceFile('world.ts',result,ts.ScriptTarget.Latest,true);assert.equal(parsed.parseDiagnostics.length,0);assert(result.includes('extraOne')&&result.includes('extraTwo'));assert(!result.includes('summonKitIds'));});
 const fixture=path.join(work,'fixture'),file=path.join(fixture,'src/engine/world.ts');fs.mkdirSync(path.dirname(file),{recursive:true});
 const unchanged=expected=>{assert.equal(fs.readFileSync(file,'utf8'),expected);assert(!fs.existsSync(path.join(fixture,'.hollow-wake-character-install')));};
 fs.writeFileSync(file,original);check('dry-run-no-mutation',()=>{integrateSummonBirth(fixture,false);unchanged(original);});
 const bad=replaceMethod(original,'spawnMinion',text=>text.replace('spawnMinion(','differentSpawn('));fs.writeFileSync(file,bad);check('failed-preflight-no-mutation',()=>{assert.throws(()=>integrateSummonBirth(fixture));unchanged(bad);});
 fs.writeFileSync(file,original);check('installed-exact-source',()=>{integrateSummonBirth(fixture);unchanged(rendered);});
 check('duplicate-install-no-mutation',()=>{assert.throws(()=>integrateSummonBirth(fixture));unchanged(rendered);});
 return {guards:report.guards.length,names:report.guards,installedWorldSha256:report.installedWorldSha256};
}
