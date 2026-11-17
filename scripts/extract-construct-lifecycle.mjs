import {checkMaintainedExtraction} from './check-maintained-extraction.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';import {sha256} from './reference-utils.mjs';
const file='src/engine/world.ts',lock=JSON.parse(fs.readFileSync('baseline/source-lock.json')),input=fs.readFileSync('.reference/'+file,'utf8');assert.equal(sha256(Buffer.from(input)),lock.files[file]);
const source=ts.createSourceFile(file,input,99,true),printer=ts.createPrinter({removeComments:true}),names=['spawnEchoRiders','mirageSource','hoverSlotPos','buildEchoRider','echoToClones','updateConstructs'],methods=new Map();
function find(n){if(ts.isMethodDeclaration(n)&&names.includes(n.name.getText(source)))methods.set(n.name.getText(source),n);else ts.forEachChild(n,find);}find(source);assert.equal(methods.size,names.length);
const functions=new Set(['instanceChargeCost','skillContextTags','instanceMods','hostSockets','instanceTargeting','effectiveSkillLevel','instanceAim','instanceDelivery','isStealthed']);
const transform=context=>{const f=context.factory,p=name=>f.createPropertyAccessExpression(f.createIdentifier('sdk'),name),call=(name,args=[])=>f.createCallExpression(p(name),undefined,args);
  function visit(n){
    if(ts.isPropertyAccessExpression(n)){
      if(n.getText(source)==='this.flashes.push')return p('flash');
      if(n.expression.kind===ts.SyntaxKind.ThisKeyword){if(names.includes(n.name.text))return n;if(['tethers','pendingRepeats'].includes(n.name.text))return f.createPropertyAccessExpression(f.createIdentifier('state'),n.name);if(['time','actors'].includes(n.name.text))return call(n.name.text);return p(n.name.text);}
    }
    if(ts.isElementAccessExpression(n)&&n.expression.getText(source)==='SKILLS')return call('skill',[ts.visitNode(n.argumentExpression,visit)]);
    if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)){
      const args=n.arguments.map(a=>ts.visitNode(a,visit));if(functions.has(n.expression.text))return f.updateCallExpression(n,p(n.expression.text),n.typeArguments,args);
      if(n.expression.text==='makeSkillInstance')return call('makeSkillInstance',[f.createNonNullExpression(args[0]),...args.slice(1)]);
    }
    if(ts.isIdentifier(n)&&n.text==='ECHO_STRIKE_LIFE_MAX')return f.createPropertyAccessExpression(f.createIdentifier('rules'),'echoStrikeLifeMax');
    if(ts.isTypeReferenceNode(n)&&ts.isIdentifier(n.typeName)){
      const name=n.typeName.text;if(name==='ConstructDelivery')return f.createTypeReferenceNode('ConstructBirthSpec',[f.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)]);
      if(name==='ResolvedTarget')return f.createTypeReferenceNode('ConstructTarget',[f.createTypeReferenceNode('A')]);
      const mapped={Actor:'A',Vec2:'CombatPoint',SkillInstance:'I'}[name];if(mapped)return f.createTypeReferenceNode(mapped);
    }
    return ts.visitEachChild(n,visit,context);
  }return n=>ts.visitNode(n,visit);
};
let code=`// Original echo ownership and construct clocks. See the extraction manifest.
import {dist,angleTo,angleDiff,type CombatPoint} from './combat-geometry.js';import {pointSegDist} from './segment-geometry.js';import type {Modifier} from './types.js';import type {ConstructBirthSpec} from './construct-birth.js';
import type {ConstructClockActor,ConstructClockSkill,ConstructTarget,ConstructLifecycleState,ConstructLifecyclePorts,EchoRiderSpec} from './construct-lifecycle-types.js';
export type * from './construct-lifecycle-types.js';const vec=(x:number,y:number):CombatPoint=>({x,y});const sameStory=(a:{tier:number},b:{tier:number})=>(a.tier??0)===(b.tier??0);
const mod=(stat:string,kind:'more',value:number):Modifier=>({stat,kind,value});
export class ConstructLifecycle<A extends ConstructClockActor<A,I>,I extends ConstructClockSkill>{
constructor(readonly state:ConstructLifecycleState<A,I>,readonly rules:{echoStrikeLifeMax:number},readonly ports:ConstructLifecyclePorts<A,I>){}
`;
for(const name of names){const result=ts.transform(methods.get(name),[transform]),converted=printer.printNode(ts.EmitHint.Unspecified,result.transformed[0],source).replace(/^private /,'');result.dispose();
  const open=converted.indexOf('{',converted.indexOf('):')+2);assert(open>=0);const body=converted.slice(open),locals=[];if(/\bsdk\./.test(body))locals.push('ports:sdk');if(/\bstate\./.test(body))locals.push('state');if(/\brules\./.test(body))locals.push('rules');
  let pre=locals.length?'\nconst {'+locals.join(',')+'}=this;\n':'';if(/\brand\(/.test(body))pre+='const rand=(min:number,max:number)=>min+sdk.random()*(max-min);\n';if(/\bpick\(/.test(body))pre+='const pick=<T>(values:readonly T[]):T=>values[Math.floor(sdk.random()*values.length)];\n';
  code+=converted.slice(0,open+1)+pre+converted.slice(open+1)+'\n';
}code+='}\n';const destination='src/construct-lifecycle.ts',hash=sha256(Buffer.from(code)),manifest='baseline/construct-lifecycle-extraction.json';
if(process.argv.includes('--check')){checkMaintainedExtraction(destination,code);console.log({passed:true,methods:names});}
else{assert(!fs.existsSync(destination),'Refusing to overwrite construct lifecycle');fs.writeFileSync(destination,code);fs.writeFileSync(manifest,JSON.stringify({sourceCommit:lock.commit,sourceSha256:lock.files[file],methods:names,sha256:hash,typeOnlyChanges:['assert guarded skill rereads non-null']},null,2)+'\n');}
