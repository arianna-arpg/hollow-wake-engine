import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';import {sha256} from './reference-utils.mjs';
const file='src/engine/world.ts',lock=JSON.parse(fs.readFileSync('baseline/source-lock.json')),input=fs.readFileSync('.reference/'+file,'utf8');assert.equal(sha256(Buffer.from(input)),lock.files[file]);
const source=ts.createSourceFile(file,input,99,true),printer=ts.createPrinter({removeComments:true});let method;
function find(n){if(ts.isMethodDeclaration(n)&&n.name.getText(source)==='executeSkill')method=n;else ts.forEachChild(n,find);}find(source);assert(ts.isReturnStatement(method.body.statements[75]));
const functions=new Set(['instanceBirth','instanceChargeCost','instanceTargeting','instanceDelivery','instanceSelfStack','instanceCastCycle','instanceChargeGain','markBodyAction','mimicRefreshWatch','instanceEchoes']);
const transform=context=>{const f=context.factory,p=name=>f.createPropertyAccessExpression(f.createIdentifier('sdk'),name),call=(name,args=[])=>f.createCallExpression(p(name),undefined,args);
  function visit(n){
    if(ts.isPropertyAccessExpression(n)){
      const text=n.getText(source),aliases={'this.treeBuffSources.set':'associateTreeBuff','this.challenges.completed':'challengeCompleted','this.companionBonds.onCast':'companionCast'};if(aliases[text])return p(aliases[text]);
      if(text==='UNLEASH_CFG.interval')return f.createPropertyAccessExpression(f.createIdentifier('rules'),'unleashInterval');
      if(n.expression.kind===ts.SyntaxKind.ThisKeyword){if(['pendingRepeats','remnants'].includes(n.name.text))return f.createPropertyAccessExpression(f.createIdentifier('state'),n.name.text);
        if(['time','actors','seats'].includes(n.name.text))return call(n.name.text);return p(n.name.text);}
    }
    if(ts.isCallExpression(n)){
      if(ts.isIdentifier(n.expression)&&functions.has(n.expression.text))return f.updateCallExpression(n,p(n.expression.text),n.typeArguments,n.arguments.map(a=>ts.visitNode(a,visit)));
      if(n.expression.getText(source)==='mimicCapture')return call('mimicCapture',n.arguments.slice(1).map(a=>ts.visitNode(a,visit)));
    }
    if(ts.isIdentifier(n)&&n.text==='ELEMENTAL_TYPES')return f.createPropertyAccessExpression(f.createIdentifier('rules'),'elements');
    if(ts.isTypeReferenceNode(n)&&n.typeName.getText(source)==='ResolvedTarget')return f.createTypeReferenceNode('PreparationTarget',['A','C'].map(s=>f.createTypeReferenceNode(s)));
    return ts.visitEachChild(n,visit,context);
  }return n=>ts.visitNode(n,visit);
};
let code=`// Ordered post-cast rules extracted from executeSkill; no campaign or storage dependency.
import {dist,angleTo,type CombatPoint} from './combat-geometry.js';import type {PreparationTarget} from './cast-preparation-types.js';
import type {AftermathActor,AftermathSkill,AftermathState,AftermathRules,AftermathPorts,AftermathFrame} from './cast-aftermath-types.js';
export type * from './cast-aftermath-types.js';const vec=(x:number,y:number):CombatPoint=>({x,y});
export class CastAftermath<A extends AftermathActor<A,I,B>,I extends AftermathSkill,C,B,Z,E>{
constructor(readonly state:AftermathState<A,I>,readonly rules:AftermathRules,readonly ports:AftermathPorts<A,I,C,B,Z,E>){}
complete(frame:AftermathFrame<A,I,C,{type:string}>):void{
const {ports:sdk,state,rules}=this,{caster,inst,aim,origin,d,opts,targetInfo,tags,extra,useMult}=frame,def=inst.def;
const rand=(min:number,max:number)=>min+sdk.random()*(max-min),chance=(value:number)=>sdk.random()<value,pick=<T>(list:readonly T[]):T=>list[Math.floor(sdk.random()*list.length)]!;
`;
for(let k=56;k<75;k++){const result=ts.transform(method.body.statements[k],[transform]);code+=printer.printNode(ts.EmitHint.Unspecified,result.transformed[0],source)+'\n';result.dispose();}
code+='}\n}\n';const destination='src/cast-aftermath.ts',hash=sha256(Buffer.from(code));
if(process.argv.includes('--check')){assert.equal(sha256(fs.readFileSync(destination)),hash);console.log({passed:true,phase:'cast aftermath'});}
else{assert(!fs.existsSync(destination),'Refusing to overwrite cast aftermath');fs.writeFileSync(destination,code);fs.writeFileSync('baseline/cast-aftermath-extraction.json',JSON.stringify({sourceCommit:lock.commit,sourceSha256:lock.files[file],statementIndexes:'56..74',sha256:hash},null,2)+'\n');}
