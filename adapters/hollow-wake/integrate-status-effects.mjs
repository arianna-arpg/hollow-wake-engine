import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {statusEffectsTree} from './status-effects-tree.mjs';
const boundary=JSON.parse(fs.readFileSync(path.join(root,'adapters/hollow-wake/status-effects-boundary.json')));
export const statusEffectsDecision='Delegate status verbs, proc status application, periodic effects and distinct expiry/death phases; retain native hit occurrence, geometry, shared damage, attribution and presentation ports';
export function renderStatusVoiceProbe(source){
  const input=source.replaceAll('\r\n','\n');assert.equal(sha256(input),boundary.statusVoiceProbeSha256,'Unreviewed status voice probe');
  const needle="const src = readFileSync('src/engine/world.ts', 'utf8');";assert.equal(input.split(needle).length-1,1);
  // Preserve every assertion; follow the two moved captions into the installed
  // implementation instead of leaving the census pointed at a removed body.
  const output=input.replace(needle,"const src = readFileSync('src/engine/world.ts', 'utf8') + '\\n' + readFileSync(new URL(import.meta.resolve('@hollow-wake/engine/statuses/effects')), 'utf8');");
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function renderStatusEffects(source){
  const {input,ast,world,methods,phases}=statusEffectsTree(source);assert(!/\b(?:engineStatusEffects|bindStatusEffects)\b/.test(input),'Status effects binding collision');
  for(const [name,node]of Object.entries({...methods,...phases}))assert.equal(sha256(node.getText(ast)),boundary.fingerprints[name],'Unreviewed status effect source: '+name);
  const args={transplantStatus:'to, s, sourceName, o',cleanseActor:'target, count',ringAfflictions:'target, portion',shedStatusStack:'a, st',ruptureBank:'caster, victim, statusId, fraction, mul, tags, extra',ruptureStatus:'victim, s',assaultDoomCull:'target'};
  const edits=Object.entries(methods).map(([name,n])=>({start:n.body.getStart(ast),end:n.body.end,text:'{ return this.engineStatusEffects.'+name+'('+args[name]+'); }'}));
  // The diagnostic/compatibility shim has no remaining in-class caller. Its
  // TypeScript visibility changes only; its runtime name and behavior remain.
  const privateModifier=methods.ruptureStatus.modifiers.find(n=>n.kind===ts.SyntaxKind.PrivateKeyword);assert(privateModifier);
  edits.push({start:privateModifier.getStart(ast),end:privateModifier.end,text:''});
  const statements={expired:'this.engineStatusEffects.expireStatuses(a);',zap:'this.engineStatusEffects.zapStatuses(a);',lash:'this.engineStatusEffects.lashStatuses(a);',capture:'const propagatingAfflictions = this.engineStatusEffects.capturePropagation(actor, silent);',detonate:'this.engineStatusEffects.detonateDeathStatuses(actor, silent);',spread:'this.engineStatusEffects.propagateDeathStatuses(actor, propagatingAfflictions, silent);',proc:"case 'status': { this.engineStatusEffects.applyProcStatus(fx, proc.name, caster, inst, target); break; }"};
  for(const [name,n]of Object.entries(phases))edits.push({start:n.getStart(ast),end:n.end,text:statements[name]});
  edits.push({start:world.members.pos,end:world.members.pos,text:'\n  private readonly engineStatusEffects = bindStatusEffects(this);\n'});
  let output=input;for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
  output="import {bindStatusEffects} from './statusEffects';\n"+output;
  const parsed=ts.createSourceFile('world.ts',output,ts.ScriptTarget.Latest,true);assert.equal(parsed.parseDiagnostics.length,0,'Invalid status effect output');
  const retired=new Set(['bankFracOf','statusRuptureRadius','armedCueProfile','armedCueStyle']),counts=new Map();
  const visit=n=>{if(ts.isIdentifier(n)&&retired.has(n.text))counts.set(n.text,(counts.get(n.text)??0)+1);ts.forEachChild(n,visit);};visit(parsed);
  const prune=[];for(const n of parsed.statements){if(!ts.isImportDeclaration(n))continue;const names=n.importClause?.namedBindings;if(!names||!ts.isNamedImports(names))continue;const keep=names.elements.filter(e=>!retired.has(e.name.text)||counts.get(e.name.text)!==1);if(keep.length===names.elements.length)continue;
    if(!keep.length){assert(!n.importClause.name);prune.push({start:n.getStart(parsed),end:n.end,text:''});}
    else prune.push({start:names.getStart(parsed),end:names.end,text:'{ '+keep.map(e=>e.getText(parsed)).join(', ')+' }'});
  }
  for(const e of prune.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateStatusEffects(game,write=true){
  const binding='src/engine/statusEffects.ts';assert(!fs.existsSync(path.join(game,binding)),'Status effects binding already exists');
  const output=renderStatusEffects(fs.readFileSync(path.join(game,'src/engine/world.ts'),'utf8'));
  const probe='balance/probe_statusvoice.ts',probeOutput=renderStatusVoiceProbe(fs.readFileSync(path.join(game,probe),'utf8'));
  const adapter=fs.readFileSync(path.join(root,'adapters/hollow-wake/statusEffects.ts'),'utf8');
  if(write){fs.writeFileSync(path.join(game,'src/engine/world.ts'),output);fs.writeFileSync(path.join(game,probe),probeOutput);fs.writeFileSync(path.join(game,binding),adapter,{flag:'wx'});}
  return {files:['src/engine/world.ts',binding,probe],decision:statusEffectsDecision};
}
