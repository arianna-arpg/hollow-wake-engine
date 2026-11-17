import {checkMaintainedExtraction} from './check-maintained-extraction.mjs';
// One-time mechanical extraction. Maintained source is never overwritten.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {sha256} from './reference-utils.mjs';
const output='src/grab.ts',check=process.argv.includes('--check');
if(!check)assert(!fs.existsSync(output),'Refusing to overwrite maintained grab runtime');
const lock=JSON.parse(fs.readFileSync('baseline/source-lock.json'));
const sources={};
function read(file){const bytes=fs.readFileSync('.reference/'+file);sources[file]=sha256(bytes);assert.equal(sources[file],lock.files[file]);return ts.createSourceFile(file,bytes.toString(),ts.ScriptTarget.Latest,true);}
const original=read('src/engine/grab.ts'),world=read('src/engine/world.ts'),printer=ts.createPrinter({removeComments:true,newLine:ts.NewLineKind.LineFeed});
const names={grabPolicyOf:'policy',grabRefusal:'refusal',grabSeatPos:'seat',struggleRate:'struggleRate',grabHoldBounds:'bounds',grabHolderMove:'moveFactor',
  updateGrabs:'advance',grabRelease:'release',grabSpitDir:'spitDirection',grabHandoff:'handoff',grabThrowRelease:'throw',grabSeize:'seize'};
const pieces=[];
for(const node of original.statements)if(ts.isFunctionDeclaration(node)&&names[node.name.text]){
  let text=printer.printNode(ts.EmitHint.Unspecified,node,original).replace(/^export function /,'');
  pieces.push(text);
}
const declaration=world.statements.find(node=>ts.isClassDeclaration(node)&&node.name.text==='World');assert(declaration);
for(const node of declaration.members)if(ts.isMethodDeclaration(node)&&names[node.name.getText(world)])pieces.push(printer.printNode(ts.EmitHint.Unspecified,node,world).replace(/^private /,''));
assert.equal(pieces.length,12);
let body=pieces.join('\n');
// Rename code identifiers only; an effect discriminator can share a method
// name and must keep its authored string value.
const scanner=ts.createScanner(ts.ScriptTarget.Latest,false,ts.LanguageVariant.Standard,body);
let renamed='',cursor=0;
for(let token=scanner.scan();token!==ts.SyntaxKind.EndOfFileToken;token=scanner.scan())if(token===ts.SyntaxKind.Identifier&&Object.hasOwn(names,scanner.getTokenText())){
  renamed+=body.slice(cursor,scanner.getTokenPos())+names[scanner.getTokenText()];cursor=scanner.getTextPos();
}
body=renamed+body.slice(cursor);
for(const [from,to]of Object.entries(names)){
  // Pure helpers become instance calls; declarations stay bare.
  if(['grabPolicyOf','grabRefusal','grabSeatPos','struggleRate','grabHoldBounds','grabHolderMove'].includes(from))
    body=body.replace(new RegExp('(?<![.\\w])'+to+'\\(','g'),'this.'+to+'(').replace(new RegExp('^this\\.'+to+'\\(','gm'),to+'(');
}
body=body.replace(/\bActor\b/g,'A').replace(/\bSkillInstance\b/g,'I').replace(/\bVec2\b/g,'GrabPoint');
body=body.replace(/\bGRAB_CFG\b/g,'this.rules').replace(/\bGRAB_MARKER\b/g,'this.rules.markers').replace(/\bGRAB_VERB_LABEL\b/g,'this.rules.labels').replace(/DAMAGE_COLOR\.physical/g,'this.rules.physicalColor');
body=body.replace(/this\.actors\b/g,'this.ports.actors()').replace(/this\.time\b/g,'this.ports.time()').replace(/this\.player\b/g,'this.ports.localActor()');
for(const [from,to]of Object.entries({actorById:'actorById',enemiesOf:'enemies',clampPos:'clamp',hostileTo:'hostileTo',lineOfSight:'lineOfSight',clingRelease:'unclasp',
  kill:'kill',resolveHit:'hit',pushActor:'push',text:'text',failNote:'fail',recordIndirectDamage:'damaged'}))body=body.replaceAll('this.'+from+'(','this.ports.'+to+'(');
body=body.replaceAll('this.flashes.push(','this.ports.flash(').replaceAll('SIM_TAP.current?.onDot?.(','this.ports.dot(')
  .replace(/\bnoteResourceFlow\(/g,'this.ports.leech(').replace(/\bmitigateTyped\(/g,'this.ports.mitigate(')
  .replace(/\bisDormant\(/g,'this.ports.dormant(').replace(/\bskillContextTags\(/g,'this.ports.tags(').replace(/\binstanceMods\(/g,'this.ports.modifiers(')
  .replace(/\brand\(/g,'this.rand(');
body=body.replace(/if \(victim === this\.ports\.localActor\(\)\)\s+bumpLedger\(this\.ledger, LEDGER_SEIZED\);/,'this.ports.seized(victim, caster);');
body=body.replace(/bounds\(spec: GrabSpec\): \[/,'bounds(spec: GrabSpec): readonly [').replace('rInst = s;','rInst = s!;');
// A discriminant exclusion is needed for a host's open-ended other effect rows.
body=body.replaceAll('f.grab','(f as {type: \'grabSeize\'; grab: GrabSpec}).grab');
assert(!/bumpLedger|LEDGER_|\bWorld\b|\bActor\b|MONSTERS|Math.random/.test(body));
const emitted=`import type {GrabActor,GrabSkill,GrabPoint,GrabPorts,GrabRules,GrabSpec,GripHold,GrabThrowSpec,GrabHandoffSpec} from './grab-types.js';
export type * from './grab-types.js';
const vec=(x:number,y:number):GrabPoint=>({x,y});
const dist=(a:GrabPoint,b:GrabPoint):number=>Math.hypot(a.x-b.x,a.y-b.y);
const angleTo=(a:GrabPoint,b:GrabPoint):number=>Math.atan2(b.y-a.y,b.x-a.x);
const clamp=(n:number,min:number,max:number):number=>Math.max(min,Math.min(max,n));
/** Sustained bodily-control rules, mechanically extracted from the pinned game.
 * Hosts supply physical placement, combat pipeline services and ordered signals.
 * General AI, discovery ledgers and campaign death consequences stay outside.
 * Borrowed records commit synchronously; callback failures retain prefix writes. */
export class Grabs<A extends GrabActor<I>,I extends GrabSkill>{
  private readonly grabScratch={x:0,y:0};
  constructor(readonly rules:GrabRules,readonly ports:GrabPorts<A,I>){}
  private rand(lo:number,hi:number):number{return lo+this.ports.random()*(hi-lo);}
${body}
}
`;
if(check){checkMaintainedExtraction(output,emitted);console.log({passed:true,mechanicalMethods:12});}
else{
fs.writeFileSync(output,emitted);
fs.writeFileSync('baseline/grab-extraction.json',JSON.stringify({sourceCommit:lock.commit,sources,maintainedSource:output,sha256:sha256(fs.readFileSync(output)),
  methods:Object.values(names),boundaryChanges:['Discovery ledger becomes ordered seized signal','Spatial/AI services and combat pipeline are explicit ports']},null,2)+'\n');
}
