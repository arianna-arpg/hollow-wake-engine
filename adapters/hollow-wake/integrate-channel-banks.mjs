import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';

export const bankPaths={world:'src/engine/world.ts',actor:'src/engine/actor.ts',channel:'src/engine/channelCastingAdapter.ts',binding:'src/engine/channelBankAdapter.ts'};
const lf=source=>source.replaceAll('\r\n','\n');
const acceptance=()=>JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-thirty-six/acceptance.json')));
export function bankTree(source,file,className){
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0,'Invalid bank source: '+file);
 const classes=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text===className);assert.equal(classes.length,1);
 return {ast,type:classes[0]};
}
function guardedMethod(tree,name,file){
 const found=tree.type.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(tree.ast)===name);assert.equal(found.length,1);
 const method=found[0],row=acceptance().sourceBoundary.find(r=>r.kind==='retained'&&r.file===file&&r.name===name);assert(row);
 assert.equal(sha256(method.getText(tree.ast)),row.sha256,'Unreviewed bank/gauge method: '+name);return method;
}
function apply(source,edits){let result=source;for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);return result;}
function importEdit(ast,text){const node=ast.statements.filter(ts.isImportDeclaration).at(-1);assert(node);return {start:node.end,end:node.end,text:'\n'+text};}
export function renderBankWorld(source){
 const input=lf(source);assert(!/\bchannelBanks\b/.test(input),'Banks already integrated or binding collision');
 const tree=bankTree(input,bankPaths.world,'World'),method=guardedMethod(tree,'update',bankPaths.world),found=[];
 const visit=node=>{if(ts.isIfStatement(node)&&node.expression.getText(tree.ast)==='a.brims?.size')found.push(node);ts.forEachChild(node,visit);};visit(method);assert.equal(found.length,1);
 const target=found[0],row=acceptance().sourceBoundary.find(r=>r.kind==='retained'&&r.name==='update');assert.equal(sha256(target.getText(tree.ast)),row.decay.sha256);
 const output=apply(input,[{start:target.getStart(tree.ast),end:target.end,text:'channelBanks.decay(a, dt);'},importEdit(tree.ast,"import {channelBanks} from './channelBankAdapter';")]);
 bankTree(output,bankPaths.world,'World');return output;
}
export function renderGaugeActor(source){
 const input=lf(source);assert(!/\b(?:sdkActorGauges|ActorGaugePublisher)\b/.test(input),'Gauges already integrated or binding collision');
 const tree=bankTree(input,bankPaths.actor,'Actor'),method=guardedMethod(tree,'refreshConditions',bankPaths.actor);
 const row=acceptance().sourceBoundary.find(r=>r.kind==='retained'&&r.name==='refreshConditions'),parts=[...method.body.statements].slice(row.publication.startStatement,row.publication.startStatement+row.publication.statements);
 assert.equal(sha256(parts.map(n=>n.getText(tree.ast)).join('\n')),row.publication.sha256);
 const oldFields=['gaugeHashA','gaugeHashB'].map(name=>{const matches=tree.type.members.filter(n=>ts.isPropertyDeclaration(n)&&n.name.getText(tree.ast)===name);assert.equal(matches.length,1);assert.equal(matches[0].initializer?.getText(tree.ast),'-1');return matches[0];});
 const edits=[{start:parts[0].getFullStart(),end:parts.at(-1).end,text:'\n\n    // Sample at the original phase; decay remains later in World.update.\n    this.sdkActorGauges.refresh(this, this.sheet);'},
  {start:oldFields[0].getFullStart(),end:oldFields[0].end,text:'\n  private readonly sdkActorGauges = new ActorGaugePublisher();'},
  {start:oldFields[1].getFullStart(),end:oldFields[1].end,text:''},
  importEdit(tree.ast,"import {ActorGaugePublisher} from '@hollow-wake/engine/stats/gauges';")];
 const output=apply(input,edits);assert(!/\bgaugeHash[AB]\b/.test(output),'Unreviewed gauge fingerprint reference');bankTree(output,bankPaths.actor,'Actor');return output;
}
export function renderBankChannel(source){
 const input=lf(source);assert(!/\bchannelBanks\b/.test(input),'Channel banks already integrated or binding collision');
 const row=acceptance().sourceBoundary.find(r=>r.kind==='retained'&&r.file===bankPaths.channel);assert.equal(sha256(input),row.fileSha256,'Unreviewed channel bank binding');
 const ast=ts.createSourceFile(bankPaths.channel,input,ts.ScriptTarget.Latest,true),properties={brim:[],releaseBrim:[]};
 const visit=node=>{if(ts.isPropertyAssignment(node)&&Object.hasOwn(properties,node.name.getText(ast)))properties[node.name.getText(ast)].push(node);ts.forEachChild(node,visit);};visit(ast);
 const edits=[importEdit(ast,"import {channelBanks} from './channelBankAdapter';")];
 for(const [name,body]of [['brim','(actor, state, spec) => channelBanks.bind(actor, state.inst, spec)'],['releaseBrim','(actor, state) => channelBanks.lookup(actor, state.inst)']]){
  assert.equal(properties[name].length,1);const node=properties[name][0];edits.push({start:node.getStart(ast),end:node.end,text:name+': '+body});
 }
 return apply(input,edits);
}
/** Validate every input and collision before writing any of the four files. */
export function integrateChannelBanks(game,write=true){
 const transforms=[[bankPaths.world,renderBankWorld],[bankPaths.actor,renderGaugeActor],[bankPaths.channel,renderBankChannel]];
 const outputs=transforms.map(([file,render])=>{const source=fs.readFileSync(path.join(game,file),'utf8');return {file,text:render(source).replaceAll('\n',source.includes('\r\n')?'\r\n':'\n')};});
 const binding=path.join(game,bankPaths.binding);assert(!fs.existsSync(binding),'Bank binding already exists');
 outputs.push({file:bankPaths.binding,text:fs.readFileSync(path.join(root,'adapters/hollow-wake/channelBankAdapter.ts'),'utf8')});
 if(write)for(const output of outputs)fs.writeFileSync(path.join(game,output.file),output.text);
 return {files:outputs.map(row=>row.file),intentionalGaugeRepair:'gauge-namespace-refresh/v1'};
}
