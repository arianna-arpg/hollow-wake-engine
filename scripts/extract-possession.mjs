import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {sha256} from './reference-utils.mjs';
const output='src/possession.ts',check=process.argv.includes('--check');
if(!check)assert(!fs.existsSync(output),'Refusing to overwrite maintained possession runtime');
const lock=JSON.parse(fs.readFileSync('baseline/source-lock.json')),sources={};
function read(file){const bytes=fs.readFileSync('.reference/'+file);sources[file]=sha256(bytes);assert.equal(sources[file],lock.files[file]);return ts.createSourceFile(file,bytes.toString(),ts.ScriptTarget.Latest,true);}
const original=read('src/engine/possess.ts'),world=read('src/engine/world.ts'),printer=ts.createPrinter({removeComments:true,newLine:ts.NewLineKind.LineFeed});
const names={possessStructuralWhy:'structuralRefusal',possessRefusal:'refusal',riderRefusal:'riderRefusal',possessPowerFactor:'powerFactor',
  seatEmbody:'embody',seatEject:'eject',possessSeize:'seize',shapeshiftPress:'shift',updatePossessions:'advance'};
const pure=['structuralRefusal','refusal','riderRefusal','powerFactor'],pieces=[];
for(const node of original.statements)if(ts.isFunctionDeclaration(node)&&Object.hasOwn(names,node.name.text))pieces.push(printer.printNode(ts.EmitHint.Unspecified,node,original).replace(/^(export )?function /,''));
const declaration=world.statements.find(node=>ts.isClassDeclaration(node)&&node.name.text==='World');assert(declaration);
for(const node of declaration.members)if(ts.isMethodDeclaration(node)&&Object.hasOwn(names,node.name.getText(world)))pieces.push(printer.printNode(ts.EmitHint.Unspecified,node,world).replace(/^private /,''));
assert.equal(pieces.length,9);let body=pieces.join('\n'),renamed='',cursor=0;
const scanner=ts.createScanner(ts.ScriptTarget.Latest,false,ts.LanguageVariant.Standard,body);
for(let token=scanner.scan();token!==ts.SyntaxKind.EndOfFileToken;token=scanner.scan())if(token===ts.SyntaxKind.Identifier&&Object.hasOwn(names,scanner.getTokenText())){
  renamed+=body.slice(cursor,scanner.getTokenPos())+names[scanner.getTokenText()];cursor=scanner.getTextPos();
}
body=renamed+body.slice(cursor);
for(const name of pure)body=body.replace(new RegExp('(?<![.\\w])'+name+'\\(','g'),'this.'+name+'(').replace(new RegExp('^this\\.'+name+'\\(','gm'),name+'(');
body=body.replaceAll("import('./possess').PossessSpec",'PossessSpec').replaceAll("import('./possess').ShiftSpec",'ShiftSpec')
  .replace(/\bActor\b/g,'A').replace(/\bSkillInstance\b/g,'I').replace(/\bSeat\b/g,'C').replace(/\bPOSSESS_CFG\b/g,'this.rules');
body=body.replaceAll('MONSTERS[target.defId]','this.ports.definition(target.defId)').replaceAll('MONSTERS[shift.form]','this.ports.definition(shift.form)')
  .replaceAll("STATUS_DEFS['stun']","this.ports.status('stun')");
body=body.replace(/this\.actors\b/g,'this.ports.actors()').replace(/this\.seats\b/g,'this.ports.controllers()').replace(/this\.time\b/g,'this.ports.time()');
for(const [from,to]of Object.entries({seatOf:'controllerFor',indexSeats:'reindex',clampPos:'clamp',markMetaDirty:'changed',hivecallReturn:'returnSwarmForm',createMonster:'createBody',text:'text',failNote:'fail'}))body=body.replaceAll('this.'+from+'(','this.ports.'+to+'(');
body=body.replaceAll('this.flashes.push(','this.ports.flash(').replaceAll("this.events.emit('possess/embody',",'this.ports.embodied(').replaceAll("this.events.emit('possess/eject',",'this.ports.ejected(')
  .replace(/\bskillContextTags\(/g,'this.ports.tags(').replace(/\bgrantedTags\(/g,'this.ports.grantedTags(').replace(/\binstanceMods\(/g,'this.ports.modifiers(');
assert(!/\bWorld\b|\bActor\b|MONSTERS|STATUS_DEFS|markMetaDirty|this\.events/.test(body));
const emitted=`import type {PossessionActor,PossessionSkill,PossessionPoint,PossessionController,PossessionRules,PossessionPorts,PossessSpec,ShiftSpec,PossessRide,EjectReason} from './possession-types.js';
import type {Modifier} from './types.js';
export type * from './possession-types.js';
const vec=(x:number,y:number):PossessionPoint=>({x,y});
const mod=(stat:string,kind:Modifier['kind'],value:number):Modifier=>({stat,kind,value});
/** Transient controller/body ownership for possession and shapeshifting. The
 * host owns controller indices and body allocation; the SDK owns restoration,
 * interruption, expiry, cooldown and guest-skill rules. No account or save
 * coordinator participates. Ordered callbacks retain original prefix writes. */
export class Possessions<A extends PossessionActor<I>,I extends PossessionSkill,C extends PossessionController<A>>{
  constructor(readonly rules:PossessionRules,readonly ports:PossessionPorts<A,I,C>){}
${body}
}
`;
if(check){assert.equal(sha256(fs.readFileSync(output,'utf8').replaceAll('\r\n','\n')),sha256(emitted),'Maintained possession source differs from extraction');console.log({passed:true,mechanicalMethods:9});}
else{
  fs.writeFileSync(output,emitted);
  fs.writeFileSync('baseline/possession-extraction.json',JSON.stringify({sourceCommit:lock.commit,sources,maintainedSource:output,sha256:sha256(emitted),methods:Object.values(names),
    boundaryChanges:['Metadata dirtiness becomes host view-change callback','World event bus becomes ordered combat signals','Body providers and controller indices are explicit host services']},null,2)+'\n');
}
